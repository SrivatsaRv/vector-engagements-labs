-- Governed public-educational study areas are runtime catalog data, not
-- development seed data. Production deployments apply this forward-only
-- migration and never need to execute the broader fixture seed.
WITH governed_study_areas (
  id, name, short_name, description, terrain_class, surface_elevation_m,
  anchor_longitude, anchor_latitude, west, south, east, north,
  environment_presets, default_environment_preset_id
) AS (
  VALUES
    (
      'north-punjab', 'North Punjab public study area', 'North Punjab',
      'Low-elevation plains used for repeatable air-intercept studies.', 'PLAINS', 260.0,
      74.2, 31.8, 72.6, 30.5, 76.4, 33.4,
      '[{"id":"north-punjab-clear","label":"Clear winter day","description":"Cool, dry air with light westerly wind.","temperatureOffsetC":-4,"windEastMps":-4,"windNorthMps":1,"visibilityKm":25,"humidityPercent":35,"valueState":"MODEL_ASSUMPTION"},{"id":"north-punjab-hot","label":"Hot summer day","description":"Hot low-level air with moderate easterly wind.","temperatureOffsetC":12,"windEastMps":7,"windNorthMps":2,"visibilityKm":14,"humidityPercent":48,"valueState":"MODEL_ASSUMPTION"}]'::jsonb,
      'north-punjab-clear'
    ),
    (
      'rajasthan-desert', 'Rajasthan desert public study area', 'Rajasthan',
      'Hot, dry desert conditions for air and surface-launch studies.', 'DESERT', 230.0,
      72.8, 27.1, 69.7, 24.8, 75.4, 29.8,
      '[{"id":"rajasthan-hot-dry","label":"Hot and dry","description":"High temperature, low humidity, and a moderate crosswind.","temperatureOffsetC":15,"windEastMps":9,"windNorthMps":1,"visibilityKm":18,"humidityPercent":18,"valueState":"MODEL_ASSUMPTION"},{"id":"rajasthan-dust","label":"Dusty crosswind","description":"Reduced visibility with a strong westerly wind.","temperatureOffsetC":10,"windEastMps":-14,"windNorthMps":2,"visibilityKm":6,"humidityPercent":24,"valueState":"MODEL_ASSUMPTION"}]'::jsonb,
      'rajasthan-hot-dry'
    ),
    (
      'ladakh-high-altitude', 'Ladakh high-altitude public study area', 'Ladakh',
      'High terrain and cold, thin air for altitude-sensitive studies.', 'HIGH_MOUNTAIN', 3300.0,
      77.3, 34.1, 75.5, 32.5, 79.6, 35.9,
      '[{"id":"ladakh-cold-clear","label":"Cold and clear","description":"Cold, dry high-altitude air with good visibility.","temperatureOffsetC":-12,"windEastMps":3,"windNorthMps":-4,"visibilityKm":35,"humidityPercent":15,"valueState":"MODEL_ASSUMPTION"},{"id":"ladakh-high-wind","label":"High-altitude wind","description":"Strong upper-level crosswind and cold air.","temperatureOffsetC":-9,"windEastMps":18,"windNorthMps":-7,"visibilityKm":22,"humidityPercent":20,"valueState":"MODEL_ASSUMPTION"}]'::jsonb,
      'ladakh-cold-clear'
    ),
    (
      'north-east-mountains', 'North-east mountain public study area', 'North-east',
      'Mountain and valley context with humid conditions and variable wind.', 'MOUNTAIN', 1450.0,
      92.3, 27.1, 89.8, 25.2, 95.2, 29.4,
      '[{"id":"north-east-humid","label":"Humid mountain day","description":"Humid air, moderate visibility, and light valley wind.","temperatureOffsetC":3,"windEastMps":2,"windNorthMps":5,"visibilityKm":12,"humidityPercent":78,"valueState":"MODEL_ASSUMPTION"},{"id":"north-east-monsoon","label":"Monsoon conditions","description":"Warm humid air, reduced visibility, and stronger wind.","temperatureOffsetC":5,"windEastMps":8,"windNorthMps":10,"visibilityKm":7,"humidityPercent":92,"valueState":"MODEL_ASSUMPTION"}]'::jsonb,
      'north-east-humid'
    ),
    (
      'arabian-sea', 'Arabian Sea public study area', 'Arabian Sea',
      'Maritime airspace for over-water intercept and strike studies.', 'MARITIME', 0.0,
      68.3, 20.8, 63.5, 17.0, 73.2, 24.6,
      '[{"id":"arabian-sea-fair","label":"Fair maritime day","description":"Warm humid marine air with steady wind.","temperatureOffsetC":4,"windEastMps":7,"windNorthMps":3,"visibilityKm":28,"humidityPercent":74,"valueState":"MODEL_ASSUMPTION"},{"id":"arabian-sea-strong-wind","label":"Strong maritime wind","description":"Warm marine air with a strong crosswind.","temperatureOffsetC":3,"windEastMps":16,"windNorthMps":8,"visibilityKm":16,"humidityPercent":82,"valueState":"MODEL_ASSUMPTION"}]'::jsonb,
      'arabian-sea-fair'
    ),
    (
      'coastal-gujarat', 'Coastal Gujarat public study area', 'Coastal Gujarat',
      'Low coastal terrain for surface-strike and air-defence studies.', 'COASTAL', 40.0,
      69.8, 23.1, 67.3, 20.4, 73.2, 25.2,
      '[{"id":"coastal-gujarat-fair","label":"Fair coastal day","description":"Warm air with moderate humidity and a sea breeze.","temperatureOffsetC":5,"windEastMps":6,"windNorthMps":2,"visibilityKm":24,"humidityPercent":62,"valueState":"MODEL_ASSUMPTION"},{"id":"coastal-gujarat-haze","label":"Coastal haze","description":"Warm humid air with reduced visibility.","temperatureOffsetC":7,"windEastMps":4,"windNorthMps":1,"visibilityKm":8,"humidityPercent":78,"valueState":"MODEL_ASSUMPTION"}]'::jsonb,
      'coastal-gujarat-fair'
    )
)
INSERT INTO study_areas (
  id, name, short_name, description, terrain_class, surface_elevation_m,
  anchor, boundary, environment_presets, default_environment_preset_id,
  source_class
)
SELECT
  id, name, short_name, description, terrain_class, surface_elevation_m,
  ST_SetSRID(ST_MakePoint(anchor_longitude, anchor_latitude), 4326),
  ST_MakeEnvelope(west, south, east, north, 4326),
  environment_presets, default_environment_preset_id, 'PUBLIC_EDUCATIONAL'
FROM governed_study_areas
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  short_name = EXCLUDED.short_name,
  description = EXCLUDED.description,
  terrain_class = EXCLUDED.terrain_class,
  surface_elevation_m = EXCLUDED.surface_elevation_m,
  anchor = EXCLUDED.anchor,
  boundary = EXCLUDED.boundary,
  environment_presets = EXCLUDED.environment_presets,
  default_environment_preset_id = EXCLUDED.default_environment_preset_id,
  source_class = EXCLUDED.source_class;
