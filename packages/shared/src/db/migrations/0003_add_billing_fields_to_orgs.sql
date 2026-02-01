-- Add new billing-related columns to the orgs table for subscription management
ALTER TABLE `orgs` ADD `stripe_subscription_id` text(191);
--> statement-breakpoint
ALTER TABLE `orgs` ADD `stripe_price_id` text(191);
--> statement-breakpoint
ALTER TABLE `orgs` ADD `stripe_current_period_end` integer;
--> statement-breakpoint
ALTER TABLE `orgs` ADD `billing_period_start` integer;
--> statement-breakpoint
ALTER TABLE `orgs` ADD `billing_period_end` integer;
--> statement-breakpoint
ALTER TABLE `orgs` ADD `receipts_used_this_period` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX `orgs_stripe_subscription_id_key` ON `orgs` (`stripe_subscription_id`);
