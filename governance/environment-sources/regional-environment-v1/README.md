# Regional environment source freeze

This directory is the immutable public-educational source boundary for
`vector.environment-pack.v1` regional packs. `source-selection.v1.json` records
the reviewed source, licence, datum, resolution, retrieval and limitation
decisions. `manifest.v1.json`, raw source responses, the normalized
`compiled.v1.json`, and `governance/installation-catalogue.v2.json` are produced
by the explicit offline refresh mode in
`scripts/verify-environment-source-assets.mjs`.

Runtime and Worker code consume only the committed normalized artifact. They do
not download terrain, weather, installation, or runway data. ETOPO and
OurAirports are not navigation or current operational-status evidence. NASA
POWER surface fields are not an atmosphere-aloft observation; the admitted
vertical profile is a separately labelled derived model with a bounded validity
envelope.
