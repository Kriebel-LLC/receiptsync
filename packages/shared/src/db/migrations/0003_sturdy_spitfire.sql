CREATE TABLE `export_jobs` (
	`id` text(191) PRIMARY KEY NOT NULL,
	`org_id` text(191) NOT NULL,
	`user_id` text(191) NOT NULL,
	`format` text NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`configuration` text NOT NULL,
	`receipt_count` integer,
	`download_url` text(2048),
	`expires_at` integer,
	`error` text(2048),
	`notification_email` text(191),
	`email_sent` integer DEFAULT false,
	`completed_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `export_jobs_org_id_idx` ON `export_jobs` (`org_id`);--> statement-breakpoint
CREATE INDEX `export_jobs_user_id_idx` ON `export_jobs` (`user_id`);--> statement-breakpoint
CREATE INDEX `export_jobs_status_idx` ON `export_jobs` (`status`);