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

Mission, CAP-area, runway and flight-plan editors collapse to one column below
720 px, retain native labels and keyboard order, and never hide an admission
error or move Run ahead of validation.
Environment identity and base-availability text wrap without horizontal
overflow; unsupported installation markers remain visible but disabled.

- Construct always exposes its primary Next or Run action without horizontal scrolling.
- Desktop preserves the left step rail, central task surface, and right scenario summary.
- Phone removes the desktop rails instead of compressing them into unusable columns.
- MapLibre canvases must have a non-zero task-appropriate height at every class.
- QHD and 4K expand operational surfaces and control density; they do not merely add empty margins.
- Phone replay stacks telemetry and makes the simulation column vertically scrollable.
- The live 3D renderer observes its container, so orientation changes and panel reflow update the WebGL viewport without stretching or clipping.
- Landing copy, calls to action and live preview remain within the first natural reading sequence on small screens; no fixed hero height creates blank space.
- Report reading width remains bounded even when operational maps expand.
- Portalled transient controls remain inside the visual viewport and safe-area
  insets, avoid the sticky Construct action rail, and scroll internally without
  shifting the workspace.
- Blog editorial diagrams remain bounded at reading width on desktop. On phone,
  their full-resolution canvas scrolls inside the figure rather than shrinking
  technical labels below a readable size; the linked source image remains
  available for full-resolution inspection.

## Shared control and overlay contract

Map and 3D overlays share the same pack version/digest, datum and source-time
label. Loading or missing identity is explicit and does not substitute a default.

VECTOR has one presentation-only overlay coordinator at the application root.
Every custom Select, Menu, or Popover registers one trigger and one portalled
surface with that coordinator. At most one transient surface is open in the
workspace. A direct pointer, touch, or keyboard activation of a second trigger
closes the prior surface and opens the requested surface in the same action.
Outside press, Escape, selection, route removal, and trigger unmount close the
surface; Escape and selection return focus to its trigger. The coordinator owns
one stable document pointer, keyboard, and focus-boundary listener set rather
than installing listeners per feature or per open cycle.

The shared select uses the select-only ARIA combobox pattern: focus remains on
the labelled trigger, `aria-controls` binds it to a listbox, and
`aria-activedescendant` identifies the active option. The trigger's accessible
name includes both the field label and current value. Arrow, Home, End,
Enter/Space, Escape, Tab, and bounded typeahead behavior are covered by the
component contract. A stale authored identity is displayed as unavailable and
associated with an error; the first current option is never substituted.

The shared Menu follows the menu-button pattern: opening moves focus to the
first enabled menu item, Arrow/Home/End moves real item focus, and action or
Escape closes and returns focus. The shared non-modal Popover exposes a labelled
dialog, moves focus into its first interactive child (or the dialog itself), and
closes when focus leaves its trigger/surface boundary. These primitives use the
same coordinator and placement surface as Select; they cannot create a second
portal or focus-manager family.

Transient surfaces use one portal/placement policy. They remain at least eight
CSS pixels inside the visual viewport, flip above a trigger when necessary,
scroll internally, and do not move document layout. Coarse-pointer triggers and
options are at least 44×44 CSS pixels. Reduced motion removes nonessential
movement without altering state. These non-modal surfaces do not lock document
scroll or capture the pointer; their portal owns internal overscroll containment
and the coordinator owns outside-press behavior.

Persistent evidence and help use the shared Disclosure primitive. Multiple
Disclosures may remain open and do not participate in transient exclusivity.
Browser-owned native `select` is an explicit exception: it retains UA focus,
keyboard, touch, and popup behavior and carries
`data-vector-overlay-exempt="ua-native-select"`; VECTOR does not partially wrap
or attempt to coordinate the UA-owned option window.
The Air mission class, engagement regime, policy, recovery, start-posture,
runway-surface and flight-leg role controls deliberately use that complete
native exception. Each carries the same exemption marker, while aircraft,
weapon, origin and basemap identity pickers continue to use the shared Select;
the mission editor does not introduce another portal or overlay coordinator.

The affected interaction budget is open/direct-handoff p95 no greater than
100 ms with cumulative layout shift no greater than 0.05. A 100-cycle warm
stability check must retain one surface, show no coordinator-listener growth,
leave no detached portal after unmount, and keep post-GC heap growth within the
declared two-megabyte browser-test guard.

## Observe viewport shell

Saved report provenance now includes the compiled Air mission identity and both
digests without changing synchronized map/3D playback, telemetry, or timeline
ownership.
Observe presents the exact pack identity used by runtime and reports while
terrain/environment loading remains Worker-owned and cancellable.

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

Basemap is a shared transient Select. Layers, study-area context, and evidence
are persistent Disclosures; expanding any combination of them cannot alter the
recorded frame, selected playback time, map camera truth, or another
Disclosure's state.

## Automated proof

The governed five-viewport journey edits CAP defaults, clears and restores an
installation identity, authors a runway start, exercises keyboard route inputs,
observes admission, and completes the production Worker. Focused record tests
prove the same lineage survives report/VSR readback.
The browser matrix switches to Rajasthan, selects the eligible Jodhpur runway,
proves unsupported-point labelling, then completes a real Worker run across the
supported viewports without error overlays or overflow.

`npm run ui:responsive:verify` launches system Chrome at every viewport above.
It validates the landing hero and live 3D preview, map tiles and canvas size, start/base markers, base-origin mutation,
action size and placement, rail behavior, typography scaling, deployment-governed condition availability,
3D container resize behavior, playback and legend containment, telemetry layout, Rust/WASM provenance, entity rendering, page errors, and
horizontal overflow. Screenshots are written to the ignored
`outputs/responsive/` directory for visual inspection. The default command is
the release matrix. `VECTOR_RESPONSIVE_WIDTH` may select one width already in
that matrix for focused diagnosis; an unknown width fails closed, and a focused
run does not replace the default matrix at handoff.

The built-browser shared-overlay journey additionally exercises the required
390×844, 768×1024, 1366×768, 1440×900, and 1920×1080 fast matrix. It proves
one-click aircraft-to-weapon, Blue-to-Red-origin, and origin-to-basemap handoff;
ARIA/focus ownership; coarse-pointer target size; visual-viewport containment;
200% page-scale containment; route cleanup; p95/CLS; and post-GC stability.

`npm run blog:visual:verify` separately validates the two high-resolution blog
editorial diagrams at 1440×900 and 390×844. It proves asset dimensions,
full-resolution links, five remaining Mermaid renders, desktop fit, contained
phone scrolling, page overflow, and browser errors; screenshots are written to
the ignored `outputs/blog-editorial/` directory.
