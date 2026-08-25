use sha2::{Digest, Sha256};
use std::collections::HashSet;

use crate::simulation_events::MAX_SIMULATION_EVENTS;
use crate::{
    first_fixed_step_tick_at_or_after, valid_verification_track_model, EngineError, EngineScenario,
    EntityDefinition, Table1d, Vec3,
};

/// Maximum JSON payload accepted by the browser WASM ABI.
pub const MAX_INPUT_BYTES: usize = 1_048_576;
/// Maximum declared entities admitted to a single deterministic run.
pub const MAX_ENTITIES: usize = 256;
/// Maximum declared events admitted to a single deterministic run.
pub const MAX_EVENTS: usize = 1_024;
/// Maximum authored route points admitted for one entity.
pub const MAX_ROUTE_POINTS_PER_ENTITY: usize = 1_024;
/// Maximum integration steps admitted to one synchronous engine call.
pub const MAX_INTEGRATED_STEPS: u64 = 5_000_000;
/// Maximum sampled entity states retained in an engine result.
pub const MAX_RECORDED_ENTITY_STATES: u64 = 1_000_000;

const MAX_IDENTIFIER_BYTES: usize = 128;
const MAX_LABEL_BYTES: usize = 512;
const MAX_DURATION_SECONDS: f64 = 3_600.0;
const MIN_FIXED_STEP_SECONDS: f64 = 0.001;
const MAX_FIXED_STEP_SECONDS: f64 = 1.0;

fn invalid(message: impl Into<String>) -> EngineError {
    EngineError::InvalidScenario(message.into())
}

fn hash_string(hash: &mut Sha256, value: &str) {
    hash.update(b"s");
    hash.update((value.len() as u64).to_be_bytes());
    hash.update(value.as_bytes());
}

fn hash_integer(hash: &mut Sha256, value: usize) {
    hash.update(b"i");
    hash.update((value as u64).to_be_bytes());
}

fn hash_number(hash: &mut Sha256, value: f64) {
    hash.update(b"f");
    hash.update(value.to_bits().to_be_bytes());
}

fn hash_vector(hash: &mut Sha256, value: Vec3) {
    hash_number(hash, value.x);
    hash_number(hash, value.y);
    hash_number(hash, value.z);
}

fn hash_strings(hash: &mut Sha256, values: &[String]) {
    hash_integer(hash, values.len());
    for value in values {
        hash_string(hash, value);
    }
}

fn verify_runtime_model_pack_digest(scenario: &EngineScenario) -> Result<(), EngineError> {
    let has_verification = scenario
        .model_pack
        .observer_sensors
        .iter()
        .any(|sensor| sensor.verification_track_model.is_some());
    if scenario.model_pack.runtime_digest.is_none() && !has_verification {
        return Ok(());
    }
    let expected = scenario
        .model_pack
        .runtime_digest
        .as_deref()
        .ok_or_else(|| {
            invalid("modelPack.runtimeDigest is required for a verification track model")
        })?;
    sha256_digest("modelPack.runtimeDigest", expected)?;
    let pack = &scenario.model_pack;
    let mut hash = Sha256::new();
    hash_string(&mut hash, "vector.runtime-model-pack-digest.v2");
    hash_string(&mut hash, &pack.schema_version);
    hash_string(&mut hash, &pack.id);
    hash_string(&mut hash, &pack.version);
    hash_string(&mut hash, &pack.digest);
    hash_string(&mut hash, &pack.intended_use.id);
    hash_string(&mut hash, &pack.intended_use.version);
    hash_integer(&mut hash, pack.observer_sensors.len());
    for sensor in &pack.observer_sensors {
        hash_string(&mut hash, &sensor.model_id);
        hash_string(&mut hash, &sensor.model_version);
        hash_strings(&mut hash, &sensor.evidence_ref_ids);
        hash_string(&mut hash, &sensor.sensor_kind);
        hash_number(&mut hash, sensor.detection_range_m);
        hash_number(&mut hash, sensor.minimum_range_m);
        hash_number(&mut hash, sensor.scan_period_s);
        hash_number(&mut hash, sensor.azimuth_field_of_view_rad);
        hash_number(&mut hash, sensor.elevation_field_of_view_rad);
        hash_integer(
            &mut hash,
            usize::from(sensor.verification_track_model.is_some()),
        );
        if let Some(model) = &sensor.verification_track_model {
            hash_string(&mut hash, &model.schema_version);
            hash_string(&mut hash, &model.value_state);
            hash_string(&mut hash, &model.intended_use);
            hash_vector(&mut hash, model.position_bias_m);
            hash_vector(&mut hash, model.velocity_bias_mps);
            hash_vector(&mut hash, model.position_standard_deviation_m);
            hash_vector(&mut hash, model.velocity_standard_deviation_mps);
            hash_integer(&mut hash, model.confirmation_observations as usize);
            hash_number(&mut hash, model.maximum_observation_age_seconds);
            hash_number(&mut hash, model.coast_after_seconds);
            hash_number(&mut hash, model.lost_after_seconds);
            hash_integer(&mut hash, model.observation_windows_seconds.len());
            for window in &model.observation_windows_seconds {
                hash_number(&mut hash, window.start);
                hash_number(&mut hash, window.end);
            }
        }
    }
    hash_integer(&mut hash, pack.scenario_patches.len());
    for patch in &pack.scenario_patches {
        hash_string(&mut hash, &patch.schema_version);
        hash_string(&mut hash, &patch.id);
        hash_string(&mut hash, &patch.model_pack_digest);
        hash_string(&mut hash, &patch.model_id);
        hash_string(&mut hash, &patch.field_path);
        hash_number(&mut hash, patch.old_value);
        hash_number(&mut hash, patch.new_value);
        hash_string(&mut hash, &patch.unit);
        hash_string(&mut hash, &patch.reason);
        hash_string(&mut hash, &patch.provenance.author_id);
        hash_string(&mut hash, &patch.provenance.authored_at);
        hash_strings(&mut hash, &patch.provenance.evidence_ref_ids);
    }
    let actual = format!("{:x}", hash.finalize());
    if actual != expected {
        return Err(invalid(format!(
            "modelPack.runtimeDigest does not match its content: expected {expected}, computed {actual}"
        )));
    }
    Ok(())
}

fn validate_verification_track_model(
    model: &crate::ObserverTrackModel,
    intended_use_id: &str,
) -> Result<(), EngineError> {
    if intended_use_id != "vector.intended-use.engine-verification"
        || !valid_verification_track_model(model)
    {
        return Err(invalid(
            "generic track model is admitted only for engine verification",
        ));
    }
    Ok(())
}

fn finite(path: &str, value: f64) -> Result<(), EngineError> {
    if value.is_finite() {
        Ok(())
    } else {
        Err(invalid(format!("{path} must be finite")))
    }
}

fn non_negative(path: &str, value: f64) -> Result<(), EngineError> {
    finite(path, value)?;
    if value >= 0.0 {
        Ok(())
    } else {
        Err(invalid(format!("{path} must be non-negative")))
    }
}

fn positive(path: &str, value: f64) -> Result<(), EngineError> {
    finite(path, value)?;
    if value > 0.0 {
        Ok(())
    } else {
        Err(invalid(format!("{path} must be greater than zero")))
    }
}

fn table(path: &str, value: &Table1d) -> Result<(), EngineError> {
    if value.id.is_empty() || value.axis.len() < 2 || value.axis.len() != value.values.len() {
        return Err(invalid(format!("{path} must be a non-empty aligned table")));
    }
    for index in 0..value.axis.len() {
        finite(&format!("{path}.axis[{index}]"), value.axis[index])?;
        non_negative(&format!("{path}.values[{index}]"), value.values[index])?;
        if index > 0 && value.axis[index] <= value.axis[index - 1] {
            return Err(invalid(format!("{path}.axis must be strictly increasing")));
        }
    }
    Ok(())
}

fn identifier(path: &str, value: &str) -> Result<(), EngineError> {
    if value.is_empty() || value.len() > MAX_IDENTIFIER_BYTES {
        return Err(invalid(format!(
            "{path} must contain 1 to {MAX_IDENTIFIER_BYTES} bytes"
        )));
    }
    if value.chars().any(char::is_control) {
        return Err(invalid(format!(
            "{path} must not contain control characters"
        )));
    }
    Ok(())
}

fn label(path: &str, value: &str) -> Result<(), EngineError> {
    if value.is_empty() || value.len() > MAX_LABEL_BYTES {
        return Err(invalid(format!(
            "{path} must contain 1 to {MAX_LABEL_BYTES} bytes"
        )));
    }
    if value.chars().any(char::is_control) {
        return Err(invalid(format!(
            "{path} must not contain control characters"
        )));
    }
    Ok(())
}

fn sha256_digest(path: &str, value: &str) -> Result<(), EngineError> {
    if value.len() != 64
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
        return Err(invalid(format!(
            "{path} must be a lowercase SHA-256 digest"
        )));
    }
    Ok(())
}

fn content_addressed_sha256(path: &str, value: &str) -> Result<(), EngineError> {
    let Some(digest) = value.strip_prefix("sha256:") else {
        return Err(invalid(format!(
            "{path} must use sha256: content addressing"
        )));
    };
    sha256_digest(path, digest)
}

fn vector(path: &str, value: Vec3) -> Result<(), EngineError> {
    finite(&format!("{path}.x"), value.x)?;
    finite(&format!("{path}.y"), value.y)?;
    finite(&format!("{path}.z"), value.z)
}

fn validate_entity(index: usize, entity: &EntityDefinition) -> Result<(), EngineError> {
    let root = format!("entities[{index}]");
    identifier(&format!("{root}.id"), &entity.id)?;
    identifier(&format!("{root}.rddfId"), &entity.rddf_id)?;
    label(&format!("{root}.designation"), &entity.designation)?;
    label(&format!("{root}.callsign"), &entity.callsign)?;
    identifier(
        &format!("{root}.provenance.sourceObjectId"),
        &entity.provenance.source_object_id,
    )?;
    identifier(
        &format!("{root}.provenance.modelId"),
        &entity.provenance.model_id,
    )?;
    identifier(
        &format!("{root}.provenance.modelVersion"),
        &entity.provenance.model_version,
    )?;
    sha256_digest(
        &format!("{root}.provenance.modelPackDigest"),
        &entity.provenance.model_pack_digest,
    )?;
    vector(&format!("{root}.initial.position"), entity.initial.position)?;
    vector(&format!("{root}.initial.velocity"), entity.initial.velocity)?;
    finite(
        &format!("{root}.initial.headingRad"),
        entity.initial.heading_rad,
    )?;
    positive(&format!("{root}.initial.massKg"), entity.initial.mass_kg)?;
    non_negative(&format!("{root}.initial.fuelKg"), entity.initial.fuel_kg)?;
    if entity.initial.fuel_kg > entity.initial.mass_kg {
        return Err(invalid(format!(
            "{root}.initial.fuelKg must not exceed initial mass"
        )));
    }
    if entity.route.len() > MAX_ROUTE_POINTS_PER_ENTITY {
        return Err(invalid(format!(
            "{root}.route exceeds {MAX_ROUTE_POINTS_PER_ENTITY} points"
        )));
    }
    for (route_index, point) in entity.route.iter().copied().enumerate() {
        vector(&format!("{root}.route[{route_index}]"), point)?;
    }
    if !entity.route.is_empty() {
        let Some(route_plan) = entity.route_plan.as_ref() else {
            return Err(invalid(format!(
                "{root}.routePlan is required when route points exist"
            )));
        };
        if route_plan.schema_version != "vector.route-plan.v1"
            && route_plan.schema_version != "vector.route-plan.v2"
        {
            return Err(invalid(format!(
                "{root}.routePlan.schemaVersion is unsupported"
            )));
        }
        if route_plan.waypoint_acceptance_radii_m.len() != entity.route.len() {
            return Err(invalid(format!(
                "{root}.routePlan.waypointAcceptanceRadiiM must match route length"
            )));
        }
        for (index, radius) in route_plan
            .waypoint_acceptance_radii_m
            .iter()
            .copied()
            .enumerate()
        {
            if !radius.is_finite() || !(1.0..=25_000.0).contains(&radius) {
                return Err(invalid(format!(
                    "{root}.routePlan.waypointAcceptanceRadiiM[{index}] must be from 1 to 25000"
                )));
            }
        }
        if route_plan.waypoint_acceptance_radii_m[0] != 1.0 {
            return Err(invalid(format!(
                "{root}.routePlan.waypointAcceptanceRadiiM[0] must be 1"
            )));
        }
        if route_plan.schema_version == "vector.route-plan.v2" {
            let Some(transitions) = route_plan.waypoint_transitions.as_ref() else {
                return Err(invalid(format!(
                    "{root}.routePlan.waypointTransitions is required for v2"
                )));
            };
            if transitions.len() != entity.route.len() {
                return Err(invalid(format!(
                    "{root}.routePlan.waypointTransitions must match route length"
                )));
            }
            for (index, transition) in transitions.iter().enumerate() {
                let valid = if index == 0 {
                    transition == "START"
                } else {
                    transition == "FLY_BY" || transition == "FLY_OVER"
                };
                if !valid {
                    return Err(invalid(format!(
                        "{root}.routePlan.waypointTransitions[{index}] is invalid"
                    )));
                }
                if transition == "FLY_OVER" && route_plan.waypoint_acceptance_radii_m[index] != 1.0
                {
                    return Err(invalid(format!(
                        "{root}.routePlan.waypointAcceptanceRadiiM[{index}] must be 1 for FLY_OVER"
                    )));
                }
            }
        }
    }

    if entity.kind == crate::EntityKind::Aircraft && entity.aircraft.is_none() {
        return Err(invalid(format!(
            "{root}.aircraft is required for an aircraft entity"
        )));
    }
    if let Some(aircraft) = &entity.aircraft {
        positive(
            &format!("{root}.aircraft.emptyMassKg"),
            aircraft.empty_mass_kg,
        )?;
        non_negative(
            &format!("{root}.aircraft.fuelCapacityKg"),
            aircraft.fuel_capacity_kg,
        )?;
        positive(
            &format!("{root}.aircraft.referenceAreaM2"),
            aircraft.reference_area_m2,
        )?;
        table(
            &format!("{root}.aircraft.zeroLiftDragByMach"),
            &aircraft.zero_lift_drag_by_mach,
        )?;
        table(
            &format!("{root}.aircraft.inducedDragByAngleOfAttackRad"),
            &aircraft.induced_drag_by_angle_of_attack_rad,
        )?;
        table(
            &format!("{root}.aircraft.thrustByThrottle"),
            &aircraft.thrust_by_throttle,
        )?;
        table(
            &format!("{root}.aircraft.fuelFlowByThrottle"),
            &aircraft.fuel_flow_by_throttle,
        )?;
        positive(
            &format!("{root}.aircraft.maximumCommandG"),
            aircraft.maximum_command_g,
        )?;
    }
    if let Some(sensor) = &entity.observer_sensor {
        if !matches!(
            sensor.schema_version.as_str(),
            "vector.observer-sensor-admission.v1" | "vector.observer-sensor-admission.v2"
        ) {
            return Err(invalid(format!(
                "{root}.observerSensor.schemaVersion is unsupported"
            )));
        }
        sha256_digest(
            &format!("{root}.observerSensor.modelPackDigest"),
            &sensor.model_pack_digest,
        )?;
        identifier(&format!("{root}.observerSensor.modelId"), &sensor.model_id)?;
        identifier(
            &format!("{root}.observerSensor.modelVersion"),
            &sensor.model_version,
        )?;
        if sensor.evidence_ref_ids.is_empty()
            || !matches!(sensor.sensor_kind.as_str(), "RADAR" | "INFRARED" | "VISUAL")
            || !matches!(sensor.mode.as_str(), "OFF" | "SEARCH")
        {
            return Err(invalid(format!(
                "{root}.observerSensor requires a typed kind, mode, and evidence"
            )));
        }
        positive(
            &format!("{root}.observerSensor.detectionRangeM"),
            sensor.detection_range_m,
        )?;
        non_negative(
            &format!("{root}.observerSensor.minimumRangeM"),
            sensor.minimum_range_m,
        )?;
        positive(
            &format!("{root}.observerSensor.scanPeriodS"),
            sensor.scan_period_s,
        )?;
        positive(
            &format!("{root}.observerSensor.azimuthFieldOfViewRad"),
            sensor.azimuth_field_of_view_rad,
        )?;
        positive(
            &format!("{root}.observerSensor.elevationFieldOfViewRad"),
            sensor.elevation_field_of_view_rad,
        )?;
        if sensor.minimum_range_m > sensor.detection_range_m
            || sensor.azimuth_field_of_view_rad > std::f64::consts::TAU
            || sensor.elevation_field_of_view_rad > std::f64::consts::PI
        {
            return Err(invalid(format!("{root}.observerSensor bounds are invalid")));
        }
    }

    if let Some(sensor) = &entity.sensor {
        non_negative(
            &format!("{root}.sensor.detectionRadiusM"),
            sensor.detection_radius_m,
        )?;
        non_negative(
            &format!("{root}.sensor.trackingRadiusM"),
            sensor.tracking_radius_m,
        )?;
        non_negative(
            &format!("{root}.sensor.engagementRadiusM"),
            sensor.engagement_radius_m,
        )?;
        non_negative(
            &format!("{root}.sensor.minimumRangeM"),
            sensor.minimum_range_m,
        )?;
        non_negative(
            &format!("{root}.sensor.minimumAltitudeM"),
            sensor.minimum_altitude_m,
        )?;
        positive(
            &format!("{root}.sensor.maximumAltitudeM"),
            sensor.maximum_altitude_m,
        )?;
        if sensor.minimum_range_m > sensor.engagement_radius_m {
            return Err(invalid(format!(
                "{root}.sensor.minimumRangeM must not exceed engagementRadiusM"
            )));
        }
        if sensor.minimum_altitude_m > sensor.maximum_altitude_m {
            return Err(invalid(format!(
                "{root}.sensor minimum altitude must not exceed maximum altitude"
            )));
        }
    }

    if let Some(weapon) = &entity.weapon {
        identifier(
            &format!("{root}.weapon.launchPlatformId"),
            &weapon.launch_platform_id,
        )?;
        identifier(
            &format!("{root}.weapon.targetEntityId"),
            &weapon.target_entity_id,
        )?;
        if let Some(launch_time) = weapon.launch_time_seconds {
            non_negative(&format!("{root}.weapon.launchTimeSeconds"), launch_time)?;
        }
        non_negative(&format!("{root}.weapon.burnSeconds"), weapon.burn_seconds)?;
        positive(
            &format!("{root}.weapon.launchMassKg"),
            weapon.launch_mass_kg,
        )?;
        positive(&format!("{root}.weapon.dryMassKg"), weapon.dry_mass_kg)?;
        if weapon.dry_mass_kg > weapon.launch_mass_kg {
            return Err(invalid(format!(
                "{root}.weapon.dryMassKg must not exceed launchMassKg"
            )));
        }
        non_negative(
            &format!("{root}.weapon.thrustNewtons"),
            weapon.thrust_newtons,
        )?;
        positive(
            &format!("{root}.weapon.thrustTaperSpeedMps"),
            weapon.thrust_taper_speed_mps,
        )?;
        positive(
            &format!("{root}.weapon.referenceAreaM2"),
            weapon.reference_area_m2,
        )?;
        non_negative(
            &format!("{root}.weapon.dragCoefficient"),
            weapon.drag_coefficient,
        )?;
        positive(
            &format!("{root}.weapon.navigationConstant"),
            weapon.navigation_constant,
        )?;
        positive(
            &format!("{root}.weapon.maximumCommandG"),
            weapon.maximum_command_g,
        )?;
        positive(
            &format!("{root}.weapon.seekerActivationRangeM"),
            weapon.seeker_activation_range_m,
        )?;
        positive(
            &format!("{root}.weapon.datalinkUpdateSeconds"),
            weapon.datalink_update_seconds,
        )?;
        non_negative(
            &format!("{root}.weapon.commandedCruiseAltitudeM"),
            weapon.commanded_cruise_altitude_m,
        )?;
        sha256_digest(
            &format!("{root}.weapon.admission.modelPackDigest"),
            &weapon.admission.model_pack_digest,
        )?;
        identifier(
            &format!("{root}.weapon.admission.weaponModelId"),
            &weapon.admission.weapon_model_id,
        )?;
        identifier(
            &format!("{root}.weapon.admission.stationId"),
            &weapon.admission.station_id,
        )?;
        identifier(
            &format!("{root}.weapon.admission.compatibilityRuleId"),
            &weapon.admission.compatibility_rule_id,
        )?;
    }
    Ok(())
}

/// Validate semantic invariants and synchronous resource limits before integration.
pub fn validate_scenario(scenario: &EngineScenario) -> Result<(), EngineError> {
    identifier("id", &scenario.id)?;
    identifier("version", &scenario.version)?;
    label("name", &scenario.name)?;
    positive("durationSeconds", scenario.duration_seconds)?;
    if scenario.duration_seconds > MAX_DURATION_SECONDS {
        return Err(invalid(format!(
            "durationSeconds exceeds {MAX_DURATION_SECONDS}"
        )));
    }
    positive("fixedStepSeconds", scenario.fixed_step_seconds)?;
    if scenario.model_pack.schema_version != "vector.compiled-model-pack.v1" {
        return Err(invalid("modelPack.schemaVersion is unsupported"));
    }
    identifier("modelPack.id", &scenario.model_pack.id)?;
    identifier("modelPack.version", &scenario.model_pack.version)?;
    sha256_digest("modelPack.digest", &scenario.model_pack.digest)?;
    verify_runtime_model_pack_digest(scenario)?;
    identifier(
        "modelPack.intendedUse.id",
        &scenario.model_pack.intended_use.id,
    )?;
    identifier(
        "modelPack.intendedUse.version",
        &scenario.model_pack.intended_use.version,
    )?;
    for (index, patch) in scenario.model_pack.scenario_patches.iter().enumerate() {
        let root = format!("modelPack.scenarioPatches[{index}]");
        if patch.schema_version != "vector.model-patch.v1" {
            return Err(invalid(format!("{root}.schemaVersion is unsupported")));
        }
        identifier(&format!("{root}.id"), &patch.id)?;
        identifier(&format!("{root}.modelId"), &patch.model_id)?;
        sha256_digest(&format!("{root}.modelPackDigest"), &patch.model_pack_digest)?;
        if patch.model_pack_digest != scenario.model_pack.digest {
            return Err(invalid(format!(
                "{root}.modelPackDigest does not match modelPack"
            )));
        }
        label(&format!("{root}.fieldPath"), &patch.field_path)?;
        finite(&format!("{root}.oldValue"), patch.old_value)?;
        finite(&format!("{root}.newValue"), patch.new_value)?;
        label(&format!("{root}.unit"), &patch.unit)?;
        label(&format!("{root}.reason"), &patch.reason)?;
        label(
            &format!("{root}.provenance.authorId"),
            &patch.provenance.author_id,
        )?;
        label(
            &format!("{root}.provenance.authoredAt"),
            &patch.provenance.authored_at,
        )?;
        if patch.provenance.evidence_ref_ids.is_empty() {
            return Err(invalid(format!(
                "{root}.provenance.evidenceRefIds must not be empty"
            )));
        }
    }
    if !(MIN_FIXED_STEP_SECONDS..=MAX_FIXED_STEP_SECONDS).contains(&scenario.fixed_step_seconds) {
        return Err(invalid(format!(
            "fixedStepSeconds must be between {MIN_FIXED_STEP_SECONDS} and {MAX_FIXED_STEP_SECONDS}"
        )));
    }
    let integrated_steps =
        first_fixed_step_tick_at_or_after(scenario.duration_seconds, scenario.fixed_step_seconds);
    if integrated_steps > MAX_INTEGRATED_STEPS {
        return Err(invalid(format!(
            "scenario requires {integrated_steps} integration steps; maximum is {MAX_INTEGRATED_STEPS}"
        )));
    }
    if scenario.entities.is_empty() || scenario.entities.len() > MAX_ENTITIES {
        return Err(invalid(format!(
            "entities must contain 1 to {MAX_ENTITIES} definitions"
        )));
    }
    if scenario.events.len() > MAX_EVENTS {
        return Err(invalid(format!("events exceeds {MAX_EVENTS} definitions")));
    }
    let sampled_frames = (scenario.duration_seconds / 0.25).ceil() as u64 + 1;
    let event_forced_frames = (MAX_SIMULATION_EVENTS as u64).min(integrated_steps + 1);
    let admitted_frames =
        (integrated_steps + 1).min(sampled_frames.saturating_add(event_forced_frames));
    let recorded_states = admitted_frames.saturating_mul(scenario.entities.len() as u64);
    if recorded_states > MAX_RECORDED_ENTITY_STATES {
        return Err(invalid(format!(
            "scenario would retain {recorded_states} entity states; maximum is {MAX_RECORDED_ENTITY_STATES}"
        )));
    }

    positive("environment.gravityMps2", scenario.environment.gravity_mps2)?;
    finite(
        "environment.temperatureOffsetC",
        scenario.environment.temperature_offset_c,
    )?;
    vector("environment.windMps", scenario.environment.wind_mps)?;
    let environment_pack = &scenario.environment.environment_pack;
    if environment_pack.schema_version != "vector.environment-pack.v1" {
        return Err(invalid(
            "environment.environmentPack.schemaVersion is unsupported",
        ));
    }
    identifier("environment.environmentPack.id", &environment_pack.id)?;
    identifier(
        "environment.environmentPack.version",
        &environment_pack.version,
    )?;
    content_addressed_sha256(
        "environment.environmentPack.digest",
        &environment_pack.digest,
    )?;
    if let Some(runtime) = scenario.environment.runtime_environment.as_ref() {
        if runtime.schema_version != "vector.environment-runtime-grid.v1" {
            return Err(invalid(
                "environment.runtimeEnvironment.schemaVersion is unsupported",
            ));
        }
        if runtime.environment_pack.id != environment_pack.id
            || runtime.environment_pack.version != environment_pack.version
            || runtime.environment_pack.digest != environment_pack.digest
        {
            return Err(invalid(
                "environment.runtimeEnvironment pack identity does not match environmentPack",
            ));
        }
        for (path, id, version, digest) in [
            (
                "terrain",
                &runtime.terrain.id,
                &runtime.terrain.version,
                &runtime.terrain.digest,
            ),
            (
                "atmosphere",
                &runtime.atmosphere.id,
                &runtime.atmosphere.version,
                &runtime.atmosphere.digest,
            ),
        ] {
            identifier(&format!("environment.runtimeEnvironment.{path}.id"), id)?;
            identifier(
                &format!("environment.runtimeEnvironment.{path}.version"),
                version,
            )?;
            content_addressed_sha256(
                &format!("environment.runtimeEnvironment.{path}.digest"),
                digest,
            )?;
        }
        let terrain = &runtime.terrain.grid;
        if terrain.columns < 2
            || terrain.rows < 2
            || terrain.surface_elevation_msl_m.len() != terrain.columns * terrain.rows
            || !terrain.west_deg.is_finite()
            || !terrain.south_deg.is_finite()
            || !(terrain.longitude_step_deg > 0.0 && terrain.latitude_step_deg > 0.0)
            || terrain
                .surface_elevation_msl_m
                .iter()
                .any(|value| !value.is_finite())
        {
            return Err(invalid(
                "environment.runtimeEnvironment terrain grid is invalid",
            ));
        }
        let atmosphere = &runtime.atmosphere.grid;
        let expected = atmosphere
            .columns
            .saturating_mul(atmosphere.rows)
            .saturating_mul(atmosphere.sample_count);
        if atmosphere.columns < 2
            || atmosphere.rows < 2
            || atmosphere.sample_count < 2
            || !atmosphere.west_deg.is_finite()
            || !atmosphere.south_deg.is_finite()
            || !(atmosphere.longitude_step_deg > 0.0 && atmosphere.latitude_step_deg > 0.0)
            || !atmosphere.interval_seconds.is_finite()
            || atmosphere.interval_seconds <= 0.0
            || scenario.duration_seconds
                > (atmosphere.sample_count - 1) as f64 * atmosphere.interval_seconds
            || [
                &atmosphere.temperature_c,
                &atmosphere.surface_pressure_kpa,
                &atmosphere.relative_humidity_percent,
                &atmosphere.wind_east_mps,
                &atmosphere.wind_north_mps,
            ]
            .iter()
            .any(|values| values.len() != expected || values.iter().any(|value| !value.is_finite()))
        {
            return Err(invalid("environment.runtimeEnvironment atmosphere grid is invalid or does not cover the run"));
        }
        for (path, value) in [
            ("anchor.longitude", runtime.anchor.longitude),
            ("anchor.latitude", runtime.anchor.latitude),
            (
                "authoredModifiers.temperatureOffsetC",
                runtime.authored_modifiers.temperature_offset_c,
            ),
            (
                "authoredModifiers.windEastMps",
                runtime.authored_modifiers.wind_east_mps,
            ),
            (
                "authoredModifiers.windNorthMps",
                runtime.authored_modifiers.wind_north_mps,
            ),
        ] {
            finite(&format!("environment.runtimeEnvironment.{path}"), value)?;
        }
    }
    finite(
        "environment.studyArea.surfaceElevationM",
        scenario.environment.study_area.surface_elevation_m,
    )?;
    finite(
        "environment.studyArea.anchor.longitude",
        scenario.environment.study_area.anchor.longitude,
    )?;
    finite(
        "environment.studyArea.anchor.latitude",
        scenario.environment.study_area.anchor.latitude,
    )?;
    let [[west, south], [east, north]] = scenario.environment.study_area.bounds;
    for (path, value) in [
        ("bounds.west", west),
        ("bounds.south", south),
        ("bounds.east", east),
        ("bounds.north", north),
    ] {
        finite(&format!("environment.studyArea.{path}"), value)?;
    }
    if west >= east || south >= north {
        return Err(invalid("environment.studyArea.bounds must be ordered"));
    }
    positive(
        "completion.distanceMeters",
        scenario.completion.distance_meters,
    )?;

    let mut entity_ids = HashSet::with_capacity(scenario.entities.len());
    for (index, entity) in scenario.entities.iter().enumerate() {
        validate_entity(index, entity)?;
        if entity.provenance.model_pack_digest != scenario.model_pack.digest {
            return Err(invalid(format!(
                "entity {} model-pack digest does not match scenario",
                entity.id
            )));
        }
        if entity
            .observer_sensor
            .as_ref()
            .is_some_and(|sensor| sensor.model_pack_digest != scenario.model_pack.digest)
        {
            return Err(invalid(format!(
                "observer sensor {} admission does not match scenario model pack",
                entity.id
            )));
        }
        if let Some(admission) = &entity.observer_sensor {
            let sensor = scenario
                .model_pack
                .observer_sensors
                .iter()
                .find(|sensor| sensor.model_id == admission.model_id);
            let exact_match = sensor.is_some_and(|sensor| {
                sensor.model_version == admission.model_version
                    && sensor.evidence_ref_ids == admission.evidence_ref_ids
                    && sensor.sensor_kind == admission.sensor_kind
                    && sensor.detection_range_m == admission.detection_range_m
                    && sensor.minimum_range_m == admission.minimum_range_m
                    && sensor.scan_period_s == admission.scan_period_s
                    && sensor.azimuth_field_of_view_rad == admission.azimuth_field_of_view_rad
                    && sensor.elevation_field_of_view_rad == admission.elevation_field_of_view_rad
                    && sensor.verification_track_model == admission.verification_track_model
            });
            if !exact_match {
                return Err(invalid(format!(
                    "observer sensor {} is not bound to an admitted compiled sensor model",
                    entity.id
                )));
            }
            if let Some(model) = &admission.verification_track_model {
                if admission.schema_version != "vector.observer-sensor-admission.v2" {
                    return Err(invalid(format!(
                        "observer sensor {} verification track model requires admission v2",
                        entity.id
                    )));
                }
                validate_verification_track_model(model, &scenario.model_pack.intended_use.id)?;
            } else if admission.schema_version != "vector.observer-sensor-admission.v1" {
                return Err(invalid(format!(
                    "observer sensor {} has an unsupported admission schema",
                    entity.id
                )));
            }
        }
        if let Some(weapon) = &entity.weapon {
            if weapon.admission.model_pack_digest != scenario.model_pack.digest
                || weapon.admission.model_pack_digest != entity.provenance.model_pack_digest
                || weapon.admission.weapon_model_id != entity.provenance.model_id
            {
                return Err(invalid(format!(
                    "weapon {} admission does not match scenario provenance",
                    entity.id
                )));
            }
        }
        if !entity_ids.insert(entity.id.as_str()) {
            return Err(invalid(format!("duplicate entity id {}", entity.id)));
        }
    }
    let mut launched_weapon_count = 0_usize;
    for entity in &scenario.entities {
        let Some(weapon) = &entity.weapon else {
            continue;
        };
        if !entity_ids.contains(weapon.launch_platform_id.as_str()) {
            return Err(invalid(format!(
                "weapon {} references missing launch platform {}",
                entity.id, weapon.launch_platform_id
            )));
        }
        if !entity_ids.contains(weapon.target_entity_id.as_str()) {
            return Err(invalid(format!(
                "weapon {} references missing target {}",
                entity.id, weapon.target_entity_id
            )));
        }
        if let Some(launch_time) = weapon.launch_time_seconds {
            launched_weapon_count += 1;
            if launch_time > scenario.duration_seconds {
                return Err(invalid(format!(
                    "weapon {} launches after scenario duration",
                    entity.id
                )));
            }
            if first_fixed_step_tick_at_or_after(launch_time, scenario.fixed_step_seconds)
                >= integrated_steps
            {
                return Err(invalid(format!(
                    "weapon {} launches outside the executable run window",
                    entity.id
                )));
            }
        }
    }
    for aircraft in scenario
        .entities
        .iter()
        .filter(|entity| entity.kind == crate::EntityKind::Aircraft)
    {
        if let Some(ground) = aircraft.ground_operation.as_ref() {
            let mission_matches = scenario
                .air_mission_runtime
                .as_ref()
                .is_some_and(|binding| {
                    binding.schema_version == ground.schema_version
                        && binding.mission_digest == ground.mission_digest
                        && binding.runway_evidence_digest == ground.runway_evidence_digest
                        && binding.posture == ground.posture
                        && binding.release_time_seconds == ground.release_time_seconds
                        && binding.execution_authority == ground.execution_authority
                        && binding.unavailability_reason == ground.unavailability_reason
                });
            if ground.schema_version != "vector.aircraft-ground-operation.v1"
                || !matches!(
                    ground.posture.as_str(),
                    "PARKING" | "RUNWAY" | "GROUND_ALERT_QRA"
                )
                || !ground.release_time_seconds.is_finite()
                || ground.release_time_seconds < 0.0
                || sha256_digest("groundOperation.missionDigest", &ground.mission_digest).is_err()
                || sha256_digest(
                    "groundOperation.runwayEvidenceDigest",
                    &ground.runway_evidence_digest,
                )
                .is_err()
                || ground.execution_authority != "UNAVAILABLE"
                || ground.unavailability_reason != "GROUND_DYNAMICS_MODEL_UNAVAILABLE"
                || !mission_matches
                || aircraft.initial.velocity.magnitude() != 0.0
            {
                return Err(invalid(format!(
                    "aircraft {} has no valid ground-operation admission",
                    aircraft.id
                )));
            }
        }
        let aircraft_model = aircraft
            .aircraft
            .as_ref()
            .ok_or_else(|| invalid(format!("aircraft {} has no aircraft model", aircraft.id)))?;
        let installed_store_mass_kg: f64 = scenario
            .entities
            .iter()
            .filter_map(|entity| {
                entity.weapon.as_ref().and_then(|weapon| {
                    (entity.lifecycle == crate::EntityLifecycle::Stowed
                        && weapon.launch_platform_id == aircraft.id)
                        .then_some(weapon.launch_mass_kg)
                })
            })
            .sum();
        let expected_mass_kg =
            aircraft_model.empty_mass_kg + aircraft.initial.fuel_kg + installed_store_mass_kg;
        if (aircraft.initial.mass_kg - expected_mass_kg).abs() > 1e-6 {
            return Err(invalid(format!(
                "aircraft {} initial mass must equal empty mass, fuel, and installed stores",
                aircraft.id
            )));
        }
    }
    if launched_weapon_count == 0 {
        return Err(invalid(
            "scenario must declare at least one launched weapon",
        ));
    }

    let mut event_ids = HashSet::with_capacity(scenario.events.len());
    for (index, event) in scenario.events.iter().enumerate() {
        let root = format!("events[{index}]");
        identifier(&format!("{root}.id"), &event.id)?;
        if !event_ids.insert(event.id.as_str()) {
            return Err(invalid(format!("duplicate event id {}", event.id)));
        }
        non_negative(&format!("{root}.startSeconds"), event.start_seconds)?;
        positive(&format!("{root}.durationSeconds"), event.duration_seconds)?;
        if event.start_seconds + event.duration_seconds > scenario.duration_seconds {
            return Err(invalid(format!("{root} extends beyond scenario duration")));
        }
        vector(&format!("{root}.vectorMps"), event.vector_mps)?;
    }

    Ok(())
}
