#![deny(unsafe_code)]
#![deny(clippy::expect_used, clippy::panic, clippy::unwrap_used)]

mod error;
mod model_pack;
mod public_aircraft_reference;
mod simulation_events;
mod validation;
mod wasm_abi;

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

pub use error::EngineError;
pub use model_pack::{
    validate_compiled_model_pack_v2_json, validate_model_pack_json, CompiledModelPack,
    CompiledModelPackV2Identity,
};
pub use public_aircraft_reference::{
    run_public_aircraft_reference, run_public_aircraft_reference_json,
    PublicAircraftReferenceInput, PublicAircraftReferenceRun,
};
use simulation_events::{SimulationEventDraft, SimulationEventJournal, SimulationEventReceipt};
pub use simulation_events::{SimulationEventStream, SimulationEventV2};
pub use validation::{
    validate_scenario, MAX_ENTITIES, MAX_EVENTS, MAX_INPUT_BYTES, MAX_INTEGRATED_STEPS,
    MAX_RECORDED_ENTITY_STATES, MAX_ROUTE_POINTS_PER_ENTITY,
};

const G0: f64 = 9.80665;

#[derive(Clone, Copy, Debug, Default, Deserialize, PartialEq, Serialize)]
pub struct Vec3 {
    pub x: f64,
    pub y: f64,
    pub z: f64,
}

impl Vec3 {
    fn add(self, other: Self) -> Self {
        Self {
            x: self.x + other.x,
            y: self.y + other.y,
            z: self.z + other.z,
        }
    }
    fn subtract(self, other: Self) -> Self {
        Self {
            x: self.x - other.x,
            y: self.y - other.y,
            z: self.z - other.z,
        }
    }
    fn scale(self, factor: f64) -> Self {
        Self {
            x: self.x * factor,
            y: self.y * factor,
            z: self.z * factor,
        }
    }
    fn dot(self, other: Self) -> f64 {
        self.x * other.x + self.y * other.y + self.z * other.z
    }
    fn cross(self, other: Self) -> Self {
        Self {
            x: self.y * other.z - self.z * other.y,
            y: self.z * other.x - self.x * other.z,
            z: self.x * other.y - self.y * other.x,
        }
    }
    fn magnitude(self) -> f64 {
        (self.x * self.x + self.y * self.y + self.z * self.z).sqrt()
    }
    fn normalize(self) -> Self {
        let length = self.magnitude();
        if length > 1e-9 {
            self.scale(1.0 / length)
        } else {
            Self {
                x: 1.0,
                y: 0.0,
                z: 0.0,
            }
        }
    }
    fn clamp_magnitude(self, maximum: f64) -> Self {
        let length = self.magnitude();
        if length > maximum {
            self.scale(maximum / length)
        } else {
            self
        }
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub enum EngagementDomain {
    #[serde(rename = "A2A")]
    AirToAir,
    #[serde(rename = "A2G")]
    AirToGround,
    #[serde(rename = "G2A")]
    GroundToAir,
    #[serde(rename = "G2G")]
    GroundToGround,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub enum Affiliation {
    #[serde(rename = "BLUE")]
    Blue,
    #[serde(rename = "RED")]
    Red,
    #[serde(rename = "NEUTRAL")]
    Neutral,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub enum EntityKind {
    #[serde(rename = "AIRCRAFT")]
    Aircraft,
    #[serde(rename = "GUIDED_WEAPON")]
    GuidedWeapon,
    #[serde(rename = "AIR_DEFENCE_SYSTEM")]
    AirDefenceSystem,
    #[serde(rename = "RADAR")]
    Radar,
    #[serde(rename = "SURFACE_LAUNCHER")]
    SurfaceLauncher,
    #[serde(rename = "BASE")]
    Base,
    #[serde(rename = "FIXED_OBJECTIVE")]
    FixedObjective,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub enum EntityLifecycle {
    #[serde(rename = "STOWED")]
    Stowed,
    #[serde(rename = "ACTIVE")]
    Active,
    #[serde(rename = "TRACKING")]
    Tracking,
    #[serde(rename = "ENGAGING")]
    Engaging,
    #[serde(rename = "TERMINATED")]
    Terminated,
}

/// Achieved propulsion/guidance stage. Seeker and support state are not
/// emitted until the typed #26/#28 information interface is admitted.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
pub enum WeaponFlightState {
    #[serde(rename = "STOWED")]
    Stowed,
    #[serde(rename = "BOOST")]
    Boost,
    #[serde(rename = "COAST")]
    Coast,
    #[serde(rename = "TERMINAL_GUIDANCE")]
    TerminalGuidance,
    #[serde(rename = "TARGET_UNAVAILABLE")]
    TargetUnavailable,
}

/// Closed model-pack declaration. It does not claim a simulated seeker.
#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub enum WeaponSeekerMode {
    #[serde(rename = "UNAVAILABLE")]
    Unavailable,
    #[serde(rename = "ACTIVE_RADAR")]
    ActiveRadar,
    #[serde(rename = "INFRARED")]
    Infrared,
    #[serde(rename = "PASSIVE_RADIATION")]
    PassiveRadiation,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub enum WeaponSupportRequirement {
    #[serde(rename = "UNAVAILABLE")]
    Unavailable,
    #[serde(rename = "NONE")]
    None,
    #[serde(rename = "TRACK_UPDATE")]
    TrackUpdate,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub enum WeaponLaunchAuthorization {
    #[serde(rename = "SCHEDULED_TEST_ONLY")]
    ScheduledTestOnly,
    #[serde(rename = "TRACK_REQUIRED")]
    TrackRequired,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Guidance {
    Direct,
    Loft,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub enum ModelValueState {
    #[serde(rename = "SOURCED")]
    Sourced,
    #[serde(rename = "MODEL_ASSUMPTION")]
    ModelAssumption,
    #[serde(rename = "USER_PROVIDED")]
    UserProvided,
    #[serde(rename = "UNKNOWN")]
    Unknown,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub enum AtmosphereModel {
    #[serde(rename = "NASA_EDUCATIONAL_STANDARD")]
    NasaEducationalStandard,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub enum EngineEventType {
    #[serde(rename = "WIND_SHIFT")]
    WindShift,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
pub enum CoverageKind {
    #[serde(rename = "DETECTION")]
    Detection,
    #[serde(rename = "TRACKING")]
    Tracking,
    #[serde(rename = "ENGAGEMENT")]
    Engagement,
    #[serde(rename = "MINIMUM_RANGE")]
    MinimumRange,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
pub enum EngineBackend {
    #[serde(rename = "rust-wasm")]
    RustWasm,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
pub enum Termination {
    #[serde(rename = "threshold_reached")]
    ThresholdReached,
    #[serde(rename = "energy_depleted")]
    EnergyDepleted,
    #[serde(rename = "target_unavailable")]
    TargetUnavailable,
    #[serde(rename = "time_limit")]
    TimeLimit,
    #[serde(rename = "invalid_scenario")]
    InvalidScenario,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InitialState {
    pub position: Vec3,
    pub velocity: Vec3,
    pub heading_rad: f64,
    pub mass_kg: f64,
    pub fuel_kg: f64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WeaponModel {
    pub launch_platform_id: String,
    pub target_entity_id: String,
    pub guidance: Guidance,
    pub launch_time_seconds: Option<f64>,
    pub burn_seconds: f64,
    pub launch_mass_kg: f64,
    pub dry_mass_kg: f64,
    pub thrust_newtons: f64,
    pub thrust_taper_speed_mps: f64,
    pub reference_area_m2: f64,
    pub drag_coefficient: f64,
    pub navigation_constant: f64,
    pub maximum_command_g: f64,
    pub seeker_activation_range_m: f64,
    pub datalink_update_seconds: f64,
    pub commanded_cruise_altitude_m: f64,
    pub admission: WeaponAdmission,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WeaponAdmission {
    pub model_pack_digest: String,
    pub weapon_model_id: String,
    pub station_id: String,
    pub compatibility_rule_id: String,
    pub seeker_mode: WeaponSeekerMode,
    pub support_requirement: WeaponSupportRequirement,
    pub launch_authorization: WeaponLaunchAuthorization,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SensorModel {
    pub detection_radius_m: f64,
    pub tracking_radius_m: f64,
    pub engagement_radius_m: f64,
    pub minimum_range_m: f64,
    pub minimum_altitude_m: f64,
    pub maximum_altitude_m: f64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AircraftModel {
    pub empty_mass_kg: f64,
    pub fuel_capacity_kg: f64,
    pub reference_area_m2: f64,
    pub zero_lift_drag_by_mach: Table1d,
    pub induced_drag_by_angle_of_attack_rad: Table1d,
    pub thrust_by_throttle: Table1d,
    pub fuel_flow_by_throttle: Table1d,
    pub maximum_command_g: f64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Table1d {
    pub id: String,
    pub axis: Vec<f64>,
    pub values: Vec<f64>,
}

fn interpolate_table(table: &Table1d, input: f64) -> Result<f64, EngineError> {
    if !input.is_finite() || table.axis.len() < 2 || table.axis.len() != table.values.len() {
        return Err(EngineError::InvalidScenario(format!(
            "invalid admitted table {}",
            table.id
        )));
    }
    let first_axis = table.axis[0];
    let last_axis = table.axis[table.axis.len() - 1];
    if input < first_axis || input > last_axis {
        return Err(EngineError::InvalidScenario(format!(
            "input {input} is outside admitted table {} coverage",
            table.id
        )));
    }
    for index in 0..table.axis.len() {
        if !table.axis[index].is_finite() || !table.values[index].is_finite() {
            return Err(EngineError::InvalidScenario(format!(
                "invalid admitted table {}",
                table.id
            )));
        }
        if index == 0 {
            continue;
        }
        if table.axis[index].partial_cmp(&table.axis[index - 1])
            != Some(std::cmp::Ordering::Greater)
        {
            return Err(EngineError::InvalidScenario(format!(
                "invalid admitted table {}",
                table.id
            )));
        }
        if input <= table.axis[index] {
            let fraction =
                (input - table.axis[index - 1]) / (table.axis[index] - table.axis[index - 1]);
            return Ok(table.values[index - 1]
                + (table.values[index] - table.values[index - 1]) * fraction);
        }
    }
    Ok(table.values[table.values.len() - 1])
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Provenance {
    pub source_object_id: String,
    pub model_id: String,
    pub model_version: String,
    pub model_pack_digest: String,
    pub value_state: ModelValueState,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IntendedUseRef {
    pub id: String,
    pub version: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PatchProvenance {
    pub author_id: String,
    pub authored_at: String,
    pub evidence_ref_ids: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScenarioModelPatch {
    pub schema_version: String,
    pub id: String,
    pub model_pack_digest: String,
    pub model_id: String,
    pub field_path: String,
    pub old_value: f64,
    pub new_value: f64,
    pub unit: String,
    pub reason: String,
    pub provenance: PatchProvenance,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ModelPackBinding {
    pub schema_version: String,
    pub id: String,
    pub version: String,
    pub digest: String,
    pub intended_use: IntendedUseRef,
    #[serde(default)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub runtime_digest: Option<String>,
    #[serde(default)]
    pub observer_sensors: Vec<ObserverSensorBinding>,
    pub scenario_patches: Vec<ScenarioModelPatch>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ObserverSensorBinding {
    pub model_id: String,
    pub model_version: String,
    pub evidence_ref_ids: Vec<String>,
    pub sensor_kind: String,
    pub detection_range_m: f64,
    pub minimum_range_m: f64,
    pub scan_period_s: f64,
    pub azimuth_field_of_view_rad: f64,
    pub elevation_field_of_view_rad: f64,
    #[serde(default)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub verification_track_model: Option<ObserverTrackModel>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EntityDefinition {
    pub id: String,
    pub rddf_id: String,
    pub designation: String,
    pub callsign: String,
    pub affiliation: Affiliation,
    pub kind: EntityKind,
    pub symbol_role: String,
    pub lifecycle: EntityLifecycle,
    #[serde(default)]
    pub route: Vec<Vec3>,
    #[serde(default)]
    pub route_plan: Option<RoutePlan>,
    pub initial: InitialState,
    pub weapon: Option<WeaponModel>,
    pub sensor: Option<SensorModel>,
    #[serde(default)]
    pub observer_sensor: Option<ObserverSensorAdmission>,
    pub aircraft: Option<AircraftModel>,
    pub provenance: Provenance,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ObserverSensorAdmission {
    pub schema_version: String,
    pub model_pack_digest: String,
    pub model_id: String,
    pub model_version: String,
    pub evidence_ref_ids: Vec<String>,
    pub sensor_kind: String,
    pub mode: String,
    pub detection_range_m: f64,
    pub minimum_range_m: f64,
    pub scan_period_s: f64,
    pub azimuth_field_of_view_rad: f64,
    pub elevation_field_of_view_rad: f64,
    #[serde(default)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub verification_track_model: Option<ObserverTrackModel>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ObservationWindow {
    pub start: f64,
    pub end: f64,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ObserverTrackModel {
    pub schema_version: String,
    pub value_state: String,
    pub intended_use: String,
    pub position_bias_m: Vec3,
    pub velocity_bias_mps: Vec3,
    pub position_standard_deviation_m: Vec3,
    pub velocity_standard_deviation_mps: Vec3,
    pub confirmation_observations: u64,
    pub maximum_observation_age_seconds: f64,
    pub coast_after_seconds: f64,
    pub lost_after_seconds: f64,
    pub observation_windows_seconds: Vec<ObservationWindow>,
}

pub(crate) fn valid_verification_track_model(model: &ObserverTrackModel) -> bool {
    let finite = |value: Vec3| value.x.is_finite() && value.y.is_finite() && value.z.is_finite();
    let positive = |value: Vec3| finite(value) && value.x > 0.0 && value.y > 0.0 && value.z > 0.0;
    let windows_valid = !model.observation_windows_seconds.is_empty()
        && model
            .observation_windows_seconds
            .iter()
            .enumerate()
            .all(|(index, window)| {
                window.start.is_finite()
                    && window.end.is_finite()
                    && window.start >= 0.0
                    && window.end >= window.start
                    && (index == 0
                        || window.start > model.observation_windows_seconds[index - 1].end)
            });
    model.schema_version == "vector.generic-track-model.v1"
        && model.value_state == "TEST_FIXTURE"
        && model.intended_use == "ENGINE_VERIFICATION_ONLY"
        && finite(model.position_bias_m)
        && finite(model.velocity_bias_mps)
        && positive(model.position_standard_deviation_m)
        && positive(model.velocity_standard_deviation_mps)
        && model.confirmation_observations >= 2
        && model.maximum_observation_age_seconds.is_finite()
        && model.maximum_observation_age_seconds >= 0.0
        && model.coast_after_seconds.is_finite()
        && model.coast_after_seconds > 0.0
        && model.lost_after_seconds.is_finite()
        && model.lost_after_seconds > model.coast_after_seconds
        && windows_valid
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RoutePlan {
    pub schema_version: String,
    pub waypoint_acceptance_radii_m: Vec<f64>,
    #[serde(default)]
    pub waypoint_transitions: Option<Vec<String>>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StudyAreaAnchor {
    pub longitude: f64,
    pub latitude: f64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StudyArea {
    pub id: String,
    pub name: String,
    pub terrain_class: String,
    pub surface_elevation_m: f64,
    pub anchor: StudyAreaAnchor,
    pub bounds: [[f64; 2]; 2],
    pub weather_preset_id: String,
}

/// Immutable environment identity. The complete canonical Phase A or regional
/// pack is retained in the TypeScript/VSR geospatial artifact; Rust admits this
/// exact compact binding and must not resolve study-area strings at runtime.
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentPackBinding {
    pub schema_version: String,
    pub id: String,
    pub version: String,
    pub digest: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeTerrainGrid {
    pub west_deg: f64,
    pub south_deg: f64,
    pub longitude_step_deg: f64,
    pub latitude_step_deg: f64,
    pub columns: usize,
    pub rows: usize,
    pub surface_elevation_msl_m: Vec<f64>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeAtmosphereGrid {
    pub interval_seconds: f64,
    pub sample_count: usize,
    pub west_deg: f64,
    pub south_deg: f64,
    pub longitude_step_deg: f64,
    pub latitude_step_deg: f64,
    pub columns: usize,
    pub rows: usize,
    pub temperature_c: Vec<f64>,
    pub surface_pressure_kpa: Vec<f64>,
    pub relative_humidity_percent: Vec<f64>,
    pub wind_east_mps: Vec<f64>,
    pub wind_north_mps: Vec<f64>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeGrid<T> {
    pub id: String,
    pub version: String,
    pub digest: String,
    pub grid: T,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeDatasetIdentity {
    pub id: String,
    pub version: String,
    pub digest: String,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthoredEnvironmentModifiers {
    pub temperature_offset_c: f64,
    pub wind_east_mps: f64,
    pub wind_north_mps: f64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeEnvironmentProjection {
    pub schema_version: String,
    pub environment_pack: RuntimeDatasetIdentity,
    pub anchor: StudyAreaAnchor,
    pub terrain: RuntimeGrid<RuntimeTerrainGrid>,
    pub atmosphere: RuntimeGrid<RuntimeAtmosphereGrid>,
    pub authored_modifiers: AuthoredEnvironmentModifiers,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Environment {
    pub gravity_mps2: f64,
    pub temperature_offset_c: f64,
    pub wind_mps: Vec3,
    pub atmosphere: AtmosphereModel,
    pub environment_pack: EnvironmentPackBinding,
    #[serde(default)]
    pub runtime_environment: Option<RuntimeEnvironmentProjection>,
    pub study_area: StudyArea,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Completion {
    pub distance_meters: f64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineEvent {
    pub id: String,
    #[serde(rename = "type")]
    pub event_type: EngineEventType,
    pub start_seconds: f64,
    pub duration_seconds: f64,
    pub vector_mps: Vec3,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineScenario {
    pub id: String,
    pub version: String,
    pub domain: EngagementDomain,
    pub name: String,
    pub seed: u64,
    pub duration_seconds: f64,
    pub fixed_step_seconds: f64,
    pub model_pack: ModelPackBinding,
    pub entities: Vec<EntityDefinition>,
    pub environment: Environment,
    pub completion: Completion,
    pub events: Vec<EngineEvent>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AircraftControlFrame {
    pub route_point_index: Option<usize>,
    pub requested_velocity_mps: Vec3,
    pub requested_steering_acceleration_mps2: Vec3,
    pub accepted_steering_acceleration_mps2: Vec3,
    pub achieved_velocity_mps: Vec3,
    pub limiter: AircraftControlLimiter,
}

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum AircraftControlLimiter {
    LoadFactor,
    None,
    RouteComplete,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EntityFrame {
    pub id: String,
    pub rddf_id: String,
    pub designation: String,
    pub callsign: String,
    pub affiliation: Affiliation,
    pub kind: EntityKind,
    pub symbol_role: String,
    pub lifecycle: EntityLifecycle,
    pub position: Vec3,
    pub velocity: Vec3,
    pub speed_mps: f64,
    pub heading_rad: f64,
    pub mass_kg: f64,
    pub fuel_kg: f64,
    pub mach: f64,
    pub specific_energy_jkg: f64,
    pub drag_newtons: f64,
    pub thrust_newtons: f64,
    pub commanded_g: f64,
    pub available_g: f64,
    pub store_mass_kg: f64,
    pub installed_store_ids: Vec<String>,
    pub phase: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub weapon_flight_state: Option<WeaponFlightState>,
    pub value_state: ModelValueState,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub aircraft_control: Option<AircraftControlFrame>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineFrame {
    pub t: f64,
    pub entities: Vec<EntityFrame>,
    pub primary_weapon_id: String,
    pub primary_target_id: String,
    pub separation_m: f64,
    pub closure_rate_mps: f64,
    pub line_of_sight_rate_rad_s: f64,
    pub observer_states: Vec<ObserverState>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackSourceIdentity {
    pub model_pack_digest: String,
    pub sensor_model_id: String,
    pub sensor_model_version: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackEstimate {
    pub value_state: &'static str,
    pub position_m: Vec3,
    pub velocity_mps: Vec3,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackUncertainty {
    pub value_state: &'static str,
    pub position_standard_deviation_m: Vec3,
    pub velocity_standard_deviation_mps: Vec3,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineObservation {
    pub schema_version: &'static str,
    pub id: String,
    pub owner: &'static str,
    pub source_association_id: String,
    pub source: TrackSourceIdentity,
    pub source_sequence: u64,
    pub source_time_seconds: f64,
    pub estimate: TrackEstimate,
    pub uncertainty: TrackUncertainty,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineTrack {
    pub schema_version: &'static str,
    pub track_id: String,
    pub owner: &'static str,
    pub source_association_id: String,
    pub source: TrackSourceIdentity,
    pub source_sequence: u64,
    pub source_time_seconds: f64,
    pub state: &'static str,
    pub estimate: TrackEstimate,
    pub uncertainty: TrackUncertainty,
    pub update_count: u64,
    pub age_seconds: f64,
    pub fresh_until_seconds: f64,
    pub expires_at_seconds: f64,
}

#[derive(Clone, Debug)]
pub struct TrackTransitionCommit {
    pub local_key: String,
    pub track_id: String,
    pub owner: &'static str,
    pub from: &'static str,
    pub to: &'static str,
    pub cause: &'static str,
    pub source_association_id: String,
    pub source: TrackSourceIdentity,
    pub source_sequence: u64,
    pub source_time_seconds: f64,
    pub observation_id: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ObserverState {
    pub schema_version: &'static str,
    pub perspective: &'static str,
    pub sensor_state: &'static str,
    pub observation_count: u16,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub track_state: Option<&'static str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub visible: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub availability_reason: Option<&'static str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub track_count: Option<u16>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub visible_track_count: Option<u16>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scan_reason: Option<&'static str>,
    pub effect_scope: &'static str,
    pub state_explanation: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sensor_model_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub observations: Option<Vec<EngineObservation>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tracks: Option<Vec<EngineTrack>>,
}

#[derive(Clone)]
struct TrackStore {
    owner: &'static str,
    source: TrackSourceIdentity,
    model: ObserverTrackModel,
    tracks: Vec<EngineTrack>,
    last_update_time_seconds: f64,
}

impl TrackStore {
    fn new(
        owner: &'static str,
        source: TrackSourceIdentity,
        model: &ObserverTrackModel,
    ) -> Result<Self, EngineError> {
        let valid_digest = source.model_pack_digest.len() == 64
            && source
                .model_pack_digest
                .bytes()
                .all(|value| value.is_ascii_hexdigit() && !value.is_ascii_uppercase());
        if !matches!(owner, "IAF" | "PAF")
            || !valid_digest
            || source.sensor_model_id.is_empty()
            || source.sensor_model_version.is_empty()
        {
            return Err(EngineError::InvalidScenario(
                "TrackStore owner or source identity is invalid".to_string(),
            ));
        }
        Ok(Self {
            owner,
            source,
            model: model.clone(),
            tracks: Vec::new(),
            last_update_time_seconds: f64::NEG_INFINITY,
        })
    }

    fn track_id(&self, association_id: &str) -> String {
        format!(
            "{}-TRACK-{}",
            self.owner,
            association_id.rsplit('-').next().unwrap_or_default()
        )
    }

    fn transition(
        &mut self,
        from: &'static str,
        to: &'static str,
        cause: &'static str,
        track: &EngineTrack,
        observation_id: Option<&str>,
    ) -> TrackTransitionCommit {
        TrackTransitionCommit {
            local_key: format!(
                "track:{}:{:08}:{}",
                track.track_id, track.source_sequence, to
            ),
            track_id: track.track_id.clone(),
            owner: self.owner,
            from,
            to,
            cause,
            source_association_id: track.source_association_id.clone(),
            source: track.source.clone(),
            source_sequence: track.source_sequence,
            source_time_seconds: track.source_time_seconds,
            observation_id: observation_id.map(str::to_string),
        }
    }

    fn validate_observation(
        &self,
        time: f64,
        observation: &EngineObservation,
    ) -> Result<(), EngineError> {
        let association_prefix = format!("{}-SOURCE-", self.owner);
        let suffix = observation
            .source_association_id
            .strip_prefix(&association_prefix);
        let valid_association = suffix.is_some_and(|value| {
            (4..=8).contains(&value.len()) && value.bytes().all(|byte| byte.is_ascii_digit())
        });
        let finite =
            |value: Vec3| value.x.is_finite() && value.y.is_finite() && value.z.is_finite();
        let positive =
            |value: Vec3| finite(value) && value.x > 0.0 && value.y > 0.0 && value.z > 0.0;
        if observation.schema_version != "vector.observation.v1"
            || observation.id.is_empty()
            || observation.owner != self.owner
            || !valid_association
            || observation.source.model_pack_digest != self.source.model_pack_digest
            || observation.source.sensor_model_id != self.source.sensor_model_id
            || observation.source.sensor_model_version != self.source.sensor_model_version
            || observation.source_sequence < 1
            || !observation.source_time_seconds.is_finite()
            || observation.source_time_seconds < 0.0
            || observation.source_time_seconds > time
            || time - observation.source_time_seconds > self.model.maximum_observation_age_seconds
            || !finite(observation.estimate.position_m)
            || !finite(observation.estimate.velocity_mps)
            || !positive(observation.uncertainty.position_standard_deviation_m)
            || !positive(observation.uncertainty.velocity_standard_deviation_mps)
        {
            return Err(EngineError::InvalidScenario(
                "TrackStore observation is invalid or does not match its admitted source"
                    .to_string(),
            ));
        }
        if let Some(prior) = self
            .tracks
            .iter()
            .find(|track| track.source_association_id == observation.source_association_id)
        {
            if observation.source_sequence <= prior.source_sequence
                || observation.source_time_seconds <= prior.source_time_seconds
            {
                return Err(EngineError::InvalidScenario(
                    "TrackStore observation is duplicate, stale, or out of order".to_string(),
                ));
            }
        }
        Ok(())
    }

    fn update(
        &mut self,
        time: f64,
        observations: Vec<EngineObservation>,
    ) -> Result<(Vec<EngineTrack>, Vec<TrackTransitionCommit>), EngineError> {
        if !time.is_finite() || time < 0.0 || time < self.last_update_time_seconds {
            return Err(EngineError::InvalidScenario(
                "TrackStore model time is invalid".to_string(),
            ));
        }
        for observation in &observations {
            self.validate_observation(time, observation)?;
        }
        let mut batch_associations = observations
            .iter()
            .map(|observation| observation.source_association_id.clone())
            .collect::<Vec<_>>();
        batch_associations.sort();
        if batch_associations.windows(2).any(|pair| pair[0] == pair[1]) {
            return Err(EngineError::InvalidScenario(
                "TrackStore batch repeats a source association".to_string(),
            ));
        }
        let mut transitions = Vec::new();
        for observation in observations {
            let observation_id = observation.id.clone();
            let previous_track = self
                .tracks
                .iter()
                .find(|track| track.source_association_id == observation.source_association_id)
                .cloned();
            let previous = previous_track.as_ref().map_or("NONE", |track| track.state);
            let previous_count = if previous == "LOST" {
                0
            } else {
                previous_track
                    .as_ref()
                    .map_or(0, |track| track.update_count)
            };
            let update_count = previous_count + 1;
            let state = if previous == "COASTING" {
                "CONFIRMED"
            } else if previous == "LOST" || previous == "NONE" {
                "TENTATIVE"
            } else if update_count >= self.model.confirmation_observations {
                "CONFIRMED"
            } else {
                "TENTATIVE"
            };
            let track = EngineTrack {
                schema_version: "vector.track.v1",
                track_id: self.track_id(&observation.source_association_id),
                owner: self.owner,
                source_association_id: observation.source_association_id.clone(),
                source: observation.source.clone(),
                source_sequence: observation.source_sequence,
                source_time_seconds: observation.source_time_seconds,
                state,
                estimate: observation.estimate.clone(),
                uncertainty: observation.uncertainty.clone(),
                update_count,
                age_seconds: time - observation.source_time_seconds,
                fresh_until_seconds: observation.source_time_seconds
                    + self.model.coast_after_seconds,
                expires_at_seconds: observation.source_time_seconds + self.model.lost_after_seconds,
            };
            if let Some(index) = self
                .tracks
                .iter()
                .position(|item| item.source_association_id == observation.source_association_id)
            {
                self.tracks[index] = track.clone();
            } else {
                self.tracks.push(track.clone());
            }
            if previous == "NONE" {
                transitions.push(self.transition(
                    previous,
                    state,
                    "INITIAL_OBSERVATION",
                    &track,
                    Some(&observation_id),
                ));
            } else if previous == "LOST" || previous == "COASTING" {
                transitions.push(self.transition(
                    previous,
                    state,
                    "OBSERVATION_REACQUIRED",
                    &track,
                    Some(&observation_id),
                ));
            } else if previous == "TENTATIVE" && state == "CONFIRMED" {
                transitions.push(self.transition(
                    previous,
                    state,
                    "CONFIRMATION_THRESHOLD_MET",
                    &track,
                    Some(&observation_id),
                ));
            }
        }
        let mut associations = self
            .tracks
            .iter()
            .map(|track| track.source_association_id.clone())
            .collect::<Vec<_>>();
        associations.sort();
        for association_id in associations {
            if batch_associations.binary_search(&association_id).is_ok() {
                continue;
            }
            let Some(index) = self
                .tracks
                .iter()
                .position(|track| track.source_association_id == association_id)
            else {
                continue;
            };
            let mut track = self.tracks[index].clone();
            let age = time - track.source_time_seconds;
            let previous = track.state;
            let state = if previous != "LOST" && age > self.model.lost_after_seconds {
                "LOST"
            } else if previous == "CONFIRMED" && age > self.model.coast_after_seconds {
                "COASTING"
            } else if previous == "TENTATIVE" && age > self.model.coast_after_seconds {
                "LOST"
            } else {
                previous
            };
            track.state = state;
            track.age_seconds = age;
            self.tracks[index] = track.clone();
            if state != previous {
                let cause = if state == "COASTING" {
                    "FRESHNESS_EXPIRED"
                } else {
                    "TRACK_EXPIRED"
                };
                transitions.push(self.transition(previous, state, cause, &track, None));
            }
        }
        transitions.sort_by(|left, right| {
            left.track_id
                .cmp(&right.track_id)
                .then(left.local_key.cmp(&right.local_key))
        });
        self.last_update_time_seconds = time;
        let mut tracks = self.tracks.clone();
        tracks.sort_by(|left, right| left.track_id.cmp(&right.track_id));
        Ok((tracks, transitions))
    }
}

struct ObserverTickResult {
    state: ObserverState,
    sensor_entity_id: Option<String>,
    transitions: Vec<TrackTransitionCommit>,
}

fn unavailable_observer_state(
    perspective: &'static str,
    explanation: &'static str,
) -> ObserverState {
    ObserverState {
        schema_version: "vector.observer-state.v2",
        perspective,
        sensor_state: "UNSUPPORTED",
        observation_count: 0,
        track_state: Some("UNSUPPORTED"),
        visible: Some(false),
        availability_reason: Some("SENSOR_MODEL_UNAVAILABLE"),
        track_count: None,
        visible_track_count: None,
        scan_reason: None,
        effect_scope: "AIR_PICTURE_ONLY",
        state_explanation: explanation,
        sensor_model_id: None,
        observations: None,
        tracks: None,
    }
}

fn observer_states(
    states: &[RuntimeState],
    scenario: &EngineScenario,
    time: f64,
    dt: f64,
    track_stores: &mut HashMap<&'static str, TrackStore>,
) -> Vec<ObserverTickResult> {
    if scenario.domain != EngagementDomain::AirToAir {
        return Vec::new();
    }
    [("IAF", Affiliation::Blue), ("PAF", Affiliation::Red)]
        .into_iter()
        .map(|(perspective, affiliation)| {
            let observer = states.iter().filter(|state| {
                state.definition.affiliation == affiliation
                    && state.definition.kind == EntityKind::Aircraft
                    && state.lifecycle == EntityLifecycle::Active
                    && state.definition.observer_sensor.is_some()
            }).min_by(|left, right| left.definition.id.cmp(&right.definition.id));
            let mut target_candidates = states.iter().filter(|state| {
                state.definition.affiliation != affiliation
                    && state.definition.kind == EntityKind::Aircraft
            }).collect::<Vec<_>>();
            target_candidates.sort_by(|left, right| left.definition.id.cmp(&right.definition.id));
            let Some(observer) = observer else {
                return ObserverTickResult { state: unavailable_observer_state(perspective, "No admitted sensor model pack is bound to this run."), sensor_entity_id: None, transitions: Vec::new() };
            };
            let Some(sensor) = observer.definition.observer_sensor.as_ref() else {
                return ObserverTickResult { state: unavailable_observer_state(perspective, "No admitted sensor model pack is bound to this run."), sensor_entity_id: None, transitions: Vec::new() };
            };
            let valid = matches!(sensor.schema_version.as_str(), "vector.observer-sensor-admission.v1" | "vector.observer-sensor-admission.v2")
                && sensor.model_pack_digest == scenario.model_pack.digest
                && !sensor.model_id.is_empty()
                && !sensor.model_version.is_empty()
                && !sensor.evidence_ref_ids.is_empty()
                && matches!(sensor.sensor_kind.as_str(), "RADAR" | "INFRARED" | "VISUAL")
                && matches!(sensor.mode.as_str(), "OFF" | "SEARCH")
                && sensor.detection_range_m.is_finite() && sensor.detection_range_m > 0.0
                && sensor.minimum_range_m.is_finite() && sensor.minimum_range_m >= 0.0
                && sensor.minimum_range_m <= sensor.detection_range_m
                && sensor.scan_period_s.is_finite() && sensor.scan_period_s > 0.0
                && sensor.azimuth_field_of_view_rad.is_finite() && sensor.azimuth_field_of_view_rad > 0.0 && sensor.azimuth_field_of_view_rad <= std::f64::consts::TAU
                && sensor.elevation_field_of_view_rad.is_finite() && sensor.elevation_field_of_view_rad > 0.0 && sensor.elevation_field_of_view_rad <= std::f64::consts::PI;
            if !valid {
                return ObserverTickResult { state: unavailable_observer_state(perspective, "The admitted sensor inputs are incomplete or inconsistent with the compiled model pack."), sensor_entity_id: None, transitions: Vec::new() };
            }
            let sensor_model_id = Some(sensor.model_id.clone());
            if sensor.mode == "OFF" {
                return ObserverTickResult { state: ObserverState {
                    schema_version: "vector.observer-state.v2",
                    perspective,
                    sensor_state: "OFF",
                    observation_count: 0,
                    track_state: Some("NONE"),
                    visible: Some(false),
                    availability_reason: Some("SENSOR_OFF"),
                    track_count: None,
                    visible_track_count: None,
                    scan_reason: None,
                    effect_scope: "AIR_PICTURE_ONLY",
                    state_explanation: "The admitted sensor is off. No observation or track is emitted.",
                    sensor_model_id,
                    observations: None,
                    tracks: None,
                }, sensor_entity_id: Some(observer.definition.id.clone()), transitions: Vec::new() };
            }
            let source = TrackSourceIdentity {
                model_pack_digest: sensor.model_pack_digest.clone(),
                sensor_model_id: sensor.model_id.clone(),
                sensor_model_version: sensor.model_version.clone(),
            };
            if let Some(model) = sensor.verification_track_model.as_ref() {
                if !track_stores.contains_key(perspective) {
                    let Ok(store) = TrackStore::new(perspective, source.clone(), model) else {
                        return ObserverTickResult { state: unavailable_observer_state(perspective, "The admitted verification TrackStore source is invalid."), sensor_entity_id: None, transitions: Vec::new() };
                    };
                    track_stores.insert(perspective, store);
                }
            }
            let tracked = |store: &mut TrackStore,
                           reason: &'static str,
                           explanation: &'static str,
                           observations: Vec<EngineObservation>| {
                let observation_count = observations.len() as u16;
                let Ok((tracks, transitions)) = store.update(time, observations.clone()) else {
                    return ObserverTickResult { state: unavailable_observer_state(perspective, "The admitted verification TrackStore rejected its observation boundary."), sensor_entity_id: None, transitions: Vec::new() };
                };
                ObserverTickResult {
                    state: ObserverState {
                        schema_version: "vector.observer-state.v3",
                        perspective,
                        sensor_state: "SEARCH",
                        observation_count,
                        track_state: None,
                        visible: None,
                        availability_reason: None,
                        track_count: Some(tracks.len() as u16),
                        visible_track_count: Some(tracks.iter().filter(|track| matches!(track.state, "CONFIRMED" | "COASTING")).count() as u16),
                        scan_reason: Some(reason),
                        effect_scope: "AIR_PICTURE_ONLY",
                        state_explanation: explanation,
                        sensor_model_id: Some(sensor.model_id.clone()),
                        observations: Some(observations),
                        tracks: Some(tracks),
                    },
                    sensor_entity_id: Some(observer.definition.id.clone()),
                    transitions,
                }
            };
            let due = (time / sensor.scan_period_s - (time / sensor.scan_period_s).round()).abs()
                <= dt / sensor.scan_period_s / 2.0 + 1e-9;
            if !due {
                if let Some(store) = track_stores.get_mut(perspective) {
                    return tracked(store, "SCAN_NOT_DUE", "No admitted scan is due at this model time.", Vec::new());
                }
                return ObserverTickResult { state: ObserverState {
                    schema_version: "vector.observer-state.v2",
                    perspective,
                    sensor_state: "SEARCH",
                    observation_count: 0,
                    track_state: Some("NONE"),
                    visible: Some(false),
                    availability_reason: Some("SCAN_NOT_DUE"),
                    track_count: None,
                    visible_track_count: None,
                    scan_reason: None,
                    effect_scope: "AIR_PICTURE_ONLY",
                    state_explanation: "No admitted scan is due at this model time.",
                    sensor_model_id,
                    observations: None,
                    tracks: None,
                }, sensor_entity_id: Some(observer.definition.id.clone()), transitions: Vec::new() };
            }
            let forward = Vec3 { x: observer.heading_rad.cos(), y: observer.heading_rad.sin(), z: 0.0 };
            let verification_window_open = sensor.verification_track_model.as_ref().is_none_or(|model| {
                model.observation_windows_seconds.iter().any(|window| time >= window.start && time <= window.end)
            });
            let detected_targets = target_candidates.iter().enumerate().filter(|(_, target)| {
                if target.lifecycle != EntityLifecycle::Active {
                    return false;
                }
                let relative = target.position.subtract(observer.position);
                let range = relative.magnitude();
                let horizontal = (relative.x * relative.x + relative.y * relative.y).sqrt();
                let azimuth = if horizontal > 0.0 {
                    ((relative.x * forward.x + relative.y * forward.y) / horizontal).clamp(-1.0, 1.0).acos()
                } else { 0.0 };
                let elevation = if range > 0.0 { (relative.z / range).clamp(-1.0, 1.0).asin() } else { 0.0 };
                verification_window_open && range >= sensor.minimum_range_m && range <= sensor.detection_range_m
                    && azimuth <= sensor.azimuth_field_of_view_rad / 2.0
                    && elevation.abs() <= sensor.elevation_field_of_view_rad / 2.0
            }).collect::<Vec<_>>();
            if detected_targets.is_empty() {
                if let Some(store) = track_stores.get_mut(perspective) {
                    return tracked(store, "TARGET_OUTSIDE_ADMITTED_SENSOR_VOLUME", "The due verification scan produced no observations.", Vec::new());
                }
                return ObserverTickResult { state: ObserverState {
                    schema_version: "vector.observer-state.v2",
                    perspective,
                    sensor_state: "SEARCH",
                    observation_count: 0,
                    track_state: Some("NONE"),
                    visible: Some(false),
                    availability_reason: Some("TARGET_OUTSIDE_ADMITTED_SENSOR_VOLUME"),
                    track_count: None,
                    visible_track_count: None,
                    scan_reason: None,
                    effect_scope: "AIR_PICTURE_ONLY",
                    state_explanation: "The opposing aircraft is outside the admitted range or field of view at the due scan.",
                    sensor_model_id,
                    observations: None,
                    tracks: None,
                }, sensor_entity_id: Some(observer.definition.id.clone()), transitions: Vec::new() };
            }
            if let Some(model) = sensor.verification_track_model.as_ref() {
                let stable = |value: f64| (value * 1_000_000.0).round() / 1_000_000.0;
                let observations = detected_targets.into_iter().map(|(target_index, target)| EngineObservation {
                        schema_version: "vector.observation.v1",
                        id: format!("{perspective}-OBS-{:04}-{:08}", target_index + 1, (time / sensor.scan_period_s).round() as u64 + 1),
                        owner: perspective,
                        source_association_id: format!("{perspective}-SOURCE-{:04}", target_index + 1),
                        source: source.clone(),
                        source_sequence: (time / sensor.scan_period_s).round() as u64 + 1,
                        source_time_seconds: time,
                        estimate: TrackEstimate {
                            value_state: "ESTIMATED",
                            position_m: {
                                let value = target.position.add(model.position_bias_m);
                                Vec3 { x: stable(value.x), y: stable(value.y), z: stable(value.z) }
                            },
                            velocity_mps: {
                                let value = target.velocity.add(model.velocity_bias_mps);
                                Vec3 { x: stable(value.x), y: stable(value.y), z: stable(value.z) }
                            },
                        },
                        uncertainty: TrackUncertainty {
                            value_state: "ESTIMATED",
                            position_standard_deviation_m: model.position_standard_deviation_m,
                            velocity_standard_deviation_mps: model.velocity_standard_deviation_mps,
                        },
                    }).collect::<Vec<_>>();
                if let Some(store) = track_stores.get_mut(perspective) {
                    return tracked(store, "OBSERVATION_ADMITTED", "Source-authored generic verification observations updated this side-owned TrackStore.", observations);
                }
                return ObserverTickResult { state: unavailable_observer_state(perspective, "The admitted verification TrackStore is unavailable."), sensor_entity_id: None, transitions: Vec::new() };
            }
            ObserverTickResult { state: ObserverState {
                schema_version: "vector.observer-state.v2",
                perspective,
                sensor_state: "SEARCH",
                observation_count: 1,
                track_state: Some("PLOT"),
                visible: Some(false),
                availability_reason: Some("OBSERVATION_ADMITTED"),
                track_count: None,
                visible_track_count: None,
                scan_reason: None,
                effect_scope: "AIR_PICTURE_ONLY",
                state_explanation: "One due scan satisfied the admitted range and field-of-view conditions. This plot has no position estimate or weapon-support authority.",
                sensor_model_id,
                observations: None,
                tracks: None,
            }, sensor_entity_id: Some(observer.definition.id.clone()), transitions: Vec::new() }
        })
        .collect()
}

fn update_observer_runtime(
    states: &[RuntimeState],
    scenario: &EngineScenario,
    tick: u64,
    terminal_tick: u64,
    stores: &mut HashMap<&'static str, TrackStore>,
    prior_receipts: &mut HashMap<String, SimulationEventReceipt>,
    journal: &mut SimulationEventJournal,
) -> Result<Option<Vec<ObserverState>>, EngineError> {
    if tick >= terminal_tick {
        return Ok(None);
    }
    let time = recorded_model_time_at_tick(tick, scenario.fixed_step_seconds);
    let results = observer_states(states, scenario, time, scenario.fixed_step_seconds, stores);
    let observer_states = results.iter().map(|result| result.state.clone()).collect();
    for result in results {
        let Some(sensor_entity_id) = result.sensor_entity_id else {
            continue;
        };
        for transition in result.transitions {
            let prior_key = format!("{}\0{}", transition.owner, transition.track_id);
            let owner_affiliation = if transition.owner == "IAF" {
                Affiliation::Blue
            } else {
                Affiliation::Red
            };
            let receipt = journal.emit(SimulationEventDraft::track_changed(
                tick,
                time,
                &sensor_entity_id,
                owner_affiliation,
                &transition,
                prior_receipts.get(&prior_key).cloned(),
            ))?;
            prior_receipts.insert(prior_key, receipt);
        }
    }
    Ok(Some(observer_states))
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CoverageEnvelope {
    pub id: String,
    pub entity_id: String,
    pub affiliation: Affiliation,
    pub kind: CoverageKind,
    pub radius_m: f64,
    pub minimum_altitude_m: f64,
    pub maximum_altitude_m: f64,
    pub value_state: ModelValueState,
    pub label: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Diagnostics {
    pub backend: EngineBackend,
    pub fixed_step_seconds: f64,
    pub integrated_steps: u64,
    pub non_finite_state_count: u64,
    pub minimum_mass_margin_kg: f64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineRun {
    pub scenario: EngineScenario,
    pub frames: Vec<EngineFrame>,
    pub events: SimulationEventStream,
    pub envelopes: Vec<CoverageEnvelope>,
    pub primary_weapon_id: String,
    pub primary_target_id: String,
    pub termination: Termination,
    pub closest_approach_m: f64,
    pub peak_command_g: f64,
    pub diagnostics: Diagnostics,
}

#[derive(Clone)]
struct RuntimeState {
    definition: EntityDefinition,
    lifecycle: EntityLifecycle,
    position: Vec3,
    velocity: Vec3,
    mass_kg: f64,
    fuel_kg: f64,
    heading_rad: f64,
    commanded_g: f64,
    available_g: f64,
    store_mass_kg: f64,
    installed_store_ids: Vec<String>,
    drag_newtons: f64,
    thrust_newtons: f64,
    phase: String,
    weapon_flight_state: Option<WeaponFlightState>,
    route_point_index: usize,
    aircraft_control: Option<AircraftControlFrame>,
    last_guidance_acceleration: Vec3,
    last_guidance_update_seconds: f64,
}

impl RuntimeState {
    fn new(definition: &EntityDefinition) -> Self {
        let starts_at_first_route_point = definition
            .route
            .first()
            .map(|point| point.subtract(definition.initial.position).magnitude() <= 1e-6)
            .unwrap_or(false);
        Self {
            definition: definition.clone(),
            lifecycle: definition.lifecycle,
            position: definition.initial.position,
            velocity: definition.initial.velocity,
            mass_kg: definition.initial.mass_kg,
            fuel_kg: definition.initial.fuel_kg,
            heading_rad: definition.initial.heading_rad,
            commanded_g: 0.0,
            available_g: definition
                .weapon
                .as_ref()
                .map(|model| model.maximum_command_g)
                .unwrap_or(9.0),
            store_mass_kg: 0.0,
            installed_store_ids: Vec::new(),
            drag_newtons: 0.0,
            thrust_newtons: 0.0,
            phase: if definition.lifecycle == EntityLifecycle::Stowed {
                "Stowed"
            } else {
                "Initial state"
            }
            .to_string(),
            weapon_flight_state: if definition.kind == EntityKind::GuidedWeapon {
                Some(WeaponFlightState::Stowed)
            } else {
                None
            },
            route_point_index: usize::from(starts_at_first_route_point),
            aircraft_control: None,
            last_guidance_acceleration: Vec3::default(),
            last_guidance_update_seconds: f64::NEG_INFINITY,
        }
    }
}

fn atmosphere(altitude_m: f64, offset_c: f64) -> (f64, f64) {
    let altitude = altitude_m.clamp(0.0, 25000.0);
    let (mut temperature_c, pressure_kpa) = if altitude <= 11000.0 {
        let temperature_c = 15.04 - 0.00649 * altitude;
        let pressure = 101.29 * ((temperature_c + 273.1) / 288.08).powf(5.256);
        (temperature_c, pressure)
    } else {
        (-56.46, 22.65 * (1.73 - 0.000157 * altitude).exp())
    };
    temperature_c += offset_c;
    let temperature_k = temperature_c + 273.15;
    let density = pressure_kpa / (0.2869 * temperature_k);
    let speed_of_sound = (1.4 * 287.05 * temperature_k).sqrt();
    (density, speed_of_sound)
}

fn local_to_geographic(position: Vec3, anchor: &StudyAreaAnchor) -> (f64, f64) {
    const A: f64 = 6_378_137.0;
    const INV_F: f64 = 298.257_223_563;
    let f = 1.0 / INV_F;
    let e2 = f * (2.0 - f);
    let b = A * (1.0 - f);
    let ep2 = (A * A - b * b) / (b * b);
    let lon = anchor.longitude.to_radians();
    let lat = anchor.latitude.to_radians();
    let sin_lat = lat.sin();
    let cos_lat = lat.cos();
    let normal = A / (1.0 - e2 * sin_lat * sin_lat).sqrt();
    let ox = normal * cos_lat * lon.cos();
    let oy = normal * cos_lat * lon.sin();
    let oz = normal * (1.0 - e2) * sin_lat;
    let dx = -lon.sin() * position.x - sin_lat * lon.cos() * position.y
        + cos_lat * lon.cos() * position.z;
    let dy = lon.cos() * position.x - sin_lat * lon.sin() * position.y
        + cos_lat * lon.sin() * position.z;
    let dz = cos_lat * position.y + sin_lat * position.z;
    let x = ox + dx;
    let y = oy + dy;
    let z = oz + dz;
    let p = x.hypot(y);
    let theta = (z * A).atan2(p * b);
    let latitude = (z + ep2 * b * theta.sin().powi(3)).atan2(p - e2 * A * theta.cos().powi(3));
    (y.atan2(x).to_degrees(), latitude.to_degrees())
}

fn axis(value: f64, start: f64, step: f64, count: usize) -> Option<(usize, f64)> {
    if !value.is_finite() || !start.is_finite() || !step.is_finite() || step <= 0.0 || count < 2 {
        return None;
    }
    let coordinate = (value - start) / step;
    if !coordinate.is_finite() || coordinate < -1e-9 || coordinate > count as f64 - 1.0 + 1e-9 {
        return None;
    }
    let bounded = coordinate.clamp(0.0, count as f64 - 1.0);
    let lower = (bounded.floor() as usize).min(count - 2);
    Some((lower, bounded - lower as f64))
}

fn bilinear_at_axes(
    values: &[f64],
    grid: &RuntimeAtmosphereGrid,
    x: usize,
    fx: f64,
    y: usize,
    fy: f64,
    time_index: usize,
) -> Result<f64, EngineError> {
    let stride = grid.columns * grid.rows;
    let at = |row: usize, column: usize| {
        values
            .get(time_index * stride + row * grid.columns + column)
            .copied()
    };
    let south = at(y, x)
        .zip(at(y, x + 1))
        .map(|(west, east)| west * (1.0 - fx) + east * fx)
        .ok_or_else(|| runtime_environment_error(ATMOSPHERE_COVERAGE_ERROR))?;
    let north = at(y + 1, x)
        .zip(at(y + 1, x + 1))
        .map(|(west, east)| west * (1.0 - fx) + east * fx)
        .ok_or_else(|| runtime_environment_error(ATMOSPHERE_COVERAGE_ERROR))?;
    Ok(south * (1.0 - fy) + north * fy)
}

const TERRAIN_SAMPLE_ERROR: &str =
    "runtime environment terrain sample is outside admitted coverage or contains no-data";
const ATMOSPHERE_COVERAGE_ERROR: &str =
    "runtime environment atmosphere sample is outside admitted coverage or contains no-data";
const ATMOSPHERE_TIME_ERROR: &str =
    "runtime environment atmosphere sample time is outside admitted validity";
const ATMOSPHERE_VALUE_ERROR: &str = "runtime environment atmosphere sample contains invalid data";

fn runtime_environment_error(message: &'static str) -> EngineError {
    EngineError::InvalidScenario(message.to_string())
}

fn terrain_sample(
    runtime: &RuntimeEnvironmentProjection,
    position: Vec3,
) -> Result<f64, EngineError> {
    let grid = &runtime.terrain.grid;
    let (lon, lat) = local_to_geographic(Vec3 { z: 0.0, ..position }, &runtime.anchor);
    terrain_sample_at_geographic(grid, lon, lat)
}

fn terrain_sample_at_geographic(
    grid: &RuntimeTerrainGrid,
    lon: f64,
    lat: f64,
) -> Result<f64, EngineError> {
    let (x, fx) = axis(lon, grid.west_deg, grid.longitude_step_deg, grid.columns)
        .ok_or_else(|| runtime_environment_error(TERRAIN_SAMPLE_ERROR))?;
    let (y, fy) = axis(lat, grid.south_deg, grid.latitude_step_deg, grid.rows)
        .ok_or_else(|| runtime_environment_error(TERRAIN_SAMPLE_ERROR))?;
    let at = |row: usize, column: usize| {
        grid.surface_elevation_msl_m
            .get(row * grid.columns + column)
            .copied()
    };
    let south = at(y, x)
        .zip(at(y, x + 1))
        .map(|(west, east)| west * (1.0 - fx) + east * fx)
        .ok_or_else(|| runtime_environment_error(TERRAIN_SAMPLE_ERROR))?;
    let north = at(y + 1, x)
        .zip(at(y + 1, x + 1))
        .map(|(west, east)| west * (1.0 - fx) + east * fx)
        .ok_or_else(|| runtime_environment_error(TERRAIN_SAMPLE_ERROR))?;
    let elevation = south * (1.0 - fy) + north * fy;
    if !elevation.is_finite() {
        return Err(runtime_environment_error(TERRAIN_SAMPLE_ERROR));
    }
    Ok(elevation)
}

fn environment_sample(
    scenario: &EngineScenario,
    position: Vec3,
    time: f64,
) -> Result<(f64, f64, Vec3), EngineError> {
    let Some(runtime) = scenario.environment.runtime_environment.as_ref() else {
        let (density, sound) = atmosphere(position.z, scenario.environment.temperature_offset_c);
        return Ok((density, sound, scenario.environment.wind_mps));
    };
    let grid = &runtime.atmosphere.grid;
    let (lon, lat) = local_to_geographic(Vec3 { z: 0.0, ..position }, &runtime.anchor);
    let (x, fx) = axis(lon, grid.west_deg, grid.longitude_step_deg, grid.columns)
        .ok_or_else(|| runtime_environment_error(ATMOSPHERE_COVERAGE_ERROR))?;
    let (y, fy) = axis(lat, grid.south_deg, grid.latitude_step_deg, grid.rows)
        .ok_or_else(|| runtime_environment_error(ATMOSPHERE_COVERAGE_ERROR))?;
    let coordinate = time / grid.interval_seconds;
    if !time.is_finite()
        || time < 0.0
        || !coordinate.is_finite()
        || coordinate > grid.sample_count as f64 - 1.0
        || grid.sample_count < 2
    {
        return Err(runtime_environment_error(ATMOSPHERE_TIME_ERROR));
    }
    let lower = (coordinate.floor() as usize).min(grid.sample_count - 2);
    let fraction = coordinate - lower as f64;
    let temporal = |values: &[f64]| -> Result<f64, EngineError> {
        let value = bilinear_at_axes(values, grid, x, fx, y, fy, lower)? * (1.0 - fraction)
            + bilinear_at_axes(values, grid, x, fx, y, fy, lower + 1)? * fraction;
        if value.is_finite() {
            Ok(value)
        } else {
            Err(runtime_environment_error(ATMOSPHERE_VALUE_ERROR))
        }
    };
    let surface_temperature_c = temporal(&grid.temperature_c)?;
    let surface_pressure_kpa = temporal(&grid.surface_pressure_kpa)?;
    let humidity = temporal(&grid.relative_humidity_percent)?;
    let terrain = terrain_sample_at_geographic(&runtime.terrain.grid, lon, lat)?;
    let surface_temperature_k =
        surface_temperature_c + runtime.authored_modifiers.temperature_offset_c + 273.15;
    let temperature_k = surface_temperature_k - 0.0065 * (position.z - terrain);
    let pressure_kpa = surface_pressure_kpa
        * (temperature_k / surface_temperature_k).powf(9.80665 / (287.05 * 0.0065));
    let temperature_c = temperature_k - 273.15;
    let saturation = 0.61094 * (17.625 * temperature_c / (temperature_c + 243.04)).exp();
    let vapour = pressure_kpa.min(saturation * humidity / 100.0);
    let density = ((pressure_kpa - vapour) * 1000.0) / (287.05 * temperature_k)
        + (vapour * 1000.0) / (461.495 * temperature_k);
    let sound = (1.4 * 287.05 * temperature_k).sqrt();
    let east = temporal(&grid.wind_east_mps)? + runtime.authored_modifiers.wind_east_mps;
    let north = temporal(&grid.wind_north_mps)? + runtime.authored_modifiers.wind_north_mps;
    if !surface_temperature_k.is_finite()
        || surface_temperature_k <= 0.0
        || !temperature_k.is_finite()
        || temperature_k <= 0.0
        || !surface_pressure_kpa.is_finite()
        || surface_pressure_kpa <= 0.0
        || !humidity.is_finite()
        || !(0.0..=100.0).contains(&humidity)
        || !pressure_kpa.is_finite()
        || pressure_kpa <= 0.0
        || !density.is_finite()
        || density <= 0.0
        || !sound.is_finite()
        || sound <= 0.0
        || !east.is_finite()
        || !north.is_finite()
    {
        return Err(runtime_environment_error(ATMOSPHERE_VALUE_ERROR));
    }
    Ok((
        density,
        sound,
        Vec3 {
            x: east,
            y: north,
            z: 0.0,
        },
    ))
}

fn terrain_elevation(scenario: &EngineScenario, position: Vec3) -> Result<f64, EngineError> {
    match scenario.environment.runtime_environment.as_ref() {
        Some(runtime) => terrain_sample(runtime, position),
        None => Ok(0.0),
    }
}

fn active_wind(scenario: &EngineScenario, time: f64, base: Vec3) -> Vec3 {
    scenario.events.iter().fold(base, |wind, event| {
        if event.event_type == EngineEventType::WindShift
            && time >= event.start_seconds
            && time < event.start_seconds + event.duration_seconds
        {
            wind.add(event.vector_mps)
        } else {
            wind
        }
    })
}

fn update_aircraft(
    state: &mut RuntimeState,
    scenario: &EngineScenario,
    time: f64,
    dt: f64,
) -> Result<(), EngineError> {
    if state.lifecycle != EntityLifecycle::Active && state.lifecycle != EntityLifecycle::Tracking {
        return Ok(());
    }
    if state.definition.kind != EntityKind::Aircraft {
        return Ok(());
    }
    let Some(model) = state.definition.aircraft.as_ref() else {
        return Ok(());
    };
    let speed = state.velocity.magnitude().max(1.0);
    while state.route_point_index < state.definition.route.len().saturating_sub(1) {
        let Some(point) = state.definition.route.get(state.route_point_index) else {
            break;
        };
        let Some(plan) = state.definition.route_plan.as_ref() else {
            return Err(EngineError::InvalidScenario(
                "route plan is missing during aircraft route execution".to_string(),
            ));
        };
        let Some(declared_radius) = plan
            .waypoint_acceptance_radii_m
            .get(state.route_point_index)
            .copied()
        else {
            return Err(EngineError::InvalidScenario(
                "route plan radius is missing during aircraft route execution".to_string(),
            ));
        };
        let transition = route_transition(plan, state.route_point_index)?;
        let capture_radius_m = if transition == "FLY_OVER" {
            (speed * dt * 2.0).max(1.0)
        } else {
            (speed * dt * 2.0).max(declared_radius).max(1.0)
        };
        if point.subtract(state.position).magnitude() > capture_radius_m {
            break;
        }
        state.route_point_index += 1;
    }
    let route_point = state.definition.route.get(state.route_point_index).copied();
    let current_direction = state.velocity.normalize();
    let requested_direction = route_point
        .map(|point| point.subtract(state.position).normalize())
        .unwrap_or(current_direction);
    let direction_cross = requested_direction.cross(current_direction).magnitude();
    let direction_aligned =
        requested_direction.dot(current_direction) > 0.0 && direction_cross < 1e-9;
    let requested_velocity = if direction_aligned {
        current_direction.scale(speed)
    } else {
        requested_direction.scale(speed)
    };
    let mut requested_steering = requested_velocity.subtract(state.velocity).scale(1.0 / dt);
    requested_steering = requested_steering
        .subtract(current_direction.scale(requested_steering.dot(current_direction)));
    if direction_aligned || requested_steering.magnitude() < 1e-9 {
        requested_steering = Vec3::default();
    }
    if route_point.is_some()
        && requested_velocity.normalize().dot(current_direction) < -0.999
        && requested_steering.magnitude() < 1e-6
    {
        requested_steering = Vec3 {
            x: -current_direction.y * model.maximum_command_g * G0,
            y: current_direction.x * model.maximum_command_g * G0,
            z: 0.0,
        };
    }
    let accepted_steering = requested_steering.clamp_magnitude(model.maximum_command_g * G0);
    let steering_limited = requested_steering.magnitude() > accepted_steering.magnitude() + 1e-9;
    let (density, speed_of_sound, base_wind) = environment_sample(scenario, state.position, time)?;
    let airspeed = state
        .velocity
        .subtract(active_wind(scenario, time, base_wind))
        .magnitude()
        .max(1.0);
    let longitudinal_acceleration = {
        let dynamic_pressure = (0.5 * density * airspeed * airspeed).max(1.0);
        let steering_g = accepted_steering.magnitude() / G0;
        let load_factor = (1.0 + steering_g * steering_g).sqrt();
        let lift_coefficient =
            state.mass_kg * G0 * load_factor / (dynamic_pressure * model.reference_area_m2);
        let mach = airspeed / speed_of_sound;
        let drag_coefficient = interpolate_table(&model.zero_lift_drag_by_mach, mach)?
            + interpolate_table(&model.induced_drag_by_angle_of_attack_rad, 0.0)?
                * lift_coefficient
                * lift_coefficient;
        let drag = dynamic_pressure * model.reference_area_m2 * drag_coefficient;
        let maximum_thrust = interpolate_table(&model.thrust_by_throttle, 1.0)?;
        if maximum_thrust <= 0.0 {
            return Err(EngineError::InvalidScenario(format!(
                "admitted table {} has no positive full-throttle thrust",
                model.thrust_by_throttle.id
            )));
        }
        let requested_thrust = drag * if steering_g == 0.0 { 1.02 } else { 1.18 };
        let throttle = (requested_thrust / maximum_thrust).min(1.0);
        let thrust_demand = interpolate_table(&model.thrust_by_throttle, throttle)?;
        let specific_fuel_consumption = interpolate_table(&model.fuel_flow_by_throttle, throttle)?;
        let fuel_flow = if state.fuel_kg > 0.0 {
            thrust_demand * specific_fuel_consumption
        } else {
            0.0
        };
        let consumed = state.fuel_kg.min(fuel_flow * dt);
        state.fuel_kg -= consumed;
        state.mass_kg = (model.empty_mass_kg + state.store_mass_kg).max(state.mass_kg - consumed);
        state.drag_newtons = drag;
        state.thrust_newtons = if state.fuel_kg > 0.0 {
            thrust_demand
        } else {
            0.0
        };
        state.available_g = model.maximum_command_g;
        (state.thrust_newtons - state.drag_newtons) / state.mass_kg
    };
    let next_speed = (speed + longitudinal_acceleration * dt).max(60.0);
    let steered_velocity = state.velocity.add(accepted_steering.scale(dt));
    state.velocity = if accepted_steering.magnitude() == 0.0 {
        state.velocity.scale(next_speed / speed)
    } else {
        steered_velocity.normalize().scale(next_speed)
    };
    state.heading_rad = state.velocity.y.atan2(state.velocity.x);
    state.position = state.position.add(state.velocity.scale(dt));
    state.commanded_g = accepted_steering.magnitude() / G0;
    state.phase = if route_point.is_some() {
        "Following route"
    } else {
        "Route complete"
    }
    .to_string();
    state.aircraft_control = Some(AircraftControlFrame {
        route_point_index: route_point.map(|_| state.route_point_index),
        requested_velocity_mps: requested_velocity,
        requested_steering_acceleration_mps2: requested_steering,
        accepted_steering_acceleration_mps2: accepted_steering,
        achieved_velocity_mps: state.velocity,
        limiter: if route_point.is_none() {
            AircraftControlLimiter::RouteComplete
        } else if steering_limited {
            AircraftControlLimiter::LoadFactor
        } else {
            AircraftControlLimiter::None
        },
    });
    Ok(())
}

/// v1 explicitly represented fly-by-only routing. v2 makes each transition explicit.
fn route_transition(plan: &RoutePlan, index: usize) -> Result<&str, EngineError> {
    if plan.schema_version == "vector.route-plan.v1" {
        if index == 0 {
            Ok("START")
        } else {
            Ok("FLY_BY")
        }
    } else {
        plan.waypoint_transitions
            .as_ref()
            .and_then(|transitions| transitions.get(index))
            .map(String::as_str)
            .ok_or_else(|| {
                EngineError::InvalidScenario(
                    "route transition is missing during aircraft route execution".to_string(),
                )
            })
    }
}

fn activate_weapons(
    states: &mut [RuntimeState],
    tick: u64,
    terminal_tick: u64,
    scenario: &EngineScenario,
) {
    for index in 0..states.len() {
        let Some(weapon) = states[index].definition.weapon.clone() else {
            continue;
        };
        let Some(launch_time) = weapon.launch_time_seconds else {
            continue;
        };
        let activation_tick =
            first_fixed_step_tick_at_or_after(launch_time, scenario.fixed_step_seconds);
        if states[index].lifecycle != EntityLifecycle::Stowed
            || launch_time > scenario.duration_seconds
            || activation_tick >= terminal_tick
            || tick < activation_tick
        {
            continue;
        }
        let launcher_id = weapon.launch_platform_id;
        if let Some(launcher_index) = states
            .iter()
            .position(|state| state.definition.id == launcher_id)
        {
            let position = states[launcher_index].position;
            let velocity = states[launcher_index].velocity;
            let heading = states[launcher_index].heading_rad;
            if states[launcher_index].definition.kind == EntityKind::Aircraft {
                let Some(store_index) = states[launcher_index]
                    .installed_store_ids
                    .iter()
                    .position(|id| id == &states[index].definition.id)
                else {
                    continue;
                };
                states[launcher_index]
                    .installed_store_ids
                    .remove(store_index);
                states[launcher_index].store_mass_kg -= weapon.launch_mass_kg;
                states[launcher_index].mass_kg -= weapon.launch_mass_kg;
            }
            states[index].position = position;
            states[index].velocity = velocity;
            states[index].heading_rad = heading;
        }
        states[index].lifecycle = EntityLifecycle::Active;
        states[index].phase = "Launched".to_string();
        states[index].weapon_flight_state = Some(WeaponFlightState::Boost);
    }
}

fn update_weapon(
    index: usize,
    states: &mut [RuntimeState],
    scenario: &EngineScenario,
    time: f64,
    dt: f64,
) -> Result<(), EngineError> {
    let Some(weapon) = states[index].definition.weapon.clone() else {
        return Ok(());
    };
    if states[index].lifecycle != EntityLifecycle::Active {
        return Ok(());
    }
    let Some(target) = states
        .iter()
        .find(|state| state.definition.id == weapon.target_entity_id)
        .cloned()
    else {
        states[index].lifecycle = EntityLifecycle::Terminated;
        states[index].phase = "Target unavailable".to_string();
        states[index].weapon_flight_state = Some(WeaponFlightState::TargetUnavailable);
        return Ok(());
    };
    if target.lifecycle == EntityLifecycle::Terminated {
        states[index].lifecycle = EntityLifecycle::Terminated;
        states[index].phase = "Target unavailable".to_string();
        states[index].weapon_flight_state = Some(WeaponFlightState::TargetUnavailable);
        return Ok(());
    }
    let state = &mut states[index];
    let since_launch = time - weapon.launch_time_seconds.unwrap_or(0.0);
    let relative_position = target.position.subtract(state.position);
    let separation = relative_position.magnitude().max(1.0);
    let los = relative_position.normalize();
    let relative_velocity = target.velocity.subtract(state.velocity);
    let closing_rate = (-relative_velocity.dot(los)).max(0.0);
    let los_rate_vector = relative_position
        .cross(relative_velocity)
        .scale(1.0 / (separation * separation));
    let (density, _, base_wind) = environment_sample(scenario, state.position, time)?;
    let wind = active_wind(scenario, time, base_wind);
    let air_relative = state.velocity.subtract(wind);
    let airspeed = air_relative.magnitude().max(1.0);
    let direction = state.velocity.normalize();
    let dynamic_pressure = 0.5 * density * airspeed * airspeed;
    let drag = dynamic_pressure * weapon.drag_coefficient * weapon.reference_area_m2;
    let burning = since_launch >= 0.0 && since_launch < weapon.burn_seconds;
    let taper_start = weapon.thrust_taper_speed_mps * 0.9;
    let taper_end = weapon.thrust_taper_speed_mps * 1.08;
    let thrust_factor =
        ((taper_end - airspeed) / (taper_end - taper_start).max(1.0)).clamp(0.0, 1.0);
    let thrust = if burning {
        weapon.thrust_newtons * thrust_factor
    } else {
        0.0
    };
    let propellant = (weapon.launch_mass_kg - weapon.dry_mass_kg).max(0.0);
    let mass_flow = if weapon.burn_seconds > 0.0 {
        propellant / weapon.burn_seconds
    } else {
        0.0
    };
    if burning {
        let consumed = state.fuel_kg.min(mass_flow * dt);
        state.fuel_kg -= consumed;
        state.mass_kg = weapon.dry_mass_kg.max(state.mass_kg - consumed);
    }
    let nominal_guidance = los_rate_vector
        .cross(los)
        .scale(weapon.navigation_constant * closing_rate);
    let loft = if scenario.domain == EngagementDomain::GroundToGround {
        let terminal_blend =
            (separation / weapon.seeker_activation_range_m.max(1.0)).clamp(0.0, 1.0);
        let commanded = weapon
            .commanded_cruise_altitude_m
            .max(target.position.z + 30.0);
        let apex = if weapon.guidance == Guidance::Loft {
            commanded.max(target.position.z + (separation * 0.06).clamp(800.0, 9000.0))
        } else {
            commanded
        };
        let desired = target.position.z + (apex - target.position.z) * terminal_blend;
        Vec3 {
            x: 0.0,
            y: 0.0,
            z: ((desired - state.position.z) * 0.018 - state.velocity.z * 0.32).clamp(-22.0, 22.0),
        }
    } else if weapon.guidance == Guidance::Loft {
        let desired_height = (separation * 0.06).clamp(800.0, 9000.0);
        Vec3 {
            x: 0.0,
            y: 0.0,
            z: ((target.position.z + desired_height - state.position.z) * 0.0025)
                .clamp(-18.0, 18.0),
        }
    } else {
        Vec3::default()
    };
    let unclamped = nominal_guidance.add(loft).add(Vec3 {
        x: 0.0,
        y: 0.0,
        z: G0,
    });
    let terminal = separation <= weapon.seeker_activation_range_m;
    let update_due =
        terminal || time - state.last_guidance_update_seconds >= weapon.datalink_update_seconds;
    let guidance = if !update_due {
        state.last_guidance_acceleration
    } else {
        unclamped.clamp_magnitude(weapon.maximum_command_g * G0)
    };
    if update_due {
        state.last_guidance_acceleration = guidance;
        state.last_guidance_update_seconds = time;
    }
    let acceleration = direction
        .scale(thrust / state.mass_kg)
        .add(air_relative.normalize().scale(-drag / state.mass_kg))
        .add(Vec3 {
            x: 0.0,
            y: 0.0,
            z: -G0,
        })
        .add(guidance);
    state.velocity = state.velocity.add(acceleration.scale(dt));
    state.position = state.position.add(state.velocity.scale(dt));
    let terrain = terrain_elevation(scenario, state.position)?;
    state.position.z = state.position.z.max(terrain);
    state.heading_rad = state.velocity.y.atan2(state.velocity.x);
    state.commanded_g = guidance.magnitude() / G0;
    state.available_g = weapon.maximum_command_g;
    state.drag_newtons = drag;
    state.thrust_newtons = thrust;
    state.phase = if burning {
        "Powered flight"
    } else if terminal {
        "Terminal guidance"
    } else {
        "Midcourse guidance"
    }
    .to_string();
    state.weapon_flight_state = Some(if burning {
        WeaponFlightState::Boost
    } else if terminal {
        WeaponFlightState::TerminalGuidance
    } else {
        WeaponFlightState::Coast
    });
    Ok(())
}

fn entity_frame(
    state: &RuntimeState,
    scenario: &EngineScenario,
    time: f64,
) -> Result<EntityFrame, EngineError> {
    let speed = state.velocity.magnitude();
    let (_, speed_of_sound, _) = environment_sample(scenario, state.position, time)?;
    Ok(EntityFrame {
        id: state.definition.id.clone(),
        rddf_id: state.definition.rddf_id.clone(),
        designation: state.definition.designation.clone(),
        callsign: state.definition.callsign.clone(),
        affiliation: state.definition.affiliation,
        kind: state.definition.kind,
        symbol_role: state.definition.symbol_role.clone(),
        lifecycle: state.lifecycle,
        position: state.position,
        velocity: state.velocity,
        speed_mps: speed,
        heading_rad: state.heading_rad,
        mass_kg: state.mass_kg,
        fuel_kg: state.fuel_kg,
        mach: speed / speed_of_sound,
        specific_energy_jkg: G0 * state.position.z + 0.5 * speed * speed,
        drag_newtons: state.drag_newtons,
        thrust_newtons: state.thrust_newtons,
        commanded_g: state.commanded_g,
        available_g: state.available_g,
        store_mass_kg: state.store_mass_kg,
        installed_store_ids: state.installed_store_ids.clone(),
        phase: state.phase.clone(),
        weapon_flight_state: state.weapon_flight_state,
        value_state: state.definition.provenance.value_state,
        aircraft_control: state.aircraft_control.clone(),
    })
}

#[allow(clippy::too_many_arguments)]
fn sampled_engine_frame(
    states: &[RuntimeState],
    scenario: &EngineScenario,
    time: f64,
    weapon_id: &str,
    target_id: &str,
    separation: f64,
    closure: f64,
    los_rate: f64,
    observer_states: Vec<ObserverState>,
) -> Result<EngineFrame, EngineError> {
    Ok(EngineFrame {
        t: (time * 1_000_000.0).round() / 1_000_000.0,
        entities: states
            .iter()
            .filter(|state| state.lifecycle != EntityLifecycle::Stowed)
            .map(|state| entity_frame(state, scenario, time))
            .collect::<Result<Vec<_>, EngineError>>()?,
        primary_weapon_id: weapon_id.to_string(),
        primary_target_id: target_id.to_string(),
        separation_m: separation,
        closure_rate_mps: closure,
        line_of_sight_rate_rad_s: los_rate,
        observer_states,
    })
}

fn envelopes(scenario: &EngineScenario) -> Vec<CoverageEnvelope> {
    scenario
        .entities
        .iter()
        .flat_map(|entity| {
            let Some(sensor) = entity.sensor.as_ref() else {
                return Vec::new();
            };
            [
                (
                    CoverageKind::Detection,
                    sensor.detection_radius_m,
                    "detection study volume",
                    "detection",
                ),
                (
                    CoverageKind::Tracking,
                    sensor.tracking_radius_m,
                    "tracking study volume",
                    "tracking",
                ),
                (
                    CoverageKind::Engagement,
                    sensor.engagement_radius_m,
                    "engagement study envelope",
                    "engagement",
                ),
                (
                    CoverageKind::MinimumRange,
                    sensor.minimum_range_m,
                    "minimum-range limitation",
                    "minimum",
                ),
            ]
            .into_iter()
            .map(|(kind, radius, suffix, suffix_id)| CoverageEnvelope {
                id: format!("{}-{suffix_id}", entity.id),
                entity_id: entity.id.clone(),
                affiliation: entity.affiliation,
                kind,
                radius_m: radius,
                minimum_altitude_m: sensor.minimum_altitude_m,
                maximum_altitude_m: sensor.maximum_altitude_m,
                value_state: entity.provenance.value_state,
                label: format!("{} {}", entity.designation, suffix),
            })
            .collect::<Vec<_>>()
        })
        .collect()
}

fn invalid_run(scenario: EngineScenario) -> EngineRun {
    EngineRun {
        frames: Vec::new(),
        events: SimulationEventStream::available(Vec::new()),
        envelopes: envelopes(&scenario),
        primary_weapon_id: String::new(),
        primary_target_id: String::new(),
        termination: Termination::InvalidScenario,
        closest_approach_m: f64::MAX,
        peak_command_g: 0.0,
        diagnostics: Diagnostics {
            backend: EngineBackend::RustWasm,
            fixed_step_seconds: scenario.fixed_step_seconds,
            integrated_steps: 0,
            non_finite_state_count: 0,
            minimum_mass_margin_kg: 0.0,
        },
        scenario,
    }
}

fn model_time_at_tick(tick: u64, fixed_step_seconds: f64) -> f64 {
    tick as f64 * fixed_step_seconds
}

fn recorded_model_time_at_tick(tick: u64, fixed_step_seconds: f64) -> f64 {
    (model_time_at_tick(tick, fixed_step_seconds) * 1_000_000.0).round() / 1_000_000.0
}

pub(crate) fn first_fixed_step_tick_at_or_after(
    model_time_seconds: f64,
    fixed_step_seconds: f64,
) -> u64 {
    let mut candidate = (model_time_seconds / fixed_step_seconds).ceil() as u64;
    while candidate > 0
        && model_time_at_tick(candidate - 1, fixed_step_seconds) >= model_time_seconds
    {
        candidate -= 1;
    }
    while model_time_at_tick(candidate, fixed_step_seconds) < model_time_seconds {
        candidate += 1;
    }
    candidate
}

/// Run a validated deterministic scenario and return a replayable engine record.
pub fn try_run_engine(mut scenario: EngineScenario) -> Result<EngineRun, EngineError> {
    validate_scenario(&scenario)?;
    scenario
        .entities
        .sort_by(|left, right| left.id.cmp(&right.id));
    let terminal_tick =
        first_fixed_step_tick_at_or_after(scenario.duration_seconds, scenario.fixed_step_seconds);
    let mut states: Vec<RuntimeState> = scenario.entities.iter().map(RuntimeState::new).collect();
    for store in &scenario.entities {
        let Some(weapon) = store.weapon.as_ref() else {
            continue;
        };
        if store.lifecycle != EntityLifecycle::Stowed {
            continue;
        }
        if let Some(launcher) = states
            .iter_mut()
            .find(|state| state.definition.id == weapon.launch_platform_id)
        {
            if launcher.definition.kind == EntityKind::Aircraft {
                launcher.installed_store_ids.push(store.id.clone());
                launcher.store_mass_kg += weapon.launch_mass_kg;
            }
        }
    }
    let primary_weapon_index = scenario.entities.iter().position(|entity| {
        entity.kind == EntityKind::GuidedWeapon
            && entity
                .weapon
                .as_ref()
                .and_then(|weapon| weapon.launch_time_seconds)
                .is_some()
    });
    let primary_target_index = primary_weapon_index.and_then(|index| {
        let target_id = states[index]
            .definition
            .weapon
            .as_ref()?
            .target_entity_id
            .as_str();
        states
            .iter()
            .position(|state| state.definition.id == target_id)
    });
    let (Some(weapon_index), Some(target_index)) = (primary_weapon_index, primary_target_index)
    else {
        return Err(EngineError::InvalidScenario(
            "scenario must contain a launched weapon with a valid target".to_string(),
        ));
    };
    let weapon_id = states[weapon_index].definition.id.clone();
    let target_id = states[target_index].definition.id.clone();
    let mut frames = Vec::new();
    let mut termination = Termination::TimeLimit;
    let mut closest = f64::INFINITY;
    let mut peak_g: f64 = 0.0;
    let mut steps = 0_u64;
    let mut non_finite = 0_u64;
    let mut mass_margin = f64::INFINITY;
    let sample_every = (0.25 / scenario.fixed_step_seconds).round().max(1.0) as u64;
    let mut event_journal = SimulationEventJournal::default();
    let mut track_stores = HashMap::new();
    let mut prior_track_receipts = HashMap::new();
    let mut current_observer_states = Vec::new();
    let mut last_observer_tick: Option<u64> = None;
    let mut recorded_entity_states = 0_u64;
    loop {
        let tick = steps;
        let time = model_time_at_tick(tick, scenario.fixed_step_seconds);
        let event_time = recorded_model_time_at_tick(tick, scenario.fixed_step_seconds);
        if tick == 0 {
            event_journal.emit(SimulationEventDraft::run_started(
                tick,
                event_time,
                &scenario.id,
                &scenario.version,
            ))?;
            for state in states.iter().filter(|state| {
                state.lifecycle != EntityLifecycle::Stowed
                    && state.lifecycle != EntityLifecycle::Terminated
            }) {
                event_journal.emit(SimulationEventDraft::entity_entered(
                    tick,
                    event_time,
                    &state.definition.id,
                    state.definition.kind,
                    state.lifecycle,
                ))?;
            }
        }
        let before_activation: Vec<EntityLifecycle> =
            states.iter().map(|state| state.lifecycle).collect();
        activate_weapons(&mut states, tick, terminal_tick, &scenario);
        for (index, state) in states.iter().enumerate() {
            if before_activation[index] != EntityLifecycle::Stowed
                || state.lifecycle == EntityLifecycle::Stowed
            {
                continue;
            }
            event_journal.emit(SimulationEventDraft::entity_entered(
                tick,
                event_time,
                &state.definition.id,
                state.definition.kind,
                state.lifecycle,
            ))?;
        }
        if last_observer_tick != Some(tick) {
            if let Some(observer_states) = update_observer_runtime(
                &states,
                &scenario,
                tick,
                terminal_tick,
                &mut track_stores,
                &mut prior_track_receipts,
                &mut event_journal,
            )? {
                current_observer_states = observer_states;
                last_observer_tick = Some(tick);
            }
        }
        let relative_position = states[target_index]
            .position
            .subtract(states[weapon_index].position);
        let relative_velocity = states[target_index]
            .velocity
            .subtract(states[weapon_index].velocity);
        let separation = relative_position.magnitude();
        let los = relative_position.normalize();
        let closure = -relative_velocity.dot(los);
        let los_rate = relative_position.cross(relative_velocity).magnitude()
            / (separation * separation).max(1.0);
        closest = closest.min(separation);
        peak_g = peak_g.max(states[weapon_index].commanded_g);
        let dry_mass = states[weapon_index]
            .definition
            .weapon
            .as_ref()
            .map(|weapon| weapon.dry_mass_kg)
            .unwrap_or(0.0);
        mass_margin = mass_margin.min(states[weapon_index].mass_kg - dry_mass);
        for state in states.iter() {
            if [
                state.position.x,
                state.position.y,
                state.position.z,
                state.velocity.x,
                state.velocity.y,
                state.velocity.z,
                state.mass_kg,
            ]
            .iter()
            .any(|value| !value.is_finite())
            {
                non_finite += 1;
            }
        }
        let mut completed_this_tick = false;
        if states[weapon_index].weapon_flight_state == Some(WeaponFlightState::TargetUnavailable) {
            termination = Termination::TargetUnavailable;
            completed_this_tick = true;
        } else if separation <= scenario.completion.distance_meters {
            termination = Termination::ThresholdReached;
            completed_this_tick = true;
        } else if tick >= terminal_tick {
            termination = Termination::TimeLimit;
            completed_this_tick = true;
        } else {
            let speed = states[weapon_index].velocity.magnitude();
            let Some(weapon) = states[weapon_index].definition.weapon.as_ref() else {
                return Err(EngineError::InvalidScenario(
                    "primary weapon lost its model during integration".to_string(),
                ));
            };
            let since_launch = time - weapon.launch_time_seconds.unwrap_or(0.0);
            if (since_launch > weapon.burn_seconds + 2.0 && speed < 80.0 && separation > 1000.0)
                || (states[weapon_index].position.z
                    <= terrain_elevation(&scenario, states[weapon_index].position)?
                    && time > 1.0)
            {
                termination = Termination::EnergyDepleted;
                completed_this_tick = true;
            }
        }
        let next_tick = tick + 1;
        let next_time = model_time_at_tick(next_tick, scenario.fixed_step_seconds);
        if completed_this_tick {
            event_journal.emit(SimulationEventDraft::run_completed(
                tick,
                event_time,
                termination,
            ))?;
        }
        if tick == 0 || event_journal.has_pending() {
            let frame_index = frames.len();
            let visible_states = states
                .iter()
                .filter(|state| state.lifecycle != EntityLifecycle::Stowed)
                .count() as u64;
            if recorded_entity_states.saturating_add(visible_states) > MAX_RECORDED_ENTITY_STATES {
                return Err(EngineError::InvalidScenario(format!(
                    "event-preserving frames exceed {MAX_RECORDED_ENTITY_STATES} recorded entity states"
                )));
            }
            frames.push(sampled_engine_frame(
                &states,
                &scenario,
                time,
                &weapon_id,
                &target_id,
                separation,
                closure,
                los_rate,
                current_observer_states.clone(),
            )?);
            recorded_entity_states += visible_states;
            if event_journal.has_pending() {
                event_journal.commit_tick(tick, event_time, frame_index)?;
            }
        }
        if completed_this_tick {
            break;
        }
        let before_updates: Vec<EntityLifecycle> =
            states.iter().map(|state| state.lifecycle).collect();
        for state in states.iter_mut() {
            update_aircraft(state, &scenario, time, scenario.fixed_step_seconds)?;
        }
        for index in 0..states.len() {
            update_weapon(
                index,
                &mut states,
                &scenario,
                time,
                scenario.fixed_step_seconds,
            )?;
        }
        steps = next_tick;
        let next_event_time = recorded_model_time_at_tick(next_tick, scenario.fixed_step_seconds);
        for (index, state) in states.iter().enumerate() {
            let prior = before_updates[index];
            if prior == state.lifecycle {
                continue;
            }
            event_journal.emit(SimulationEventDraft::lifecycle_changed(
                steps,
                next_event_time,
                &state.definition.id,
                state.definition.kind,
                prior,
                state.lifecycle,
            ))?;
        }
        let post_relative_position = states[target_index]
            .position
            .subtract(states[weapon_index].position);
        let post_separation = post_relative_position.magnitude();
        closest = closest.min(post_separation);
        if states[weapon_index].weapon_flight_state == Some(WeaponFlightState::TargetUnavailable) {
            termination = Termination::TargetUnavailable;
            completed_this_tick = true;
        } else if post_separation <= scenario.completion.distance_meters {
            termination = Termination::ThresholdReached;
            completed_this_tick = true;
        } else {
            let speed = states[weapon_index].velocity.magnitude();
            let weapon = states[weapon_index]
                .definition
                .weapon
                .as_ref()
                .ok_or_else(|| {
                    EngineError::InvalidScenario(
                        "primary weapon lost its model during integration".to_string(),
                    )
                })?;
            let since_launch = next_time - weapon.launch_time_seconds.unwrap_or(0.0);
            if (since_launch > weapon.burn_seconds + 2.0
                && speed < 80.0
                && post_separation > 1000.0)
                || (states[weapon_index].position.z
                    <= terrain_elevation(&scenario, states[weapon_index].position)?
                    && next_time > 1.0)
            {
                termination = Termination::EnergyDepleted;
                completed_this_tick = true;
            } else if next_tick >= terminal_tick {
                termination = Termination::TimeLimit;
                completed_this_tick = true;
            }
        }
        if completed_this_tick {
            event_journal.emit(SimulationEventDraft::run_completed(
                steps,
                next_event_time,
                termination,
            ))?;
        }
        if !completed_this_tick && last_observer_tick != Some(steps) {
            if let Some(observer_states) = update_observer_runtime(
                &states,
                &scenario,
                steps,
                terminal_tick,
                &mut track_stores,
                &mut prior_track_receipts,
                &mut event_journal,
            )? {
                current_observer_states = observer_states;
                last_observer_tick = Some(steps);
            }
        }
        let activation_at_next_boundary = states.iter().any(|state| {
            state.lifecycle == EntityLifecycle::Stowed
                && state
                    .definition
                    .weapon
                    .as_ref()
                    .and_then(|weapon| weapon.launch_time_seconds)
                    .is_some_and(|launch_time| {
                        let activation_tick = first_fixed_step_tick_at_or_after(
                            launch_time,
                            scenario.fixed_step_seconds,
                        );
                        activation_tick < terminal_tick && activation_tick == steps
                    })
        });
        if event_journal.has_pending()
            || steps == 1
            || (steps % sample_every == 0 && !activation_at_next_boundary)
        {
            let post_relative_velocity = states[target_index]
                .velocity
                .subtract(states[weapon_index].velocity);
            let post_los = post_relative_position.normalize();
            let post_closure = -post_relative_velocity.dot(post_los);
            let post_los_rate = post_relative_position
                .cross(post_relative_velocity)
                .magnitude()
                / (post_separation * post_separation).max(1.0);
            let frame_index = frames.len();
            let visible_states = states
                .iter()
                .filter(|state| state.lifecycle != EntityLifecycle::Stowed)
                .count() as u64;
            if recorded_entity_states.saturating_add(visible_states) > MAX_RECORDED_ENTITY_STATES {
                return Err(EngineError::InvalidScenario(format!(
                    "event-preserving frames exceed {MAX_RECORDED_ENTITY_STATES} recorded entity states"
                )));
            }
            frames.push(sampled_engine_frame(
                &states,
                &scenario,
                next_event_time,
                &weapon_id,
                &target_id,
                post_separation,
                post_closure,
                post_los_rate,
                current_observer_states.clone(),
            )?);
            recorded_entity_states += visible_states;
            if event_journal.has_pending() {
                event_journal.commit_tick(steps, next_event_time, frame_index)?;
            }
        }
        if completed_this_tick {
            break;
        }
    }
    let events = SimulationEventStream::available(event_journal.into_items()?);
    Ok(EngineRun {
        scenario: scenario.clone(),
        frames,
        events,
        envelopes: envelopes(&scenario),
        primary_weapon_id: weapon_id,
        primary_target_id: target_id,
        termination,
        closest_approach_m: closest,
        peak_command_g: peak_g,
        diagnostics: Diagnostics {
            backend: EngineBackend::RustWasm,
            fixed_step_seconds: scenario.fixed_step_seconds,
            integrated_steps: steps,
            non_finite_state_count: non_finite,
            minimum_mass_margin_kg: if mass_margin.is_finite() {
                mass_margin
            } else {
                0.0
            },
        },
    })
}

/// Run a scenario while preserving the legacy invalid-run return contract.
pub fn run_engine(scenario: EngineScenario) -> EngineRun {
    let fallback = scenario.clone();
    try_run_engine(scenario).unwrap_or_else(|_| invalid_run(fallback))
}

/// Decode, validate, run, and encode one versioned engine scenario.
pub fn run_json(input: &str) -> Result<String, EngineError> {
    if input.len() > MAX_INPUT_BYTES {
        return Err(EngineError::InputTooLarge {
            requested: input.len(),
            maximum: MAX_INPUT_BYTES,
        });
    }
    let scenario: EngineScenario =
        serde_json::from_str(input).map_err(|error| EngineError::InvalidJson(error.to_string()))?;
    let run = try_run_engine(scenario)?;
    serde_json::to_string(&run).map_err(|error| EngineError::Serialization(error.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn provenance() -> Provenance {
        Provenance {
            source_object_id: "native-test".to_string(),
            model_id: "native-test-model".to_string(),
            model_version: "native-test-v1".to_string(),
            model_pack_digest: "181379ad76df8cdbf08666788bf1aace54b05651ce1d2e852487d651c6fb0e1d"
                .to_string(),
            value_state: ModelValueState::ModelAssumption,
        }
    }

    fn entity(
        id: &str,
        affiliation: Affiliation,
        position: Vec3,
        velocity: Vec3,
    ) -> EntityDefinition {
        EntityDefinition {
            id: id.to_string(),
            rddf_id: format!("rddf://test/{id}"),
            designation: id.to_string(),
            callsign: id.to_uppercase(),
            affiliation,
            kind: EntityKind::Aircraft,
            symbol_role: "FIGHTER".to_string(),
            lifecycle: EntityLifecycle::Active,
            route: Vec::new(),
            route_plan: None,
            initial: InitialState {
                position,
                velocity,
                heading_rad: velocity.y.atan2(velocity.x),
                mass_kg: 10_000.0,
                fuel_kg: 2_000.0,
            },
            weapon: None,
            sensor: None,
            observer_sensor: None,
            aircraft: Some(AircraftModel {
                empty_mass_kg: 8_000.0,
                fuel_capacity_kg: 3_000.0,
                reference_area_m2: 30.0,
                zero_lift_drag_by_mach: Table1d {
                    id: "test-drag".into(),
                    axis: vec![0.0, 2.0],
                    values: vec![0.025, 0.025],
                },
                induced_drag_by_angle_of_attack_rad: Table1d {
                    id: "test-induced".into(),
                    axis: vec![-0.2, 0.4],
                    values: vec![0.08, 0.08],
                },
                thrust_by_throttle: Table1d {
                    id: "test-thrust".into(),
                    axis: vec![0.0, 1.0],
                    values: vec![0.0, 120_000.0],
                },
                fuel_flow_by_throttle: Table1d {
                    id: "test-fuel".into(),
                    axis: vec![0.0, 1.0],
                    values: vec![0.000025, 0.000025],
                },
                maximum_command_g: 9.0,
            }),
            provenance: provenance(),
        }
    }

    fn scenario() -> EngineScenario {
        let mut blue = entity(
            "blue-aircraft",
            Affiliation::Blue,
            Vec3 {
                x: 0.0,
                y: 0.0,
                z: 8_000.0,
            },
            Vec3 {
                x: 250.0,
                y: 0.0,
                z: 0.0,
            },
        );
        blue.initial.mass_kg += 180.0;
        let red = entity(
            "red-aircraft",
            Affiliation::Red,
            Vec3 {
                x: 10_000.0,
                y: 1_000.0,
                z: 8_500.0,
            },
            Vec3 {
                x: -220.0,
                y: 0.0,
                z: 0.0,
            },
        );
        let weapon = EntityDefinition {
            id: "blue-weapon".to_string(),
            rddf_id: "rddf://test/blue-weapon".to_string(),
            designation: "Test weapon".to_string(),
            callsign: "BLUE WEAPON".to_string(),
            affiliation: Affiliation::Blue,
            kind: EntityKind::GuidedWeapon,
            symbol_role: "GUIDED_MISSILE".to_string(),
            lifecycle: EntityLifecycle::Stowed,
            route: Vec::new(),
            route_plan: None,
            initial: InitialState {
                position: Vec3 {
                    x: 0.0,
                    y: 0.0,
                    z: 8_000.0,
                },
                velocity: Vec3 {
                    x: 250.0,
                    y: 0.0,
                    z: 0.0,
                },
                heading_rad: 0.0,
                mass_kg: 180.0,
                fuel_kg: 70.0,
            },
            weapon: Some(WeaponModel {
                launch_platform_id: "blue-aircraft".to_string(),
                target_entity_id: "red-aircraft".to_string(),
                guidance: Guidance::Direct,
                launch_time_seconds: Some(1.0),
                burn_seconds: 5.0,
                launch_mass_kg: 180.0,
                dry_mass_kg: 110.0,
                thrust_newtons: 28_000.0,
                thrust_taper_speed_mps: 1_000.0,
                reference_area_m2: 0.06,
                drag_coefficient: 0.28,
                navigation_constant: 3.5,
                maximum_command_g: 28.0,
                seeker_activation_range_m: 5_000.0,
                datalink_update_seconds: 0.2,
                commanded_cruise_altitude_m: 8_000.0,
                admission: WeaponAdmission {
                    model_pack_digest:
                        "181379ad76df8cdbf08666788bf1aace54b05651ce1d2e852487d651c6fb0e1d"
                            .to_string(),
                    weapon_model_id: "native-test-model".to_string(),
                    station_id: "fixture-station".to_string(),
                    compatibility_rule_id: "fixture-rule".to_string(),
                    seeker_mode: WeaponSeekerMode::Unavailable,
                    support_requirement: WeaponSupportRequirement::Unavailable,
                    launch_authorization: WeaponLaunchAuthorization::ScheduledTestOnly,
                },
            }),
            sensor: None,
            observer_sensor: None,
            aircraft: None,
            provenance: provenance(),
        };
        EngineScenario {
            id: "native-test".to_string(),
            version: "1.0.0".to_string(),
            domain: EngagementDomain::AirToAir,
            name: "Native engine test".to_string(),
            seed: 42,
            duration_seconds: 3.0,
            fixed_step_seconds: 0.05,
            model_pack: ModelPackBinding {
                schema_version: "vector.compiled-model-pack.v1".to_string(),
                id: "native-test-pack".to_string(),
                version: "1.0.0".to_string(),
                digest: "181379ad76df8cdbf08666788bf1aace54b05651ce1d2e852487d651c6fb0e1d"
                    .to_string(),
                intended_use: IntendedUseRef {
                    id: "vector.intended-use.geometry-teaching".to_string(),
                    version: "1.0.0".to_string(),
                },
                runtime_digest: None,
                observer_sensors: Vec::new(),
                scenario_patches: Vec::new(),
            },
            entities: vec![blue, red, weapon],
            environment: Environment {
                gravity_mps2: G0,
                temperature_offset_c: 0.0,
                wind_mps: Vec3::default(),
                atmosphere: AtmosphereModel::NasaEducationalStandard,
                environment_pack: EnvironmentPackBinding {
                    schema_version: "vector.environment-pack.v1".to_string(),
                    id: "environment-pack:test-area:test-weather".to_string(),
                    version: "1.0.0".to_string(),
                    digest: format!("sha256:{}", "a".repeat(64)),
                },
                runtime_environment: None,
                study_area: StudyArea {
                    id: "test-area".to_string(),
                    name: "Test area".to_string(),
                    terrain_class: "test".to_string(),
                    surface_elevation_m: 0.0,
                    anchor: StudyAreaAnchor {
                        longitude: 0.0,
                        latitude: 0.0,
                    },
                    bounds: [[-1.0, -1.0], [1.0, 1.0]],
                    weather_preset_id: "test-weather".to_string(),
                },
            },
            completion: Completion {
                distance_meters: 100.0,
            },
            events: Vec::new(),
        }
    }

    fn scenario_with_runtime_environment() -> Result<EngineScenario, Box<dyn std::error::Error>> {
        let mut input = scenario();
        input.duration_seconds = 0.5;
        input.completion.distance_meters = 1.0;
        for (index, entity) in input.entities.iter_mut().enumerate() {
            entity.initial.position = Vec3 {
                x: 80.0 + index as f64 * 5.0,
                y: 0.0,
                z: 8_000.0,
            };
            entity.initial.velocity = Vec3 {
                x: 250.0,
                y: 0.0,
                z: 0.0,
            };
            entity.initial.heading_rad = 0.0;
        }
        let weapon = input.entities[2]
            .weapon
            .as_mut()
            .ok_or("runtime environment fixture must have a weapon")?;
        weapon.launch_time_seconds = Some(0.0);

        let terrain_grid = RuntimeTerrainGrid {
            west_deg: 0.0,
            south_deg: -0.001,
            longitude_step_deg: 0.001,
            latitude_step_deg: 0.002,
            columns: 2,
            rows: 2,
            surface_elevation_msl_m: vec![100.0; 4],
        };
        let atmosphere_grid = RuntimeAtmosphereGrid {
            interval_seconds: 0.05,
            sample_count: 11,
            west_deg: 0.0,
            south_deg: -0.001,
            longitude_step_deg: 0.001,
            latitude_step_deg: 0.002,
            columns: 2,
            rows: 2,
            temperature_c: vec![15.0; 44],
            surface_pressure_kpa: vec![101.325; 44],
            relative_humidity_percent: vec![50.0; 44],
            wind_east_mps: vec![0.0; 44],
            wind_north_mps: vec![0.0; 44],
        };
        input.environment.runtime_environment = Some(RuntimeEnvironmentProjection {
            schema_version: "vector.environment-runtime-grid.v1".to_string(),
            environment_pack: RuntimeDatasetIdentity {
                id: input.environment.environment_pack.id.clone(),
                version: input.environment.environment_pack.version.clone(),
                digest: input.environment.environment_pack.digest.clone(),
            },
            anchor: StudyAreaAnchor {
                longitude: 0.0,
                latitude: 0.0,
            },
            terrain: RuntimeGrid {
                id: "terrain:test".to_string(),
                version: "1.0.0".to_string(),
                digest: format!("sha256:{}", "b".repeat(64)),
                grid: terrain_grid,
            },
            atmosphere: RuntimeGrid {
                id: "atmosphere:test".to_string(),
                version: "1.0.0".to_string(),
                digest: format!("sha256:{}", "c".repeat(64)),
                grid: atmosphere_grid,
            },
            authored_modifiers: AuthoredEnvironmentModifiers {
                temperature_offset_c: 0.0,
                wind_east_mps: 0.0,
                wind_north_mps: 0.0,
            },
        });
        Ok(input)
    }

    #[test]
    fn regional_runtime_rejects_the_first_tick_outside_terrain_coverage(
    ) -> Result<(), Box<dyn std::error::Error>> {
        let error = match try_run_engine(scenario_with_runtime_environment()?) {
            Ok(_) => return Err("a regional run continued outside terrain coverage".into()),
            Err(error) => error,
        };
        assert!(
            matches!(
                &error,
                EngineError::InvalidScenario(message)
                    if message == "runtime environment terrain sample is outside admitted coverage or contains no-data"
            ),
            "{error:?}"
        );
        Ok(())
    }

    #[test]
    fn regional_runtime_rejects_out_of_valid_time_and_missing_grid_data(
    ) -> Result<(), Box<dyn std::error::Error>> {
        let mut outside_atmosphere = scenario_with_runtime_environment()?;
        let runtime = outside_atmosphere
            .environment
            .runtime_environment
            .as_mut()
            .ok_or("fixture must have a runtime environment")?;
        runtime.terrain.grid.west_deg = -1.0;
        runtime.terrain.grid.south_deg = -1.0;
        runtime.terrain.grid.longitude_step_deg = 2.0;
        runtime.terrain.grid.latitude_step_deg = 2.0;
        let error = match try_run_engine(outside_atmosphere) {
            Ok(_) => return Err("a regional run continued outside atmosphere coverage".into()),
            Err(error) => error,
        };
        assert!(
            matches!(
                &error,
                EngineError::InvalidScenario(message)
                    if message == "runtime environment atmosphere sample is outside admitted coverage or contains no-data"
            ),
            "{error:?}"
        );

        let mut invalid_time = scenario_with_runtime_environment()?;
        invalid_time.duration_seconds = 0.49;
        let runtime = invalid_time
            .environment
            .runtime_environment
            .as_mut()
            .ok_or("fixture must have a runtime environment")?;
        runtime.terrain.grid.west_deg = -1.0;
        runtime.terrain.grid.south_deg = -1.0;
        runtime.terrain.grid.longitude_step_deg = 2.0;
        runtime.terrain.grid.latitude_step_deg = 2.0;
        runtime.atmosphere.grid.west_deg = -1.0;
        runtime.atmosphere.grid.south_deg = -1.0;
        runtime.atmosphere.grid.longitude_step_deg = 2.0;
        runtime.atmosphere.grid.latitude_step_deg = 2.0;
        runtime.atmosphere.grid.interval_seconds = 0.049;
        let target = invalid_time
            .entities
            .iter_mut()
            .find(|entity| entity.id == "red-aircraft")
            .ok_or("fixture must have a target")?;
        target.initial.position.x = 10_000.0;
        let error = match try_run_engine(invalid_time) {
            Ok(_) => return Err("a regional run continued beyond atmosphere validity".into()),
            Err(error) => error,
        };
        assert!(
            matches!(
                &error,
                EngineError::InvalidScenario(message)
                    if message == "runtime environment atmosphere sample time is outside admitted validity"
            ),
            "{error:?}"
        );

        let mut missing_data = scenario_with_runtime_environment()?;
        missing_data
            .environment
            .runtime_environment
            .as_mut()
            .ok_or("fixture must have a runtime environment")?
            .atmosphere
            .grid
            .temperature_c
            .pop();
        let error = match try_run_engine(missing_data) {
            Ok(_) => return Err("a regional run admitted missing atmosphere cells".into()),
            Err(error) => error,
        };
        assert!(
            matches!(
                &error,
                EngineError::InvalidScenario(message)
                    if message == "environment.runtimeEnvironment atmosphere grid is invalid or does not cover the run"
            ),
            "{error:?}"
        );

        let mut invalid_value = scenario_with_runtime_environment()?;
        invalid_value
            .environment
            .runtime_environment
            .as_mut()
            .ok_or("fixture must have a runtime environment")?
            .atmosphere
            .grid
            .relative_humidity_percent
            .fill(150.0);
        let error = match try_run_engine(invalid_value) {
            Ok(_) => return Err("a regional run admitted invalid atmospheric values".into()),
            Err(error) => error,
        };
        assert!(
            matches!(
                &error,
                EngineError::InvalidScenario(message)
                    if message == "runtime environment atmosphere sample contains invalid data"
            ),
            "{error:?}"
        );
        Ok(())
    }

    #[test]
    fn deterministic_run_preserves_rust_provenance() -> Result<(), Box<dyn std::error::Error>> {
        let first = serde_json::to_string(&try_run_engine(scenario())?)?;
        let second = serde_json::to_string(&try_run_engine(scenario())?)?;
        assert_eq!(first, second);
        assert!(first.contains("\"backend\":\"rust-wasm\""));
        Ok(())
    }

    #[test]
    fn stowed_weapon_appears_only_after_launch() -> Result<(), Box<dyn std::error::Error>> {
        let run = try_run_engine(scenario())?;
        let first_frame = run.frames.first().ok_or("run did not produce a frame")?;
        assert!(!first_frame
            .entities
            .iter()
            .any(|entity| entity.id == "blue-weapon"));
        assert!(run
            .frames
            .iter()
            .any(|frame| frame.entities.iter().any(|entity| {
                entity.id == "blue-weapon" && entity.lifecycle == EntityLifecycle::Active
            })));
        assert_eq!(run.diagnostics.non_finite_state_count, 0);
        Ok(())
    }

    #[test]
    fn off_grid_launch_uses_the_first_fixed_step_boundary() -> Result<(), Box<dyn std::error::Error>>
    {
        for (fixed_step, launch_time, expected_tick, expected_time) in [
            (0.05, 2.03, 41, 2.05),
            (0.05, 2.050_000_000_001, 42, 2.1),
            (0.001, 1.008, 1008, 1.008),
        ] {
            let mut input = scenario();
            input.fixed_step_seconds = fixed_step;
            let weapon = input
                .entities
                .iter_mut()
                .find(|entity| entity.id == "blue-weapon")
                .and_then(|entity| entity.weapon.as_mut())
                .ok_or("scenario has no scheduled weapon")?;
            weapon.launch_time_seconds = Some(launch_time);

            let run = try_run_engine(input)?;
            let entry = run
                .events
                .items
                .iter()
                .find(|event| {
                    event.producer.entity_id.as_deref() == Some("blue-weapon")
                        && matches!(
                            &event.payload,
                            simulation_events::SimulationEventPayload::EntityEnteredWorld { .. }
                        )
                })
                .ok_or("run has no weapon world-entry event")?;
            assert_eq!(entry.tick, expected_tick);
            assert_eq!(entry.model_time_seconds, expected_time);
            assert_eq!(run.frames[entry.frame_index].t, expected_time);
        }
        Ok(())
    }

    #[test]
    fn activation_boundary_correction_covers_the_admitted_step_range() {
        for fixed_step in [0.001, 0.003, 0.01, 0.05, 0.2, 1.0] {
            for grid_tick in [0_u64, 1, 7, 257, 1008] {
                let boundary = model_time_at_tick(grid_tick, fixed_step);
                let near_grid_delta =
                    (f64::EPSILON * boundary.abs().max(1.0) * 4.0).max(fixed_step * 1e-12);
                for launch_time in [
                    boundary,
                    boundary + fixed_step * 0.37,
                    boundary + near_grid_delta,
                ] {
                    let mut expected_tick = 0_u64;
                    while model_time_at_tick(expected_tick, fixed_step) < launch_time {
                        expected_tick += 1;
                    }
                    let actual_tick = first_fixed_step_tick_at_or_after(launch_time, fixed_step);
                    assert_eq!(actual_tick, expected_tick);
                    assert!(model_time_at_tick(actual_tick, fixed_step) >= launch_time);
                    if actual_tick > 0 {
                        assert!(model_time_at_tick(actual_tick - 1, fixed_step) < launch_time);
                    }
                }
            }
        }
    }

    #[test]
    fn post_duration_weapon_schedule_fails_before_clock_quantization(
    ) -> Result<(), Box<dyn std::error::Error>> {
        for launch_time in [3.001, f64::MAX] {
            let mut input = scenario();
            let weapon = input
                .entities
                .iter_mut()
                .find(|entity| entity.id == "blue-weapon")
                .and_then(|entity| entity.weapon.as_mut())
                .ok_or("scenario has no scheduled weapon")?;
            weapon.launch_time_seconds = Some(launch_time);
            assert!(matches!(
                try_run_engine(input),
                Err(EngineError::InvalidScenario(message))
                    if message.contains("launches after scenario duration")
            ));
        }
        Ok(())
    }

    #[test]
    fn terminal_boundary_is_a_half_open_launch_window() -> Result<(), Box<dyn std::error::Error>> {
        for (fixed_step, duration, launch_time) in [
            (0.05, 0.2, 0.2),
            (0.05, 0.201, 0.201),
            (0.05, 0.22, 0.219),
            (0.05, 0.200_000_000_001, 0.200_000_000_001),
        ] {
            let mut input = scenario();
            input.fixed_step_seconds = fixed_step;
            input.duration_seconds = duration;
            let weapon = input
                .entities
                .iter_mut()
                .find(|entity| entity.id == "blue-weapon")
                .and_then(|entity| entity.weapon.as_mut())
                .ok_or("scenario has no scheduled weapon")?;
            weapon.launch_time_seconds = Some(launch_time);
            assert!(matches!(
                try_run_engine(input),
                Err(EngineError::InvalidScenario(message))
                    if message.contains("launches outside the executable run window")
            ));
        }

        let mut input = scenario();
        input.fixed_step_seconds = 0.05;
        input.duration_seconds = 0.22;
        let weapon = input
            .entities
            .iter_mut()
            .find(|entity| entity.id == "blue-weapon")
            .and_then(|entity| entity.weapon.as_mut())
            .ok_or("scenario has no scheduled weapon")?;
        weapon.launch_time_seconds = Some(0.2);
        let run = try_run_engine(input)?;
        assert_eq!(run.termination, Termination::TimeLimit);
        assert_eq!(run.diagnostics.integrated_steps, 5);
        assert_eq!(run.frames.last().map(|frame| frame.t), Some(0.25));
        let entry = run
            .events
            .items
            .iter()
            .find(|event| {
                event.producer.entity_id.as_deref() == Some("blue-weapon")
                    && matches!(
                        &event.payload,
                        simulation_events::SimulationEventPayload::EntityEnteredWorld { .. }
                    )
            })
            .ok_or("run has no weapon world-entry event")?;
        assert_eq!(entry.tick, 4);
        assert_eq!(entry.model_time_seconds, 0.2);
        Ok(())
    }

    #[test]
    fn unavailable_assigned_target_terminates_the_weapon_without_continuation(
    ) -> Result<(), Box<dyn std::error::Error>> {
        let mut unavailable_target = scenario();
        let target = unavailable_target
            .entities
            .iter_mut()
            .find(|entity| entity.id == "red-aircraft")
            .ok_or("scenario has no assigned target")?;
        target.lifecycle = EntityLifecycle::Terminated;
        let weapon = unavailable_target
            .entities
            .iter_mut()
            .find(|entity| entity.id == "blue-weapon")
            .and_then(|entity| entity.weapon.as_mut())
            .ok_or("scenario has no launched weapon")?;
        weapon.launch_time_seconds = Some(0.0);

        let run = try_run_engine(unavailable_target)?;
        assert_eq!(run.termination, Termination::TargetUnavailable);
        assert_eq!(run.diagnostics.integrated_steps, 1);
        let weapon = run
            .frames
            .last()
            .and_then(|frame| {
                frame
                    .entities
                    .iter()
                    .find(|entity| entity.id == "blue-weapon")
            })
            .ok_or("run has no weapon frame")?;
        assert_eq!(weapon.lifecycle, EntityLifecycle::Terminated);
        assert_eq!(
            weapon.weapon_flight_state,
            Some(WeaponFlightState::TargetUnavailable)
        );
        let transition = run
            .events
            .items
            .iter()
            .find(|event| {
                event.producer.entity_id.as_deref() == Some("blue-weapon")
                    && matches!(
                        &event.payload,
                        simulation_events::SimulationEventPayload::EntityLifecycleChanged { .. }
                    )
            })
            .ok_or("run has no weapon lifecycle transition")?;
        match &transition.payload {
            simulation_events::SimulationEventPayload::EntityLifecycleChanged {
                from, to, ..
            } => {
                assert_eq!(*from, EntityLifecycle::Active);
                assert_eq!(*to, EntityLifecycle::Terminated);
            }
            _ => return Err("weapon lifecycle event has the wrong payload".into()),
        }
        Ok(())
    }

    #[test]
    fn store_release_conserves_aircraft_mass() -> Result<(), Box<dyn std::error::Error>> {
        let run = try_run_engine(scenario())?;
        let before = run
            .frames
            .iter()
            .find(|frame| frame.t < 1.0 && frame.t > 0.5)
            .and_then(|frame| {
                frame
                    .entities
                    .iter()
                    .find(|entity| entity.id == "blue-aircraft")
            })
            .ok_or("run has no aircraft frame before launch")?;
        let after = run
            .frames
            .iter()
            .find(|frame| frame.t >= 1.0)
            .and_then(|frame| {
                frame
                    .entities
                    .iter()
                    .find(|entity| entity.id == "blue-aircraft")
            })
            .ok_or("run has no aircraft frame after launch")?;
        let later = run
            .frames
            .iter()
            .find(|frame| frame.t >= 2.0)
            .and_then(|frame| {
                frame
                    .entities
                    .iter()
                    .find(|entity| entity.id == "blue-aircraft")
            })
            .ok_or("run has no later aircraft frame")?;

        assert_eq!(before.store_mass_kg, 180.0);
        assert_eq!(before.installed_store_ids, vec!["blue-weapon"]);
        assert!((before.mass_kg - before.fuel_kg - 8_180.0).abs() < 1e-8);
        assert_eq!(after.store_mass_kg, 0.0);
        assert!(after.installed_store_ids.is_empty());
        assert!((after.mass_kg - after.fuel_kg - 8_000.0).abs() < 1e-8);
        assert!((later.mass_kg - later.fuel_kg - 8_000.0).abs() < 1e-8);
        Ok(())
    }

    #[test]
    fn scenario_validation_rejects_missing_installed_store_mass(
    ) -> Result<(), Box<dyn std::error::Error>> {
        let mut input = scenario();
        input
            .entities
            .first_mut()
            .ok_or("scenario fixture has no aircraft")?
            .initial
            .mass_kg -= 180.0;
        assert!(matches!(
            validate_scenario(&input),
            Err(EngineError::InvalidScenario(message))
                if message.contains("initial mass must equal empty mass, fuel, and installed stores")
        ));
        Ok(())
    }

    #[test]
    fn scenario_validation_rejects_duplicate_entity_id() -> Result<(), Box<dyn std::error::Error>> {
        let mut input = scenario();
        let duplicate_id = input
            .entities
            .first()
            .ok_or("scenario fixture has no first entity")?
            .id
            .clone();
        input
            .entities
            .get_mut(1)
            .ok_or("scenario fixture has no second entity")?
            .id = duplicate_id;
        assert!(matches!(
            validate_scenario(&input),
            Err(EngineError::InvalidScenario(message)) if message.contains("duplicate entity id")
        ));
        Ok(())
    }

    #[test]
    fn scenario_validation_rejects_missing_weapon_reference(
    ) -> Result<(), Box<dyn std::error::Error>> {
        let mut input = scenario();
        input
            .entities
            .get_mut(2)
            .and_then(|entity| entity.weapon.as_mut())
            .ok_or("scenario fixture has no weapon")?
            .target_entity_id = "missing-target".to_string();
        assert!(matches!(
            validate_scenario(&input),
            Err(EngineError::InvalidScenario(message)) if message.contains("missing target")
        ));
        Ok(())
    }

    #[test]
    fn scenario_validation_rejects_aircraft_without_a_model(
    ) -> Result<(), Box<dyn std::error::Error>> {
        let mut input = scenario();
        input
            .entities
            .first_mut()
            .ok_or("scenario fixture has no aircraft")?
            .aircraft = None;
        assert!(matches!(
            validate_scenario(&input),
            Err(EngineError::InvalidScenario(message)) if message.contains("aircraft is required")
        ));
        Ok(())
    }

    #[test]
    fn scenario_validation_rejects_unbounded_integration_work() {
        let mut input = scenario();
        input.fixed_step_seconds = 0.000_1;
        assert!(matches!(
            validate_scenario(&input),
            Err(EngineError::InvalidScenario(message)) if message.contains("fixedStepSeconds")
        ));
    }

    #[test]
    fn scenario_validation_rejects_missing_or_malformed_environment_pack_binding(
    ) -> Result<(), Box<dyn std::error::Error>> {
        let mut missing = serde_json::to_value(scenario())?;
        missing["environment"]
            .as_object_mut()
            .ok_or("environment missing")?
            .remove("environmentPack");
        assert!(serde_json::from_value::<EngineScenario>(missing).is_err());

        let mut malformed = scenario();
        malformed.environment.environment_pack.digest = "default-area".to_string();
        assert!(matches!(
            validate_scenario(&malformed),
            Err(EngineError::InvalidScenario(message)) if message.contains("environment.environmentPack.digest")
        ));
        Ok(())
    }

    #[test]
    fn scenario_json_rejects_unknown_typed_state() -> Result<(), Box<dyn std::error::Error>> {
        let mut input = serde_json::to_value(scenario())?;
        input["domain"] = serde_json::Value::String("NAVAL".to_string());
        let encoded = serde_json::to_string(&input)?;
        assert!(matches!(
            run_json(&encoded),
            Err(EngineError::InvalidJson(_))
        ));
        let mut weapon_input = serde_json::to_value(scenario())?;
        weapon_input["entities"][2]["weapon"]["admission"]["supportRequirement"] =
            serde_json::Value::String("TYPO_SUPPORT".to_string());
        let encoded = serde_json::to_string(&weapon_input)?;
        assert!(matches!(
            run_json(&encoded),
            Err(EngineError::InvalidJson(_))
        ));
        Ok(())
    }

    #[test]
    fn scenario_json_rejects_removed_guidance_hold_event() -> Result<(), Box<dyn std::error::Error>>
    {
        let mut input = serde_json::to_value(scenario())?;
        let removed_event_type = ["GUIDANCE", "HOLD"].join("_");
        input["events"] = serde_json::json!([{
            "id": "removed-condition",
            "type": removed_event_type,
            "startSeconds": 1.0,
            "durationSeconds": 8.0,
            "vectorMps": { "x": 0.0, "y": 0.0, "z": 0.0 }
        }]);
        let encoded = serde_json::to_string(&input)?;
        assert!(matches!(
            run_json(&encoded),
            Err(EngineError::InvalidJson(_))
        ));
        Ok(())
    }

    #[test]
    fn scenario_json_rejects_oversized_input() {
        let input = "x".repeat(MAX_INPUT_BYTES + 1);
        assert!(matches!(
            run_json(&input),
            Err(EngineError::InputTooLarge { .. })
        ));
    }

    #[test]
    fn scenario_matrix_remains_finite_across_declared_conditions(
    ) -> Result<(), Box<dyn std::error::Error>> {
        for case in 0..32 {
            let mut input = scenario();
            input.environment.temperature_offset_c = f64::from(case % 9) - 4.0;
            input.environment.wind_mps = Vec3 {
                x: f64::from(case) - 16.0,
                y: f64::from(case % 7) - 3.0,
                z: 0.0,
            };
            let target = input
                .entities
                .get_mut(1)
                .ok_or("scenario fixture has no target")?;
            target.initial.position.x += f64::from(case) * 250.0;
            let run = try_run_engine(input)?;
            assert!(!run.frames.is_empty());
            assert_eq!(run.diagnostics.non_finite_state_count, 0);
            assert!(run.closest_approach_m.is_finite());
        }
        Ok(())
    }

    #[test]
    fn two_side_track_store_capacity_fixture_matches_typescript_digest(
    ) -> Result<(), Box<dyn std::error::Error>> {
        use sha2::{Digest, Sha256};

        let model = ObserverTrackModel {
            schema_version: "vector.generic-track-model.v1".to_string(),
            value_state: "TEST_FIXTURE".to_string(),
            intended_use: "ENGINE_VERIFICATION_ONLY".to_string(),
            position_bias_m: Vec3 {
                x: 5.0,
                y: -2.0,
                z: 1.0,
            },
            velocity_bias_mps: Vec3 {
                x: 0.5,
                y: -0.25,
                z: 0.0,
            },
            position_standard_deviation_m: Vec3 {
                x: 40.0,
                y: 40.0,
                z: 60.0,
            },
            velocity_standard_deviation_mps: Vec3 {
                x: 3.0,
                y: 3.0,
                z: 4.0,
            },
            confirmation_observations: 2,
            maximum_observation_age_seconds: 0.1,
            coast_after_seconds: 0.1,
            lost_after_seconds: 0.2,
            observation_windows_seconds: vec![ObservationWindow {
                start: 0.0,
                end: 5.0,
            }],
        };
        let source = TrackSourceIdentity {
            model_pack_digest: "7".repeat(64),
            sensor_model_id: "generic-verification-sensor".to_string(),
            sensor_model_version: "1.0.0".to_string(),
        };
        let make_observation = |owner: &'static str, index: usize, tick: u64, time: f64| {
            let association = format!("{owner}-SOURCE-{:04}", index + 1);
            EngineObservation {
                schema_version: "vector.observation.v1",
                id: format!("{owner}-OBS-{:04}-{:08}", index + 1, tick + 1),
                owner,
                source_association_id: association,
                source: source.clone(),
                source_sequence: tick + 1,
                source_time_seconds: time,
                estimate: TrackEstimate {
                    value_state: "ESTIMATED",
                    position_m: Vec3 {
                        x: 10_000.0 + index as f64 * 1_000.0 + tick as f64 + 5.0,
                        y: if owner == "IAF" { 1_998.0 } else { -2_002.0 },
                        z: 7_001.0,
                    },
                    velocity_mps: Vec3 {
                        x: 250.5,
                        y: index as f64 / 10.0 - 0.25,
                        z: 0.0,
                    },
                },
                uncertainty: TrackUncertainty {
                    value_state: "ESTIMATED",
                    position_standard_deviation_m: model.position_standard_deviation_m,
                    velocity_standard_deviation_mps: model.velocity_standard_deviation_mps,
                },
            }
        };

        let mut stores = vec![
            TrackStore::new("IAF", source.clone(), &model)?,
            TrackStore::new("PAF", source.clone(), &model)?,
        ];
        let mut parity_lines = Vec::new();
        let mut transition_count = 0;
        for tick in 0_u64..=100 {
            let time = tick as f64 / 20.0;
            let due = tick <= 1 || tick >= 7;
            for store in &mut stores {
                let observations = if due {
                    (0..50)
                        .map(|index| make_observation(store.owner, index, tick, time))
                        .collect()
                } else {
                    Vec::new()
                };
                let (_, transitions) = store.update(time, observations)?;
                transition_count += transitions.len();
                for transition in transitions {
                    parity_lines.push(format!(
                        "E|{tick}|{}|{}|{}|{}|{}|{}|{}|{:.6}",
                        store.owner,
                        transition.source_association_id,
                        transition.track_id,
                        transition.from,
                        transition.to,
                        transition.cause,
                        transition.source_sequence,
                        transition.source_time_seconds,
                    ));
                }
                if due && tick > 0 && tick % 10 == 0 {
                    assert!(store
                        .update(time, vec![make_observation(store.owner, 0, tick, time)])
                        .is_err());
                    assert!(store
                        .update(
                            time,
                            vec![make_observation(store.owner, 1, tick - 1, time - 0.05)]
                        )
                        .is_err());
                }
            }
        }
        assert_eq!(transition_count, 600);
        let mut final_snapshots = Vec::new();
        for store in &mut stores {
            let (tracks, _) = store.update(5.0, Vec::new())?;
            assert_eq!(tracks.len(), 50);
            final_snapshots.push((store.owner, tracks));
        }
        for (owner, tracks) in &final_snapshots {
            let visible_track_count = tracks
                .iter()
                .filter(|track| matches!(track.state, "CONFIRMED" | "COASTING"))
                .count();
            parity_lines.push(format!("P|{owner}|{}|{visible_track_count}", tracks.len()));
            let state = ObserverState {
                schema_version: "vector.observer-state.v3",
                perspective: owner,
                sensor_state: "SEARCH",
                observation_count: 0,
                track_state: None,
                visible: None,
                availability_reason: None,
                track_count: Some(tracks.len() as u16),
                visible_track_count: Some(visible_track_count as u16),
                scan_reason: Some("SCAN_NOT_DUE"),
                effect_scope: "AIR_PICTURE_ONLY",
                state_explanation:
                    "Capacity verification retains the complete side-owned TrackStore snapshot.",
                sensor_model_id: Some(source.sensor_model_id.clone()),
                observations: Some(Vec::new()),
                tracks: Some(tracks.clone()),
            };
            let encoded = serde_json::to_value(state).map_err(|error| {
                EngineError::Serialization(format!(
                    "could not encode capacity observer state: {error}"
                ))
            })?;
            assert_eq!(encoded["tracks"].as_array().map(Vec::len), Some(50));
        }
        for (_, tracks) in final_snapshots {
            for track in tracks {
                parity_lines.push(format!(
                    "T|{}|{}|{}|{}|{}|{:.6}|{:.6}|{:.6}|{:.6}|{}",
                    track.owner,
                    track.source_association_id,
                    track.track_id,
                    track.state,
                    track.source_sequence,
                    track.source_time_seconds,
                    track.estimate.position_m.x,
                    track.estimate.position_m.y,
                    track.estimate.position_m.z,
                    track.update_count,
                ));
            }
        }
        let digest = format!("{:x}", Sha256::digest(parity_lines.join("\n").as_bytes()));
        assert_eq!(
            digest,
            "e70a8290091d554c28a7b192eaaab3cac531a227770fad27de346b2424a3ecd2"
        );
        Ok(())
    }

    #[test]
    fn wasm_abi_rejects_oversized_reservation_without_allocating() {
        assert_eq!(wasm_abi::vector_abi_version(), 1);
        assert_eq!(wasm_abi::vector_max_input_len(), MAX_INPUT_BYTES);
        assert!(wasm_abi::vector_input_reserve(MAX_INPUT_BYTES + 1).is_null());
    }
}
