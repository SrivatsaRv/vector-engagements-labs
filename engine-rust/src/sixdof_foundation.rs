use serde::{Deserialize, Serialize};

use crate::EngineError;

const MINIMUM_FIXED_STEP_SECONDS: f64 = 1.0e-6;
const MAXIMUM_FIXED_STEP_SECONDS: f64 = 1.0;
const MAXIMUM_TICK_COUNT: u32 = 100_000;
const MAXIMUM_MASS_KG: f64 = 1.0e9;
const MAXIMUM_INERTIA_KG_M2: f64 = 1.0e15;
const MAXIMUM_ABSOLUTE_STATE: f64 = 1.0e9;
const MAXIMUM_ABSOLUTE_WRENCH: f64 = 1.0e12;
const MAXIMUM_ANGULAR_INCREMENT_RAD: f64 = 0.25;
const MINIMUM_STAGE_QUATERNION_NORM: f64 = 0.5;
const MAXIMUM_STAGE_QUATERNION_NORM: f64 = 2.0;
const MINIMUM_RELATIVE_CHOLESKY_PIVOT: f64 = 1.0e-10;

#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Vector3 {
    pub x: f64,
    pub y: f64,
    pub z: f64,
}

impl Vector3 {
    fn add(self, other: Self) -> Self {
        Self {
            x: self.x + other.x,
            y: self.y + other.y,
            z: self.z + other.z,
        }
    }

    fn scale(self, factor: f64) -> Self {
        Self {
            x: self.x * factor,
            y: self.y * factor,
            z: self.z * factor,
        }
    }

    fn subtract(self, other: Self) -> Self {
        self.add(other.scale(-1.0))
    }

    fn cross(self, other: Self) -> Self {
        Self {
            x: self.y * other.z - self.z * other.y,
            y: self.z * other.x - self.x * other.z,
            z: self.x * other.y - self.y * other.x,
        }
    }

    fn dot(self, other: Self) -> f64 {
        self.x * other.x + self.y * other.y + self.z * other.z
    }

    fn magnitude(self) -> f64 {
        self.x.hypot(self.y).hypot(self.z)
    }

    fn is_finite_and_bounded(self, bound: f64) -> bool {
        [self.x, self.y, self.z]
            .iter()
            .all(|value| value.is_finite() && value.abs() <= bound)
    }

    fn is_exact_zero(self) -> bool {
        self.x == 0.0 && self.y == 0.0 && self.z == 0.0
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Quaternion {
    pub w: f64,
    pub x: f64,
    pub y: f64,
    pub z: f64,
}

impl Quaternion {
    fn magnitude(self) -> f64 {
        self.w.hypot(self.x).hypot(self.y).hypot(self.z)
    }

    fn normalize(self) -> Result<Self, EngineError> {
        let magnitude = self.magnitude();
        if !magnitude.is_finite() || !(1.0e-12..=1.0e6).contains(&magnitude) {
            return Err(invalid("the body-to-world quaternion has an invalid norm"));
        }
        Ok(Self {
            w: self.w / magnitude,
            x: self.x / magnitude,
            y: self.y / magnitude,
            z: self.z / magnitude,
        })
    }

    fn add_scaled(self, derivative: Self, factor: f64) -> Self {
        Self {
            w: self.w + derivative.w * factor,
            x: self.x + derivative.x * factor,
            y: self.y + derivative.y * factor,
            z: self.z + derivative.z * factor,
        }
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct InertiaTensor {
    pub xx: f64,
    pub xy: f64,
    pub xz: f64,
    pub yx: f64,
    pub yy: f64,
    pub yz: f64,
    pub zx: f64,
    pub zy: f64,
    pub zz: f64,
}

impl InertiaTensor {
    fn determinant(self) -> f64 {
        self.xx * (self.yy * self.zz - self.yz * self.zy)
            - self.xy * (self.yx * self.zz - self.yz * self.zx)
            + self.xz * (self.yx * self.zy - self.yy * self.zx)
    }

    fn multiply(self, value: Vector3) -> Vector3 {
        Vector3 {
            x: self.xx * value.x + self.xy * value.y + self.xz * value.z,
            y: self.yx * value.x + self.yy * value.y + self.yz * value.z,
            z: self.zx * value.x + self.zy * value.y + self.zz * value.z,
        }
    }

    fn solve(self, value: Vector3) -> Vector3 {
        let determinant = self.determinant();
        Vector3 {
            x: ((self.yy * self.zz - self.yz * self.zy) * value.x
                + (self.xz * self.zy - self.xy * self.zz) * value.y
                + (self.xy * self.yz - self.xz * self.yy) * value.z)
                / determinant,
            y: ((self.yz * self.zx - self.yx * self.zz) * value.x
                + (self.xx * self.zz - self.xz * self.zx) * value.y
                + (self.xz * self.yx - self.xx * self.yz) * value.z)
                / determinant,
            z: ((self.yx * self.zy - self.yy * self.zx) * value.x
                + (self.xy * self.zx - self.xx * self.zy) * value.y
                + (self.xx * self.yy - self.xy * self.yx) * value.z)
                / determinant,
        }
    }

    fn validate(self) -> Result<(), EngineError> {
        let values = [
            self.xx, self.xy, self.xz, self.yx, self.yy, self.yz, self.zx, self.zy, self.zz,
        ];
        if values
            .iter()
            .any(|value| !value.is_finite() || value.abs() > MAXIMUM_INERTIA_KG_M2)
        {
            return Err(invalid("inertia tensor values must be finite and bounded"));
        }
        if self.xy != self.yx || self.xz != self.zx || self.yz != self.zy {
            return Err(invalid("the inertia tensor must be exactly symmetric"));
        }
        let scale = self.xx.max(self.yy).max(self.zz);
        let minimum_pivot = scale * MINIMUM_RELATIVE_CHOLESKY_PIVOT;
        let first_pivot = self.xx;
        if !scale.is_finite() || scale <= 0.0 || first_pivot < minimum_pivot {
            return Err(invalid(
                "the inertia tensor must be well-conditioned positive definite by the Cholesky pivot bound",
            ));
        }
        let first_root = first_pivot.sqrt();
        let lower_21 = self.yx / first_root;
        let lower_31 = self.zx / first_root;
        let second_pivot = self.yy - lower_21 * lower_21;
        if !second_pivot.is_finite() || second_pivot < minimum_pivot {
            return Err(invalid(
                "the inertia tensor must be well-conditioned positive definite by the Cholesky pivot bound",
            ));
        }
        let second_root = second_pivot.sqrt();
        let lower_32 = (self.zy - lower_31 * lower_21) / second_root;
        let third_pivot = self.zz - lower_31 * lower_31 - lower_32 * lower_32;
        if !third_pivot.is_finite() || third_pivot < minimum_pivot {
            return Err(invalid(
                "the inertia tensor must be well-conditioned positive definite by the Cholesky pivot bound",
            ));
        }
        Ok(())
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FrameConvention {
    pub world_frame: String,
    pub body_frame: String,
    pub attitude: String,
    pub state_reference: String,
    pub units: String,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MassProperties {
    pub mass_kg: f64,
    pub cg_body_m: Vector3,
    pub inertia_kg_m2: InertiaTensor,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SixDofState {
    pub position_world_m: Vector3,
    pub velocity_body_mps: Vector3,
    pub angular_rate_body_rad_s: Vector3,
    pub body_to_world_quaternion: Quaternion,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AppliedWrench {
    pub body_force_n: Vector3,
    pub body_moment_nm: Vector3,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SixDofVerificationInput {
    pub schema_version: String,
    pub frame_convention: FrameConvention,
    pub fixed_step_seconds: f64,
    pub tick_count: u32,
    pub mass_properties: MassProperties,
    pub initial_state: SixDofState,
    pub applied_wrench: AppliedWrench,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SixDofFrame {
    pub tick: u32,
    pub time_seconds: f64,
    pub state: SixDofState,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SixDofDiagnostics {
    pub maximum_quaternion_norm_error: f64,
    pub conservation_state: &'static str,
    pub relative_rotational_energy_drift: Option<f64>,
    pub relative_inertial_angular_momentum_drift: Option<f64>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SixDofVerificationRun {
    pub schema_version: &'static str,
    pub backend: &'static str,
    pub numerical_method: &'static str,
    pub fixed_step_seconds: f64,
    pub tick_count: u32,
    pub frames: Vec<SixDofFrame>,
    pub diagnostics: SixDofDiagnostics,
}

fn invalid(message: &str) -> EngineError {
    EngineError::InvalidScenario(message.to_string())
}

fn validate(input: &SixDofVerificationInput) -> Result<(), EngineError> {
    if input.schema_version != "vector.sixdof-verification-input.v1" {
        return Err(invalid("unsupported six-DOF verification schema"));
    }
    if input.frame_convention.world_frame != "RIGHT_HANDED_INERTIAL_XYZ"
        || input.frame_convention.body_frame != "RIGHT_HANDED_X_FORWARD_Y_RIGHT_Z_DOWN"
        || input.frame_convention.attitude != "BODY_TO_WORLD_SCALAR_FIRST_QUATERNION"
        || input.frame_convention.state_reference != "CENTER_OF_GRAVITY"
        || input.frame_convention.units != "SI"
    {
        return Err(invalid(
            "unsupported six-DOF frame, reference, attitude, or unit convention",
        ));
    }
    if !input.fixed_step_seconds.is_finite()
        || !(MINIMUM_FIXED_STEP_SECONDS..=MAXIMUM_FIXED_STEP_SECONDS)
            .contains(&input.fixed_step_seconds)
    {
        return Err(invalid("fixedStepSeconds is outside its declared bound"));
    }
    if input.tick_count > MAXIMUM_TICK_COUNT {
        return Err(invalid("tickCount exceeds its declared work bound"));
    }
    if !input.mass_properties.mass_kg.is_finite()
        || !(0.0..=MAXIMUM_MASS_KG).contains(&input.mass_properties.mass_kg)
        || input.mass_properties.mass_kg == 0.0
    {
        return Err(invalid("massKg must be finite, positive, and bounded"));
    }
    if !input
        .mass_properties
        .cg_body_m
        .is_finite_and_bounded(MAXIMUM_ABSOLUTE_STATE)
    {
        return Err(invalid("cgBodyM must be finite and bounded"));
    }
    if !input.mass_properties.cg_body_m.is_exact_zero() {
        return Err(invalid(
            "cgBodyM must be the exact zero vector for this CG origin kernel",
        ));
    }
    input.mass_properties.inertia_kg_m2.validate()?;
    if !input
        .initial_state
        .position_world_m
        .is_finite_and_bounded(MAXIMUM_ABSOLUTE_STATE)
        || !input
            .initial_state
            .velocity_body_mps
            .is_finite_and_bounded(MAXIMUM_ABSOLUTE_STATE)
        || !input
            .initial_state
            .angular_rate_body_rad_s
            .is_finite_and_bounded(MAXIMUM_ABSOLUTE_STATE)
    {
        return Err(invalid("initial state must be finite and bounded"));
    }
    input.initial_state.body_to_world_quaternion.normalize()?;
    validate_angular_increment(
        input.initial_state.angular_rate_body_rad_s,
        input.fixed_step_seconds,
        "initial state",
    )?;
    if !input
        .applied_wrench
        .body_force_n
        .is_finite_and_bounded(MAXIMUM_ABSOLUTE_WRENCH)
        || !input
            .applied_wrench
            .body_moment_nm
            .is_finite_and_bounded(MAXIMUM_ABSOLUTE_WRENCH)
    {
        return Err(invalid("applied wrench must be finite and bounded"));
    }
    Ok(())
}

fn validate_angular_increment(
    angular_rate: Vector3,
    step_seconds: f64,
    label: &str,
) -> Result<(), EngineError> {
    let increment = angular_rate.magnitude() * step_seconds;
    if !increment.is_finite() || increment > MAXIMUM_ANGULAR_INCREMENT_RAD {
        return Err(invalid(&format!(
            "{label} angular increment exceeds the fixed-step bound"
        )));
    }
    Ok(())
}

fn validate_integration_stage(
    state: SixDofState,
    step_seconds: f64,
    label: &str,
) -> Result<(), EngineError> {
    if !state
        .position_world_m
        .is_finite_and_bounded(MAXIMUM_ABSOLUTE_STATE)
        || !state
            .velocity_body_mps
            .is_finite_and_bounded(MAXIMUM_ABSOLUTE_STATE)
        || !state
            .angular_rate_body_rad_s
            .is_finite_and_bounded(MAXIMUM_ABSOLUTE_STATE)
    {
        return Err(invalid(&format!(
            "{label} state is outside the finite state bound"
        )));
    }
    validate_stage_quaternion(state.body_to_world_quaternion, label)?;
    validate_angular_increment(state.angular_rate_body_rad_s, step_seconds, label)
}

fn validate_stage_quaternion(quaternion: Quaternion, label: &str) -> Result<(), EngineError> {
    let quaternion_norm = quaternion.magnitude();
    if !quaternion_norm.is_finite()
        || !(MINIMUM_STAGE_QUATERNION_NORM..=MAXIMUM_STAGE_QUATERNION_NORM)
            .contains(&quaternion_norm)
    {
        return Err(invalid(&format!(
            "{label} quaternion is outside the RK4 stage norm bound"
        )));
    }
    Ok(())
}

fn rotate_body_to_world(quaternion: Quaternion, vector: Vector3) -> Vector3 {
    let quaternion_vector = Vector3 {
        x: quaternion.x,
        y: quaternion.y,
        z: quaternion.z,
    };
    let norm_squared = quaternion.w * quaternion.w + quaternion_vector.dot(quaternion_vector);
    let twice_cross = quaternion_vector.cross(vector).scale(2.0 / norm_squared);
    vector.add(
        twice_cross
            .scale(quaternion.w)
            .add(quaternion_vector.cross(twice_cross)),
    )
}

fn quaternion_derivative(quaternion: Quaternion, omega: Vector3) -> Quaternion {
    Quaternion {
        w: -0.5 * (quaternion.x * omega.x + quaternion.y * omega.y + quaternion.z * omega.z),
        x: 0.5 * (quaternion.w * omega.x + quaternion.y * omega.z - quaternion.z * omega.y),
        y: 0.5 * (quaternion.w * omega.y + quaternion.z * omega.x - quaternion.x * omega.z),
        z: 0.5 * (quaternion.w * omega.z + quaternion.x * omega.y - quaternion.y * omega.x),
    }
}

fn derivative(input: &SixDofVerificationInput, state: SixDofState) -> SixDofState {
    let angular_momentum_body = input
        .mass_properties
        .inertia_kg_m2
        .multiply(state.angular_rate_body_rad_s);
    SixDofState {
        position_world_m: rotate_body_to_world(
            state.body_to_world_quaternion,
            state.velocity_body_mps,
        ),
        velocity_body_mps: input
            .applied_wrench
            .body_force_n
            .scale(1.0 / input.mass_properties.mass_kg)
            .subtract(state.angular_rate_body_rad_s.cross(state.velocity_body_mps)),
        angular_rate_body_rad_s: input.mass_properties.inertia_kg_m2.solve(
            input
                .applied_wrench
                .body_moment_nm
                .subtract(state.angular_rate_body_rad_s.cross(angular_momentum_body)),
        ),
        body_to_world_quaternion: quaternion_derivative(
            state.body_to_world_quaternion,
            state.angular_rate_body_rad_s,
        ),
    }
}

fn advance(state: SixDofState, derivative: SixDofState, factor: f64) -> SixDofState {
    SixDofState {
        position_world_m: state
            .position_world_m
            .add(derivative.position_world_m.scale(factor)),
        velocity_body_mps: state
            .velocity_body_mps
            .add(derivative.velocity_body_mps.scale(factor)),
        angular_rate_body_rad_s: state
            .angular_rate_body_rad_s
            .add(derivative.angular_rate_body_rad_s.scale(factor)),
        body_to_world_quaternion: state
            .body_to_world_quaternion
            .add_scaled(derivative.body_to_world_quaternion, factor),
    }
}

fn combined_vector(
    first: Vector3,
    second: Vector3,
    third: Vector3,
    fourth: Vector3,
    factor: f64,
) -> Vector3 {
    first
        .add(second.scale(2.0))
        .add(third.scale(2.0).add(fourth))
        .scale(factor)
}

fn rk4(input: &SixDofVerificationInput, state: SixDofState) -> Result<SixDofState, EngineError> {
    let step = input.fixed_step_seconds;
    validate_integration_stage(state, step, "RK4 stage 1")?;
    let first = derivative(input, state);
    let second_state = advance(state, first, step / 2.0);
    validate_integration_stage(second_state, step, "RK4 stage 2")?;
    let second = derivative(input, second_state);
    let third_state = advance(state, second, step / 2.0);
    validate_integration_stage(third_state, step, "RK4 stage 3")?;
    let third = derivative(input, third_state);
    let fourth_state = advance(state, third, step);
    validate_integration_stage(fourth_state, step, "RK4 stage 4")?;
    let fourth = derivative(input, fourth_state);
    let combined_quaternion = Quaternion {
        w: state.body_to_world_quaternion.w
            + step
                * (first.body_to_world_quaternion.w
                    + 2.0 * second.body_to_world_quaternion.w
                    + 2.0 * third.body_to_world_quaternion.w
                    + fourth.body_to_world_quaternion.w)
                / 6.0,
        x: state.body_to_world_quaternion.x
            + step
                * (first.body_to_world_quaternion.x
                    + 2.0 * second.body_to_world_quaternion.x
                    + 2.0 * third.body_to_world_quaternion.x
                    + fourth.body_to_world_quaternion.x)
                / 6.0,
        y: state.body_to_world_quaternion.y
            + step
                * (first.body_to_world_quaternion.y
                    + 2.0 * second.body_to_world_quaternion.y
                    + 2.0 * third.body_to_world_quaternion.y
                    + fourth.body_to_world_quaternion.y)
                / 6.0,
        z: state.body_to_world_quaternion.z
            + step
                * (first.body_to_world_quaternion.z
                    + 2.0 * second.body_to_world_quaternion.z
                    + 2.0 * third.body_to_world_quaternion.z
                    + fourth.body_to_world_quaternion.z)
                / 6.0,
    };
    validate_stage_quaternion(combined_quaternion, "RK4 combined quaternion")?;
    let quaternion = combined_quaternion.normalize()?;
    let next = SixDofState {
        position_world_m: state.position_world_m.add(combined_vector(
            first.position_world_m,
            second.position_world_m,
            third.position_world_m,
            fourth.position_world_m,
            step / 6.0,
        )),
        velocity_body_mps: state.velocity_body_mps.add(combined_vector(
            first.velocity_body_mps,
            second.velocity_body_mps,
            third.velocity_body_mps,
            fourth.velocity_body_mps,
            step / 6.0,
        )),
        angular_rate_body_rad_s: state.angular_rate_body_rad_s.add(combined_vector(
            first.angular_rate_body_rad_s,
            second.angular_rate_body_rad_s,
            third.angular_rate_body_rad_s,
            fourth.angular_rate_body_rad_s,
            step / 6.0,
        )),
        body_to_world_quaternion: quaternion,
    };
    validate_integration_stage(next, step, "RK4 committed state")?;
    Ok(next)
}

fn rotational_energy(inertia: InertiaTensor, state: SixDofState) -> f64 {
    0.5 * state
        .angular_rate_body_rad_s
        .dot(inertia.multiply(state.angular_rate_body_rad_s))
}

fn inertial_angular_momentum(inertia: InertiaTensor, state: SixDofState) -> Vector3 {
    rotate_body_to_world(
        state.body_to_world_quaternion,
        inertia.multiply(state.angular_rate_body_rad_s),
    )
}

pub fn run_sixdof_verification(
    input: SixDofVerificationInput,
) -> Result<SixDofVerificationRun, EngineError> {
    validate(&input)?;
    let mut state = SixDofState {
        body_to_world_quaternion: input.initial_state.body_to_world_quaternion.normalize()?,
        ..input.initial_state
    };
    let zero_wrench = input.applied_wrench.body_force_n.is_exact_zero()
        && input.applied_wrench.body_moment_nm.is_exact_zero();
    let initial_energy =
        zero_wrench.then(|| rotational_energy(input.mass_properties.inertia_kg_m2, state));
    let initial_momentum =
        zero_wrench.then(|| inertial_angular_momentum(input.mass_properties.inertia_kg_m2, state));
    let mut maximum_quaternion_norm_error =
        (state.body_to_world_quaternion.magnitude() - 1.0).abs();
    let mut frames = Vec::with_capacity(input.tick_count as usize + 1);
    frames.push(SixDofFrame {
        tick: 0,
        time_seconds: 0.0,
        state,
    });
    for tick in 1..=input.tick_count {
        state = rk4(&input, state)?;
        maximum_quaternion_norm_error = maximum_quaternion_norm_error
            .max((state.body_to_world_quaternion.magnitude() - 1.0).abs());
        frames.push(SixDofFrame {
            tick,
            time_seconds: f64::from(tick) * input.fixed_step_seconds,
            state,
        });
    }
    let final_energy =
        zero_wrench.then(|| rotational_energy(input.mass_properties.inertia_kg_m2, state));
    let final_momentum =
        zero_wrench.then(|| inertial_angular_momentum(input.mass_properties.inertia_kg_m2, state));
    let relative_rotational_energy_drift = initial_energy
        .zip(final_energy)
        .map(|(initial, final_value)| (final_value - initial).abs() / initial.abs().max(1.0e-15));
    let relative_inertial_angular_momentum_drift =
        initial_momentum
            .zip(final_momentum)
            .map(|(initial, final_value)| {
                final_value.subtract(initial).magnitude() / initial.magnitude().max(1.0e-15)
            });
    Ok(SixDofVerificationRun {
        schema_version: "vector.sixdof-verification-run.v1",
        backend: "rust-wasm",
        numerical_method: "RK4_FIXED_STEP_WITH_QUATERNION_NORMALIZATION",
        fixed_step_seconds: input.fixed_step_seconds,
        tick_count: input.tick_count,
        frames,
        diagnostics: SixDofDiagnostics {
            maximum_quaternion_norm_error,
            conservation_state: if zero_wrench {
                "AVAILABLE_ZERO_WRENCH"
            } else {
                "NOT_APPLICABLE_NONZERO_WRENCH"
            },
            relative_rotational_energy_drift,
            relative_inertial_angular_momentum_drift,
        },
    })
}

pub fn run_sixdof_verification_json(input: &str) -> Result<String, EngineError> {
    let decoded =
        serde_json::from_str(input).map_err(|error| EngineError::InvalidJson(error.to_string()))?;
    let run = run_sixdof_verification(decoded)?;
    serde_json::to_string(&run).map_err(|error| EngineError::Serialization(error.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn input() -> SixDofVerificationInput {
        SixDofVerificationInput {
            schema_version: "vector.sixdof-verification-input.v1".to_string(),
            frame_convention: FrameConvention {
                world_frame: "RIGHT_HANDED_INERTIAL_XYZ".to_string(),
                body_frame: "RIGHT_HANDED_X_FORWARD_Y_RIGHT_Z_DOWN".to_string(),
                attitude: "BODY_TO_WORLD_SCALAR_FIRST_QUATERNION".to_string(),
                state_reference: "CENTER_OF_GRAVITY".to_string(),
                units: "SI".to_string(),
            },
            fixed_step_seconds: 0.01,
            tick_count: 100,
            mass_properties: MassProperties {
                mass_kg: 10.0,
                cg_body_m: Vector3 {
                    x: 0.0,
                    y: 0.0,
                    z: 0.0,
                },
                inertia_kg_m2: InertiaTensor {
                    xx: 2.0,
                    xy: 0.0,
                    xz: 0.0,
                    yx: 0.0,
                    yy: 3.0,
                    yz: 0.0,
                    zx: 0.0,
                    zy: 0.0,
                    zz: 4.0,
                },
            },
            initial_state: SixDofState {
                position_world_m: Vector3 {
                    x: 0.0,
                    y: 0.0,
                    z: 0.0,
                },
                velocity_body_mps: Vector3 {
                    x: 0.0,
                    y: 0.0,
                    z: 0.0,
                },
                angular_rate_body_rad_s: Vector3 {
                    x: 0.0,
                    y: 0.0,
                    z: 0.0,
                },
                body_to_world_quaternion: Quaternion {
                    w: 1.0,
                    x: 0.0,
                    y: 0.0,
                    z: 0.0,
                },
            },
            applied_wrench: AppliedWrench {
                body_force_n: Vector3 {
                    x: 0.0,
                    y: 0.0,
                    z: 0.0,
                },
                body_moment_nm: Vector3 {
                    x: 0.0,
                    y: 0.0,
                    z: 0.0,
                },
            },
        }
    }

    #[test]
    fn integrates_constant_force_and_principal_axis_moment() -> Result<(), EngineError> {
        let mut case = input();
        case.applied_wrench.body_force_n.x = 20.0;
        case.applied_wrench.body_moment_nm.x = 2.0;
        let run = run_sixdof_verification(case)?;
        let final_state = run
            .frames
            .last()
            .ok_or_else(|| invalid("missing final state"))?
            .state;
        assert!((final_state.angular_rate_body_rad_s.x - 1.0).abs() < 1.0e-12);
        assert!((final_state.body_to_world_quaternion.magnitude() - 1.0).abs() < 1.0e-14);
        Ok(())
    }

    #[test]
    fn rejects_non_positive_definite_inertia() {
        let mut case = input();
        case.mass_properties.inertia_kg_m2.xy = 2.0;
        case.mass_properties.inertia_kg_m2.yx = 2.0;
        case.mass_properties.inertia_kg_m2.yy = 1.0;
        assert!(run_sixdof_verification(case).is_err());
    }

    #[test]
    fn rejects_nonzero_cg_and_unresolved_angular_increment() {
        let mut nonzero_cg = input();
        nonzero_cg.mass_properties.cg_body_m.x = 0.001;
        assert!(run_sixdof_verification(nonzero_cg).is_err());

        let mut unresolved = input();
        unresolved.initial_state.angular_rate_body_rad_s.x = 25.000_000_001;
        assert!(run_sixdof_verification(unresolved).is_err());

        let mut stage_overflow = input();
        stage_overflow.tick_count = 1;
        stage_overflow.applied_wrench.body_moment_nm.x = 20_000.0;
        assert!(run_sixdof_verification(stage_overflow).is_err());
    }

    #[test]
    fn conditions_inertia_by_scale_and_accepts_a_full_cross_term_tensor() {
        for scale in [1.0, 1.0e12] {
            let mut near_singular = input();
            near_singular.mass_properties.inertia_kg_m2 = InertiaTensor {
                xx: scale,
                xy: 0.0,
                xz: 0.0,
                yx: 0.0,
                yy: scale * 1.0e-12,
                yz: 0.0,
                zx: 0.0,
                zy: 0.0,
                zz: scale,
            };
            assert!(run_sixdof_verification(near_singular).is_err());
        }

        let mut coupled = input();
        coupled.tick_count = 1;
        coupled.mass_properties.inertia_kg_m2 = InertiaTensor {
            xx: 4.0,
            xy: 1.0,
            xz: 0.5,
            yx: 1.0,
            yy: 4.0,
            yz: 0.5,
            zx: 0.5,
            zy: 0.5,
            zz: 5.0,
        };
        assert!(run_sixdof_verification(coupled).is_ok());
    }

    #[test]
    fn conservation_diagnostics_are_unavailable_for_nonzero_wrench() -> Result<(), EngineError> {
        let mut case = input();
        case.applied_wrench.body_force_n.x = 1.0;
        let run = run_sixdof_verification(case)?;
        assert_eq!(
            run.diagnostics.conservation_state,
            "NOT_APPLICABLE_NONZERO_WRENCH"
        );
        assert_eq!(run.diagnostics.relative_rotational_energy_drift, None);
        assert_eq!(
            run.diagnostics.relative_inertial_angular_momentum_drift,
            None
        );
        Ok(())
    }

    #[test]
    fn rejects_unknown_json_fields() {
        let encoded = serde_json::to_string(&input()).unwrap_or_default();
        let modified = encoded.replacen('{', "{\"extra\":true,", 1);
        assert!(run_sixdof_verification_json(&modified).is_err());
    }
}
