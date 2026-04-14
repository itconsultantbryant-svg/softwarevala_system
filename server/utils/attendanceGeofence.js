/**
 * Office / compound attendance check — Prinstine Group, Monrovia.
 * PA Rib House Junction, Airfield, Sinkor, Monrovia, Liberia
 * 6.2914° N, 10.7623° W
 */
require('dotenv').config();

const OFFICE = {
  latitude: 6.2914,
  longitude: -10.7623, // 10.7623° W
  name: 'PA Rib House Junction, Airfield, Sinkor, Monrovia, Liberia'
};

/** Allowed distance from center (meters). Covers office + compound; tune via env. */
const DEFAULT_RADIUS_M = Math.min(
  2000,
  Math.max(50, parseInt(process.env.ATTENDANCE_OFFICE_RADIUS_M || '200', 10) || 200)
);

/** Extra slack for GPS error (meters). */
const ACCURACY_BUFFER_M = 75;

function toRad(d) {
  return (d * Math.PI) / 180;
}

/** Great-circle distance in meters (WGS84 approximation). */
function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function parseCoord(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).trim(), 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {number|null} lat
 * @param {number|null} lng
 * @param {number|null} accuracyM - optional horizontal accuracy from Geolocation API (meters)
 * @returns {{ ok: boolean, distanceM: number, maxAllowedM: number, error?: string }}
 */
function validateAtOffice(lat, lng, accuracyM = null) {
  const latitude = parseCoord(lat);
  const longitude = parseCoord(lng);
  if (latitude === null || longitude === null) {
    return {
      ok: false,
      distanceM: NaN,
      maxAllowedM: DEFAULT_RADIUS_M + ACCURACY_BUFFER_M,
      error:
        'Location is required. Allow location access and ensure you are at the office before signing in or out.'
    };
  }
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return {
      ok: false,
      distanceM: NaN,
      maxAllowedM: DEFAULT_RADIUS_M,
      error: 'Invalid coordinates received.'
    };
  }

  const acc = accuracyM != null && Number.isFinite(Number(accuracyM)) ? Math.max(0, Number(accuracyM)) : 0;
  if (acc > 500) {
    return {
      ok: false,
      distanceM: haversineMeters(latitude, longitude, OFFICE.latitude, OFFICE.longitude),
      maxAllowedM: DEFAULT_RADIUS_M,
      error:
        'GPS accuracy is too low (over 500 m). Move outdoors or nearer a window, then try again.'
    };
  }

  const distanceM = haversineMeters(latitude, longitude, OFFICE.latitude, OFFICE.longitude);
  const effectiveRadius = DEFAULT_RADIUS_M + ACCURACY_BUFFER_M + Math.min(acc * 0.5, 50);

  if (distanceM > effectiveRadius) {
    const rounded = Math.round(distanceM);
    return {
      ok: false,
      distanceM,
      maxAllowedM: effectiveRadius,
      error: `You must be at the office compound (${OFFICE.name}) to record attendance. Your position is about ${rounded} m from the site.`
    };
  }

  return { ok: true, distanceM, maxAllowedM: effectiveRadius };
}

function getOfficeSitePublic() {
  return {
    latitude: OFFICE.latitude,
    longitude: OFFICE.longitude,
    name: OFFICE.name,
    radius_m: DEFAULT_RADIUS_M
  };
}

module.exports = {
  OFFICE,
  DEFAULT_RADIUS_M,
  haversineMeters,
  validateAtOffice,
  getOfficeSitePublic
};
