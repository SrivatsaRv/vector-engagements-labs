import type { EngagementDomain } from "@/lib/simulation";

export type DataStatus = "SOURCED" | "PARTIAL" | "MODEL_ASSUMPTION" | "UNKNOWN";
export type Service = "IAF" | "PAF" | "OTHER";
export type SubsystemKind =
  | "ENGINE"
  | "RADAR"
  | "EW"
  | "DATALINK"
  | "RWR"
  | "COUNTERMEASURE";
export type WeaponCategory =
  | "AAM_BVR"
  | "AAM_WVR"
  | "ANTI_RADIATION"
  | "AIR_TO_SURFACE"
  | "SAM"
  | "SURFACE_STRIKE";

export type SourceRecord = {
  id: string;
  title: string;
  publisher: string;
  url: string;
  publishedAt?: string;
  sourceClass: "OFFICIAL" | "MANUFACTURER" | "SECONDARY";
  note: string;
};

export type ModelProfile = {
  id: string;
  label: string;
  version: string;
  studyLimitKm: number;
  poweredFlightSeconds: number;
  modelMaxSpeedMps: number;
  modelTurnG: number;
  postBurnLossMps2: number;
  rationale: string;
};

export type SubsystemRecord = {
  id: string;
  kind: SubsystemKind;
  designation: string;
  manufacturer?: string;
  description: string;
  status: DataStatus;
  sourceIds: string[];
};

export type WeaponRecord = {
  id: string;
  designation: string;
  name: string;
  country: string;
  category: WeaponCategory;
  domains: EngagementDomain[];
  seeker: string;
  guidanceStages: string[];
  launchSupport: string;
  publishedRange?: { valueKm: number; condition: string };
  publishedSpeedMach?: number;
  status: DataStatus;
  sourceIds: string[];
  model: ModelProfile;
};

export type PlatformRecord = {
  id: string;
  service: Service;
  country: string;
  designation: string;
  family: string;
  variant: string;
  name: string;
  role: string;
  domains: EngagementDomain[];
  crew?: number;
  engineIds: string[];
  radarId?: string;
  ewId?: string;
  datalinkId?: string;
  rwrId?: string;
  countermeasureId?: string;
  compatibleWeaponIds: string[];
  defaultLoadout: Array<{ weaponId: string; quantity: number }>;
  publicFacts: Array<{
    label: string;
    value: string;
    status: DataStatus;
    sourceIds: string[];
  }>;
  status: DataStatus;
  sourceIds: string[];
};

export const SOURCES: SourceRecord[] = [
  {
    id: "pib-astra-contract-2022",
    title: "ASTRA Mk-I procurement and Su-30MKI integration",
    publisher: "Press Information Bureau, Government of India",
    url: "https://www.pib.gov.in/Pressreleaseshare.aspx?PRID=1829750&lang=2&reg=3",
    publishedAt: "2022-05-31",
    sourceClass: "OFFICIAL",
    note: "Confirms the IAF procurement and full integration of Astra Mk-I on Su-30MKI.",
  },
  {
    id: "drdo-astra-2019",
    title:
      "India successfully develops its first beyond-visual-range air-to-air missile",
    publisher: "Defence Research and Development Organisation",
    url: "https://www.drdo.gov.in/drdo/sites/default/files/drdo-news-documents/din-08august2019.pdf",
    publishedAt: "2019-08-08",
    sourceClass: "OFFICIAL",
    note: "Describes the tested head-on range condition, inertial mid-course guidance, secure data-link updates, and active-radar terminal guidance.",
  },
  {
    id: "pib-su30-engine-2024",
    title: "Contract for 240 AL-31FP aero engines for Su-30MKI",
    publisher: "Press Information Bureau, Government of India",
    url: "https://www.pib.gov.in/PressReleasePage.aspx?PRID=2053088&lang=2&reg=48",
    publishedAt: "2024-09-09",
    sourceClass: "OFFICIAL",
    note: "Confirms AL-31FP engine association with the IAF Su-30MKI fleet.",
  },
  {
    id: "lockheed-paf-f16-2009",
    title: "First new F-16 Block 52 for Pakistan",
    publisher: "Lockheed Martin",
    url: "https://news.lockheedmartin.com/2009-10-13-Lockheed-Martin-Unveils-First-New-F-16-for-Pakistan-in-Ceremony-Attended-by-Air-Force-Chiefs",
    publishedAt: "2009-10-13",
    sourceClass: "MANUFACTURER",
    note: "Confirms delivery context and the Pakistan Air Force F-16 Block 52 configuration.",
  },
  {
    id: "dsca-pakistan-15-80",
    title: "Pakistan F-16 Block 52 aircraft package, Transmittal 15-80",
    publisher: "Defense Security Cooperation Agency",
    url: "https://www.dsca.mil/Press-Media/Major-Arms-Sales/Major-Arms-Sales-Library/igphoto/2003606313",
    publishedAt: "2016-02-12",
    sourceClass: "OFFICIAL",
    note: "Identifies F100-PW-229 engines, AN/APG-68(V)9 radar, ALQ-211(V)9 AIDEWS, and Link 16 in the proposed configuration.",
  },
  {
    id: "usaf-f16-factsheet",
    title: "F-16 Fighting Falcon fact sheet",
    publisher: "United States Air Force",
    url: "https://www.af.mil/About-Us/Fact-Sheets/Display/%20tabid/224/Article/104505/f-16-fighting-falcon/",
    publishedAt: "2021-09-01",
    sourceClass: "OFFICIAL",
    note: "Provides general F-16C/D propulsion, fuel, speed, payload, armament, and station information; variant-specific applicability must still be checked.",
  },
  {
    id: "us-congress-paf-amraam-2008",
    title: "Pakistan F-16 program status and munitions package",
    publisher: "United States Congress / U.S. Government Publishing Office",
    url: "https://www.congress.gov/110/chrg/CHRG-110hhrg44526/CHRG-110hhrg44526.pdf",
    publishedAt: "2008-04-16",
    sourceClass: "OFFICIAL",
    note: "Records the F-16C/D Block 52 program and the AIM-120C-5 AMRAAM quantity in the associated munitions package.",
  },
  {
    id: "nasa-standard-atmosphere",
    title: "Earth atmosphere model — metric units",
    publisher: "NASA Glenn Research Center",
    url: "https://www.grc.nasa.gov/www/k-12/VirtualAero/BottleRocket/airplane/atmosmet508.html",
    sourceClass: "OFFICIAL",
    note: "Provides educational standard-atmosphere equations for temperature, pressure, and density versus altitude.",
  },
  {
    id: "usaf-a2a-manual",
    title: "AETC Tactics, Techniques, and Procedures 11-1",
    publisher: "United States Air Force Air Education and Training Command",
    url: "https://static.e-publishing.af.mil/production/1/aetc/publication/aetcttp11-1/aetcttp11-1.pdf",
    sourceClass: "OFFICIAL",
    note: "Public training reference for air-combat geometry terms and engagement considerations.",
  },
];

export const SUBSYSTEMS: SubsystemRecord[] = [
  {
    id: "al-31fp",
    kind: "ENGINE",
    designation: "AL-31FP",
    description: "Twin-engine installation on the Su-30MKI.",
    status: "SOURCED",
    sourceIds: ["pib-su30-engine-2024"],
  },
  {
    id: "bars-radar",
    kind: "RADAR",
    designation: "Airborne fire-control radar",
    description:
      "Exact fitted radar configuration is not asserted by the current official-source pack.",
    status: "UNKNOWN",
    sourceIds: [],
  },
  {
    id: "su30-ew",
    kind: "EW",
    designation: "Defensive EW fit",
    description:
      "User-selectable capability state; exact fitted suite is not asserted by the current source pack.",
    status: "UNKNOWN",
    sourceIds: [],
  },
  {
    id: "su30-datalink",
    kind: "DATALINK",
    designation: "Weapon-update data link",
    description:
      "Modeled as available when supporting Astra mid-course updates.",
    status: "PARTIAL",
    sourceIds: ["drdo-astra-2019"],
  },
  {
    id: "f100-pw-229",
    kind: "ENGINE",
    designation: "F100-PW-229",
    manufacturer: "Pratt & Whitney",
    description:
      "Engine identified for the proposed Pakistan F-16 Block 52 configuration.",
    status: "SOURCED",
    sourceIds: ["dsca-pakistan-15-80"],
  },
  {
    id: "apg-68v9",
    kind: "RADAR",
    designation: "AN/APG-68(V)9",
    description:
      "Multimode fire-control radar identified in the proposed Pakistan package.",
    status: "SOURCED",
    sourceIds: ["dsca-pakistan-15-80"],
  },
  {
    id: "alq-211v9",
    kind: "EW",
    designation: "AN/ALQ-211(V)9 AIDEWS",
    description:
      "Defensive electronic-warfare suite identified in the proposed Pakistan package.",
    status: "SOURCED",
    sourceIds: ["dsca-pakistan-15-80"],
  },
  {
    id: "link-16",
    kind: "DATALINK",
    designation: "Link 16",
    description:
      "Tactical data link identified in the proposed Pakistan package.",
    status: "SOURCED",
    sourceIds: ["dsca-pakistan-15-80"],
  },
];

const teachingProfile = (
  profile: Omit<ModelProfile, "version">,
): ModelProfile => ({ ...profile, version: "public-study-v0.4" });

export const WEAPONS: WeaponRecord[] = [
  {
    id: "astra-mk1",
    designation: "Astra Mk-I",
    name: "Beyond-visual-range air-to-air missile",
    country: "India",
    category: "AAM_BVR",
    domains: ["A2A"],
    seeker: "Active radar terminal seeker",
    guidanceStages: [
      "Inertial mid-course",
      "Secure data-link updates",
      "Active-radar terminal homing",
    ],
    launchSupport:
      "Launch aircraft supplies mid-course updates until the missile transitions to terminal homing.",
    publishedRange: {
      valueKm: 100,
      condition:
        "Maximum head-on launch range reported for the completed trials; not a universal engagement range.",
    },
    publishedSpeedMach: 4.5,
    status: "SOURCED",
    sourceIds: ["drdo-astra-2019", "pib-astra-contract-2022"],
    model: teachingProfile({
      id: "astra-study",
      label: "Astra Mk-I public-study profile",
      studyLimitKm: 65,
      poweredFlightSeconds: 10,
      modelMaxSpeedMps: 1120,
      modelTurnG: 28,
      postBurnLossMps2: 6.2,
      rationale:
        "A deliberately bounded teaching curve. It is separate from the published 100 km head-on trial condition and is not a verified motor or aerodynamic model.",
    }),
  },
  {
    id: "aim-120c5",
    designation: "AIM-120C-5 AMRAAM",
    name: "Beyond-visual-range air-to-air missile",
    country: "United States",
    category: "AAM_BVR",
    domains: ["A2A"],
    seeker: "Active radar terminal seeker",
    guidanceStages: [
      "Inertial mid-course",
      "Launch-aircraft updates",
      "Active-radar terminal homing",
    ],
    launchSupport:
      "Modeled with launch-aircraft support during mid-course; exact behavior is an explicit study assumption.",
    status: "PARTIAL",
    sourceIds: ["us-congress-paf-amraam-2008", "usaf-f16-factsheet"],
    model: teachingProfile({
      id: "amraam-c5-study",
      label: "AIM-120C-5 public-study profile",
      studyLimitKm: 60,
      poweredFlightSeconds: 9,
      modelMaxSpeedMps: 1080,
      modelTurnG: 27,
      postBurnLossMps2: 6.5,
      rationale:
        "A public-data comparison curve. No classified launch-zone, seeker, propulsion, or probability-of-kill data is represented.",
    }),
  },
  {
    id: "mica-ir",
    designation: "MICA IR",
    name: "Infrared-guided air-to-air missile",
    country: "France",
    category: "AAM_WVR",
    domains: ["A2A"],
    seeker: "Imaging infrared",
    guidanceStages: ["Inertial mid-course", "Infrared terminal homing"],
    launchSupport: "No continuous radar illumination modeled.",
    status: "PARTIAL",
    sourceIds: [],
    model: teachingProfile({
      id: "mica-ir-study",
      label: "MICA IR public-study profile",
      studyLimitKm: 20,
      poweredFlightSeconds: 5,
      modelMaxSpeedMps: 850,
      modelTurnG: 34,
      postBurnLossMps2: 8.5,
      rationale:
        "Teaching-only short-range comparison profile; detailed public source work remains incomplete.",
    }),
  },
];

export const PLATFORMS: PlatformRecord[] = [
  {
    id: "su-30mki",
    service: "IAF",
    country: "India",
    designation: "Su-30MKI",
    family: "Su-30",
    variant: "MKI",
    name: "Multirole fighter",
    role: "Blue fighter / launch platform",
    domains: ["A2A", "A2G"],
    crew: 2,
    engineIds: ["al-31fp", "al-31fp"],
    radarId: "bars-radar",
    ewId: "su30-ew",
    datalinkId: "su30-datalink",
    compatibleWeaponIds: ["astra-mk1"],
    defaultLoadout: [{ weaponId: "astra-mk1", quantity: 2 }],
    publicFacts: [
      {
        label: "Astra integration",
        value: "Fully integrated on Su-30MKI",
        status: "SOURCED",
        sourceIds: ["pib-astra-contract-2022"],
      },
      {
        label: "Engine installation",
        value: "2 × AL-31FP",
        status: "SOURCED",
        sourceIds: ["pib-su30-engine-2024"],
      },
      {
        label: "Fuel, mass and turn performance",
        value: "Not asserted by the current official-source pack",
        status: "UNKNOWN",
        sourceIds: [],
      },
    ],
    status: "PARTIAL",
    sourceIds: ["pib-astra-contract-2022", "pib-su30-engine-2024"],
  },
  {
    id: "f-16c-block52-paf",
    service: "PAF",
    country: "Pakistan",
    designation: "F-16C Block 52",
    family: "F-16",
    variant: "C Block 52",
    name: "Fighting Falcon",
    role: "Red fighter / opposing track",
    domains: ["A2A", "A2G", "G2A"],
    crew: 1,
    engineIds: ["f100-pw-229"],
    radarId: "apg-68v9",
    ewId: "alq-211v9",
    datalinkId: "link-16",
    compatibleWeaponIds: ["aim-120c5"],
    defaultLoadout: [{ weaponId: "aim-120c5", quantity: 2 }],
    publicFacts: [
      {
        label: "PAF configuration",
        value: "F-16C/D Block 52 program",
        status: "SOURCED",
        sourceIds: ["lockheed-paf-f16-2009", "us-congress-paf-amraam-2008"],
      },
      {
        label: "Engine",
        value: "F100-PW-229",
        status: "SOURCED",
        sourceIds: ["dsca-pakistan-15-80"],
      },
      {
        label: "Radar",
        value: "AN/APG-68(V)9",
        status: "SOURCED",
        sourceIds: ["dsca-pakistan-15-80"],
      },
      {
        label: "Defensive EW",
        value: "AN/ALQ-211(V)9 AIDEWS",
        status: "SOURCED",
        sourceIds: ["dsca-pakistan-15-80"],
      },
      {
        label: "Datalink",
        value: "Link 16",
        status: "SOURCED",
        sourceIds: ["dsca-pakistan-15-80"],
      },
    ],
    status: "SOURCED",
    sourceIds: [
      "lockheed-paf-f16-2009",
      "dsca-pakistan-15-80",
      "us-congress-paf-amraam-2008",
    ],
  },
  {
    id: "mirage-2000h",
    service: "IAF",
    country: "India",
    designation: "Mirage 2000H",
    family: "Mirage 2000",
    variant: "H",
    name: "Multirole fighter",
    role: "Blue fighter",
    domains: ["A2A", "A2G"],
    engineIds: [],
    compatibleWeaponIds: ["mica-ir"],
    defaultLoadout: [{ weaponId: "mica-ir", quantity: 2 }],
    publicFacts: [
      {
        label: "Catalog depth",
        value: "Variant research incomplete",
        status: "UNKNOWN",
        sourceIds: [],
      },
    ],
    status: "UNKNOWN",
    sourceIds: [],
  },
];

export const getSource = (id: string) =>
  SOURCES.find((source) => source.id === id);
export const getSubsystem = (id?: string) =>
  SUBSYSTEMS.find((item) => item.id === id);
export const getWeapon = (id: string) =>
  WEAPONS.find((weapon) => weapon.id === id) ?? WEAPONS[0];
export const getPlatform = (id: string) =>
  PLATFORMS.find((platform) => platform.id === id) ?? PLATFORMS[0];
export const findWeapon = (id: string) =>
  WEAPONS.find((weapon) => weapon.id === id);
export const findPlatform = (id: string) =>
  PLATFORMS.find((platform) => platform.id === id);
export const getCompatibleWeapons = (platformId: string) => {
  const platform = findPlatform(platformId);
  if (!platform) return [];
  return WEAPONS.filter((weapon) =>
    platform.compatibleWeaponIds.includes(weapon.id),
  );
};
