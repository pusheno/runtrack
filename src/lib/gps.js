// Czysta logika GPS (bez Reacta i bez przeglądarki), dzięki czemu da się ją testować osobno.

export const MAX_ACCURACY = 30; // m: gorsze odczyty ignorujemy
export const MIN_STEP = 4; // m: mniejsze ruchy to szum GPS
export const MAX_SPEED = 12; // m/s (~43 km/h): szybsze skoki to błąd odczytu

const R = 6371000;
const rad = (d) => (d * Math.PI) / 180;

export function haversine(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Punkt trasy: { lat, lng, d: metry od startu, m: czas ruchu w ms, t: znacznik czasu odczytu }
export class Tracker {
  constructor(saved) {
    this.points = saved?.points ? saved.points.slice() : [];
    this.distanceM = saved?.distanceM || 0;
    this.last = null; // ostatni przyjęty punkt; null = następny zaczyna nowy odcinek (bez doliczania dystansu)
  }

  // zwraca: 'ok' | 'inaccurate' | 'stale' | 'jitter' | 'jump'
  addFix({ lat, lng, acc, ts }, movingMs) {
    if (acc != null && acc > MAX_ACCURACY) return 'inaccurate';
    if (this.last) {
      const dt = (ts - this.last.t) / 1000;
      if (!(dt > 0)) return 'stale';
      const step = haversine(this.last, { lat, lng });
      if (step < MIN_STEP) return 'jitter';
      if (step / dt > MAX_SPEED) return 'jump';
      this.distanceM += step;
    }
    const p = { lat, lng, d: this.distanceM, m: movingMs, t: ts };
    this.points.push(p);
    this.last = p;
    return 'ok';
  }

  // pauza / wznowienie / odzyskanie sesji: przerwa nie dolicza dystansu
  breakSegment() {
    this.last = null;
  }
}

// Aktualne tempo (s/km) z ostatnich ~windowM metrów
export function recentPace(points, windowM = 150) {
  if (points.length < 2) return null;
  const last = points[points.length - 1];
  for (let i = points.length - 2; i >= 0; i--) {
    const dd = last.d - points[i].d;
    if (dd >= windowM) {
      const dm = last.m - points[i].m;
      return dm > 0 ? dm / dd : null; // ms/m == s/km
    }
  }
  return null;
}

// Czasy pełnych kilometrów w sekundach (interpolacja między punktami)
export function computeSplits(points) {
  const out = [];
  if (points.length < 2) return out;
  let nextKm = 1000;
  let prevM = points[0].m;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    while (b.d >= nextKm && b.d > a.d) {
      const f = (nextKm - a.d) / (b.d - a.d);
      const m = a.m + f * (b.m - a.m);
      out.push(Math.round((m - prevM) / 1000));
      prevM = m;
      nextKm += 1000;
    }
  }
  return out;
}

// ---------- uproszczenie trasy (Ramer–Douglas–Peucker) ----------
function toXY(coords) {
  const lat0 = rad(coords[0][0]);
  return coords.map(([lat, lng]) => [lng * Math.cos(lat0) * 111320, lat * 110540]);
}

function segDist(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

export function simplify(coords, epsilonM) {
  if (coords.length < 3) return coords.slice();
  const xy = toXY(coords);
  const keep = new Uint8Array(coords.length);
  keep[0] = keep[coords.length - 1] = 1;
  const stack = [[0, coords.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop();
    let maxD = 0;
    let idx = -1;
    for (let i = s + 1; i < e; i++) {
      const d = segDist(xy[i], xy[s], xy[e]);
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (idx !== -1 && maxD > epsilonM) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  return coords.filter((_, i) => keep[i]);
}

// ---------- zapis trasy jako tekst (format "encoded polyline", dokładność ~1 m) ----------
function encNum(v) {
  v = v < 0 ? ~(v << 1) : v << 1;
  let s = '';
  while (v >= 0x20) {
    s += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
    v >>= 5;
  }
  return s + String.fromCharCode(v + 63);
}

export function encodePolyline(coords) {
  let out = '';
  let pLat = 0;
  let pLng = 0;
  for (const [lat, lng] of coords) {
    const la = Math.round(lat * 1e5);
    const ln = Math.round(lng * 1e5);
    out += encNum(la - pLat) + encNum(ln - pLng);
    pLat = la;
    pLng = ln;
  }
  return out;
}

export function decodePolyline(str) {
  const out = [];
  let i = 0;
  let lat = 0;
  let lng = 0;
  while (i < str.length) {
    for (let axis = 0; axis < 2; axis++) {
      let shift = 0;
      let result = 0;
      let b;
      do {
        b = str.charCodeAt(i++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (axis === 0) lat += delta;
      else lng += delta;
    }
    out.push([lat / 1e5, lng / 1e5]);
  }
  return out;
}

// DynamoDB ma limit 400 KB na rekord, więc pilnujemy rozmiaru trasy
const MAX_ROUTE_CHARS = 120000;

export function encodeRoute(coords) {
  if (coords.length === 0) return '';
  let eps = 3;
  let enc = encodePolyline(simplify(coords, eps));
  while (enc.length > MAX_ROUTE_CHARS && eps < 200) {
    eps *= 2;
    enc = encodePolyline(simplify(coords, eps));
  }
  return enc;
}

// Wynik biegu gotowy do wyświetlenia i zapisu
export function buildResult(tracker, movingMs, startedAt) {
  const pts = tracker.points;
  const route = encodeRoute(pts.map((p) => [p.lat, p.lng]));
  return {
    startedAt: startedAt.toISOString(),
    distanceM: tracker.distanceM,
    durationSec: Math.round(movingMs / 1000),
    splits: computeSplits(pts),
    route,
    coords: route ? decodePolyline(route) : [],
  };
}

// ---------- symulacja GPS (tryb testowy): bieg w kółko po okręgu ----------
const DEMO_CENTER = { lat: 52.2297, lng: 21.0122 };
const DEMO_RADIUS = 280; // m
const DEMO_SPEED = 3.1; // m/s (~5:23 /km)

export function demoFix(step, ts) {
  const ang = (DEMO_SPEED * step) / DEMO_RADIUS;
  // deterministyczny "szum" rzędu +-1,5 m
  const nx = Math.sin(step * 12.9898) * 1.5;
  const ny = Math.cos(step * 78.233) * 1.5;
  const x = DEMO_RADIUS * Math.cos(ang) + nx;
  const y = DEMO_RADIUS * Math.sin(ang) + ny;
  return {
    lat: DEMO_CENTER.lat + y / 110540,
    lng: DEMO_CENTER.lng + x / (111320 * Math.cos(rad(DEMO_CENTER.lat))),
    acc: 6,
    ts,
  };
}
