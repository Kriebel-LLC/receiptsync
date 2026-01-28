import Link from "next/link";

import { Icons } from "@/custom-components/icons";
import { authConfig } from "@/lib/auth";
import { cn } from "components/lib/utils";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "components/ui/accordion";
import { buttonVariants } from "components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "components/ui/card";
import {
  ArrowRight,
  Camera,
  DollarSign,
  FileSpreadsheet,
  Globe,
  Lock,
  Mail,
  ScanLine,
  Sparkles,
  Tag,
  Zap,
} from "lucide-react";
import { cookies } from "next/headers";

export default async function IndexPage() {
  const isLoggedIn = cookies().has(authConfig.cookieName);

  return (
    <>
      {/* Hero Section */}
      <section className="space-y-6 pb-8 pt-6 md:pb-12 md:pt-10 lg:py-32">
        <div className="container flex max-w-[64rem] flex-col items-center gap-4 text-center">
          <div className="rounded-2xl bg-muted px-4 py-1.5 text-sm font-medium">
            <Sparkles className="mr-2 inline-block h-4 w-4" />
            AI-Powered Receipt Management
          </div>
          <h1 className="font-heading text-3xl sm:text-5xl md:text-6xl lg:text-7xl">
            Stop manually entering receipts.
          </h1>
          <p className="max-w-[42rem] leading-normal text-muted-foreground sm:text-xl sm:leading-8">
            AI extracts and syncs expense data to your spreadsheet. Forward
            emails, upload photos, and let our AI handle the rest.
          </p>
          <div className="flex flex-col gap-4 sm:flex-row">
            <Link
              href={isLoggedIn ? "/dashboard" : "/register"}
              className={cn(buttonVariants({ size: "lg" }))}
            >
              {isLoggedIn ? "Go to Dashboard" : "Start Free"}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
            <Link
              href="#how-it-works"
              className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
            >
              See How It Works
            </Link>
          </div>
          <p className="text-sm text-muted-foreground">
            50 free receipts per month. No credit card required.
          </p>
        </div>
      </section>

      {/* How It Works Section */}
      <section
        id="how-it-works"
        className="container space-y-6 bg-slate-50 py-8 dark:bg-transparent md:py-12 lg:py-24"
      >
        <div className="mx-auto flex max-w-[58rem] flex-col items-center space-y-4 text-center">
          <h2 className="font-heading text-3xl leading-[1.1] sm:text-3xl md:text-6xl">
            How It Works
          </h2>
          <p className="max-w-[85%] leading-normal text-muted-foreground sm:text-lg sm:leading-7">
            Three simple steps to automate your receipt management
          </p>
        </div>
        <div className="mx-auto grid max-w-5xl gap-8 md:grid-cols-3">
          <div className="flex flex-col items-center space-y-4 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <span className="text-2xl font-bold">1</span>
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-bold">Send Your Receipts</h3>
              <p className="text-muted-foreground">
                Forward email receipts or upload photos. Works with PDFs,
                images, and email attachments.
              </p>
            </div>
            <div className="flex gap-2">
              <Mail className="h-6 w-6 text-muted-foreground" />
              <Camera className="h-6 w-6 text-muted-foreground" />
            </div>
          </div>
          <div className="flex flex-col items-center space-y-4 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <span className="text-2xl font-bold">2</span>
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-bold">AI Extracts Data</h3>
              <p className="text-muted-foreground">
                Our AI reads your receipts and extracts vendor, amount, date,
                category, and more with high accuracy.
              </p>
            </div>
            <div className="flex gap-2">
              <ScanLine className="h-6 w-6 text-muted-foreground" />
              <Sparkles className="h-6 w-6 text-muted-foreground" />
            </div>
          </div>
          <div className="flex flex-col items-center space-y-4 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <span className="text-2xl font-bold">3</span>
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-bold">Syncs to Your Spreadsheet</h3>
              <p className="text-muted-foreground">
                Data automatically syncs to Google Sheets or Notion. Your
                expenses are always organized.
              </p>
            </div>
            <div className="flex gap-2">
              <FileSpreadsheet className="h-6 w-6 text-muted-foreground" />
              <Zap className="h-6 w-6 text-muted-foreground" />
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section
        id="features"
        className="container space-y-6 py-8 md:py-12 lg:py-24"
      >
        <div className="mx-auto flex max-w-[58rem] flex-col items-center space-y-4 text-center">
          <h2 className="font-heading text-3xl leading-[1.1] sm:text-3xl md:text-6xl">
            Features
          </h2>
          <p className="max-w-[85%] leading-normal text-muted-foreground sm:text-lg sm:leading-7">
            Everything you need to automate your expense tracking
          </p>
        </div>
        <div className="mx-auto grid justify-center gap-4 sm:grid-cols-2 md:max-w-[64rem] md:grid-cols-3">
          <div className="relative overflow-hidden rounded-lg border bg-background p-2">
            <div className="flex h-[180px] flex-col justify-between rounded-md p-6">
              <ScanLine className="h-12 w-12" />
              <div className="space-y-2">
                <h3 className="font-bold">High-Accuracy OCR</h3>
                <p className="text-sm text-muted-foreground">
                  State-of-the-art AI reads receipts from photos, PDFs, and
                  emails with exceptional accuracy.
                </p>
              </div>
            </div>
          </div>
          <div className="relative overflow-hidden rounded-lg border bg-background p-2">
            <div className="flex h-[180px] flex-col justify-between rounded-md p-6">
              <Globe className="h-12 w-12" />
              <div className="space-y-2">
                <h3 className="font-bold">Multi-Currency Support</h3>
                <p className="text-sm text-muted-foreground">
                  Automatically detects and handles receipts in any currency
                  with conversion options.
                </p>
              </div>
            </div>
          </div>
          <div className="relative overflow-hidden rounded-lg border bg-background p-2">
            <div className="flex h-[180px] flex-col justify-between rounded-md p-6">
              <Tag className="h-12 w-12" />
              <div className="space-y-2">
                <h3 className="font-bold">Smart Categorization</h3>
                <p className="text-sm text-muted-foreground">
                  AI automatically categorizes expenses into food, travel,
                  office supplies, and more.
                </p>
              </div>
            </div>
          </div>
          <div className="relative overflow-hidden rounded-lg border bg-background p-2">
            <div className="flex h-[180px] flex-col justify-between rounded-md p-6">
              <FileSpreadsheet className="h-12 w-12" />
              <div className="space-y-2">
                <h3 className="font-bold">Google Sheets Sync</h3>
                <p className="text-sm text-muted-foreground">
                  Automatically add extracted data to your Google Sheets
                  spreadsheet in real-time.
                </p>
              </div>
            </div>
          </div>
          <div className="relative overflow-hidden rounded-lg border bg-background p-2">
            <div className="flex h-[180px] flex-col justify-between rounded-md p-6">
              <svg viewBox="0 0 24 24" className="h-12 w-12 fill-current">
                <path d="M4 4a2 2 0 0 1 2-2h8.5L20 7.5V20a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4zm2 0v16h12V9h-5V4H6zm8 0v4h4l-4-4z" />
              </svg>
              <div className="space-y-2">
                <h3 className="font-bold">Notion Integration</h3>
                <p className="text-sm text-muted-foreground">
                  Sync expense data directly to your Notion databases for
                  seamless organization.
                </p>
              </div>
            </div>
          </div>
          <div className="relative overflow-hidden rounded-lg border bg-background p-2">
            <div className="flex h-[180px] flex-col justify-between rounded-md p-6">
              <Mail className="h-12 w-12" />
              <div className="space-y-2">
                <h3 className="font-bold">Email Forwarding</h3>
                <p className="text-sm text-muted-foreground">
                  Simply forward receipt emails to your unique address. We
                  handle the rest automatically.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section
        id="pricing"
        className="container space-y-6 bg-slate-50 py-8 dark:bg-transparent md:py-12 lg:py-24"
      >
        <div className="mx-auto flex max-w-[58rem] flex-col items-center space-y-4 text-center">
          <h2 className="font-heading text-3xl leading-[1.1] sm:text-3xl md:text-6xl">
            Simple, Transparent Pricing
          </h2>
          <p className="max-w-[85%] leading-normal text-muted-foreground sm:text-lg sm:leading-7">
            Start free, upgrade when you need more
          </p>
        </div>
        <div className="mx-auto grid max-w-5xl gap-8 md:grid-cols-3">
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
      </section>

      {/* FAQ Section */}
      <section id="faq" className="container space-y-6 py-8 md:py-12 lg:py-24">
        <div className="mx-auto flex max-w-[58rem] flex-col items-center space-y-4 text-center">
          <h2 className="font-heading text-3xl leading-[1.1] sm:text-3xl md:text-6xl">
            Frequently Asked Questions
          </h2>
          <p className="max-w-[85%] leading-normal text-muted-foreground sm:text-lg sm:leading-7">
            Got questions? We&apos;ve got answers.
          </p>
        </div>
        <div className="mx-auto max-w-3xl">
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="formats">
              <AccordionTrigger>
                What receipt formats are supported?
              </AccordionTrigger>
              <AccordionContent>
                ReceiptSync supports a wide variety of formats including JPG,
                PNG, PDF, and email attachments. You can forward email receipts
                directly, upload photos from your phone, or drag and drop files.
                Our AI is trained to handle receipts from retailers,
                restaurants, online stores, and more.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="accuracy">
              <AccordionTrigger>How accurate is the OCR?</AccordionTrigger>
              <AccordionContent>
                Our AI-powered OCR achieves over 95% accuracy for standard
                receipts. We extract vendor name, date, total amount, tax,
                subtotal, and individual line items when available. You can
                always review and correct any data before syncing.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="security">
              <AccordionTrigger>Is my data secure?</AccordionTrigger>
              <AccordionContent>
                Absolutely. All data is encrypted in transit and at rest. We
                never share your receipt data with third parties. Your receipts
                are processed securely and you maintain full control over your
                data. You can delete your data at any time.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="integrations">
              <AccordionTrigger>
                Which spreadsheet apps are supported?
              </AccordionTrigger>
              <AccordionContent>
                We currently support Google Sheets and Notion. You can sync to
                existing spreadsheets or let us create new ones. More
                integrations including Airtable and Excel Online are coming
                soon.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="cancel">
              <AccordionTrigger>Can I cancel anytime?</AccordionTrigger>
              <AccordionContent>
                Yes, you can cancel your subscription at any time. There are no
                long-term contracts or cancellation fees. Your data remains
                accessible until the end of your billing period.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </section>

      {/* CTA Section */}
      <section className="container space-y-6 bg-slate-50 py-8 dark:bg-transparent md:py-12 lg:py-24">
        <div className="mx-auto flex max-w-[58rem] flex-col items-center space-y-4 text-center">
          <h2 className="font-heading text-3xl leading-[1.1] sm:text-3xl md:text-6xl">
            Ready to automate your receipts?
          </h2>
          <p className="max-w-[85%] leading-normal text-muted-foreground sm:text-lg sm:leading-7">
            Join thousands of users who save hours every month with ReceiptSync.
          </p>
          <div className="flex flex-col gap-4 sm:flex-row">
            <Link
              href={isLoggedIn ? "/dashboard" : "/register"}
              className={cn(buttonVariants({ size: "lg" }))}
            >
              {isLoggedIn ? "Go to Dashboard" : "Sign Up Free"}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </div>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <div className="flex items-center">
              <Icons.check className="mr-1 h-4 w-4 text-primary" />
              No credit card required
            </div>
            <div className="flex items-center">
              <Icons.check className="mr-1 h-4 w-4 text-primary" />
              50 free receipts/month
            </div>
            <div className="flex items-center">
              <Lock className="mr-1 h-4 w-4" />
              Secure & private
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
