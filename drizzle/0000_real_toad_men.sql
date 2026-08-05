CREATE TABLE "compiled_model_packs" (
	"id" text NOT NULL,
	"version" text NOT NULL,
	"schema_version" text NOT NULL,
	"source_id" text NOT NULL,
	"source_version" text NOT NULL,
	"source_hash" text NOT NULL,
	"digest" text NOT NULL,
	"payload" jsonb NOT NULL,
	"credibility_manifest_id" text NOT NULL,
	"credibility_manifest_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "compiled_model_packs_id_version_pk" PRIMARY KEY("id","version")
);
--> statement-breakpoint
CREATE TABLE "credibility_manifests" (
	"id" text NOT NULL,
	"version" text NOT NULL,
	"schema_version" text NOT NULL,
	"subject_kind" text NOT NULL,
	"subject_id" text NOT NULL,
	"subject_digest" text NOT NULL,
	"manifest" jsonb NOT NULL,
	"content_hash" text NOT NULL,
	"approval_state" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credibility_manifests_id_version_pk" PRIMARY KEY("id","version")
);
--> statement-breakpoint
CREATE TABLE "installations" (
	"id" text PRIMARY KEY NOT NULL,
	"service" text NOT NULL,
	"name" text NOT NULL,
	"icao_code" text,
	"elevation_ft" integer,
	"runway_info" text,
	"installation_type" text NOT NULL,
	"location" geometry(Point,4326) NOT NULL,
	"public_reference" boolean DEFAULT true NOT NULL,
	"source_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "intended_use_contracts" (
	"id" text NOT NULL,
	"version" text NOT NULL,
	"schema_version" text NOT NULL,
	"definition" jsonb NOT NULL,
	"content_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "intended_use_contracts_id_version_pk" PRIMARY KEY("id","version")
);
--> statement-breakpoint
CREATE TABLE "model_pack_sources" (
	"id" text NOT NULL,
	"version" text NOT NULL,
	"schema_version" text NOT NULL,
	"definition" jsonb NOT NULL,
	"content_hash" text NOT NULL,
	"lifecycle_status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "model_pack_sources_id_version_pk" PRIMARY KEY("id","version")
);
--> statement-breakpoint
CREATE TABLE "platform_variants" (
	"id" text PRIMARY KEY NOT NULL,
	"service" text NOT NULL,
	"country" text NOT NULL,
	"family" text NOT NULL,
	"variant" text NOT NULL,
	"display_name" text NOT NULL,
	"role" text NOT NULL,
	"crew" integer,
	"engine_ids" jsonb NOT NULL,
	"radar_id" text,
	"ew_id" text,
	"datalink_id" text,
	"rwr_id" text,
	"countermeasure_id" text,
	"domains" jsonb NOT NULL,
	"default_loadout" jsonb NOT NULL,
	"source_ids" jsonb NOT NULL,
	"data_status" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_weapon_compatibility" (
	"platform_id" text NOT NULL,
	"weapon_id" text NOT NULL,
	"station_group" text NOT NULL,
	"source_ids" jsonb NOT NULL,
	"status" text NOT NULL,
	CONSTRAINT "platform_weapon_compatibility_platform_id_weapon_id_station_group_pk" PRIMARY KEY("platform_id","weapon_id","station_group")
);
--> statement-breakpoint
CREATE TABLE "saved_run_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"scenario_id" text NOT NULL,
	"scenario_version" text NOT NULL,
	"engine_version" text NOT NULL,
	"intended_use_id" text NOT NULL,
	"intended_use_version" text NOT NULL,
	"model_pack_id" text NOT NULL,
	"model_pack_version" text NOT NULL,
	"model_pack_digest" text NOT NULL,
	"scenario_schema_version" text NOT NULL,
	"scenario_content_hash" text NOT NULL,
	"compiled_scenario" jsonb NOT NULL,
	"frame_hash" text NOT NULL,
	"draft_revision" integer NOT NULL,
	"blue_force" jsonb NOT NULL,
	"red_force" jsonb NOT NULL,
	"initial_state" jsonb NOT NULL,
	"environment" jsonb NOT NULL,
	"model_assumptions" jsonb NOT NULL,
	"study_area_id" text,
	"spatial_context" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scenario_templates" (
	"id" text NOT NULL,
	"version" text NOT NULL,
	"domain" text NOT NULL,
	"title" text NOT NULL,
	"status" text NOT NULL,
	"package" jsonb NOT NULL,
	"schema_version" text NOT NULL,
	"content_hash" text NOT NULL,
	"engine_version" text NOT NULL,
	"intended_use_id" text NOT NULL,
	"intended_use_version" text NOT NULL,
	"model_pack_id" text NOT NULL,
	"model_pack_version" text NOT NULL,
	"model_pack_digest" text NOT NULL,
	"study_area_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scenario_templates_id_version_pk" PRIMARY KEY("id","version")
);
--> statement-breakpoint
CREATE TABLE "simulation_models" (
	"id" text PRIMARY KEY NOT NULL,
	"weapon_id" text NOT NULL,
	"version" text NOT NULL,
	"domains" jsonb NOT NULL,
	"propulsion_kind" text NOT NULL,
	"launch_mass_kg" double precision NOT NULL,
	"dry_mass_kg" double precision NOT NULL,
	"powered_flight_seconds" double precision NOT NULL,
	"thrust_newtons" double precision NOT NULL,
	"thrust_taper_speed_mps" double precision NOT NULL,
	"reference_area_m2" double precision NOT NULL,
	"drag_coefficient" double precision NOT NULL,
	"navigation_constant" double precision NOT NULL,
	"maximum_command_g" double precision NOT NULL,
	"seeker_activation_range_m" double precision NOT NULL,
	"datalink_update_seconds" double precision NOT NULL,
	"value_state" text NOT NULL,
	"rationale" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_assertions" (
	"id" text PRIMARY KEY NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"field_path" text NOT NULL,
	"value_text" text NOT NULL,
	"unit" text,
	"condition_text" text,
	"source_id" text NOT NULL,
	"confidence" double precision NOT NULL,
	"review_state" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"publisher" text NOT NULL,
	"url" text NOT NULL,
	"published_at" timestamp with time zone,
	"source_class" text NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "study_areas" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"short_name" text NOT NULL,
	"description" text NOT NULL,
	"terrain_class" text NOT NULL,
	"surface_elevation_m" double precision NOT NULL,
	"anchor" geometry(Point,4326) NOT NULL,
	"boundary" geometry(Polygon,4326) NOT NULL,
	"environment_presets" jsonb NOT NULL,
	"default_environment_preset_id" text NOT NULL,
	"source_class" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subsystems" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"designation" text NOT NULL,
	"manufacturer" text,
	"description" text NOT NULL,
	"source_ids" jsonb NOT NULL,
	"data_status" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weapons" (
	"id" text PRIMARY KEY NOT NULL,
	"country" text NOT NULL,
	"family" text NOT NULL,
	"variant" text NOT NULL,
	"display_name" text NOT NULL,
	"category" text NOT NULL,
	"domains" jsonb NOT NULL,
	"seeker_type" text,
	"guidance_stages" jsonb NOT NULL,
	"launch_support" text NOT NULL,
	"published_range_km" double precision,
	"range_condition" text,
	"published_speed_mach" double precision,
	"source_ids" jsonb NOT NULL,
	"data_status" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "installations" ADD CONSTRAINT "installations_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_weapon_compatibility" ADD CONSTRAINT "platform_weapon_compatibility_platform_id_platform_variants_id_fk" FOREIGN KEY ("platform_id") REFERENCES "public"."platform_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_weapon_compatibility" ADD CONSTRAINT "platform_weapon_compatibility_weapon_id_weapons_id_fk" FOREIGN KEY ("weapon_id") REFERENCES "public"."weapons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_run_snapshots" ADD CONSTRAINT "saved_run_snapshots_study_area_id_study_areas_id_fk" FOREIGN KEY ("study_area_id") REFERENCES "public"."study_areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenario_templates" ADD CONSTRAINT "scenario_templates_study_area_id_study_areas_id_fk" FOREIGN KEY ("study_area_id") REFERENCES "public"."study_areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "simulation_models" ADD CONSTRAINT "simulation_models_weapon_id_weapons_id_fk" FOREIGN KEY ("weapon_id") REFERENCES "public"."weapons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_assertions" ADD CONSTRAINT "source_assertions_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "compiled_model_packs_digest_idx" ON "compiled_model_packs" USING btree ("digest");--> statement-breakpoint
CREATE INDEX "installations_location_gix" ON "installations" USING gist ("location");--> statement-breakpoint
CREATE INDEX "study_areas_anchor_gix" ON "study_areas" USING gist ("anchor");--> statement-breakpoint
CREATE INDEX "study_areas_boundary_gix" ON "study_areas" USING gist ("boundary");