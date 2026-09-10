// ============================================================
// Validation GeoJSON + garde-fous entree
// ============================================================
import { CONFIG } from "../config.js";

export function validatePolygon(geometry) {
  if (!geometry || geometry.type !== "Polygon") throw new Error("geometry doit etre un Polygon");
  const rings = geometry.coordinates;
  if (!Array.isArray(rings) || !rings.length) throw new Error("coordinates manquantes");
  const outer = rings[0];
  if (!Array.isArray(outer) || outer.length < 4) throw new Error("Polygon: minimum 4 points");
  if (outer.length > CONFIG.MAX_POLYGON_POINTS) throw new Error("Polygon: trop de points");

  for (const point of outer) {
    if (!Array.isArray(point) || point.length < 2) throw new Error("Point invalide");
    const lng = Number(point[0]);
    const lat = Number(point[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat) ||
        lng < -180 || lng > 180 || lat < -90 || lat > 90) {
      throw new Error("Coordonnees invalides");
    }
  }

  const first = outer[0];
  const last = outer[outer.length - 1];
  if (Number(first[0]) !== Number(last[0]) || Number(first[1]) !== Number(last[1])) {
    throw new Error("Polygon non ferme");
  }
  return true;
}

export function polygonBBox(geometry) {
  const points = geometry.coordinates[0];
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  for (const [lng, lat] of points) {
    minLng = Math.min(minLng, lng); maxLng = Math.max(maxLng, lng);
    minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
  }
  return [minLng, minLat, maxLng, maxLat];
}

// Approximation equirectangulaire — estimation UI, pas un calcul cadastral
export function polygonAreaHa(geometry) {
  const points = geometry.coordinates[0];
  if (points.length < 4) return 0;
  const lat0 = Number(points[0][1]);
  const mLat = 111320;
  const mLng = 111320 * Math.cos((lat0 * Math.PI) / 180);
  let area = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const x1 = Number(points[i][0]) * mLng, y1 = Number(points[i][1]) * mLat;
    const x2 = Number(points[i + 1][0]) * mLng, y2 = Number(points[i + 1][1]) * mLat;
    area += x1 * y2 - x2 * y1;
  }
  return Math.abs(area) / 2 / 10000;
}

export function centroid(geometry) {
  const points = geometry.coordinates[0];
  let sx = 0, sy = 0;
  for (const [lng, lat] of points) { sx += lng; sy += lat; }
  return { lng: sx / points.length, lat: sy / points.length };
}
