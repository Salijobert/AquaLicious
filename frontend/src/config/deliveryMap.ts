/**
 * AquaLicious Delivery Map & Geolocation Configuration
 * 
 * Boundary: Angeles City, Pampanga, Philippines
 * Status: NEEDS OWNER CONFIRMATION
 * Source: OpenStreetMap / Philippine Standard Geographic Code approximation
 * License: Open Database License (ODbL) / OpenStreetMap contributors
 * 
 * Usage Notice:
 * - Tile Provider: OpenStreetMap (Attribution required: © OpenStreetMap contributors)
 * - Geocoder: Nominatim (Rate limit: 1 request/second, identifying User-Agent/Referer)
 */

/**
 * Optional contact email sent to Nominatim in compliance with OpenStreetMap usage policy.
 * Reads from VITE_NOMINATIM_CONTACT or NOMINATIM_CONTACT environment variables.
 * Never hardcodes any personal email address in the repository.
 * If unset, geocoding requests fall back to identifying the app through the request's HTTP Referer and app name only.
 */
export const NOMINATIM_CONTACT = (
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_NOMINATIM_CONTACT) ||
  (typeof process !== 'undefined' && (process.env?.VITE_NOMINATIM_CONTACT || process.env?.NOMINATIM_CONTACT)) ||
  ''
).trim();

export const MAP_CONFIG = {
  status: 'NEEDS OWNER CONFIRMATION',
  source: 'OpenStreetMap / PSGC boundary approximation',
  license: 'ODbL (Open Database License) / © OpenStreetMap contributors',
  tileUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  tileAttribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
  maxZoom: 19,
  defaultZoom: 13,
  center: [15.1449, 120.5927] as [number, number], // Angeles City Center [lat, lng]
  reverseGeocoderUrl: NOMINATIM_CONTACT
    ? `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat={lat}&lon={lon}&email=${encodeURIComponent(NOMINATIM_CONTACT)}`
    : 'https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat={lat}&lon={lon}',
  appName: 'AquaLicious-Refill-Demonstration'
};

// Angeles City Polygon in [longitude, latitude] format
export const ANGELES_CITY_POLYGON_LNG_LAT: Array<[number, number]> = [
  [120.5230, 15.1840],
  [120.5480, 15.2010],
  [120.5780, 15.2090],
  [120.6050, 15.2060],
  [120.6320, 15.1950],
  [120.6550, 15.1740],
  [120.6620, 15.1500],
  [120.6510, 15.1220],
  [120.6340, 15.1050],
  [120.6060, 15.0940],
  [120.5750, 15.0970],
  [120.5480, 15.1120],
  [120.5280, 15.1350],
  [120.5190, 15.1600],
  [120.5230, 15.1840]
];

// Leaflet uses [latitude, longitude] format
export const ANGELES_CITY_POLYGON_LAT_LNG: Array<[number, number]> = ANGELES_CITY_POLYGON_LNG_LAT.map(
  ([lng, lat]) => [lat, lng]
);

/**
 * Checks whether [lng, lat] is inside the polygon using ray-casting.
 */
export function isPointInPolygon(point: [number, number], polygon: Array<[number, number]>): boolean {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0];
    const yi = polygon[i][1];
    const xj = polygon[j][0];
    const yj = polygon[j][1];

    const intersect = ((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Validates whether the given [lat, lng] falls within Angeles City boundaries.
 */
export function isDeliveryInServiceArea(lat: number, lng: number): boolean {
  if (typeof lat !== 'number' || typeof lng !== 'number') return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < 14.8 || lat > 15.5 || lng < 120.2 || lng > 121.0) return false;
  return isPointInPolygon([lng, lat], ANGELES_CITY_POLYGON_LNG_LAT);
}
