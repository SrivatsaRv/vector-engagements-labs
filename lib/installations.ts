export type PublicInstallation = {
  id: string;
  service: "IAF" | "PAF";
  name: string;
  longitude: number;
  latitude: number;
  type: "MAIN_OPERATING_BASE" | "FORWARD_OPERATING_BASE" | "AIR_STATION";
  dataState: "PUBLIC_REFERENCE";
  sourceId: "iaf-stations-wikipedia" | "paf-bases-wikipedia";
};

export const PUBLIC_INSTALLATIONS: PublicInstallation[] = [
  { id: "iaf-adampur", service: "IAF", name: "Adampur AFS", latitude: 31.434879, longitude: 75.757256, type: "AIR_STATION", dataState: "PUBLIC_REFERENCE", sourceId: "iaf-stations-wikipedia" },
  { id: "iaf-ambala", service: "IAF", name: "Ambala AFS", latitude: 30.370556, longitude: 76.817778, type: "AIR_STATION", dataState: "PUBLIC_REFERENCE", sourceId: "iaf-stations-wikipedia" },
  { id: "iaf-halwara", service: "IAF", name: "Halwara AFS", latitude: 30.748041, longitude: 75.633209, type: "AIR_STATION", dataState: "PUBLIC_REFERENCE", sourceId: "iaf-stations-wikipedia" },
  { id: "iaf-pathankot", service: "IAF", name: "Pathankot AFS", latitude: 32.236929, longitude: 75.633227, type: "AIR_STATION", dataState: "PUBLIC_REFERENCE", sourceId: "iaf-stations-wikipedia" },
  { id: "iaf-srinagar", service: "IAF", name: "Srinagar AFS", latitude: 33.994374, longitude: 74.765299, type: "AIR_STATION", dataState: "PUBLIC_REFERENCE", sourceId: "iaf-stations-wikipedia" },
  { id: "iaf-jodhpur", service: "IAF", name: "Jodhpur AFS", latitude: 26.251389, longitude: 73.048056, type: "AIR_STATION", dataState: "PUBLIC_REFERENCE", sourceId: "iaf-stations-wikipedia" },
  { id: "paf-peshawar", service: "PAF", name: "PAF Base Peshawar", latitude: 33.9944, longitude: 71.5289, type: "MAIN_OPERATING_BASE", dataState: "PUBLIC_REFERENCE", sourceId: "paf-bases-wikipedia" },
  { id: "paf-minhas", service: "PAF", name: "PAF Base Minhas", latitude: 33.868889, longitude: 72.400833, type: "MAIN_OPERATING_BASE", dataState: "PUBLIC_REFERENCE", sourceId: "paf-bases-wikipedia" },
  { id: "paf-nur-khan", service: "PAF", name: "PAF Base Nur Khan", latitude: 33.6175, longitude: 73.098889, type: "MAIN_OPERATING_BASE", dataState: "PUBLIC_REFERENCE", sourceId: "paf-bases-wikipedia" },
  { id: "paf-mushaf", service: "PAF", name: "PAF Base Mushaf", latitude: 32.048611, longitude: 72.665278, type: "MAIN_OPERATING_BASE", dataState: "PUBLIC_REFERENCE", sourceId: "paf-bases-wikipedia" },
  { id: "paf-shahbaz", service: "PAF", name: "PAF Base Shahbaz", latitude: 28.284444, longitude: 68.450278, type: "MAIN_OPERATING_BASE", dataState: "PUBLIC_REFERENCE", sourceId: "paf-bases-wikipedia" },
  { id: "paf-lahore", service: "PAF", name: "PAF Base Lahore", latitude: 31.520833, longitude: 74.391944, type: "FORWARD_OPERATING_BASE", dataState: "PUBLIC_REFERENCE", sourceId: "paf-bases-wikipedia" },
];

export const DEFAULT_MAP_ORIGIN = { longitude: 74.2, latitude: 31.8 };
