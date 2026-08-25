# NASA historical F-16 external-store source freeze

This directory owns the source-only contract
`vector.nasa-historical-f16-store-source-manifest.v1`. The manifest pins three
official NASA historical artifacts, their metadata, exact page locations,
render identities, source roles, unit semantics, coordinate gaps, and prohibited
inferences.

The quarantine includes the three exact PDFs, three NTRS metadata responses,
18 declared full-page render files, and the exact NASA Public Access Plan used
by the source-terms authority record. `source-terms-authority.v1.json` binds the
official policy and all three metadata digests to internal verification use,
exact-byte/declared-render redistribution, and the recorded no-export-
restriction facts. It is authoritative source evidence, not a repository-
created licence or legal approval.

`release-owner-visual-review.v1.json` separately binds the manifest digest and
all 16 declared page/render mappings. `RELEASE_OWNER_REVIEW` is a technical
semantic inspection of report identity, page/anchor mapping, orientation,
legibility, eligible context, limitations, and nonclaims. It is not
`AUTHORIZED_HUMAN`, cannot create legal authority, and records that no numeric
value or equation was transcribed.

The manifest keeps adaptation, execution, model admission, numeric/equation
transcription, and runtime permissions false. The quarantined sources remain
inadmissible as model-pack or runtime evidence. The local render reproduction
is fail closed on Poppler 26.05.0 and Sharp 0.35.0; those tool versions are part
of the frozen render identity.

Lateral and vertical datums, handedness, a complete body-frame transform, and
complete station geometry are explicitly `UNAVAILABLE`. The literal Table 2
inertia labels remain `kN·m²` and `lb·in²`; they are not mass inertia values.

Run the committed contract check with:

```sh
npm run policy:nasa-f16-store-source:verify
```

Reproduce all 16 declared renders from the committed exact six-file source set
without network access with:

```sh
node --require ./scripts/lib/generic-sensor-network-deny.cjs \
  scripts/verify-nasa-f16-store-source.mjs \
  --source-dir governance/nasa-historical-f16-store-source/sources
```

The source check proves identity, page count, render reproducibility, and
network isolation. It does not grant adaptation/execution authority or admit
executable values.
