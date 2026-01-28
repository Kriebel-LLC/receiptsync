"use client";

import { useState, useCallback } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Receipt, ReceiptCategory, ReceiptStatus } from "shared/src/db/schema";
import { Button } from "components/ui/button";
import { Input } from "components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "components/ui/select";
import { Badge } from "components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "components/ui/card";
import { Checkbox } from "components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "components/ui/alert-dialog";
import { Label } from "components/ui/label";
import { Icons } from "@/custom-components/icons";
import { cn } from "components/lib/utils";
import { toast } from "components/ui/use-toast";
import Image from "next/image";

interface SyncStatus {
  destinationId: string;
  destinationName: string;
  destinationType: string;
  status: string;
}

interface ReceiptWithSync extends Receipt {
  syncStatuses: SyncStatus[];
}

interface ReceiptsClientProps {
  receipts: ReceiptWithSync[];
  stats: {
    thisMonth: {
      totalAmount: number;
      receiptCount: number;
    };
    byCategory: Array<{
      category: ReceiptCategory | null;
      totalAmount: number;
      receiptCount: number;
    }>;
  };
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };
  filters: {
    search: string;
    category?: ReceiptCategory;
    status?: ReceiptStatus;
    dateFrom?: string;
    dateTo?: string;
    amountMin?: number;
    amountMax?: number;
    sort: string;
    order: string;
  };
  orgName: string;
  canWrite: boolean;
}

const CATEGORY_LABELS: Record<ReceiptCategory, string> = {
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

const CATEGORY_COLORS: Record<ReceiptCategory, string> = {
  FOOD: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  TRAVEL: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  OFFICE: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
  SOFTWARE: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  UTILITIES: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  ENTERTAINMENT: "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200",
  HEALTHCARE: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  SHOPPING: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  SERVICES: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
  OTHER: "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200",
};

const STATUS_COLORS: Record<ReceiptStatus, string> = {
  PENDING: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  PROCESSING: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  EXTRACTED: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  FAILED: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  ARCHIVED: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
};

const STATUS_LABELS: Record<ReceiptStatus, string> = {
  PENDING: "Pending",
  PROCESSING: "Processing",
  EXTRACTED: "Extracted",
  FAILED: "Failed",
  ARCHIVED: "Archived",
};

export function ReceiptsClient({
  receipts,
  stats,
  pagination,
  filters,
  orgName,
  canWrite,
}: ReceiptsClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [selectedReceipts, setSelectedReceipts] = useState<Set<string>>(
    new Set()
  );
  const [showFilters, setShowFilters] = useState(false);
  const [searchValue, setSearchValue] = useState(filters.search);
  const [selectedReceipt, setSelectedReceipt] = useState<ReceiptWithSync | null>(
    null
  );
  const [editingReceipt, setEditingReceipt] = useState<ReceiptWithSync | null>(
    null
  );
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [showBulkCategoryDialog, setShowBulkCategoryDialog] = useState(false);
  const [bulkCategory, setBulkCategory] = useState<ReceiptCategory | "">("");

  // Update URL with new params
  const updateParams = useCallback(
    (updates: Record<string, string | undefined>) => {
      const params = new URLSearchParams(searchParams?.toString() || "");
      Object.entries(updates).forEach(([key, value]) => {
        if (value === undefined || value === "") {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      });
      // Reset to page 1 when filters change (except when changing page)
      if (!("page" in updates)) {
        params.delete("page");
      }
      router.push(`${pathname}?${params.toString()}`);
    },
    [pathname, router, searchParams]
  );

  // Handle search with debounce
  const handleSearch = useCallback(() => {
    updateParams({ search: searchValue || undefined });
  }, [searchValue, updateParams]);

  // Toggle receipt selection
  const toggleSelection = (receiptId: string) => {
    const newSelected = new Set(selectedReceipts);
    if (newSelected.has(receiptId)) {
      newSelected.delete(receiptId);
    } else {
      newSelected.add(receiptId);
    }
    setSelectedReceipts(newSelected);
  };

  // Select all receipts on current page
  const selectAll = () => {
    if (selectedReceipts.size === receipts.length) {
      setSelectedReceipts(new Set());
    } else {
      setSelectedReceipts(new Set(receipts.map((r) => r.id)));
    }
  };

  // Format currency
  const formatCurrency = (amount: number | null, currency: string | null) => {
    if (amount === null) return "—";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
    }).format(amount);
  };

  // Format date
  const formatDate = (date: Date | null) => {
    if (!date) return "—";
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(date));
  };

  // Handle delete
  const handleDelete = async () => {
    if (!selectedReceipt && selectedReceipts.size === 0) return;

    setIsDeleting(true);
    try {
      const idsToDelete = selectedReceipt
        ? [selectedReceipt.id]
        : Array.from(selectedReceipts);

      const response = await fetch(`/api/orgs/${orgName}/receipts/bulk`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receiptIds: idsToDelete }),
      });

      if (!response.ok) {
        throw new Error("Failed to delete receipts");
      }

      toast({
        title: "Receipts deleted",
        description: `Successfully deleted ${idsToDelete.length} receipt(s).`,
      });

      setSelectedReceipts(new Set());
      setSelectedReceipt(null);
      setShowDeleteDialog(false);
      router.refresh();
    } catch {
      toast({
        title: "Error",
        description: "Failed to delete receipts. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  // Handle update
  const handleUpdate = async (data: Partial<Receipt>) => {
    if (!editingReceipt) return;

    setIsUpdating(true);
    try {
      const response = await fetch(
        `/api/orgs/${orgName}/receipts/${editingReceipt.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to update receipt");
      }

      toast({
        title: "Receipt updated",
        description: "Successfully updated the receipt.",
      });

      setEditingReceipt(null);
      router.refresh();
    } catch {
      toast({
        title: "Error",
        description: "Failed to update receipt. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsUpdating(false);
    }
  };

  // Handle bulk category update
  const handleBulkCategoryUpdate = async () => {
    if (!bulkCategory || selectedReceipts.size === 0) return;

    setIsUpdating(true);
    try {
      const response = await fetch(`/api/orgs/${orgName}/receipts/bulk`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          receiptIds: Array.from(selectedReceipts),
          updates: { category: bulkCategory },
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to update receipts");
      }

      toast({
        title: "Receipts updated",
        description: `Successfully updated ${selectedReceipts.size} receipt(s).`,
      });

      setSelectedReceipts(new Set());
      setShowBulkCategoryDialog(false);
      setBulkCategory("");
      router.refresh();
    } catch {
      toast({
        title: "Error",
        description: "Failed to update receipts. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsUpdating(false);
    }
  };

  // Handle export
  const handleExport = async () => {
    try {
      const idsToExport =
        selectedReceipts.size > 0 ? Array.from(selectedReceipts) : undefined;

      const params = new URLSearchParams();
      if (idsToExport) {
        params.set("ids", idsToExport.join(","));
      } else {
        // Export with current filters
        if (filters.search) params.set("search", filters.search);
        if (filters.category) params.set("category", filters.category);
        if (filters.status) params.set("status", filters.status);
        if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
        if (filters.dateTo) params.set("dateTo", filters.dateTo);
        if (filters.amountMin !== undefined)
          params.set("amountMin", filters.amountMin.toString());
        if (filters.amountMax !== undefined)
          params.set("amountMax", filters.amountMax.toString());
      }

      const response = await fetch(
        `/api/orgs/${orgName}/receipts/export?${params.toString()}`
      );

      if (!response.ok) {
        throw new Error("Failed to export receipts");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `receipts-${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: "Export complete",
        description: "Your receipts have been exported.",
      });
    } catch {
      toast({
        title: "Error",
        description: "Failed to export receipts. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Get sync status icon
  const getSyncStatusIcon = (status: string) => {
    switch (status) {
      case "SENT":
        return <Icons.checkCircle className="h-3 w-3 text-green-500" />;
      case "PENDING":
      case "PENDING_RETRY":
        return <Icons.clock className="h-3 w-3 text-yellow-500" />;
      case "FAILED":
        return <Icons.xCircle className="h-3 w-3 text-red-500" />;
      default:
        return <Icons.clock className="h-3 w-3 text-gray-500" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Quick Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">This Month</CardTitle>
            <Icons.dollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(stats.thisMonth.totalAmount, "USD")}
            </div>
            <p className="text-xs text-muted-foreground">
              {stats.thisMonth.receiptCount} receipt
              {stats.thisMonth.receiptCount !== 1 ? "s" : ""}
            </p>
          </CardContent>
        </Card>

        {stats.byCategory
          .filter((c) => c.category !== null)
          .sort((a, b) => b.totalAmount - a.totalAmount)
          .slice(0, 3)
          .map((cat) => (
            <Card key={cat.category}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  {CATEGORY_LABELS[cat.category as ReceiptCategory]}
                </CardTitle>
                <Icons.tag className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatCurrency(cat.totalAmount, "USD")}
                </div>
                <p className="text-xs text-muted-foreground">
                  {cat.receiptCount} receipt{cat.receiptCount !== 1 ? "s" : ""}
                </p>
              </CardContent>
            </Card>
          ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-1 items-center gap-2">
          <div className="relative flex-1 md:max-w-sm">
            <Icons.search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search by vendor or receipt number..."
              className="pl-8"
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            />
          </div>
          <Button variant="outline" size="sm" onClick={handleSearch}>
            Search
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
          >
            <Icons.filter className="mr-2 h-4 w-4" />
            Filters
          </Button>
        </div>

        <div className="flex items-center gap-2">
          {selectedReceipts.size > 0 && canWrite && (
            <>
              <span className="text-sm text-muted-foreground">
                {selectedReceipts.size} selected
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowBulkCategoryDialog(true)}
              >
                <Icons.tag className="mr-2 h-4 w-4" />
                Re-categorize
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSelectedReceipt(null);
                  setShowDeleteDialog(true);
                }}
              >
                <Icons.trash className="mr-2 h-4 w-4" />
                Delete
              </Button>
            </>
          )}
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Icons.download className="mr-2 h-4 w-4" />
            Export
          </Button>
          <div className="flex items-center rounded-md border">
            <Button
              variant={viewMode === "grid" ? "secondary" : "ghost"}
              size="sm"
              className="rounded-r-none"
              onClick={() => setViewMode("grid")}
            >
              <Icons.layoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === "list" ? "secondary" : "ghost"}
              size="sm"
              className="rounded-l-none"
              onClick={() => setViewMode("list")}
            >
              <Icons.layoutList className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <Card>
          <CardContent className="pt-6">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-2">
                <Label>Category</Label>
                <Select
                  value={filters.category || "all"}
                  onValueChange={(value) =>
                    updateParams({
                      category: value === "all" ? undefined : value,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All categories</SelectItem>
                    {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={filters.status || "all"}
                  onValueChange={(value) =>
                    updateParams({
                      status: value === "all" ? undefined : value,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    {Object.entries(STATUS_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Date From</Label>
                <Input
                  type="date"
                  value={filters.dateFrom?.split("T")[0] || ""}
                  onChange={(e) =>
                    updateParams({
                      dateFrom: e.target.value || undefined,
                    })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label>Date To</Label>
                <Input
                  type="date"
                  value={filters.dateTo?.split("T")[0] || ""}
                  onChange={(e) =>
                    updateParams({
                      dateTo: e.target.value || undefined,
                    })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label>Min Amount</Label>
                <Input
                  type="number"
                  placeholder="0.00"
                  value={filters.amountMin ?? ""}
                  onChange={(e) =>
                    updateParams({
                      amountMin: e.target.value || undefined,
                    })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label>Max Amount</Label>
                <Input
                  type="number"
                  placeholder="0.00"
                  value={filters.amountMax ?? ""}
                  onChange={(e) =>
                    updateParams({
                      amountMax: e.target.value || undefined,
                    })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label>Sort By</Label>
                <Select
                  value={filters.sort}
                  onValueChange={(value) => updateParams({ sort: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="createdAt">Date Added</SelectItem>
                    <SelectItem value="date">Receipt Date</SelectItem>
                    <SelectItem value="amount">Amount</SelectItem>
                    <SelectItem value="vendor">Vendor</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Order</Label>
                <Select
                  value={filters.order}
                  onValueChange={(value) => updateParams({ order: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Order" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="desc">Newest First</SelectItem>
                    <SelectItem value="asc">Oldest First</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="mt-4 flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  updateParams({
                    search: undefined,
                    category: undefined,
                    status: undefined,
                    dateFrom: undefined,
                    dateTo: undefined,
                    amountMin: undefined,
                    amountMax: undefined,
                    sort: undefined,
                    order: undefined,
                  });
                  setSearchValue("");
                }}
              >
                Clear Filters
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Receipts Grid/List */}
      {receipts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Icons.receipt className="h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 text-lg font-semibold">No receipts found</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {filters.search || filters.category || filters.status
                ? "Try adjusting your filters or search terms."
                : "Upload your first receipt to get started."}
            </p>
          </CardContent>
        </Card>
      ) : viewMode === "grid" ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {receipts.map((receipt) => (
            <Card
              key={receipt.id}
              className={cn(
                "cursor-pointer transition-all hover:shadow-md",
                selectedReceipts.has(receipt.id) && "ring-2 ring-primary"
              )}
            >
              <CardHeader className="relative pb-2">
                {canWrite && (
                  <div
                    className="absolute left-3 top-3"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Checkbox
                      checked={selectedReceipts.has(receipt.id)}
                      onCheckedChange={() => toggleSelection(receipt.id)}
                    />
                  </div>
                )}
                <div
                  className="aspect-[4/3] w-full cursor-pointer overflow-hidden rounded-md bg-muted"
                  onClick={() => setSelectedReceipt(receipt)}
                >
                  {receipt.processedImageUrl || receipt.originalImageUrl ? (
                    <Image
                      src={
                        receipt.processedImageUrl || receipt.originalImageUrl!
                      }
                      alt={receipt.vendor || "Receipt"}
                      width={400}
                      height={300}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <Icons.receipt className="h-12 w-12 text-muted-foreground" />
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent onClick={() => setSelectedReceipt(receipt)}>
                <div className="space-y-2">
                  <div className="flex items-start justify-between">
                    <h3 className="font-semibold line-clamp-1">
                      {receipt.vendor || "Unknown Vendor"}
                    </h3>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                          <Icons.ellipsis className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedReceipt(receipt);
                          }}
                        >
                          <Icons.eye className="mr-2 h-4 w-4" />
                          View Details
                        </DropdownMenuItem>
                        {canWrite && (
                          <>
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingReceipt(receipt);
                              }}
                            >
                              <Icons.edit className="mr-2 h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedReceipt(receipt);
                                setShowDeleteDialog(true);
                              }}
                            >
                              <Icons.trash className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      {formatDate(receipt.date)}
                    </span>
                    <span className="font-semibold">
                      {formatCurrency(receipt.amount, receipt.currency)}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-1">
                    {receipt.category && (
                      <Badge
                        variant="secondary"
                        className={cn(
                          "text-xs",
                          CATEGORY_COLORS[receipt.category]
                        )}
                      >
                        {CATEGORY_LABELS[receipt.category]}
                      </Badge>
                    )}
                    <Badge
                      variant="outline"
                      className={cn("text-xs", STATUS_COLORS[receipt.status])}
                    >
                      {STATUS_LABELS[receipt.status]}
                    </Badge>
                  </div>

                  {receipt.syncStatuses.length > 0 && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>Sync:</span>
                      {receipt.syncStatuses.map((sync) => (
                        <div
                          key={sync.destinationId}
                          className="flex items-center gap-1"
                          title={`${sync.destinationName}: ${sync.status}`}
                        >
                          {getSyncStatusIcon(sync.status)}
                          <span className="max-w-[60px] truncate">
                            {sync.destinationName}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y">
              {/* List header */}
              <div className="hidden items-center gap-4 px-4 py-3 text-sm font-medium text-muted-foreground md:flex">
                {canWrite && (
                  <Checkbox
                    checked={
                      selectedReceipts.size === receipts.length &&
                      receipts.length > 0
                    }
                    onCheckedChange={selectAll}
                  />
                )}
                <div className="w-16">Image</div>
                <div className="flex-1">Vendor</div>
                <div className="w-24">Date</div>
                <div className="w-24 text-right">Amount</div>
                <div className="w-28">Category</div>
                <div className="w-24">Status</div>
                <div className="w-8"></div>
              </div>

              {receipts.map((receipt) => (
                <div
                  key={receipt.id}
                  className={cn(
                    "flex cursor-pointer items-center gap-4 px-4 py-3 transition-colors hover:bg-muted/50",
                    selectedReceipts.has(receipt.id) && "bg-muted"
                  )}
                  onClick={() => setSelectedReceipt(receipt)}
                >
                  {canWrite && (
                    <div onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selectedReceipts.has(receipt.id)}
                        onCheckedChange={() => toggleSelection(receipt.id)}
                      />
                    </div>
                  )}

                  <div className="h-12 w-16 shrink-0 overflow-hidden rounded bg-muted">
                    {receipt.processedImageUrl || receipt.originalImageUrl ? (
                      <Image
                        src={
                          receipt.processedImageUrl || receipt.originalImageUrl!
                        }
                        alt={receipt.vendor || "Receipt"}
                        width={64}
                        height={48}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <Icons.receipt className="h-6 w-6 text-muted-foreground" />
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">
                      {receipt.vendor || "Unknown Vendor"}
                    </p>
                    <p className="text-xs text-muted-foreground md:hidden">
                      {formatDate(receipt.date)} •{" "}
                      {formatCurrency(receipt.amount, receipt.currency)}
                    </p>
                  </div>

                  <div className="hidden w-24 text-sm text-muted-foreground md:block">
                    {formatDate(receipt.date)}
                  </div>

                  <div className="hidden w-24 text-right font-medium md:block">
                    {formatCurrency(receipt.amount, receipt.currency)}
                  </div>

                  <div className="hidden w-28 md:block">
                    {receipt.category && (
                      <Badge
                        variant="secondary"
                        className={cn(
                          "text-xs",
                          CATEGORY_COLORS[receipt.category]
                        )}
                      >
                        {CATEGORY_LABELS[receipt.category]}
                      </Badge>
                    )}
                  </div>

                  <div className="hidden w-24 md:block">
                    <Badge
                      variant="outline"
                      className={cn("text-xs", STATUS_COLORS[receipt.status])}
                    >
                      {STATUS_LABELS[receipt.status]}
                    </Badge>
                  </div>

                  <div onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                          <Icons.ellipsis className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => setSelectedReceipt(receipt)}
                        >
                          <Icons.eye className="mr-2 h-4 w-4" />
                          View Details
                        </DropdownMenuItem>
                        {canWrite && (
                          <>
                            <DropdownMenuItem
                              onClick={() => setEditingReceipt(receipt)}
                            >
                              <Icons.edit className="mr-2 h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => {
                                setSelectedReceipt(receipt);
                                setShowDeleteDialog(true);
                              }}
                            >
                              <Icons.trash className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {(pagination.page - 1) * pagination.pageSize + 1} to{" "}
            {Math.min(
              pagination.page * pagination.pageSize,
              pagination.totalCount
            )}{" "}
            of {pagination.totalCount} receipts
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page <= 1}
              onClick={() =>
                updateParams({ page: (pagination.page - 1).toString() })
              }
            >
              <Icons.chevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <span className="text-sm">
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() =>
                updateParams({ page: (pagination.page + 1).toString() })
              }
            >
              Next
              <Icons.chevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Receipt Detail Dialog */}
      <Dialog
        open={!!selectedReceipt && !showDeleteDialog}
        onOpenChange={(open) => !open && setSelectedReceipt(null)}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {selectedReceipt && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {selectedReceipt.vendor || "Receipt Details"}
                </DialogTitle>
                <DialogDescription>
                  {selectedReceipt.receiptNumber &&
                    `Receipt #${selectedReceipt.receiptNumber}`}
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-6 md:grid-cols-2">
                <div className="aspect-[3/4] w-full overflow-hidden rounded-lg bg-muted">
                  {selectedReceipt.processedImageUrl ||
                  selectedReceipt.originalImageUrl ? (
                    <Image
                      src={
                        selectedReceipt.processedImageUrl ||
                        selectedReceipt.originalImageUrl!
                      }
                      alt={selectedReceipt.vendor || "Receipt"}
                      width={400}
                      height={533}
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <Icons.receipt className="h-24 w-24 text-muted-foreground" />
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  <div>
                    <Label className="text-muted-foreground">Vendor</Label>
                    <p className="font-medium">
                      {selectedReceipt.vendor || "Unknown"}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-muted-foreground">Amount</Label>
                      <p className="text-xl font-bold">
                        {formatCurrency(
                          selectedReceipt.amount,
                          selectedReceipt.currency
                        )}
                      </p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Date</Label>
                      <p className="font-medium">
                        {formatDate(selectedReceipt.date)}
                      </p>
                    </div>
                  </div>

                  {(selectedReceipt.subtotal || selectedReceipt.taxAmount) && (
                    <div className="grid grid-cols-2 gap-4">
                      {selectedReceipt.subtotal && (
                        <div>
                          <Label className="text-muted-foreground">
                            Subtotal
                          </Label>
                          <p className="font-medium">
                            {formatCurrency(
                              selectedReceipt.subtotal,
                              selectedReceipt.currency
                            )}
                          </p>
                        </div>
                      )}
                      {selectedReceipt.taxAmount && (
                        <div>
                          <Label className="text-muted-foreground">Tax</Label>
                          <p className="font-medium">
                            {formatCurrency(
                              selectedReceipt.taxAmount,
                              selectedReceipt.currency
                            )}
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-muted-foreground">Category</Label>
                      {selectedReceipt.category ? (
                        <Badge
                          className={cn(
                            "mt-1",
                            CATEGORY_COLORS[selectedReceipt.category]
                          )}
                        >
                          {CATEGORY_LABELS[selectedReceipt.category]}
                        </Badge>
                      ) : (
                        <p className="text-muted-foreground">Not categorized</p>
                      )}
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Status</Label>
                      <Badge
                        variant="outline"
                        className={cn(
                          "mt-1",
                          STATUS_COLORS[selectedReceipt.status]
                        )}
                      >
                        {STATUS_LABELS[selectedReceipt.status]}
                      </Badge>
                    </div>
                  </div>

                  {selectedReceipt.paymentMethod && (
                    <div>
                      <Label className="text-muted-foreground">
                        Payment Method
                      </Label>
                      <p className="font-medium">
                        {selectedReceipt.paymentMethod}
                      </p>
                    </div>
                  )}

                  {selectedReceipt.confidenceScore !== null && (
                    <div>
                      <Label className="text-muted-foreground">
                        Extraction Confidence
                      </Label>
                      <div className="mt-1 flex items-center gap-2">
                        <div className="h-2 flex-1 rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-green-500"
                            style={{
                              width: `${(selectedReceipt.confidenceScore || 0) * 100}%`,
                            }}
                          />
                        </div>
                        <span className="text-sm">
                          {Math.round(
                            (selectedReceipt.confidenceScore || 0) * 100
                          )}
                          %
                        </span>
                      </div>
                    </div>
                  )}

                  {selectedReceipt.syncStatuses.length > 0 && (
                    <div>
                      <Label className="text-muted-foreground">
                        Sync Status
                      </Label>
                      <div className="mt-2 space-y-2">
                        {selectedReceipt.syncStatuses.map((sync) => (
                          <div
                            key={sync.destinationId}
                            className="flex items-center justify-between rounded-md border p-2"
                          >
                            <div className="flex items-center gap-2">
                              {getSyncStatusIcon(sync.status)}
                              <span>{sync.destinationName}</span>
                              <Badge variant="outline" className="text-xs">
                                {sync.destinationType}
                              </Badge>
                            </div>
                            <span className="text-sm capitalize">
                              {sync.status.toLowerCase().replace("_", " ")}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <DialogFooter className="flex-col gap-2 sm:flex-row">
                {canWrite && (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setEditingReceipt(selectedReceipt);
                        setSelectedReceipt(null);
                      }}
                    >
                      <Icons.edit className="mr-2 h-4 w-4" />
                      Edit
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => setShowDeleteDialog(true)}
                    >
                      <Icons.trash className="mr-2 h-4 w-4" />
                      Delete
                    </Button>
                  </>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Receipt Dialog */}
      <Dialog
        open={!!editingReceipt}
        onOpenChange={(open) => !open && setEditingReceipt(null)}
      >
        <DialogContent>
          {editingReceipt && (
            <EditReceiptForm
              receipt={editingReceipt}
              onSubmit={handleUpdate}
              onCancel={() => setEditingReceipt(null)}
              isLoading={isUpdating}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Receipt(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedReceipt
                ? `Are you sure you want to delete this receipt from ${selectedReceipt.vendor || "Unknown"}? This action cannot be undone.`
                : `Are you sure you want to delete ${selectedReceipts.size} receipt(s)? This action cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <>
                  <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Category Dialog */}
      <Dialog
        open={showBulkCategoryDialog}
        onOpenChange={setShowBulkCategoryDialog}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Re-categorize Receipts</DialogTitle>
            <DialogDescription>
              Select a category for the {selectedReceipts.size} selected
              receipt(s).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select
                value={bulkCategory}
                onValueChange={(value) =>
                  setBulkCategory(value as ReceiptCategory)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowBulkCategoryDialog(false);
                setBulkCategory("");
              }}
              disabled={isUpdating}
            >
              Cancel
            </Button>
            <Button
              onClick={handleBulkCategoryUpdate}
              disabled={!bulkCategory || isUpdating}
            >
              {isUpdating ? (
                <>
                  <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />
                  Updating...
                </>
              ) : (
                "Update Category"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Edit Receipt Form Component
interface EditReceiptFormProps {
  receipt: ReceiptWithSync;
  onSubmit: (data: Partial<Receipt>) => Promise<void>;
  onCancel: () => void;
  isLoading: boolean;
}

function EditReceiptForm({
  receipt,
  onSubmit,
  onCancel,
  isLoading,
}: EditReceiptFormProps) {
  const [vendor, setVendor] = useState(receipt.vendor || "");
  const [amount, setAmount] = useState(receipt.amount?.toString() || "");
  const [currency, setCurrency] = useState(receipt.currency || "USD");
  const [category, setCategory] = useState<ReceiptCategory | "">(
    receipt.category || ""
  );
  const [date, setDate] = useState(
    receipt.date ? new Date(receipt.date).toISOString().split("T")[0] : ""
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      vendor: vendor || null,
      amount: amount ? parseFloat(amount) : null,
      currency: currency || null,
      category: category || null,
      date: date ? new Date(date) : null,
    });
  };

  return (
    <form onSubmit={handleSubmit}>
      <DialogHeader>
        <DialogTitle>Edit Receipt</DialogTitle>
        <DialogDescription>
          Update the receipt details below.
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-4 py-4">
        <div className="space-y-2">
          <Label htmlFor="vendor">Vendor</Label>
          <Input
            id="vendor"
            value={vendor}
            onChange={(e) => setVendor(e.target.value)}
            placeholder="Enter vendor name"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="amount">Amount</Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="currency">Currency</Label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger id="currency">
                <SelectValue placeholder="Select currency" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="USD">USD</SelectItem>
                <SelectItem value="EUR">EUR</SelectItem>
                <SelectItem value="GBP">GBP</SelectItem>
                <SelectItem value="CAD">CAD</SelectItem>
                <SelectItem value="AUD">AUD</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="category">Category</Label>
          <Select
            value={category}
            onValueChange={(value) => setCategory(value as ReceiptCategory)}
          >
            <SelectTrigger id="category">
              <SelectValue placeholder="Select category" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="date">Date</Label>
          <Input
            id="date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
          Cancel
        </Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading ? (
            <>
              <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            "Save Changes"
          )}
        </Button>
      </DialogFooter>
    </form>
  );
}
