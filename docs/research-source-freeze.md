# Research source freeze

The current governed inventory is
[`governance/research-source-freeze.v1.json`](../governance/research-source-freeze.v1.json).
It is validated offline by
[`scripts/verify-research-source-freeze.mjs`](../scripts/verify-research-source-freeze.mjs)
with hostile fixtures in
[`tests/research-source-freeze.test.mjs`](../tests/research-source-freeze.test.mjs).

## What this inventory is

One immutable, content-addressed record of the public air-combat-autonomy
research VECTOR has reviewed: programme descriptions, papers, repositories,
datasets and policy weights. Each record states exactly what the source may
be used for and, explicitly, what it may not.

The inventory permits reproducible research and architectural learning. It is
**not** a claim of combat approval, operational doctrine, or real-platform
fidelity. No record admits aircraft truth, weapon truth, sensor performance,
station or loadout authority, mission doctrine, or any executable runtime
parameter. Every record carries `notRuntimeAuthority: true`, and no consumer
may treat a record's presence here as permission to execute, import, or
promote its contents.

This is a source-governance and documentation artifact. It implements no
virtual pilot, adds no model coefficients, trains no policy, and changes no
simulation behaviour. Production code, Workers, Rust/WASM, model packs,
scenarios and browser bundles must not import research code, data, or
weights recorded here. The boundary follows the same pattern as the generic
mission-policy source-only manifest described in
[`model-pack-contract.md`](model-pack-contract.md#artifact-boundaries).

## Relationship to other contracts

This vocabulary is deliberately **separate** from the aircraft evidence
registry's admission vocabulary; see
[`aircraft-evidence-registry.md`](aircraft-evidence-registry.md#admission-rule).
The two govern different subjects and different promotion decisions, and no
automatic mapping exists between them. A `CODE_CANDIDATE` here can never
satisfy a named-aircraft evidence requirement there.

Downstream consumers reference frozen record IDs and digests as research
lineage only:

- **#38** may cite immutable record IDs as research lineage while defining
  and validating its own policy pack, actions, guards, bounds and runtime
  contract.
- **#39** may cite the same records as evaluation context while remaining
  responsible for independent runtime evidence.
- **#202** depends on this freeze to identify eligible references and
  quarantine unapproved code, data and weights.
- **#205** may cite architectural inspiration recorded here; it obtains no
  tactical constants or executable rules from it.

Neither #38 nor #39 executes behaviour or imports parameters from this
inventory.

## Source roles

Each record declares a `vectorSourceRole`, optionally a `secondaryRole`:

| Role | Meaning |
| --- | --- |
| `ARCHITECTURE_INSPIRATION` | A structural or design idea may be studied. |
| `ALGORITHM_REFERENCE` | An algorithm or method may be studied. |
| `EVALUATION_REFERENCE` | An evaluation approach or harness may be studied. |
| `CODE_CANDIDATE` | Source code that *may* become reusable after independent review. Never reusable on the strength of this record alone. |
| `DATA_CANDIDATE` | A dataset that *may* become usable after independent provenance and licence review. |
| `WEIGHT_CANDIDATE` | Trained policy weights that *may* become usable after independent review. |
| `CONTEXT_ONLY` | Background only. No study, reuse, or promotion is implied. |

## Adoption is decided per use, not per record

A single global adoption value is too ambiguous: the same source is
frequently acceptable to study while its code remains prohibited. Each
record therefore carries `adoptionByUse`, containing only the keys its
declared roles make applicable:

| Key | Applicable when | Governs |
| --- | --- | --- |
| `architectureStudy` | any study role, or a bare `CONTEXT_ONLY` record | whether VECTOR may cite and study the source |
| `codeReuse` | `CODE_CANDIDATE` | whether its source code may be reused |
| `dataReuse` | `DATA_CANDIDATE` | whether its dataset may be used |
| `weightReuse` | `WEIGHT_CANDIDATE` | whether its weights may be used |

Each value is `NOT_ADOPTED`, `QUARANTINED`, or `ADOPTED`. Declaring a key
that no declared role supports is a validation error.

The canonical example is BVR Gym: `architectureStudy: ADOPTED` alongside
`codeReuse: QUARANTINED`. Its behaviour-tree decomposition may be studied;
its GPL-3.0 code may not be reused.

## Evidence and review states

Hash review and licence review are tracked **independently** — a file's bytes
can be verified long before its licence question is settled, and vice versa.

- `hashReviewState`: `VERIFIED` (requires a real SHA-256) or `PENDING`
  (must not claim a digest at all).
- `licenseReviewState`: `REVIEWED`, `PENDING`, or `NOT_APPLICABLE`.
- `licenseClassification`: `PERMISSIVE`, `RESEARCH_ONLY`, `GPL`, `UNKNOWN`,
  `MISSING`, `CONFLICTING`, or `NOT_APPLICABLE`.

Everything except `PERMISSIVE` and `NOT_APPLICABLE` blocks code, data and
weight promotion by default. A repository's licence is never silently applied
to separately hosted data or weights; those receive their own records with
their own independent states.

## Fail-closed conditions

The verifier rejects:

- a `CODE_CANDIDATE` whose `exactCommit` is not a real git hash — a branch
  name or free-text reference is insufficient;
- a `CODE_CANDIDATE` missing `repositoryOrigin`, `subpath`, or
  `archivedDigest` — exact commit identity alone is not sufficient provenance;
- a `VERIFIED` hash review without a well-formed SHA-256, or a `PENDING`
  review that carries one anyway;
- a paper or programme record claiming `VERIFIED` without a real
  `documentDigest` — a URL alone is insufficient;
- any artifact promotion while `claimLocator` remains unresolved;
- any code, data, or weight promotion under a blocking licence
  classification, or without a completed licence review;
- an `adoptionByUse` key unsupported by the record's declared roles, or a
  legacy single `adoptionDecision` field;
- a record flagged `requiresDisambiguation` without a complete
  `collisionRisk` record naming the colliding project and the distinguishing
  facts;
- a `DYNAMIC` (unpinned, silently mutable) locator claiming a verified hash;
- a `recencyReview` whose `ageAtReviewDays` disagrees with the record's own
  `publishedAt`/`reviewedAt`, or which claims maturity inside its own
  declared window;
- a `derivedFromArtifactIds` reference to a record that does not exist —
  a paper/code/result lineage gap;
- a committed derivative whose bytes no longer match its recorded digest.

Recency is a reviewed, recorded decision — computed once from the record's own
fixed dates — not a live wall-clock rule. The same committed file therefore
validates identically today and in a year. A maturity window is declared per
record rather than imposed globally; a separately versioned policy would be
required before any global admission threshold could exist.

## Immutability and supersession

Published records are not rewritten. A correction adds a new record whose
`supersedes` field names the record it replaces, and the superseded record
remains present and readable. Every record carries a `supersedes` field,
`null` where it is the first version.

Committed, versioned JSON plus an offline verifier is the source of truth for
this contract. There is no database authority for it. Any future database
representation must be a migration-backed projection of this file, never a
replacement for it.

## Production-artifact isolation

`checkProductionIsolation()` scans declared dependencies for any quarantined
or non-adopted source's repository slug, ensuring research code, training
dependencies and unapproved weights cannot reach production artifacts. Where
several records share one repository — for example separately reviewed code,
data and weight records — the check remains conservative: adopting one use
does not clear the repository slug while a sibling record is still
quarantined.

## Adding or changing a record

1. Retrieve the artifact and record its exact bytes: SHA-256 for a document;
   exact commit, `repositoryOrigin`, `subpath` and `archivedDigest` for code.
2. Record hash review and licence review independently. A dynamic locator
   with no immutable hash stays context-only.
3. Assign `vectorSourceRole` (and `secondaryRole` where a source serves two
   purposes), then record a decision for every applicable `adoptionByUse`
   key.
4. Record `reviewer`, `reviewedAt`, and the explicit non-authority scope and
   validity limits, including the simplifications the cited environment
   declares — privileged state, automated weapon launch, reduced action
   spaces, fixed geometry or simplified flight/weapon models.
5. Split separately hosted code, data and weights into separate records.
6. Run `node scripts/verify-research-source-freeze.mjs` and
   `node --test tests/research-source-freeze.test.mjs`.

A correction publishes a new version and preserves the superseded record.