import { CircleAlert } from "lucide-react";

import type { RunInformationCapabilitySummary } from "@/lib/frontend/information-capability";

export function RunInformationCapabilityNotice({
  capabilities,
}: {
  capabilities: RunInformationCapabilitySummary;
}) {
  return (
    <section className="configured-note" role="status">
      <CircleAlert size={16} />
      <div>
        <strong>This run has no tactical information or autonomous pilot model.</strong>
        <p>
          Both aircraft execute their authored routes. Blue has one explicit
          store-release request; Red carries recorded loadout inventory but does
          not decide, defend in response to a detection, or launch AIM-120.
        </p>
        <dl>
          <dt>Sensors and tracks</dt>
          <dd>{capabilities.sensors.reason}</dd>
          <dt>Data link</dt>
          <dd>{capabilities.datalink.reason}</dd>
          <dt>Electronic warfare</dt>
          <dd>{capabilities.ew.reason}</dd>
          <dt>Virtual pilot</dt>
          <dd>{capabilities.virtualPilot.reason}</dd>
        </dl>
      </div>
    </section>
  );
}
