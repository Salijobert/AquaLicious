/**
 * AquaLicious Delivery Service Area Enforcement
 * 
 * Boundary: Angeles City, Pampanga, Philippines
 * Status: NEEDS OWNER CONFIRMATION
 * Source: OpenStreetMap / Philippine Standard Geographic Code approximation
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Coordinates in GeoJSON are [longitude, latitude]
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

// Leaflet uses [latitude, longitude]
export const ANGELES_CITY_POLYGON_LAT_LNG: Array<[number, number]> = ANGELES_CITY_POLYGON_LNG_LAT.map(
  ([lng, lat]) => [lat, lng]
);

export const ANGELES_CITY_CENTER: [number, number] = [15.1449, 120.5927];

/**
 * Robust Jordan curve / ray-casting point-in-polygon algorithm.
 * Checks whether [lng, lat] is inside the closed polygon.
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
 * Validates if the given latitude and longitude falls within Angeles City delivery boundary.
 */
export function isDeliveryInServiceArea(lat: number, lng: number): boolean {
  if (typeof lat !== 'number' || typeof lng !== 'number') return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  // Plausibility bounds for Pampanga region
  if (lat < 14.8 || lat > 15.5 || lng < 120.2 || lng > 121.0) return false;
  return isPointInPolygon([lng, lat], ANGELES_CITY_POLYGON_LNG_LAT);
}
