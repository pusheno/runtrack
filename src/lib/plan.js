import { weekStart, toKey, fmtTime, inLastDays, sumKm, pace } from './utils';

// Generator planu treningowego oparty na regułach (bez AI i bez gotowych plików):
// tempo rośnie liniowo od "teraz" do "celu", co 4. tydzień jest lżejszy, ostatni to zwężenie i start.

export const GOALS = [
  { km: 5, label: '5 km' },
  { km: 10, label: '10 km' },
  { km: 21.0975, label: 'Półmaraton' },
];

// ---------- pomocnicze ----------
const r5 = (s) => Math.round(s / 5) * 5;
const half = (x) => Math.round(x * 2) / 2;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const fmtK = (x) => String(half(x)).replace('.', ',');
export const pf = (s) => {
  const t = Math.round(s);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}/km`;
};

// "4:30", "4.30" i "4,30" => 270 s/km (sekundy muszą mieć dwie cyfry)
export function parsePace(str) {
  const m = /^(\d{1,2})[:.,](\d{2})$/.exec(String(str).trim());
  if (!m || Number(m[2]) >= 60) return null;
  const sec = Number(m[1]) * 60 + Number(m[2]);
  return sec >= 150 && sec <= 720 ? sec : null; // 2:30 - 12:00 /km
}

// Orientacyjna ocena realności celu: ok. 0,6% poprawy tempa na tydzień to rozsądna reguła kciuka
export function assess({ currentPace, goalPace, weeks }) {
  const gain = currentPace - goalPace;
  const pct = (gain / currentPace) * 100;
  const rec = clamp(Math.ceil(pct / 0.6), 6, 16);
  const level = weeks >= rec ? 'ok' : weeks >= rec * 0.75 ? 'ambitious' : 'risky';
  return { gain, pct, rec, level };
}

const cls = (km) => (km <= 5 ? 5 : km <= 10 ? 10 : 21);

const INTERVALS = {
  5: [[6, 400, 90], [8, 400, 75], [5, 600, 90], [6, 600, 90], [5, 800, 120], [4, 1000, 120], [5, 1000, 120], [6, 800, 90]],
  10: [[5, 800, 90], [6, 800, 90], [4, 1000, 90], [5, 1000, 90], [4, 1200, 120], [3, 1600, 120], [4, 1600, 120], [5, 1600, 120]],
  21: [[5, 1000, 75], [6, 1000, 75], [4, 1600, 90], [5, 1600, 90], [4, 2000, 120], [3, 3000, 120], [4, 3000, 120]],
};
const TEMPO_KM = { 5: [2, 5], 10: [3, 7], 21: [4, 10] };
const OFFSETS = {
  5: { easy: 75, tempo: 12, interval: -10 },
  10: { easy: 65, tempo: 8, interval: -14 },
  21: { easy: 50, tempo: 4, interval: -18 },
};
const HARD_CAP = { 5: 40, 10: 55, 21: 70 };
const MAX_LONG = { 5: 12, 10: 18, 21: 24 };

// 0 = poniedziałek ... 6 = niedziela. Q = jakość (na zmianę interwały i tempo), E = spokojny, L = długi
const LAYOUT = {
  2: [{ d: 1, t: 'Q' }, { d: 6, t: 'L' }],
  3: [{ d: 1, t: 'Q' }, { d: 3, t: 'E' }, { d: 6, t: 'L' }],
  4: [{ d: 1, t: 'I' }, { d: 3, t: 'E' }, { d: 5, t: 'T' }, { d: 6, t: 'L' }],
  5: [{ d: 0, t: 'E' }, { d: 1, t: 'I' }, { d: 3, t: 'E' }, { d: 5, t: 'T' }, { d: 6, t: 'L' }],
};

// ---------- pojedyncze jednostki ----------
function intervalSession(c, entry, rp, z, labelPrefix = 'Interwały') {
  const [reps, m, rest] = entry;
  const p = r5(rp + z.interval);
  const jogKm = ((reps - 1) * rest) / z.easyPace;
  const dist = half(2 + (reps * m) / 1000 + jogKm + 1.5);
  return {
    type: 'interval',
    title: `${labelPrefix} ${reps}×${m} m`,
    detail: `Rozgrzewka 2 km, ${reps}×${m} m w tempie ${pf(p)} (przerwa: trucht ${rest} s), schłodzenie 1,5 km.`,
    distanceKm: dist,
    paceSec: p,
  };
}

function tempoSession(c, km, rp, z) {
  const p = r5(rp + z.tempo);
  const tk = half(km);
  return {
    type: 'tempo',
    title: `Tempo ${fmtK(tk)} km`,
    detail: `Rozgrzewka 2 km, ${fmtK(tk)} km w równym tempie ${pf(p)}, schłodzenie 1,5 km.`,
    distanceKm: half(2 + tk + 1.5),
    paceSec: p,
  };
}

const easySession = (km, z, extra = '') => ({
  type: 'easy',
  title: `Spokojny bieg ${fmtK(km)} km`,
  detail: `${fmtK(km)} km w tempie ${pf(z.easyPace)} lub wolniej. Powinno dać się swobodnie rozmawiać.${extra}`,
  distanceKm: half(km),
  paceSec: z.easyPace,
});

const longSession = (km, z) => ({
  type: 'long',
  title: `Długie wybieganie ${fmtK(km)} km`,
  detail: `${fmtK(km)} km w tempie ok. ${pf(z.longPace)}. Równo, bez pogoni za czasem.`,
  distanceKm: half(km),
  paceSec: z.longPace,
});

// ---------- generator ----------
export function generatePlan({ currentPace, goalPace, goalKm, weeks, days, baseKm, startDate }) {
  if (!(goalPace < currentPace)) throw new Error('Tempo docelowe musi być szybsze niż obecne.');
  if (weeks < 4 || weeks > 16) throw new Error('Plan może trwać od 4 do 16 tygodni.');
  const c = cls(goalKm);
  const off = OFFSETS[c];
  const layout = LAYOUT[days];
  if (!layout) throw new Error('Liczba dni w tygodniu: 2-5.');

  const taperWeeks = c === 21 ? 2 : 1; // zwężenie wliczając tydzień startowy
  const kindOf = (w) =>
    w === weeks - 1 ? 'final' : w >= weeks - taperWeeks ? 'taper' : (w + 1) % 4 === 0 ? 'recovery' : 'build';

  // objętość tygodniowa
  const base = Math.max(baseKm, 8);
  const cap = Math.min(Math.max(base * 1.7, base + 6), HARD_CAP[c]);
  let build = base;
  let peak = base;
  const volume = [];
  for (let w = 0; w < weeks; w++) {
    const k = kindOf(w);
    let v;
    if (k === 'build') {
      v = w === 0 ? build : Math.min(build * 1.08, cap);
      build = v;
      peak = Math.max(peak, v);
    } else if (k === 'recovery') v = build * 0.78;
    else if (k === 'taper') v = peak * 0.75;
    else v = peak * 0.5;
    volume.push(v);
  }

  const monday = weekStart(startDate);
  const out = [];

  for (let w = 0; w < weeks; w++) {
    const kind = kindOf(w);
    const prog = weeks === 1 ? 1 : w / (weeks - 1);
    const rp = currentPace - (currentPace - goalPace) * prog; // tempo "na dystansie celu" w tym tygodniu
    const z = {
      easyPace: r5(rp + off.easy),
      longPace: r5(rp + off.easy + 10),
      tempo: off.tempo,
      interval: off.interval,
    };
    const light = kind === 'taper' || kind === 'final';
    const list = INTERVALS[c];
    let idx = light ? 0 : Math.round(prog * (list.length - 1));
    if (kind === 'recovery') idx = Math.max(0, idx - 1);
    const [tMin, tMax] = TEMPO_KM[c];
    let tempoKm = light ? tMin : tMin + (tMax - tMin) * prog;
    if (kind === 'recovery') tempoKm = Math.max(tMin, tempoKm - 1);

    // 1. jednostki jakościowe i ich dystans
    const slots = layout.map((s) => ({
      d: s.d,
      t: s.t === 'Q' ? (w % 2 === 0 ? 'I' : 'T') : s.t,
    }));
    const sessions = [];
    let qKm = 0;
    for (const s of slots) {
      let item = null;
      if (kind === 'final') {
        if (s.t === 'I' ) {
          const entry = c === 21 ? [3, 1000, 90] : [4, 400, 90];
          item = intervalSession(c, entry, goalPace - off.interval, z, 'Przypomnienie tempa');
          item.paceSec = r5(goalPace);
          item.detail = item.detail.replace(/w tempie [\d:]+\/km/, `w tempie startowym ${pf(goalPace)}`);
        } else if (s.t === 'T') {
          item = easySession(3, z, ' Dodaj 4 krótkie przebieżki (ok. 20 s).');
        } else if (s.t === 'E') {
          item = easySession(3.5, z);
        } else {
          const t = goalPace * goalKm;
          item = {
            type: 'race',
            title: `Dzień startu: ${GOALS.find((g) => g.km === goalKm)?.label || fmtK(goalKm) + ' km'}`,
            detail: `Cel: ${goalKm === 21.0975 ? '21,1' : fmtK(goalKm)} km w tempie ${pf(goalPace)} (czas ${fmtTime(t)}). Rozgrzewka, równe tempo, wysiłek na koniec.`,
            distanceKm: half(goalKm),
            paceSec: r5(goalPace),
          };
        }
      } else if (s.t === 'I') item = intervalSession(c, list[idx], rp, z);
      else if (s.t === 'T') item = tempoSession(c, tempoKm, rp, z);
      if (item) {
        sessions.push({ d: s.d, ...item });
        if (item.type === 'interval' || item.type === 'tempo') qKm += item.distanceKm;
      } else sessions.push({ d: s.d, pending: s.t });
    }

    // 2. reszta objętości na spokojne i długie biegi
    if (kind !== 'final') {
      const pend = sessions.filter((s) => s.pending);
      const nE = pend.filter((s) => s.pending === 'E').length;
      const hasL = pend.some((s) => s.pending === 'L');
      const remaining = Math.max(volume[w] - qKm, 0);
      const longKm = hasL ? clamp(remaining * (nE ? 0.55 : 1), 3, MAX_LONG[c]) : 0;
      const easyKm = nE ? clamp((remaining - longKm) / nE, 3, 10) : 0;
      for (const s of pend) {
        const item = s.pending === 'L' ? longSession(longKm, z) : easySession(easyKm, z);
        delete s.pending;
        Object.assign(s, item);
      }
    }

    const dated = sessions.map((s) => {
      const d = new Date(monday);
      d.setDate(d.getDate() + w * 7 + s.d);
      const { d: dow, ...rest } = s;
      return { ...rest, dow, date: toKey(d), week: w + 1 };
    });

    out.push({
      n: w + 1,
      kind,
      phase: { build: 'Budowanie', recovery: 'Tydzień odpoczynku', taper: 'Zwężenie', final: 'Tydzień startowy' }[kind],
      racePaceSec: Math.round(rp),
      volumeKm: Math.round(dated.reduce((s, x) => s + x.distanceKm, 0) * 2) / 2,
      sessions: dated,
    });
  }

  const warnings = [];
  const a = assess({ currentPace, goalPace, weeks });
  if (a.level === 'ambitious') warnings.push(`Cel jest ambitny: orientacyjnie bezpieczniej byłoby mieć ok. ${a.rec} tygodni.`);
  if (a.level === 'risky') warnings.push(`Cel jest bardzo ambitny przy tym czasie: orientacyjnie potrzeba ok. ${a.rec} tygodni. Rozważ dłuższy plan albo mniej wymagający cel.`);
  if (out[0].volumeKm > baseKm * 1.3 + 3) {
    warnings.push(`Pierwszy tydzień ma ok. ${fmtK(out[0].volumeKm)} km, a teraz biegasz ok. ${fmtK(baseKm)} km tygodniowo. Rozważ mniej dni w tygodniu.`);
  }

  return {
    v: 1,
    params: { currentPace, goalPace, goalKm, weeks, days, baseKm, startDate: toKey(monday), createdAt: new Date().toISOString() },
    goalTimeSec: Math.round(goalPace * goalKm),
    warnings,
    weeks: out,
  };
}

// ---------- powiązanie z prawdziwymi treningami ----------
export function sessionStatus(s, runs, todayKey) {
  const km = sumKm(runs.filter((r) => r.date === s.date));
  const need = s.type === 'race' ? 0.9 : 0.7;
  if (km >= s.distanceKm * need) return 'done';
  if (s.date < todayKey) return km > 0 ? 'partial' : 'missed';
  if (s.date === todayKey) return km > 0 ? 'partial' : 'today';
  return 'upcoming';
}

export function allSessions(plan) {
  return plan.weeks.flatMap((w) => w.sessions);
}

export function planProgress(plan, runs, todayKey) {
  const all = allSessions(plan);
  const due = all.filter((s) => s.date <= todayKey);
  const done = all.filter((s) => sessionStatus(s, runs, todayKey) === 'done').length;
  return { total: all.length, due: due.length, done };
}

// najbliższa niezrobiona jednostka (dziś lub później)
export function nextSession(plan, runs, todayKey) {
  return (
    allSessions(plan).find((s) => s.date >= todayKey && sessionStatus(s, runs, todayKey) !== 'done') || null
  );
}

// ---------- podpowiedzi do formularza ----------
// najlepsze tempo na biegu o długości co najmniej 90% dystansu celu z ostatnich 60 dni
export function suggestCurrentPace(runs, goalKm) {
  const recent = inLastDays(runs, 0, 60).filter((r) => r.distanceKm >= goalKm * 0.9);
  if (recent.length === 0) return null;
  const best = recent.reduce((b, r) => (pace(r) < pace(b) ? r : b));
  return { paceSec: Math.round(pace(best)), date: best.date, km: best.distanceKm };
}

export function weeklyKmAverage(runs) {
  const km = sumKm(inLastDays(runs, 0, 28));
  return km > 0 ? Math.round(km / 4) : null;
}
