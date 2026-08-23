# Aircraft evidence registry

The current governed artifact inventory is
[`governance/aircraft-evidence-registry.v2.json`](../governance/aircraft-evidence-registry.v2.json).
The v1 artifact remains committed and is verified as a readable predecessor.
V2 is the admission authority for named-aircraft performance and the public
classification boundary for descriptive aircraft evidence. It remains separate
from catalog source assertions and model-pack evidence rows.

## Admission rule

For each aircraft and each required capability — aerodynamics, propulsion,
flight controls, mass and stores, and sensors — an `ADMITTED` claim needs:

- an exact operator, variant, programme and seat-configuration subject;
- at least one immutable primary `SOURCE` artifact;
- at least one different immutable `VALIDATION` artifact;
- completed hash and license review;
- explicit eligibility for the named-performance source or validation role;
- explicit capability coverage and validity limits; and
- a model-pack evidence set that exactly matches the governed claim.

`scripts/verify-aircraft-evidence-registry.mjs` validates artifact identities,
local derivative hashes, ancestry, capability coverage, and source/validation
separation. It also rejects pending hashes, context-only rows, expired proposals,
and ineligible artifacts when they are placed into an admission claim.
`compileModelPack` invokes the governed admission check in TypeScript and Rust.
A synthetic pair of `SOURCE`/`VALIDATION` rows in a pack cannot promote a named
aircraft.

## Exact current subjects

| Subject | Public catalog state | Named performance |
| --- | --- | --- |
| IAF Su-30MKI | scenario-selectable teaching identity | `UNSUPPORTED` |
| PAF F-16C Block 52, Peace Drive I, 12 single-seat aircraft | scenario-selectable teaching identity | `UNSUPPORTED` |
| PAF F-16D Block 52, Peace Drive I, 6 two-seat aircraft | catalog-only; no compiled runtime model | `UNSUPPORTED` |

The C and D subjects are never collapsed. Adding the D catalog row does not add
it to the scenario picker, model pack, Worker, VSR, or report as an executable
aircraft.

## Descriptive evidence states

- `CONTEXT_ONLY` supports a categorical identity or programme association. It
  always carries `runtimeAuthority: NONE`.
- `UNKNOWN` records an unresolved fitted system without inventing a value.
- `MODEL_ASSUMPTION` records a teaching default without source authority.
- `INELIGIBLE` quarantines evidence that cannot support the claim, including an
  expired proposal.

The HAL brochure supports only categorical Su-30MKI roles, two AL-31FP engines,
and 12 hardpoints. HAL's dynamic RLSU-30MK page supports only a categorical PESA
association and has a pending immutable hash. The Astra integration statement
does not supply station, loadout, guidance, sensor-support, or weapon-performance
authority.

Lockheed's Peace Drive I release supports 12 F-16C, 6 F-16D and a categorical
F100-PW-229 association. The 2006 Federal Register artifact supports requested
programme associations for APG-68(V)9, Link 16, AIM-120C-5 and LAU-129/A only.
It does not prove final delivered fit. The separate 2016 DSCA proposal expired
without acceptance and is `INELIGIBLE`; the dynamic CRS locator that supports
that governance review remains pending an immutable hash. No ALQ-211(V)9 fitted
claim is published.

## Current public asset and limits

NASA NESC 2015 Atmospheric Case 11 provides a public F-16 verification asset.
The registry records NASA's DAVE-ML package and independent Sim 04 trajectory
hashes, plus the hash of VECTOR's committed, SI-normalized derivative fixture.
Its purpose is the isolated trim-propagation check described in
[`public-aircraft-reference.md`](public-aircraft-reference.md).

It does not match either Peace Drive I subject. It has no Su-30MKI data and does
not cover the complete required capability set. Both selectable named aircraft
therefore remain `UNSUPPORTED`; the F-16D catalog-only subject is also
`UNSUPPORTED` and has no runtime model. The compiled model-pack digest remains
unchanged by this governance correction. TypeScript, Rust/WASM, Worker, VSR,
catalog, UI and reports retain the same blocking named-performance boundary.

## Change procedure

1. Store or reproducibly retrieve the primary and independent validation
   artifacts under their license terms.
2. Record the artifact SHA-256, license decision, authoritative URI, exact
   subject, extraction method, units, validity domain, uncertainty, and review
   result. A dynamic locator with no immutable hash remains context only.
3. Add all five capability records. Do not use a source artifact as its own
   validation or reuse evidence from a different variant.
4. Add independent table-point or trajectory checks before changing the claim
   to `ADMITTED`.
5. Update the model pack with exactly the registered admission-eligible evidence IDs, run
   `npm run policy:aircraft-evidence:verify`, model-pack/Rust parity tests, and
   `make ci-local`.

The registry does not fetch remote data in a simulation tick, or at build time.
Remote hashes identify source material; only a committed derivative has its
content re-hashed locally. A corrected source or derivative requires a new
registry version and review.
