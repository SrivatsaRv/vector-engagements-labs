import type { EngagementDomain } from "./engine/primitives.ts";

export type SimulationModelValueState =
  | "SOURCED"
  | "MODEL_ASSUMPTION"
  | "USER_PROVIDED"
  | "UNKNOWN";

export type WeaponSimulationModel = {
  id: string;
  weaponId: string;
  version: string;
  domains: EngagementDomain[];
  propulsionKind: "SOLID_ROCKET" | "SUSTAINED_ROCKET" | "AIR_BREATHING" | "GLIDE";
  launchMassKg: number;
  dryMassKg: number;
  poweredFlightSeconds: number;
  thrustNewtons: number;
  thrustTaperSpeedMps: number;
  referenceAreaM2: number;
  dragCoefficient: number;
  navigationConstant: number;
  maximumCommandG: number;
  seekerActivationRangeM: number;
  datalinkUpdateSeconds: number;
  valueState: SimulationModelValueState;
  rationale: string;
};

export type AircraftSimulationModel = {
  id: string;
  aircraftId: string;
  version: string;
  domains: EngagementDomain[];
  emptyMassKg: number;
  fuelCapacityKg: number;
  referenceAreaM2: number;
  zeroLiftDragCoefficient: number;
  inducedDragFactor: number;
  maximumThrustNewtons: number;
  specificFuelConsumptionKgPerNewtonSecond: number;
  maximumCommandG: number;
  valueState: SimulationModelValueState;
  rationale: string;
};

export const AIRCRAFT_SIMULATION_MODELS: AircraftSimulationModel[] = [
  {
    id: "su-30mki-aircraft-study-v05",
    aircraftId: "su-30mki",
    version: "0.5.0",
    domains: ["A2A", "A2G"],
    emptyMassKg: 18400,
    fuelCapacityKg: 9400,
    referenceAreaM2: 62,
    zeroLiftDragCoefficient: 0.026,
    inducedDragFactor: 0.085,
    maximumThrustNewtons: 245000,
    specificFuelConsumptionKgPerNewtonSecond: 0.000024,
    maximumCommandG: 9,
    valueState: "MODEL_ASSUMPTION",
    rationale: "Regression-continuity point-mass assumptions; not a validated Su-30MKI aerodynamic or propulsion model.",
  },
  {
    id: "mirage-2000h-aircraft-study-v05",
    aircraftId: "mirage-2000h",
    version: "0.5.0",
    domains: ["A2A", "A2G"],
    emptyMassKg: 7600,
    fuelCapacityKg: 3200,
    referenceAreaM2: 41,
    zeroLiftDragCoefficient: 0.024,
    inducedDragFactor: 0.09,
    maximumThrustNewtons: 95000,
    specificFuelConsumptionKgPerNewtonSecond: 0.000026,
    maximumCommandG: 9,
    valueState: "MODEL_ASSUMPTION",
    rationale: "Regression-continuity point-mass assumptions; not a validated Mirage 2000H aerodynamic or propulsion model.",
  },
  {
    id: "f-16c-block52-aircraft-study-v05",
    aircraftId: "f-16c-block52-paf",
    version: "0.5.0",
    domains: ["A2A", "G2A"],
    emptyMassKg: 9000,
    fuelCapacityKg: 3200,
    referenceAreaM2: 28,
    zeroLiftDragCoefficient: 0.025,
    inducedDragFactor: 0.095,
    maximumThrustNewtons: 125000,
    specificFuelConsumptionKgPerNewtonSecond: 0.000025,
    maximumCommandG: 9,
    valueState: "MODEL_ASSUMPTION",
    rationale: "Regression-continuity point-mass assumptions; not a validated F-16C Block 52 aerodynamic or propulsion model.",
  },
  {
    id: "jf-17-aircraft-study-v05",
    aircraftId: "jf-17",
    version: "0.5.0",
    domains: ["A2A", "G2A"],
    emptyMassKg: 9000,
    fuelCapacityKg: 3200,
    referenceAreaM2: 28,
    zeroLiftDragCoefficient: 0.025,
    inducedDragFactor: 0.095,
    maximumThrustNewtons: 125000,
    specificFuelConsumptionKgPerNewtonSecond: 0.000025,
    maximumCommandG: 9,
    valueState: "MODEL_ASSUMPTION",
    rationale: "Regression-continuity generic point-mass assumptions; not a validated JF-17 aerodynamic or propulsion model.",
  },
];

export const MODEL_LOADOUT_COMPATIBILITY = [
  { platformId: "su-30mki", weaponId: "astra-mk1" },
  { platformId: "su-30mki", weaponId: "kh-31p" },
  { platformId: "mirage-2000h", weaponId: "mica-ir" },
  { platformId: "mirage-2000h", weaponId: "spice-2000" },
  { platformId: "f-16c-block52-paf", weaponId: "aim-120c5" },
  { platformId: "akash", weaponId: "akash" },
  { platformId: "s-200", weaponId: "s-200" },
  { platformId: "brahmos-mal", weaponId: "brahmos-block-i" },
] as const;

export function isModelLoadoutCompatible(platformId: string, weaponId: string) {
  return MODEL_LOADOUT_COMPATIBILITY.some(
    (item) => item.platformId === platformId && item.weaponId === weaponId,
  );
}

const model = (value: WeaponSimulationModel) => value;

export const WEAPON_SIMULATION_MODELS: WeaponSimulationModel[] = [
  model({
    id: "astra-mk1-study-v05",
    weaponId: "astra-mk1",
    version: "0.5.0",
    domains: ["A2A"],
    propulsionKind: "SOLID_ROCKET",
    launchMassKg: 170,
    dryMassKg: 98.6,
    poweredFlightSeconds: 10,
    thrustNewtons: 19040,
    thrustTaperSpeedMps: 1120,
    referenceAreaM2: 0.055,
    dragCoefficient: 0.28,
    navigationConstant: 3.5,
    maximumCommandG: 28,
    seekerActivationRangeM: 14300,
    datalinkUpdateSeconds: 0.2,
    valueState: "MODEL_ASSUMPTION",
    rationale: "Open educational 3DOF coefficient set. Public guidance stages are source-linked separately; thrust, drag and mass depletion are assumptions pending validation.",
  }),
  model({
    id: "aim-120c5-study-v05",
    weaponId: "aim-120c5",
    version: "0.5.0",
    domains: ["A2A"],
    propulsionKind: "SOLID_ROCKET",
    launchMassKg: 157,
    dryMassKg: 92,
    poweredFlightSeconds: 9,
    thrustNewtons: 18800,
    thrustTaperSpeedMps: 1080,
    referenceAreaM2: 0.052,
    dragCoefficient: 0.28,
    navigationConstant: 3.5,
    maximumCommandG: 27,
    seekerActivationRangeM: 13200,
    datalinkUpdateSeconds: 0.2,
    valueState: "MODEL_ASSUMPTION",
    rationale: "Public-study coefficient set for comparison; not a verified AIM-120C-5 performance model.",
  }),
  model({
    id: "mica-ir-study-v05",
    weaponId: "mica-ir",
    version: "0.5.0",
    domains: ["A2A"],
    propulsionKind: "SOLID_ROCKET",
    launchMassKg: 112,
    dryMassKg: 65,
    poweredFlightSeconds: 5,
    thrustNewtons: 19000,
    thrustTaperSpeedMps: 850,
    referenceAreaM2: 0.045,
    dragCoefficient: 0.3,
    navigationConstant: 3.8,
    maximumCommandG: 34,
    seekerActivationRangeM: 4500,
    datalinkUpdateSeconds: 0.25,
    valueState: "MODEL_ASSUMPTION",
    rationale: "Teaching-only short-range infrared-guided coefficient set.",
  }),
  model({
    id: "kh-31p-study-v05",
    weaponId: "kh-31p",
    version: "0.5.0",
    domains: ["A2G"],
    propulsionKind: "SUSTAINED_ROCKET",
    launchMassKg: 640,
    dryMassKg: 371.2,
    poweredFlightSeconds: 18,
    thrustNewtons: 32700,
    thrustTaperSpeedMps: 920,
    referenceAreaM2: 0.16,
    dragCoefficient: 0.28,
    navigationConstant: 3.5,
    maximumCommandG: 10,
    seekerActivationRangeM: 17600,
    datalinkUpdateSeconds: 0.25,
    valueState: "MODEL_ASSUMPTION",
    rationale: "Fixed-emitter study model; terminal sensing and anti-radiation logic are not yet resolved.",
  }),
  model({
    id: "spice-2000-study-v05",
    weaponId: "spice-2000",
    version: "0.5.0",
    domains: ["A2G"],
    propulsionKind: "GLIDE",
    launchMassKg: 640,
    dryMassKg: 371.2,
    poweredFlightSeconds: 18,
    thrustNewtons: 32700,
    thrustTaperSpeedMps: 920,
    referenceAreaM2: 0.16,
    dragCoefficient: 0.28,
    navigationConstant: 3.2,
    maximumCommandG: 10,
    seekerActivationRangeM: 17600,
    datalinkUpdateSeconds: 0.25,
    valueState: "MODEL_ASSUMPTION",
    rationale: "Temporary powered proxy retained only for regression continuity; a glide-specific lift/drag model must replace it before research use.",
  }),
  model({
    id: "akash-study-v05",
    weaponId: "akash",
    version: "0.5.0",
    domains: ["G2A"],
    propulsionKind: "SUSTAINED_ROCKET",
    launchMassKg: 520,
    dryMassKg: 301.6,
    poweredFlightSeconds: 22.5,
    thrustNewtons: 42300,
    thrustTaperSpeedMps: 1220,
    referenceAreaM2: 0.11,
    dragCoefficient: 0.28,
    navigationConstant: 3.5,
    maximumCommandG: 27,
    seekerActivationRangeM: 18000,
    datalinkUpdateSeconds: 0.2,
    valueState: "MODEL_ASSUMPTION",
    rationale: "Area-defence educational coefficient set; sensor, command-guidance and engagement-channel behavior remain separately modeled assumptions.",
  }),
  model({
    id: "s-200-study-v05",
    weaponId: "s-200",
    version: "0.5.0",
    domains: ["G2A"],
    propulsionKind: "SUSTAINED_ROCKET",
    launchMassKg: 520,
    dryMassKg: 301.6,
    poweredFlightSeconds: 65,
    thrustNewtons: 35000,
    thrustTaperSpeedMps: 1480,
    referenceAreaM2: 0.11,
    dragCoefficient: 0.28,
    navigationConstant: 3.5,
    maximumCommandG: 22,
    seekerActivationRangeM: 18000,
    datalinkUpdateSeconds: 0.2,
    valueState: "MODEL_ASSUMPTION",
    rationale: "Extended-area educational coefficient set; it is not a verified S-200 fly-out model.",
  }),
  model({
    id: "brahmos-block-i-study-v05",
    weaponId: "brahmos-block-i",
    version: "0.5.0",
    domains: ["G2G"],
    propulsionKind: "AIR_BREATHING",
    launchMassKg: 2500,
    dryMassKg: 1900,
    poweredFlightSeconds: 160,
    thrustNewtons: 65000,
    thrustTaperSpeedMps: 1380,
    referenceAreaM2: 0.42,
    dragCoefficient: 0.31,
    navigationConstant: 2.5,
    maximumCommandG: 6,
    seekerActivationRangeM: 18000,
    datalinkUpdateSeconds: 0.5,
    valueState: "MODEL_ASSUMPTION",
    rationale: "Air-breathing surface-strike study set for browser trajectory experiments; route, terrain and terminal behavior are not yet validated.",
  }),
];

type DatabaseSimulationModel = {
  id: string;
  weapon_id: string;
  version: string;
  domains: EngagementDomain[];
  propulsion_kind: WeaponSimulationModel["propulsionKind"];
  launch_mass_kg: number;
  dry_mass_kg: number;
  powered_flight_seconds: number;
  thrust_newtons: number;
  thrust_taper_speed_mps: number;
  reference_area_m2: number;
  drag_coefficient: number;
  navigation_constant: number;
  maximum_command_g: number;
  seeker_activation_range_m: number;
  datalink_update_seconds: number;
  value_state: SimulationModelValueState;
  rationale: string;
};

const runtimeModels = new Map<string, WeaponSimulationModel>();

export function registerDatabaseSimulationModels(rows: DatabaseSimulationModel[]) {
  runtimeModels.clear();
  for (const row of rows) {
    const numericValues = [
      row.launch_mass_kg,
      row.dry_mass_kg,
      row.powered_flight_seconds,
      row.thrust_newtons,
      row.thrust_taper_speed_mps,
      row.reference_area_m2,
      row.drag_coefficient,
      row.navigation_constant,
      row.maximum_command_g,
      row.seeker_activation_range_m,
      row.datalink_update_seconds,
    ];
    if (!row.weapon_id || numericValues.some((value) => !Number.isFinite(value))) {
      throw new Error(`Invalid simulation model row ${row.id || "unknown"}`);
    }
    runtimeModels.set(row.weapon_id, {
      id: row.id,
      weaponId: row.weapon_id,
      version: row.version,
      domains: row.domains,
      propulsionKind: row.propulsion_kind,
      launchMassKg: row.launch_mass_kg,
      dryMassKg: row.dry_mass_kg,
      poweredFlightSeconds: row.powered_flight_seconds,
      thrustNewtons: row.thrust_newtons,
      thrustTaperSpeedMps: row.thrust_taper_speed_mps,
      referenceAreaM2: row.reference_area_m2,
      dragCoefficient: row.drag_coefficient,
      navigationConstant: row.navigation_constant,
      maximumCommandG: row.maximum_command_g,
      seekerActivationRangeM: row.seeker_activation_range_m,
      datalinkUpdateSeconds: row.datalink_update_seconds,
      valueState: row.value_state,
      rationale: row.rationale,
    });
  }
}

export function findWeaponSimulationModel(weaponId: string) {
  return runtimeModels.get(weaponId) ??
    WEAPON_SIMULATION_MODELS.find((item) => item.weaponId === weaponId);
}

export function findAircraftSimulationModel(aircraftId: string) {
  return AIRCRAFT_SIMULATION_MODELS.find((item) => item.aircraftId === aircraftId);
}
