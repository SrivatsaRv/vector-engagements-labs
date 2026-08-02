CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS sources (
  id text PRIMARY KEY,
  title text NOT NULL,
  publisher text NOT NULL,
  url text NOT NULL,
  published_at timestamptz,
  source_class text NOT NULL CHECK (source_class IN ('OFFICIAL','MANUFACTURER','SECONDARY','USER')),
  notes text
);

CREATE TABLE IF NOT EXISTS subsystems (
  id text PRIMARY KEY,
  kind text NOT NULL,
  designation text NOT NULL,
  manufacturer text,
  description text NOT NULL,
  source_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  data_status text NOT NULL
);

CREATE TABLE IF NOT EXISTS platform_variants (
  id text PRIMARY KEY,
  service text NOT NULL,
  country text NOT NULL,
  family text NOT NULL,
  variant text NOT NULL,
  display_name text NOT NULL,
  role text NOT NULL,
  crew integer,
  engine_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  radar_id text,
  ew_id text,
  datalink_id text,
  rwr_id text,
  countermeasure_id text,
  domains jsonb NOT NULL DEFAULT '[]'::jsonb,
  default_loadout jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  data_status text NOT NULL
);

CREATE TABLE IF NOT EXISTS weapons (
  id text PRIMARY KEY,
  country text NOT NULL,
  family text NOT NULL,
  variant text NOT NULL,
  display_name text NOT NULL,
  category text NOT NULL,
  domains jsonb NOT NULL DEFAULT '[]'::jsonb,
  seeker_type text,
  guidance_stages jsonb NOT NULL DEFAULT '[]'::jsonb,
  launch_support text NOT NULL,
  published_range_km double precision,
  range_condition text,
  published_speed_mach double precision,
  source_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  data_status text NOT NULL
);

CREATE TABLE IF NOT EXISTS simulation_models (
  id text PRIMARY KEY,
  weapon_id text NOT NULL REFERENCES weapons(id),
  version text NOT NULL,
  domains jsonb NOT NULL,
  propulsion_kind text NOT NULL,
  launch_mass_kg double precision NOT NULL CHECK (launch_mass_kg > 0),
  dry_mass_kg double precision NOT NULL CHECK (dry_mass_kg > 0 AND dry_mass_kg <= launch_mass_kg),
  powered_flight_seconds double precision NOT NULL CHECK (powered_flight_seconds >= 0),
  thrust_newtons double precision NOT NULL CHECK (thrust_newtons >= 0),
  thrust_taper_speed_mps double precision NOT NULL CHECK (thrust_taper_speed_mps > 0),
  reference_area_m2 double precision NOT NULL CHECK (reference_area_m2 > 0),
  drag_coefficient double precision NOT NULL CHECK (drag_coefficient > 0),
  navigation_constant double precision NOT NULL CHECK (navigation_constant > 0),
  maximum_command_g double precision NOT NULL CHECK (maximum_command_g > 0),
  seeker_activation_range_m double precision NOT NULL CHECK (seeker_activation_range_m >= 0),
  datalink_update_seconds double precision NOT NULL CHECK (datalink_update_seconds > 0),
  value_state text NOT NULL,
  rationale text NOT NULL,
  UNIQUE (weapon_id, version)
);

CREATE TABLE IF NOT EXISTS platform_weapon_compatibility (
  platform_id text NOT NULL REFERENCES platform_variants(id),
  weapon_id text NOT NULL REFERENCES weapons(id),
  station_group text NOT NULL,
  source_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL,
  PRIMARY KEY (platform_id, weapon_id, station_group)
);

CREATE TABLE IF NOT EXISTS source_assertions (
  id text PRIMARY KEY,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  field_path text NOT NULL,
  value_text text NOT NULL,
  unit text,
  condition_text text,
  source_id text NOT NULL REFERENCES sources(id),
  confidence double precision NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  review_state text NOT NULL
);

CREATE INDEX IF NOT EXISTS source_assertions_entity_idx
  ON source_assertions(entity_type, entity_id);

CREATE TABLE IF NOT EXISTS installations (
  id text PRIMARY KEY,
  service text NOT NULL CHECK (service IN ('IAF','PAF')),
  name text NOT NULL,
  installation_type text NOT NULL,
  location geometry(Point, 4326) NOT NULL,
  public_reference boolean NOT NULL DEFAULT true,
  source_id text NOT NULL REFERENCES sources(id)
);

CREATE INDEX IF NOT EXISTS installations_location_gix
  ON installations USING gist(location);

CREATE TABLE IF NOT EXISTS scenario_templates (
  id text NOT NULL,
  version text NOT NULL,
  domain text NOT NULL CHECK (domain IN ('A2A','A2G','G2A','G2G')),
  title text NOT NULL,
  status text NOT NULL CHECK (status IN ('DRAFT','VALIDATED','RETIRED')),
  package jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, version)
);

CREATE TABLE IF NOT EXISTS saved_run_snapshots (
  id text PRIMARY KEY,
  scenario_id text NOT NULL,
  scenario_version text NOT NULL,
  engine_version text NOT NULL,
  blue_force jsonb NOT NULL,
  red_force jsonb NOT NULL,
  initial_state jsonb NOT NULL,
  environment jsonb NOT NULL,
  model_assumptions jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS saved_runs_created_idx
  ON saved_run_snapshots(created_at DESC);
