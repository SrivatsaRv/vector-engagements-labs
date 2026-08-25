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
- an artifact-level `subjectClaimIds` binding to that exact governed claim;
- artifact-level coverage of the capability being admitted;
- explicit capability coverage and validity limits; and
- a model-pack evidence set that exactly matches the governed claim.

`scripts/verify-aircraft-evidence-registry.mjs` validates artifact identities,
local derivative hashes, ancestry, capability coverage, and source/validation
separation. It also rejects pending hashes, context-only rows, expired proposals,
and ineligible artifacts when they are placed into an admission claim.
`compileModelPack` invokes the governed admission check in TypeScript and Rust.
A synthetic pair of `SOURCE`/`VALIDATION` rows in a pack cannot promote a named
aircraft. Both implementations compare the model-pack evidence row's ID, kind,
and SHA-256 against the exact registry artifact; matching an ID alone is not
sufficient. Evidence bound to the F-16C, F-16D, generic NASA reference, or a
different capability cannot be reused for the Su-30MKI, and vice versa.

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

The reviewed Lockheed Peace Drive I page provides context for 12 F-16C, 6 F-16D
and a categorical F100-PW-229 association. Its current mutable bytes do not
match the previously reviewed digest, so the registry records a null digest and
`PENDING` hash review rather than claiming an immutable artifact. The 2006
Federal Register artifact supports requested
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

## Historical external-store source freeze

`governance/nasa-historical-f16-store-source/manifest.v1.json` records a
separate source-only inventory for NASA-TM-74078, NASA-CR-172354, and
NASA-TM-87766. The subjects are a historical FSD quarter-scale flutter model,
one decoupler-pylon design and ground-test programme, and one exact FSD F-16A
flight-test configuration. They are not the PAF F-16C/D Block 52 subjects in
this registry.

The manifest pins official PDF and metadata identities, source roles, page and
render identities, rights facts, literal unit semantics, and coordinate gaps.
It preserves aircraft station numbers, span stations, semi-span fractions,
fuselage stations, and forward-hook-relative distances as different concepts.
NASA-CR-172354 Table 2 prints legacy force-times-length-squared inertia units;
a future mass-inertia conversion must divide the SI numerator by declared
`g0 = 9.80665 m/s²`. The final assembled-pylon weight is on PDF page 28,
printed page 24, and remains force.

The committed quarantine preserves the three exact PDFs, metadata snapshots,
18 declared full-page render files, and the exact NASA Public Access Plan used
as authority evidence. Official NASA source terms plus the digest-pinned NTRS
facts authorize internal verification use and redistribution of those exact
bytes and declared renders only. `RELEASE_OWNER_REVIEW` separately records a
non-legal semantic inspection of all 16 page/report/anchor mappings. It does
not create legal, adaptation, execution, model, or runtime authority and no
numeric value or equation was transcribed.

The manifest therefore keeps adaptation, execution, numeric/equation
transcription, model admission, and runtime permissions false. No source row is
admission-eligible and no aircraft capability changes state. The deny-all
offline verifier checks the committed inventory, source terms, release record,
exact bytes, page counts and render reproduction; it cannot promote the bundle
into model-pack evidence.

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

## Generic NASA F-16 verification corpus

The separately owned, versioned
[`governance/nasa-generic-f16-verification-corpus.v1.json`](../governance/nasa-generic-f16-verification-corpus.v1.json)
records one non-catalog verification corpus with the exact subject
`NASA_NESC_GENERIC_F16_REFERENCE` and intended use
`ENGINE_VERIFICATION_ONLY`. The published aircraft evidence registry v2 is not
extended or reinterpreted by this corpus. The corpus is not a fourth
named-aircraft subject and has `runtimeAuthority: NONE`; it cannot be selected
as a PAF F-16, relabelled as a Su-30-family aircraft, or used to admit named
performance.

The immutable evidence identities for the first #135 slice are:

| Role | Artifact | SHA-256 | Licence decision |
| --- | --- | --- | --- |
| source report | NASA TP-1538 / NTRS 19800005879 | `aae0ece64474291368c0b4c816d3ab327c6100329e6eb030c2f4545d0913feb3` | NASA NTRS `GOV_PUBLIC_USE_PERMITTED` |
| source report | NASA/TM-2003-212145 / NTRS 20030013626 | `df7eb1a40f18c5d025de7759c4c227a36c283b8522f89dd9bed5c7d6b6aaedc9` | NASA NTRS `PUBLIC_USE_PERMITTED` |
| common-model reference | NASA NESC F-16 package | `20c60f615ae8e87d81c9d98b54fff45a2832840201499cbcfe3f45a60ef3e5b2` | new derivative requires explicit licence and ancestry review |
| common-model comparison | NESC Atmospheric Case 13.2 archive | `b26a2f9eb4c537ea96bf73493004ae77d37b38d496b32e6d50e00b4ec9482fb1` | new derivative requires explicit licence and ancestry review |

TP-1538 publishes numeric aerodynamic tables in Table III (PDF pages 51–85,
report pages 45–79) and mass/dimensional data in Table I (PDF/report pages
49/43). TM-2003-212145 publishes the simulated mass properties in Table 1
(PDF/report pages 48/33), but directs the actual aerodynamic and propulsion
table values to external MATLAB package files. The NESC package fills those
gaps only through a lineage that includes a Morelli copyright notice and
Stevens and Lewis book-derived propulsion and inertia material. Its
package-wide derivative redistribution authority for a new corpus is not
established.

Registry v2 already records the reviewed
`vector-nesc-case11-derived-fixture`, a narrow SI-normalized descendant of the
NESC model and Case 11 comparison output. The standalone corpus preserves that
legacy fact and its exact digest. It does not claim that all derivatives are
forbidden; it requires a new, explicit licence and ancestry review before any
additional descendant is committed or promoted.

The standalone verifier treats the three published Case 11 registry records as
one immutable projection: the DAVE-ML source, Sim 04 comparison and committed
descendant must retain their complete IDs, digests, locations, authorities,
kinds, review states, admission uses, capability coverage, scopes and descendant
ancestry. Broad registry-schema validity is not sufficient. The standalone
DAVE-ML record is also cross-bound to the registry source by ID, authority, URI,
SHA-256 and capability set. Its reviewed `ENGINE_VERIFICATION_ONLY` use and
new-derivative restriction remain stricter standalone decisions; registry
`REFERENCE_ONLY` never grants permission to create another derivative. The
registry v2 file itself remains byte-identical.

Consequently the normalized derivative is deliberately `WITHHELD`: there are
no committed Case 13.2 coefficient, propulsion, inertia, control or trajectory
tables and no production evaluator. The NESC trajectories remain a comparison
between implementations of a common model, not independent physical
validation. `npm run policy:nasa-generic-f16:verify` checks the exact identities,
roles, licence decisions, subject, intended use, page ancestry and withheld
state without accessing the network. Passing `-- --artifact-dir <directory>`
also hashes locally retained source bytes offline; expected filenames are
`19800005879.pdf`, `20030013626.pdf`, `F16_package.zip`, and
`Atmos_13p2_SubsonicAirspeedChangeF16.zip`.

Research-candidate table validation is not allowed to trust a caller-supplied
corpus by shape or artifact ID alone. `validateResearchDerivative` requires the
published aircraft registry and re-runs the full standalone-corpus validation,
including the complete three-record Case 11 projection and local descendant
digest, before it evaluates derivative ancestry or table content. A changed
corpus subject, authority, admission state, artifact identity, licence, role,
page capability or output—or a semantically valid but different registry
record—therefore fails before a restricted DAVE-ML artifact can masquerade as a
permitted NTRS report.
