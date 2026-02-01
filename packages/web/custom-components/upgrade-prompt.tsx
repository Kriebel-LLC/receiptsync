"use client";

import * as React from "react";
import { AlertTriangle, Zap } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "components/ui/alert";
import { Button } from "components/ui/button";
import { Plan } from "shared/src/types/plan";
import Link from "next/link";

interface UpgradePromptProps {
  message: string;
  orgName: string;
  suggestedPlan?: Plan;
  variant?: "warning" | "error";
  className?: string;
}

export function UpgradePrompt({
  message,
  orgName,
  suggestedPlan,
  variant = "warning",
  className,
}: UpgradePromptProps) {
  const planName = suggestedPlan === Plan.BUSINESS ? "Business" : "Pro";

  return (
    <Alert
      variant={variant === "error" ? "destructive" : "default"}
      className={className}
    >
      {variant === "error" ? (
        <AlertTriangle className="h-4 w-4" />
      ) : (
        <Zap className="h-4 w-4" />
      )}
      <AlertTitle>
        {variant === "error" ? "Limit Reached" : "Approaching Limit"}
      </AlertTitle>
      <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <span>{message}</span>
        <Button asChild size="sm" variant={variant === "error" ? "default" : "outline"}>
          <Link href={`/${orgName}/billing`}>
            Upgrade to {planName}
          </Link>
        </Button>
      </AlertDescription>
    </Alert>
  );
}

interface UsageWarningBannerProps {
  receiptsUsed: number;
  receiptsLimit: number | null;
  orgName: string;
  currentPlan: Plan;
}

export function UsageWarningBanner({
  receiptsUsed,
  receiptsLimit,
  orgName,
  currentPlan,
}: UsageWarningBannerProps) {
  // Don't show for unlimited plans
  if (receiptsLimit === null) return null;

  const percentUsed = Math.round((receiptsUsed / receiptsLimit) * 100);
  const remaining = receiptsLimit - receiptsUsed;

  // Only show warnings at 80%, 90%, or 100%
  if (percentUsed < 80) return null;

  const suggestedPlan = currentPlan === Plan.FREE ? Plan.PRO : Plan.BUSINESS;

  if (percentUsed >= 100) {
    return (
      <UpgradePrompt
        message={`You've used all ${receiptsLimit} receipts this month. Upgrade to continue processing receipts.`}
        orgName={orgName}
        suggestedPlan={suggestedPlan}
        variant="error"
      />
    );
  }

  if (percentUsed >= 90) {
    return (
      <UpgradePrompt
        message={`You have ${remaining} receipt${remaining === 1 ? "" : "s"} remaining this month.`}
        orgName={orgName}
        suggestedPlan={suggestedPlan}
        variant="warning"
      />
    );
  }

  // 80%
  return (
    <UpgradePrompt
      message={`You've used ${percentUsed}% of your monthly receipts (${receiptsUsed}/${receiptsLimit}).`}
      orgName={orgName}
      suggestedPlan={suggestedPlan}
      variant="warning"
    />
  );
}

interface DestinationLimitBannerProps {
  destinationsUsed: number;
  destinationsLimit: number | null;
  orgName: string;
}

export function DestinationLimitBanner({
  destinationsUsed,
  destinationsLimit,
  orgName,
}: DestinationLimitBannerProps) {
  // Don't show for unlimited destinations
  if (destinationsLimit === null) return null;

  // Only show if at limit
  if (destinationsUsed < destinationsLimit) return null;

  return (
    <UpgradePrompt
      message={`You've reached your limit of ${destinationsLimit} destination${destinationsLimit === 1 ? "" : "s"}. Upgrade to Pro for unlimited destinations.`}
      orgName={orgName}
      suggestedPlan={Plan.PRO}
      variant="error"
    />
  );
}
