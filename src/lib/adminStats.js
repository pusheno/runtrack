import { addMonths, monthKey, monthShort, parseDate, DAY, sumKm, sumSec, pace } from './utils';

// ---------- strona użytkownika: podsumowanie zapisywane dla administratora ----------
// Zawiera wyłącznie dane zbiorcze. Nie ma w nim tras, notatek ani pojedynczych treningów.
export function buildUserStats(runs, nickname, plan) {
  const months = {};
  runs.forEach((r) => {
    const m = monthKey(r.date);
    const cur = months[m] || [0, 0, 0];
    months[m] = [cur[0] + r.distanceKm, cur[1] + 1, cur[2] + r.durationSec];
  });
  Object.keys(months).forEach((m) => {
    months[m] = [Math.round(months[m][0] * 100) / 100, months[m][1], months[m][2]]; // [km, biegi, sekundy]
  });

  const dates = runs.map((r) => r.date).sort();
  const paces = runs.filter((r) => r.distanceKm >= 1).map(pace);

  return {
    nickname,
    totalKm: Math.round(sumKm(runs) * 100) / 100,
    runs: runs.length,
    totalSec: Math.round(sumSec(runs)),
    bestPaceSec: paces.length ? Math.round(Math.min(...paces) * 10) / 10 : null,
    longestKm: runs.length ? Math.round(Math.max(...runs.map((r) => r.distanceKm)) * 100) / 100 : null,
    firstRun: dates[0] || null,
    lastRun: dates[dates.length - 1] || null,
    gpsRuns: runs.filter((r) => r.source === 'gps').length,
    monthsJson: JSON.stringify(months),
    hasPlan: !!plan,
  };
}

const KEYS = ['nickname', 'totalKm', 'runs', 'totalSec', 'bestPaceSec', 'longestKm', 'firstRun', 'lastRun', 'gpsRuns', 'monthsJson', 'hasPlan'];
// puste pola (null/undefined) traktujemy jak wartości domyślne, żeby nie aktualizować rekordu bez potrzeby
const EMPTY = { gpsRuns: 0, hasPlan: false };
const norm = (s) =>
  JSON.stringify(KEYS.map((k) => (s[k] === undefined || s[k] === null ? (k in EMPTY ? EMPTY[k] : null) : s[k])));
export const sameStats = (a, b) => norm(a) === norm(b);

// ---------- strona admina: agregacja ----------
const parseMonths = (r) => {
  try {
    return JSON.parse(r.monthsJson || '{}');
  } catch (e) {
    return {};
  }
};

const median = (arr) => {
  if (!arr.length) return null;
  const s = arr.slice().sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

const BUCKETS = [
  { label: '<4:00', max: 240 },
  { label: '4:00', max: 270 },
  { label: '4:30', max: 300 },
  { label: '5:00', max: 330 },
  { label: '5:30', max: 360 },
  { label: '6:00', max: 390 },
  { label: '6:30+', max: Infinity },
];

export function aggregate(rows, todayKey) {
  const withRuns = rows.filter((r) => r.runs > 0 && r.totalKm > 0);
  const totalKm = rows.reduce((s, r) => s + (r.totalKm || 0), 0);
  const totalRuns = rows.reduce((s, r) => s + (r.runs || 0), 0);
  const totalSec = rows.reduce((s, r) => s + (r.totalSec || 0), 0);
  const gps = rows.reduce((s, r) => s + (r.gpsRuns || 0), 0);

  const age = (d) => (d ? Math.round((parseDate(todayKey) - parseDate(d)) / DAY) : Infinity);
  const userPaces = withRuns.map((r) => r.totalSec / r.totalKm);

  const cur = monthKey(todayKey);
  const parsed = rows.map(parseMonths);
  const months = Array.from({ length: 12 }, (_, i) => {
    const key = addMonths(cur, -(11 - i));
    let km = 0;
    let runs = 0;
    let active = 0;
    parsed.forEach((m) => {
      if (m[key]) {
        km += m[key][0];
        runs += m[key][1];
        active += 1;
      }
    });
    return { key, label: monthShort(key), km, runs, active };
  });

  const buckets = BUCKETS.map((b) => ({ label: b.label, value: 0 }));
  userPaces.forEach((p) => {
    buckets[BUCKETS.findIndex((b) => p < b.max)].value += 1;
  });

  return {
    users: rows.length,
    withRuns: withRuns.length,
    active7: rows.filter((r) => age(r.lastRun) <= 6).length,
    active30: rows.filter((r) => age(r.lastRun) <= 29).length,
    newcomers30: rows.filter((r) => age(r.firstRun) <= 29).length,
    totalKm,
    totalRuns,
    avgKmPerUser: withRuns.length ? totalKm / withRuns.length : null,
    avgRunsPerUser: withRuns.length ? totalRuns / withRuns.length : null,
    avgRunKm: totalRuns ? totalKm / totalRuns : null,
    pooledPace: totalKm > 0 ? totalSec / totalKm : null, // ważone kilometrami
    medianUserPace: median(userPaces),
    gpsShare: totalRuns ? gps / totalRuns : null,
    plans: rows.filter((r) => r.hasPlan).length,
    months,
    buckets,
  };
}

export function toCsv(rows) {
  const head = ['pseudonim', 'biegi', 'km', 'srednie_tempo_s_na_km', 'najlepsze_tempo_s_na_km', 'najdluzszy_km', 'pierwszy_bieg', 'ostatni_bieg', 'biegi_gps', 'ma_plan'];
  const lines = rows.map((r) =>
    [
      String(r.nickname || '').replace(/[;\n\r"]/g, ' '),
      r.runs,
      String(r.totalKm).replace('.', ','),
      r.totalKm > 0 ? Math.round(r.totalSec / r.totalKm) : '',
      r.bestPaceSec ?? '',
      r.longestKm ?? '',
      r.firstRun ?? '',
      r.lastRun ?? '',
      r.gpsRuns ?? 0,
      r.hasPlan ? 'tak' : 'nie',
    ].join(';')
  );
  return '﻿' + [head.join(';'), ...lines].join('\r\n');
}
