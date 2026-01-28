"use client";

import { useState } from "react";
import { Button } from "components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "components/ui/card";
import { Input } from "components/ui/input";
import { Label } from "components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "components/ui/select";
import { Badge } from "components/ui/badge";
import { Icons } from "@/custom-components/icons";
import { cn } from "components/lib/utils";
import { useRouter } from "next/navigation";
import { Receipt, ReceiptCategory, ReceiptStatus } from "shared/src/db/schema";

interface ReceiptReviewListProps {
  receipts: Receipt[];
  orgId: string;
  orgName: string;
}

interface EditableReceipt {
  id: string;
  vendor: string;
  amount: string;
  currency: string;
  date: string;
  category: ReceiptCategory | "";
  status: ReceiptStatus;
  originalImageUrl: string | null;
  isEditing: boolean;
  isSaving: boolean;
  error?: string;
}

const CATEGORY_OPTIONS = [
  { value: ReceiptCategory.Food, label: "Food & Dining" },
  { value: ReceiptCategory.Travel, label: "Travel" },
  { value: ReceiptCategory.Office, label: "Office Supplies" },
  { value: ReceiptCategory.Software, label: "Software" },
  { value: ReceiptCategory.Utilities, label: "Utilities" },
  { value: ReceiptCategory.Entertainment, label: "Entertainment" },
  { value: ReceiptCategory.Healthcare, label: "Healthcare" },
  { value: ReceiptCategory.Shopping, label: "Shopping" },
  { value: ReceiptCategory.Services, label: "Services" },
  { value: ReceiptCategory.Other, label: "Other" },
];

const CURRENCY_OPTIONS = [
  { value: "USD", label: "USD ($)" },
  { value: "EUR", label: "EUR (\u20ac)" },
  { value: "GBP", label: "GBP (\u00a3)" },
  { value: "CAD", label: "CAD ($)" },
  { value: "AUD", label: "AUD ($)" },
];

export function ReceiptReviewList({
  receipts: initialReceipts,
  orgId,
  orgName,
}: ReceiptReviewListProps) {
  const router = useRouter();
  const [receipts, setReceipts] = useState<EditableReceipt[]>(
    initialReceipts.map((r) => ({
      id: r.id,
      vendor: r.vendor || "",
      amount: r.amount?.toString() || "",
      currency: r.currency || "USD",
      date: r.date ? formatDateForInput(r.date) : "",
      category: r.category || "",
      status: r.status,
      originalImageUrl: r.originalImageUrl,
      isEditing: false,
      isSaving: false,
    }))
  );
  const [isSavingAll, setIsSavingAll] = useState(false);

  const toggleEditing = (id: string) => {
    setReceipts((prev) =>
      prev.map((r) => (r.id === id ? { ...r, isEditing: !r.isEditing } : r))
    );
  };

  const updateReceipt = (
    id: string,
    field: keyof EditableReceipt,
    value: string
  ) => {
    setReceipts((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r))
    );
  };

  const saveReceipt = async (receipt: EditableReceipt) => {
    setReceipts((prev) =>
      prev.map((r) => (r.id === receipt.id ? { ...r, isSaving: true } : r))
    );

    try {
      const response = await fetch(
        `/api/orgs/${orgName}/receipts/${receipt.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            vendor: receipt.vendor || null,
            amount: receipt.amount ? parseFloat(receipt.amount) : null,
            currency: receipt.currency || null,
            date: receipt.date || null,
            category: receipt.category || null,
          }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to save receipt");
      }

      setReceipts((prev) =>
        prev.map((r) =>
          r.id === receipt.id
            ? { ...r, isSaving: false, isEditing: false, error: undefined }
            : r
        )
      );
    } catch (error) {
      setReceipts((prev) =>
        prev.map((r) =>
          r.id === receipt.id
            ? { ...r, isSaving: false, error: "Failed to save" }
            : r
        )
      );
    }
  };

  const confirmReceipt = async (receiptId: string) => {
    setReceipts((prev) =>
      prev.map((r) => (r.id === receiptId ? { ...r, isSaving: true } : r))
    );

    try {
      const response = await fetch(
        `/api/orgs/${orgName}/receipts/${receiptId}/confirm`,
        { method: "POST" }
      );

      if (!response.ok) {
        throw new Error("Failed to confirm receipt");
      }

      const data = (await response.json()) as { status: ReceiptStatus };

      setReceipts((prev) =>
        prev.map((r) =>
          r.id === receiptId
            ? { ...r, isSaving: false, status: data.status }
            : r
        )
      );
    } catch (error) {
      setReceipts((prev) =>
        prev.map((r) =>
          r.id === receiptId
            ? { ...r, isSaving: false, error: "Failed to confirm" }
            : r
        )
      );
    }
  };

  const saveAndConfirmAll = async () => {
    setIsSavingAll(true);

    for (const receipt of receipts) {
      // Save receipt data
      await saveReceipt(receipt);
      // Then confirm it
      await confirmReceipt(receipt.id);
    }

    setIsSavingAll(false);

    // Redirect to receipts list
    router.push(`/${orgName}/receipts`);
  };

  const getStatusBadge = (status: ReceiptStatus) => {
    switch (status) {
      case ReceiptStatus.Pending:
        return <Badge variant="outline">Pending</Badge>;
      case ReceiptStatus.Processing:
        return <Badge variant="secondary">Processing</Badge>;
      case ReceiptStatus.Extracted:
        return <Badge className="bg-green-100 text-green-800">Extracted</Badge>;
      case ReceiptStatus.Failed:
        return <Badge variant="destructive">Failed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Receipt cards */}
      <div className="space-y-4">
        {receipts.map((receipt) => (
          <Card key={receipt.id}>
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">
                  {receipt.vendor || "Unknown Vendor"}
                </CardTitle>
                <div className="flex items-center gap-2">
                  {getStatusBadge(receipt.status)}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleEditing(receipt.id)}
                  >
                    <Icons.pencil className="mr-1 h-4 w-4" />
                    {receipt.isEditing ? "Cancel" : "Edit"}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-6 md:grid-cols-[1fr_2fr]">
                {/* Receipt preview */}
                <div className="relative aspect-[3/4] overflow-hidden rounded-lg bg-muted">
                  {receipt.originalImageUrl ? (
                    <div className="flex h-full items-center justify-center text-muted-foreground">
                      <Icons.receipt className="h-16 w-16" />
                    </div>
                  ) : (
                    <div className="flex h-full items-center justify-center text-muted-foreground">
                      <Icons.media className="h-16 w-16" />
                    </div>
                  )}
                </div>

                {/* Receipt details form */}
                <div className="space-y-4">
                  {receipt.isEditing ? (
                    <>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor={`vendor-${receipt.id}`}>Vendor</Label>
                          <Input
                            id={`vendor-${receipt.id}`}
                            value={receipt.vendor}
                            onChange={(e) =>
                              updateReceipt(
                                receipt.id,
                                "vendor",
                                e.target.value
                              )
                            }
                            placeholder="Store name"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={`date-${receipt.id}`}>Date</Label>
                          <Input
                            id={`date-${receipt.id}`}
                            type="date"
                            value={receipt.date}
                            onChange={(e) =>
                              updateReceipt(receipt.id, "date", e.target.value)
                            }
                          />
                        </div>
                      </div>
                      <div className="grid gap-4 sm:grid-cols-3">
                        <div className="space-y-2">
                          <Label htmlFor={`amount-${receipt.id}`}>Amount</Label>
                          <Input
                            id={`amount-${receipt.id}`}
                            type="number"
                            step="0.01"
                            value={receipt.amount}
                            onChange={(e) =>
                              updateReceipt(
                                receipt.id,
                                "amount",
                                e.target.value
                              )
                            }
                            placeholder="0.00"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={`currency-${receipt.id}`}>
                            Currency
                          </Label>
                          <Select
                            value={receipt.currency}
                            onValueChange={(value) =>
                              updateReceipt(receipt.id, "currency", value)
                            }
                          >
                            <SelectTrigger id={`currency-${receipt.id}`}>
                              <SelectValue placeholder="Select currency" />
                            </SelectTrigger>
                            <SelectContent>
                              {CURRENCY_OPTIONS.map((option) => (
                                <SelectItem
                                  key={option.value}
                                  value={option.value}
                                >
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={`category-${receipt.id}`}>
                            Category
                          </Label>
                          <Select
                            value={receipt.category}
                            onValueChange={(value) =>
                              updateReceipt(
                                receipt.id,
                                "category",
                                value as ReceiptCategory
                              )
                            }
                          >
                            <SelectTrigger id={`category-${receipt.id}`}>
                              <SelectValue placeholder="Select category" />
                            </SelectTrigger>
                            <SelectContent>
                              {CATEGORY_OPTIONS.map((option) => (
                                <SelectItem
                                  key={option.value}
                                  value={option.value}
                                >
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          onClick={() => toggleEditing(receipt.id)}
                        >
                          Cancel
                        </Button>
                        <Button
                          onClick={() => saveReceipt(receipt)}
                          disabled={receipt.isSaving}
                          loading={receipt.isSaving}
                        >
                          Save Changes
                        </Button>
                      </div>
                    </>
                  ) : (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-muted-foreground">Amount:</span>
                          <p className="font-medium">
                            {receipt.amount
                              ? `${receipt.currency} ${parseFloat(
                                  receipt.amount
                                ).toFixed(2)}`
                              : "Not set"}
                          </p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Date:</span>
                          <p className="font-medium">
                            {receipt.date
                              ? formatDateForDisplay(receipt.date)
                              : "Not set"}
                          </p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">
                            Category:
                          </span>
                          <p className="font-medium">
                            {receipt.category
                              ? CATEGORY_OPTIONS.find(
                                  (c) => c.value === receipt.category
                                )?.label || receipt.category
                              : "Not set"}
                          </p>
                        </div>
                      </div>
                      {receipt.error && (
                        <p className="text-sm text-destructive">
                          {receipt.error}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Action buttons */}
      <div className="flex justify-end gap-4">
        <Button
          variant="outline"
          onClick={() => router.push(`/${orgName}/receipts/upload`)}
          disabled={isSavingAll}
        >
          Upload More
        </Button>
        <Button
          onClick={saveAndConfirmAll}
          disabled={isSavingAll}
          loading={isSavingAll}
        >
          {isSavingAll
            ? "Saving..."
            : `Confirm ${receipts.length} Receipt${
                receipts.length !== 1 ? "s" : ""
              }`}
        </Button>
      </div>
    </div>
  );
}

function formatDateForInput(date: Date): string {
  return date.toISOString().split("T")[0];
}

function formatDateForDisplay(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
