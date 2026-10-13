CREATE TABLE `grocery_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`week_id` integer NOT NULL,
	`name` text NOT NULL,
	`category` text DEFAULT 'other' NOT NULL,
	`qty` real DEFAULT 1 NOT NULL,
	`unit` text DEFAULT 'each' NOT NULL,
	`est_price` real,
	`actual_qty` real,
	`actual_price` real,
	`purchased` integer DEFAULT false NOT NULL,
	`skipped` integer DEFAULT false NOT NULL,
	`used_in` text DEFAULT '[]' NOT NULL,
	`covered_by_pantry` integer DEFAULT false NOT NULL,
	`note` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`week_id`) REFERENCES `grocery_weeks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `grocery_items_week_idx` ON `grocery_items` (`week_id`);--> statement-breakpoint
CREATE TABLE `grocery_weeks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`week_start` text NOT NULL,
	`budget` real DEFAULT 80 NOT NULL,
	`budget_mode` text DEFAULT 'balanced' NOT NULL,
	`calorie_target` integer NOT NULL,
	`protein_target` integer NOT NULL,
	`meals_needed` text DEFAULT '{}' NOT NULL,
	`prefs` text DEFAULT '{}' NOT NULL,
	`status` text DEFAULT 'planning' NOT NULL,
	`source` text DEFAULT 'template' NOT NULL,
	`estimated_cost` real,
	`actual_cost` real,
	`summary` text DEFAULT '{}' NOT NULL,
	`shopped_at` text,
	`reviewed_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `grocery_weeks_start_uq` ON `grocery_weeks` (`week_start`);--> statement-breakpoint
CREATE TABLE `health_samples` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`value` real NOT NULL,
	`unit` text DEFAULT '' NOT NULL,
	`start_at` text NOT NULL,
	`end_at` text NOT NULL,
	`source_name` text DEFAULT 'unknown' NOT NULL,
	`source_bundle` text,
	`device` text,
	`uuid` text NOT NULL,
	`metadata` text DEFAULT '{}' NOT NULL,
	`ingested_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `health_samples_uuid_uq` ON `health_samples` (`uuid`);--> statement-breakpoint
CREATE INDEX `health_samples_type_start_idx` ON `health_samples` (`type`,`start_at`);--> statement-breakpoint
CREATE TABLE `health_workouts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`activity_type` text NOT NULL,
	`start_at` text NOT NULL,
	`end_at` text NOT NULL,
	`duration_min` integer NOT NULL,
	`active_energy_kcal` real,
	`distance_km` real,
	`source_name` text DEFAULT 'unknown' NOT NULL,
	`date` text NOT NULL,
	`workout_id` integer,
	`status` text DEFAULT 'pending' NOT NULL,
	`suggested_workout_id` integer,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`workout_id`) REFERENCES `workouts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `health_workouts_uuid_uq` ON `health_workouts` (`uuid`);--> statement-breakpoint
CREATE INDEX `health_workouts_date_idx` ON `health_workouts` (`date`);--> statement-breakpoint
CREATE TABLE `meal_prep_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`week_id` integer,
	`date` text NOT NULL,
	`items` text DEFAULT '[]' NOT NULL,
	`estimated_minutes` integer DEFAULT 60 NOT NULL,
	`supports` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'planned' NOT NULL,
	`completed_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`week_id`) REFERENCES `grocery_weeks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `meal_prep_week_idx` ON `meal_prep_sessions` (`week_id`);--> statement-breakpoint
CREATE TABLE `motivation_reasons` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`text` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `pantry_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`qty` real,
	`unit` text DEFAULT 'each' NOT NULL,
	`level` text,
	`purchased_at` text,
	`expires_at` text,
	`source` text DEFAULT 'manual' NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pantry_items_name_uq` ON `pantry_items` (`name`);--> statement-breakpoint
CREATE TABLE `planned_meals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`slot` integer DEFAULT 0 NOT NULL,
	`meal_type` text DEFAULT 'dinner' NOT NULL,
	`name` text NOT NULL,
	`calories` integer DEFAULT 0 NOT NULL,
	`protein` integer DEFAULT 0 NOT NULL,
	`carbs` integer DEFAULT 0 NOT NULL,
	`fat` integer DEFAULT 0 NOT NULL,
	`ingredients` text DEFAULT '[]' NOT NULL,
	`recipe_id` integer,
	`notes` text,
	`prep_minutes` integer,
	`source` text DEFAULT 'template' NOT NULL,
	`status` text DEFAULT 'planned' NOT NULL,
	`week_id` integer,
	`nutrition_entry_id` integer,
	`replaced_by_id` integer,
	`status_changed_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `planned_meals_date_idx` ON `planned_meals` (`date`);--> statement-breakpoint
CREATE INDEX `planned_meals_week_idx` ON `planned_meals` (`week_id`);--> statement-breakpoint
CREATE TABLE `saved_foods` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`brand` text,
	`serving_desc` text,
	`calories` integer NOT NULL,
	`protein` integer DEFAULT 0 NOT NULL,
	`carbs` integer DEFAULT 0 NOT NULL,
	`fat` integer DEFAULT 0 NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`is_estimate` integer DEFAULT false NOT NULL,
	`use_count` integer DEFAULT 0 NOT NULL,
	`last_used_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `saved_foods_name_idx` ON `saved_foods` (`name`);--> statement-breakpoint
ALTER TABLE `nutrition_entries` ADD `planned_meal_id` integer;--> statement-breakpoint
ALTER TABLE `nutrition_entries` ADD `saved_food_id` integer;--> statement-breakpoint
ALTER TABLE `nutrition_entries` ADD `is_estimate` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `nutrition_entries` ADD `venue` text;--> statement-breakpoint
ALTER TABLE `workout_sessions` ADD `paused_at` text;--> statement-breakpoint
ALTER TABLE `workout_sessions` ADD `paused_sec` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `xp_events` ADD `source_type` text;--> statement-breakpoint
ALTER TABLE `xp_events` ADD `source_id` text;--> statement-breakpoint
ALTER TABLE `xp_events` ADD `voided_at` text;--> statement-breakpoint
ALTER TABLE `xp_events` ADD `void_reason` text;--> statement-breakpoint
CREATE INDEX `xp_events_source_idx` ON `xp_events` (`source_type`,`source_id`);