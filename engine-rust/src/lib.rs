use serde::{Deserialize, Serialize};
use std::cell::RefCell;

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
    pub maneuver: String,
    pub commanded_g: f64,
    pub decision: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WeaponModel {
    pub launch_platform_id: String,
    pub target_entity_id: String,
    pub guidance: String,
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
    pub model_version: String,
    pub value_state: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EntityDefinition {
    pub id: String,
    pub rddf_id: String,
    pub designation: String,
    pub callsign: String,
    pub affiliation: String,
    pub kind: String,
    pub symbol_role: String,
    pub lifecycle: String,
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
    pub atmosphere: String,
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
    pub event_type: String,
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
    pub domain: String,
    pub name: String,
    pub seed: u64,
    pub duration_seconds: f64,
    pub fixed_step_seconds: f64,
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
    pub affiliation: String,
    pub kind: String,
    pub symbol_role: String,
    pub lifecycle: String,
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
    pub value_state: String,
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
    pub affiliation: String,
    pub kind: String,
    pub radius_m: f64,
    pub minimum_altitude_m: f64,
    pub maximum_altitude_m: f64,
    pub value_state: String,
    pub label: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Diagnostics {
    pub backend: String,
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
    pub termination: String,
    pub closest_approach_m: f64,
    pub peak_command_g: f64,
    pub diagnostics: Diagnostics,
}

#[derive(Clone)]
struct RuntimeState {
    definition: EntityDefinition,
    lifecycle: String,
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
            lifecycle: definition.lifecycle.clone(),
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
            phase: if definition.lifecycle == "STOWED" {
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
            if event.event_type == "WIND_SHIFT"
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
        event.event_type == "GUIDANCE_HOLD"
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
    if state.lifecycle != "ACTIVE" && state.lifecycle != "TRACKING" {
        return;
    }
    if state.definition.kind != "AIRCRAFT" {
        return;
    }
    let model = state.definition.aircraft.as_ref();
    let speed = state.velocity.magnitude().max(1.0);
    let mut turn_demand = 0.0;
    if state.definition.behavior.maneuver != "steady" && time >= 5.0 {
        turn_demand = if state.definition.behavior.maneuver == "break" {
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
        if states[index].lifecycle != "STOWED" || time < launch_time {
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
        states[index].lifecycle = "ACTIVE".to_string();
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
    if states[index].lifecycle != "ACTIVE" {
        return;
    }
    let Some(target) = states
        .iter()
        .find(|state| state.definition.id == weapon.target_entity_id)
        .cloned()
    else {
        states[index].lifecycle = "TERMINATED".to_string();
        states[index].phase = "Target unavailable".to_string();
        return;
    };
    if target.lifecycle == "TERMINATED" {
        states[index].lifecycle = "TERMINATED".to_string();
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
    let loft = if scenario.domain == "G2G" {
        let terminal_blend =
            (separation / weapon.seeker_activation_range_m.max(1.0)).clamp(0.0, 1.0);
        let commanded = weapon
            .commanded_cruise_altitude_m
            .max(target.position.z + 30.0);
        let apex = if weapon.guidance == "loft" {
            commanded.max(target.position.z + (separation * 0.06).max(800.0).min(9000.0))
        } else {
            commanded
        };
        let desired = target.position.z + (apex - target.position.z) * terminal_blend;
        Vec3 {
            x: 0.0,
            y: 0.0,
            z: ((desired - state.position.z) * 0.018 - state.velocity.z * 0.32).clamp(-22.0, 22.0),
        }
    } else if weapon.guidance == "loft" {
        let desired_height = (separation * 0.06).max(800.0).min(9000.0);
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
    let update_multiplier = match state.definition.behavior.decision.as_str() {
        "CRANK" => 1.5,
        "DEFEND" => 3.0,
        "DISENGAGE" => f64::INFINITY,
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
        affiliation: state.definition.affiliation.clone(),
        kind: state.definition.kind.clone(),
        symbol_role: state.definition.symbol_role.clone(),
        lifecycle: state.lifecycle.clone(),
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
        value_state: state.definition.provenance.value_state.clone(),
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
                    "DETECTION",
                    sensor.detection_radius_m,
                    "detection study volume",
                ),
                (
                    "TRACKING",
                    sensor.tracking_radius_m,
                    "tracking study volume",
                ),
                (
                    "ENGAGEMENT",
                    sensor.engagement_radius_m,
                    "engagement study envelope",
                ),
                (
                    "MINIMUM_RANGE",
                    sensor.minimum_range_m,
                    "minimum-range limitation",
                ),
            ]
            .into_iter()
            .map(|(kind, radius, suffix)| {
                let suffix_id = if kind == "MINIMUM_RANGE" {
                    "minimum".to_string()
                } else {
                    kind.to_lowercase()
                };
                CoverageEnvelope {
                    id: format!("{}-{suffix_id}", entity.id),
                    entity_id: entity.id.clone(),
                    affiliation: entity.affiliation.clone(),
                    kind: kind.to_string(),
                    radius_m: radius,
                    minimum_altitude_m: sensor.minimum_altitude_m,
                    maximum_altitude_m: sensor.maximum_altitude_m,
                    value_state: entity.provenance.value_state.clone(),
                    label: format!("{} {}", entity.designation, suffix),
                }
            })
            .collect::<Vec<_>>()
        })
        .collect()
}

pub fn run_engine(scenario: EngineScenario) -> EngineRun {
    let mut states: Vec<RuntimeState> = scenario.entities.iter().map(RuntimeState::new).collect();
    let primary_weapon_index = scenario.entities.iter().position(|entity| {
        entity.kind == "GUIDED_WEAPON"
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
    if primary_weapon_index.is_none() || primary_target_index.is_none() {
        return EngineRun {
            scenario: scenario.clone(),
            frames: Vec::new(),
            envelopes: envelopes(&scenario),
            primary_weapon_id: String::new(),
            primary_target_id: String::new(),
            termination: "invalid_scenario".to_string(),
            closest_approach_m: f64::MAX,
            peak_command_g: 0.0,
            diagnostics: Diagnostics {
                backend: "rust-wasm".to_string(),
                fixed_step_seconds: scenario.fixed_step_seconds,
                integrated_steps: 0,
                non_finite_state_count: 0,
                minimum_mass_margin_kg: 0.0,
            },
        };
    }
    let weapon_index = primary_weapon_index.unwrap();
    let target_index = primary_target_index.unwrap();
    let weapon_id = states[weapon_index].definition.id.clone();
    let target_id = states[target_index].definition.id.clone();
    let mut frames = Vec::new();
    let mut termination = "time_limit".to_string();
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
                    .filter(|state| state.lifecycle != "STOWED")
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
            termination = "threshold_reached".to_string();
            break;
        }
        let speed = states[weapon_index].velocity.magnitude();
        let weapon = states[weapon_index].definition.weapon.as_ref().unwrap();
        let since_launch = time - weapon.launch_time_seconds.unwrap_or(0.0);
        if since_launch > weapon.burn_seconds + 2.0 && speed < 80.0 && separation > 1000.0 {
            termination = "energy_depleted".to_string();
            break;
        }
        if states[weapon_index].position.z <= 0.0 && time > 1.0 {
            termination = "energy_depleted".to_string();
            break;
        }
        time += scenario.fixed_step_seconds;
    }
    EngineRun {
        scenario: scenario.clone(),
        frames,
        envelopes: envelopes(&scenario),
        primary_weapon_id: weapon_id,
        primary_target_id: target_id,
        termination,
        closest_approach_m: closest,
        peak_command_g: peak_g,
        diagnostics: Diagnostics {
            backend: "rust-wasm".to_string(),
            fixed_step_seconds: scenario.fixed_step_seconds,
            integrated_steps: steps,
            non_finite_state_count: non_finite,
            minimum_mass_margin_kg: if mass_margin.is_finite() {
                mass_margin
            } else {
                0.0
            },
        },
    }
}

pub fn run_json(input: &str) -> Result<String, String> {
    let scenario: EngineScenario =
        serde_json::from_str(input).map_err(|error| error.to_string())?;
    serde_json::to_string(&run_engine(scenario)).map_err(|error| error.to_string())
}

thread_local! {
    static INPUT: RefCell<Vec<u8>> = const { RefCell::new(Vec::new()) };
    static OUTPUT: RefCell<Vec<u8>> = const { RefCell::new(Vec::new()) };
}

#[no_mangle]
pub extern "C" fn vector_input_reserve(length: usize) -> *mut u8 {
    INPUT.with(|cell| {
        let mut input = cell.borrow_mut();
        input.clear();
        input.resize(length, 0);
        input.as_mut_ptr()
    })
}

#[no_mangle]
pub extern "C" fn vector_run_json() -> u32 {
    let result = INPUT.with(|input| {
        let input = input.borrow();
        std::str::from_utf8(&input)
            .map_err(|error| error.to_string())
            .and_then(run_json)
    });
    OUTPUT.with(|cell| {
        let mut output = cell.borrow_mut();
        output.clear();
        match result {
            Ok(value) => {
                output.extend_from_slice(value.as_bytes());
                1
            }
            Err(error) => {
                output.extend_from_slice(error.as_bytes());
                0
            }
        }
    })
}

#[no_mangle]
pub extern "C" fn vector_output_ptr() -> *const u8 {
    OUTPUT.with(|cell| cell.borrow().as_ptr())
}

#[no_mangle]
pub extern "C" fn vector_output_len() -> usize {
    OUTPUT.with(|cell| cell.borrow().len())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn provenance() -> Provenance {
        Provenance {
            source_object_id: "native-test".to_string(),
            model_version: "native-test-v1".to_string(),
            value_state: "MODEL_ASSUMPTION".to_string(),
        }
    }

    fn entity(id: &str, affiliation: &str, position: Vec3, velocity: Vec3) -> EntityDefinition {
        EntityDefinition {
            id: id.to_string(),
            rddf_id: format!("rddf://test/{id}"),
            designation: id.to_string(),
            callsign: id.to_uppercase(),
            affiliation: affiliation.to_string(),
            kind: "AIRCRAFT".to_string(),
            symbol_role: "FIGHTER".to_string(),
            lifecycle: "ACTIVE".to_string(),
            route: Vec::new(),
            initial: InitialState {
                position,
                velocity,
                heading_rad: velocity.y.atan2(velocity.x),
                mass_kg: 10_000.0,
                fuel_kg: 2_000.0,
            },
            behavior: Behavior {
                maneuver: "steady".to_string(),
                commanded_g: 0.0,
                decision: "PRESS".to_string(),
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
            "BLUE",
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
            "RED",
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
            affiliation: "BLUE".to_string(),
            kind: "GUIDED_WEAPON".to_string(),
            symbol_role: "GUIDED_MISSILE".to_string(),
            lifecycle: "STOWED".to_string(),
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
                maneuver: "steady".to_string(),
                commanded_g: 0.0,
                decision: "SUPPORT_WEAPON".to_string(),
            },
            weapon: Some(WeaponModel {
                launch_platform_id: "blue-aircraft".to_string(),
                target_entity_id: "red-aircraft".to_string(),
                guidance: "direct".to_string(),
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
            domain: "A2A".to_string(),
            name: "Native engine test".to_string(),
            seed: 42,
            duration_seconds: 3.0,
            fixed_step_seconds: 0.05,
            entities: vec![blue, red, weapon],
            environment: Environment {
                gravity_mps2: G0,
                temperature_offset_c: 0.0,
                wind_mps: Vec3::default(),
                atmosphere: "NASA_EDUCATIONAL_STANDARD".to_string(),
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
    fn deterministic_run_preserves_rust_provenance() {
        let first = serde_json::to_string(&run_engine(scenario())).unwrap();
        let second = serde_json::to_string(&run_engine(scenario())).unwrap();
        assert_eq!(first, second);
        assert!(first.contains("\"backend\":\"rust-wasm\""));
    }

    #[test]
    fn stowed_weapon_appears_only_after_launch() {
        let run = run_engine(scenario());
        assert!(!run
            .frames
            .first()
            .unwrap()
            .entities
            .iter()
            .any(|entity| entity.id == "blue-weapon"));
        assert!(run.frames.iter().any(|frame| frame
            .entities
            .iter()
            .any(|entity| entity.id == "blue-weapon" && entity.lifecycle == "ACTIVE")));
        assert_eq!(run.diagnostics.non_finite_state_count, 0);
    }
}
