CREATE TABLE `connections` (
	`id` text(191) PRIMARY KEY NOT NULL,
	`org_id` text(191) NOT NULL,
	`type` text NOT NULL,
	`access_token` text(512) NOT NULL,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`metadata` text,
	`error` text,
	`first_failed_at` integer,
	`last_failed_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `connections_org_id_idx` ON `connections` (`org_id`);
--> statement-breakpoint
CREATE INDEX `connections_type_idx` ON `connections` (`type`);
--> statement-breakpoint
CREATE INDEX `connections_status_idx` ON `connections` (`status`);
