# Work item 01: Intended use and credibility contract

Priority: P0

Depends on: current-state audit

Blocks: every named aircraft, weapon, sensor, and result claim

## Outcome

Every engine and model-pack version states the questions it can answer, the operating envelope in which it was checked, the evidence used, the known limits, and the uncertainty that remains.

## Why this comes first

Model fidelity is relative to intended use. A point-mass model can be appropriate for a bounded launch-geometry study and inappropriate for a high-angle-of-attack dogfight. A 6DOF model can still be wrong if its coefficients or control laws are invented.

[DoDI 5000.61](https://www.esd.whs.mil/Portals/54/Documents/DD/issuances/dodi/500061p.pdf) requires verification and validation through the lifecycle and accreditation for a specific intended use. VECTOR is not seeking formal DoD accreditation, but this is the correct public quality model to borrow. [NASA-STD-7009](https://standards.nasa.gov/standard/NASA/NASA-STD-7009) provides a second public model for credibility assessment, sensitivity, uncertainty, verification, and validation.

## A2A intended-use classes

| Class | Question | Required minimum model | Explicit non-use |
| --- | --- | --- | --- |
| Geometry teaching | How do range, altitude, aspect, and closure evolve? | Verified coordinate, atmosphere, kinematic, and recording model | Aircraft handling or weapon effectiveness claims |
| WVR maneuver study | How do attainable turn, climb, and energy states change position? | Aircraft-specific flight dynamics and control limits | Pilot qualification or physiological training |
| BVR timeline study | When can each side detect, track, support, launch, defend, and reacquire? | Flight, sensor, track, datalink, weapon, and doctrine state machines | Classified radar, EW, or weapon performance claims |
| Weapon fly-out study | How does launch state affect closest approach and terminal state? | Dynamic weapon fly-out, atmosphere, guidance, target motion, and convergence evidence | Probability of kill without fuze, warhead, target vulnerability, and countermeasure models |
| Debrief and comparison | What changed between two controlled runs? | Immutable scenario, record, events, metrics, and version identity | Causal claims from uncontrolled multi-variable changes |

## Deliverables

1. A versioned `CredibilityManifest` schema for each engine and compiled model pack.
2. An intended-use identifier attached to every scenario package and saved run.
3. A model evidence index containing requirement, test, result, tolerance, source, date, and reviewed model digest.
4. A limitation registry that the report can render without rewriting technical copy.
5. A release matrix mapping product claims to passing evidence.

## Contract sketch

```text
CredibilityManifest
  model_pack_digest
  engine_digest
  intended_use[]
  validity_domain
    altitude
    mach
    angle_of_attack
    load_factor
    configuration
    environment
  requirements[]
  verification_cases[]
  validation_cases[]
  numerical_tolerances
  uncertainty_characterization
  known_limitations[]
  approval_state
```

This replaces the idea that a single `SOURCED` or `MODEL_ASSUMPTION` label is sufficient. Evidence belongs to the exact field, curve, model pack, and validation case. The UI does not ask an enthusiast to classify truth. It shows the model's tested scope and records any scenario-local change as a patch against a versioned pack.

## Acceptance criteria

- No named result can render without an intended-use ID and model-pack digest.
- The report states supported and unsupported interpretations in plain language.
- Every coefficient table has a unit, coordinate convention, validity domain, and evidence reference.
- A model-pack change invalidates prior evidence until its affected cases pass.
- A scenario-local parameter patch records old value, new value, unit, reason, and authoring timestamp without mutating the catalog model.
- Unsupported combinations fail validation instead of receiving fallback coefficients.

## Tests

- Schema rejects missing units, empty validity domains, and unresolvable evidence references.
- Golden manifests round-trip canonically and retain the same digest.
- A one-value model change changes the model digest and invalidates the expected evidence links.
- Reports fail closed when an intended-use requirement is absent.
- Limit text is selected from the manifest, not hard-coded independently in map, result, and report components.

## Non-goals

- Formal military accreditation.
- Claims that public data equals operational performance.
- One universal fidelity score.
