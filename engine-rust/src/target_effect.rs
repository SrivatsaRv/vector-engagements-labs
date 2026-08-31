use serde::Serialize;
use serde_json::{Map, Value};
use sha2::{Digest, Sha256};

use crate::{EngineError, EntityDefinition, EntityKind, EntityLifecycle};

pub const TARGET_EFFECT_AUTHORITY_SCHEMA: &str = "vector.target-effect-authority.v1";
pub const TARGET_EFFECT_MODEL_SCHEMA: &str = "vector.target-effect-model.v1";
pub const TARGET_EFFECT_COMMIT_SCHEMA: &str = "vector.target-effect-commit.v1";
pub const TARGET_EFFECT_INTENDED_USE_ID: &str = "vector.intended-use.generic-target-effect-study";

pub type TargetEffectAuthority = Value;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum TargetEffectResult {
    NoEffect,
    Degraded,
    MissionKill,
    Kill,
    EffectUnavailable,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum TargetEffectReason {
    ThresholdBand,
    AboveEffectBands,
    TerminationNotEffectEligible,
    AuthorityUnavailable,
    OutsideTargetDomain,
    TargetUnavailable,
}

impl TargetEffectResult {
    fn name(self) -> &'static str {
        match self {
            Self::NoEffect => "NO_EFFECT",
            Self::Degraded => "DEGRADED",
            Self::MissionKill => "MISSION_KILL",
            Self::Kill => "KILL",
            Self::EffectUnavailable => "EFFECT_UNAVAILABLE",
        }
    }
}

impl TargetEffectReason {
    fn name(self) -> &'static str {
        match self {
            Self::ThresholdBand => "THRESHOLD_BAND",
            Self::AboveEffectBands => "ABOVE_EFFECT_BANDS",
            Self::TerminationNotEffectEligible => "TERMINATION_NOT_EFFECT_ELIGIBLE",
            Self::AuthorityUnavailable => "AUTHORITY_UNAVAILABLE",
            Self::OutsideTargetDomain => "OUTSIDE_TARGET_DOMAIN",
            Self::TargetUnavailable => "TARGET_UNAVAILABLE",
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TargetEffectTerminationReceipt {
    pub tick: u64,
    pub local_key: String,
    pub cause: String,
    pub model_time_seconds: f64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TargetEffectEvaluation {
    pub schema_version: &'static str,
    #[serde(skip_serializing_if = "String::is_empty")]
    pub commit_id: String,
    pub model_pack_digest: String,
    pub model_id: Option<String>,
    pub model_version: Option<String>,
    pub model_digest: Option<String>,
    pub intended_use_id: Option<String>,
    pub intended_use_version: Option<String>,
    pub target_profile_id: Option<String>,
    pub target_profile_version: Option<String>,
    pub weapon_id: String,
    pub target_id: String,
    pub termination_receipt: TargetEffectTerminationReceipt,
    pub value_state: &'static str,
    pub result: &'static str,
    pub reason: &'static str,
    pub closest_approach_m: f64,
    pub target_mass_kg: f64,
    pub target_speed_mps: f64,
    pub target_altitude_msl_m: f64,
    pub selected_threshold_upper_bound_m: Option<f64>,
    pub target_effect_state_before: &'static str,
    pub target_effect_state_after: &'static str,
    pub target_lifecycle_before: EntityLifecycle,
    pub target_lifecycle_after: EntityLifecycle,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TargetEffectFrameState {
    pub commit_id: String,
    pub state: &'static str,
}

pub struct TargetEffectInput<'a> {
    pub authority: &'a TargetEffectAuthority,
    pub weapon: &'a EntityDefinition,
    pub target: &'a EntityDefinition,
    pub target_lifecycle: EntityLifecycle,
    pub target_mass_kg: f64,
    pub target_speed_mps: f64,
    pub target_altitude_msl_m: f64,
    pub termination_tick: u64,
    pub termination_local_key: String,
    pub termination_cause: &'static str,
    pub closest_approach_m: f64,
    pub model_time_seconds: f64,
}

fn invalid(message: impl Into<String>) -> EngineError {
    EngineError::InvalidScenario(format!(
        "target-effect authority is invalid: {}",
        message.into()
    ))
}

fn stable_identifier(value: &str) -> bool {
    let bytes = value.as_bytes();
    !bytes.is_empty()
        && bytes.len() <= 128
        && (bytes[0].is_ascii_lowercase() || bytes[0].is_ascii_digit())
        && bytes.iter().all(|byte| {
            byte.is_ascii_lowercase()
                || byte.is_ascii_digit()
                || matches!(*byte, b'.' | b'_' | b'-')
        })
}

fn semantic_version(value: &str) -> bool {
    let (core, prerelease) = value
        .split_once('-')
        .map_or((value, None), |(core, suffix)| (core, Some(suffix)));
    let segments = core.split('.').collect::<Vec<_>>();
    let core_valid = segments.len() == 3
        && segments.iter().all(|segment| {
            !segment.is_empty()
                && segment.bytes().all(|byte| byte.is_ascii_digit())
                && (segment == &"0" || !segment.starts_with('0'))
        });
    core_valid
        && prerelease.is_none_or(|suffix| {
            !suffix.is_empty()
                && suffix
                    .bytes()
                    .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'-'))
        })
}

fn sha256_digest(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

fn finite_non_negative(value: f64) -> bool {
    value.is_finite() && value >= 0.0
}

fn canonicalize(value: Value) -> Value {
    match value {
        Value::Array(values) => Value::Array(values.into_iter().map(canonicalize).collect()),
        Value::Object(values) => {
            let mut entries = values.into_iter().collect::<Vec<_>>();
            entries.sort_by(|left, right| left.0.cmp(&right.0));
            let mut sorted = serde_json::Map::new();
            for (key, value) in entries {
                sorted.insert(key, canonicalize(value));
            }
            Value::Object(sorted)
        }
        Value::Number(number) => {
            let value = number.as_f64().unwrap_or(f64::NAN);
            if value == 0.0 {
                Value::Number(0.into())
            } else if value.is_finite()
                && value.fract() == 0.0
                && value >= i64::MIN as f64
                && value <= i64::MAX as f64
            {
                Value::Number((value as i64).into())
            } else {
                Value::Number(number)
            }
        }
        scalar => scalar,
    }
}

fn canonical_digest(value: Value) -> Result<String, EngineError> {
    let bytes = serde_json::to_vec(&canonicalize(value))
        .map_err(|error| EngineError::Serialization(error.to_string()))?;
    Ok(format!("{:x}", Sha256::digest(bytes)))
}

fn digest_without_digest(value: &Value) -> Result<String, EngineError> {
    let mut material = value.clone();
    material
        .as_object_mut()
        .ok_or_else(|| invalid("content-addressed value must be an object"))?
        .remove("digest");
    canonical_digest(material)
}

const AUTHORITY_KEYS: &[&str] = &[
    "schemaVersion",
    "id",
    "version",
    "digest",
    "intendedUse",
    "models",
    "bindings",
];
const MODEL_KEYS: &[&str] = &[
    "schemaVersion",
    "id",
    "version",
    "digest",
    "intendedUse",
    "evaluator",
    "sampling",
    "valueState",
    "evidenceRefIds",
    "limitationIds",
    "fuze",
    "warhead",
    "targetProfile",
    "thresholds",
];
const BINDING_KEYS: &[&str] = &[
    "id",
    "effectModelId",
    "effectModelVersion",
    "effectModelDigest",
    "weaponModelId",
    "weaponModelVersion",
    "weaponModelPackDigest",
    "targetModelId",
    "targetModelVersion",
    "targetModelPackDigest",
    "targetProfileId",
    "targetProfileVersion",
];

fn exact_object<'a>(
    value: &'a Value,
    keys: &[&str],
) -> Result<&'a Map<String, Value>, EngineError> {
    let object = value
        .as_object()
        .ok_or_else(|| invalid("expected object"))?;
    if object.len() != keys.len() || keys.iter().any(|key| !object.contains_key(*key)) {
        return Err(invalid("object fields are missing or unsupported"));
    }
    Ok(object)
}

fn string<'a>(object: &'a Map<String, Value>, key: &str) -> Result<&'a str, EngineError> {
    object
        .get(key)
        .and_then(Value::as_str)
        .ok_or_else(|| invalid("expected string"))
}

fn number(object: &Map<String, Value>, key: &str) -> Result<f64, EngineError> {
    object
        .get(key)
        .and_then(Value::as_f64)
        .filter(|value| value.is_finite())
        .ok_or_else(|| invalid("expected finite number"))
}

fn object<'a>(
    parent: &'a Map<String, Value>,
    key: &str,
    keys: &[&str],
) -> Result<&'a Map<String, Value>, EngineError> {
    exact_object(
        parent.get(key).ok_or_else(|| invalid("missing object"))?,
        keys,
    )
}

fn array<'a>(parent: &'a Map<String, Value>, key: &str) -> Result<&'a [Value], EngineError> {
    parent
        .get(key)
        .and_then(Value::as_array)
        .map(Vec::as_slice)
        .ok_or_else(|| invalid("expected array"))
}

fn valid_identity_array(values: &[Value]) -> Result<(), EngineError> {
    if values.is_empty() {
        return Err(invalid("identifier array is empty"));
    }
    for (index, value) in values.iter().enumerate() {
        let value = value
            .as_str()
            .filter(|value| stable_identifier(value))
            .ok_or_else(|| invalid("identifier array is malformed"))?;
        if values[..index]
            .iter()
            .any(|prior| prior.as_str() == Some(value))
        {
            return Err(invalid("identifier array is duplicated"));
        }
    }
    Ok(())
}

fn intended_use(parent: &Map<String, Value>) -> Result<(&str, &str), EngineError> {
    let intended = object(parent, "intendedUse", &["id", "version"])?;
    let id = string(intended, "id")?;
    let version = string(intended, "version")?;
    if id != TARGET_EFFECT_INTENDED_USE_ID || !semantic_version(version) {
        return Err(invalid("intended use is unsupported"));
    }
    Ok((id, version))
}

fn validate_model(model: &Value) -> Result<(), EngineError> {
    let model_object = exact_object(model, MODEL_KEYS)?;
    let fuze = object(
        model_object,
        "fuze",
        &["mode", "activationMaximumDistanceM", "evidenceRefIds"],
    )?;
    let warhead = object(model_object, "warhead", &["model", "evidenceRefIds"])?;
    let profile = object(
        model_object,
        "targetProfile",
        &[
            "id",
            "version",
            "targetKind",
            "evidenceRefIds",
            "minimumMassKg",
            "maximumMassKg",
            "minimumSpeedMps",
            "maximumSpeedMps",
            "minimumAltitudeMslM",
            "maximumAltitudeMslM",
        ],
    )?;
    let thresholds = object(
        model_object,
        "thresholds",
        &[
            "killMaximumDistanceM",
            "missionKillMaximumDistanceM",
            "degradedMaximumDistanceM",
        ],
    )?;
    let evidence = array(model_object, "evidenceRefIds")?;
    let limitations = array(model_object, "limitationIds")?;
    let fuze_evidence = array(fuze, "evidenceRefIds")?;
    let warhead_evidence = array(warhead, "evidenceRefIds")?;
    let profile_evidence = array(profile, "evidenceRefIds")?;
    for values in [
        evidence,
        limitations,
        fuze_evidence,
        warhead_evidence,
        profile_evidence,
    ] {
        valid_identity_array(values)?;
    }
    let activation = number(fuze, "activationMaximumDistanceM")?;
    let minimum_mass = number(profile, "minimumMassKg")?;
    let maximum_mass = number(profile, "maximumMassKg")?;
    let minimum_speed = number(profile, "minimumSpeedMps")?;
    let maximum_speed = number(profile, "maximumSpeedMps")?;
    let minimum_altitude = number(profile, "minimumAltitudeMslM")?;
    let maximum_altitude = number(profile, "maximumAltitudeMslM")?;
    let kill = number(thresholds, "killMaximumDistanceM")?;
    let mission_kill = number(thresholds, "missionKillMaximumDistanceM")?;
    let degraded = number(thresholds, "degradedMaximumDistanceM")?;
    let digest = string(model_object, "digest")?;
    if string(model_object, "schemaVersion")? != TARGET_EFFECT_MODEL_SCHEMA
        || !stable_identifier(string(model_object, "id")?)
        || !semantic_version(string(model_object, "version")?)
        || !sha256_digest(digest)
        || string(model_object, "evaluator")? != "DETERMINISTIC_RADIAL_THRESHOLD_BANDS"
        || string(model_object, "sampling")? != "NONE"
        || string(model_object, "valueState")? != "MODEL_ASSUMPTION"
        || string(fuze, "mode")? != "GENERIC_PROXIMITY"
        || string(warhead, "model")? != "GENERIC_RADIAL_DISTANCE_EFFECT"
        || !stable_identifier(string(profile, "id")?)
        || !semantic_version(string(profile, "version")?)
        || string(profile, "targetKind")? != "AIRCRAFT"
        || !finite_non_negative(activation)
        || minimum_mass <= 0.0
        || maximum_mass < minimum_mass
        || !finite_non_negative(minimum_speed)
        || maximum_speed < minimum_speed
        || maximum_altitude < minimum_altitude
        || !finite_non_negative(kill)
        || !(kill < mission_kill && mission_kill < degraded && degraded <= activation)
    {
        return Err(invalid("model content is unsupported"));
    }
    intended_use(model_object)?;
    for reference in fuze_evidence
        .iter()
        .chain(warhead_evidence)
        .chain(profile_evidence)
    {
        if !evidence.iter().any(|admitted| admitted == reference) {
            return Err(invalid("model evidence is outside authority"));
        }
    }
    if digest_without_digest(model)? != digest {
        return Err(invalid("model digest does not match canonical content"));
    }
    Ok(())
}

fn same_binding_pair(
    left: &Map<String, Value>,
    right: &Map<String, Value>,
) -> Result<bool, EngineError> {
    for key in [
        "weaponModelPackDigest",
        "weaponModelId",
        "weaponModelVersion",
        "targetModelPackDigest",
        "targetModelId",
        "targetModelVersion",
    ] {
        if string(left, key)? != string(right, key)? {
            return Ok(false);
        }
    }
    Ok(true)
}

pub fn authority_identity(authority: &TargetEffectAuthority) -> Result<(&str, &str), EngineError> {
    let authority = exact_object(authority, AUTHORITY_KEYS)?;
    Ok((string(authority, "id")?, string(authority, "version")?))
}

pub fn validate_target_effect_authority(
    authority: &TargetEffectAuthority,
) -> Result<(), EngineError> {
    let authority_object = exact_object(authority, AUTHORITY_KEYS)?;
    let authority_id = string(authority_object, "id")?;
    let authority_version = string(authority_object, "version")?;
    let authority_digest = string(authority_object, "digest")?;
    let authority_use = intended_use(authority_object)?;
    let models = array(authority_object, "models")?;
    let bindings = array(authority_object, "bindings")?;
    if string(authority_object, "schemaVersion")? != TARGET_EFFECT_AUTHORITY_SCHEMA
        || !stable_identifier(authority_id)
        || !semantic_version(authority_version)
        || !sha256_digest(authority_digest)
        || models.is_empty()
        || bindings.is_empty()
    {
        return Err(invalid("authority content is unsupported"));
    }
    for (index, model) in models.iter().enumerate() {
        validate_model(model)?;
        let model_object = exact_object(model, MODEL_KEYS)?;
        if intended_use(model_object)? != authority_use {
            return Err(invalid("model intended use differs"));
        }
        for prior in &models[..index] {
            let prior = exact_object(prior, MODEL_KEYS)?;
            if string(prior, "id")? == string(model_object, "id")?
                && string(prior, "version")? == string(model_object, "version")?
                && string(prior, "digest")? == string(model_object, "digest")?
            {
                return Err(invalid("model identity is duplicated"));
            }
        }
    }
    for (index, binding) in bindings.iter().enumerate() {
        let binding = exact_object(binding, BINDING_KEYS)?;
        for key in [
            "id",
            "effectModelId",
            "weaponModelId",
            "targetModelId",
            "targetProfileId",
        ] {
            if !stable_identifier(string(binding, key)?) {
                return Err(invalid("binding identity is malformed"));
            }
        }
        for key in [
            "effectModelVersion",
            "weaponModelVersion",
            "targetModelVersion",
            "targetProfileVersion",
        ] {
            if !semantic_version(string(binding, key)?) {
                return Err(invalid("binding version is malformed"));
            }
        }
        for key in [
            "effectModelDigest",
            "weaponModelPackDigest",
            "targetModelPackDigest",
        ] {
            if !sha256_digest(string(binding, key)?) {
                return Err(invalid("binding digest is malformed"));
            }
        }
        for prior in &bindings[..index] {
            let prior = exact_object(prior, BINDING_KEYS)?;
            if string(prior, "id")? == string(binding, "id")? || same_binding_pair(prior, binding)?
            {
                return Err(invalid("binding is duplicated or conflicting"));
            }
        }
        let model = models
            .iter()
            .find(|model| {
                let Some(model) = model.as_object() else {
                    return false;
                };
                model.get("id") == binding.get("effectModelId")
                    && model.get("version") == binding.get("effectModelVersion")
                    && model.get("digest") == binding.get("effectModelDigest")
            })
            .ok_or_else(|| invalid("binding model is unresolved"))?;
        let profile = object(
            exact_object(model, MODEL_KEYS)?,
            "targetProfile",
            &[
                "id",
                "version",
                "targetKind",
                "evidenceRefIds",
                "minimumMassKg",
                "maximumMassKg",
                "minimumSpeedMps",
                "maximumSpeedMps",
                "minimumAltitudeMslM",
                "maximumAltitudeMslM",
            ],
        )?;
        if profile.get("id") != binding.get("targetProfileId")
            || profile.get("version") != binding.get("targetProfileVersion")
        {
            return Err(invalid("binding target profile is unresolved"));
        }
    }
    if digest_without_digest(authority)? != authority_digest {
        return Err(invalid("authority digest does not match canonical content"));
    }
    Ok(())
}

struct ResolvedModel<'a> {
    id: &'a str,
    version: &'a str,
    digest: &'a str,
    intended_use_id: &'a str,
    intended_use_version: &'a str,
    target_profile_id: &'a str,
    target_profile_version: &'a str,
    minimum_mass: f64,
    maximum_mass: f64,
    minimum_speed: f64,
    maximum_speed: f64,
    minimum_altitude: f64,
    maximum_altitude: f64,
    kill: f64,
    mission_kill: f64,
    degraded: f64,
}

fn resolved_model<'a>(
    input: &'a TargetEffectInput<'_>,
) -> Result<Option<ResolvedModel<'a>>, EngineError> {
    if input.weapon.kind != EntityKind::GuidedWeapon
        || input.target.kind != EntityKind::Aircraft
        || input
            .weapon
            .weapon
            .as_ref()
            .is_none_or(|weapon| weapon.target_entity_id != input.target.id)
    {
        return Ok(None);
    }
    let authority = exact_object(input.authority, AUTHORITY_KEYS)?;
    let binding = array(authority, "bindings")?.iter().find(|binding| {
        let Some(binding) = binding.as_object() else {
            return false;
        };
        binding.get("weaponModelPackDigest").and_then(Value::as_str)
            == Some(&input.weapon.provenance.model_pack_digest)
            && binding.get("weaponModelId").and_then(Value::as_str)
                == Some(&input.weapon.provenance.model_id)
            && binding.get("weaponModelVersion").and_then(Value::as_str)
                == Some(&input.weapon.provenance.model_version)
            && binding.get("targetModelPackDigest").and_then(Value::as_str)
                == Some(&input.target.provenance.model_pack_digest)
            && binding.get("targetModelId").and_then(Value::as_str)
                == Some(&input.target.provenance.model_id)
            && binding.get("targetModelVersion").and_then(Value::as_str)
                == Some(&input.target.provenance.model_version)
    });
    let Some(binding) = binding else {
        return Ok(None);
    };
    let binding = exact_object(binding, BINDING_KEYS)?;
    let model = array(authority, "models")?
        .iter()
        .find(|model| {
            let Some(model) = model.as_object() else {
                return false;
            };
            model.get("id") == binding.get("effectModelId")
                && model.get("version") == binding.get("effectModelVersion")
                && model.get("digest") == binding.get("effectModelDigest")
        })
        .ok_or_else(|| invalid("resolved model disappeared"))?;
    let model = exact_object(model, MODEL_KEYS)?;
    let use_identity = intended_use(model)?;
    let profile = object(
        model,
        "targetProfile",
        &[
            "id",
            "version",
            "targetKind",
            "evidenceRefIds",
            "minimumMassKg",
            "maximumMassKg",
            "minimumSpeedMps",
            "maximumSpeedMps",
            "minimumAltitudeMslM",
            "maximumAltitudeMslM",
        ],
    )?;
    let thresholds = object(
        model,
        "thresholds",
        &[
            "killMaximumDistanceM",
            "missionKillMaximumDistanceM",
            "degradedMaximumDistanceM",
        ],
    )?;
    Ok(Some(ResolvedModel {
        id: string(model, "id")?,
        version: string(model, "version")?,
        digest: string(model, "digest")?,
        intended_use_id: use_identity.0,
        intended_use_version: use_identity.1,
        target_profile_id: string(profile, "id")?,
        target_profile_version: string(profile, "version")?,
        minimum_mass: number(profile, "minimumMassKg")?,
        maximum_mass: number(profile, "maximumMassKg")?,
        minimum_speed: number(profile, "minimumSpeedMps")?,
        maximum_speed: number(profile, "maximumSpeedMps")?,
        minimum_altitude: number(profile, "minimumAltitudeMslM")?,
        maximum_altitude: number(profile, "maximumAltitudeMslM")?,
        kill: number(thresholds, "killMaximumDistanceM")?,
        mission_kill: number(thresholds, "missionKillMaximumDistanceM")?,
        degraded: number(thresholds, "degradedMaximumDistanceM")?,
    }))
}

fn target_inside_domain(model: &ResolvedModel<'_>, input: &TargetEffectInput<'_>) -> bool {
    input.target_mass_kg >= model.minimum_mass
        && input.target_mass_kg <= model.maximum_mass
        && input.target_speed_mps >= model.minimum_speed
        && input.target_speed_mps <= model.maximum_speed
        && input.target_altitude_msl_m >= model.minimum_altitude
        && input.target_altitude_msl_m <= model.maximum_altitude
}

fn canonical_effect_number(value: f64) -> f64 {
    // Match ECMAScript Number#toFixed(6) over the exact IEEE-754 binary64
    // value: choose the nearest integer multiple of 10^-6, take an exact
    // halfway case away from zero, then normalize either signed zero to +0.
    // Multiplying in f64 before rounding is not equivalent because that first
    // operation can manufacture a tie (for example 0.0000005 * 1e6 == 0.5).
    let magnitude = value.abs();
    if magnitude >= 1e21 {
        return value;
    }
    let bits = magnitude.to_bits();
    let exponent_bits = ((bits >> 52) & 0x7ff) as i32;
    let fraction_bits = bits & ((1_u64 << 52) - 1);
    let (significand, binary_exponent) = if exponent_bits == 0 {
        (fraction_bits, -1074)
    } else {
        ((1_u64 << 52) | fraction_bits, exponent_bits - 1023 - 52)
    };
    let rounded = if binary_exponent >= 0 {
        magnitude
    } else {
        const DECIMAL_SCALE: u128 = 1_000_000;
        let scaled_significand = u128::from(significand) * DECIMAL_SCALE;
        let shift = (-binary_exponent) as u32;
        let rounded_scaled = if shift >= 128 {
            0
        } else {
            let integer = scaled_significand >> shift;
            let remainder_mask = (1_u128 << shift) - 1;
            let remainder = scaled_significand & remainder_mask;
            let half = 1_u128 << (shift - 1);
            integer + u128::from(remainder >= half)
        };
        rounded_scaled as f64 / DECIMAL_SCALE as f64
    };
    let rounded = if value.is_sign_negative() {
        -rounded
    } else {
        rounded
    };
    if rounded == 0.0 {
        0.0
    } else {
        rounded
    }
}

pub fn evaluate_target_effect(
    input: TargetEffectInput<'_>,
) -> Result<TargetEffectEvaluation, EngineError> {
    validate_target_effect_authority(input.authority)?;
    if !input.closest_approach_m.is_finite()
        || input.closest_approach_m < 0.0
        || !input.target_mass_kg.is_finite()
        || input.target_mass_kg < 0.0
        || !input.target_speed_mps.is_finite()
        || input.target_speed_mps < 0.0
        || !input.target_altitude_msl_m.is_finite()
        || !input.model_time_seconds.is_finite()
        || input.model_time_seconds < 0.0
        || input.termination_local_key.is_empty()
        || input.termination_local_key.len() > 512
        || input.termination_local_key.chars().any(char::is_control)
    {
        return Err(invalid("evaluation input is outside its finite domain"));
    }
    let input = TargetEffectInput {
        closest_approach_m: canonical_effect_number(input.closest_approach_m),
        target_mass_kg: canonical_effect_number(input.target_mass_kg),
        target_speed_mps: canonical_effect_number(input.target_speed_mps),
        target_altitude_msl_m: canonical_effect_number(input.target_altitude_msl_m),
        model_time_seconds: canonical_effect_number(input.model_time_seconds),
        ..input
    };
    let model = resolved_model(&input)?;
    let (result, reason, selected_threshold_upper_bound_m) = if model.is_none() {
        (
            TargetEffectResult::EffectUnavailable,
            TargetEffectReason::AuthorityUnavailable,
            None,
        )
    } else if input.termination_cause != "GEOMETRIC_INTERCEPT" {
        (
            TargetEffectResult::NoEffect,
            TargetEffectReason::TerminationNotEffectEligible,
            None,
        )
    } else if input.target_lifecycle == EntityLifecycle::Terminated {
        (
            TargetEffectResult::EffectUnavailable,
            TargetEffectReason::TargetUnavailable,
            None,
        )
    } else if model
        .as_ref()
        .is_some_and(|model| !target_inside_domain(model, &input))
    {
        (
            TargetEffectResult::EffectUnavailable,
            TargetEffectReason::OutsideTargetDomain,
            None,
        )
    } else {
        let model = model
            .as_ref()
            .ok_or_else(|| invalid("resolved model disappeared"))?;
        if input.closest_approach_m <= model.kill {
            (
                TargetEffectResult::Kill,
                TargetEffectReason::ThresholdBand,
                Some(model.kill),
            )
        } else if input.closest_approach_m <= model.mission_kill {
            (
                TargetEffectResult::MissionKill,
                TargetEffectReason::ThresholdBand,
                Some(model.mission_kill),
            )
        } else if input.closest_approach_m <= model.degraded {
            (
                TargetEffectResult::Degraded,
                TargetEffectReason::ThresholdBand,
                Some(model.degraded),
            )
        } else {
            (
                TargetEffectResult::NoEffect,
                TargetEffectReason::AboveEffectBands,
                None,
            )
        }
    };
    let target_lifecycle_after = if matches!(
        result,
        TargetEffectResult::Kill | TargetEffectResult::MissionKill
    ) {
        EntityLifecycle::Terminated
    } else {
        input.target_lifecycle
    };
    let mut evaluation = TargetEffectEvaluation {
        schema_version: TARGET_EFFECT_COMMIT_SCHEMA,
        commit_id: String::new(),
        model_pack_digest: string(exact_object(input.authority, AUTHORITY_KEYS)?, "digest")?
            .to_string(),
        model_id: model.as_ref().map(|value| value.id.to_string()),
        model_version: model.as_ref().map(|value| value.version.to_string()),
        model_digest: model.as_ref().map(|value| value.digest.to_string()),
        intended_use_id: model
            .as_ref()
            .map(|value| value.intended_use_id.to_string()),
        intended_use_version: model
            .as_ref()
            .map(|value| value.intended_use_version.to_string()),
        target_profile_id: model
            .as_ref()
            .map(|value| value.target_profile_id.to_string()),
        target_profile_version: model
            .as_ref()
            .map(|value| value.target_profile_version.to_string()),
        weapon_id: input.weapon.id.clone(),
        target_id: input.target.id.clone(),
        termination_receipt: TargetEffectTerminationReceipt {
            tick: input.termination_tick,
            local_key: input.termination_local_key.clone(),
            cause: input.termination_cause.to_string(),
            model_time_seconds: input.model_time_seconds,
        },
        value_state: if model.is_some() {
            "MODEL_ASSUMPTION"
        } else {
            "UNAVAILABLE"
        },
        result: result.name(),
        reason: reason.name(),
        closest_approach_m: input.closest_approach_m,
        target_mass_kg: input.target_mass_kg,
        target_speed_mps: input.target_speed_mps,
        target_altitude_msl_m: input.target_altitude_msl_m,
        selected_threshold_upper_bound_m,
        target_effect_state_before: "UNRESOLVED",
        target_effect_state_after: result.name(),
        target_lifecycle_before: input.target_lifecycle,
        target_lifecycle_after,
    };
    evaluation.commit_id = canonical_digest(
        serde_json::to_value(&evaluation)
            .map_err(|error| EngineError::Serialization(error.to_string()))?,
    )?;
    Ok(evaluation)
}

#[cfg(test)]
mod tests {
    use serde::Deserialize;

    use super::canonical_effect_number;

    #[derive(Deserialize)]
    struct CanonicalNumberFixture {
        id: String,
        input: f64,
        expected: f64,
    }

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct CanonicalNumberFixtures {
        schema_version: String,
        decimal_places: u8,
        rounding: String,
        zero: String,
        cases: Vec<CanonicalNumberFixture>,
    }

    #[test]
    fn canonical_numbers_match_the_shared_signed_half_boundary_oracle() -> serde_json::Result<()> {
        let fixtures: CanonicalNumberFixtures = serde_json::from_str(include_str!(
            "../../fixtures/target-effect-canonical-six-decimal.v1.json"
        ))?;
        assert_eq!(
            fixtures.schema_version,
            "vector.target-effect-canonical-number-fixture.v1"
        );
        assert_eq!(fixtures.decimal_places, 6);
        assert_eq!(
            fixtures.rounding,
            "NEAREST_EXACT_BINARY64_TIES_AWAY_FROM_ZERO"
        );
        assert_eq!(fixtures.zero, "NORMALIZE_POSITIVE");
        for fixture in fixtures.cases {
            let actual = canonical_effect_number(fixture.input);
            assert_eq!(
                actual.to_bits(),
                fixture.expected.to_bits(),
                "{}",
                fixture.id
            );
        }
        Ok(())
    }
}
