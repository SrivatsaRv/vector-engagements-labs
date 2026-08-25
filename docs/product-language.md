# Product language and visual semantics

## Mission-set taxonomy

VECTOR keeps the compact A2A/A2G/G2A/G2G identifiers for scanning, but gives each one a plain-language mission-set name:

| Code | UI name                | Training scope                                                    |
| ---- | ---------------------- | ----------------------------------------------------------------- |
| A2A  | Air Intercept          | Airborne intercept geometry, timing, and energy-state sensitivity |
| A2G  | Air-to-Surface         | Airborne approach geometry against a synthetic surface objective  |
| G2A  | Surface-to-Air Defence | Point and layered air-defence training problems                   |
| G2G  | Surface Strike         | Surface-to-surface trajectory comparisons                         |

These labels are intentionally narrower than operational doctrine. VECTOR is a public-data educational model and does not claim to simulate the full counterair, counterland, strategic-attack, or targeting processes. UI copy names the configured platform, weapon, target, and information state whenever the catalog contains them; “abstract profile” is not used as a substitute for incomplete data.

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
