CREATE TABLE `character_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`domain` text,
	`key` text,
	`occurred_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `character_events_key_uq` ON `character_events` (`key`);--> statement-breakpoint
CREATE TABLE `daily_activity` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`steps` integer,
	`active_minutes` integer,
	`activity_score` integer,
	`source` text DEFAULT 'manual' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `daily_activity_date_uq` ON `daily_activity` (`date`);--> statement-breakpoint
CREATE TABLE `financial_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`net_worth` real,
	`liquid_savings` real,
	`monthly_expenses` real,
	`monthly_income` real,
	`savings_rate_pct` real,
	`high_interest_debt` real,
	`total_debt` real,
	`retirement_balance` real,
	`invests_monthly` integer DEFAULT false NOT NULL,
	`notes` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `financial_snapshots_date_idx` ON `financial_snapshots` (`date`);--> statement-breakpoint
CREATE TABLE `habit_completions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`habit_id` integer NOT NULL,
	`date` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`habit_id`) REFERENCES `habits`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `habit_completions_uq` ON `habit_completions` (`habit_id`,`date`);--> statement-breakpoint
CREATE TABLE `habits` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`icon` text,
	`schedule_type` text DEFAULT 'daily' NOT NULL,
	`weekdays` text DEFAULT '[1,2,3,4,5]' NOT NULL,
	`times_per_week` integer DEFAULT 3 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`archived_at` text
);
--> statement-breakpoint
CREATE TABLE `integrations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`provider` text NOT NULL,
	`auth_type` text DEFAULT 'personal_token' NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`expires_at` text,
	`last_sync_at` text,
	`last_sync_status` text,
	`last_error` text,
	`enabled` integer DEFAULT false NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `integrations_provider_unique` ON `integrations` (`provider`);--> statement-breakpoint
CREATE TABLE `meals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`meal_type` text DEFAULT 'dinner' NOT NULL,
	`recipe_id` integer,
	`name` text NOT NULL,
	`is_new_recipe` integer DEFAULT false NOT NULL,
	`quality_tags` text DEFAULT '[]' NOT NULL,
	`notes` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `meals_date_idx` ON `meals` (`date`);--> statement-breakpoint
CREATE TABLE `profiles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text DEFAULT 'Adventurer' NOT NULL,
	`equipped_title` text,
	`age` integer,
	`sex` text,
	`height_cm` real,
	`weight_kg` real,
	`timezone` text DEFAULT 'UTC' NOT NULL,
	`active_domains` text DEFAULT '["fitness","sleep","cooking","wealth","skincare","sobriety","habits"]' NOT NULL,
	`targets` text DEFAULT '{}' NOT NULL,
	`baseline` text DEFAULT '{}' NOT NULL,
	`goals` text,
	`onboarding_completed_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `quests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`template_key` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`domain` text NOT NULL,
	`target` real DEFAULT 1 NOT NULL,
	`reward_xp` integer DEFAULT 10 NOT NULL,
	`period_start` text NOT NULL,
	`period_end` text NOT NULL,
	`progress` real DEFAULT 0 NOT NULL,
	`completed_at` text,
	`params` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `quests_period_uq` ON `quests` (`template_key`,`period_start`);--> statement-breakpoint
CREATE TABLE `rank_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`domain` text NOT NULL,
	`rank` text NOT NULL,
	`score` real NOT NULL,
	`level` integer,
	`date` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `rank_history_domain_idx` ON `rank_history` (`domain`,`date`);--> statement-breakpoint
CREATE TABLE `recipes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`ingredients` text DEFAULT '[]' NOT NULL,
	`steps` text DEFAULT '[]' NOT NULL,
	`meal_type` text DEFAULT 'dinner' NOT NULL,
	`prep_time_min` integer DEFAULT 10 NOT NULL,
	`cook_time_min` integer DEFAULT 20 NOT NULL,
	`difficulty` text DEFAULT 'easy' NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`servings` integer DEFAULT 2 NOT NULL,
	`protein_g` integer,
	`calories` integer,
	`is_favorite` integer DEFAULT false NOT NULL,
	`is_saved` integer DEFAULT false NOT NULL,
	`source` text DEFAULT 'builtin' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recipes_slug_unique` ON `recipes` (`slug`);--> statement-breakpoint
CREATE TABLE `routine_completions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`routine_id` integer NOT NULL,
	`date` text NOT NULL,
	`steps_completed` text DEFAULT '[]' NOT NULL,
	`complete` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`routine_id`) REFERENCES `routines`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `routine_completions_uq` ON `routine_completions` (`routine_id`,`date`);--> statement-breakpoint
CREATE TABLE `routines` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`time_of_day` text NOT NULL,
	`steps` text DEFAULT '[]' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `score_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`domain` text NOT NULL,
	`score` real NOT NULL,
	`rank` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `score_snapshots_uq` ON `score_snapshots` (`date`,`domain`);--> statement-breakpoint
CREATE TABLE `sleep_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`total_sleep_min` integer NOT NULL,
	`bedtime_start` text,
	`bedtime_end` text,
	`efficiency` integer,
	`latency_min` integer,
	`sleep_score` integer,
	`readiness_score` integer,
	`resting_hr` real,
	`hrv` real,
	`quality` integer,
	`notes` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sleep_entries_date_uq` ON `sleep_entries` (`date`);--> statement-breakpoint
CREATE TABLE `sobriety_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tracker_id` integer NOT NULL,
	`started_at` text NOT NULL,
	`ended_at` text,
	`note` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`tracker_id`) REFERENCES `sobriety_trackers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sobriety_runs_tracker_idx` ON `sobriety_runs` (`tracker_id`);--> statement-breakpoint
CREATE TABLE `sobriety_trackers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`category` text DEFAULT 'custom' NOT NULL,
	`icon` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `user_achievements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key` text NOT NULL,
	`unlocked_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`seen` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_achievements_key_uq` ON `user_achievements` (`key`);--> statement-breakpoint
CREATE TABLE `workouts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`type` text NOT NULL,
	`duration_min` integer DEFAULT 45 NOT NULL,
	`intensity` integer DEFAULT 2 NOT NULL,
	`notes` text,
	`source` text DEFAULT 'manual' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `workouts_date_idx` ON `workouts` (`date`);--> statement-breakpoint
CREATE TABLE `xp_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`amount` integer NOT NULL,
	`domain` text NOT NULL,
	`key` text NOT NULL,
	`description` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `xp_events_key_uq` ON `xp_events` (`key`);--> statement-breakpoint
CREATE INDEX `xp_events_date_idx` ON `xp_events` (`date`);