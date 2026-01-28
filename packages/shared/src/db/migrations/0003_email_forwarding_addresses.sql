CREATE TABLE `email_forwarding_addresses` (
	`id` text(191) PRIMARY KEY NOT NULL,
	`org_id` text(191) NOT NULL,
	`address_code` text(32) NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`label` text(191),
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `email_forwarding_addresses_org_id_idx` ON `email_forwarding_addresses` (`org_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `email_forwarding_addresses_code_idx` ON `email_forwarding_addresses` (`address_code`);
