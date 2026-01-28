import { db } from "@/db";
import { logError } from "@/lib/logger";
import { getOrgUserForOrgName } from "@/lib/org";
import { routeHandler } from "@/lib/route";
import { generateReceiptKey, getPresignedUploadUrl } from "@/lib/storage/r2";
import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { receipts, ReceiptStatus } from "shared/src/db/schema";
import * as z from "zod";
import { Role, hasPermission } from "shared/src/types/role";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
];

const uploadUrlSchema = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.string().refine((val) => ALLOWED_CONTENT_TYPES.includes(val), {
    message: `Content type must be one of: ${ALLOWED_CONTENT_TYPES.join(", ")}`,
  }),
  size: z
    .number()
    .int()
    .positive()
    .max(
      MAX_FILE_SIZE,
      `File size must be less than ${MAX_FILE_SIZE / 1024 / 1024}MB`
    ),
});

export const POST = routeHandler(
  async (req, user, { params }: { params: { name: string } }) => {
    try {
      // Check user has write permission for this org
      const userInOrg = await getOrgUserForOrgName(user.uid, params.name);
      if (!userInOrg || !hasPermission(userInOrg.role, Role.WRITE)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      const json = await req.json();
      const body = uploadUrlSchema.parse(json);

      // Generate a unique receipt ID
      const receiptId = nanoid();

      // Generate the storage key
      const key = generateReceiptKey(userInOrg.orgId, receiptId, body.filename);

      // Create receipt record in database with PENDING status
      await db().insert(receipts).values({
        id: receiptId,
        orgId: userInOrg.orgId,
        status: ReceiptStatus.Pending,
        originalImageUrl: key, // Store the key, we'll generate URL when needed
      });

      // Generate presigned upload URL
      const uploadUrl = await getPresignedUploadUrl({
        key,
        contentType: body.contentType,
        expiresIn: 300, // 5 minutes
      });

      return NextResponse.json({
        uploadUrl,
        receiptId,
        key,
      });
    } catch (error) {
      logError(error, req);

      if (error instanceof z.ZodError) {
        return NextResponse.json({ error: error.issues }, { status: 422 });
      }

      return NextResponse.json(
        { error: "Failed to generate upload URL" },
        { status: 500 }
      );
    }
  }
);
