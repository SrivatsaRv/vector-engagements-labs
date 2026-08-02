export type AtmosphereState = {
  temperatureK: number;
  pressureKpa: number;
  densityKgM3: number;
  speedOfSoundMps: number;
};

/**
 * NASA Glenn educational standard-atmosphere approximation.
 * Validated and exposed as an educational model, not operational weather.
 */
export function standardAtmosphere(
  altitudeMeters: number,
  temperatureOffsetC = 0,
): AtmosphereState {
  const altitude = Math.max(0, Math.min(25000, altitudeMeters));
  let temperatureC: number;
  let pressureKpa: number;
  if (altitude <= 11000) {
    temperatureC = 15.04 - 0.00649 * altitude;
    pressureKpa = 101.29 * Math.pow((temperatureC + 273.1) / 288.08, 5.256);
  } else {
    temperatureC = -56.46;
    pressureKpa = 22.65 * Math.exp(1.73 - 0.000157 * altitude);
  }
  temperatureC += temperatureOffsetC;
  const temperatureK = temperatureC + 273.15;
  const densityKgM3 = pressureKpa / (0.2869 * temperatureK);
  return {
    temperatureK,
    pressureKpa,
    densityKgM3,
    speedOfSoundMps: Math.sqrt(1.4 * 287.05 * temperatureK),
  };
}

