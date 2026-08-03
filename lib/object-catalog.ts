import type { TacticalSymbolRole } from "./engine/contracts.ts";
import type { EngagementDomain, ProfileId } from "./engine/primitives.ts";

export type ObjectKind = "AIRCRAFT" | "GUIDED_WEAPON" | "AIR_DEFENCE_SYSTEM" | "RADAR" | "SURFACE_LAUNCHER" | "FIXED_SITE";

export type CatalogObject = {
  id: string;
  designation: string;
  name: string;
  kind: ObjectKind;
  symbolRole: TacticalSymbolRole;
  country: string;
  description: string;
  domains: EngagementDomain[];
  modelProfile?: ProfileId;
  dataState: "PUBLIC_REFERENCE" | "USER_DEFINED";
  service?: "IAF" | "PAF" | "OTHER";
  sourceIds?: string[];
};

export const OBJECT_CATALOG: CatalogObject[] = [
  { id: "su-30mki", designation: "Su-30MKI", name: "Multirole fighter", kind: "AIRCRAFT", symbolRole: "FIGHTER", country: "India", description: "IAF twin-engine multirole combat aircraft. Astra integration and engine association are source-backed; several fitted-subsystem details remain incomplete.", domains: ["A2A", "A2G"], dataState: "PUBLIC_REFERENCE", service: "IAF", sourceIds: ["pib-astra-contract-2022", "pib-su30-engine-2024"] },
  { id: "mirage-2000h", designation: "Mirage 2000H", name: "Multirole fighter", kind: "AIRCRAFT", symbolRole: "FIGHTER", country: "India", description: "IAF single-engine multirole combat aircraft. Detailed variant research is not complete in this catalog release.", domains: ["A2A", "A2G"], dataState: "PUBLIC_REFERENCE", service: "IAF" },
  { id: "f-16c-block52-paf", designation: "F-16C Block 52", name: "Fighting Falcon", kind: "AIRCRAFT", symbolRole: "FIGHTER", country: "Pakistan", description: "PAF Block 52 fighter configuration with source-backed engine, radar, defensive-EW, and data-link associations.", domains: ["A2A", "G2A"], dataState: "PUBLIC_REFERENCE", service: "PAF", sourceIds: ["lockheed-paf-f16-2009", "dsca-pakistan-15-80", "us-congress-paf-amraam-2008"] },
  { id: "jf-17", designation: "JF-17", name: "Thunder", kind: "AIRCRAFT", symbolRole: "FIGHTER", country: "Pakistan / China", description: "Single-engine multirole combat aircraft.", domains: ["A2A", "G2A"], dataState: "PUBLIC_REFERENCE" },
  { id: "astra-mk1", designation: "Astra Mk 1", name: "Air-to-air missile", kind: "GUIDED_WEAPON", symbolRole: "GUIDED_MISSILE", country: "India", description: "Radar-guided beyond-visual-range air-to-air missile.", domains: ["A2A"], modelProfile: "medium", dataState: "PUBLIC_REFERENCE" },
  { id: "aim-120c5", designation: "AIM-120C-5", name: "AMRAAM", kind: "GUIDED_WEAPON", symbolRole: "GUIDED_MISSILE", country: "United States", description: "Active-radar beyond-visual-range air-to-air missile recorded in the PAF F-16 munitions package.", domains: ["A2A"], modelProfile: "medium", dataState: "PUBLIC_REFERENCE", sourceIds: ["us-congress-paf-amraam-2008"] },
  { id: "mica-ir", designation: "MICA IR", name: "Air-to-air missile", kind: "GUIDED_WEAPON", symbolRole: "GUIDED_MISSILE", country: "France", description: "Infrared-guided air-to-air missile.", domains: ["A2A"], modelProfile: "short", dataState: "PUBLIC_REFERENCE", sourceIds: ["mbda-mica-2022"] },
  { id: "meteor", designation: "Meteor", name: "Air-to-air missile", kind: "GUIDED_WEAPON", symbolRole: "GUIDED_MISSILE", country: "European consortium", description: "Beyond-visual-range air-to-air missile.", domains: ["A2A"], modelProfile: "sustained", dataState: "PUBLIC_REFERENCE" },
  { id: "kh-31p", designation: "Kh-31P", name: "Anti-radiation missile", kind: "GUIDED_WEAPON", symbolRole: "GUIDED_MISSILE", country: "Russia", description: "Air-launched missile intended for radar-emitter targets.", domains: ["A2G"], modelProfile: "medium", dataState: "PUBLIC_REFERENCE", sourceIds: ["roe-kh31p"] },
  { id: "spice-2000", designation: "SPICE 2000", name: "Guided air-to-surface weapon", kind: "GUIDED_WEAPON", symbolRole: "GUIDED_MISSILE", country: "Israel", description: "Air-launched precision-guided weapon for fixed targets.", domains: ["A2G"], modelProfile: "short", dataState: "PUBLIC_REFERENCE", sourceIds: ["rafael-spice-2024"] },
  { id: "storm-shadow", designation: "Storm Shadow", name: "Air-launched cruise missile", kind: "GUIDED_WEAPON", symbolRole: "GUIDED_MISSILE", country: "United Kingdom / France", description: "Long-range air-launched cruise missile.", domains: ["A2G"], modelProfile: "sustained", dataState: "PUBLIC_REFERENCE" },
  { id: "spyder", designation: "SPYDER", name: "Short-range air-defence system", kind: "AIR_DEFENCE_SYSTEM", symbolRole: "SAM_SYSTEM", country: "Israel", description: "Mobile surface-to-air defence system.", domains: ["G2A"], modelProfile: "short", dataState: "PUBLIC_REFERENCE" },
  { id: "akash", designation: "Akash", name: "Surface-to-air missile system", kind: "AIR_DEFENCE_SYSTEM", symbolRole: "SAM_SYSTEM", country: "India", description: "Mobile medium-range air-defence system.", domains: ["G2A"], modelProfile: "medium", dataState: "PUBLIC_REFERENCE", sourceIds: ["pib-akash-2014"] },
  { id: "s-200", designation: "S-200", name: "Long-range air-defence system", kind: "AIR_DEFENCE_SYSTEM", symbolRole: "SAM_SYSTEM", country: "Soviet Union", description: "Historical long-range surface-to-air missile system. No current IAF or PAF service affiliation is asserted.", domains: ["G2A"], modelProfile: "sustained", dataState: "PUBLIC_REFERENCE", service: "OTHER", sourceIds: ["cia-s200-vega-1978"] },
  { id: "brahmos-mal", designation: "BrahMos MAL", name: "Mobile autonomous launcher", kind: "SURFACE_LAUNCHER", symbolRole: "SURFACE_LAUNCHER", country: "India / Russia", description: "Road-mobile launcher for the BrahMos weapon system.", domains: ["G2G"], dataState: "PUBLIC_REFERENCE" },
  { id: "brahmos-block-i", designation: "BrahMos Block I", name: "Land-attack cruise missile", kind: "GUIDED_WEAPON", symbolRole: "GUIDED_MISSILE", country: "India / Russia", description: "Surface-launched cruise missile configured here for a fixed-target experiment.", domains: ["G2G"], modelProfile: "sustained", dataState: "PUBLIC_REFERENCE", sourceIds: ["brahmos-block1-2011"] },
  { id: "pralay", designation: "Pralay", name: "Surface-to-surface missile", kind: "GUIDED_WEAPON", symbolRole: "GUIDED_MISSILE", country: "India", description: "Road-mobile surface-to-surface missile.", domains: ["G2G"], modelProfile: "medium", dataState: "PUBLIC_REFERENCE" },
  { id: "p-18-radar", designation: "P-18", name: "Early-warning radar site", kind: "RADAR", symbolRole: "RADAR", country: "Soviet Union", description: "Ground-based early-warning radar represented as a fixed emitter.", domains: ["A2G", "G2G"], dataState: "PUBLIC_REFERENCE" },
  { id: "aircraft-shelter-site", designation: "HAS complex", name: "Hardened aircraft shelter site", kind: "FIXED_SITE", symbolRole: "FIXED_OBJECTIVE", country: "User selected", description: "A fixed group of hardened aircraft shelters and supporting infrastructure.", domains: ["A2G", "G2G"], dataState: "USER_DEFINED" },
  { id: "command-site", designation: "Command site", name: "Fixed command-and-control site", kind: "FIXED_SITE", symbolRole: "FIXED_OBJECTIVE", country: "User selected", description: "A user-positioned fixed site used as the scenario objective.", domains: ["A2G", "G2G"], dataState: "USER_DEFINED" },
];

export function getCatalogObject(id: string) {
  return OBJECT_CATALOG.find((item) => item.id === id) ?? OBJECT_CATALOG[0];
}

export function getLaunchPlatforms(domain: EngagementDomain) {
  const kinds: ObjectKind[] = domain === "G2A" ? ["AIR_DEFENCE_SYSTEM"] : domain === "G2G" ? ["SURFACE_LAUNCHER"] : ["AIRCRAFT"];
  return OBJECT_CATALOG.filter((item) => item.domains.includes(domain) && kinds.includes(item.kind) && (domain !== "A2A" || item.service === "IAF"));
}

export function getGuidedSystems(domain: EngagementDomain) {
  if (domain === "G2A") return OBJECT_CATALOG.filter((item) => item.domains.includes(domain) && item.kind === "AIR_DEFENCE_SYSTEM");
  return OBJECT_CATALOG.filter((item) => item.domains.includes(domain) && item.kind === "GUIDED_WEAPON");
}

export function getOpposingObjects(domain: EngagementDomain) {
  const kinds: ObjectKind[] = domain === "A2A" || domain === "G2A" ? ["AIRCRAFT"] : ["RADAR", "FIXED_SITE"];
  return OBJECT_CATALOG.filter((item) => item.domains.includes(domain) && kinds.includes(item.kind) && (domain !== "A2A" || item.service === "PAF"));
}
