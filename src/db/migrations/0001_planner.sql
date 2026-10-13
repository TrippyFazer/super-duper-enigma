CREATE TABLE `ai_cache` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`cache_key` text NOT NULL,
	`date` text NOT NULL,
	`response` text NOT NULL,
	`provider` text,
	`model` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_cache_key_uq` ON `ai_cache` (`cache_key`);--> statement-breakpoint
CREATE TABLE `exercise_sets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_exercise_id` integer NOT NULL,
	`set_index` integer NOT NULL,
	`weight` real,
	`reps` integer,
	`duration_sec` integer,
	`completed` integer DEFAULT false NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`session_exercise_id`) REFERENCES `session_exercises`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `exercise_sets_uq` ON `exercise_sets` (`session_exercise_id`,`set_index`);--> statement-breakpoint
CREATE TABLE `meal_plans` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`source` text DEFAULT 'template' NOT NULL,
	`calorie_target` integer NOT NULL,
	`protein_target` integer NOT NULL,
	`meals` text DEFAULT '[]' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `meal_plans_date_uq` ON `meal_plans` (`date`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`href` text,
	`key` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`read_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notifications_key_uq` ON `notifications` (`key`);--> statement-breakpoint
CREATE TABLE `nutrition_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`meal_type` text DEFAULT 'snack' NOT NULL,
	`name` text NOT NULL,
	`calories` integer DEFAULT 0 NOT NULL,
	`protein` integer DEFAULT 0 NOT NULL,
	`carbs` integer DEFAULT 0 NOT NULL,
	`fat` integer DEFAULT 0 NOT NULL,
	`fiber` integer,
	`source` text DEFAULT 'manual' NOT NULL,
	`recipe_id` integer,
	`plan_meal_index` integer,
	`meal_id` integer,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`meal_id`) REFERENCES `meals`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `nutrition_entries_date_idx` ON `nutrition_entries` (`date`);--> statement-breakpoint
CREATE TABLE `personal_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`exercise_slug` text NOT NULL,
	`exercise_name` text NOT NULL,
	`kind` text NOT NULL,
	`value` real NOT NULL,
	`weight` real,
	`reps` integer,
	`date` text NOT NULL,
	`session_id` integer,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `workout_sessions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `personal_records_uq` ON `personal_records` (`exercise_slug`,`kind`);--> statement-breakpoint
CREATE TABLE `quest_offers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`template_key` text,
	`source` text DEFAULT 'library' NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`domain` text NOT NULL,
	`difficulty` text DEFAULT 'common' NOT NULL,
	`kind` text DEFAULT 'special' NOT NULL,
	`estimated_minutes` integer DEFAULT 20 NOT NULL,
	`xp_reward` integer DEFAULT 30 NOT NULL,
	`status` text DEFAULT 'offered' NOT NULL,
	`date` text NOT NULL,
	`offered_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`accepted_at` text,
	`completed_at` text,
	`declined_at` text,
	`expires_at` text,
	`params` text DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `quest_offers_date_idx` ON `quest_offers` (`date`);--> statement-breakpoint
CREATE INDEX `quest_offers_status_idx` ON `quest_offers` (`status`);--> statement-breakpoint
CREATE TABLE `session_exercises` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` integer NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`order_index` integer DEFAULT 0 NOT NULL,
	`target_sets` integer DEFAULT 3 NOT NULL,
	`target_reps` text DEFAULT '8-12' NOT NULL,
	`rest_seconds` integer DEFAULT 90 NOT NULL,
	`notes` text,
	`status` text DEFAULT 'pending' NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `workout_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `session_exercises_session_idx` ON `session_exercises` (`session_id`);--> statement-breakpoint
CREATE TABLE `workout_plans` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`name` text NOT NULL,
	`focus` text DEFAULT 'full' NOT NULL,
	`goal` text DEFAULT 'general' NOT NULL,
	`estimated_minutes` integer DEFAULT 45 NOT NULL,
	`source` text DEFAULT 'template' NOT NULL,
	`exercises` text DEFAULT '[]' NOT NULL,
	`bonus` text,
	`notes` text,
	`status` text DEFAULT 'planned' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `workout_plans_date_idx` ON `workout_plans` (`date`);--> statement-breakpoint
CREATE TABLE `workout_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`plan_id` integer,
	`date` text NOT NULL,
	`name` text NOT NULL,
	`focus` text DEFAULT 'full' NOT NULL,
	`started_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`finished_at` text,
	`duration_min` integer,
	`status` text DEFAULT 'active' NOT NULL,
	`notes` text,
	`workout_id` integer,
	FOREIGN KEY (`plan_id`) REFERENCES `workout_plans`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`workout_id`) REFERENCES `workouts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `workout_sessions_date_idx` ON `workout_sessions` (`date`);--> statement-breakpoint
ALTER TABLE `profiles` ADD `preferences` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `recipes` ADD `carbs_g` integer;--> statement-breakpoint
ALTER TABLE `recipes` ADD `fat_g` integer;