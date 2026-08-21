# Aircraft evidence registry

The governed artifact inventory is
[`governance/aircraft-evidence-registry.v1.json`](../governance/aircraft-evidence-registry.v1.json).
It is the admission authority for named-aircraft performance, separate from
catalog source assertions and model-pack evidence rows.

## Admission rule

For each aircraft and each required capability — aerodynamics, propulsion,
flight controls, mass and stores, and sensors — an `ADMITTED` claim needs:

- an exact subject identity;
- at least one immutable primary `SOURCE` artifact;
- at least one different immutable `VALIDATION` artifact;
- explicit capability coverage and validity limits; and
- a model-pack evidence set that exactly matches the governed claim.

`scripts/verify-aircraft-evidence-registry.mjs` validates artifact identities,
local derivative hashes, ancestry, capability coverage, and source/validation
separation. `compileModelPack` invokes the governed admission check. A synthetic
pair of `SOURCE`/`VALIDATION` rows in a pack cannot promote a named aircraft.

## Current public asset and limits

NASA NESC 2015 Atmospheric Case 11 provides a public F-16 verification asset.
The registry records NASA's DAVE-ML package and independent Sim 04 trajectory
hashes, plus the hash of VECTOR's committed, SI-normalized derivative fixture.
Its purpose is the isolated trim-propagation check described in
[`public-aircraft-reference.md`](public-aircraft-reference.md).

It does not match the PAF F-16C Block 52 catalog identity. It has no Su-30MKI
data. It also does not cover the complete required capability set. Therefore
both selectable aircraft remain `UNSUPPORTED` for named-aircraft performance.
The educational geometry/route executor is unaffected and retains its existing
blocking limitation.

## Change procedure

1. Store or reproducibly retrieve the primary and independent validation
   artifacts under their license terms.
2. Record the artifact SHA-256, authoritative URI, exact subject, extraction
   method, units, validity domain, uncertainty, and review result.
3. Add all five capability records. Do not use a source artifact as its own
   validation or reuse evidence from a different variant.
4. Add independent table-point or trajectory checks before changing the claim
   to `ADMITTED`.
5. Update the model pack with exactly the registered evidence IDs, run
   `npm run policy:aircraft-evidence:verify`, model-pack/Rust parity tests, and
   `make ci-local`.

The registry does not fetch remote data in a simulation tick, or at build time.
Remote hashes identify source material; only a committed derivative has its
content re-hashed locally. A corrected source or derivative requires a new
registry version and review.
