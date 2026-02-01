"use client";

import * as React from "react";

import { ALL_PLANS, freePlan, proPlan, businessPlan } from "@/config/subscriptions";
import { clientFetch } from "@/lib/fetch";
import { cn } from "components/lib/utils";
import { Button } from "components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "components/ui/card";
import { Plan } from "shared/src/types/plan";
import { OrgSubscriptionPlan, SubscriptionPlan } from "types";
import { Badge } from "components/ui/badge";
import { CheckIcon } from "lucide-react";
import { Progress } from "components/ui/progress";

interface BillingFormProps extends React.HTMLAttributes<HTMLDivElement> {
  orgName: string;
  orgPlan: Plan;
  subscriptionPlan: OrgSubscriptionPlan;
}

export function OrgBillingForm({
  orgName,
  subscriptionPlan,
  orgPlan,
  className,
  ...props
}: BillingFormProps) {
  const [loadingPlan, setLoadingPlan] = React.useState<string | null>(null);

  async function handleCheckout(targetPlan: "pro" | "business") {
    setLoadingPlan(targetPlan);
    clientFetch<{ url: string }>(
      `/api/orgs/${orgName}/stripe?plan=${targetPlan}`,
      undefined,
      {
        afterRequestFinish: () => setLoadingPlan(null),
        onRequestSuccess: (response) => {
          window.location.href = response.url;
        },
        defaultErrorMessage: "Please refresh the page and try again.",
      }
    );
  }

  async function handleManageSubscription() {
    setLoadingPlan("manage");
    clientFetch<{ url: string }>(`/api/orgs/${orgName}/stripe`, undefined, {
      afterRequestFinish: () => setLoadingPlan(null),
      onRequestSuccess: (response) => {
        window.location.href = response.url;
      },
      defaultErrorMessage: "Please refresh the page and try again.",
    });
  }

  const isFreePlan = orgPlan === Plan.FREE;
  const isPro = orgPlan === Plan.PRO;
  const isBusiness = orgPlan === Plan.BUSINESS;

  // Calculate usage percentage
  const receiptsUsedPercent =
    subscriptionPlan.limits.receiptsPerMonth !== null
      ? Math.min(
          100,
          Math.round(
            (subscriptionPlan.receiptsUsedThisPeriod /
              subscriptionPlan.limits.receiptsPerMonth) *
              100
          )
        )
      : null;

  return (
    <div className={cn("space-y-8", className)} {...props}>
      {/* Current Plan & Usage */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Current Plan</CardTitle>
              <CardDescription>
                You are on the{" "}
                <strong className="text-foreground">
                  {subscriptionPlan.name}
                </strong>{" "}
                plan.
              </CardDescription>
            </div>
            {!isFreePlan && (
              <Badge variant="secondary">
                ${subscriptionPlan.price}/month
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="flex justify-between text-sm mb-2">
              <span>Receipts this month</span>
              <span>
                {subscriptionPlan.receiptsUsedThisPeriod}
                {subscriptionPlan.limits.receiptsPerMonth !== null
                  ? ` / ${subscriptionPlan.limits.receiptsPerMonth}`
                  : " (Unlimited)"}
              </span>
            </div>
            {receiptsUsedPercent !== null && (
              <Progress value={receiptsUsedPercent} className="h-2" />
            )}
          </div>
          {subscriptionPlan.billingPeriodEnd && (
            <p className="text-sm text-muted-foreground">
              Billing period ends:{" "}
              {new Date(subscriptionPlan.billingPeriodEnd).toLocaleDateString()}
            </p>
          )}
        </CardContent>
        {!isFreePlan && (
          <CardFooter>
            <Button
              variant="outline"
              onClick={handleManageSubscription}
              disabled={loadingPlan !== null}
              loading={loadingPlan === "manage"}
            >
              Manage Subscription
            </Button>
          </CardFooter>
        )}
      </Card>

      {/* Plan Selection */}
      <div>
        <h3 className="text-lg font-semibold mb-4">
          {isFreePlan ? "Choose a Plan" : "Available Plans"}
        </h3>
        <div className="grid gap-4 md:grid-cols-3">
          {/* Free Plan */}
          <PlanCard
            plan={freePlan}
            isCurrent={isFreePlan}
            isDisabled={true}
            buttonText={isFreePlan ? "Current Plan" : "Downgrade"}
          />

          {/* Pro Plan */}
          <PlanCard
            plan={proPlan}
            isCurrent={isPro}
            isPopular={true}
            isDisabled={isPro || loadingPlan !== null}
            isLoading={loadingPlan === "pro"}
            buttonText={
              isPro
                ? "Current Plan"
                : isBusiness
                  ? "Downgrade"
                  : "Upgrade to Pro"
            }
            onSelect={() => {
              if (isPro) return;
              if (isBusiness) {
                handleManageSubscription();
              } else {
                handleCheckout("pro");
              }
            }}
          />

          {/* Business Plan */}
          <PlanCard
            plan={businessPlan}
            isCurrent={isBusiness}
            isDisabled={isBusiness || loadingPlan !== null}
            isLoading={loadingPlan === "business"}
            buttonText={isBusiness ? "Current Plan" : "Upgrade to Business"}
            onSelect={() => {
              if (isBusiness) return;
              if (isPro) {
                handleManageSubscription();
              } else {
                handleCheckout("business");
              }
            }}
          />
        </div>
      </div>
    </div>
  );
}

interface PlanCardProps {
  plan: SubscriptionPlan;
  isCurrent: boolean;
  isPopular?: boolean;
  isDisabled?: boolean;
  isLoading?: boolean;
  buttonText: string;
  onSelect?: () => void;
}

function PlanCard({
  plan,
  isCurrent,
  isPopular,
  isDisabled,
  isLoading,
  buttonText,
  onSelect,
}: PlanCardProps) {
  return (
    <Card
      className={cn(
        "relative",
        isCurrent && "border-primary",
        isPopular && !isCurrent && "border-blue-500"
      )}
    >
      {isPopular && !isCurrent && (
        <Badge className="absolute -top-2 left-1/2 -translate-x-1/2 bg-blue-500">
          Most Popular
        </Badge>
      )}
      {isCurrent && (
        <Badge className="absolute -top-2 left-1/2 -translate-x-1/2">
          Current Plan
        </Badge>
      )}
      <CardHeader className="pt-6">
        <CardTitle className="text-xl">{plan.name}</CardTitle>
        <div className="mt-2">
          <span className="text-3xl font-bold">
            ${plan.price}
          </span>
          {plan.price > 0 && (
            <span className="text-muted-foreground">/month</span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {plan.features.map((feature, index) => (
            <li key={index} className="flex items-center gap-2 text-sm">
              <CheckIcon className="h-4 w-4 text-green-500 flex-shrink-0" />
              <span>{feature}</span>
            </li>
          ))}
        </ul>
      </CardContent>
      <CardFooter>
        <Button
          className="w-full"
          variant={isCurrent ? "outline" : isPopular ? "default" : "secondary"}
          disabled={isDisabled}
          loading={isLoading}
          onClick={onSelect}
        >
          {buttonText}
        </Button>
      </CardFooter>
    </Card>
  );
}
