# Generic mission-policy verification source freeze

This directory owns `vector.generic-mission-policy-verification-source-manifest.v1` for issue #151. It is a Stage-0, source-only, civil-research/training evidence boundary. It does not define or admit a mission-policy state machine, action, threshold, cadence, timeout, priority, tie-break, hysteresis, fuel value, geometry, command, doctrine, tactics, rules of engagement, runtime export, or model-pack capability.

## External-byte boundary

No source PDF, NASA metadata response, alternate PDF, render, crop, quotation corpus, or derived table is committed here. The selected 2019 paper visibly carries AIAA copyright / all-rights-reserved text. NASA's official media guidance says NASA hosting does not transfer rights in identified third-party copyrighted material. The FAA landing page establishes public access and artifact identity but does not establish redistribution, adaptation, or export permission. `source-terms-evidence.v1.json` therefore records facts only and is explicitly non-legal.

All three source rows close their local decisions. Exact user-supplied bytes may be checked offline as `REFERENCE_ONLY`; redistribution and adaptation are `CLOSED_DENIED_NOT_AUTHORIZED`. Execution, runtime, model-pack, and production permissions are false. A closed negative decision completes this source-governance boundary while forcing any later permission-requiring operation to reject.

The expected external directory contains:

- `20190029195.pdf`
- `nasa-2019-metadata.json`
- `2021_scitech_dva_Approv.pdf`
- `nasa-2020-metadata.json`
- `risk_management_handbook_2A.pdf`
- `2019-baculi-alternate.pdf`

The alternate NASA PDF is verified only to prove its separately identified bytes reject as a substitute. Mutable mirrors reject. AFDP 1 and AFDP 3-01 remain unacquired `UNVERIFIED_DISCOVERY_ONLY` rows. CJCSI 3121.01(S) is `PERMANENTLY_INELIGIBLE`: it must not be sought, downloaded, stored, quoted, or used to derive a claim.

## Verification and review

`RELEASE_OWNER_REVIEW` is a technical, non-legal semantic inspection bound to the exact source set, Poppler 26.05.0 render profile, 15 declared page renders, and three external contact-sheet digests. It confirms title/report identity, corrected PDF/printed-page mapping, legibility, orientation, visible rights notice, and limitations/nonclaims consistency. It grants no rights and records no numeric or equation transcription.

The full network-denied source gate requires the external directory and cannot skip:

```sh
VECTOR_GENERIC_MISSION_POLICY_SOURCE_DIR=/absolute/path/to/exact-sources \
  make generic-mission-policy-sources-local
```

It verifies exact sizes and hashes, both NASA metadata rights/export facts, FAA MD5, PDF page counts, all declared render hashes, the rejected alternate, manifest/source/render digests, and production isolation. `npm run policy:generic-mission-policy-source:verify` is the source-byte-independent CI contract/tamper/isolation gate. It cannot claim exact-source reproduction; the completion evidence must record the explicit external gate separately.

Runtime/parity, browser, performance, database, and migration tests are omitted for the source-only reason. The normal `make ci-local`, built Worker gate, and exact clean clone still prove that this quarantined schema and its unique markers do not enter production TypeScript, Rust/WASM, backend, Worker, browser artifacts, or runtime fixture roots.
