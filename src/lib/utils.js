// ---------- daty ----------
export const DAY = 86400000;
const pad = (n) => String(n).padStart(2, '0');

export const toKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => toKey(new Date());
export const parseDate = (s) => new Date(`${s}T00:00:00`);
export const monthKey = (s) => s.slice(0, 7);
export const thisMonth = () => monthKey(today());

export const addMonths = (key, delta) => {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};

const MONTHS = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'];
const MONTHS_SHORT = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];

export const monthLabel = (key) => {
  const [y, m] = key.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
};
export const monthShort = (key) => MONTHS_SHORT[Number(key.slice(5, 7)) - 1];

// poniedziałek tygodnia, w którym leży data
export const weekStart = (dateStr) => {
  const d = parseDate(dateStr);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
};

// ---------- formatowanie ----------
export const fmtKm = (km, digits = 1) => `${km.toFixed(digits).replace('.', ',')} km`;

export const fmtPace = (secPerKm) => {
  if (!secPerKm || !isFinite(secPerKm)) return '–';
  const t = Math.round(secPerKm);
  return `${Math.floor(t / 60)}:${pad(t % 60)} /km`;
};

export const fmtTime = (sec) => {
  const t = Math.round(sec);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
};

// "45:30" albo "1:05:10" -> sekundy
export const parseTime = (str) => {
  const parts = str.trim().split(':').map(Number);
  if (parts.length < 2 || parts.length > 3 || parts.some((p) => isNaN(p) || p < 0)) return null;
  const sec = parts.length === 2 ? parts[0] * 60 + parts[1] : parts[0] * 3600 + parts[1] * 60 + parts[2];
  return Math.round(sec);
};

// ---------- obliczenia ----------
export const pace = (r) => r.durationSec / r.distanceKm;
export const sumKm = (runs) => runs.reduce((s, r) => s + r.distanceKm, 0);
export const sumSec = (runs) => runs.reduce((s, r) => s + r.durationSec, 0);
export const avgPace = (runs) => {
  const km = sumKm(runs);
  return km > 0 ? sumSec(runs) / km : null;
};

export const inMonth = (runs, key) => runs.filter((r) => monthKey(r.date) === key);

export const inLastDays = (runs, from, to) => {
  // dni wstecz: [from, to) liczone od dziś (0 = dziś)
  const now = parseDate(today()).getTime();
  return runs.filter((r) => {
    const age = Math.round((now - parseDate(r.date).getTime()) / DAY);
    return age >= from && age < to;
  });
};

export function streaks(runs) {
  const days = [...new Set(runs.map((r) => r.date))].sort();
  let longest = 0;
  let run = 0;
  let prev = null;
  for (const d of days) {
    if (prev && Math.round((parseDate(d) - parseDate(prev)) / DAY) === 1) run += 1;
    else run = 1;
    longest = Math.max(longest, run);
    prev = d;
  }
  const set = new Set(days);
  let current = 0;
  const d = new Date();
  if (!set.has(toKey(d))) d.setDate(d.getDate() - 1); // seria żyje, jeśli biegałeś wczoraj
  while (set.has(toKey(d))) {
    current += 1;
    d.setDate(d.getDate() - 1);
  }
  return { current, longest };
}

export function kmByWeek(runs, n) {
  const ws = weekStart(today());
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(ws);
    d.setDate(d.getDate() - 7 * (n - 1 - i));
    const t = d.getTime();
    const value = sumKm(runs.filter((r) => weekStart(r.date).getTime() === t));
    return { label: `${d.getDate()}.${d.getMonth() + 1}`, value };
  });
}

export function kmByMonth(runs, n) {
  const now = thisMonth();
  return Array.from({ length: n }, (_, i) => {
    const key = addMonths(now, -(n - 1 - i));
    return { key, label: monthShort(key), value: sumKm(inMonth(runs, key)) };
  });
}

export function paceByMonth(runs, n) {
  const now = thisMonth();
  return Array.from({ length: n }, (_, i) => {
    const key = addMonths(now, -(n - 1 - i));
    return { key, label: monthShort(key), value: avgPace(inMonth(runs, key)) };
  });
}

export function weekdayStats(runs) {
  const labels = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'];
  const stats = labels.map((label) => ({ label, value: 0 }));
  runs.forEach((r) => {
    stats[(parseDate(r.date).getDay() + 6) % 7].value += 1;
  });
  return stats;
}

export function bestPeriods(runs) {
  const weeks = new Map();
  const months = new Map();
  runs.forEach((r) => {
    const wk = toKey(weekStart(r.date));
    weeks.set(wk, (weeks.get(wk) || 0) + r.distanceKm);
    const mk = monthKey(r.date);
    months.set(mk, (months.get(mk) || 0) + r.distanceKm);
  });
  const top = (map) => {
    let best = null;
    map.forEach((value, key) => {
      if (!best || value > best.value) best = { key, value };
    });
    return best;
  };
  return { week: top(weeks), month: top(months) };
}

// kolumny = tygodnie, wiersze = dni (Pn..Nd)
export function heatmapWeeks(runs, weeks = 26) {
  const byDay = new Map();
  runs.forEach((r) => byDay.set(r.date, (byDay.get(r.date) || 0) + r.distanceKm));
  const start = weekStart(today());
  start.setDate(start.getDate() - 7 * (weeks - 1));
  const todayKey = today();
  return Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const dt = new Date(start);
      dt.setDate(start.getDate() + w * 7 + d);
      const key = toKey(dt);
      return { date: key, km: byDay.get(key) || 0, future: key > todayKey };
    })
  );
}

// prognozy czasów wzorem Riegela: T2 = T1 * (D2 / D1) ^ 1.06 (z biegów >= 3 km)
export const TARGETS = [
  { label: '5 km', km: 5 },
  { label: '10 km', km: 10 },
  { label: 'Półmaraton', km: 21.0975 },
];

export function predictions(runs) {
  const base = runs.filter((r) => r.distanceKm >= 3);
  return TARGETS.map((t) => {
    let best = null;
    base.forEach((r) => {
      const sec = r.durationSec * Math.pow(t.km / r.distanceKm, 1.06);
      if (best === null || sec < best) best = sec;
    });
    return { ...t, sec: best };
  });
}
