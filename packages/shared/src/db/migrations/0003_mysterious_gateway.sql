ALTER TABLE receipts ADD `image_hash` text(64);--> statement-breakpoint
CREATE INDEX `receipts_image_hash_idx` ON `receipts` (`image_hash`);