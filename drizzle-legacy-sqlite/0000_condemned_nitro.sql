CREATE TABLE `platform_stations` (
	`id` text PRIMARY KEY NOT NULL,
	`platform_id` text NOT NULL,
	`label` text NOT NULL,
	`station_group` text NOT NULL,
	`max_quantity` integer DEFAULT 1 NOT NULL,
	`data_status` text NOT NULL,
	FOREIGN KEY (`platform_id`) REFERENCES `platform_variants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `platform_variants` (
	`id` text PRIMARY KEY NOT NULL,
	`service` text NOT NULL,
	`country` text NOT NULL,
	`family` text NOT NULL,
	`variant` text NOT NULL,
	`display_name` text NOT NULL,
	`role` text NOT NULL,
	`crew` integer,
	`empty_mass_kg` real,
	`internal_fuel_kg` real,
	`max_takeoff_mass_kg` real,
	`max_published_speed_mach` real,
	`max_published_g` real,
	`engine_id` text,
	`radar_id` text,
	`ew_id` text,
	`datalink_id` text,
	`source_id` text,
	`data_status` text NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `platform_weapon_compatibility` (
	`platform_id` text NOT NULL,
	`weapon_id` text NOT NULL,
	`station_group` text NOT NULL,
	`source_id` text,
	`status` text NOT NULL,
	PRIMARY KEY(`platform_id`, `weapon_id`, `station_group`),
	FOREIGN KEY (`platform_id`) REFERENCES `platform_variants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`weapon_id`) REFERENCES `weapons`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `saved_run_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`scenario_id` text NOT NULL,
	`scenario_version` text NOT NULL,
	`engine_version` text NOT NULL,
	`blue_force` text NOT NULL,
	`red_force` text NOT NULL,
	`initial_state` text NOT NULL,
	`environment` text NOT NULL,
	`model_assumptions` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `source_assertions` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`field_path` text NOT NULL,
	`value_text` text NOT NULL,
	`unit` text,
	`condition_text` text,
	`source_id` text NOT NULL,
	`confidence` real NOT NULL,
	`review_state` text NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sources` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`publisher` text NOT NULL,
	`url` text NOT NULL,
	`published_at` text,
	`source_class` text NOT NULL,
	`notes` text
);
--> statement-breakpoint
CREATE TABLE `subsystems` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`designation` text NOT NULL,
	`manufacturer` text,
	`description` text NOT NULL,
	`source_id` text,
	`data_status` text NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `weapons` (
	`id` text PRIMARY KEY NOT NULL,
	`country` text NOT NULL,
	`family` text NOT NULL,
	`variant` text NOT NULL,
	`display_name` text NOT NULL,
	`category` text NOT NULL,
	`seeker_type` text,
	`guidance_stages` text,
	`launch_support` text NOT NULL,
	`motor_type` text,
	`published_range_km` real,
	`range_condition` text,
	`published_speed_mach` real,
	`source_id` text,
	`data_status` text NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE no action
);
