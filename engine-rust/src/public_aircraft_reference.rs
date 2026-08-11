use serde::{Deserialize, Serialize};

use crate::EngineError;

#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
pub struct Axis3 {
    pub x: f64,
    pub y: f64,
    pub z: f64,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
pub struct Ned3 {
    pub north: f64,
    pub east: f64,
    pub down: f64,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
pub struct Attitude {
    pub yaw: f64,
    pub pitch: f64,
    pub roll: f64,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
pub struct BodyRates {
    pub roll: f64,
    pub pitch: f64,
    pub yaw: f64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicAircraftInitialState {
    pub latitude_deg: f64,
    pub longitude_deg: f64,
    pub altitude_msl_m: f64,
    pub velocity_ned_mps: Ned3,
    pub attitude_deg: Attitude,
    pub body_angular_rate_rad_s: BodyRates,
    pub mach: f64,
    pub dynamic_pressure_pa: f64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicAircraftTrim {
    pub mass_kg: f64,
    pub aerodynamic_body_force_n: Axis3,
    pub aerodynamic_body_moment_nm: BodyRates,
    pub required_thrust_n: f64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicAircraftReferenceInput {
    pub schema_version: String,
    pub case_id: String,
    pub duration_seconds: f64,
    pub sample_interval_seconds: f64,
    pub earth_radius_m: f64,
    pub gravity_mps2: f64,
    pub initial_state: PublicAircraftInitialState,
    pub trim: PublicAircraftTrim,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicAircraftReferenceFrame {
    pub time_seconds: f64,
    pub latitude_deg: f64,
    pub longitude_deg: f64,
    pub altitude_msl_m: f64,
    pub velocity_ned_mps: Ned3,
    pub attitude_deg: Attitude,
    pub body_angular_rate_rad_s: BodyRates,
    pub aerodynamic_body_force_n: Axis3,
    pub aerodynamic_body_moment_nm: BodyRates,
    pub mach: f64,
    pub dynamic_pressure_pa: f64,
    pub specific_energy_jkg: f64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicAircraftReferenceRun {
    pub schema_version: &'static str,
    pub case_id: String,
    pub backend: &'static str,
    pub frames: Vec<PublicAircraftReferenceFrame>,
    pub trim_force_residual_n: f64,
}

fn magnitude_axis(value: Axis3) -> f64 {
    (value.x * value.x + value.y * value.y + value.z * value.z).sqrt()
}

fn validate(input: &PublicAircraftReferenceInput) -> Result<(), EngineError> {
    if input.schema_version != "vector.public-aircraft-reference.v1" {
        return Err(EngineError::InvalidScenario(
            "unsupported public aircraft reference schema".to_string(),
        ));
    }
    let sample_count = input.duration_seconds / input.sample_interval_seconds;
    if !input.duration_seconds.is_finite()
        || input.duration_seconds <= 0.0
        || !input.sample_interval_seconds.is_finite()
        || input.sample_interval_seconds <= 0.0
        || !sample_count.is_finite()
        || sample_count > 10_000.0
        || !input.earth_radius_m.is_finite()
        || input.earth_radius_m < 6_000_000.0
    {
        return Err(EngineError::InvalidScenario(
            "invalid public aircraft reference propagation bounds".to_string(),
        ));
    }
    let scalars = [
        input.gravity_mps2,
        input.initial_state.latitude_deg,
        input.initial_state.longitude_deg,
        input.initial_state.altitude_msl_m,
        input.initial_state.velocity_ned_mps.north,
        input.initial_state.velocity_ned_mps.east,
        input.initial_state.velocity_ned_mps.down,
        input.trim.mass_kg,
        input.trim.required_thrust_n,
    ];
    if scalars.iter().any(|value| !value.is_finite()) {
        return Err(EngineError::InvalidScenario(
            "public aircraft reference state must be finite".to_string(),
        ));
    }
    Ok(())
}

pub fn run_public_aircraft_reference(
    input: PublicAircraftReferenceInput,
) -> Result<PublicAircraftReferenceRun, EngineError> {
    validate(&input)?;
    let horizontal_speed = input
        .initial_state
        .velocity_ned_mps
        .north
        .hypot(input.initial_state.velocity_ned_mps.east);
    let speed = horizontal_speed.hypot(input.initial_state.velocity_ned_mps.down);
    let bearing = input
        .initial_state
        .velocity_ned_mps
        .east
        .atan2(input.initial_state.velocity_ned_mps.north);
    let initial_latitude = input.initial_state.latitude_deg.to_radians();
    let initial_longitude = input.initial_state.longitude_deg.to_radians();
    let frame_count = (input.duration_seconds / input.sample_interval_seconds).floor() as usize + 1;
    let mut frames = Vec::with_capacity(frame_count);
    for index in 0..frame_count {
        let time_seconds = input
            .duration_seconds
            .min(index as f64 * input.sample_interval_seconds);
        let angular_distance = horizontal_speed * time_seconds / input.earth_radius_m;
        let latitude = (initial_latitude.sin() * angular_distance.cos()
            + initial_latitude.cos() * angular_distance.sin() * bearing.cos())
        .asin();
        let longitude = initial_longitude
            + (bearing.sin() * angular_distance.sin() * initial_latitude.cos())
                .atan2(angular_distance.cos() - initial_latitude.sin() * latitude.sin());
        frames.push(PublicAircraftReferenceFrame {
            time_seconds,
            latitude_deg: latitude.to_degrees(),
            longitude_deg: longitude.to_degrees(),
            altitude_msl_m: input.initial_state.altitude_msl_m,
            velocity_ned_mps: input.initial_state.velocity_ned_mps,
            attitude_deg: input.initial_state.attitude_deg,
            body_angular_rate_rad_s: input.initial_state.body_angular_rate_rad_s,
            aerodynamic_body_force_n: input.trim.aerodynamic_body_force_n,
            aerodynamic_body_moment_nm: input.trim.aerodynamic_body_moment_nm,
            mach: input.initial_state.mach,
            dynamic_pressure_pa: input.initial_state.dynamic_pressure_pa,
            specific_energy_jkg: input.gravity_mps2 * input.initial_state.altitude_msl_m
                + 0.5 * speed * speed,
        });
    }
    let pitch = input.initial_state.attitude_deg.pitch.to_radians();
    let gravity_body_x = -input.trim.mass_kg * input.gravity_mps2 * pitch.sin();
    let gravity_body_z = input.trim.mass_kg * input.gravity_mps2 * pitch.cos();
    let force_residual = Axis3 {
        x: input.trim.aerodynamic_body_force_n.x + gravity_body_x + input.trim.required_thrust_n,
        y: input.trim.aerodynamic_body_force_n.y,
        z: input.trim.aerodynamic_body_force_n.z + gravity_body_z,
    };
    Ok(PublicAircraftReferenceRun {
        schema_version: "vector.public-aircraft-reference-run.v1",
        case_id: input.case_id,
        backend: "rust-wasm",
        frames,
        trim_force_residual_n: magnitude_axis(force_residual),
    })
}

pub fn run_public_aircraft_reference_json(input: &str) -> Result<String, EngineError> {
    let decoded =
        serde_json::from_str(input).map_err(|error| EngineError::InvalidJson(error.to_string()))?;
    let run = run_public_aircraft_reference(decoded)?;
    serde_json::to_string(&run).map_err(|error| EngineError::Serialization(error.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn input() -> PublicAircraftReferenceInput {
        PublicAircraftReferenceInput {
            schema_version: "vector.public-aircraft-reference.v1".to_string(),
            case_id: "trim-case".to_string(),
            duration_seconds: 180.0,
            sample_interval_seconds: 60.0,
            earth_radius_m: 6_378_137.0,
            gravity_mps2: 9.806_635_2,
            initial_state: PublicAircraftInitialState {
                latitude_deg: 36.019_166_666_7,
                longitude_deg: -75.674_444_444_4,
                altitude_msl_m: 3_051.962_4,
                velocity_ned_mps: Ned3 {
                    north: 121.923_141_304_461_61,
                    east: 121.923_141_304_461_61,
                    down: 0.0,
                },
                attitude_deg: Attitude {
                    yaw: 45.0,
                    pitch: 2.638_726_396_35,
                    roll: 0.0,
                },
                body_angular_rate_rad_s: BodyRates {
                    roll: 0.000_043_635_209_549_756_63,
                    pitch: -0.000_068_890_659_654_412_24,
                    yaw: -0.000_040_916_207_476_760_5,
                },
                mach: 0.525_083_366_639,
                dynamic_pressure_pa: 13_444.193_911_243_801,
            },
            trim: PublicAircraftTrim {
                mass_kg: 9_298.643_898_518_96,
                aerodynamic_body_force_n: Axis3 {
                    x: -6_318.440_737_653_328,
                    y: 0.0,
                    z: -90_749.515_159_863_2,
                },
                aerodynamic_body_moment_nm: BodyRates {
                    roll: 0.0,
                    pitch: 0.0,
                    yaw: 0.0,
                },
                required_thrust_n: 10_516.589_565_202_074,
            },
        }
    }

    #[test]
    fn propagates_the_public_trim_case_deterministically() -> Result<(), EngineError> {
        let first = run_public_aircraft_reference(input())?;
        let second = run_public_aircraft_reference(input())?;
        assert_eq!(first.frames.len(), 4);
        assert_eq!(
            serde_json::to_string(&first).ok(),
            serde_json::to_string(&second).ok()
        );
        let last = first.frames.last().ok_or_else(|| {
            EngineError::InvalidScenario("reference run produced no frames".to_string())
        })?;
        assert!((last.latitude_deg - 36.216_064_818_7).abs() < 1.0e-9);
        assert!((last.longitude_deg + 75.430_087_879).abs() < 1.0e-9);
        assert!(first.trim_force_residual_n < 400.0);
        Ok(())
    }
}
