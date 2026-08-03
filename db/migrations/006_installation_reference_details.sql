ALTER TABLE installations
  ADD COLUMN IF NOT EXISTS icao_code text,
  ADD COLUMN IF NOT EXISTS elevation_ft integer,
  ADD COLUMN IF NOT EXISTS runway_info text;

CREATE UNIQUE INDEX IF NOT EXISTS installations_icao_code_uq
  ON installations (icao_code)
  WHERE icao_code IS NOT NULL;
