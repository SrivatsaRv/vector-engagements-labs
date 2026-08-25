use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::generated_schema::{AxisSpec, TableSpec, AXES, TABLES};
use crate::EvaluatorError;

const EVALUATOR_CONTRACT: &str = "TP1538_APPENDIX_B_MULTILINEAR_FAIL_CLOSED_V1";

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ResolverCell {
    state: String,
    value: Option<f64>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ResolverTable {
    id: String,
    cells: Vec<ResolverCell>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LookupRequest {
    schema_version: String,
    table_id: String,
    angle_unit: String,
    coordinates: BTreeMap<String, Value>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AssemblyInput {
    schema_version: String,
    angle_unit: String,
    alpha_deg: f64,
    beta_deg: f64,
    stabilator_deg: f64,
    leading_edge_flap_deg: f64,
    speed_brake_deg: f64,
    aileron_deg: f64,
    rudder_deg: f64,
    roll_rate_rad_s: f64,
    pitch_rate_rad_s: f64,
    yaw_rate_rad_s: f64,
    true_airspeed_mps: f64,
    cg_chord_fraction: f64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EvaluatorBatch {
    schema_version: String,
    subject: String,
    deployment_class: String,
    evaluator_contract: String,
    corpus_sha256: String,
    resolver_tables: Vec<ResolverTable>,
    lookup_requests: Vec<LookupRequest>,
    assembly_requests: Vec<AssemblyInput>,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LookupResult {
    schema_version: &'static str,
    corpus_sha256: String,
    table_id: String,
    state: String,
    diagnostic: String,
    value: Option<f64>,
    missing_corners: Vec<BTreeMap<String, f64>>,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
pub struct Coefficients {
    cx: f64,
    cz: f64,
    cm: f64,
    cy: f64,
    cn: f64,
    cl: f64,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AssemblyResult {
    schema_version: &'static str,
    corpus_sha256: String,
    state: &'static str,
    coefficients: Coefficients,
    contribution_order: BTreeMap<String, Vec<&'static str>>,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct EvaluatorBatchResult {
    schema_version: &'static str,
    backend: &'static str,
    subject: &'static str,
    deployment_class: &'static str,
    evaluator_contract: &'static str,
    corpus_sha256: String,
    lookup_results: Vec<LookupResult>,
    assembly_results: Vec<AssemblyResult>,
}

#[derive(Clone, Copy)]
struct Bracket {
    lower: usize,
    upper: usize,
    fraction: f64,
}

fn invalid(message: impl Into<String>) -> EvaluatorError {
    EvaluatorError::InvalidInput(message.into())
}

fn axis(name: &str) -> Result<&'static AxisSpec, EvaluatorError> {
    AXES.iter()
        .find(|candidate| candidate.name == name)
        .ok_or_else(|| invalid(format!("unknown generated axis {name}")))
}

fn table_spec(id: &str) -> Result<&'static TableSpec, EvaluatorError> {
    TABLES
        .iter()
        .find(|candidate| candidate.id == id)
        .ok_or_else(|| invalid("lookup table identity is unknown"))
}

fn bracket(values: &[f64], value: f64) -> Option<Bracket> {
    if !value.is_finite() || value < values[0] || value > values[values.len() - 1] {
        return None;
    }
    if let Some(index) = values.iter().position(|candidate| *candidate == value) {
        return Some(Bracket {
            lower: index,
            upper: index,
            fraction: 0.0,
        });
    }
    for upper in 1..values.len() {
        if value < values[upper] {
            let lower = upper - 1;
            return Some(Bracket {
                lower,
                upper,
                fraction: (value - values[lower]) / (values[upper] - values[lower]),
            });
        }
    }
    None
}

fn coordinate_name(axis_name: &str) -> &'static str {
    match axis_name {
        "alphaDeg" => "alphaDeg",
        "betaDeg" => "betaDeg",
        _ => "stabilatorDeg",
    }
}

fn coordinate_number(
    coordinates: &BTreeMap<String, Value>,
    name: &str,
) -> Result<f64, EvaluatorError> {
    coordinates
        .get(name)
        .and_then(Value::as_f64)
        .filter(|value| value.is_finite())
        .ok_or_else(|| invalid(format!("coordinate {name} must be finite")))
}

fn validate_resolver(batch: &EvaluatorBatch) -> Result<(), EvaluatorError> {
    if batch.schema_version != "vector.tp1538-aero-evaluator-batch.v1"
        || batch.subject != "NASA_GENERIC_F16"
        || batch.deployment_class != "ENGINE_VERIFICATION_ONLY"
        || batch.evaluator_contract != EVALUATOR_CONTRACT
        || batch.corpus_sha256.len() != 64
        || !batch
            .corpus_sha256
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
    {
        return Err(invalid("batch identity is invalid"));
    }
    let operations = batch
        .lookup_requests
        .len()
        .checked_add(batch.assembly_requests.len())
        .ok_or_else(|| invalid("operation count overflow"))?;
    if operations == 0 || operations > 4096 {
        return Err(invalid("batch requires 1 through 4096 operations"));
    }
    if batch.resolver_tables.len() != TABLES.len() {
        return Err(invalid("resolver table inventory is incomplete"));
    }
    for (table_index, spec) in TABLES.iter().enumerate() {
        let table = &batch.resolver_tables[table_index];
        if table.id != spec.id || table.cells.len() != spec.cell_count {
            return Err(invalid(format!(
                "resolver table {} is missing, reordered, or partial",
                spec.id
            )));
        }
        let alpha_axis = spec.axes.iter().position(|name| *name == "alphaDeg");
        let trailing = match alpha_axis {
            Some(position) => spec.axes[position + 1..]
                .iter()
                .try_fold(1usize, |product, name| {
                    product.checked_mul(axis(name).map(|item| item.values.len()).unwrap_or(0))
                })
                .ok_or_else(|| invalid("axis cardinality overflow"))?,
            None => 1,
        };
        for (cell_index, cell) in table.cells.iter().enumerate() {
            if !["AVAILABLE", "PRINTED_BLANK", "ILLEGIBLE", "OUT_OF_DOMAIN"]
                .contains(&cell.state.as_str())
            {
                return Err(invalid(format!("{} has an invalid cell state", spec.id)));
            }
            if cell.state == "AVAILABLE" {
                if !cell.value.is_some_and(f64::is_finite) {
                    return Err(invalid(format!(
                        "{} available cell omits a finite value",
                        spec.id
                    )));
                }
            } else if cell.value.is_some() {
                return Err(invalid(format!(
                    "{} unavailable cell contains a value",
                    spec.id
                )));
            }
            if let Some(position) = alpha_axis {
                let preceding = spec.axes[..position]
                    .iter()
                    .try_fold(1usize, |product, name| {
                        product.checked_mul(axis(name).map(|item| item.values.len()).unwrap_or(0))
                    })
                    .ok_or_else(|| invalid("axis cardinality overflow"))?;
                let alpha_len = axis("alphaDeg")?.values.len();
                let alpha_index = (cell_index / trailing) % alpha_len;
                let outside = axis("alphaDeg")?.values[alpha_index] > spec.alpha_max_deg;
                if preceding > 0 && outside != (cell.state == "OUT_OF_DOMAIN") {
                    return Err(invalid(format!(
                        "{} violates its published alpha domain",
                        spec.id
                    )));
                }
            }
        }
    }
    Ok(())
}

fn lookup(batch: &EvaluatorBatch, request: &LookupRequest) -> Result<LookupResult, EvaluatorError> {
    if request.schema_version != "vector.tp1538-aero-lookup.v1" || request.angle_unit != "DEG" {
        return Err(invalid("lookup identity or unit is invalid"));
    }
    let spec = table_spec(&request.table_id)?;
    let table_index = TABLES
        .iter()
        .position(|candidate| candidate.id == spec.id)
        .ok_or_else(|| invalid("generated table is absent"))?;
    let table = &batch.resolver_tables[table_index];
    let expected_keys = spec
        .axes
        .iter()
        .map(|name| coordinate_name(name))
        .collect::<Vec<_>>();
    if request.coordinates.len() != expected_keys.len()
        || expected_keys
            .iter()
            .any(|key| !request.coordinates.contains_key(*key))
    {
        return Err(invalid("lookup coordinates do not have exact table keys"));
    }
    let brackets = spec
        .axes
        .iter()
        .map(|axis_name| {
            let values = axis(axis_name)?.values;
            let value = coordinate_number(&request.coordinates, coordinate_name(axis_name))?;
            Ok(bracket(values, value))
        })
        .collect::<Result<Vec<_>, EvaluatorError>>()?;
    let base = |state: &str, diagnostic: &str, value, missing_corners| LookupResult {
        schema_version: "vector.tp1538-aero-lookup-result.v1",
        corpus_sha256: batch.corpus_sha256.clone(),
        table_id: spec.id.to_owned(),
        state: state.to_owned(),
        diagnostic: diagnostic.to_owned(),
        value,
        missing_corners,
    };
    if brackets.iter().any(Option::is_none) {
        return Ok(base("OUT_OF_DOMAIN", "OUT_OF_DOMAIN", None, Vec::new()));
    }
    let brackets = brackets.into_iter().flatten().collect::<Vec<_>>();
    let lengths = spec
        .axes
        .iter()
        .map(|name| axis(name).map(|item| item.values.len()))
        .collect::<Result<Vec<_>, _>>()?;
    let mut corners = vec![(Vec::<usize>::new(), 1.0, BTreeMap::<String, f64>::new())];
    for (depth, descriptor) in brackets.iter().enumerate() {
        let axis_name = spec.axes[depth];
        let name = coordinate_name(axis_name).to_owned();
        let values = axis(axis_name)?.values;
        let mut next = Vec::new();
        for (indexes, weight, coordinate) in corners {
            let mut lower_indexes = indexes.clone();
            lower_indexes.push(descriptor.lower);
            let mut lower_coordinate = coordinate.clone();
            lower_coordinate.insert(name.clone(), values[descriptor.lower]);
            next.push((
                lower_indexes,
                weight
                    * if descriptor.lower == descriptor.upper {
                        1.0
                    } else {
                        1.0 - descriptor.fraction
                    },
                lower_coordinate,
            ));
            if descriptor.upper != descriptor.lower {
                let mut upper_indexes = indexes.clone();
                upper_indexes.push(descriptor.upper);
                let mut upper_coordinate = coordinate.clone();
                upper_coordinate.insert(name.clone(), values[descriptor.upper]);
                next.push((
                    upper_indexes,
                    weight * descriptor.fraction,
                    upper_coordinate,
                ));
            }
        }
        corners = next;
    }
    let flat_index = |indexes: &[usize]| {
        indexes
            .iter()
            .zip(&lengths)
            .fold(0usize, |current, (index, length)| current * length + index)
    };
    let missing = corners
        .iter()
        .filter(|(indexes, _, _)| table.cells[flat_index(indexes)].state != "AVAILABLE")
        .collect::<Vec<_>>();
    if let Some((indexes, _, _)) = missing.first() {
        let state = table.cells[flat_index(indexes)].state.as_str();
        return Ok(base(
            state,
            "UNAVAILABLE_INTERPOLATION_CORNER",
            None,
            missing
                .iter()
                .map(|(_, _, coordinate)| coordinate.clone())
                .collect(),
        ));
    }
    let value = corners.iter().try_fold(0.0, |sum, (indexes, weight, _)| {
        table.cells[flat_index(indexes)]
            .value
            .map(|value| sum + value * weight)
            .ok_or_else(|| invalid("available interpolation corner omits value"))
    })?;
    if !value.is_finite() {
        return Err(invalid("interpolation produced a nonfinite value"));
    }
    let exact = brackets.iter().all(|item| item.lower == item.upper);
    Ok(base(
        "AVAILABLE",
        if exact { "EXACT_KNOT" } else { "INTERPOLATED" },
        Some(value),
        Vec::new(),
    ))
}

fn request(table_id: &str, coordinates: &[(&str, f64)]) -> LookupRequest {
    LookupRequest {
        schema_version: "vector.tp1538-aero-lookup.v1".to_owned(),
        table_id: table_id.to_owned(),
        angle_unit: "DEG".to_owned(),
        coordinates: coordinates
            .iter()
            .map(|(key, value)| ((*key).to_owned(), Value::from(*value)))
            .collect(),
    }
}

fn required(
    batch: &EvaluatorBatch,
    table_id: &str,
    coordinates: &[(&str, f64)],
) -> Result<f64, EvaluatorError> {
    let result = lookup(batch, &request(table_id, coordinates))?;
    if result.state != "AVAILABLE" {
        return Err(invalid(format!(
            "Appendix B assembly requires available {table_id}: {}",
            result.diagnostic
        )));
    }
    result
        .value
        .ok_or_else(|| invalid("available result omits value"))
}

fn assemble(
    batch: &EvaluatorBatch,
    input: &AssemblyInput,
) -> Result<AssemblyResult, EvaluatorError> {
    let values = [
        input.alpha_deg,
        input.beta_deg,
        input.stabilator_deg,
        input.leading_edge_flap_deg,
        input.speed_brake_deg,
        input.aileron_deg,
        input.rudder_deg,
        input.roll_rate_rad_s,
        input.pitch_rate_rad_s,
        input.yaw_rate_rad_s,
        input.true_airspeed_mps,
        input.cg_chord_fraction,
    ];
    if input.schema_version != "vector.tp1538-aero-assembly-input.v1"
        || input.angle_unit != "DEG"
        || !values.iter().all(|value| value.is_finite())
    {
        return Err(invalid(
            "Appendix B assembly identity, unit, or finite-value contract is invalid",
        ));
    }
    if input.true_airspeed_mps <= 0.0
        || !(-25.0..=25.0).contains(&input.stabilator_deg)
        || input.aileron_deg.abs() > 21.5
        || input.rudder_deg.abs() > 30.0
        || !(0.0..=25.0).contains(&input.leading_edge_flap_deg)
        || !(0.0..=60.0).contains(&input.speed_brake_deg)
        || !(0.0..=1.0).contains(&input.cg_chord_fraction)
    {
        return Err(invalid(
            "Appendix B assembly exceeds a closed control, speed, or CG bound",
        ));
    }
    let ab = [("alphaDeg", input.alpha_deg), ("betaDeg", input.beta_deg)];
    let abs = [
        ("alphaDeg", input.alpha_deg),
        ("betaDeg", input.beta_deg),
        ("stabilatorDeg", input.stabilator_deg),
    ];
    let ab0 = [
        ("alphaDeg", input.alpha_deg),
        ("betaDeg", input.beta_deg),
        ("stabilatorDeg", 0.0),
    ];
    let a = [("alphaDeg", input.alpha_deg)];
    let lef = 1.0 - input.leading_edge_flap_deg / 25.0;
    let sb = input.speed_brake_deg / 60.0;
    let da = input.aileron_deg / 20.0;
    let dr = input.rudder_deg / 30.0;
    let chord_rate = 3.45 / (2.0 * input.true_airspeed_mps);
    let span_rate = 9.144 / (2.0 * input.true_airspeed_mps);
    let cx_base = required(batch, "CX_BASE", &abs)?;
    let cx = cx_base
        + if lef == 0.0 {
            0.0
        } else {
            (required(batch, "CX_LEF", &ab)? - required(batch, "CX_BASE", &ab0)?) * lef
        }
        + if sb == 0.0 {
            0.0
        } else {
            required(batch, "CX_SPEEDBRAKE_INCREMENT", &a)? * sb
        }
        + if input.pitch_rate_rad_s == 0.0 {
            0.0
        } else {
            chord_rate
                * input.pitch_rate_rad_s
                * (required(batch, "CX_Q", &a)?
                    + if lef == 0.0 {
                        0.0
                    } else {
                        required(batch, "CX_Q_LEF_INCREMENT", &a)? * lef
                    })
        };
    let cz_base = required(batch, "CZ_BASE", &abs)?;
    let cz = cz_base
        + if lef == 0.0 {
            0.0
        } else {
            (required(batch, "CZ_LEF", &ab)? - required(batch, "CZ_BASE", &ab0)?) * lef
        }
        + if sb == 0.0 {
            0.0
        } else {
            required(batch, "CZ_SPEEDBRAKE_INCREMENT", &a)? * sb
        }
        + if input.pitch_rate_rad_s == 0.0 {
            0.0
        } else {
            chord_rate
                * input.pitch_rate_rad_s
                * (required(batch, "CZ_Q", &a)?
                    + if lef == 0.0 {
                        0.0
                    } else {
                        required(batch, "CZ_Q_LEF_INCREMENT", &a)? * lef
                    })
        };
    let cm = required(batch, "CM_BASE", &abs)?
        * required(
            batch,
            "CM_STABILATOR_EFFECTIVENESS",
            &[("stabilatorDeg", input.stabilator_deg)],
        )?
        + cz * (0.35 - input.cg_chord_fraction)
        + if lef == 0.0 {
            0.0
        } else {
            (required(batch, "CM_LEF", &ab)? - required(batch, "CM_BASE", &ab0)?) * lef
        }
        + if sb == 0.0 {
            0.0
        } else {
            required(batch, "CM_SPEEDBRAKE_INCREMENT", &a)? * sb
        }
        + if input.pitch_rate_rad_s == 0.0 {
            0.0
        } else {
            chord_rate
                * input.pitch_rate_rad_s
                * (required(batch, "CM_Q", &a)?
                    + if lef == 0.0 {
                        0.0
                    } else {
                        required(batch, "CM_Q_LEF_INCREMENT", &a)? * lef
                    })
        }
        + required(batch, "CM_ALPHA_INCREMENT", &a)?
        + required(
            batch,
            "CM_DEEP_STALL_INCREMENT",
            &[
                ("alphaDeg", input.alpha_deg),
                ("stabilatorDeg", input.stabilator_deg),
            ],
        )?;
    let cy_base = required(batch, "CY_BASE", &ab)?;
    let cy = cy_base
        + if lef == 0.0 {
            0.0
        } else {
            (required(batch, "CY_LEF", &ab)? - cy_base) * lef
        }
        + if da == 0.0 {
            0.0
        } else {
            ((required(batch, "CY_AILERON_20", &ab)? - cy_base)
                + if lef == 0.0 {
                    0.0
                } else {
                    ((required(batch, "CY_AILERON_20_LEF", &ab)? - required(batch, "CY_LEF", &ab)?)
                        - (required(batch, "CY_AILERON_20", &ab)? - cy_base))
                        * lef
                })
                * da
        }
        + if dr == 0.0 {
            0.0
        } else {
            (required(batch, "CY_RUDDER_30", &ab)? - cy_base) * dr
        }
        + if input.yaw_rate_rad_s == 0.0 {
            0.0
        } else {
            span_rate
                * (required(batch, "CY_R", &a)?
                    + if lef == 0.0 {
                        0.0
                    } else {
                        required(batch, "CY_R_LEF_INCREMENT", &a)? * lef
                    })
                * input.yaw_rate_rad_s
        }
        + if input.roll_rate_rad_s == 0.0 {
            0.0
        } else {
            span_rate
                * (required(batch, "CY_P", &a)?
                    + if lef == 0.0 {
                        0.0
                    } else {
                        required(batch, "CY_P_LEF_INCREMENT", &a)? * lef
                    })
                * input.roll_rate_rad_s
        };
    let cn_base = required(batch, "CN_BASE", &abs)?;
    let cn = cn_base
        + if lef == 0.0 {
            0.0
        } else {
            (required(batch, "CN_LEF", &ab)? - required(batch, "CN_BASE", &ab0)?) * lef
        }
        - cy * (0.35 - input.cg_chord_fraction) * 3.45 / 9.144
        + if da == 0.0 {
            0.0
        } else {
            ((required(batch, "CN_AILERON_20", &ab)? - required(batch, "CN_BASE", &ab0)?)
                + if lef == 0.0 {
                    0.0
                } else {
                    ((required(batch, "CN_AILERON_20_LEF", &ab)? - required(batch, "CN_LEF", &ab)?)
                        - (required(batch, "CN_AILERON_20", &ab)?
                            - required(batch, "CN_BASE", &ab0)?))
                        * lef
                })
                * da
        }
        + if dr == 0.0 {
            0.0
        } else {
            (required(batch, "CN_RUDDER_30", &ab)? - required(batch, "CN_BASE", &ab0)?) * dr
        }
        + if input.yaw_rate_rad_s == 0.0 {
            0.0
        } else {
            span_rate
                * (required(batch, "CN_R", &a)?
                    + if lef == 0.0 {
                        0.0
                    } else {
                        required(batch, "CN_R_LEF_INCREMENT", &a)? * lef
                    })
                * input.yaw_rate_rad_s
        }
        + if input.roll_rate_rad_s == 0.0 {
            0.0
        } else {
            span_rate
                * (required(batch, "CN_P", &a)?
                    + if lef == 0.0 {
                        0.0
                    } else {
                        required(batch, "CN_P_LEF_INCREMENT", &a)? * lef
                    })
                * input.roll_rate_rad_s
        }
        + if input.beta_deg == 0.0 {
            0.0
        } else {
            required(batch, "CN_BETA_INCREMENT", &a)? * input.beta_deg
        };
    let cl_base = required(batch, "CL_BASE", &abs)?;
    let cl = cl_base
        + if lef == 0.0 {
            0.0
        } else {
            (required(batch, "CL_LEF", &ab)? - required(batch, "CL_BASE", &ab0)?) * lef
        }
        + if da == 0.0 {
            0.0
        } else {
            ((required(batch, "CL_AILERON_20", &ab)? - required(batch, "CL_BASE", &ab0)?)
                + if lef == 0.0 {
                    0.0
                } else {
                    ((required(batch, "CL_AILERON_20_LEF", &ab)? - required(batch, "CL_LEF", &ab)?)
                        - (required(batch, "CL_AILERON_20", &ab)?
                            - required(batch, "CL_BASE", &ab0)?))
                        * lef
                })
                * da
        }
        + if dr == 0.0 {
            0.0
        } else {
            (required(batch, "CL_RUDDER_30", &ab)? - required(batch, "CL_BASE", &ab0)?) * dr
        }
        + if input.yaw_rate_rad_s == 0.0 {
            0.0
        } else {
            span_rate
                * (required(batch, "CL_R", &a)?
                    + if lef == 0.0 {
                        0.0
                    } else {
                        required(batch, "CL_R_LEF_INCREMENT", &a)? * lef
                    })
                * input.yaw_rate_rad_s
        }
        + if input.roll_rate_rad_s == 0.0 {
            0.0
        } else {
            span_rate
                * (required(batch, "CL_P", &a)?
                    + if lef == 0.0 {
                        0.0
                    } else {
                        required(batch, "CL_P_LEF_INCREMENT", &a)? * lef
                    })
                * input.roll_rate_rad_s
        }
        + if input.beta_deg == 0.0 {
            0.0
        } else {
            required(batch, "CL_BETA_INCREMENT", &a)? * input.beta_deg
        };
    if ![cx, cz, cm, cy, cn, cl]
        .iter()
        .all(|value| value.is_finite())
    {
        return Err(invalid(
            "Appendix B assembly produced a nonfinite coefficient",
        ));
    }
    let contribution_order = BTreeMap::from([
        (
            "cx".to_owned(),
            vec!["BASE", "LEF_INCREMENT", "SPEEDBRAKE_INCREMENT", "Q_DAMPING"],
        ),
        (
            "cz".to_owned(),
            vec!["BASE", "LEF_INCREMENT", "SPEEDBRAKE_INCREMENT", "Q_DAMPING"],
        ),
        (
            "cm".to_owned(),
            vec![
                "BASE_TIMES_STABILATOR_EFFECTIVENESS",
                "CZ_CG_TRANSFER",
                "LEF_INCREMENT",
                "SPEEDBRAKE_INCREMENT",
                "Q_DAMPING",
                "ALPHA_INCREMENT",
                "DEEP_STALL_INCREMENT",
            ],
        ),
        (
            "cy".to_owned(),
            vec![
                "BASE",
                "LEF_INCREMENT",
                "AILERON_INCREMENT",
                "RUDDER_INCREMENT",
                "R_DAMPING",
                "P_DAMPING",
            ],
        ),
        (
            "cn".to_owned(),
            vec![
                "BASE",
                "LEF_INCREMENT",
                "CY_CG_TRANSFER",
                "AILERON_INCREMENT",
                "RUDDER_INCREMENT",
                "R_DAMPING",
                "P_DAMPING",
                "BETA_INCREMENT",
            ],
        ),
        (
            "cl".to_owned(),
            vec![
                "BASE",
                "LEF_INCREMENT",
                "AILERON_INCREMENT",
                "RUDDER_INCREMENT",
                "R_DAMPING",
                "P_DAMPING",
                "BETA_INCREMENT",
            ],
        ),
    ]);
    Ok(AssemblyResult {
        schema_version: "vector.tp1538-aero-assembly-result.v1",
        corpus_sha256: batch.corpus_sha256.clone(),
        state: "AVAILABLE",
        coefficients: Coefficients {
            cx,
            cz,
            cm,
            cy,
            cn,
            cl,
        },
        contribution_order,
    })
}

pub fn evaluate_batch(batch: EvaluatorBatch) -> Result<EvaluatorBatchResult, EvaluatorError> {
    validate_resolver(&batch)?;
    let lookup_results = batch
        .lookup_requests
        .iter()
        .map(|request| lookup(&batch, request))
        .collect::<Result<Vec<_>, _>>()?;
    let assembly_results = batch
        .assembly_requests
        .iter()
        .map(|input| assemble(&batch, input))
        .collect::<Result<Vec<_>, _>>()?;
    Ok(EvaluatorBatchResult {
        schema_version: "vector.tp1538-aero-evaluator-batch-result.v1",
        backend: "rust-wasm",
        subject: "NASA_GENERIC_F16",
        deployment_class: "ENGINE_VERIFICATION_ONLY",
        evaluator_contract: EVALUATOR_CONTRACT,
        corpus_sha256: batch.corpus_sha256,
        lookup_results,
        assembly_results,
    })
}

pub fn evaluate_batch_json(input: &str) -> Result<String, EvaluatorError> {
    let batch: EvaluatorBatch = serde_json::from_str(input)
        .map_err(|error| EvaluatorError::InvalidJson(error.to_string()))?;
    let result = evaluate_batch(batch)?;
    serde_json::to_string(&result).map_err(|error| EvaluatorError::Serialization(error.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn resolver_tables() -> Vec<ResolverTable> {
        TABLES
            .iter()
            .map(|spec| {
                let alpha_trailing =
                    spec.axes
                        .iter()
                        .position(|name| *name == "alphaDeg")
                        .map(|position| {
                            spec.axes[position + 1..]
                                .iter()
                                .map(|name| axis(name).map(|item| item.values.len()).unwrap_or(1))
                                .product::<usize>()
                        });
                let cells = (0..spec.cell_count)
                    .map(|cell_index| {
                        let outside = alpha_trailing.is_some_and(|trailing| {
                            let alpha_index = (cell_index / trailing)
                                % axis("alphaDeg").map(|item| item.values.len()).unwrap_or(1);
                            axis("alphaDeg")
                                .map(|item| item.values[alpha_index] > spec.alpha_max_deg)
                                .unwrap_or(false)
                        });
                        ResolverCell {
                            state: if outside {
                                "OUT_OF_DOMAIN"
                            } else {
                                "AVAILABLE"
                            }
                            .to_owned(),
                            value: if outside {
                                None
                            } else if spec.id == "CM_STABILATOR_EFFECTIVENESS" {
                                Some(1.0)
                            } else {
                                Some(0.0)
                            },
                        }
                    })
                    .collect();
                ResolverTable {
                    id: spec.id.to_owned(),
                    cells,
                }
            })
            .collect()
    }

    fn batch() -> EvaluatorBatch {
        EvaluatorBatch {
            schema_version: "vector.tp1538-aero-evaluator-batch.v1".to_owned(),
            subject: "NASA_GENERIC_F16".to_owned(),
            deployment_class: "ENGINE_VERIFICATION_ONLY".to_owned(),
            evaluator_contract: EVALUATOR_CONTRACT.to_owned(),
            corpus_sha256: "a".repeat(64),
            resolver_tables: resolver_tables(),
            lookup_requests: vec![request("CX_Q", &[("alphaDeg", -17.5)])],
            assembly_requests: vec![AssemblyInput {
                schema_version: "vector.tp1538-aero-assembly-input.v1".to_owned(),
                angle_unit: "DEG".to_owned(),
                alpha_deg: 0.0,
                beta_deg: 0.0,
                stabilator_deg: 0.0,
                leading_edge_flap_deg: 25.0,
                speed_brake_deg: 0.0,
                aileron_deg: 0.0,
                rudder_deg: 0.0,
                roll_rate_rad_s: 0.0,
                pitch_rate_rad_s: 0.0,
                yaw_rate_rad_s: 0.0,
                true_airspeed_mps: 100.0,
                cg_chord_fraction: 0.35,
            }],
        }
    }

    #[test]
    fn exact_schema_drives_lookup_and_appendix_b_assembly() {
        let mut candidate = batch();
        let cx_q = TABLES
            .iter()
            .position(|spec| spec.id == "CX_Q")
            .unwrap_or(0);
        candidate.resolver_tables[cx_q].cells[0].value = Some(1.0);
        candidate.resolver_tables[cx_q].cells[1].value = Some(3.0);
        let result = evaluate_batch(candidate);
        assert!(result.is_ok());
        let Ok(result) = result else { return };
        assert_eq!(result.lookup_results[0].diagnostic, "INTERPOLATED");
        assert_eq!(result.lookup_results[0].value, Some(2.0));
        assert_eq!(
            result.assembly_results[0].coefficients,
            Coefficients {
                cx: 0.0,
                cz: 0.0,
                cm: 0.0,
                cy: 0.0,
                cn: 0.0,
                cl: 0.0
            }
        );
    }

    #[test]
    fn resolver_rejects_reorder_domain_and_unknown_json_fields() {
        let mut reordered = batch();
        reordered.resolver_tables.swap(0, 1);
        assert!(evaluate_batch(reordered).is_err());

        let mut weakened = batch();
        let limited = TABLES
            .iter()
            .position(|spec| spec.id == "CX_LEF")
            .unwrap_or(0);
        let last = weakened.resolver_tables[limited].cells.len() - 1;
        weakened.resolver_tables[limited].cells[last] = ResolverCell {
            state: "AVAILABLE".to_owned(),
            value: Some(0.0),
        };
        assert!(evaluate_batch(weakened).is_err());

        let json = serde_json::to_string(&batch()).unwrap_or_default();
        let forged = json.replacen("{", "{\"unknown\":true,", 1);
        assert!(evaluate_batch_json(&forged).is_err());
    }
}
