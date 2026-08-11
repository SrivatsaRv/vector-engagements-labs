#![deny(unsafe_code)]
#![deny(clippy::expect_used, clippy::panic, clippy::unwrap_used)]

mod error;
mod model_pack;
mod public_aircraft_reference;
mod validation;
mod wasm_abi;

use serde::{Deserialize, Serialize};

pub use error::EngineError;
pub use model_pack::{validate_model_pack_json, CompiledModelPack};
pub use public_aircraft_reference::{
    run_public_aircraft_reference, run_public_aircraft_reference_json,
    PublicAircraftReferenceInput, PublicAircraftReferenceRun,
};
pub use validation::{
    validate_scenario, MAX_ENTITIES, MAX_EVENTS, MAX_INPUT_BYTES, MAX_INTEGRATED_STEPS,
    MAX_RECORDED_ENTITY_STATES, MAX_ROUTE_POINTS_PER_ENTITY,
};

const G0: f64 = 9.80665;

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize)]
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

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Maneuver {
    Steady,
    Break,
    Weave,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub enum TacticalDecision {
    #[serde(rename = "PRESS")]
    Press,
    #[serde(rename = "SUPPORT_WEAPON")]
    SupportWeapon,
    #[serde(rename = "CRANK")]
    Crank,
    #[serde(rename = "DEFEND")]
    Defend,
    #[serde(rename = "DISENGAGE")]
    Disengage,
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
    #[serde(rename = "GUIDANCE_HOLD")]
    GuidanceHold,
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
pub struct Behavior {
    pub maneuver: Maneuver,
    pub commanded_g: f64,
    pub decision: TacticalDecision,
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
    pub zero_lift_drag_coefficient: f64,
    pub induced_drag_factor: f64,
    pub maximum_thrust_newtons: f64,
    pub specific_fuel_consumption_kg_per_newton_second: f64,
    pub maximum_command_g: f64,
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
#[serde(rename_all = "camelCase")]
pub struct ModelPackBinding {
    pub schema_version: String,
    pub id: String,
    pub version: String,
    pub digest: String,
    pub intended_use: IntendedUseRef,
    pub scenario_patches: Vec<ScenarioModelPatch>,
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
    pub initial: InitialState,
    pub behavior: Behavior,
    pub weapon: Option<WeaponModel>,
    pub sensor: Option<SensorModel>,
    pub aircraft: Option<AircraftModel>,
    pub provenance: Provenance,
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

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Environment {
    pub gravity_mps2: f64,
    pub temperature_offset_c: f64,
    pub wind_mps: Vec3,
    pub atmosphere: AtmosphereModel,
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
    pub entity_id: Option<String>,
    pub vector_mps: Option<Vec3>,
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
    pub phase: String,
    pub value_state: ModelValueState,
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
    drag_newtons: f64,
    thrust_newtons: f64,
    phase: String,
    last_guidance_acceleration: Vec3,
    last_guidance_update_seconds: f64,
}

impl RuntimeState {
    fn new(definition: &EntityDefinition) -> Self {
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
            drag_newtons: 0.0,
            thrust_newtons: 0.0,
            phase: if definition.lifecycle == EntityLifecycle::Stowed {
                "Stowed"
            } else {
                "Initial state"
            }
            .to_string(),
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

fn active_wind(scenario: &EngineScenario, time: f64) -> Vec3 {
    scenario
        .events
        .iter()
        .fold(scenario.environment.wind_mps, |wind, event| {
            if event.event_type == EngineEventType::WindShift
                && time >= event.start_seconds
                && time < event.start_seconds + event.duration_seconds
            {
                event
                    .vector_mps
                    .map(|vector| wind.add(vector))
                    .unwrap_or(wind)
            } else {
                wind
            }
        })
}

fn guidance_held(scenario: &EngineScenario, entity_id: &str, time: f64) -> bool {
    scenario.events.iter().any(|event| {
        event.event_type == EngineEventType::GuidanceHold
            && event
                .entity_id
                .as_deref()
                .map(|id| id == entity_id)
                .unwrap_or(true)
            && time >= event.start_seconds
            && time < event.start_seconds + event.duration_seconds
    })
}

fn update_aircraft(state: &mut RuntimeState, scenario: &EngineScenario, time: f64, dt: f64) {
    if state.lifecycle != EntityLifecycle::Active && state.lifecycle != EntityLifecycle::Tracking {
        return;
    }
    if state.definition.kind != EntityKind::Aircraft {
        return;
    }
    let model = state.definition.aircraft.as_ref();
    let speed = state.velocity.magnitude().max(1.0);
    let mut turn_demand = 0.0;
    if state.definition.behavior.maneuver != Maneuver::Steady && time >= 5.0 {
        turn_demand = if state.definition.behavior.maneuver == Maneuver::Break {
            state.definition.behavior.commanded_g
        } else {
            state.definition.behavior.commanded_g * (time * 0.55).sin()
        };
    }
    let limited_turn = model
        .map(|item| turn_demand.clamp(-item.maximum_command_g, item.maximum_command_g))
        .unwrap_or(turn_demand);
    let (density, _) = atmosphere(state.position.z, scenario.environment.temperature_offset_c);
    let airspeed = state
        .velocity
        .subtract(active_wind(scenario, time))
        .magnitude()
        .max(1.0);
    let mut longitudinal_acceleration = 0.0;
    if let Some(model) = model {
        let dynamic_pressure = (0.5 * density * airspeed * airspeed).max(1.0);
        let load_factor = (1.0 + limited_turn * limited_turn).sqrt();
        let lift_coefficient =
            state.mass_kg * G0 * load_factor / (dynamic_pressure * model.reference_area_m2);
        let drag_coefficient = model.zero_lift_drag_coefficient
            + model.induced_drag_factor * lift_coefficient * lift_coefficient;
        let drag = dynamic_pressure * model.reference_area_m2 * drag_coefficient;
        let thrust_demand = model
            .maximum_thrust_newtons
            .min(drag * if limited_turn == 0.0 { 1.02 } else { 1.18 });
        let fuel_flow = if state.fuel_kg > 0.0 {
            thrust_demand * model.specific_fuel_consumption_kg_per_newton_second
        } else {
            0.0
        };
        let consumed = state.fuel_kg.min(fuel_flow * dt);
        state.fuel_kg -= consumed;
        state.mass_kg = model.empty_mass_kg.max(state.mass_kg - consumed);
        state.drag_newtons = drag;
        state.thrust_newtons = if state.fuel_kg > 0.0 {
            thrust_demand
        } else {
            0.0
        };
        longitudinal_acceleration = (state.thrust_newtons - state.drag_newtons) / state.mass_kg;
        state.available_g = model.maximum_command_g;
    }
    let next_speed = (speed + longitudinal_acceleration * dt).max(60.0);
    state.heading_rad += limited_turn * G0 / next_speed * dt;
    state.velocity = Vec3 {
        x: state.heading_rad.cos() * next_speed,
        y: state.heading_rad.sin() * next_speed,
        z: state.velocity.z,
    };
    state.position = state.position.add(state.velocity.scale(dt));
    state.commanded_g = limited_turn.abs();
    state.phase = if limited_turn == 0.0 {
        "Steady flight"
    } else {
        "Commanded maneuver"
    }
    .to_string();
}

fn activate_weapons(states: &mut [RuntimeState], time: f64) {
    for index in 0..states.len() {
        let Some(weapon) = states[index].definition.weapon.as_ref() else {
            continue;
        };
        let Some(launch_time) = weapon.launch_time_seconds else {
            continue;
        };
        if states[index].lifecycle != EntityLifecycle::Stowed || time < launch_time {
            continue;
        }
        let launcher_id = weapon.launch_platform_id.clone();
        if let Some(launcher) = states
            .iter()
            .find(|state| state.definition.id == launcher_id)
        {
            let position = launcher.position;
            let velocity = launcher.velocity;
            let heading = launcher.heading_rad;
            states[index].position = position;
            states[index].velocity = velocity;
            states[index].heading_rad = heading;
        }
        states[index].lifecycle = EntityLifecycle::Active;
        states[index].phase = "Launched".to_string();
    }
}

fn update_weapon(
    index: usize,
    states: &mut [RuntimeState],
    scenario: &EngineScenario,
    time: f64,
    dt: f64,
) {
    let Some(weapon) = states[index].definition.weapon.clone() else {
        return;
    };
    if states[index].lifecycle != EntityLifecycle::Active {
        return;
    }
    let Some(target) = states
        .iter()
        .find(|state| state.definition.id == weapon.target_entity_id)
        .cloned()
    else {
        states[index].lifecycle = EntityLifecycle::Terminated;
        states[index].phase = "Target unavailable".to_string();
        return;
    };
    if target.lifecycle == EntityLifecycle::Terminated {
        states[index].lifecycle = EntityLifecycle::Terminated;
        states[index].phase = "Target unavailable".to_string();
        return;
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
    let (density, _) = atmosphere(state.position.z, scenario.environment.temperature_offset_c);
    let wind = active_wind(scenario, time);
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
    let update_multiplier = match state.definition.behavior.decision {
        TacticalDecision::Crank => 1.5,
        TacticalDecision::Defend => 3.0,
        TacticalDecision::Disengage => f64::INFINITY,
        _ => 1.0,
    };
    let update_due = terminal
        || time - state.last_guidance_update_seconds
            >= weapon.datalink_update_seconds * update_multiplier;
    let held = guidance_held(scenario, &state.definition.id, time);
    let guidance = if held || !update_due {
        state.last_guidance_acceleration
    } else {
        unclamped.clamp_magnitude(weapon.maximum_command_g * G0)
    };
    if !held && update_due {
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
    state.position.z = state.position.z.max(0.0);
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
}

fn entity_frame(state: &RuntimeState, scenario: &EngineScenario) -> EntityFrame {
    let speed = state.velocity.magnitude();
    let (_, speed_of_sound) =
        atmosphere(state.position.z, scenario.environment.temperature_offset_c);
    EntityFrame {
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
        phase: state.phase.clone(),
        value_state: state.definition.provenance.value_state,
    }
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

/// Run a validated deterministic scenario and return a replayable engine record.
pub fn try_run_engine(scenario: EngineScenario) -> Result<EngineRun, EngineError> {
    validate_scenario(&scenario)?;
    let mut states: Vec<RuntimeState> = scenario.entities.iter().map(RuntimeState::new).collect();
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
    let mut time = 0.0;
    while time <= scenario.duration_seconds + 1e-9 {
        activate_weapons(&mut states, time);
        for state in states.iter_mut() {
            update_aircraft(state, &scenario, time, scenario.fixed_step_seconds);
        }
        for index in 0..states.len() {
            update_weapon(
                index,
                &mut states,
                &scenario,
                time,
                scenario.fixed_step_seconds,
            );
        }
        steps += 1;
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
        if steps % sample_every == 1 || steps == 1 {
            frames.push(EngineFrame {
                t: (time * 1_000_000.0).round() / 1_000_000.0,
                entities: states
                    .iter()
                    .filter(|state| state.lifecycle != EntityLifecycle::Stowed)
                    .map(|state| entity_frame(state, &scenario))
                    .collect(),
                primary_weapon_id: weapon_id.clone(),
                primary_target_id: target_id.clone(),
                separation_m: separation,
                closure_rate_mps: closure,
                line_of_sight_rate_rad_s: los_rate,
            });
        }
        if separation <= scenario.completion.distance_meters {
            termination = Termination::ThresholdReached;
            break;
        }
        let speed = states[weapon_index].velocity.magnitude();
        let Some(weapon) = states[weapon_index].definition.weapon.as_ref() else {
            return Err(EngineError::InvalidScenario(
                "primary weapon lost its model during integration".to_string(),
            ));
        };
        let since_launch = time - weapon.launch_time_seconds.unwrap_or(0.0);
        if since_launch > weapon.burn_seconds + 2.0 && speed < 80.0 && separation > 1000.0 {
            termination = Termination::EnergyDepleted;
            break;
        }
        if states[weapon_index].position.z <= 0.0 && time > 1.0 {
            termination = Termination::EnergyDepleted;
            break;
        }
        time += scenario.fixed_step_seconds;
    }
    Ok(EngineRun {
        scenario: scenario.clone(),
        frames,
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
            initial: InitialState {
                position,
                velocity,
                heading_rad: velocity.y.atan2(velocity.x),
                mass_kg: 10_000.0,
                fuel_kg: 2_000.0,
            },
            behavior: Behavior {
                maneuver: Maneuver::Steady,
                commanded_g: 0.0,
                decision: TacticalDecision::Press,
            },
            weapon: None,
            sensor: None,
            aircraft: None,
            provenance: provenance(),
        }
    }

    fn scenario() -> EngineScenario {
        let blue = entity(
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
            behavior: Behavior {
                maneuver: Maneuver::Steady,
                commanded_g: 0.0,
                decision: TacticalDecision::SupportWeapon,
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
            }),
            sensor: None,
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
                scenario_patches: Vec::new(),
            },
            entities: vec![blue, red, weapon],
            environment: Environment {
                gravity_mps2: G0,
                temperature_offset_c: 0.0,
                wind_mps: Vec3::default(),
                atmosphere: AtmosphereModel::NasaEducationalStandard,
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
    fn scenario_validation_rejects_unbounded_integration_work() {
        let mut input = scenario();
        input.fixed_step_seconds = 0.000_1;
        assert!(matches!(
            validate_scenario(&input),
            Err(EngineError::InvalidScenario(message)) if message.contains("fixedStepSeconds")
        ));
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
            target.behavior.maneuver = if case % 2 == 0 {
                Maneuver::Break
            } else {
                Maneuver::Weave
            };
            target.behavior.commanded_g = f64::from(case % 8);
            let run = try_run_engine(input)?;
            assert!(!run.frames.is_empty());
            assert_eq!(run.diagnostics.non_finite_state_count, 0);
            assert!(run.closest_approach_m.is_finite());
        }
        Ok(())
    }

    #[test]
    fn wasm_abi_rejects_oversized_reservation_without_allocating() {
        assert_eq!(wasm_abi::vector_abi_version(), 1);
        assert_eq!(wasm_abi::vector_max_input_len(), MAX_INPUT_BYTES);
        assert!(wasm_abi::vector_input_reserve(MAX_INPUT_BYTES + 1).is_null());
    }
}
