use std::collections::HashSet;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};

use crate::EngineError;

const COMPILED_SCHEMA: &str = "vector.compiled-model-pack.v1";

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EvidenceReference {
    pub id: String,
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
    pub detection_range_m: f64,
    pub minimum_range_m: f64,
    pub scan_period_s: f64,
    pub azimuth_field_of_view_rad: f64,
    pub elevation_field_of_view_rad: f64,
    pub validity_domain: ValidityDomain,
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
    }
    for model in &pack.aircraft {
        validate_validity_domain(
            &format!("aircraft model {}.validityDomain", model.id),
            &model.validity_domain,
        )?;
        finite_non_negative("aircraft empty mass", model.empty_mass_kg)?;
        finite_non_negative("aircraft fuel capacity", model.fuel_capacity_kg)?;
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

    fn fixture_pack_json() -> Result<String, Box<dyn std::error::Error>> {
        let bundle: Value = serde_json::from_str(include_str!(
            "../../fixtures/model-packs/vector-scalar-study-v0.6.compiled.json"
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
}
