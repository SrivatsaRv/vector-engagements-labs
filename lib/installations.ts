export type PublicInstallation = {
  id: string;
  service: "IAF" | "PAF";
  name: string;
  icaoCode?: string;
  longitude: number;
  latitude: number;
  elevationFt?: number;
  runwayInfo?: string;
  type: "MAIN_OPERATING_BASE" | "FORWARD_OPERATING_BASE" | "AIR_STATION";
  dataState: "PUBLIC_REFERENCE";
  sourceId: "iaf-stations-wikipedia" | "shield-paf-orbat-2026-05-19";
};

export const PUBLIC_INSTALLATIONS: PublicInstallation[] = [
  { id: "iaf-adampur", service: "IAF", name: "Adampur AFS", latitude: 31.434879, longitude: 75.757256, type: "AIR_STATION", dataState: "PUBLIC_REFERENCE", sourceId: "iaf-stations-wikipedia" },
  { id: "iaf-ambala", service: "IAF", name: "Ambala AFS", latitude: 30.370556, longitude: 76.817778, type: "AIR_STATION", dataState: "PUBLIC_REFERENCE", sourceId: "iaf-stations-wikipedia" },
  { id: "iaf-halwara", service: "IAF", name: "Halwara AFS", latitude: 30.748041, longitude: 75.633209, type: "AIR_STATION", dataState: "PUBLIC_REFERENCE", sourceId: "iaf-stations-wikipedia" },
  { id: "iaf-pathankot", service: "IAF", name: "Pathankot AFS", latitude: 32.236929, longitude: 75.633227, type: "AIR_STATION", dataState: "PUBLIC_REFERENCE", sourceId: "iaf-stations-wikipedia" },
  { id: "iaf-srinagar", service: "IAF", name: "Srinagar AFS", latitude: 33.994374, longitude: 74.765299, type: "AIR_STATION", dataState: "PUBLIC_REFERENCE", sourceId: "iaf-stations-wikipedia" },
  { id: "iaf-jodhpur", service: "IAF", name: "Jodhpur AFS", latitude: 26.251389, longitude: 73.048056, type: "AIR_STATION", dataState: "PUBLIC_REFERENCE", sourceId: "iaf-stations-wikipedia" },
  { id: "paf-nur-khan", service: "PAF", name: "PAF Base Nur Khan", icaoCode: "OPRN", latitude: 33.6167, longitude: 73.0992, elevationFt: 1668, runwayInfo: "RWY 09/27, 12/30", type: "MAIN_OPERATING_BASE", dataState: "PUBLIC_REFERENCE", sourceId: "shield-paf-orbat-2026-05-19" },
  { id: "paf-peshawar", service: "PAF", name: "PAF Base Peshawar", icaoCode: "OPPS", latitude: 33.9933, longitude: 71.5144, elevationFt: 1180, runwayInfo: "RWY 17/35", type: "MAIN_OPERATING_BASE", dataState: "PUBLIC_REFERENCE", sourceId: "shield-paf-orbat-2026-05-19" },
  { id: "paf-asghar-khan", service: "PAF", name: "PAF Academy Asghar Khan", icaoCode: "OPRS", latitude: 34.0811, longitude: 71.9725, type: "AIR_STATION", dataState: "PUBLIC_REFERENCE", sourceId: "shield-paf-orbat-2026-05-19" },
  { id: "paf-qadri", service: "PAF", name: "PAF Qadri", icaoCode: "OPSD", latitude: 35.3347, longitude: 75.5375, type: "FORWARD_OPERATING_BASE", dataState: "PUBLIC_REFERENCE", sourceId: "shield-paf-orbat-2026-05-19" },
  { id: "paf-mm-alam", service: "PAF", name: "PAF Base M.M. Alam", icaoCode: "OPMI", latitude: 32.5631, longitude: 71.5706, type: "MAIN_OPERATING_BASE", dataState: "PUBLIC_REFERENCE", sourceId: "shield-paf-orbat-2026-05-19" },
  { id: "paf-minhas", service: "PAF", name: "PAF Base Minhas", icaoCode: "OPMS", latitude: 33.8703, longitude: 72.4, type: "MAIN_OPERATING_BASE", dataState: "PUBLIC_REFERENCE", sourceId: "shield-paf-orbat-2026-05-19" },
  { id: "paf-mushaf", service: "PAF", name: "PAF Base Mushaf", icaoCode: "OPSR", latitude: 32.0486, longitude: 72.6653, type: "MAIN_OPERATING_BASE", dataState: "PUBLIC_REFERENCE", sourceId: "shield-paf-orbat-2026-05-19" },
  { id: "paf-murid", service: "PAF", name: "PAF Murid", icaoCode: "OPMU", latitude: 32.9094, longitude: 72.7756, type: "FORWARD_OPERATING_BASE", dataState: "PUBLIC_REFERENCE", sourceId: "shield-paf-orbat-2026-05-19" },
  { id: "paf-rafiqui", service: "PAF", name: "PAF Base Rafiqui", icaoCode: "OPRQ", latitude: 30.7581, longitude: 72.2824, type: "MAIN_OPERATING_BASE", dataState: "PUBLIC_REFERENCE", sourceId: "shield-paf-orbat-2026-05-19" },
  { id: "paf-shahbaz", service: "PAF", name: "PAF Base Shahbaz", icaoCode: "OPJA", latitude: 28.2842, longitude: 68.4497, type: "MAIN_OPERATING_BASE", dataState: "PUBLIC_REFERENCE", sourceId: "shield-paf-orbat-2026-05-19" },
  { id: "paf-masroor", service: "PAF", name: "PAF Base Masroor", icaoCode: "OPMR", latitude: 24.8936, longitude: 66.94, type: "MAIN_OPERATING_BASE", dataState: "PUBLIC_REFERENCE", sourceId: "shield-paf-orbat-2026-05-19" },
  { id: "paf-bholari", service: "PAF", name: "PAF Base Bholari", icaoCode: "OPBW", latitude: 25.2436, longitude: 68.0353, type: "MAIN_OPERATING_BASE", dataState: "PUBLIC_REFERENCE", sourceId: "shield-paf-orbat-2026-05-19" },
  { id: "paf-faisal", service: "PAF", name: "PAF Base Faisal", icaoCode: "OPSF", latitude: 24.8747, longitude: 67.1178, type: "MAIN_OPERATING_BASE", dataState: "PUBLIC_REFERENCE", sourceId: "shield-paf-orbat-2026-05-19" },
  { id: "paf-sukkur", service: "PAF", name: "PAF Sukkur", icaoCode: "OPSK", latitude: 27.7219, longitude: 68.7919, type: "FORWARD_OPERATING_BASE", dataState: "PUBLIC_REFERENCE", sourceId: "shield-paf-orbat-2026-05-19" },
  { id: "paf-korangi-creek", service: "PAF", name: "PAF Korangi Creek", icaoCode: "OPKC", latitude: 24.7822, longitude: 67.1364, type: "AIR_STATION", dataState: "PUBLIC_REFERENCE", sourceId: "shield-paf-orbat-2026-05-19" },
];

export const DEFAULT_MAP_ORIGIN = { longitude: 74.2, latitude: 31.8 };
