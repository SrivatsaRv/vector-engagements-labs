# Responsive UI contract

VECTOR sizes the interface from the usable CSS viewport, not the advertised
monitor diagonal. Browser zoom remains at 100%; the application does not use a
page transform or synthetic zoom to make layouts fit.

## Supported viewport classes

| Class | Validation viewports | Intended behavior |
| --- | --- | --- |
| Phone | 320×568, 390×844, 430×932 | Single-column Construct and replay; desktop rails are removed; primary actions remain persistent; the 3D/map surface, wrapped playback controls and all six telemetry plots remain reachable by vertical scrolling. |
| Tablet | 768×1024, 1024×768 | Tablet composition preserves usable authoring context, a full-width simulation surface and touch-sized controls without inheriting either phone crowding or desktop rail widths. |
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
- The live 3D renderer observes its container, so orientation changes and panel reflow update the WebGL viewport without stretching or clipping.
- Landing copy, calls to action and live preview remain within the first natural reading sequence on small screens; no fixed hero height creates blank space.
- Report reading width remains bounded even when operational maps expand.
- Blog editorial diagrams remain bounded at reading width on desktop. On phone,
  their full-resolution canvas scrolls inside the figure rather than shrinking
  technical labels below a readable size; the linked source image remains
  available for full-resolution inspection.

## Observe viewport shell

The Observe workspace uses one centre-column grid. The Map or 3D surface owns
the remaining row after the control strip and playback rail; it does not own a
fixed height. Synchronized telemetry is collapsed by default for a browser
session and expands only on request. Its visibility is presentation state, not
scenario or record state, so it cannot change playback time, frame identity or
saved output.

| Slot | Content | Compact rule |
| --- | --- | --- |
| North-west | Navigation and basemap controls | Fixed safe inset and touch-sized controls |
| North-east | Fit run and study-area extent | Surface-scoped controls only |
| South-west | Layer legend | Summary first; available layers are disclosed on request |
| South-east | Camera readout and MapLibre attribution | Attribution remains visible; context moves to Info |
| Lower right | Study-area limitation and help | Compact Info disclosure; no permanent prose banner |

Entity labels use a deterministic priority: engaging entity, guided weapon,
then aircraft, with stable ID order as the tie-breaker. The highest-priority
labels use bounded leader offsets; lower-priority labels compact while their
symbols, affiliation frame and browser title remain available. The renderer
does not infer tactical relevance beyond canonical lifecycle and kind.

MapLibre and Three.js observe committed container dimensions. A telemetry
transition therefore reallocates the canvas row while preserving camera/extent
unless the operator explicitly chooses Fit. Reduced-motion preference removes
nonessential marker transitions.

## Automated proof

`npm run ui:responsive:verify` launches system Chrome at every viewport above.
It validates the landing hero and live 3D preview, map tiles and canvas size, start/base markers, base-origin mutation,
action size and placement, rail behavior, typography scaling, RASP ownership,
3D container resize behavior, playback and legend containment, telemetry layout, Rust/WASM provenance, entity rendering, page errors, and
horizontal overflow. Screenshots are written to the ignored
`outputs/responsive/` directory for visual inspection.

`npm run blog:visual:verify` separately validates the two high-resolution blog
editorial diagrams at 1440×900 and 390×844. It proves asset dimensions,
full-resolution links, five remaining Mermaid renders, desktop fit, contained
phone scrolling, page overflow, and browser errors; screenshots are written to
the ignored `outputs/blog-editorial/` directory.
