ALTER TABLE `grocery_items` ADD `required_servings` real;--> statement-breakpoint
ALTER TABLE `grocery_items` ADD `on_hand_servings` real;--> statement-breakpoint
ALTER TABLE `grocery_items` ADD `coverage` text;--> statement-breakpoint
ALTER TABLE `grocery_items` ADD `canonical` text;--> statement-breakpoint
ALTER TABLE `grocery_items` ADD `substituted_from` text;--> statement-breakpoint
ALTER TABLE `grocery_items` ADD `used_in_counts` text;--> statement-breakpoint
ALTER TABLE `pantry_items` ADD `family` text;--> statement-breakpoint
ALTER TABLE `pantry_items` ADD `variant` text;--> statement-breakpoint
ALTER TABLE `pantry_items` ADD `product` text;