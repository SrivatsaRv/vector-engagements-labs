import Link from "next/link";
import { Disclosure } from "@/components/ui/OverlayPrimitives";

import {
  findPlatform,
  findWeapon,
  getSource,
  getSubsystem,
  type DataStatus,
} from "@/lib/capability-data";

function displayStatus(status: DataStatus | undefined) {
  if (status === "CONTEXT_ONLY") return "CONTEXT ONLY";
  return status ?? "UNKNOWN";
}

export function PlatformEvidence({ platformId }: { platformId: string }) {
  const platform = findPlatform(platformId);
  if (!platform) return null;
  const engineRecords = platform.engineIds
    .map((id) => getSubsystem(id))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
  const engineNames = [...new Set(engineRecords.map((item) => item.designation))];
  const engineStatus = engineRecords.length > 0 && engineRecords.every((item) => item.status === engineRecords[0].status)
    ? engineRecords[0].status
    : "UNKNOWN";
  const systemRows = [
    {
      id: "engine",
      label: "Engine",
      value: engineNames.length
        ? `${platform.engineIds.length} × ${engineNames.join(" / ")}`
        : "Not established",
      status: engineStatus,
    },
    {
      id: "radar",
      label: "Radar",
      value: getSubsystem(platform.radarId)?.designation ?? "Not established",
      status: getSubsystem(platform.radarId)?.status ?? "UNKNOWN",
    },
    {
      id: "defensive-ew",
      label: "Defensive EW",
      value: getSubsystem(platform.ewId)?.designation ?? "Not established",
      status: getSubsystem(platform.ewId)?.status ?? "UNKNOWN",
    },
    {
      id: "data-link",
      label: "Data link",
      value: getSubsystem(platform.datalinkId)?.designation ?? "Not established",
      status: getSubsystem(platform.datalinkId)?.status ?? "UNKNOWN",
    },
  ];
  const sourceLinks = platform.sourceIds.map(getSource).filter(Boolean);
  const teachingDefaults = platform.defaultLoadout.map((item) => ({
    ...item,
    designation: findWeapon(item.weaponId)?.designation ?? item.weaponId,
  }));
  return (
    <Disclosure
      className="platform-systems"
      summary={
        <>
        Aircraft evidence <span>{platform.status}</span>
        </>
      }
    >
      <dl>
        {systemRows.map((item) => (
          <div key={item.id} data-testid={`platform-system-${item.id}`}>
            <dt>{item.label}</dt>
            <dd>{item.value}</dd>
            <small>{displayStatus(item.status)}</small>
          </div>
        ))}
      </dl>
      <div className="platform-facts">
        {platform.publicFacts.map((fact) => (
          <div key={fact.label}>
            <span>{fact.label}</span>
            <strong>{fact.value}</strong>
            <em>{displayStatus(fact.status)}</em>
          </div>
        ))}
        {teachingDefaults.map((item) => (
          <div key={item.weaponId} data-testid="platform-default-loadout">
            <span>Teaching default</span>
            <strong>{item.quantity} × {item.designation}</strong>
            <em>{displayStatus(item.status)}</em>
          </div>
        ))}
      </div>
      <p className="platform-evidence-limitation">
        Named-aircraft performance remains unsupported. Context-only associations do not supply
        flight, sensor, weapon, station, loadout, or mission authority.
      </p>
      {sourceLinks.length > 0 && (
        <footer>
          {sourceLinks.map((source) => (
            <Link
              key={source!.id}
              href={source!.url}
              target="_blank"
              rel="noreferrer"
            >
              {source!.publisher}
              {source!.evidenceUse === "INELIGIBLE" ? " · ineligible" : " · context"}
            </Link>
          ))}
        </footer>
      )}
    </Disclosure>
  );
}
