# NASA historical F-16 external-store source freeze

This directory owns the source-only contract
`vector.nasa-historical-f16-store-source-manifest.v1`. The manifest pins three
official NASA historical artifacts, their metadata, exact page locations,
render identities, source roles, unit semantics, coordinate gaps, and prohibited
inferences.

The PDFs, metadata responses, and page renders are intentionally absent. Local
reference-use, redistribution, export, and human visual-review decisions are
still pending. A user may supply the six exact files to the offline verifier,
but the bundle remains inadmissible and cannot feed a model pack or runtime.

Run the committed contract check with:

```sh
npm run policy:nasa-f16-store-source:verify
```

Verify a reviewed local six-file bundle without network access with:

```sh
node scripts/verify-nasa-f16-store-source.mjs --source-dir /absolute/path/to/files
```

The optional source check does not grant approval or admit executable values.
