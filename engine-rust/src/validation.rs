use std::collections::HashSet;

use crate::{EngineError, EngineScenario, EntityDefinition, Vec3};

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
    finite(
        &format!("{root}.behavior.commandedG"),
        entity.behavior.commanded_g,
    )?;
    if entity.route.len() > MAX_ROUTE_POINTS_PER_ENTITY {
        return Err(invalid(format!(
            "{root}.route exceeds {MAX_ROUTE_POINTS_PER_ENTITY} points"
        )));
    }
    for (route_index, point) in entity.route.iter().copied().enumerate() {
        vector(&format!("{root}.route[{route_index}]"), point)?;
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
        non_negative(
            &format!("{root}.aircraft.zeroLiftDragCoefficient"),
            aircraft.zero_lift_drag_coefficient,
        )?;
        non_negative(
            &format!("{root}.aircraft.inducedDragFactor"),
            aircraft.induced_drag_factor,
        )?;
        non_negative(
            &format!("{root}.aircraft.maximumThrustNewtons"),
            aircraft.maximum_thrust_newtons,
        )?;
        non_negative(
            &format!("{root}.aircraft.specificFuelConsumptionKgPerNewtonSecond"),
            aircraft.specific_fuel_consumption_kg_per_newton_second,
        )?;
        positive(
            &format!("{root}.aircraft.maximumCommandG"),
            aircraft.maximum_command_g,
        )?;
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
    let integrated_steps = (scenario.duration_seconds / scenario.fixed_step_seconds).ceil() as u64;
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
    let recorded_states = sampled_frames.saturating_mul(scenario.entities.len() as u64);
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
        }
    }
    let has_no_launch_primary_pair =
        entity_ids.contains("blue-platform-1") && entity_ids.contains("red-object-1");
    if launched_weapon_count == 0 && !has_no_launch_primary_pair {
        return Err(invalid(
            "scenario must declare at least one launched weapon or a blue-platform-1/red-object-1 no-launch pair",
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
        non_negative(&format!("{root}.durationSeconds"), event.duration_seconds)?;
        if event.start_seconds + event.duration_seconds > scenario.duration_seconds {
            return Err(invalid(format!("{root} extends beyond scenario duration")));
        }
        if let Some(entity_id) = &event.entity_id {
            if !entity_ids.contains(entity_id.as_str()) {
                return Err(invalid(format!(
                    "{root} references missing entity {entity_id}"
                )));
            }
        }
        if let Some(value) = event.vector_mps {
            vector(&format!("{root}.vectorMps"), value)?;
        }
    }

    Ok(())
}
