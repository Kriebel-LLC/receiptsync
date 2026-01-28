import { db } from "@/db";
import { generateCSVBuffer, generateExcel, generateExportFilename } from "@/lib/export";
import { getOrgUserForOrgName } from "@/lib/org";
import { routeHandler } from "@/lib/route";
import { orgNameRouteContextSchemaType } from "@/lib/validations/orgs";
import { and, eq, gte, lte, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import {
  receipts,
  ReceiptCategory,
  ReceiptStatus,
  exportJobs,
  ExportJobStatus,
  ExportFormat as DBExportFormat,
} from "shared/src/db/schema";
import { Role, hasPermission } from "shared/src/types/role";
import {
  ExportFormat,
  ExportRequestSchema,
  DEFAULT_EXPORT_COLUMNS,
  ExportColumn,
} from "shared/src/types/export";

// Threshold for async export (number of receipts)
const ASYNC_EXPORT_THRESHOLD = 500;

export const POST = routeHandler<orgNameRouteContextSchemaType>(
  async (req, user, context) => {
    // Get org name from path params
    const orgName = context?.params?.name;
    if (!orgName) {
      return NextResponse.json({ error: "Organization name required" }, { status: 400 });
    }

    // Check user has access to org
    const userInOrg = await getOrgUserForOrgName(user.uid, orgName);
    if (!userInOrg || !hasPermission(userInOrg.role, Role.READ)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Parse and validate request body
    let exportRequest;
    try {
      const json = await req.json();
      exportRequest = ExportRequestSchema.parse(json);
    } catch (error) {
      return NextResponse.json(
        { error: "Invalid export request" },
        { status: 400 }
      );
    }

    const {
      format,
      columns = DEFAULT_EXPORT_COLUMNS,
      filters,
      includeImages,
    } = exportRequest;

    // Build query conditions
    const conditions = [eq(receipts.orgId, userInOrg.orgId)];

    // Date range filter
    if (filters?.startDate) {
      conditions.push(gte(receipts.date, new Date(filters.startDate)));
    }
    if (filters?.endDate) {
      conditions.push(lte(receipts.date, new Date(filters.endDate)));
    }

    // Category filter
    if (filters?.categories && filters.categories.length > 0) {
      conditions.push(inArray(receipts.category, filters.categories));
    }

    // Status filter (default to only extracted receipts)
    if (filters?.statuses && filters.statuses.length > 0) {
      conditions.push(inArray(receipts.status, filters.statuses));
    } else {
      // By default, only export successfully extracted receipts
      conditions.push(eq(receipts.status, ReceiptStatus.Extracted));
    }

    // First, get count to determine if async is needed
    const countResult = await db()
      .select({ count: receipts.id })
      .from(receipts)
      .where(and(...conditions));

    const receiptCount = countResult.length;

    // If export is large, create an async job
    if (receiptCount > ASYNC_EXPORT_THRESHOLD) {
      const jobId = nanoid();
      const dbFormat = format === ExportFormat.Csv ? DBExportFormat.Csv : DBExportFormat.Excel;

      await db().insert(exportJobs).values({
        id: jobId,
        orgId: userInOrg.orgId,
        userId: user.uid,
        format: dbFormat,
        status: ExportJobStatus.Pending,
        configuration: {
          columns: columns as string[],
          filters: filters ? {
            startDate: filters.startDate,
            endDate: filters.endDate,
            categories: filters.categories?.map(c => c as string),
            statuses: filters.statuses?.map(s => s as string),
            vendors: filters.vendors,
          } : undefined,
          includeImages: includeImages,
        },
        receiptCount,
        notificationEmail: user.email || null,
      });

      return NextResponse.json(
        {
          message: `Export job created. ${receiptCount} receipts will be processed asynchronously.`,
          jobId,
          receiptCount,
          asyncRequired: true,
        },
        { status: 202 }
      );
    }

    // Fetch receipts for export
    const receiptData = await db()
      .select()
      .from(receipts)
      .where(and(...conditions))
      .orderBy(receipts.date);

    if (receiptData.length === 0) {
      return NextResponse.json(
        { error: "No receipts found matching the criteria" },
        { status: 404 }
      );
    }

    // Generate export based on format
    let fileBuffer: Buffer;
    let contentType: string;
    let fileExtension: string;

    if (format === ExportFormat.Csv) {
      fileBuffer = generateCSVBuffer(receiptData, columns);
      contentType = "text/csv; charset=utf-8";
      fileExtension = "csv";
    } else {
      fileBuffer = await generateExcel(receiptData, columns, includeImages);
      contentType =
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      fileExtension = "xlsx";
    }

    // Generate filename
    const filename = generateExportFilename(
      orgName,
      fileExtension as "csv" | "xlsx",
      filters?.startDate,
      filters?.endDate
    );

    // Return file as response
    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": fileBuffer.length.toString(),
      },
    });
  }
);

// GET endpoint to check export status or get available columns
export const GET = routeHandler<orgNameRouteContextSchemaType>(
  async (req, user, context) => {
    const orgName = context?.params?.name;
    if (!orgName) {
      return NextResponse.json({ error: "Organization name required" }, { status: 400 });
    }

    const userInOrg = await getOrgUserForOrgName(user.uid, orgName);
    if (!userInOrg || !hasPermission(userInOrg.role, Role.READ)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Check for job status request
    const url = new URL(req.url);
    const jobId = url.searchParams.get("jobId");

    if (jobId) {
      // Return status of a specific export job
      const [job] = await db()
        .select()
        .from(exportJobs)
        .where(
          and(
            eq(exportJobs.id, jobId),
            eq(exportJobs.orgId, userInOrg.orgId)
          )
        );

      if (!job) {
        return NextResponse.json({ error: "Export job not found" }, { status: 404 });
      }

      return NextResponse.json({
        jobId: job.id,
        status: job.status,
        receiptCount: job.receiptCount,
        downloadUrl: job.downloadUrl,
        expiresAt: job.expiresAt?.toISOString(),
        error: job.error,
        createdAt: job.createdAt.toISOString(),
        completedAt: job.completedAt?.toISOString(),
      });
    }

    // Get receipt count for the org
    const countResult = await db()
      .select({ count: receipts.id })
      .from(receipts)
      .where(
        and(
          eq(receipts.orgId, userInOrg.orgId),
          eq(receipts.status, ReceiptStatus.Extracted)
        )
      );

    const receiptCount = countResult.length;

    // Get available categories in use
    const categoriesResult = await db()
      .selectDistinct({ category: receipts.category })
      .from(receipts)
      .where(eq(receipts.orgId, userInOrg.orgId));

    const categories = categoriesResult
      .map((r) => r.category)
      .filter((c): c is ReceiptCategory => c !== null);

    // Get pending/recent export jobs
    const recentJobs = await db()
      .select({
        id: exportJobs.id,
        status: exportJobs.status,
        receiptCount: exportJobs.receiptCount,
        createdAt: exportJobs.createdAt,
        completedAt: exportJobs.completedAt,
      })
      .from(exportJobs)
      .where(eq(exportJobs.orgId, userInOrg.orgId))
      .orderBy(exportJobs.createdAt)
      .limit(5);

    return NextResponse.json({
      totalReceipts: receiptCount,
      asyncThreshold: ASYNC_EXPORT_THRESHOLD,
      requiresAsync: receiptCount > ASYNC_EXPORT_THRESHOLD,
      availableFormats: Object.values(ExportFormat),
      availableCategories: categories,
      defaultColumns: DEFAULT_EXPORT_COLUMNS,
      allColumns: Object.values(ExportColumn),
      recentJobs: recentJobs.map((job) => ({
        id: job.id,
        status: job.status,
        receiptCount: job.receiptCount,
        createdAt: job.createdAt.toISOString(),
        completedAt: job.completedAt?.toISOString(),
      })),
    });
  }
);
