CREATE TABLE `destinations` (
	`id` text(191) PRIMARY KEY NOT NULL,
	`org_id` text(191) NOT NULL,
	`name` text(191) NOT NULL,
	`status` text DEFAULT 'RUNNING' NOT NULL,
	`type` text NOT NULL,
	`configuration` text NOT NULL,
	`connection_id` text(191),
	`metadata` text,
	`error` text,
	`first_failed_at` integer,
	`last_failed_at` integer,
	`last_synced_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `receipt_sources` (
	`id` text(191) PRIMARY KEY NOT NULL,
	`org_id` text(191) NOT NULL,
	`name` text(191) NOT NULL,
	`type` text NOT NULL,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`configuration` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `receipts` (
	`id` text(191) PRIMARY KEY NOT NULL,
	`org_id` text(191) NOT NULL,
	`receipt_source_id` text(191),
	`status` text DEFAULT 'PENDING' NOT NULL,
	`vendor` text(500),
	`amount` real,
	`currency` text(3),
	`date` integer,
	`category` text,
	`tax_amount` real,
	`subtotal` real,
	`payment_method` text(100),
	`receipt_number` text(191),
	`original_image_url` text(2048),
	`processed_image_url` text(2048),
	`confidence_score` real,
	`extraction_result` text,
	`extraction_error` text(2048),
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `synced_receipts` (
	`id` text(191) PRIMARY KEY NOT NULL,
	`receipt_id` text(191) NOT NULL,
	`destination_id` text(191) NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`external_id` text(191),
	`error` text(2048),
	`retry_count` integer DEFAULT 0 NOT NULL,
	`last_attempt_at` integer,
	`synced_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
/*
 SQLite does not support "Set default to column" out of the box, we do not generate automatic migration for that, so it has to be done manually
 Please refer to: https://www.techonthenet.com/sqlite/tables/alter_table.php
                  https://www.sqlite.org/lang_altertable.html
                  https://stackoverflow.com/questions/2083543/modify-a-columns-type-in-sqlite3

 Due to that we don't generate migration automatically and it has to be done manually
*/--> statement-breakpoint
CREATE INDEX `destinations_org_id_idx` ON `destinations` (`org_id`);--> statement-breakpoint
CREATE INDEX `destinations_status_idx` ON `destinations` (`status`);--> statement-breakpoint
CREATE INDEX `receipt_sources_org_id_idx` ON `receipt_sources` (`org_id`);--> statement-breakpoint
CREATE INDEX `receipts_org_id_idx` ON `receipts` (`org_id`);--> statement-breakpoint
CREATE INDEX `receipts_receipt_source_id_idx` ON `receipts` (`receipt_source_id`);--> statement-breakpoint
CREATE INDEX `receipts_status_idx` ON `receipts` (`status`);--> statement-breakpoint
CREATE INDEX `receipts_date_idx` ON `receipts` (`date`);--> statement-breakpoint
CREATE INDEX `receipts_created_at_idx` ON `receipts` (`created_at`);--> statement-breakpoint
CREATE INDEX `synced_receipts_receipt_id_idx` ON `synced_receipts` (`receipt_id`);--> statement-breakpoint
CREATE INDEX `synced_receipts_destination_id_idx` ON `synced_receipts` (`destination_id`);--> statement-breakpoint
CREATE INDEX `synced_receipts_status_idx` ON `synced_receipts` (`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `synced_receipts_receipt_destination_idx` ON `synced_receipts` (`receipt_id`,`destination_id`);