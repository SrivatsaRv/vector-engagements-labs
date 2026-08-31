# Product language and visual semantics

## Mission-set taxonomy

Target-effect labels describe the canonical model result, not real-world
effectiveness: “no modeled effect”, “target degraded”, “mission-disabled”,
“model-recorded terminal effect”, or “effect unavailable”. The word “kill” is
authorized only by a canonical `KILL` commit whose exact event frame records the
target `TERMINATED`; every admitted generic result displays `MODEL_ASSUMPTION`.

VECTOR keeps the compact A2A/A2G/G2A/G2G identifiers for scanning, but gives each one a plain-language mission-set name:

| Code | UI name                | Training scope                                                    |
| ---- | ---------------------- | ----------------------------------------------------------------- |
| A2A  | Air Intercept          | Airborne intercept geometry, timing, and energy-state sensitivity |
| A2G  | Air-to-Surface         | Airborne approach geometry against a synthetic surface objective  |
| G2A  | Surface-to-Air Defence | Point and layered air-defence training problems                   |
| G2G  | Surface Strike         | Surface-to-surface trajectory comparisons                         |

These labels are intentionally narrower than operational doctrine. VECTOR is a public-data educational model and does not claim to simulate the full counterair, counterland, strategic-attack, or targeting processes. UI copy names the configured platform, weapon, target, and information state whenever the catalog contains them; “abstract profile” is not used as a substitute for incomplete data.

The scenario library contains nine governed entries. Its third A2A entry is the
non-default **High-energy crossing challenge: Su-30MKI versus F-16C**. The title
describes the authored aircraft identities and geometry; it does not promote the
anonymous assumption model pack into named-platform performance evidence or
describe its 25 m verification-only geometric intercept as target damage, a
kill, probability of kill, or named-weapon effectiveness. Product copy uses
“geometric intercept” only when the engine emitted the typed terminal event and
must show that target effect is not modelled. Miss, flight-time expiry and
terrain failure each use their causal terminal reason; none may fall through to
copy claiming that the scenario reached its model-time limit.

`RELEASE` and `JETTISON` describe only the generic public-educational lifecycle
selected by authored intent. They do not imply safe separation, emergency
procedure fidelity, named-aircraft/store carriage, or weapon effectiveness.
Outcome copy always distinguishes requested, accepted and achieved and shows the
typed limiter/cause when an operational request is rejected.

Transient Select, Menu, and Popover labels name the field and current choice;
persistent evidence/help is labelled as a Disclosure. These interaction terms
describe presentation state only and never imply a new mission, admission, or
simulation capability.

## Color meaning

Affiliation and state colors must not be interchangeable:

- Friendly affiliation: blue.
- Hostile/opposing affiliation: red.
- Validated, ready, or successful state: green.
- Assumption, caution, or prepared training fault: amber.
- Reference geometry, inactive layers, and non-affiliated context: grey.
- Profile sensitivity series may use orange, blue, and violet only inside an explicitly labeled comparison.

This is a simplified application of public joint symbology conventions. NATO APP-06 Edition E identifies blue as friendly and red as hostile for color systems. MIL-STD-2525D likewise assigns blue to friend/assumed friend and red to hostile/suspect. VECTOR does not claim full APP-06 or MIL-STD-2525 implementation; shape, frame, echelon, status, and modifier coverage remain out of scope for this cut.

## Source references

- [NATO Standardization Office, _APP-06 NATO Joint Military Symbology_, Edition E, Version 1, October 2023](https://coi.nato.int/EWCOI/EW%20COI%20Shared%20Documents/WGs/NEWWG/EW%20Info%20Exchange%20Requirements%20Panel%20%28IERP%29/01_Governing%20Documents/Publications/APP-06%20NATO%20Symbology/APP-06%20EDE%20V1%20E.pdf).
- [United States Department of Defense, _MIL-STD-2525D Joint Military Symbology_](https://www.trngcmd.marines.mil/Portals/207/Docs/TBS/MIL-STD-2525D%20Joint%20Military%20Symbology.pdf).
- [United States Air Force, _AFDP 3-01 Counterair Operations_](https://www.doctrine.af.mil/Doctrine-Publications/AFDP-3-01-Counterair-Ops/) and the doctrine publication index for counterair, counterland, and strategic attack terminology.
