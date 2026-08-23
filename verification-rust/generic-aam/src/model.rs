use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};

use crate::EngineError;

const SOURCE_SHA256: &str = "30629ac16b33a519e7aee9e821554fb767b8fcb4daa83574966ee75b4cddc3aa";
const CORPUS_SHA256: &str = "2b7c3ea5199a2d4b07990f29f9c8209769bd782a99b7d484d02d39abda6c16a1";
const DECISION_SHA256: &str = "884bca829ac1b94f959ecff1be6b9cf9847512810c7010f36d8b78cf6cef22f2";

const MAX_TICKS: u32 = 7_680;
const MAX_ESTIMATED_OPERATIONS: u32 = 1_500_000;
const OPERATIONS_PER_TICK: u32 = 160;
const DYNAMIC_ABS_MAX: f64 = 1_000_000_000.0;

#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GenericAamVec3 {
    x: f64,
    y: f64,
    z: f64,
}

impl GenericAamVec3 {
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

    fn magnitude(self) -> f64 {
        self.x.hypot(self.y).hypot(self.z)
    }
}

fn finite_vec(value: GenericAamVec3) -> bool {
    value.x.is_finite() && value.y.is_finite() && value.z.is_finite()
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GenericAamMissileState {
    pub speed_mps: f64,
    pub pitch_rate_rad_s: f64,
    pub pitch_signal_mps2: f64,
    pub yaw_rate_rad_s: f64,
    pub yaw_signal_mps2: f64,
    pub pitch_rad: f64,
    pub yaw_rad: f64,
    pub position_m: GenericAamVec3,
    pub mass_kg: f64,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GenericAamTargetState {
    pub previous_position_m: GenericAamVec3,
    pub position_m: GenericAamVec3,
    pub velocity_mps: GenericAamVec3,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GenericAamConstants {
    pub navigation_constant: f64,
    pub gravity_mps2: f64,
    pub maximum_pitch_g: f64,
    pub maximum_yaw_g: f64,
    pub hit_range_m: f64,
    pub operational_speed_mps: f64,
    pub motor_thrust_n: f64,
    pub coast_thrust_n: f64,
    pub burn_seconds: f64,
    pub launch_mass_kg: f64,
    pub burnout_mass_kg: f64,
    pub drag_k1: f64,
    pub drag_k2: f64,
    pub control_time_constant_s: f64,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GenericAamVerificationInput {
    pub schema_version: String,
    pub subject_id: String,
    pub intended_use: String,
    pub semantics: String,
    pub source_sha256: String,
    pub corpus_sha256: String,
    pub decision_sha256: String,
    pub case_role: String,
    pub axis_convention: String,
    pub units: String,
    pub tick_rate_hz: u32,
    pub max_ticks: u32,
    pub seeker_half_angle_deg: u32,
    pub seeker_half_angle_rad: f64,
    pub missile: GenericAamMissileState,
    pub target: GenericAamTargetState,
    pub constants: GenericAamConstants,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GenericAamVerificationFrame {
    pub tick: u32,
    pub time_seconds: f64,
    pub missile_position_m: GenericAamVec3,
    pub target_position_m: GenericAamVec3,
    pub speed_mps: f64,
    pub pitch_rad: f64,
    pub yaw_rad: f64,
    pub pitch_rate_rad_s: f64,
    pub yaw_rate_rad_s: f64,
    pub pitch_signal_mps2: f64,
    pub yaw_signal_mps2: f64,
    pub mass_kg: f64,
    pub thrust_n: f64,
    pub drag_n: f64,
    pub relative_position_m: GenericAamVec3,
    pub range_m: f64,
    pub seeker_angle_rad: f64,
    pub los_rate_rad_s: GenericAamVec3,
    pub closing_velocity_mps: f64,
    pub pitch_command_mps2: f64,
    pub yaw_command_mps2: f64,
    pub closest_approach_time_s: f64,
    pub closest_approach_distance_m: f64,
    pub state: &'static str,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GenericAamTerminal {
    pub state: &'static str,
    pub tick: u32,
    pub cause: &'static str,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GenericAamVerificationRun {
    pub schema_version: &'static str,
    pub subject_id: String,
    pub intended_use: String,
    pub semantics: String,
    pub backend: &'static str,
    pub source_sha256: String,
    pub corpus_sha256: String,
    pub decision_sha256: String,
    pub input_sha256: String,
    pub output_sha256: String,
    pub content_sha256: String,
    pub case_role: String,
    pub frames: Vec<GenericAamVerificationFrame>,
    pub terminal: GenericAamTerminal,
    pub limitations: [&'static str; 4],
}

fn canonical(value: &Value) -> String {
    match value {
        Value::Null | Value::Bool(_) | Value::String(_) => value.to_string(),
        Value::Number(number) => {
            if let Some(value) = number.as_f64() {
                Value::String(format!("f64:{:016x}", value.to_bits())).to_string()
            } else {
                number.to_string()
            }
        }
        Value::Array(values) => format!(
            "[{}]",
            values.iter().map(canonical).collect::<Vec<_>>().join(",")
        ),
        Value::Object(values) => {
            let mut keys = values.keys().collect::<Vec<_>>();
            keys.sort();
            format!(
                "{{{}}}",
                keys.iter()
                    .map(|key| format!(
                        "{}:{}",
                        Value::String((*key).clone()),
                        canonical(&values[*key])
                    ))
                    .collect::<Vec<_>>()
                    .join(",")
            )
        }
    }
}

fn digest_value(value: &Value) -> String {
    format!("{:x}", Sha256::digest(canonical(value).as_bytes()))
}

fn push_number(bytes: &mut Vec<u8>, value: f64) {
    bytes.extend_from_slice(&value.to_be_bytes());
}

fn push_vec(bytes: &mut Vec<u8>, value: GenericAamVec3) {
    push_number(bytes, value.x);
    push_number(bytes, value.y);
    push_number(bytes, value.z);
}

fn state_code(state: &str) -> u8 {
    match state {
        "TRACKING" => 0,
        "HIT" => 1,
        "MISS_SEEKER_LIMIT" => 2,
        "MISS_OPENING_AFTER_BURN" => 3,
        "MISS_GROUND_OR_ZERO_SPEED" => 4,
        "MISS_ZERO_RELATIVE_SPEED" => 5,
        "TIME_LIMIT" => 6,
        _ => u8::MAX,
    }
}

fn cause_code(cause: &str) -> u8 {
    match cause {
        "EXACT_ZERO_RANGE" => 1,
        "CPA_HIT" => 2,
        "SEEKER_HIT" => 3,
        "OPENING_HIT" => 4,
        "SEEKER_LIMIT" => 5,
        "POST_BURN_OPEN" => 6,
        "GROUND_ZERO" => 7,
        "EXACT_ZERO_RELATIVE_SPEED" => 8,
        "TIME_LIMIT" => 9,
        _ => u8::MAX,
    }
}

fn output_digest(run: &GenericAamVerificationRun) -> String {
    const NUMBERS_PER_FRAME: usize = 31;
    let mut bytes = Vec::with_capacity(4 + run.frames.len() * (NUMBERS_PER_FRAME * 8 + 1) + 10);
    bytes.extend_from_slice(&(run.frames.len() as u32).to_be_bytes());
    for frame in &run.frames {
        for value in [
            f64::from(frame.tick),
            frame.time_seconds,
            frame.speed_mps,
            frame.pitch_rad,
            frame.yaw_rad,
            frame.pitch_rate_rad_s,
            frame.yaw_rate_rad_s,
            frame.pitch_signal_mps2,
            frame.yaw_signal_mps2,
            frame.mass_kg,
            frame.thrust_n,
            frame.drag_n,
            frame.range_m,
            frame.seeker_angle_rad,
            frame.closing_velocity_mps,
            frame.pitch_command_mps2,
            frame.yaw_command_mps2,
            frame.closest_approach_time_s,
            frame.closest_approach_distance_m,
        ] {
            push_number(&mut bytes, value);
        }
        push_vec(&mut bytes, frame.missile_position_m);
        push_vec(&mut bytes, frame.target_position_m);
        push_vec(&mut bytes, frame.relative_position_m);
        push_vec(&mut bytes, frame.los_rate_rad_s);
        bytes.push(state_code(frame.state));
    }
    push_number(&mut bytes, f64::from(run.terminal.tick));
    bytes.push(state_code(run.terminal.state));
    bytes.push(cause_code(run.terminal.cause));
    format!("{:x}", Sha256::digest(bytes))
}

fn content_digest(run: &GenericAamVerificationRun) -> String {
    digest_value(&serde_json::json!({
        "schemaVersion": run.schema_version,
        "subjectId": run.subject_id,
        "intendedUse": run.intended_use,
        "semantics": run.semantics,
        "backend": run.backend,
        "sourceSha256": run.source_sha256,
        "corpusSha256": run.corpus_sha256,
        "decisionSha256": run.decision_sha256,
        "inputSha256": run.input_sha256,
        "outputSha256": run.output_sha256,
        "caseRole": run.case_role,
        "limitations": run.limitations,
    }))
}

fn valid_constants(input: &GenericAamVerificationInput) -> bool {
    let c = &input.constants;
    let expected_thrust = if input.case_role == "PRINTED_LISTING_REPRODUCTION"
        || input.case_role == "COMMAND_LIMIT_SENSITIVITY"
    {
        6800.0
    } else if input.case_role == "TABLE_THRUST_CONFLICT_SENSITIVITY" {
        690.0 * 4.448_221_615_260_5
    } else {
        return false;
    };
    let expected_limit = if input.case_role == "COMMAND_LIMIT_SENSITIVITY" {
        1.0
    } else {
        30.0
    };
    c.navigation_constant == 4.0
        && c.gravity_mps2 == 9.8
        && c.maximum_pitch_g == expected_limit
        && c.maximum_yaw_g == expected_limit
        && c.hit_range_m == 10.0
        && c.operational_speed_mps == 700.0
        && c.motor_thrust_n == expected_thrust
        && c.coast_thrust_n == 0.0
        && c.burn_seconds == 8.0
        && c.launch_mass_kg == 56.7
        && c.burnout_mass_kg == 22.7
        && c.drag_k1 == 0.009412
        && c.drag_k2 == 93850.0 / 9.8_f64.powi(2)
        && c.control_time_constant_s == 0.25
}

fn validate(input: &GenericAamVerificationInput) -> Result<(), EngineError> {
    if input.schema_version != "vector.generic-aam-verification-input.v2"
        || input.subject_id != "NASA_TM_109057_GENERIC_AAM_REFERENCE"
        || input.intended_use != "ENGINE_VERIFICATION_ONLY"
        || input.semantics != "TM_109057_PRINTED_LISTING_BINARY64_V1"
        || input.source_sha256 != SOURCE_SHA256
        || input.corpus_sha256 != CORPUS_SHA256
        || input.decision_sha256 != DECISION_SHA256
        || input.axis_convention != "EARTH_X_FORWARD_Y_RIGHT_Z_DOWN"
        || input.units != "SI"
    {
        return Err(EngineError::InvalidScenario("identity".to_string()));
    }
    let expected_seeker_radians = match input.seeker_half_angle_deg {
        15 => 0.261_798,
        20 => 0.349_064,
        30 => 0.523_596,
        _ => return Err(EngineError::InvalidScenario("seeker".to_string())),
    };
    if !matches!(input.tick_rate_hz, 32 | 64 | 128 | 256)
        || input.max_ticks == 0
        || input.max_ticks > MAX_TICKS
        || input.max_ticks.saturating_mul(OPERATIONS_PER_TICK) > MAX_ESTIMATED_OPERATIONS
        || input.seeker_half_angle_rad != expected_seeker_radians
    {
        return Err(EngineError::InvalidScenario("bounds".to_string()));
    }
    let m = &input.missile;
    let finite = [
        m.speed_mps,
        m.pitch_rate_rad_s,
        m.pitch_signal_mps2,
        m.yaw_rate_rad_s,
        m.yaw_signal_mps2,
        m.pitch_rad,
        m.yaw_rad,
        m.mass_kg,
        input.constants.navigation_constant,
        input.constants.gravity_mps2,
        input.constants.maximum_pitch_g,
        input.constants.maximum_yaw_g,
        input.constants.hit_range_m,
        input.constants.operational_speed_mps,
        input.constants.motor_thrust_n,
        input.constants.coast_thrust_n,
        input.constants.burn_seconds,
        input.constants.launch_mass_kg,
        input.constants.burnout_mass_kg,
        input.constants.drag_k1,
        input.constants.drag_k2,
        input.constants.control_time_constant_s,
    ];
    if finite.iter().any(|value| !value.is_finite())
        || !finite_vec(m.position_m)
        || !finite_vec(input.target.previous_position_m)
        || !finite_vec(input.target.position_m)
        || !finite_vec(input.target.velocity_mps)
        || !(1.0..=1000.0).contains(&m.speed_mps)
        || m.pitch_rate_rad_s.abs() > 100.0
        || m.yaw_rate_rad_s.abs() > 100.0
        || m.pitch_signal_mps2.abs() > 1000.0
        || m.yaw_signal_mps2.abs() > 1000.0
        || m.pitch_rad.abs() > 1.5
        || m.yaw_rad.abs() > std::f64::consts::PI
        || m.position_m.x.abs() > 12_000.0
        || m.position_m.y.abs() > 12_000.0
        || m.position_m.z.abs() > 12_000.0
        || m.mass_kg != input.constants.launch_mass_kg
        || input.constants.burnout_mass_kg <= 0.0
        || m.pitch_rad.abs() >= std::f64::consts::FRAC_PI_2
        || input.target.position_m.x < 0.0
        || input.target.position_m.x > 4500.0
        || input.target.position_m.y < -4000.0
        || input.target.position_m.y > 4000.0
        || input.target.position_m.z > -2000.0
        || input.target.position_m.z < -12000.0
        || input.target.velocity_mps.x != 234.375
        || input.target.velocity_mps.y != 0.0
        || input.target.velocity_mps.z != 0.0
        || !valid_constants(input)
        || input.target.previous_position_m.x != input.target.position_m.x
        || input.target.previous_position_m.y != input.target.position_m.y
        || input.target.previous_position_m.z != input.target.position_m.z
    {
        return Err(EngineError::InvalidScenario("state".to_string()));
    }
    let initial_relative = input.target.position_m.subtract(m.position_m);
    if initial_relative.magnitude() == 0.0 {
        return Err(EngineError::InvalidScenario(
            "D09 initial zero range".to_string(),
        ));
    }
    let initial_missile_velocity = GenericAamVec3 {
        x: m.speed_mps * m.pitch_rad.cos() * m.yaw_rad.cos(),
        y: m.speed_mps * m.pitch_rad.cos() * m.yaw_rad.sin(),
        z: m.speed_mps * m.pitch_rad.sin(),
    };
    if input
        .target
        .velocity_mps
        .subtract(initial_missile_velocity)
        .magnitude()
        == 0.0
    {
        return Err(EngineError::InvalidScenario(
            "D09 initial zero relative speed".to_string(),
        ));
    }
    Ok(())
}

fn finite_stage(label: &str, values: &[f64]) -> Result<(), EngineError> {
    if values
        .iter()
        .any(|value| !value.is_finite() || value.abs() > DYNAMIC_ABS_MAX)
    {
        return Err(EngineError::InvalidScenario(format!(
            "generic AAM {label} stage exceeded finite safe bound"
        )));
    }
    Ok(())
}

fn limited_signal(
    raw: f64,
    maximum_g: f64,
    mass: f64,
    speed: f64,
    constants: &GenericAamConstants,
) -> f64 {
    let velocity_factor = (speed.powi(2) / constants.operational_speed_mps.powi(2)).min(1.0);
    let mass_speed_limit_g = constants.burnout_mass_kg / mass * velocity_factor * maximum_g;
    raw.max(-mass_speed_limit_g)
        .min(mass_speed_limit_g)
        .max(-maximum_g)
        .min(maximum_g)
}

pub fn run_generic_aam_verification(
    input: GenericAamVerificationInput,
    input_sha256: String,
) -> Result<GenericAamVerificationRun, EngineError> {
    validate(&input)?;
    let dt = 1.0 / f64::from(input.tick_rate_hz);
    let c = &input.constants;
    let mut missile = input.missile;
    let mut target = input.target.position_m;
    let mut frames = Vec::new();
    let mut terminal = None;
    for tick in 1..=input.max_ticks {
        let second = (tick - 1) / input.tick_rate_hz + 1;
        let old_target = target;
        target = target.add(input.target.velocity_mps.scale(dt));
        let current_relative = old_target.subtract(missile.position_m);
        let current_range = current_relative.magnitude();
        let thrust = if f64::from(second) <= c.burn_seconds {
            c.motor_thrust_n
        } else {
            c.coast_thrust_n
        };
        let drag = c.drag_k1 * missile.speed_mps.powi(2)
            + c.drag_k2 * (missile.pitch_rate_rad_s.powi(2) + missile.yaw_rate_rad_s.powi(2))
                / missile.speed_mps.powi(2);
        let acceleration =
            (thrust - drag) / missile.mass_kg - c.gravity_mps2 * missile.pitch_rad.sin();
        let pitch_rate_derivative =
            (missile.pitch_signal_mps2 - missile.pitch_rate_rad_s) / c.control_time_constant_s;
        let yaw_rate_derivative =
            (missile.yaw_signal_mps2 - missile.yaw_rate_rad_s) / c.control_time_constant_s;
        let pitch_derivative =
            (missile.pitch_rate_rad_s - missile.pitch_rad.cos()) / missile.speed_mps;
        let yaw_derivative = missile.yaw_rate_rad_s / (missile.speed_mps * missile.pitch_rad.cos());
        let velocity = GenericAamVec3 {
            x: missile.speed_mps * missile.pitch_rad.cos() * missile.yaw_rad.cos(),
            y: missile.speed_mps * missile.pitch_rad.cos() * missile.yaw_rad.sin(),
            z: missile.speed_mps * missile.pitch_rad.sin(),
        };
        finite_stage(
            "pre-integration",
            &[
                target.x,
                target.y,
                target.z,
                current_relative.x,
                current_relative.y,
                current_relative.z,
                current_range,
                thrust,
                drag,
                acceleration,
                pitch_rate_derivative,
                yaw_rate_derivative,
                pitch_derivative,
                yaw_derivative,
                velocity.x,
                velocity.y,
                velocity.z,
            ],
        )?;
        missile.speed_mps += acceleration * dt;
        missile.pitch_rate_rad_s += pitch_rate_derivative * dt;
        missile.yaw_rate_rad_s += yaw_rate_derivative * dt;
        missile.pitch_rad += pitch_derivative * dt;
        missile.yaw_rad += yaw_derivative * dt;
        missile.position_m.x += velocity.x * dt;
        missile.position_m.y += velocity.y * dt;
        missile.position_m.z -= velocity.z * dt;
        if f64::from(second) <= c.burn_seconds {
            if tick == (c.burn_seconds * f64::from(input.tick_rate_hz)) as u32 {
                missile.mass_kg = c.burnout_mass_kg;
            } else {
                missile.mass_kg -= (c.launch_mass_kg - c.burnout_mass_kg) / c.burn_seconds * dt;
            }
        }
        finite_stage(
            "integrated-state",
            &[
                missile.speed_mps,
                missile.pitch_rate_rad_s,
                missile.yaw_rate_rad_s,
                missile.pitch_rad,
                missile.yaw_rad,
                missile.position_m.x,
                missile.position_m.y,
                missile.position_m.z,
                missile.mass_kg,
            ],
        )?;
        let relative = target.subtract(missile.position_m);
        let range = relative.magnitude();
        let relative_velocity = current_relative
            .subtract(relative)
            .scale(f64::from(input.tick_rate_hz));
        let closing_velocity = -(current_range - range) * f64::from(input.tick_rate_hz);
        let range_squared = range * range;
        let relative_speed_squared = relative_velocity.dot(relative_velocity);
        let zero_range = range_squared == 0.0;
        let zero_relative_speed = relative_speed_squared == 0.0;
        let los_rate = if zero_range {
            GenericAamVec3 {
                x: 0.0,
                y: 0.0,
                z: 0.0,
            }
        } else {
            GenericAamVec3 {
                x: (relative.y * relative_velocity.z - relative.z * relative_velocity.y)
                    / range_squared,
                y: (relative.z * relative_velocity.x - relative.x * relative_velocity.z)
                    / range_squared,
                z: (relative.x * relative_velocity.y - relative.y * relative_velocity.x)
                    / range_squared,
            }
        };
        let pitch_offset = -missile.yaw_rad.sin() * los_rate.x + missile.yaw_rad.cos() * los_rate.y;
        let yaw_offset = missile.pitch_rad.sin()
            * (missile.yaw_rad.cos() * los_rate.x + missile.yaw_rad.sin() * los_rate.y)
            + missile.pitch_rad.cos() * los_rate.z;
        let pitch_command = c.gravity_mps2
            * limited_signal(
                c.navigation_constant * closing_velocity * pitch_offset,
                c.maximum_pitch_g,
                missile.mass_kg,
                missile.speed_mps,
                c,
            );
        let yaw_command = c.gravity_mps2
            * limited_signal(
                c.navigation_constant * closing_velocity * yaw_offset,
                c.maximum_yaw_g,
                missile.mass_kg,
                missile.speed_mps,
                c,
            );
        missile.pitch_signal_mps2 = pitch_command;
        missile.yaw_signal_mps2 = yaw_command;
        let closest_time = if zero_range || zero_relative_speed {
            0.0
        } else {
            -relative.dot(relative_velocity) / relative_speed_squared
        };
        let closest_distance = if zero_range {
            0.0
        } else if zero_relative_speed {
            range
        } else {
            relative
                .add(relative_velocity.scale(closest_time))
                .magnitude()
        };
        let seeker_angle = if zero_range {
            0.0
        } else {
            (relative.y.hypot(relative.z) / relative.x.abs()).atan()
        };
        finite_stage(
            "guidance-and-terminal",
            &[
                relative.x,
                relative.y,
                relative.z,
                range,
                relative_velocity.x,
                relative_velocity.y,
                relative_velocity.z,
                relative_speed_squared,
                closing_velocity,
                los_rate.x,
                los_rate.y,
                los_rate.z,
                pitch_offset,
                yaw_offset,
                pitch_command,
                yaw_command,
                closest_time,
                closest_distance,
                seeker_angle,
            ],
        )?;
        let mut state = "TRACKING";
        let mut cause = "tracking";
        if missile.position_m.z > 0.0 || missile.speed_mps <= 0.0 {
            state = "MISS_GROUND_OR_ZERO_SPEED";
            cause = "GROUND_ZERO";
        } else if zero_range {
            state = "HIT";
            cause = "EXACT_ZERO_RANGE";
        } else if zero_relative_speed {
            state = "MISS_ZERO_RELATIVE_SPEED";
            cause = "EXACT_ZERO_RELATIVE_SPEED";
        } else if closest_distance < c.hit_range_m && closest_time >= 0.0 && closest_time <= dt {
            state = "HIT";
            cause = "CPA_HIT";
        } else if seeker_angle.abs() > input.seeker_half_angle_rad {
            if range < c.hit_range_m {
                state = "HIT";
                cause = "SEEKER_HIT";
            } else {
                state = "MISS_SEEKER_LIMIT";
                cause = "SEEKER_LIMIT";
            }
        } else if closing_velocity > 0.0 && f64::from(second) > c.burn_seconds {
            if range < c.hit_range_m {
                state = "HIT";
                cause = "OPENING_HIT";
            } else {
                state = "MISS_OPENING_AFTER_BURN";
                cause = "POST_BURN_OPEN";
            }
        } else if tick == input.max_ticks {
            state = "TIME_LIMIT";
            cause = "TIME_LIMIT";
        }
        frames.push(GenericAamVerificationFrame {
            tick,
            time_seconds: f64::from(tick) / f64::from(input.tick_rate_hz),
            missile_position_m: missile.position_m,
            target_position_m: target,
            speed_mps: missile.speed_mps,
            pitch_rad: missile.pitch_rad,
            yaw_rad: missile.yaw_rad,
            pitch_rate_rad_s: missile.pitch_rate_rad_s,
            yaw_rate_rad_s: missile.yaw_rate_rad_s,
            pitch_signal_mps2: missile.pitch_signal_mps2,
            yaw_signal_mps2: missile.yaw_signal_mps2,
            mass_kg: missile.mass_kg,
            thrust_n: thrust,
            drag_n: drag,
            relative_position_m: relative,
            range_m: range,
            seeker_angle_rad: seeker_angle,
            los_rate_rad_s: los_rate,
            closing_velocity_mps: closing_velocity,
            pitch_command_mps2: pitch_command,
            yaw_command_mps2: yaw_command,
            closest_approach_time_s: closest_time,
            closest_approach_distance_m: closest_distance,
            state,
        });
        if state != "TRACKING" {
            terminal = Some(GenericAamTerminal { state, tick, cause });
            break;
        }
    }
    let terminal = terminal.ok_or_else(|| EngineError::InvalidScenario("terminal".to_string()))?;
    let mut run = GenericAamVerificationRun {
        schema_version: "vector.generic-aam-verification-run.v3",
        subject_id: input.subject_id,
        intended_use: input.intended_use,
        semantics: input.semantics,
        backend: "rust-wasm",
        source_sha256: input.source_sha256,
        corpus_sha256: input.corpus_sha256,
        decision_sha256: input.decision_sha256,
        input_sha256,
        output_sha256: String::new(),
        content_sha256: String::new(),
        case_role: input.case_role,
        frames,
        terminal,
        limitations: [
            "GENERIC_VERIFICATION_ONLY",
            "LITERAL_PITCH_AMBIGUITY",
            "FIGURES_NOT_VALIDATION",
            "NOT_FORTRAN_BIT_REPRODUCTION",
        ],
    };
    run.output_sha256 = output_digest(&run);
    run.content_sha256 = content_digest(&run);
    Ok(run)
}

pub fn run_generic_aam_verification_json(input: &str) -> Result<String, EngineError> {
    let input_sha256 = format!("{:x}", Sha256::digest(input.as_bytes()));
    let decoded =
        serde_json::from_str(input).map_err(|error| EngineError::InvalidJson(error.to_string()))?;
    let run = run_generic_aam_verification(decoded, input_sha256)?;
    serde_json::to_string(&run).map_err(|error| EngineError::Serialization(error.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn valid_input() -> serde_json::Value {
        serde_json::json!({
            "schemaVersion": "vector.generic-aam-verification-input.v2",
            "subjectId": "NASA_TM_109057_GENERIC_AAM_REFERENCE",
            "intendedUse": "ENGINE_VERIFICATION_ONLY",
            "semantics": "TM_109057_PRINTED_LISTING_BINARY64_V1",
            "sourceSha256": SOURCE_SHA256,
            "corpusSha256": CORPUS_SHA256,
            "decisionSha256": DECISION_SHA256,
            "caseRole": "PRINTED_LISTING_REPRODUCTION",
            "axisConvention": "EARTH_X_FORWARD_Y_RIGHT_Z_DOWN",
            "units": "SI",
            "tickRateHz": 128,
            "maxTicks": 1,
            "seekerHalfAngleDeg": 15,
            "seekerHalfAngleRad": 0.261798,
            "missile": {
                "speedMps": 200.0,
                "pitchRateRadS": 0.0,
                "pitchSignalMps2": 0.0,
                "yawRateRadS": 0.0,
                "yawSignalMps2": 0.0,
                "pitchRad": 0.0,
                "yawRad": 0.0,
                "positionM": {"x": 0.0, "y": 0.0, "z": -6000.0},
                "massKg": 56.7
            },
            "target": {
                "previousPositionM": {"x": 1000.0, "y": 0.0, "z": -6000.0},
                "positionM": {"x": 1000.0, "y": 0.0, "z": -6000.0},
                "velocityMps": {"x": 234.375, "y": 0.0, "z": 0.0}
            },
            "constants": {
                "navigationConstant": 4.0,
                "gravityMps2": 9.8,
                "maximumPitchG": 30.0,
                "maximumYawG": 30.0,
                "hitRangeM": 10.0,
                "operationalSpeedMps": 700.0,
                "motorThrustN": 6800.0,
                "coastThrustN": 0.0,
                "burnSeconds": 8.0,
                "launchMassKg": 56.7,
                "burnoutMassKg": 22.7,
                "dragK1": 0.009412,
                "dragK2": 93850.0 / 9.8_f64.powi(2),
                "controlTimeConstantS": 0.25
            }
        })
    }

    #[test]
    fn generic_reference_native_path_emits_the_closed_v3_contract(
    ) -> Result<(), Box<dyn std::error::Error>> {
        let output = run_generic_aam_verification_json(&serde_json::to_string(&valid_input())?)?;
        let decoded: serde_json::Value = serde_json::from_str(&output)?;
        assert_eq!(
            decoded["schemaVersion"],
            "vector.generic-aam-verification-run.v3"
        );
        assert_eq!(decoded["frames"].as_array().map(Vec::len), Some(1));
        Ok(())
    }

    #[test]
    fn generic_reference_native_path_rejects_literal_extreme_d09_and_local_dto_forgery(
    ) -> Result<(), Box<dyn std::error::Error>> {
        let mut cases = Vec::new();
        let mut literal = valid_input();
        literal["seekerHalfAngleRad"] = serde_json::json!(15.0 * std::f64::consts::PI / 180.0);
        cases.push(literal);
        let mut extreme = valid_input();
        extreme["missile"]["pitchRateRadS"] = serde_json::json!(1e308);
        cases.push(extreme);
        let mut zero_range = valid_input();
        zero_range["target"]["previousPositionM"] = zero_range["missile"]["positionM"].clone();
        zero_range["target"]["positionM"] = zero_range["missile"]["positionM"].clone();
        cases.push(zero_range);
        let mut forged_vector = valid_input();
        forged_vector["missile"]["positionM"]["extra"] = serde_json::json!(1.0);
        cases.push(forged_vector);
        for candidate in cases {
            assert!(
                run_generic_aam_verification_json(&serde_json::to_string(&candidate)?).is_err()
            );
        }
        Ok(())
    }
}
