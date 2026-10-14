CREATE TABLE `day_flags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`key` text NOT NULL,
	`value` text DEFAULT '1' NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `day_flags_date_key_uq` ON `day_flags` (`date`,`key`);--> statement-breakpoint
CREATE TABLE `local_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`provider` text NOT NULL,
	`external_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`category` text DEFAULT 'other' NOT NULL,
	`start_at` text NOT NULL,
	`end_at` text,
	`venue` text,
	`address` text,
	`city` text,
	`lat` real,
	`lng` real,
	`price_min` real,
	`price_max` real,
	`is_free` integer,
	`url` text,
	`source_name` text NOT NULL,
	`fetched_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `local_events_ext_uq` ON `local_events` (`provider`,`external_id`);--> statement-breakpoint
CREATE INDEX `local_events_start_idx` ON `local_events` (`start_at`);--> statement-breakpoint
ALTER TABLE `grocery_weeks` ADD `days` integer DEFAULT 7 NOT NULL;--> statement-breakpoint
ALTER TABLE `grocery_weeks` ADD `kind` text DEFAULT 'week' NOT NULL;--> statement-breakpoint
ALTER TABLE `quest_offers` ADD `event_id` integer;--> statement-breakpoint
ALTER TABLE `quest_offers` ADD `category` text;--> statement-breakpoint
ALTER TABLE `quest_offers` ADD `venue` text;--> statement-breakpoint
ALTER TABLE `quest_offers` ADD `start_at` text;--> statement-breakpoint
ALTER TABLE `quest_offers` ADD `end_at` text;--> statement-breakpoint
ALTER TABLE `quest_offers` ADD `price_label` text;--> statement-breakpoint
ALTER TABLE `quest_offers` ADD `distance_mi` real;--> statement-breakpoint
ALTER TABLE `quest_offers` ADD `source_name` text;--> statement-breakpoint
ALTER TABLE `quest_offers` ADD `source_url` text;--> statement-breakpoint
ALTER TABLE `quest_offers` ADD `why` text;--> statement-breakpoint
ALTER TABLE `quest_offers` ADD `feedback` text;--> statement-breakpoint
ALTER TABLE `quest_offers` ADD `follow_up` text;