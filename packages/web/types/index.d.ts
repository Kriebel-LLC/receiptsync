import { OrgUser, User } from "shared/src/db/schema";

import { Icons } from "@/custom-components/icons";

export type NavItem = {
  title: string;
  href: string;
  disabled?: boolean;
};

export type MainNavItem = NavItem;

export type SidebarNavItem = {
  title: string;
  disabled?: boolean;
  external?: boolean;
  icon?: keyof typeof Icons | string;
} & (
  | {
      href: string;
      items?: never;
    }
  | {
      href?: string;
      items: NavLink[];
    }
);

export type SiteConfig = {
  name: string;
  description: string;
  url: string;
  ogImage: string;
  links: {
    twitter: string;
  };
};

export type DocsConfig = {
  mainNav: MainNavItem[];
  sidebarNav: SidebarNavItem[];
};

export type MarketingConfig = {
  mainNav: MainNavItem[];
};

export type DashboardConfig = {
  mainNav: MainNavItem[];
  sidebarNav: SidebarNavItem[];
};

import { Plan, PlanLimits } from "shared/src/types/plan";

export type SubscriptionPlan = {
  name: string;
  description: string;
  stripePriceId: string;
  price: number;
  features: string[];
  limits: PlanLimits;
};

export type UserSubscriptionPlan = SubscriptionPlan &
  Pick<User, "stripeCustomerId" | "stripeSubscriptionId"> & {
    stripeCurrentPeriodEnd: number;
    isPro: boolean;
    plan: Plan;
  };

export type OrgSubscriptionPlan = SubscriptionPlan & {
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripeCurrentPeriodEnd: number | null;
  plan: Plan;
  receiptsUsedThisPeriod: number;
  billingPeriodStart: Date | null;
  billingPeriodEnd: Date | null;
};

export type UserDetail = {
  userId: string;
  email: string;
  displayName?: string;
  photoUrl?: string;
};

export type OrgUserWithDetail = OrgUser & UserDetail;
