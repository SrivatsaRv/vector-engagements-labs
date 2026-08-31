import type { CanonicalReportDebrief } from "@/lib/report-debrief";

function number(value: number, digits = 1) {
  return value.toFixed(digits);
}

function exactNumber(value: number) {
  return String(value);
}

function pointText(point: {
  longitude: number;
  latitude: number;
  altitudeM: number;
  verticalDatum: "MSL";
}) {
  return `${exactNumber(point.latitude)}° latitude, ${exactNumber(point.longitude)}° longitude · ${exactNumber(point.altitudeM)} m ${point.verticalDatum}`;
}

function aircraftGeometryText(geometry: {
  frameIndex: number;
  modelTimeSeconds: number;
  rangeM: number;
  closureRateMps: number;
  blueAltitudeMslM: number;
  redAltitudeMslM: number;
}) {
  return `frame ${geometry.frameIndex} · ${number(geometry.modelTimeSeconds, 3)} s · range ${number(geometry.rangeM, 3)} m · closure ${number(geometry.closureRateMps, 3)} m/s · Blue altitude ${number(geometry.blueAltitudeMslM, 3)} m MSL · Red altitude ${number(geometry.redAltitudeMslM, 3)} m MSL`;
}

export function CanonicalReportDebrief({
  debrief,
}: {
  debrief: CanonicalReportDebrief;
}) {
  const effectProjection = debrief.targetEffect.projection;
  return (
    <section
      className="report-section"
      aria-label="Canonical run debrief"
      data-effect-event-id={debrief.targetEffect.eventId ?? "UNAVAILABLE"}
      data-effect-frame-index={"frameIndex" in effectProjection ? effectProjection.frameIndex : undefined}
      data-effect-time={"modelTimeSeconds" in effectProjection ? effectProjection.modelTimeSeconds : undefined}
      data-effect-class={debrief.targetEffect.presentation.effectClass ?? "NONE"}
    >
      <h2>Canonical run debrief</h2>
      {debrief.profile && (
        <div
          data-testid="report-authored-route-profile"
          data-profile-applicability={debrief.profile.applicability}
        >
          <p>
            <strong>{debrief.profile.label}</strong>{" "}
            <span>
              {debrief.profile.id} · {debrief.profile.authority}
              {` · ${debrief.profile.applicability}`}
              {debrief.profile.regime ? ` · ${debrief.profile.regime}` : ""}
            </span>
          </p>
          {debrief.profile.applicability === "MATCHED" ? (
            <dl>
              {debrief.routeLegs.map((leg) => (
                <div key={`${leg.affiliation}-${leg.legIndex}`}>
                  <dt>{leg.affiliation} leg {leg.legIndex + 1}</dt>
                  <dd>
                    {leg.authoredIntent}
                    {leg.compiledRole ? ` · compiled role ${leg.compiledRole}` : ""}
                    {leg.transitionMethod ? ` · ${leg.transitionMethod}` : ""}
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <p data-testid="report-profile-leg-intent-qualification">
              Source-profile leg intents are not asserted because the current
              causal inputs do not exactly match the retained profile basis.
            </p>
          )}
          {debrief.profile.limitations.map((limitation) => (
            <p key={limitation}>{limitation}</p>
          ))}
        </div>
      )}

      <p data-testid="report-canonical-effect-explanation">{debrief.explanation}</p>

      <div
        className="report-causal-inputs"
        data-testid="report-exact-causal-inputs"
        data-duration-authority={debrief.causalInputs.duration.authority}
      >
        <h3>Exact causal inputs</h3>
        <dl className="report-causal-summary">
          <dt>Run duration</dt>
          <dd>
            {exactNumber(debrief.causalInputs.duration.valueSeconds)} s ·{" "}
            {debrief.causalInputs.duration.authority}
            {!debrief.causalInputs.duration.authoredFieldPresent
              ? " · authored field omitted"
              : ""}
          </dd>
          <dt>Guidance / regime</dt>
          <dd>
            {debrief.causalInputs.guidance} / {debrief.causalInputs.regime ?? "Not applicable"}
          </dd>
          <dt>Mission start</dt>
          <dd>{debrief.causalInputs.missionStart?.posture ?? "Not available"}</dd>
          <dt>Blue compiled leg roles</dt>
          <dd>
            {debrief.causalInputs.blueFlightLegs.length === 0
              ? "No authored Blue flight legs"
              : debrief.causalInputs.blueFlightLegs.map((leg) => leg.role).join(" → ")}
          </dd>
          <dt>Authored store transfer</dt>
          <dd>
            {debrief.causalInputs.releaseRequests.length === 0
              ? "No authored release or jettison request"
              : debrief.causalInputs.releaseRequests.map((request) =>
                  `${request.operation} ${request.storeEntityId} at ${exactNumber(request.requestedTimeSeconds)} s · ${request.requestId}`
                ).join("; ")}
          </dd>
        </dl>
        {(["BLUE", "RED"] as const).map((affiliation) => {
          const side = debrief.causalInputs.sides[affiliation];
          return (
            <div
              className="report-causal-side"
              data-affiliation={affiliation}
              key={affiliation}
            >
              <h4>{affiliation} authored start and route</h4>
              {side ? (
                <>
                  <p>
                    Start {pointText(side.start.position)} · heading{" "}
                    {exactNumber(side.start.headingDeg)}° · TAS{" "}
                    {exactNumber(side.start.tasMps)} m/s
                  </p>
                  <ol>
                    {side.route.map((point) => (
                      <li key={point.index}>
                        <strong>Point {point.index + 1}</strong>{" "}
                        {pointText(point.position)} · {point.transition} · acceptance{" "}
                        {exactNumber(point.acceptanceRadiusM)} m
                      </li>
                    ))}
                  </ol>
                  <small>{side.routeSemantics}</small>
                </>
              ) : (
                <p>No authored spatial plan retained.</p>
              )}
            </div>
          );
        })}
      </div>

      <section
        className="report-canonical-geometry"
        data-testid="report-canonical-geometry"
        data-authored-transition-state={debrief.authoredTransitionGeometry?.state ?? "NOT_APPLICABLE"}
      >
        <h3>Recorded geometry proof</h3>
        <dl>
          <dt>Weapon world-entry / launch frame</dt>
          <dd data-testid="report-launch-geometry">
            {debrief.launch
              ? `${debrief.launch.relationship} · ${aircraftGeometryText(debrief.launch)} · ${debrief.launch.eventId}`
              : "No unique recorded weapon world-entry frame geometry"}
          </dd>
          <dt>Closest active-aircraft approach</dt>
          <dd data-testid="report-closest-aircraft-approach">
            {debrief.closestAircraftApproach
              ? `AIRCRAFT_TO_AIRCRAFT · ${aircraftGeometryText(debrief.closestAircraftApproach)}`
              : "No retained frame contains two active aircraft for comparison"}
          </dd>
          {debrief.authoredTransitionGeometry && (
            <>
              <dt>Initial authored INTERCEPT leg</dt>
              <dd data-testid="report-initial-commit-geometry">
                {debrief.authoredTransitionGeometry.initialCommit
                  ? aircraftGeometryText(debrief.authoredTransitionGeometry.initialCommit)
                  : "No retained active-aircraft frame reached the authored INTERCEPT leg"}
              </dd>
              <dt>Authored RECOMMIT leg</dt>
              <dd
                data-testid="report-recommit-geometry"
                data-recording-state={debrief.authoredTransitionGeometry.recommit ? "RECORDED" : "UNAVAILABLE"}
              >
                {debrief.authoredTransitionGeometry.recommit
                  ? aircraftGeometryText(debrief.authoredTransitionGeometry.recommit)
                  : "No retained active-aircraft frame reached the authored RECOMMIT leg"}
              </dd>
            </>
          )}
          <dt>Final aircraft separation</dt>
          <dd data-testid="report-final-aircraft-separation">
            {debrief.finalAircraftSeparationM == null
              ? "Unavailable"
              : `${number(debrief.finalAircraftSeparationM, 3)} m`}
          </dd>
        </dl>
        <small>
          These values are derived only from retained canonical frames and typed
          events. Authored leg names describe an exactly matched route profile;
          they are not autonomous-pilot choices or named-system effectiveness.
        </small>
      </section>

      <dl data-testid="report-recorded-causal-facts">
        <dt>Weapon entered world</dt>
        <dd>
          {debrief.launch
            ? `${debrief.launch.weaponId} · ${number(debrief.launch.modelTimeSeconds, 3)} s · ${debrief.launch.eventId}`
            : "No unique recorded weapon world-entry event"}
        </dd>
        <dt>Weapon termination</dt>
        <dd>
          {debrief.weaponTermination
            ? `${debrief.weaponTermination.terminalState} · ${debrief.weaponTermination.cause} · ${number(debrief.weaponTermination.modelTimeSeconds, 3)} s · closest approach ${number(debrief.weaponTermination.closestApproachM, 3)} m`
            : "No unique recorded primary-weapon termination event"}
        </dd>
        <dt>Primary-weapon recorded flight states</dt>
        <dd data-testid="report-weapon-flight-state-timeline">
          {debrief.weaponFlightStates.length === 0
            ? "No recorded primary-weapon flight state"
            : debrief.weaponFlightStates.map((transition) =>
                `${transition.state} at ${number(transition.modelTimeSeconds, 3)} s · frame ${transition.frameIndex}`
              ).join("; ")}
        </dd>
        <dt>Observer / track availability</dt>
        <dd data-testid="report-observer-track-availability">
          {debrief.observerStates.length === 0
            ? "No recorded observer state"
            : debrief.observerStates.map((observer) => observer.trackState == null
                ? `${observer.perspective}: sensor ${observer.sensorState} · tracks ${observer.trackCount ?? 0} · visible ${observer.visibleTrackCount ?? 0} · ${observer.availabilityReason} at ${number(observer.modelTimeSeconds, 3)} s`
                : `${observer.perspective}: sensor ${observer.sensorState} · track ${observer.trackState} · ${observer.availabilityReason} at ${number(observer.modelTimeSeconds, 3)} s`
              ).join("; ")}
        </dd>
        <dt>Target effect event</dt>
        <dd>
          {debrief.targetEffect.eventId &&
          "modelTimeSeconds" in debrief.targetEffect.projection
            ? `${debrief.targetEffect.presentation.effectClass ?? debrief.targetEffect.presentation.state} · ${number(debrief.targetEffect.projection.modelTimeSeconds, 3)} s · frame ${debrief.targetEffect.projection.frameIndex} · ${debrief.targetEffect.eventId}`
            : `${debrief.targetEffect.presentation.state} · no canonical effect event identity`}
        </dd>
        <dt>Final aircraft separation</dt>
        <dd>
          {debrief.finalAircraftSeparationM == null
            ? "Unavailable"
            : `${number(debrief.finalAircraftSeparationM, 3)} m`}
        </dd>
        <dt>Recorded route-index changes</dt>
        <dd>
          {debrief.achievedRouteTransitions.length === 0
            ? "None in retained frames"
            : debrief.achievedRouteTransitions.map((transition) =>
                `${transition.affiliation} ${transition.fromRoutePointIndex}→${transition.toRoutePointIndex} at ${number(transition.modelTimeSeconds, 3)} s`
              ).join("; ")}
        </dd>
      </dl>

      {debrief.aircraft.map((aircraft) => (
        <dl key={aircraft.entityId} data-testid={`report-aircraft-state-${aircraft.affiliation.toLowerCase()}`}>
          <dt>{aircraft.affiliation} aircraft</dt>
          <dd>{aircraft.designation} · {aircraft.entityId}</dd>
          <dt>Initial fuel / mass / installed stores</dt>
          <dd>
            {number(aircraft.initial.fuelKg, 3)} kg / {number(aircraft.initial.massKg, 3)} kg /{" "}
            {aircraft.initial.installedStoreIds.join(", ") || "none"}
          </dd>
          <dt>Final fuel / mass / installed stores</dt>
          <dd>
            {number(aircraft.final.fuelKg, 3)} kg / {number(aircraft.final.massKg, 3)} kg /{" "}
            {aircraft.final.installedStoreIds.join(", ") || "none"} · {aircraft.final.lifecycle}
          </dd>
        </dl>
      ))}

      {debrief.storeTransfers.length > 0 && (
        <dl data-testid="report-debrief-store-transfers">
          {debrief.storeTransfers.map((transfer) => (
            <div key={transfer.eventId}>
              <dt>{transfer.storeId} · {number(transfer.modelTimeSeconds, 3)} s</dt>
              <dd>
                {transfer.operation} · accepted {String(transfer.accepted)} · achieved{" "}
                {String(transfer.achieved)} · {transfer.cause} · {transfer.eventId}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
