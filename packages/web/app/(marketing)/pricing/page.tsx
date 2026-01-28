import Link from "next/link";

import { Icons } from "@/custom-components/icons";
import { authConfig } from "@/lib/auth";
import { cn } from "components/lib/utils";
import { buttonVariants } from "components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "components/ui/card";
import { cookies } from "next/headers";

export const metadata = {
  title: "Pricing",
};

export default function PricingPage() {
  const isLoggedIn = cookies().has(authConfig.cookieName);

  return (
    <section className="container flex flex-col gap-6 py-8 md:max-w-[64rem] md:py-12 lg:py-24">
      <div className="mx-auto flex w-full flex-col gap-4 md:max-w-[58rem]">
        <h2 className="font-heading text-3xl leading-[1.1] sm:text-3xl md:text-6xl">
          Simple, Transparent Pricing
        </h2>
        <p className="max-w-[85%] leading-normal text-muted-foreground sm:text-lg sm:leading-7">
          Start free, upgrade when you need more receipts processed.
        </p>
      </div>

      <div className="grid w-full gap-8 md:grid-cols-3">
        {/* Free Tier */}
        <Card>
          <CardHeader>
            <CardTitle>Free</CardTitle>
            <CardDescription>Perfect for getting started</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-4xl font-bold">
              $0
              <span className="text-lg font-normal text-muted-foreground">
                /month
              </span>
            </div>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-center">
                <Icons.check className="mr-2 h-4 w-4 text-primary" />
                50 receipts per month
              </li>
              <li className="flex items-center">
                <Icons.check className="mr-2 h-4 w-4 text-primary" />
                Email forwarding
              </li>
              <li className="flex items-center">
                <Icons.check className="mr-2 h-4 w-4 text-primary" />
                Google Sheets sync
              </li>
              <li className="flex items-center">
                <Icons.check className="mr-2 h-4 w-4 text-primary" />
                Basic categories
              </li>
            </ul>
          </CardContent>
          <CardFooter>
            <Link
              href={isLoggedIn ? "/dashboard" : "/register"}
              className={cn(buttonVariants({ variant: "outline" }), "w-full")}
            >
              Get Started Free
            </Link>
          </CardFooter>
        </Card>

        {/* Pro Tier */}
        <Card className="border-primary">
          <CardHeader>
            <div className="mb-2 w-fit rounded-full bg-primary px-3 py-1 text-xs text-primary-foreground">
              Most Popular
            </div>
            <CardTitle>Pro</CardTitle>
            <CardDescription>For individuals and freelancers</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-4xl font-bold">
              $9
              <span className="text-lg font-normal text-muted-foreground">
                /month
              </span>
            </div>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-center">
                <Icons.check className="mr-2 h-4 w-4 text-primary" />
                500 receipts per month
              </li>
              <li className="flex items-center">
                <Icons.check className="mr-2 h-4 w-4 text-primary" />
                Email forwarding
              </li>
              <li className="flex items-center">
                <Icons.check className="mr-2 h-4 w-4 text-primary" />
                Google Sheets + Notion sync
              </li>
              <li className="flex items-center">
                <Icons.check className="mr-2 h-4 w-4 text-primary" />
                Advanced categories
              </li>
              <li className="flex items-center">
                <Icons.check className="mr-2 h-4 w-4 text-primary" />
                Multi-currency support
              </li>
              <li className="flex items-center">
                <Icons.check className="mr-2 h-4 w-4 text-primary" />
                Priority support
              </li>
            </ul>
          </CardContent>
          <CardFooter>
            <Link
              href={isLoggedIn ? "/dashboard/billing" : "/register"}
              className={cn(buttonVariants(), "w-full")}
            >
              Start Pro Trial
            </Link>
          </CardFooter>
        </Card>

        {/* Business Tier */}
        <Card>
          <CardHeader>
            <CardTitle>Business</CardTitle>
            <CardDescription>For teams and businesses</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-4xl font-bold">
              $29
              <span className="text-lg font-normal text-muted-foreground">
                /month
              </span>
            </div>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-center">
                <Icons.check className="mr-2 h-4 w-4 text-primary" />
                Unlimited receipts
              </li>
              <li className="flex items-center">
                <Icons.check className="mr-2 h-4 w-4 text-primary" />
                Multiple email addresses
              </li>
              <li className="flex items-center">
                <Icons.check className="mr-2 h-4 w-4 text-primary" />
                All integrations
              </li>
              <li className="flex items-center">
                <Icons.check className="mr-2 h-4 w-4 text-primary" />
                Custom categories
              </li>
              <li className="flex items-center">
                <Icons.check className="mr-2 h-4 w-4 text-primary" />
                API access
              </li>
              <li className="flex items-center">
                <Icons.check className="mr-2 h-4 w-4 text-primary" />
                Team collaboration
              </li>
              <li className="flex items-center">
                <Icons.check className="mr-2 h-4 w-4 text-primary" />
                Dedicated support
              </li>
            </ul>
          </CardContent>
          <CardFooter>
            <Link
              href={isLoggedIn ? "/dashboard/billing" : "/register"}
              className={cn(buttonVariants({ variant: "outline" }), "w-full")}
            >
              Start Business Trial
            </Link>
          </CardFooter>
        </Card>
      </div>

      <div className="mx-auto flex w-full max-w-[58rem] flex-col gap-4 pt-8">
        <p className="leading-normal text-muted-foreground sm:leading-7">
          All plans include a 14-day free trial. No credit card required to
          start.
        </p>
      </div>
    </section>
  );
}
