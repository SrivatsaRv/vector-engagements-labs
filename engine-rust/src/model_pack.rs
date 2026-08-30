use std::collections::HashSet;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};

use crate::{valid_verification_track_model, EngineError, ObserverTrackModel};

const COMPILED_SCHEMA: &str = "vector.compiled-model-pack.v1";
const COMPILED_V2_SCHEMA: &str = "vector.compiled-model-pack.v2";
const AIRCRAFT_EVIDENCE_REGISTRY: &str =
    include_str!("../../governance/aircraft-evidence-registry.v2.json");

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EvidenceReference {
    pub id: String,
    pub kind: String,
    pub content_sha256: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IntendedUseRef {
    pub id: String,
    pub version: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ManifestRef {
    pub id: String,
    pub version: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogIdentity {
    pub catalog_object_id: String,
    pub definition_model_ids: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompiledAxis {
    pub semantic: String,
    pub unit: String,
    pub values: Vec<f64>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NumericRange {
    pub minimum: f64,
    pub maximum: f64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidityDomain {
    pub altitude_m: NumericRange,
    pub mach: NumericRange,
    pub angle_of_attack_rad: NumericRange,
    pub load_factor_g: NumericRange,
    pub configurations: Vec<String>,
    pub environments: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompiledTable {
    pub id: String,
    pub output_unit: String,
    pub axes: Vec<CompiledAxis>,
    pub values: Vec<f64>,
    pub evidence_ref_ids: Vec<String>,
    pub validity_domain: ValidityDomain,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AerodynamicModel {
    pub id: String,
    pub reference_area_m2: f64,
    pub reference_chord_m: f64,
    pub reference_span_m: f64,
    pub coefficient_tables: Vec<CompiledTable>,
    pub validity_domain: ValidityDomain,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PropulsionModel {
    pub id: String,
    pub engine_count: usize,
    pub thrust_table: CompiledTable,
    pub fuel_flow_table: CompiledTable,
    pub spool_time_s: f64,
    pub validity_domain: ValidityDomain,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SensorModel {
    pub id: String,
    pub sensor_kind: String,
    pub evidence_ref_ids: Vec<String>,
    #[serde(default)]
    pub evidence_admission: Option<SensorEvidenceAdmission>,
    pub detection_range_m: f64,
    pub minimum_range_m: f64,
    pub scan_period_s: f64,
    pub azimuth_field_of_view_rad: f64,
    pub elevation_field_of_view_rad: f64,
    #[serde(default)]
    pub verification_track_model: Option<ObserverTrackModel>,
    pub validity_domain: ValidityDomain,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SensorEvidenceAdmission {
    pub schema_version: String,
    pub source_evidence_ref_ids: Vec<String>,
    pub validation_evidence_ref_ids: Vec<String>,
    pub coverage: SensorEvidenceCoverage,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SensorEvidenceCoverage {
    pub detection_range: String,
    pub minimum_range: String,
    pub scan_period: String,
    pub azimuth_field_of_view: String,
    pub elevation_field_of_view: String,
    pub measurement_uncertainty: String,
    pub target_applicability: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AircraftModel {
    pub id: String,
    pub catalog_object_id: String,
    pub empty_mass_kg: f64,
    pub fuel_capacity_kg: f64,
    pub aerodynamic_model_index: usize,
    pub propulsion_model_indexes: Vec<usize>,
    pub sensor_model_indexes: Vec<usize>,
    pub loadout_model_index: usize,
    pub maximum_command_load_factor_g: f64,
    pub validity_domain: ValidityDomain,
    pub performance_admission: AircraftPerformanceAdmission,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AircraftPerformanceAdmission {
    pub state: String,
    pub limitation_id: Option<String>,
    pub reason: Option<String>,
    #[serde(default)]
    pub capabilities: Vec<AircraftPerformanceCapabilityEvidence>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AircraftPerformanceCapabilityEvidence {
    pub capability: String,
    pub source_evidence_ref_ids: Vec<String>,
    pub validation_evidence_ref_ids: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WeaponModel {
    pub id: String,
    pub catalog_object_id: String,
    pub launch_mass_kg: f64,
    pub dry_mass_kg: f64,
    pub aerodynamic_model_index: usize,
    pub propulsion_model_index: usize,
    pub sensor_model_index: Option<usize>,
    pub maximum_command_load_factor_g: f64,
    pub seeker_activation_range_m: f64,
    pub datalink_update_period_s: f64,
    pub validity_domain: ValidityDomain,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadoutStation {
    pub id: String,
    pub station_group: String,
    pub maximum_quantity: usize,
    pub compatible_store_model_indexes: Vec<usize>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadoutModel {
    pub id: String,
    pub platform_catalog_object_id: String,
    pub stations: Vec<LoadoutStation>,
    pub validity_domain: ValidityDomain,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompatibilityRule {
    pub id: String,
    pub platform_catalog_object_id: String,
    pub loadout_model_index: usize,
    pub store_model_index: usize,
    pub station_group: String,
    pub status: String,
    pub maximum_quantity: usize,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompiledModelPack {
    pub schema_version: String,
    pub id: String,
    pub version: String,
    pub digest: String,
    pub unit_system: String,
    pub intended_uses: Vec<IntendedUseRef>,
    pub credibility_manifest_ref: ManifestRef,
    pub evidence: Vec<EvidenceReference>,
    pub catalog_identities: Vec<CatalogIdentity>,
    pub aerodynamics: Vec<AerodynamicModel>,
    pub propulsion: Vec<PropulsionModel>,
    pub sensors: Vec<SensorModel>,
    pub aircraft: Vec<AircraftModel>,
    pub weapons: Vec<WeaponModel>,
    pub loadouts: Vec<LoadoutModel>,
    pub compatibility: Vec<CompatibilityRule>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CompiledModelPackV2Identity {
    pub id: String,
    pub version: String,
    pub digest: String,
    pub legacy_projection_digest: String,
    pub source_digest: String,
    pub lineage_digest: String,
}

fn invalid(message: impl Into<String>) -> EngineError {
    EngineError::InvalidScenario(message.into())
}

fn finite_non_negative(path: &str, value: f64) -> Result<(), EngineError> {
    if value.is_finite() && value >= 0.0 {
        Ok(())
    } else {
        Err(invalid(format!("{path} must be finite and non-negative")))
    }
}

fn validate_range(path: &str, range: &NumericRange) -> Result<(), EngineError> {
    if range.minimum.is_finite() && range.maximum.is_finite() && range.minimum <= range.maximum {
        Ok(())
    } else {
        Err(invalid(format!(
            "{path} must be finite with minimum not greater than maximum"
        )))
    }
}

fn validate_validity_domain(path: &str, domain: &ValidityDomain) -> Result<(), EngineError> {
    validate_range(&format!("{path}.altitudeM"), &domain.altitude_m)?;
    validate_range(&format!("{path}.mach"), &domain.mach)?;
    validate_range(
        &format!("{path}.angleOfAttackRad"),
        &domain.angle_of_attack_rad,
    )?;
    validate_range(&format!("{path}.loadFactorG"), &domain.load_factor_g)?;
    if domain.configurations.is_empty()
        || domain.environments.is_empty()
        || domain.configurations.iter().any(|value| value.is_empty())
        || domain.environments.iter().any(|value| value.is_empty())
    {
        return Err(invalid(format!(
            "{path} requires non-empty configurations and environments"
        )));
    }
    Ok(())
}

fn validity_domain_covers(provider: &ValidityDomain, required: &ValidityDomain) -> bool {
    let covers = |available: &NumericRange, demanded: &NumericRange| {
        available.minimum <= demanded.minimum && available.maximum >= demanded.maximum
    };
    covers(&provider.altitude_m, &required.altitude_m)
        && covers(&provider.mach, &required.mach)
        && covers(&provider.angle_of_attack_rad, &required.angle_of_attack_rad)
        && covers(&provider.load_factor_g, &required.load_factor_g)
        && required
            .configurations
            .iter()
            .all(|value| provider.configurations.contains(value))
        && required
            .environments
            .iter()
            .all(|value| provider.environments.contains(value))
}

fn require_validity_domain_coverage(
    path: &str,
    provider: &ValidityDomain,
    required: &ValidityDomain,
) -> Result<(), EngineError> {
    if validity_domain_covers(provider, required) {
        Ok(())
    } else {
        Err(invalid(format!(
            "{path}.validityDomain does not cover its admitted aircraft validity domain"
        )))
    }
}

fn sha256_digest(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
}

fn validate_aircraft_performance_admission(
    aircraft_id: &str,
    admission: &AircraftPerformanceAdmission,
    evidence: &[EvidenceReference],
) -> Result<(), EngineError> {
    const REQUIRED: [&str; 5] = [
        "AERODYNAMICS",
        "PROPULSION",
        "FLIGHT_CONTROLS",
        "MASS_AND_STORES",
        "SENSORS",
    ];
    match admission.state.as_str() {
        "UNSUPPORTED" => {
            if admission.limitation_id.as_deref().is_none_or(str::is_empty)
                || admission.reason.as_deref().is_none_or(str::is_empty)
                || !admission.capabilities.is_empty()
            {
                return Err(invalid(format!(
                    "aircraft model {aircraft_id} has an invalid unsupported named-performance admission"
                )));
            }
        }
        "ADMITTED" => {
            if admission.limitation_id.is_some() || admission.reason.is_some() {
                return Err(invalid(format!(
                    "aircraft model {aircraft_id} admitted named-performance evidence cannot carry an unsupported limitation"
                )));
            }
            let mut capabilities = HashSet::new();
            for capability in &admission.capabilities {
                if !REQUIRED.contains(&capability.capability.as_str())
                    || !capabilities.insert(capability.capability.as_str())
                    || capability.source_evidence_ref_ids.is_empty()
                    || capability.validation_evidence_ref_ids.is_empty()
                {
                    return Err(invalid(format!(
                        "aircraft model {aircraft_id} has invalid named-performance evidence capability"
                    )));
                }
                for source_id in &capability.source_evidence_ref_ids {
                    let Some(item) = evidence.iter().find(|item| item.id == *source_id) else {
                        return Err(invalid(format!("aircraft model {aircraft_id} references missing source evidence {source_id}")));
                    };
                    if item.kind != "SOURCE"
                        || !item.content_sha256.as_deref().is_some_and(sha256_digest)
                    {
                        return Err(invalid(format!("aircraft model {aircraft_id} source evidence {source_id} is not immutable SOURCE evidence")));
                    }
                }
                for validation_id in &capability.validation_evidence_ref_ids {
                    let Some(item) = evidence.iter().find(|item| item.id == *validation_id) else {
                        return Err(invalid(format!("aircraft model {aircraft_id} references missing validation evidence {validation_id}")));
                    };
                    if item.kind != "VALIDATION"
                        || !item.content_sha256.as_deref().is_some_and(sha256_digest)
                    {
                        return Err(invalid(format!("aircraft model {aircraft_id} validation evidence {validation_id} is not immutable VALIDATION evidence")));
                    }
                }
                if capability
                    .source_evidence_ref_ids
                    .iter()
                    .any(|id| capability.validation_evidence_ref_ids.contains(id))
                {
                    return Err(invalid(format!("aircraft model {aircraft_id} reuses one artifact as source and independent validation evidence")));
                }
            }
            if capabilities.len() != REQUIRED.len()
                || !REQUIRED.iter().all(|item| capabilities.contains(item))
            {
                return Err(invalid(format!(
                    "aircraft model {aircraft_id} does not cover every named-performance capability"
                )));
            }
        }
        _ => {
            return Err(invalid(format!(
                "aircraft model {aircraft_id} has unknown named-performance admission state"
            )))
        }
    }
    Ok(())
}

fn registry_ids(value: &Value, field: &str) -> Result<Vec<String>, EngineError> {
    let values = value.get(field).and_then(Value::as_array).ok_or_else(|| {
        invalid(format!(
            "governed evidence registry capability lacks {field}"
        ))
    })?;
    values
        .iter()
        .map(|item| {
            item.as_str().map(str::to_owned).ok_or_else(|| {
                invalid(format!(
                    "governed evidence registry {field} contains a non-string"
                ))
            })
        })
        .collect()
}

fn same_ids(left: &[String], mut right: Vec<String>) -> bool {
    let mut left = left.to_vec();
    left.sort();
    right.sort();
    left == right
}

/// The compiled pack can carry evidence rows, but it cannot self-admit a named
/// platform. The repository-owned registry is a build-time, immutable policy
/// artifact; it is loaded during pack admission, never in a simulation tick.
fn validate_governed_aircraft_evidence_admission(
    catalog_object_id: &str,
    admission: &AircraftPerformanceAdmission,
    evidence: &[EvidenceReference],
) -> Result<(), EngineError> {
    if admission.state != "ADMITTED" {
        return Ok(());
    }
    let registry: Value = serde_json::from_str(AIRCRAFT_EVIDENCE_REGISTRY).map_err(|error| {
        invalid(format!(
            "governed aircraft evidence registry is invalid: {error}"
        ))
    })?;
    validate_governed_aircraft_evidence_admission_against_registry(
        &registry,
        catalog_object_id,
        admission,
        evidence,
    )
}

fn validate_governed_artifact_identity(
    registry: &Value,
    evidence: &[EvidenceReference],
    artifact_id: &str,
    expected_kind: &str,
    claim_id: &str,
    capability: &str,
) -> Result<(), EngineError> {
    let artifact = registry
        .get("artifacts")
        .and_then(Value::as_array)
        .and_then(|artifacts| {
            artifacts
                .iter()
                .find(|item| item.get("id").and_then(Value::as_str) == Some(artifact_id))
        })
        .ok_or_else(|| {
            invalid(format!(
                "{claim_id} {capability} references missing governed artifact {artifact_id}"
            ))
        })?;
    let expected_use = if expected_kind == "SOURCE" {
        "NAMED_PERFORMANCE_SOURCE"
    } else {
        "NAMED_PERFORMANCE_VALIDATION"
    };
    let digest = artifact
        .get("sha256")
        .and_then(Value::as_str)
        .ok_or_else(|| {
            invalid(format!(
                "{claim_id} {capability} artifact {artifact_id} lacks an immutable SHA-256"
            ))
        })?;
    if artifact.get("kind").and_then(Value::as_str) != Some(expected_kind)
        || artifact.get("admissionUse").and_then(Value::as_str) != Some(expected_use)
        || artifact.get("hashReviewState").and_then(Value::as_str) != Some("VERIFIED")
        || artifact.get("licenseReviewState").and_then(Value::as_str) != Some("REVIEWED")
    {
        return Err(invalid(format!(
            "{claim_id} {capability} artifact {artifact_id} is not eligible immutable evidence"
        )));
    }
    let subject_claim_ids = registry_ids(artifact, "subjectClaimIds")?;
    let eligible_claim_ids = registry_ids(artifact, "eligibleClaimIds")?;
    if !subject_claim_ids.iter().any(|item| item == claim_id)
        || !eligible_claim_ids.iter().any(|item| item == claim_id)
    {
        return Err(invalid(format!(
            "{claim_id} {capability} artifact {artifact_id} is bound to a different subject or claim"
        )));
    }
    if !registry_ids(artifact, "capabilityCoverage")?
        .iter()
        .any(|item| item == capability)
    {
        return Err(invalid(format!(
            "{claim_id} {capability} artifact {artifact_id} lacks exact capability coverage"
        )));
    }
    let pack_evidence = evidence
        .iter()
        .find(|item| item.id == artifact_id)
        .ok_or_else(|| invalid(format!("model-pack evidence {artifact_id} is missing")))?;
    if pack_evidence.kind != expected_kind
        || pack_evidence.content_sha256.as_deref() != Some(digest)
    {
        return Err(invalid(format!(
            "{claim_id} {capability} model-pack evidence {artifact_id} identity or SHA-256 does not match the governed registry"
        )));
    }
    Ok(())
}

fn validate_governed_aircraft_evidence_admission_against_registry(
    registry: &Value,
    catalog_object_id: &str,
    admission: &AircraftPerformanceAdmission,
    evidence: &[EvidenceReference],
) -> Result<(), EngineError> {
    if admission.state != "ADMITTED" {
        return Ok(());
    }
    let claim = registry
        .get("claims")
        .and_then(Value::as_array)
        .and_then(|claims| {
            claims.iter().find(|item| {
                item.get("catalogObjectId").and_then(Value::as_str) == Some(catalog_object_id)
            })
        })
        .ok_or_else(|| {
            invalid(format!(
                "named aircraft {catalog_object_id} has no governed evidence-registry claim"
            ))
        })?;
    let claim_id = claim.get("id").and_then(Value::as_str).ok_or_else(|| {
        invalid(format!(
            "named aircraft {catalog_object_id} governed claim lacks id"
        ))
    })?;
    if claim.get("state").and_then(Value::as_str) != Some("ADMITTED") {
        return Err(invalid(format!(
            "named aircraft {catalog_object_id} is unsupported by the governed evidence registry"
        )));
    }
    let governed_capabilities = claim
        .get("capabilities")
        .and_then(Value::as_array)
        .ok_or_else(|| {
            invalid(format!(
                "named aircraft {catalog_object_id} governed registry claim lacks capabilities"
            ))
        })?;
    for capability in &admission.capabilities {
        let governed = governed_capabilities
            .iter()
            .find(|item| {
                item.get("capability").and_then(Value::as_str)
                    == Some(capability.capability.as_str())
            })
            .ok_or_else(|| {
                invalid(format!(
                    "named aircraft {catalog_object_id} has ungoverned capability {}",
                    capability.capability
                ))
            })?;
        if !same_ids(
            &capability.source_evidence_ref_ids,
            registry_ids(governed, "sourceArtifactIds")?,
        ) || !same_ids(
            &capability.validation_evidence_ref_ids,
            registry_ids(governed, "validationArtifactIds")?,
        ) {
            return Err(invalid(format!(
                "named aircraft {catalog_object_id} {} evidence does not exactly match the governed registry",
                capability.capability
            )));
        }
        for artifact_id in &capability.source_evidence_ref_ids {
            validate_governed_artifact_identity(
                registry,
                evidence,
                artifact_id,
                "SOURCE",
                claim_id,
                &capability.capability,
            )?;
        }
        for artifact_id in &capability.validation_evidence_ref_ids {
            validate_governed_artifact_identity(
                registry,
                evidence,
                artifact_id,
                "VALIDATION",
                claim_id,
                &capability.capability,
            )?;
        }
    }
    Ok(())
}

fn validate_sensor_evidence_admission(
    sensor: &SensorModel,
    evidence: &[EvidenceReference],
) -> Result<(), EngineError> {
    if sensor.sensor_kind == "DECLARED_ENVELOPE" {
        if sensor.verification_track_model.is_some() {
            return Err(invalid(format!(
                "sensor model {} cannot attach a verification track model to a declared envelope",
                sensor.id
            )));
        }
        return Ok(());
    }
    if !matches!(sensor.sensor_kind.as_str(), "RADAR" | "INFRARED" | "VISUAL") {
        return Err(invalid(format!(
            "sensor model {} has an unknown sensor kind",
            sensor.id
        )));
    }
    let admission = sensor.evidence_admission.as_ref().ok_or_else(|| {
        invalid(format!(
            "sensor model {} requires evidence admission for a positive sensor",
            sensor.id
        ))
    })?;
    if admission.schema_version != "vector.sensor-evidence-admission.v1" {
        return Err(invalid(format!(
            "sensor model {} has an unsupported sensor evidence admission schema",
            sensor.id
        )));
    }
    let validate_artifacts = |ids: &[String], kind: &str, field: &str| -> Result<(), EngineError> {
        if ids.is_empty() {
            return Err(invalid(format!(
                "sensor model {} has no {field}",
                sensor.id
            )));
        }
        for id in ids {
            let item = evidence.iter().find(|item| item.id == *id).ok_or_else(|| {
                invalid(format!(
                    "sensor model {} references missing {field} {id}",
                    sensor.id
                ))
            })?;
            if item.kind != kind
                || !item.content_sha256.as_deref().is_some_and(sha256_digest)
                || !sensor.evidence_ref_ids.contains(id)
            {
                return Err(invalid(format!(
                    "sensor model {} has invalid immutable {field} {id}",
                    sensor.id
                )));
            }
        }
        Ok(())
    };
    validate_artifacts(
        &admission.source_evidence_ref_ids,
        "SOURCE",
        "source evidence",
    )?;
    validate_artifacts(
        &admission.validation_evidence_ref_ids,
        "VALIDATION",
        "validation evidence",
    )?;
    if admission
        .source_evidence_ref_ids
        .iter()
        .any(|id| admission.validation_evidence_ref_ids.contains(id))
    {
        return Err(invalid(format!(
            "sensor model {} reuses one artifact as source and independent validation evidence",
            sensor.id
        )));
    }
    let coverage = &admission.coverage;
    if ![
        &coverage.detection_range,
        &coverage.minimum_range,
        &coverage.scan_period,
        &coverage.azimuth_field_of_view,
        &coverage.elevation_field_of_view,
        &coverage.measurement_uncertainty,
        &coverage.target_applicability,
    ]
    .into_iter()
    .all(|value| value == "VALIDATED")
    {
        return Err(invalid(format!(
            "sensor model {} has unknown or unvalidated positive-sensor evidence coverage",
            sensor.id
        )));
    }
    if let Some(model) = &sensor.verification_track_model {
        if !valid_verification_track_model(model) {
            return Err(invalid("generic verification track model is invalid"));
        }
    }
    Ok(())
}

fn unique_ids<'a>(
    path: &str,
    values: impl IntoIterator<Item = &'a str>,
) -> Result<(), EngineError> {
    let mut seen = HashSet::new();
    for value in values {
        if value.is_empty() || !seen.insert(value) {
            return Err(invalid(format!("{path} contains an empty or duplicate id")));
        }
    }
    Ok(())
}

fn validate_table(table: &CompiledTable) -> Result<(), EngineError> {
    validate_validity_domain(
        &format!("table {}.validityDomain", table.id),
        &table.validity_domain,
    )?;
    if table.axes.is_empty() {
        return Err(invalid(format!("table {} has no axes", table.id)));
    }
    let mut expected = 1_usize;
    for axis in &table.axes {
        if axis.values.is_empty() {
            return Err(invalid(format!("table {} has an empty axis", table.id)));
        }
        if axis.values.iter().any(|value| !value.is_finite()) {
            return Err(invalid(format!("table {} has a non-finite axis", table.id)));
        }
        if axis.values.windows(2).any(|pair| pair[0] >= pair[1]) {
            return Err(invalid(format!(
                "table {} axes must be strictly increasing",
                table.id
            )));
        }
        expected = expected
            .checked_mul(axis.values.len())
            .ok_or_else(|| invalid(format!("table {} dimensions overflow", table.id)))?;
    }
    if table.values.len() != expected || table.values.iter().any(|value| !value.is_finite()) {
        return Err(invalid(format!(
            "table {} value length or finiteness is invalid",
            table.id
        )));
    }
    Ok(())
}

fn canonicalize_digest_value(value: Value) -> Value {
    match value {
        Value::Array(values) => {
            Value::Array(values.into_iter().map(canonicalize_digest_value).collect())
        }
        Value::Object(values) => {
            let mut entries: Vec<_> = values.into_iter().collect();
            entries.sort_by(|left, right| left.0.cmp(&right.0));
            let mut sorted = serde_json::Map::new();
            for (key, item) in entries {
                sorted.insert(key, canonicalize_digest_value(item));
            }
            Value::Object(sorted)
        }
        Value::Number(number) => Value::String(format!(
            "#number:{:.12e}",
            number.as_f64().unwrap_or(f64::NAN)
        )),
        scalar => scalar,
    }
}

fn digest_payload(value: &Value) -> Result<String, EngineError> {
    let mut payload = value.clone();
    let object = payload
        .as_object_mut()
        .ok_or_else(|| invalid("compiled model pack must be an object"))?;
    object.remove("digest");
    let encoded = serde_json::to_vec(&canonicalize_digest_value(payload))
        .map_err(|error| EngineError::Serialization(error.to_string()))?;
    Ok(format!("{:x}", Sha256::digest(encoded)))
}

fn exact_keys_at(
    value: &Value,
    path: &str,
    required: &[&str],
    optional: &[&str],
) -> Result<(), EngineError> {
    let object = value
        .as_object()
        .ok_or_else(|| invalid(format!("{path} must be an object")))?;
    for key in object.keys() {
        if !required.contains(&key.as_str()) && !optional.contains(&key.as_str()) {
            return Err(invalid(format!("{path} has unsupported field {key}")));
        }
    }
    for key in required {
        if !object.contains_key(*key) {
            return Err(invalid(format!("{path} is missing field {key}")));
        }
    }
    Ok(())
}

fn array_at<'a>(value: &'a Value, path: &str) -> Result<&'a Vec<Value>, EngineError> {
    value
        .as_array()
        .ok_or_else(|| invalid(format!("{path} must be an array")))
}

fn validate_compiled_validity_exact(value: &Value, path: &str) -> Result<(), EngineError> {
    exact_keys_at(
        value,
        path,
        &[
            "altitudeM",
            "mach",
            "angleOfAttackRad",
            "loadFactorG",
            "configurations",
            "environments",
        ],
        &[],
    )?;
    for field in ["altitudeM", "mach", "angleOfAttackRad", "loadFactorG"] {
        exact_keys_at(
            &value[field],
            &format!("{path}.{field}"),
            &["minimum", "maximum"],
            &[],
        )?;
    }
    array_at(&value["configurations"], &format!("{path}.configurations"))?;
    array_at(&value["environments"], &format!("{path}.environments"))?;
    Ok(())
}

fn validate_source_validity_exact(value: &Value, path: &str) -> Result<(), EngineError> {
    exact_keys_at(
        value,
        path,
        &[
            "altitude",
            "mach",
            "angleOfAttack",
            "loadFactor",
            "configurations",
            "environments",
        ],
        &[],
    )?;
    for field in ["altitude", "mach", "angleOfAttack", "loadFactor"] {
        exact_keys_at(
            &value[field],
            &format!("{path}.{field}"),
            &["minimum", "maximum", "unit"],
            &[],
        )?;
    }
    Ok(())
}

fn validate_compiled_table_exact(value: &Value, path: &str) -> Result<(), EngineError> {
    exact_keys_at(
        value,
        path,
        &[
            "id",
            "outputUnit",
            "axes",
            "values",
            "evidenceRefIds",
            "validityDomain",
        ],
        &[],
    )?;
    for (index, axis) in array_at(&value["axes"], &format!("{path}.axes"))?
        .iter()
        .enumerate()
    {
        exact_keys_at(
            axis,
            &format!("{path}.axes[{index}]"),
            &["semantic", "unit", "values"],
            &[],
        )?;
    }
    validate_compiled_validity_exact(&value["validityDomain"], &format!("{path}.validityDomain"))
}

fn validate_compiled_base_exact(
    value: &Value,
    path: &str,
    specific: &[&str],
    optional: &[&str],
) -> Result<(), EngineError> {
    let mut required = vec![
        "id",
        "version",
        "evidenceRefIds",
        "validityDomain",
        "limitationIds",
    ];
    required.extend_from_slice(specific);
    exact_keys_at(value, path, &required, optional)?;
    validate_compiled_validity_exact(&value["validityDomain"], &format!("{path}.validityDomain"))
}

fn validate_observer_track_model_exact(value: &Value, path: &str) -> Result<(), EngineError> {
    exact_keys_at(
        value,
        path,
        &[
            "schemaVersion",
            "valueState",
            "intendedUse",
            "positionBiasM",
            "velocityBiasMps",
            "positionStandardDeviationM",
            "velocityStandardDeviationMps",
            "confirmationObservations",
            "maximumObservationAgeSeconds",
            "coastAfterSeconds",
            "lostAfterSeconds",
            "observationWindowsSeconds",
        ],
        &[],
    )?;
    for field in [
        "positionBiasM",
        "velocityBiasMps",
        "positionStandardDeviationM",
        "velocityStandardDeviationMps",
    ] {
        exact_keys_at(
            &value[field],
            &format!("{path}.{field}"),
            &["x", "y", "z"],
            &[],
        )?;
    }
    for (index, window) in array_at(
        &value["observationWindowsSeconds"],
        &format!("{path}.observationWindowsSeconds"),
    )?
    .iter()
    .enumerate()
    {
        exact_keys_at(
            window,
            &format!("{path}.observationWindowsSeconds[{index}]"),
            &["start", "end"],
            &[],
        )?;
    }
    Ok(())
}

fn validate_compiled_v2_exact_shape(value: &Value) -> Result<(), EngineError> {
    exact_keys_at(
        value,
        "pack",
        &[
            "schemaVersion",
            "id",
            "version",
            "digest",
            "unitSystem",
            "coordinateConventions",
            "intendedUses",
            "credibilityManifestRef",
            "evidence",
            "catalogIdentities",
            "aerodynamics",
            "propulsion",
            "sensors",
            "aircraft",
            "weapons",
            "loadouts",
            "compatibility",
            "legacyProjectionDigest",
            "sourceDigest",
            "lineageDigest",
            "admissionState",
            "requirementCompleteness",
            "evidenceLineage",
        ],
        &[],
    )?;
    exact_keys_at(
        &value["coordinateConventions"],
        "pack.coordinateConventions",
        &[
            "geodeticDatum",
            "localFrame",
            "bodyAxes",
            "aerodynamicAxes",
            "angularUnit",
            "positionUnit",
            "velocityUnit",
            "verticalReference",
        ],
        &[],
    )?;
    for (index, item) in array_at(&value["intendedUses"], "pack.intendedUses")?
        .iter()
        .enumerate()
    {
        exact_keys_at(
            item,
            &format!("pack.intendedUses[{index}]"),
            &["id", "version"],
            &[],
        )?;
    }
    exact_keys_at(
        &value["credibilityManifestRef"],
        "pack.credibilityManifestRef",
        &["id", "version"],
        &[],
    )?;
    for (index, item) in array_at(&value["evidence"], "pack.evidence")?
        .iter()
        .enumerate()
    {
        exact_keys_at(
            item,
            &format!("pack.evidence[{index}]"),
            &["id", "kind", "title", "uri", "accessedAt"],
            &["locator", "contentSha256"],
        )?;
    }
    for (index, item) in array_at(&value["catalogIdentities"], "pack.catalogIdentities")?
        .iter()
        .enumerate()
    {
        exact_keys_at(
            item,
            &format!("pack.catalogIdentities[{index}]"),
            &["catalogObjectId", "kind", "definitionModelIds"],
            &[],
        )?;
    }
    for (index, item) in array_at(&value["aerodynamics"], "pack.aerodynamics")?
        .iter()
        .enumerate()
    {
        let path = format!("pack.aerodynamics[{index}]");
        validate_compiled_base_exact(
            item,
            &path,
            &[
                "referenceAreaM2",
                "referenceChordM",
                "referenceSpanM",
                "coefficientTables",
            ],
            &[],
        )?;
        for (table_index, table) in array_at(
            &item["coefficientTables"],
            &format!("{path}.coefficientTables"),
        )?
        .iter()
        .enumerate()
        {
            validate_compiled_table_exact(
                table,
                &format!("{path}.coefficientTables[{table_index}]"),
            )?;
        }
    }
    for (index, item) in array_at(&value["propulsion"], "pack.propulsion")?
        .iter()
        .enumerate()
    {
        let path = format!("pack.propulsion[{index}]");
        validate_compiled_base_exact(
            item,
            &path,
            &["engineCount", "thrustTable", "fuelFlowTable", "spoolTimeS"],
            &[],
        )?;
        validate_compiled_table_exact(&item["thrustTable"], &format!("{path}.thrustTable"))?;
        validate_compiled_table_exact(&item["fuelFlowTable"], &format!("{path}.fuelFlowTable"))?;
    }
    for (index, item) in array_at(&value["sensors"], "pack.sensors")?
        .iter()
        .enumerate()
    {
        let path = format!("pack.sensors[{index}]");
        validate_compiled_base_exact(
            item,
            &path,
            &[
                "sensorKind",
                "detectionRangeM",
                "minimumRangeM",
                "scanPeriodS",
                "azimuthFieldOfViewRad",
                "elevationFieldOfViewRad",
            ],
            &["evidenceAdmission", "verificationTrackModel"],
        )?;
        if let Some(admission) = item.get("evidenceAdmission") {
            exact_keys_at(
                admission,
                &format!("{path}.evidenceAdmission"),
                &[
                    "schemaVersion",
                    "sourceEvidenceRefIds",
                    "validationEvidenceRefIds",
                    "coverage",
                ],
                &[],
            )?;
            exact_keys_at(
                &admission["coverage"],
                &format!("{path}.evidenceAdmission.coverage"),
                &[
                    "detectionRange",
                    "minimumRange",
                    "scanPeriod",
                    "azimuthFieldOfView",
                    "elevationFieldOfView",
                    "measurementUncertainty",
                    "targetApplicability",
                ],
                &[],
            )?;
        }
        if let Some(track_model) = item.get("verificationTrackModel") {
            validate_observer_track_model_exact(
                track_model,
                &format!("{path}.verificationTrackModel"),
            )?;
        }
    }
    for (index, item) in array_at(&value["aircraft"], "pack.aircraft")?
        .iter()
        .enumerate()
    {
        let path = format!("pack.aircraft[{index}]");
        validate_compiled_base_exact(
            item,
            &path,
            &[
                "catalogObjectId",
                "emptyMassKg",
                "fuelCapacityKg",
                "aerodynamicModelIndex",
                "propulsionModelIndexes",
                "sensorModelIndexes",
                "loadoutModelIndex",
                "maximumCommandLoadFactorG",
                "performanceAdmission",
            ],
            &[],
        )?;
        let admission = &item["performanceAdmission"];
        if admission["state"] == Value::String("UNSUPPORTED".to_string()) {
            exact_keys_at(
                admission,
                &format!("{path}.performanceAdmission"),
                &["state", "limitationId", "reason"],
                &[],
            )?;
        } else {
            exact_keys_at(
                admission,
                &format!("{path}.performanceAdmission"),
                &["state", "capabilities"],
                &[],
            )?;
            for (capability_index, capability) in array_at(
                &admission["capabilities"],
                &format!("{path}.performanceAdmission.capabilities"),
            )?
            .iter()
            .enumerate()
            {
                exact_keys_at(
                    capability,
                    &format!("{path}.performanceAdmission.capabilities[{capability_index}]"),
                    &[
                        "capability",
                        "sourceEvidenceRefIds",
                        "validationEvidenceRefIds",
                    ],
                    &[],
                )?;
            }
        }
    }
    for (index, item) in array_at(&value["weapons"], "pack.weapons")?
        .iter()
        .enumerate()
    {
        validate_compiled_base_exact(
            item,
            &format!("pack.weapons[{index}]"),
            &[
                "catalogObjectId",
                "launchMassKg",
                "dryMassKg",
                "aerodynamicModelIndex",
                "propulsionModelIndex",
                "sensorModelIndex",
                "seekerMode",
                "supportRequirement",
                "launchAuthorization",
                "maximumCommandLoadFactorG",
                "seekerActivationRangeM",
                "datalinkUpdatePeriodS",
                "thrustTaperSpeedMps",
                "navigationConstant",
                "termination",
            ],
            &[],
        )?;
        exact_keys_at(
            &item["termination"],
            &format!("pack.weapons[{index}].termination"),
            &[
                "schemaVersion",
                "intendedUse",
                "criterion",
                "interceptRadiusM",
                "maximumFlightTimeS",
            ],
            &[],
        )?;
    }
    for (index, item) in array_at(&value["loadouts"], "pack.loadouts")?
        .iter()
        .enumerate()
    {
        let path = format!("pack.loadouts[{index}]");
        validate_compiled_base_exact(item, &path, &["platformCatalogObjectId", "stations"], &[])?;
        for (station_index, station) in array_at(&item["stations"], &format!("{path}.stations"))?
            .iter()
            .enumerate()
        {
            let station_path = format!("{path}.stations[{station_index}]");
            exact_keys_at(
                station,
                &station_path,
                &[
                    "id",
                    "stationGroup",
                    "positionBodyM",
                    "maximumQuantity",
                    "compatibleStoreModelIndexes",
                ],
                &[],
            )?;
            exact_keys_at(
                &station["positionBodyM"],
                &format!("{station_path}.positionBodyM"),
                &["x", "y", "z"],
                &[],
            )?;
        }
    }
    for (index, item) in array_at(&value["compatibility"], "pack.compatibility")?
        .iter()
        .enumerate()
    {
        exact_keys_at(
            item,
            &format!("pack.compatibility[{index}]"),
            &[
                "id",
                "platformCatalogObjectId",
                "loadoutModelIndex",
                "storeModelIndex",
                "stationGroup",
                "status",
                "maximumQuantity",
                "rationale",
                "evidenceRefIds",
            ],
            &[],
        )?;
    }
    let completeness = &value["requirementCompleteness"];
    exact_keys_at(
        completeness,
        "pack.requirementCompleteness",
        &["profile", "results", "complete", "digest"],
        &[],
    )?;
    exact_keys_at(
        &completeness["profile"],
        "pack.requirementCompleteness.profile",
        &["id", "version", "digest"],
        &[],
    )?;
    for (index, item) in array_at(
        &completeness["results"],
        "pack.requirementCompleteness.results",
    )?
    .iter()
    .enumerate()
    {
        exact_keys_at(
            item,
            &format!("pack.requirementCompleteness.results[{index}]"),
            &["requirementId", "state", "gapReasons"],
            &[],
        )?;
    }
    for (index, item) in array_at(&value["evidenceLineage"], "pack.evidenceLineage")?
        .iter()
        .enumerate()
    {
        let path = format!("pack.evidenceLineage[{index}]");
        exact_keys_at(
            item,
            &path,
            &[
                "id",
                "selector",
                "dataFamily",
                "componentId",
                "configurationId",
                "valueState",
                "evidenceRole",
                "unit",
                "frame",
                "datum",
                "uncertainty",
                "validityDomain",
            ],
            &[
                "valueDigest",
                "rawArtifactDigest",
                "derivativeDigest",
                "sourceLocator",
                "sourceRecord",
                "gapReason",
            ],
        )?;
        if item["uncertainty"]["state"] == Value::String("KNOWN".to_string()) {
            exact_keys_at(
                &item["uncertainty"],
                &format!("{path}.uncertainty"),
                &["state", "magnitude", "unit"],
                &[],
            )?;
        } else {
            exact_keys_at(
                &item["uncertainty"],
                &format!("{path}.uncertainty"),
                &["state"],
                &[],
            )?;
        }
        validate_source_validity_exact(&item["validityDomain"], &format!("{path}.validityDomain"))?;
    }
    Ok(())
}

/// Strictly validates a Stage-B compiled identity without admitting it to runtime execution.
pub fn validate_compiled_model_pack_v2_json(
    input: &str,
) -> Result<CompiledModelPackV2Identity, EngineError> {
    let value: Value =
        serde_json::from_str(input).map_err(|error| EngineError::InvalidJson(error.to_string()))?;
    validate_compiled_v2_exact_shape(&value)?;
    if value["schemaVersion"] != Value::String(COMPILED_V2_SCHEMA.to_string())
        || value["unitSystem"] != Value::String("SI".to_string())
    {
        return Err(invalid(
            "unsupported compiled model-pack v2 schema or unit system",
        ));
    }
    for field in [
        "digest",
        "legacyProjectionDigest",
        "sourceDigest",
        "lineageDigest",
    ] {
        if !value[field].as_str().is_some_and(sha256_digest) {
            return Err(invalid(format!("pack.{field} must be lowercase SHA-256")));
        }
    }
    let computed_digest = digest_payload(&value)?;
    if value["digest"] != Value::String(computed_digest) {
        return Err(invalid("compiled model-pack v2 digest mismatch"));
    }
    let completeness = &value["requirementCompleteness"];
    let computed_completeness_digest = digest_payload(completeness)?;
    if completeness["digest"] != Value::String(computed_completeness_digest) {
        return Err(invalid(
            "compiled model-pack v2 completeness digest mismatch",
        ));
    }
    let complete = completeness["complete"]
        .as_bool()
        .ok_or_else(|| invalid("pack.requirementCompleteness.complete must be boolean"))?;
    let expected_admission = if complete {
        "COMPLETE_FOUNDATION_NON_PROMOTABLE"
    } else {
        "INCOMPLETE"
    };
    if value["admissionState"] != Value::String(expected_admission.to_string()) {
        return Err(invalid("compiled model-pack v2 admission state mismatch"));
    }
    let mut legacy_value = value.clone();
    let legacy = legacy_value
        .as_object_mut()
        .ok_or_else(|| invalid("compiled model pack must be an object"))?;
    for field in [
        "legacyProjectionDigest",
        "sourceDigest",
        "lineageDigest",
        "admissionState",
        "requirementCompleteness",
        "evidenceLineage",
    ] {
        legacy.remove(field);
    }
    legacy.insert(
        "schemaVersion".to_string(),
        Value::String(COMPILED_SCHEMA.to_string()),
    );
    legacy.insert(
        "digest".to_string(),
        value["legacyProjectionDigest"].clone(),
    );
    let legacy_pack: CompiledModelPack = serde_json::from_value(legacy_value.clone())
        .map_err(|error| EngineError::InvalidJson(error.to_string()))?;
    validate_pack(&legacy_pack, &legacy_value)?;
    Ok(CompiledModelPackV2Identity {
        id: value["id"].as_str().unwrap_or_default().to_string(),
        version: value["version"].as_str().unwrap_or_default().to_string(),
        digest: value["digest"].as_str().unwrap_or_default().to_string(),
        legacy_projection_digest: value["legacyProjectionDigest"]
            .as_str()
            .unwrap_or_default()
            .to_string(),
        source_digest: value["sourceDigest"]
            .as_str()
            .unwrap_or_default()
            .to_string(),
        lineage_digest: value["lineageDigest"]
            .as_str()
            .unwrap_or_default()
            .to_string(),
    })
}

fn validate_pack(pack: &CompiledModelPack, value: &Value) -> Result<(), EngineError> {
    if pack.schema_version != COMPILED_SCHEMA || pack.unit_system != "SI" {
        return Err(invalid(
            "unsupported compiled model-pack schema or unit system",
        ));
    }
    if pack.digest.len() != 64 || !pack.digest.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err(invalid(
            "compiled model-pack digest must be lowercase SHA-256",
        ));
    }
    let computed_digest = digest_payload(value)?;
    if computed_digest != pack.digest {
        return Err(invalid(format!(
            "compiled model-pack digest mismatch: expected {}, computed {computed_digest}",
            pack.digest
        )));
    }
    if pack.intended_uses.is_empty()
        || pack.evidence.is_empty()
        || pack.catalog_identities.is_empty()
    {
        return Err(invalid(
            "compiled model pack requires intended use, evidence, and catalog identity",
        ));
    }
    unique_ids(
        "evidence",
        pack.evidence.iter().map(|item| item.id.as_str()),
    )?;
    if pack.evidence.iter().any(|item| {
        item.content_sha256
            .as_deref()
            .is_some_and(|digest| !sha256_digest(digest))
    }) {
        return Err(invalid(
            "compiled model-pack evidence contentSha256 must be lowercase SHA-256 when supplied",
        ));
    }
    unique_ids(
        "catalogIdentities",
        pack.catalog_identities
            .iter()
            .map(|item| item.catalog_object_id.as_str()),
    )?;
    unique_ids(
        "aerodynamics",
        pack.aerodynamics.iter().map(|item| item.id.as_str()),
    )?;
    unique_ids(
        "propulsion",
        pack.propulsion.iter().map(|item| item.id.as_str()),
    )?;
    unique_ids("sensors", pack.sensors.iter().map(|item| item.id.as_str()))?;
    unique_ids(
        "aircraft",
        pack.aircraft.iter().map(|item| item.id.as_str()),
    )?;
    unique_ids("weapons", pack.weapons.iter().map(|item| item.id.as_str()))?;
    unique_ids(
        "loadouts",
        pack.loadouts.iter().map(|item| item.id.as_str()),
    )?;
    unique_ids(
        "compatibility",
        pack.compatibility.iter().map(|item| item.id.as_str()),
    )?;

    for model in &pack.aerodynamics {
        validate_validity_domain(
            &format!("aerodynamic model {}.validityDomain", model.id),
            &model.validity_domain,
        )?;
        finite_non_negative("aerodynamic reference area", model.reference_area_m2)?;
        finite_non_negative("aerodynamic reference chord", model.reference_chord_m)?;
        finite_non_negative("aerodynamic reference span", model.reference_span_m)?;
        if model.coefficient_tables.is_empty() {
            return Err(invalid(format!(
                "aerodynamic model {} has no coefficient tables",
                model.id
            )));
        }
        for table in &model.coefficient_tables {
            validate_table(table)?;
        }
    }
    for model in &pack.propulsion {
        validate_validity_domain(
            &format!("propulsion model {}.validityDomain", model.id),
            &model.validity_domain,
        )?;
        if model.engine_count == 0 {
            return Err(invalid(format!(
                "propulsion model {} has zero engines",
                model.id
            )));
        }
        validate_table(&model.thrust_table)?;
        validate_table(&model.fuel_flow_table)?;
        finite_non_negative("propulsion spool time", model.spool_time_s)?;
    }
    for model in &pack.sensors {
        validate_validity_domain(
            &format!("sensor model {}.validityDomain", model.id),
            &model.validity_domain,
        )?;
        finite_non_negative("sensor detection range", model.detection_range_m)?;
        finite_non_negative("sensor minimum range", model.minimum_range_m)?;
        finite_non_negative("sensor scan period", model.scan_period_s)?;
        finite_non_negative(
            "sensor azimuth field of view",
            model.azimuth_field_of_view_rad,
        )?;
        finite_non_negative(
            "sensor elevation field of view",
            model.elevation_field_of_view_rad,
        )?;
        validate_sensor_evidence_admission(model, &pack.evidence)?;
        if model.verification_track_model.is_some()
            && !pack
                .intended_uses
                .iter()
                .any(|item| item.id == "vector.intended-use.engine-verification")
        {
            return Err(invalid(format!(
                "sensor model {} verification track model requires engine-verification intended use",
                model.id
            )));
        }
    }
    for model in &pack.aircraft {
        validate_validity_domain(
            &format!("aircraft model {}.validityDomain", model.id),
            &model.validity_domain,
        )?;
        finite_non_negative("aircraft empty mass", model.empty_mass_kg)?;
        finite_non_negative("aircraft fuel capacity", model.fuel_capacity_kg)?;
        validate_aircraft_performance_admission(
            &model.id,
            &model.performance_admission,
            &pack.evidence,
        )?;
        validate_governed_aircraft_evidence_admission(
            &model.catalog_object_id,
            &model.performance_admission,
            &pack.evidence,
        )?;
        if model.aerodynamic_model_index >= pack.aerodynamics.len()
            || model.loadout_model_index >= pack.loadouts.len()
            || model
                .propulsion_model_indexes
                .iter()
                .any(|index| *index >= pack.propulsion.len())
            || model
                .sensor_model_indexes
                .iter()
                .any(|index| *index >= pack.sensors.len())
        {
            return Err(invalid(format!(
                "aircraft model {} has invalid indexes",
                model.id
            )));
        }
        let aerodynamic = &pack.aerodynamics[model.aerodynamic_model_index];
        require_validity_domain_coverage(
            &format!("aircraft model {} aerodynamicModel", model.id),
            &aerodynamic.validity_domain,
            &model.validity_domain,
        )?;
        for (index, table) in aerodynamic.coefficient_tables.iter().enumerate() {
            require_validity_domain_coverage(
                &format!(
                    "aircraft model {} aerodynamicModel coefficientTables[{index}]",
                    model.id
                ),
                &table.validity_domain,
                &model.validity_domain,
            )?;
        }
        for (index, propulsion_index) in model.propulsion_model_indexes.iter().enumerate() {
            let propulsion = &pack.propulsion[*propulsion_index];
            require_validity_domain_coverage(
                &format!("aircraft model {} propulsionModels[{index}]", model.id),
                &propulsion.validity_domain,
                &model.validity_domain,
            )?;
            require_validity_domain_coverage(
                &format!(
                    "aircraft model {} propulsionModels[{index}] thrustTable",
                    model.id
                ),
                &propulsion.thrust_table.validity_domain,
                &model.validity_domain,
            )?;
            require_validity_domain_coverage(
                &format!(
                    "aircraft model {} propulsionModels[{index}] fuelFlowTable",
                    model.id
                ),
                &propulsion.fuel_flow_table.validity_domain,
                &model.validity_domain,
            )?;
        }
        for (index, sensor_index) in model.sensor_model_indexes.iter().enumerate() {
            require_validity_domain_coverage(
                &format!("aircraft model {} sensorModels[{index}]", model.id),
                &pack.sensors[*sensor_index].validity_domain,
                &model.validity_domain,
            )?;
        }
        require_validity_domain_coverage(
            &format!("aircraft model {} loadoutModel", model.id),
            &pack.loadouts[model.loadout_model_index].validity_domain,
            &model.validity_domain,
        )?;
    }
    for model in &pack.weapons {
        validate_validity_domain(
            &format!("weapon model {}.validityDomain", model.id),
            &model.validity_domain,
        )?;
        finite_non_negative("weapon launch mass", model.launch_mass_kg)?;
        finite_non_negative("weapon dry mass", model.dry_mass_kg)?;
        if model.dry_mass_kg > model.launch_mass_kg
            || model.aerodynamic_model_index >= pack.aerodynamics.len()
            || model.propulsion_model_index >= pack.propulsion.len()
            || model
                .sensor_model_index
                .is_some_and(|index| index >= pack.sensors.len())
        {
            return Err(invalid(format!(
                "weapon model {} has invalid indexes or mass",
                model.id
            )));
        }
    }
    for loadout in &pack.loadouts {
        validate_validity_domain(
            &format!("loadout {}.validityDomain", loadout.id),
            &loadout.validity_domain,
        )?;
        for station in &loadout.stations {
            if station.maximum_quantity == 0
                || station
                    .compatible_store_model_indexes
                    .iter()
                    .any(|index| *index >= pack.weapons.len())
            {
                return Err(invalid(format!(
                    "loadout {} has an invalid station",
                    loadout.id
                )));
            }
        }
    }
    for rule in &pack.compatibility {
        if rule.loadout_model_index >= pack.loadouts.len()
            || rule.store_model_index >= pack.weapons.len()
            || rule.maximum_quantity == 0
            || (rule.status != "SUPPORTED" && rule.status != "UNSUPPORTED")
        {
            return Err(invalid(format!(
                "compatibility rule {} is invalid",
                rule.id
            )));
        }
    }
    Ok(())
}

/// Parse and validate the same immutable SI model-pack contract consumed by TypeScript.
pub fn validate_model_pack_json(input: &str) -> Result<CompiledModelPack, EngineError> {
    let value: Value =
        serde_json::from_str(input).map_err(|error| EngineError::InvalidJson(error.to_string()))?;
    let pack: CompiledModelPack = serde_json::from_value(value.clone())
        .map_err(|error| EngineError::InvalidJson(error.to_string()))?;
    validate_pack(&pack, &value)?;
    Ok(pack)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn aircraft_evidence_registry_v2_preserves_v1_and_denies_context_runtime_authority(
    ) -> Result<(), Box<dyn std::error::Error>> {
        let v1: Value = serde_json::from_str(include_str!(
            "../../governance/aircraft-evidence-registry.v1.json"
        ))?;
        let v2: Value = serde_json::from_str(AIRCRAFT_EVIDENCE_REGISTRY)?;
        assert_eq!(
            v1["schemaVersion"],
            Value::from("vector.aircraft-evidence-registry.v1")
        );
        assert_eq!(v2["supersedes"]["schemaVersion"], v1["schemaVersion"]);
        assert_eq!(v2["subjects"].as_array().map(Vec::len), Some(3));
        assert!(v2["claims"]
            .as_array()
            .is_some_and(|claims| claims.iter().all(|claim| claim["state"] == "UNSUPPORTED")));
        assert!(v2["catalogAssertions"]
            .as_array()
            .is_some_and(|items| items.iter().all(|item| item["runtimeAuthority"] == "NONE")));
        assert!(v2["artifacts"]
            .as_array()
            .is_some_and(
                |items| items.iter().all(|item| item["subjectClaimIds"].is_array()
                    && item["eligibleClaimIds"].is_array()
                    && item["capabilityCoverage"].is_array())
            ));
        let proposal = v2["artifacts"]
            .as_array()
            .and_then(|items| {
                items
                    .iter()
                    .find(|item| item["id"] == "dsca-pakistan-15-80-proposal")
            })
            .ok_or("missing quarantined proposal")?;
        assert_eq!(proposal["admissionUse"], "INELIGIBLE");
        assert_eq!(proposal["transactionState"], "EXPIRED_WITHOUT_ACCEPTANCE");
        let lockheed = v2["artifacts"]
            .as_array()
            .and_then(|items| {
                items
                    .iter()
                    .find(|item| item["id"] == "lockheed-peace-drive-i-2009")
            })
            .ok_or("missing mutable Lockheed locator")?;
        assert_eq!(lockheed["hashReviewState"], "PENDING");
        assert!(lockheed["sha256"].is_null());
        Ok(())
    }

    #[test]
    fn governed_admission_binds_pack_digest_subject_and_capability(
    ) -> Result<(), Box<dyn std::error::Error>> {
        let mut registry: Value = serde_json::from_str(AIRCRAFT_EVIDENCE_REGISTRY)?;
        let capabilities = [
            "AERODYNAMICS",
            "PROPULSION",
            "FLIGHT_CONTROLS",
            "MASS_AND_STORES",
            "SENSORS",
        ];
        let claim = registry["claims"]
            .as_array_mut()
            .and_then(|claims| {
                claims
                    .iter_mut()
                    .find(|item| item["id"] == "su-30mki-performance")
            })
            .ok_or("missing Su-30MKI claim")?;
        claim["state"] = Value::from("ADMITTED");
        claim["capabilities"] = Value::Array(
            capabilities
                .iter()
                .map(|capability| {
                    serde_json::json!({
                        "capability": capability,
                        "sourceArtifactIds": ["su30-exact-source"],
                        "validationArtifactIds": ["su30-exact-validation"]
                    })
                })
                .collect(),
        );
        registry["artifacts"]
            .as_array_mut()
            .ok_or("missing artifacts")?
            .extend([
                serde_json::json!({
                    "id": "su30-exact-source",
                    "kind": "SOURCE",
                    "sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                    "hashReviewState": "VERIFIED",
                    "licenseReviewState": "REVIEWED",
                    "admissionUse": "NAMED_PERFORMANCE_SOURCE",
                    "subjectClaimIds": ["su-30mki-performance"],
                    "eligibleClaimIds": ["su-30mki-performance"],
                    "capabilityCoverage": capabilities
                }),
                serde_json::json!({
                    "id": "su30-exact-validation",
                    "kind": "VALIDATION",
                    "sha256": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
                    "hashReviewState": "VERIFIED",
                    "licenseReviewState": "REVIEWED",
                    "admissionUse": "NAMED_PERFORMANCE_VALIDATION",
                    "subjectClaimIds": ["su-30mki-performance"],
                    "eligibleClaimIds": ["su-30mki-performance"],
                    "capabilityCoverage": capabilities
                }),
            ]);
        let admission: AircraftPerformanceAdmission = serde_json::from_value(serde_json::json!({
            "state": "ADMITTED",
            "capabilities": capabilities.iter().map(|capability| serde_json::json!({
                "capability": capability,
                "sourceEvidenceRefIds": ["su30-exact-source"],
                "validationEvidenceRefIds": ["su30-exact-validation"]
            })).collect::<Vec<_>>()
        }))?;
        let evidence = vec![
            EvidenceReference {
                id: "su30-exact-source".into(),
                kind: "SOURCE".into(),
                content_sha256: Some(
                    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa".into(),
                ),
            },
            EvidenceReference {
                id: "su30-exact-validation".into(),
                kind: "VALIDATION".into(),
                content_sha256: Some(
                    "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb".into(),
                ),
            },
        ];
        validate_governed_aircraft_evidence_admission_against_registry(
            &registry, "su-30mki", &admission, &evidence,
        )?;

        let mut wrong_digest = evidence.clone();
        wrong_digest[0].content_sha256 =
            Some("cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc".into());
        assert!(
            validate_governed_aircraft_evidence_admission_against_registry(
                &registry,
                "su-30mki",
                &admission,
                &wrong_digest,
            )
            .is_err()
        );

        {
            let source = registry["artifacts"]
                .as_array_mut()
                .and_then(|items| {
                    items
                        .iter_mut()
                        .find(|item| item["id"] == "su30-exact-source")
                })
                .ok_or("missing test source")?;
            source["subjectClaimIds"] = serde_json::json!(["f-16c-block52-paf-performance"]);
            source["eligibleClaimIds"] = serde_json::json!(["f-16c-block52-paf-performance"]);
        }
        assert!(
            validate_governed_aircraft_evidence_admission_against_registry(
                &registry, "su-30mki", &admission, &evidence,
            )
            .is_err()
        );
        {
            let source = registry["artifacts"]
                .as_array_mut()
                .and_then(|items| {
                    items
                        .iter_mut()
                        .find(|item| item["id"] == "su30-exact-source")
                })
                .ok_or("missing test source")?;
            source["subjectClaimIds"] = serde_json::json!(["su-30mki-performance"]);
            source["eligibleClaimIds"] = serde_json::json!(["su-30mki-performance"]);
            source["capabilityCoverage"] = serde_json::json!(["PROPULSION"]);
        }
        assert!(
            validate_governed_aircraft_evidence_admission_against_registry(
                &registry, "su-30mki", &admission, &evidence,
            )
            .is_err()
        );
        Ok(())
    }

    fn fixture_pack_json() -> Result<String, Box<dyn std::error::Error>> {
        let bundle: Value = serde_json::from_str(include_str!(
            "../../fixtures/model-packs/vector-scalar-study-v0.9.compiled.json"
        ))?;
        Ok(serde_json::to_string(&bundle["pack"])?)
    }

    #[test]
    fn consumes_the_shared_typescript_fixture() -> Result<(), Box<dyn std::error::Error>> {
        let fixture = fixture_pack_json()?;
        let pack = validate_model_pack_json(&fixture)?;
        assert_eq!(pack.schema_version, COMPILED_SCHEMA);
        assert_eq!(pack.aircraft.len(), 4);
        assert_eq!(pack.weapons.len(), 8);
        Ok(())
    }

    #[test]
    fn rejects_digest_and_index_tampering() -> Result<(), Box<dyn std::error::Error>> {
        let mut value: Value = serde_json::from_str(&fixture_pack_json()?)?;
        value["weapons"][0]["aerodynamicModelIndex"] = Value::from(999);
        let tampered = serde_json::to_string(&value)?;
        assert!(validate_model_pack_json(&tampered).is_err());
        Ok(())
    }

    #[test]
    fn rejects_an_aircraft_envelope_that_exceeds_its_admitted_component(
    ) -> Result<(), Box<dyn std::error::Error>> {
        let mut value: Value = serde_json::from_str(&fixture_pack_json()?)?;
        value["aircraft"][0]["validityDomain"]["mach"]["maximum"] = Value::from(6.0);
        let digest = digest_payload(&value)?;
        value["digest"] = Value::from(digest);
        let error = match validate_model_pack_json(&serde_json::to_string(&value)?) {
            Ok(_) => return Err("component envelope gap must fail closed".into()),
            Err(error) => error,
        };
        assert!(error
            .to_string()
            .contains("does not cover its admitted aircraft validity domain"));
        Ok(())
    }

    #[test]
    fn rejects_named_performance_claims_without_source_bound_validation(
    ) -> Result<(), Box<dyn std::error::Error>> {
        let mut value: Value = serde_json::from_str(&fixture_pack_json()?)?;
        value["aircraft"][0]["performanceAdmission"] = serde_json::json!({
            "state": "ADMITTED",
            "capabilities": []
        });
        value["digest"] = Value::from(digest_payload(&value)?);
        let error = match validate_model_pack_json(&serde_json::to_string(&value)?) {
            Ok(_) => return Err("an empty named-performance claim must fail closed".into()),
            Err(error) => error,
        };
        assert!(error
            .to_string()
            .contains("does not cover every named-performance capability"));
        Ok(())
    }

    #[test]
    fn rejects_forged_named_performance_evidence_not_in_the_governed_registry(
    ) -> Result<(), Box<dyn std::error::Error>> {
        let mut value: Value = serde_json::from_str(&fixture_pack_json()?)?;
        let evidence = value["evidence"]
            .as_array_mut()
            .ok_or("fixture must contain evidence array")?;
        evidence.extend([
            serde_json::json!({ "id": "forged-source", "kind": "SOURCE", "contentSha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }),
            serde_json::json!({ "id": "forged-validation", "kind": "VALIDATION", "contentSha256": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" }),
        ]);
        let capabilities: Vec<Value> = [
            "AERODYNAMICS",
            "PROPULSION",
            "FLIGHT_CONTROLS",
            "MASS_AND_STORES",
            "SENSORS",
        ]
        .into_iter()
        .map(|capability| {
            serde_json::json!({
                "capability": capability,
                "sourceEvidenceRefIds": ["forged-source"],
                "validationEvidenceRefIds": ["forged-validation"]
            })
        })
        .collect();
        value["aircraft"][0]["performanceAdmission"] = serde_json::json!({
            "state": "ADMITTED",
            "capabilities": capabilities
        });
        value["digest"] = Value::from(digest_payload(&value)?);
        let error = match validate_model_pack_json(&serde_json::to_string(&value)?) {
            Ok(_) => return Err("registry must reject forged named-performance evidence".into()),
            Err(error) => error,
        };
        assert!(error
            .to_string()
            .contains("unsupported by the governed evidence registry"));
        Ok(())
    }

    #[test]
    fn positive_sensor_requires_complete_separate_immutable_evidence(
    ) -> Result<(), Box<dyn std::error::Error>> {
        let mut value: Value = serde_json::from_str(&fixture_pack_json()?)?;
        let evidence = value["evidence"]
            .as_array_mut()
            .ok_or("fixture must contain an evidence array")?;
        evidence.extend([
            serde_json::json!({
                "id": "sensor-source-artifact",
                "kind": "SOURCE",
                "contentSha256": "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
            }),
            serde_json::json!({
                "id": "sensor-validation-artifact",
                "kind": "VALIDATION",
                "contentSha256": "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
            }),
        ]);
        value["sensors"][0]["sensorKind"] = Value::from("RADAR");
        value["sensors"][0]["evidenceRefIds"] =
            serde_json::json!(["sensor-source-artifact", "sensor-validation-artifact"]);
        value["sensors"][0]["evidenceAdmission"] = serde_json::json!({
            "schemaVersion": "vector.sensor-evidence-admission.v1",
            "sourceEvidenceRefIds": ["sensor-source-artifact"],
            "validationEvidenceRefIds": ["sensor-validation-artifact"],
            "coverage": {
                "detectionRange": "VALIDATED",
                "minimumRange": "VALIDATED",
                "scanPeriod": "VALIDATED",
                "azimuthFieldOfView": "VALIDATED",
                "elevationFieldOfView": "VALIDATED",
                "measurementUncertainty": "VALIDATED",
                "targetApplicability": "VALIDATED"
            }
        });
        value["digest"] = Value::from(digest_payload(&value)?);
        assert!(validate_model_pack_json(&serde_json::to_string(&value)?).is_ok());

        value["sensors"][0]["evidenceAdmission"]["coverage"]["minimumRange"] =
            Value::from("UNKNOWN");
        value["digest"] = Value::from(digest_payload(&value)?);
        let error = match validate_model_pack_json(&serde_json::to_string(&value)?) {
            Ok(_) => return Err("unknown sensor lower bound must fail closed".into()),
            Err(error) => error,
        };
        assert!(error
            .to_string()
            .contains("unknown or unvalidated positive-sensor evidence coverage"));
        Ok(())
    }

    #[test]
    fn compiled_v2_identity_matches_typescript_and_rejects_unknown_or_tampered_fields(
    ) -> Result<(), Box<dyn std::error::Error>> {
        let archive: Value = serde_json::from_str(include_str!(
            "../../fixtures/model-packs/anonymous-pack-alpha.governed.v2.json"
        ))?;
        let pack = archive["publications"][0]["bundle"]["pack"].clone();
        let identity = validate_compiled_model_pack_v2_json(&serde_json::to_string(&pack)?)?;
        assert_eq!(
            identity.digest,
            "78649ed148367df57c5a810fdea4ccb474a4e384184df8e33e05d46f9084c1a5"
        );
        assert_eq!(identity.id, "anonymous-pack-alpha");

        let mut unknown = pack.clone();
        unknown["inventedAuthority"] = Value::Bool(true);
        let unknown_error =
            match validate_compiled_model_pack_v2_json(&serde_json::to_string(&unknown)?) {
                Ok(_) => return Err("unknown compiled authority must reject".into()),
                Err(error) => error,
            };
        assert!(unknown_error
            .to_string()
            .contains("pack has unsupported field inventedAuthority"));

        let mut tampered = pack;
        tampered["evidenceLineage"][0]["valueDigest"] = Value::String("0".repeat(64));
        let tamper_error =
            match validate_compiled_model_pack_v2_json(&serde_json::to_string(&tampered)?) {
                Ok(_) => return Err("last-field tampering must reject".into()),
                Err(error) => error,
            };
        assert!(tamper_error.to_string().contains("digest mismatch"));
        Ok(())
    }
}
