# Work item 09: ACMI interoperability and debrief

Priority: P2

Depends on: implemented VECTOR Simulation Record

Blocks: Tacview interoperability and shared debrief workflows

## Outcome

Every completed VECTOR run can be exported as a standards-conformant ACMI 2.2 projection for Tacview while the richer VECTOR Simulation Record remains the canonical replay and report source.

## Product boundary

Historical Air Combat Maneuvering Instrumentation records time-space-position and engagement data for post-flight debrief. Tacview's `.acmi` format is a public telemetry and replay interchange inspired by that workflow.

ACMI is useful for:

- opening VECTOR trajectories in Tacview;
- comparing visual and telemetry interpretation across tools;
- exchanging time-addressed entity state;
- debriefing one recorded run;
- later, receiving external recordings for replay-only analysis.

ACMI is not suitable as:

- the object-model library;
- the scenario-authoring package;
- the source of aerodynamic or sensor coefficients;
- enough information to rerun physics;
- the only location for VECTOR model versions, uncertainty, sources, and causal events.

## Export scope

Export only values produced by the engine or record:

- stable object ID;
- timestamp;
- WGS84 longitude, latitude, altitude, and orientation;
- type, designation, callsign, coalition, and color;
- lifecycle and launch timing;
- TAS, Mach, angle of attack, g, fuel, throttle, and other telemetry only when recorded;
- declared events and annotations supported by the format.

Do not insert Tacview-calculated fallback values into the VECTOR record as if they came from the engine.

## Sampling policy

The VSR remains lossless for the VECTOR analysis contract. ACMI export may use change-only fields, declared precision, and object-class-specific sampling because the viewer interpolates samples. The exporter records its policy and never mutates the canonical frames.

Tacview's public [real-time protocol](https://raia-software-inc.gitbook.io/tacview/technical-documentation/real-time-telemetry-public-protocol), [formula rules](https://raia-software-inc.gitbook.io/tacview/technical-documentation/formulas), and [data-size optimization guidance](https://raia-software-inc.gitbook.io/tacview/technical-documentation/data-size-optimization-2) define the compatibility target.

## Debrief model

VECTOR falls on the analysis and debrief side, not live range instrumentation or pilot qualification.

A later synchronized debrief may share:

- record digest and compatibility check;
- model time and playback state;
- camera and selection state;
- annotations and decision markers.

Each participant must have the same VSR or ACMI recording. The host should not stream physics or silently replace missing terrain and model assets.

## Acceptance criteria

- A completed run exports a valid ACMI 2.2 file with stable identities and correct launch timing.
- Pre-launch inventory does not appear as an airborne weapon.
- WGS84 position and altitude match the VSR within declared export tolerance.
- Exported files open in the supported Tacview version and preserve basic entity, trail, callsign, coalition, and event behavior.
- Downsampling changes only display sampling, not canonical results.
- ACMI import, when added, creates a replay record and never a runnable scenario without an explicit reconstruction workflow.
- Real-time streaming remains disabled until a separate security, resource, and product review.

## Tests

- Golden ACMI conformance files.
- Tacview open and visual inspection checklist.
- Launch, termination, static object, and missing-optional-telemetry fixtures.
- Coordinate, orientation, unit, escaping, and timestamp boundaries.
- Export size and time for 1, 10, and 100 entities.
- VSR-to-ACMI-to-view comparison without mutating VSR hashes.

## Non-goals

- Replacing VSR with ACMI.
- Reconstructing flight controls or intent from an arbitrary track file.
- Live multiplayer telemetry in the first release.
