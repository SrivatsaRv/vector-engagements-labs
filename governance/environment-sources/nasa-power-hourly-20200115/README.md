# NASA POWER hourly point-source snapshot

This directory is a small, committed **offline source artifact** for the
environment-ingestion contract. It does not make the current Phase A
environment pack sourced, and it does not provide geographic coverage for a
study area.

The two response files are exact JSON responses from the NASA POWER Hourly
Point API, queried for the two governed anchor points on 2020-01-15 in UTC.
They contain 24 source samples each for 2 m temperature, surface pressure,
2 m relative humidity, and 10 m wind speed/direction. The source provider
lists the response sources as MERRA2 and POWER.

NASA Earthdata says that NASA-led mission data are CC0 unless the individual
data carry a restrictive notice or licence. The POWER response contains no
restrictive notice. VECTOR records the source URL, retrieval timestamp,
licence decision, raw-byte SHA-256, horizontal datum declaration, point-only
coverage, temporal coverage, and the explicit vertical-datum limitation in the
adjacent manifest. NASA POWER and the access date must be cited in work based
on these artifacts.

The committed snapshot is intentionally point-only. It cannot source a
regional weather field, atmosphere aloft, terrain, geoid, runway elevation,
ground start, terrain collision, or terrain masking. The admission code fails
closed when an area-covering environment pack attempts to use it.

To reacquire a candidate artifact for review (not at runtime and not in a
simulation tick), use the exact query URLs recorded in `manifest.v1.json`.
Do not overwrite this version: publish a new immutable source version with
new checksums and review metadata.
