import type { EngagementDomain } from "./simulation.ts";

export type DataStatus =
  | "SOURCED"
  | "PARTIAL"
  | "CONTEXT_ONLY"
  | "INELIGIBLE"
  | "MODEL_ASSUMPTION"
  | "UNKNOWN";
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
  evidenceUse?: "CATALOG_CONTEXT" | "INELIGIBLE";
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
  deliveredQuantity?: number;
  scenarioSelectable: boolean;
  domains: EngagementDomain[];
  crew?: number;
  engineIds: string[];
  radarId?: string;
  ewId?: string;
  datalinkId?: string;
  rwrId?: string;
  countermeasureId?: string;
  compatibleWeaponIds: string[];
  defaultLoadout: Array<{
    weaponId: string;
    quantity: number;
    status: "MODEL_ASSUMPTION";
  }>;
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
    evidenceUse: "CATALOG_CONTEXT",
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
    evidenceUse: "CATALOG_CONTEXT",
  },
  {
    id: "lockheed-paf-f16-2009",
    title: "First new F-16 Block 52 for Pakistan",
    publisher: "Lockheed Martin",
    url: "https://news.lockheedmartin.com/2009-10-13-Lockheed-Martin-Unveils-First-New-F-16-for-Pakistan-in-Ceremony-Attended-by-Air-Force-Chiefs",
    publishedAt: "2009-10-13",
    sourceClass: "MANUFACTURER",
    evidenceUse: "CATALOG_CONTEXT",
    note: "Identifies Peace Drive I as 12 F-16C and 6 F-16D Block 52 aircraft and associates the programme with F100-PW-229 engines. It is categorical catalog context, not performance evidence.",
  },
  {
    id: "federal-register-paf-f16-2006",
    title: "Pakistan F-16C/D Block 50/52 aircraft programme notice",
    publisher: "United States Federal Register / Government Publishing Office",
    url: "https://www.govinfo.gov/content/pkg/FR-2006-07-11/pdf/FR-2006-07-11.pdf",
    publishedAt: "2006-07-11",
    sourceClass: "OFFICIAL",
    evidenceUse: "CATALOG_CONTEXT",
    note: "Associates the requested programme with APG-68(V)9, Link 16, AIM-120C-5 and LAU-129/A. It does not prove final delivered fit or supply runtime authority.",
  },
  {
    id: "dsca-pakistan-15-80",
    title: "Pakistan F-16 Block 52 aircraft package, Transmittal 15-80",
    publisher: "Defense Security Cooperation Agency",
    url: "https://www.dsca.mil/Press-Media/Major-Arms-Sales/Major-Arms-Sales-Library/igphoto/2003606313",
    publishedAt: "2016-02-12",
    sourceClass: "OFFICIAL",
    evidenceUse: "INELIGIBLE",
    note: "Separate 2016 proposed sale that expired without acceptance. It is quarantined and cannot establish delivered Peace Drive I fit or runtime authority.",
  },
  {
    id: "crs-pakistan-f16-rl31675",
    title: "Pakistan-U.S. relations and F-16 transaction history",
    publisher: "Congressional Research Service",
    url: "https://www.congress.gov/crs_external_products/RL/HTML/RL31675.web.html",
    sourceClass: "OFFICIAL",
    evidenceUse: "CATALOG_CONTEXT",
    note: "Reviewed as the transaction-state basis for quarantining the 2016 proposal. The dynamic locator has no approved immutable artifact hash and cannot support runtime admission.",
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
    url: "https://www.govinfo.gov/content/pkg/GOVPUB-Y4_F76_1-PURL-LPS106730/pdf/GOVPUB-Y4_F76_1-PURL-LPS106730.pdf",
    publishedAt: "2008-09-16",
    sourceClass: "OFFICIAL",
    evidenceUse: "CATALOG_CONTEXT",
    note: "Records the F-16C/D Block 52 programme and AIM-120C-5 association. It is categorical programme context, not station, loadout, guidance, or performance authority.",
  },
  {
    id: "mbda-mica-2022",
    title: "MICA air-to-air missile data sheet",
    publisher: "MBDA",
    url: "https://www.mbda-systems.com/sites/mbda/files/2024-07/2022%20MICA%20datasheet.pdf",
    publishedAt: "2022-02-01",
    sourceClass: "MANUFACTURER",
    note: "Identifies the MICA IR seeker, inertial reference, data link, solid propulsion, mass, dimensions, and Mirage 2000 integration family.",
  },
  {
    id: "roe-kh31p",
    title: "Kh-31P anti-radiation missile",
    publisher: "Rosoboronexport",
    url: "https://roe.ru/en/production/aerospace-forces/air-weapons/guided-weapons/aviatsionnye-upravlyaemye-rakety-klassa-vozdukh-rls-aviatsionnye-protivoradiolokatsionnye-rakety/kh-31p/?theme=theme-lightblue",
    sourceClass: "OFFICIAL",
    note: "Identifies the passive-radar guidance role, booster/sustainer propulsion description, public export range, mass, speed, and carrier envelope.",
  },
  {
    id: "rafael-spice-2024",
    title: "SPICE 1000 / SPICE 2000 product brochure",
    publisher: "Rafael Advanced Defense Systems",
    url: "https://www.rafael.co.il/wp-content/uploads/2024/03/SPICE1000-Brochure-English-03-2024.pdf",
    publishedAt: "2024-03-01",
    sourceClass: "MANUFACTURER",
    note: "Describes SPICE 2000 stand-off range, EO scene-matching, autonomous terminal homing, mission planning, and trajectory controls.",
  },
  {
    id: "pib-akash-2014",
    title: "Akash medium-range surface-to-air missile",
    publisher: "Press Information Bureau, Government of India",
    url: "https://www.pib.gov.in/newsite/erelcontent.aspx?lang=2&reg=48&relid=103304",
    publishedAt: "2014-02-10",
    sourceClass: "OFFICIAL",
    note: "Identifies Akash as a command-guided medium-range surface-to-air missile system and states the public 25 km range figure.",
  },
  {
    id: "cia-s200-vega-1978",
    title: "Official report concerning the S-200 VEGA air-defence system",
    publisher: "Central Intelligence Agency Reading Room",
    url: "https://www.cia.gov/readingroom/docs/1978_03_28_OFFICIAL_REPORT.pdf",
    publishedAt: "1978-03-28",
    sourceClass: "OFFICIAL",
    note: "Declassified historical government report identifying the S-200 VEGA as a long-range air-defence system. It is not evidence of present IAF or PAF service.",
  },
  {
    id: "brahmos-block1-2011",
    title: "Indian Army receives second regiment of BRAHMOS missile",
    publisher: "BrahMos Aerospace",
    url: "https://www.brahmos.com/press-release/153",
    publishedAt: "2011-11-29",
    sourceClass: "MANUFACTURER",
    note: "Identifies the Army Block-I precision-attack version and the historical public 290 km / Mach 2.8 figures. These are descriptive facts, not VECTOR model coefficients.",
  },
  {
    id: "nasa-standard-atmosphere",
    title: "Earth atmosphere model: metric units",
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
    status: "CONTEXT_ONLY",
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
      "Astra integration context does not establish an admitted aircraft data-link model.",
    status: "CONTEXT_ONLY",
    sourceIds: ["drdo-astra-2019"],
  },
  {
    id: "f100-pw-229",
    kind: "ENGINE",
    designation: "F100-PW-229",
    manufacturer: "Pratt & Whitney",
    description:
      "F100-PW-229 is associated categorically with the delivered Peace Drive I programme; no engine map or performance authority is admitted.",
    status: "CONTEXT_ONLY",
    sourceIds: ["lockheed-paf-f16-2009"],
  },
  {
    id: "apg-68v9",
    kind: "RADAR",
    designation: "AN/APG-68(V)9",
    description:
      "APG-68(V)9 appears in the 2006 requested programme context; final delivered fit and sensor performance are not established.",
    status: "CONTEXT_ONLY",
    sourceIds: ["federal-register-paf-f16-2006"],
  },
  {
    id: "link-16",
    kind: "DATALINK",
    designation: "Link 16",
    description:
      "Link 16 appears in the 2006 requested programme context; final delivered fit and data-link behavior are not established.",
    status: "CONTEXT_ONLY",
    sourceIds: ["federal-register-paf-f16-2006"],
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
    publishedSpeedMach: undefined,
    status: "SOURCED",
    sourceIds: ["mbda-mica-2022"],
    model: teachingProfile({
      id: "mica-ir-study",
      label: "MICA IR public-study profile",
      studyLimitKm: 20,
      poweredFlightSeconds: 5,
      modelMaxSpeedMps: 850,
      modelTurnG: 34,
      postBurnLossMps2: 8.5,
      rationale:
        "Teaching-only short-range comparison profile. The public identity and guidance facts are source-backed; the simulated propulsion and aerodynamic coefficients remain unverified assumptions.",
    }),
  },
  {
    id: "kh-31p",
    designation: "Kh-31P",
    name: "Anti-radiation missile",
    country: "Russia",
    category: "ANTI_RADIATION",
    domains: ["A2G"],
    seeker: "Passive radar seeker",
    guidanceStages: ["Emitter acquisition", "Passive-radar homing"],
    launchSupport:
      "The current scenario supplies a fixed emitting objective; emitter shutdown and reacquisition are not yet modeled.",
    publishedRange: {
      valueKm: 110,
      condition: "Manufacturer public export maximum; not a universal usable launch range.",
    },
    publishedSpeedMach: undefined,
    status: "SOURCED",
    sourceIds: ["roe-kh31p"],
    model: teachingProfile({
      id: "kh-31p-study",
      label: "Kh-31P public-study profile",
      studyLimitKm: 80,
      poweredFlightSeconds: 18,
      modelMaxSpeedMps: 920,
      modelTurnG: 10,
      postBurnLossMps2: 6,
      rationale:
        "Public identity, role, and export facts are sourced separately. VECTOR's thrust, drag, and terminal-emitter behavior remain model assumptions.",
    }),
  },
  {
    id: "spice-2000",
    designation: "SPICE 2000",
    name: "Electro-optical guidance kit",
    country: "Israel",
    category: "AIR_TO_SURFACE",
    domains: ["A2G"],
    seeker: "Electro-optical scene-matching seeker",
    guidanceStages: ["Planned mid-course trajectory", "Autonomous scene matching", "Terminal homing"],
    launchSupport: "Modeled as autonomous after release.",
    publishedRange: {
      valueKm: 60,
      condition: "Manufacturer stand-off figure; release state and trajectory conditions are not specified by VECTOR.",
    },
    status: "SOURCED",
    sourceIds: ["rafael-spice-2024"],
    model: teachingProfile({
      id: "spice-2000-study",
      label: "SPICE 2000 interim public-study profile",
      studyLimitKm: 60,
      poweredFlightSeconds: 0,
      modelMaxSpeedMps: 450,
      modelTurnG: 10,
      postBurnLossMps2: 5,
      rationale:
        "Public guidance and stand-off facts are sourced. The current engine still uses an explicitly temporary powered proxy until a glide lift/drag model is validated.",
    }),
  },
  {
    id: "akash",
    designation: "Akash",
    name: "Medium-range surface-to-air missile system",
    country: "India",
    category: "SAM",
    domains: ["G2A"],
    seeker: "Command-guidance system",
    guidanceStages: ["Ground-based surveillance and track", "Command guidance", "Terminal intercept"],
    launchSupport: "Requires the modeled ground track and command-guidance path.",
    publishedRange: {
      valueKm: 25,
      condition: "Government public system figure; not a complete engagement envelope.",
    },
    status: "SOURCED",
    sourceIds: ["pib-akash-2014"],
    model: teachingProfile({
      id: "akash-study",
      label: "Akash public-study profile",
      studyLimitKm: 40,
      poweredFlightSeconds: 22.5,
      modelMaxSpeedMps: 1220,
      modelTurnG: 27,
      postBurnLossMps2: 5.5,
      rationale:
        "System identity, public range, and command-guidance class are sourced. The aerodynamic and propulsion coefficients are independent model assumptions.",
    }),
  },
  {
    id: "s-200",
    designation: "S-200 VEGA",
    name: "Long-range surface-to-air missile system",
    country: "Soviet Union",
    category: "SAM",
    domains: ["G2A"],
    seeker: "Historical long-range air-defence system",
    guidanceStages: ["Ground track", "Long-range intercept"],
    launchSupport: "Current VECTOR behavior is a study assumption, not a reconstructed historical fire-control chain.",
    status: "PARTIAL",
    sourceIds: ["cia-s200-vega-1978"],
    model: teachingProfile({
      id: "s-200-study",
      label: "S-200 historical public-study profile",
      studyLimitKm: 120,
      poweredFlightSeconds: 65,
      modelMaxSpeedMps: 1480,
      modelTurnG: 22,
      postBurnLossMps2: 4.5,
      rationale:
        "Historical identity is sourced. VECTOR's full coefficient set and engagement logic remain assumptions, and no present IAF or PAF service affiliation is asserted.",
    }),
  },
  {
    id: "brahmos-block-i",
    designation: "BRAHMOS Block-I",
    name: "Land-attack cruise missile",
    country: "India / Russia",
    category: "SURFACE_STRIKE",
    domains: ["G2G"],
    seeker: "Land-attack guidance package",
    guidanceStages: ["Solid-booster launch", "Ramjet cruise", "Terminal approach"],
    launchSupport: "Modeled as autonomous after launch along the configured path.",
    publishedRange: {
      valueKm: 290,
      condition: "Historical manufacturer public figure for the inducted system generation; not a current inventory claim.",
    },
    publishedSpeedMach: 2.8,
    status: "SOURCED",
    sourceIds: ["brahmos-block1-2011"],
    model: teachingProfile({
      id: "brahmos-block-i-study",
      label: "BRAHMOS Block-I public-study profile",
      studyLimitKm: 170,
      poweredFlightSeconds: 160,
      modelMaxSpeedMps: 1380,
      modelTurnG: 6,
      postBurnLossMps2: 3.5,
      rationale:
        "Historical public range, speed, and system identity are source-backed. The VECTOR thrust, drag, routing, and terminal behavior are model assumptions.",
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
    scenarioSelectable: true,
    domains: ["A2A", "A2G"],
    crew: 2,
    engineIds: ["al-31fp", "al-31fp"],
    radarId: "bars-radar",
    ewId: "su30-ew",
    datalinkId: "su30-datalink",
    compatibleWeaponIds: ["astra-mk1"],
    defaultLoadout: [{ weaponId: "astra-mk1", quantity: 2, status: "MODEL_ASSUMPTION" }],
    publicFacts: [
      {
        label: "Astra integration",
        value: "Fully integrated on Su-30MKI",
        status: "CONTEXT_ONLY",
        sourceIds: ["pib-astra-contract-2022"],
      },
      {
        label: "Engine installation",
        value: "2 × AL-31FP",
        status: "CONTEXT_ONLY",
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
    variant: "F-16C Block 52 Peace Drive I",
    name: "Fighting Falcon",
    role: "Red fighter / opposing track",
    deliveredQuantity: 12,
    scenarioSelectable: true,
    domains: ["A2A", "A2G", "G2A"],
    crew: 1,
    engineIds: ["f100-pw-229"],
    compatibleWeaponIds: ["aim-120c5"],
    defaultLoadout: [{ weaponId: "aim-120c5", quantity: 2, status: "MODEL_ASSUMPTION" }],
    publicFacts: [
      {
        label: "Peace Drive I identity",
        value: "12 delivered single-seat aircraft",
        status: "SOURCED",
        sourceIds: ["lockheed-paf-f16-2009"],
      },
      {
        label: "Engine",
        value: "F100-PW-229 programme association",
        status: "CONTEXT_ONLY",
        sourceIds: ["lockheed-paf-f16-2009"],
      },
      {
        label: "Radar",
        value: "AN/APG-68(V)9 requested-programme association only",
        status: "CONTEXT_ONLY",
        sourceIds: ["federal-register-paf-f16-2006"],
      },
      {
        label: "Datalink",
        value: "Link 16 requested-programme association only",
        status: "CONTEXT_ONLY",
        sourceIds: ["federal-register-paf-f16-2006"],
      },
      {
        label: "AIM-120C-5",
        value: "Programme association only; station and loadout not admitted",
        status: "CONTEXT_ONLY",
        sourceIds: ["us-congress-paf-amraam-2008", "federal-register-paf-f16-2006"],
      },
    ],
    status: "PARTIAL",
    sourceIds: [
      "lockheed-paf-f16-2009",
      "federal-register-paf-f16-2006",
      "us-congress-paf-amraam-2008",
    ],
  },
  {
    id: "f-16d-block52-paf",
    service: "PAF",
    country: "Pakistan",
    designation: "F-16D Block 52",
    family: "F-16",
    variant: "F-16D Block 52 Peace Drive I",
    name: "Fighting Falcon",
    role: "Public-reference catalog only; not scenario-selectable",
    deliveredQuantity: 6,
    scenarioSelectable: false,
    domains: ["A2A", "A2G", "G2A"],
    crew: 2,
    engineIds: ["f100-pw-229"],
    compatibleWeaponIds: [],
    defaultLoadout: [],
    publicFacts: [
      {
        label: "Peace Drive I identity",
        value: "6 delivered two-seat aircraft",
        status: "SOURCED",
        sourceIds: ["lockheed-paf-f16-2009"],
      },
      {
        label: "Engine",
        value: "F100-PW-229 programme association",
        status: "CONTEXT_ONLY",
        sourceIds: ["lockheed-paf-f16-2009"],
      },
      {
        label: "Radar",
        value: "AN/APG-68(V)9 requested-programme association only",
        status: "CONTEXT_ONLY",
        sourceIds: ["federal-register-paf-f16-2006"],
      },
      {
        label: "Datalink",
        value: "Link 16 requested-programme association only",
        status: "CONTEXT_ONLY",
        sourceIds: ["federal-register-paf-f16-2006"],
      },
    ],
    status: "PARTIAL",
    sourceIds: ["lockheed-paf-f16-2009", "federal-register-paf-f16-2006"],
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
    scenarioSelectable: true,
    domains: ["A2A", "A2G"],
    engineIds: [],
    compatibleWeaponIds: ["mica-ir"],
    defaultLoadout: [{ weaponId: "mica-ir", quantity: 2, status: "MODEL_ASSUMPTION" }],
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

export type CatalogReviewState =
  | "ACCEPTED"
  | "CONTEXT_ONLY"
  | "INELIGIBLE"
  | "MODEL_ASSUMPTION"
  | "UNKNOWN";

export function catalogReviewState(status: DataStatus): CatalogReviewState {
  if (status === "SOURCED") return "ACCEPTED";
  if (status === "CONTEXT_ONLY" || status === "PARTIAL") return "CONTEXT_ONLY";
  if (status === "INELIGIBLE") return "INELIGIBLE";
  if (status === "MODEL_ASSUMPTION") return "MODEL_ASSUMPTION";
  return "UNKNOWN";
}
