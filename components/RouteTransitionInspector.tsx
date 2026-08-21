import type { RouteTransitionState } from "@/lib/frontend/selectors";

type Props = {
  transitions: readonly RouteTransitionState[];
};

const unavailableCopy: Record<Extract<RouteTransitionState, { state: "UNAVAILABLE" }>["reason"], string> = {
  ROUTE_NOT_COMPILED: "Compiled route unavailable",
  ROUTE_CONTROL_NOT_RECORDED: "Route control unavailable",
  ROUTE_POINT_NOT_RECORDED: "Active route point unavailable",
  ROUTE_TRANSITION_NOT_RECORDED: "Transition declaration unavailable",
};

/** Presentation-only view of the route state already selected from one VSR frame. */
export function RouteTransitionInspector({ transitions }: Props) {
  const displayTime = transitions[0]?.displayTimeSeconds;
  const frameIndex = transitions[0]?.frameIndex;
  return (
    <section
      className="route-transition-inspector"
      aria-label="Route transition state"
      data-display-time={displayTime}
      data-frame-index={frameIndex}
    >
      <header>
        <span>Route transition</span>
        <small>Recorded frame</small>
      </header>
      {transitions.length === 0 ? (
        <p className="route-transition-unavailable">No aircraft route is recorded.</p>
      ) : transitions.map((transition) => (
        <article key={transition.entityId} data-route-state={transition.state}>
          <strong>{transition.designation}</strong>
          {transition.state === "ACTIVE" ? (
            <>
              <span>
                Waypoint {transition.waypointIndex + 1} of {transition.waypointCount}
              </span>
              <b>{transition.transition === "FLY_BY" ? "Fly-by" : "Fly-over"}</b>
              <p>
                {transition.transition === "FLY_BY"
                  ? `Declared capture radius ${transition.acceptanceRadiusM?.toFixed(0) ?? "unavailable"} m.`
                  : "Pass-through transition; compiled fly-over sentinel is 1 m."}
              </p>
              {transition.limiter !== "NONE" && (
                <em>Controller: {transition.limiter.toLowerCase().replaceAll("_", " ")}</em>
              )}
              {transition.semantics === "LEGACY_ALL_FLY_BY" && (
                <em>Legacy v1 record: all route transitions are fly-by.</em>
              )}
            </>
          ) : transition.state === "COMPLETE" ? (
            <p>
              Route complete after {transition.waypointCount} recorded route points.
              {transition.semantics === "LEGACY_ALL_FLY_BY" ? " Legacy v1 uses all-fly-by semantics." : ""}
            </p>
          ) : (
            <p className="route-transition-unavailable">{unavailableCopy[transition.reason]}</p>
          )}
        </article>
      ))}
    </section>
  );
}
