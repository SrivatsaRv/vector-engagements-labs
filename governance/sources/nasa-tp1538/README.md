# NASA TP-1538 frozen source evidence

The exact publication is NASA-TP-1538, *Simulator study of stall/post-stall characteristics of a fighter airplane with relaxed longitudinal static stability* (1979-12-01), by Nguyen, L. T.; Ogburn, M. E.; Gilbert, W. P.; Kibler, K. S.; Brown, P. W.; and Deal, P. L. This identity is bound to the frozen NTRS metadata and fails closed on title, report-number, date, or author drift.

This directory is the Stage 1 source-evidence boundary for issue #143 and the later aerodynamic-corpus work in #142. It contains the exact official NASA PDF, its exact NTRS metadata response, 59 deterministic source renders, 59 full-page lossless display crops, a content-addressed manifest, and a visual-QA index.

Run `npm run tp1538:sources:verify` without network access to verify the frozen bytes, corrected page inventory, rights/export decision, crop descriptors, hashes, and production isolation. Regeneration requires exactly `pdftoppm version 26.05.0`; run `npm run tp1538:sources:generate`, review `visual-qa.html`, and reject any byte change until its source and toolchain cause is independently adjudicated.

The manifest byte identity is externally pinned by the verifier as SHA-256 `d4736dae888054e502c34912374b8c032dd52f84414bc7e9137b9953acbe4e6b`. The verifier requires the exact root, source, source-render, and crop directory inventories, so unreferenced or replacement files fail closed. Production-source and built-bundle scans cover JavaScript, TypeScript, Rust, public assets, and emitted runtime files.

The governed mapping is PDF 8–12 (symbols/units/body axes), 42–46 (Appendix B), 49 (Table I), 51–97 (all of Table III), and 100 (body-axis figure). Printed report pages are PDF page minus six. The 59 crops are full-page images so table headings, notes, borders, and footnotes are not clipped. Several official scan pages are intrinsically upside down; the manifest preserves their source-render hashes and records the reviewed 180° lossless pixel rotation applied only to the upright display crop.

No numeric value in these pages is admitted by this directory. OCR, transcription, interpolation, coefficient assembly, propulsion, controls, runtime import, and named F-16 claims remain outside #143.
