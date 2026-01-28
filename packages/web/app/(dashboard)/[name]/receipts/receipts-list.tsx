"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "components/ui/table";
import { Badge } from "components/ui/badge";
import { Button } from "components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "components/ui/dropdown-menu";
import { Icons } from "@/custom-components/icons";
import { Receipt, ReceiptCategory, ReceiptStatus } from "shared/src/db/schema";
import { useRouter } from "next/navigation";

interface ReceiptsListProps {
  receipts: Receipt[];
  orgName: string;
}

const CATEGORY_LABELS: Record<ReceiptCategory, string> = {
  [ReceiptCategory.Food]: "Food & Dining",
  [ReceiptCategory.Travel]: "Travel",
  [ReceiptCategory.Office]: "Office Supplies",
  [ReceiptCategory.Software]: "Software",
  [ReceiptCategory.Utilities]: "Utilities",
  [ReceiptCategory.Entertainment]: "Entertainment",
  [ReceiptCategory.Healthcare]: "Healthcare",
  [ReceiptCategory.Shopping]: "Shopping",
  [ReceiptCategory.Services]: "Services",
  [ReceiptCategory.Other]: "Other",
};

export function ReceiptsList({
  receipts: initialReceipts,
  orgName,
}: ReceiptsListProps) {
  const router = useRouter();
  const [receipts, setReceipts] = useState(initialReceipts);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const deleteReceipt = async (id: string) => {
    if (!confirm("Are you sure you want to delete this receipt?")) return;

    setDeletingId(id);
    try {
      const response = await fetch(`/api/orgs/${orgName}/receipts/${id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        setReceipts((prev) => prev.filter((r) => r.id !== id));
      }
    } finally {
      setDeletingId(null);
    }
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
      case ReceiptStatus.Archived:
        return (
          <Badge variant="outline" className="opacity-60">
            Archived
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const formatDate = (date: Date | null) => {
    if (!date) return "-";
    return new Date(date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const formatAmount = (amount: number | null, currency: string | null) => {
    if (amount == null) return "-";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
    }).format(amount);
  };

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Vendor</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-[70px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {receipts.map((receipt) => (
            <TableRow key={receipt.id}>
              <TableCell className="font-medium">
                {receipt.vendor || (
                  <span className="text-muted-foreground">Unknown</span>
                )}
              </TableCell>
              <TableCell>
                {formatAmount(receipt.amount, receipt.currency)}
              </TableCell>
              <TableCell>{formatDate(receipt.date)}</TableCell>
              <TableCell>
                {receipt.category ? (
                  CATEGORY_LABELS[receipt.category]
                ) : (
                  <span className="text-muted-foreground">-</span>
                )}
              </TableCell>
              <TableCell>{getStatusBadge(receipt.status)}</TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <Icons.ellipsis className="h-4 w-4" />
                      <span className="sr-only">Open menu</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() =>
                        router.push(
                          `/${orgName}/receipts/review?ids=${receipt.id}`
                        )
                      }
                    >
                      <Icons.pencil className="mr-2 h-4 w-4" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={() => deleteReceipt(receipt.id)}
                      disabled={deletingId === receipt.id}
                    >
                      <Icons.trash className="mr-2 h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
