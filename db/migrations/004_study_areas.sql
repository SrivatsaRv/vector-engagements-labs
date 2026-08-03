CREATE TABLE IF NOT EXISTS study_areas (
  id text PRIMARY KEY,
  name text NOT NULL,
  short_name text NOT NULL,
  description text NOT NULL,
  terrain_class text NOT NULL,
  surface_elevation_m double precision NOT NULL,
  anchor geometry(Point, 4326) NOT NULL,
  boundary geometry(Polygon, 4326) NOT NULL,
  environment_presets jsonb NOT NULL,
  default_environment_preset_id text NOT NULL,
  source_class text NOT NULL CHECK (source_class = 'PUBLIC_EDUCATIONAL')
);

CREATE INDEX IF NOT EXISTS study_areas_anchor_gix
  ON study_areas USING gist(anchor);

CREATE INDEX IF NOT EXISTS study_areas_boundary_gix
  ON study_areas USING gist(boundary);

ALTER TABLE scenario_templates
  ADD COLUMN IF NOT EXISTS study_area_id text REFERENCES study_areas(id);

ALTER TABLE saved_run_snapshots
  ADD COLUMN IF NOT EXISTS study_area_id text REFERENCES study_areas(id),
  ADD COLUMN IF NOT EXISTS spatial_context jsonb;
