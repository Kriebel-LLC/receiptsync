"use client";

import { Button } from "components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "components/ui/select";
import { Checkbox } from "components/ui/checkbox";
import { Label } from "components/ui/label";
import { Input } from "components/ui/input";
import { Download, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import {
  ExportFormat,
  ExportColumn,
  DEFAULT_EXPORT_COLUMNS,
  EXPORT_COLUMN_LABELS,
} from "shared/src/types/export";
import { ReceiptCategory } from "shared/src/db/schema";

interface ExportInfo {
  totalReceipts: number;
  asyncThreshold: number;
  requiresAsync: boolean;
  availableFormats: string[];
  availableCategories: string[];
  defaultColumns: string[];
  allColumns: string[];
  recentJobs?: Array<{
    id: string;
    status: string;
    receiptCount: number;
    createdAt: string;
    completedAt?: string;
  }>;
}

interface ReceiptExportProps {
  orgName: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  FOOD: "Food & Dining",
  TRAVEL: "Travel",
  OFFICE: "Office Supplies",
  SOFTWARE: "Software",
  UTILITIES: "Utilities",
  ENTERTAINMENT: "Entertainment",
  HEALTHCARE: "Healthcare",
  SHOPPING: "Shopping",
  SERVICES: "Services",
  OTHER: "Other",
};

export function ReceiptExport({ orgName }: ReceiptExportProps) {
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportInfo, setExportInfo] = useState<ExportInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Export options
  const [format, setFormat] = useState<ExportFormat>(ExportFormat.Csv);
  const [selectedColumns, setSelectedColumns] = useState<string[]>(
    DEFAULT_EXPORT_COLUMNS
  );
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  // Load export info on mount
  useEffect(() => {
    async function loadExportInfo() {
      setLoading(true);
      try {
        const response = await fetch(`/api/orgs/${orgName}/receipts/export`);
        if (!response.ok) {
          throw new Error("Failed to load export information");
        }
        const data = (await response.json()) as ExportInfo;
        setExportInfo(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }
    loadExportInfo();
  }, [orgName]);

  const handleColumnToggle = (column: string) => {
    setSelectedColumns((prev) =>
      prev.includes(column)
        ? prev.filter((c) => c !== column)
        : [...prev, column]
    );
  };

  const handleCategoryToggle = (category: string) => {
    setSelectedCategories((prev) =>
      prev.includes(category)
        ? prev.filter((c) => c !== category)
        : [...prev, category]
    );
  };

  const handleExport = async () => {
    if (selectedColumns.length === 0) {
      setError("Please select at least one column to export");
      return;
    }

    setExporting(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`/api/orgs/${orgName}/receipts/export`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          format,
          columns: selectedColumns,
          filters: {
            startDate: startDate || undefined,
            endDate: endDate || undefined,
            categories:
              selectedCategories.length > 0 ? selectedCategories : undefined,
          },
          includeImages: false,
        }),
      });

      // Check if this is an async job response
      if (response.status === 202) {
        const data = (await response.json()) as { receiptCount: number };
        setSuccess(
          `Export job created! ${data.receiptCount} receipts will be processed. You'll receive a notification when it's ready.`
        );
        return;
      }

      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        throw new Error(data.error || "Export failed");
      }

      // Download the file
      const blob = await response.blob();
      const contentDisposition = response.headers.get("Content-Disposition");
      const filenameMatch = contentDisposition?.match(/filename="(.+)"/);
      const filename =
        filenameMatch?.[1] ||
        `receipts-export.${format === ExportFormat.Csv ? "csv" : "xlsx"}`;

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      setSuccess("Export downloaded successfully!");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Export Receipts</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Download className="h-5 w-5" />
          Export Receipts
        </CardTitle>
        <CardDescription>
          Download your receipts as CSV or Excel for tax preparation and
          reporting.
          {exportInfo && (
            <span className="ml-1">
              You have {exportInfo.totalReceipts} receipts available for export.
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Format Selection */}
        <div className="space-y-2">
          <Label htmlFor="format">Export Format</Label>
          <Select
            value={format}
            onValueChange={(value) => setFormat(value as ExportFormat)}
          >
            <SelectTrigger id="format" className="w-[200px]">
              <SelectValue placeholder="Select format" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ExportFormat.Csv}>
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  CSV
                </div>
              </SelectItem>
              <SelectItem value={ExportFormat.Excel}>
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4" />
                  Excel (.xlsx)
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Date Range */}
        <div className="space-y-2">
          <Label>Date Range (optional)</Label>
          <div className="flex flex-wrap gap-4">
            <div className="space-y-1">
              <Label htmlFor="startDate" className="text-xs text-muted-foreground">
                From
              </Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-[180px]"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="endDate" className="text-xs text-muted-foreground">
                To
              </Label>
              <Input
                id="endDate"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-[180px]"
              />
            </div>
          </div>
        </div>

        {/* Category Filter */}
        {exportInfo && exportInfo.availableCategories.length > 0 && (
          <div className="space-y-2">
            <Label>Categories (optional - leave empty for all)</Label>
            <div className="flex flex-wrap gap-3">
              {exportInfo.availableCategories.map((category) => (
                <div key={category} className="flex items-center space-x-2">
                  <Checkbox
                    id={`cat-${category}`}
                    checked={selectedCategories.includes(category)}
                    onCheckedChange={() => handleCategoryToggle(category)}
                  />
                  <Label
                    htmlFor={`cat-${category}`}
                    className="text-sm font-normal cursor-pointer"
                  >
                    {CATEGORY_LABELS[category] || category}
                  </Label>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Column Selection */}
        <div className="space-y-2">
          <Label>Columns to Export</Label>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {Object.values(ExportColumn).map((column) => (
              <div key={column} className="flex items-center space-x-2">
                <Checkbox
                  id={`col-${column}`}
                  checked={selectedColumns.includes(column)}
                  onCheckedChange={() => handleColumnToggle(column)}
                />
                <Label
                  htmlFor={`col-${column}`}
                  className="text-sm font-normal cursor-pointer"
                >
                  {EXPORT_COLUMN_LABELS[column]}
                </Label>
              </div>
            ))}
          </div>
        </div>

        {/* Error/Success Messages */}
        {error && (
          <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
            {error}
          </div>
        )}
        {success && (
          <div className="rounded-md bg-green-500/15 p-3 text-sm text-green-700 dark:text-green-400">
            {success}
          </div>
        )}

        {/* Export Button */}
        <div className="flex items-center gap-4">
          <Button
            onClick={handleExport}
            disabled={exporting || selectedColumns.length === 0}
          >
            {exporting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Exporting...
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                Export Receipts
              </>
            )}
          </Button>

          {exportInfo?.requiresAsync && (
            <span className="text-sm text-muted-foreground">
              Large export - will be processed in background
            </span>
          )}
        </div>

        {/* Recent Jobs */}
        {exportInfo?.recentJobs && exportInfo.recentJobs.length > 0 && (
          <div className="space-y-2 border-t pt-4">
            <Label>Recent Exports</Label>
            <div className="space-y-2">
              {exportInfo.recentJobs.map((job) => (
                <div
                  key={job.id}
                  className="flex items-center justify-between text-sm rounded-md border p-2"
                >
                  <span>
                    {job.receiptCount} receipts -{" "}
                    {new Date(job.createdAt).toLocaleDateString()}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs ${
                      job.status === "COMPLETED"
                        ? "bg-green-100 text-green-700"
                        : job.status === "FAILED"
                          ? "bg-red-100 text-red-700"
                          : job.status === "PROCESSING"
                            ? "bg-yellow-100 text-yellow-700"
                            : "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {job.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
