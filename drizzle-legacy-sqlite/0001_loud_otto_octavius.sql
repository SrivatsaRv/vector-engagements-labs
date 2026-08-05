ALTER TABLE `weapons` ADD `model_profile_id` text NOT NULL;--> statement-breakpoint
ALTER TABLE `weapons` ADD `model_version` text NOT NULL;--> statement-breakpoint
ALTER TABLE `weapons` ADD `model_study_limit_km` real NOT NULL;--> statement-breakpoint
ALTER TABLE `weapons` ADD `model_powered_flight_seconds` real NOT NULL;--> statement-breakpoint
ALTER TABLE `weapons` ADD `model_max_speed_mps` real NOT NULL;--> statement-breakpoint
ALTER TABLE `weapons` ADD `model_turn_g` real NOT NULL;--> statement-breakpoint
ALTER TABLE `weapons` ADD `model_post_burn_loss_mps2` real NOT NULL;--> statement-breakpoint
ALTER TABLE `weapons` ADD `model_rationale` text NOT NULL;