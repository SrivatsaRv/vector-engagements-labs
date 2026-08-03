# Responsive UI contract

VECTOR sizes the interface from the usable CSS viewport, not the advertised
monitor diagonal. Browser zoom remains at 100%; the application does not use a
page transform or synthetic zoom to make layouts fit.

## Supported viewport classes

| Class | Validation viewports | Intended behavior |
| --- | --- | --- |
| Phone | 390×844, 430×932 | Single-column Construct and replay; desktop rails are removed; primary actions remain persistent; map, controls and all six telemetry plots remain reachable by vertical scrolling. |
| Laptop | 1280×720, 1366×768, 1440×900, 1536×864 | Persistent step rail, task canvas and scenario summary; compact telemetry; no horizontal workflow scrolling. |
| Full HD | 1920×1080 | Three-panel operational workspace with a bounded reading width and expanded map surface. |
| QHD / typical 27-inch | 2560×1440 | Wider 1,640-pixel task surface, larger rails, controls, typography, tactical symbols, map and telemetry. |
| 4K / TV | 3840×2160 | 2,480-pixel task surface and presentation-density controls; reading copy stays bounded while maps and telemetry consume the additional resolution. |

Physical 21-, 24-, and 27-inch screens can expose the same CSS viewport, so
their diagonal size is not a reliable layout input. Device pixel ratio affects
rendering sharpness; viewport width and height govern task geometry.

## Behavioral rules

- Construct always exposes its primary Next or Run action without horizontal scrolling.
- Desktop preserves the left step rail, central task surface, and right scenario summary.
- Phone removes the desktop rails instead of compressing them into unusable columns.
- MapLibre canvases must have a non-zero task-appropriate height at every class.
- QHD and 4K expand operational surfaces and control density; they do not merely add empty margins.
- Phone replay stacks telemetry and makes the simulation column vertically scrollable.
- Report reading width remains bounded even when operational maps expand.

## Automated proof

`npm run ui:responsive:verify` launches system Chrome at every viewport above.
It validates map tiles and canvas size, start/base markers, base-origin mutation,
action size and placement, rail behavior, typography scaling, RASP ownership,
telemetry layout, Rust/WASM provenance, entity rendering, page errors, and
horizontal overflow. Screenshots are written to the ignored
`outputs/responsive/` directory for visual inspection.
