import { useMemo, useState } from 'react';
import { useData } from '../context/DataContext';
import {
  GOALS, parsePace, assess, generatePlan, pf, sessionStatus, planProgress,
  suggestCurrentPace, weeklyKmAverage,
} from '../lib/plan';
import { today, toKey, parseDate, fmtTime, fmtKm } from '../lib/utils';

const TYPE = {
  easy: { label: 'Spokojny', cls: 't-easy' },
  long: { label: 'Długi', cls: 't-long' },
  tempo: { label: 'Tempo', cls: 't-tempo' },
  interval: { label: 'Interwały', cls: 't-interval' },
  race: { label: 'Start', cls: 't-race' },
};
const STATUS = {
  done: { icon: '✔', cls: 'good', title: 'Zrobione' },
  partial: { icon: '◐', cls: 'mid', title: 'Częściowo' },
  missed: { icon: '✕', cls: 'bad', title: 'Pominięte' },
  today: { icon: '●', cls: 'today', title: 'Dziś' },
  upcoming: { icon: '', cls: '', title: '' },
};

const nextMonday = () => {
  const d = new Date();
  const dow = (d.getDay() + 6) % 7; // 0 = poniedziałek
  if (dow !== 0) d.setDate(d.getDate() + (7 - dow));
  return toKey(d);
};

const dayLabel = (key) =>
  parseDate(key).toLocaleDateString('pl-PL', { weekday: 'short', day: 'numeric', month: 'numeric' });

// ---------- formularz ----------
const paceText = (sec) => (sec ? pf(sec).replace('/km', '') : '');

function PlanForm({ runs, initial, onGenerate }) {
  const [goalKm, setGoalKm] = useState(initial?.goalKm || 5);
  const [current, setCurrent] = useState(paceText(initial?.currentPace));
  const [goal, setGoal] = useState(paceText(initial?.goalPace));
  const [weeks, setWeeks] = useState(initial?.weeks || 12);
  const [days, setDays] = useState(initial?.days || 4);
  const [baseKm, setBaseKm] = useState(String(initial?.baseKm || weeklyKmAverage(runs) || 20));
  const [startDate, setStartDate] = useState(nextMonday());
  const [error, setError] = useState('');

  const cur = parsePace(current);
  const gl = parsePace(goal);
  const suggestion = useMemo(() => suggestCurrentPace(runs, goalKm), [runs, goalKm]);
  const check = cur && gl && gl < cur ? assess({ currentPace: cur, goalPace: gl, weeks }) : null;

  const submit = (e) => {
    e.preventDefault();
    setError('');
    const base = parseFloat(baseKm.replace(',', '.'));
    if (!cur) return setError('Podaj obecne tempo w formacie m:ss, np. 4:30 (może być też 4.30).');
    if (!gl) return setError('Podaj tempo docelowe w formacie m:ss, np. 4:10.');
    if (gl >= cur) return setError('Tempo docelowe musi być szybsze (mniejsze) niż obecne.');
    if (!(base >= 5 && base <= 150)) return setError('Podaj, ile km tygodniowo biegasz teraz (5-150).');
    try {
      onGenerate(generatePlan({ currentPace: cur, goalPace: gl, goalKm, weeks, days, baseKm: base, startDate }));
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <form onSubmit={submit} className="card profile-form wide-form">
      <h2>Nowy plan treningowy</h2>

      <label>
        Dystans docelowy
        <select value={goalKm} onChange={(e) => setGoalKm(Number(e.target.value))}>
          {GOALS.map((g) => <option key={g.km} value={g.km}>{g.label}</option>)}
        </select>
      </label>

      <label>
        Tempo, które teraz utrzymasz na tym dystansie (min/km)
        <input value={current} onChange={(e) => setCurrent(e.target.value)} placeholder="np. 4:30" inputMode="text" />
        {suggestion && (
          <small className="hint">
            Z Twoich biegów: {pf(suggestion.paceSec)} ({fmtKm(suggestion.km, 1)}, {suggestion.date}){' '}
            <button type="button" className="link" onClick={() => setCurrent(pf(suggestion.paceSec).replace('/km', ''))}>użyj</button>
          </small>
        )}
      </label>

      <label>
        Tempo docelowe (min/km)
        <input value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="np. 4:10" />
      </label>

      <div className="row2">
        <label>
          Liczba tygodni: <strong>{weeks}</strong>
          <input type="range" min="4" max="16" value={weeks} onChange={(e) => setWeeks(Number(e.target.value))} />
        </label>
        <label>
          Dni biegowe w tygodniu
          <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {[2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      </div>

      <div className="row2">
        <label>
          Ile km tygodniowo biegasz teraz
          <input value={baseKm} onChange={(e) => setBaseKm(e.target.value)} inputMode="decimal" />
        </label>
        <label>
          Start planu (poniedziałek)
          <input type="date" value={startDate} min={today()} onChange={(e) => setStartDate(e.target.value)} />
        </label>
      </div>

      {check && (
        <div className={`assess ${check.level}`}>
          Poprawa o <strong>{Math.round(check.gain)} s/km</strong> ({check.pct.toFixed(1).replace('.', ',')}%).{' '}
          {check.level === 'ok' && 'To realny cel w tym czasie.'}
          {check.level === 'ambitious' && `Ambitnie: orientacyjnie lepiej ok. ${check.rec} tyg.`}
          {check.level === 'risky' && `Bardzo ambitnie: orientacyjnie potrzeba ok. ${check.rec} tyg.`}
          {check.level !== 'ok' && (
            <> <button type="button" className="link" onClick={() => setWeeks(check.rec)}>ustaw {check.rec} tyg.</button></>
          )}
        </div>
      )}

      {error && <p className="bad">{error}</p>}
      <div className="form-actions"><button type="submit">Generuj plan</button></div>
    </form>
  );
}

// ---------- widok planu ----------
function PlanView({ plan, runs, draft, busy, error, onSave, onBack, onDelete }) {
  const todayKey = today();
  const currentWeek =
    plan.weeks.find((w) => w.sessions[w.sessions.length - 1].date >= todayKey)?.n || plan.weeks[plan.weeks.length - 1].n;
  const [open, setOpen] = useState(() => new Set([draft ? 1 : currentWeek]));
  const toggle = (n) => setOpen((s) => {
    const x = new Set(s);
    if (x.has(n)) x.delete(n); else x.add(n);
    return x;
  });

  const { params } = plan;
  const goalLabel = GOALS.find((g) => g.km === params.goalKm)?.label || `${params.goalKm} km`;
  const prog = planProgress(plan, runs, todayKey);
  const first = plan.weeks[0].sessions[0].date;
  const lastDate = plan.weeks[plan.weeks.length - 1].sessions.slice(-1)[0].date;

  return (
    <>
      {draft && (
        <section className="card notice">
          To jest <strong>podgląd</strong>. Plan nie jest jeszcze zapisany.
          <div className="form-actions" style={{ marginTop: 10 }}>
            <button onClick={onSave} disabled={busy}>{busy ? 'Zapisuję…' : 'Zapisz plan'}</button>
            <button className="ghost" onClick={onBack} disabled={busy}>Zmień parametry</button>
          </div>
          {error && <p className="bad">{error}</p>}
        </section>
      )}

      <section className="card">
        <h2>Cel: {goalLabel} w {fmtTime(plan.goalTimeSec)}</h2>
        <p className="muted">
          Tempo {pf(params.currentPace)} → {pf(params.goalPace)} · {params.weeks} tyg. · {params.days} dni w tygodniu<br />
          {dayLabel(first)} – {dayLabel(lastDate)}
        </p>
        {plan.warnings.map((w, i) => <p key={i} className="warn">⚠ {w}</p>)}
        {!draft && (
          <>
            <div className="progress"><div style={{ width: `${prog.due ? (prog.done / prog.due) * 100 : 0}%` }} /></div>
            <p>
              Zrealizowano <strong>{prog.done}</strong> z {prog.due} jednostek, które już minęły (cały plan: {prog.total}).
            </p>
            <button className="ghost" onClick={onDelete}>Usuń plan i stwórz nowy</button>
          </>
        )}
      </section>

      {plan.weeks.map((w) => {
        const isOpen = open.has(w.n);
        const isCurrent = !draft && w.n === currentWeek;
        return (
          <section key={w.n} className={`card week ${isCurrent ? 'current' : ''}`}>
            <button className="week-head" onClick={() => toggle(w.n)} aria-expanded={isOpen}>
              <span>
                <strong>Tydzień {w.n}</strong>
                <span className="muted"> · {w.phase}{isCurrent ? ' · teraz' : ''}</span>
              </span>
              <span className="muted">{fmtKm(w.volumeKm, 1)} {isOpen ? '▴' : '▾'}</span>
            </button>
            {isOpen && (
              <div className="sessions">
                {w.sessions.map((s) => {
                  const st = draft ? STATUS.upcoming : STATUS[sessionStatus(s, runs, todayKey)];
                  const t = TYPE[s.type];
                  return (
                    <div key={s.date} className={`session ${st.cls === 'today' ? 'is-today' : ''}`}>
                      <div className="s-date">{dayLabel(s.date)}</div>
                      <div className="s-body">
                        <div>
                          <span className={`badge ${t.cls}`}>{t.label}</span>
                          <strong> {s.title}</strong>
                          <span className="muted"> · {fmtKm(s.distanceKm, 1)}</span>
                        </div>
                        <div className="muted small">{s.detail}</div>
                      </div>
                      <div className={`s-status ${st.cls}`} title={st.title}>{st.icon}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}

      <p className="muted small">
        Plan jest wygenerowany regułami na podstawie Twoich danych i ma charakter orientacyjny. Nie zastępuje trenera ani
        konsultacji lekarskiej. Przy bólu lub przemęczeniu odpuść jednostkę.
      </p>
    </>
  );
}

// ---------- strona ----------
export default function Plan() {
  const { runs, plan, planLoaded, savePlan, removePlan } = useData();
  const [draft, setDraft] = useState(null);
  const [lastParams, setLastParams] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      await savePlan(draft);
      setDraft(null);
    } catch (e) {
      setError(e.message || 'Nie udało się zapisać planu.');
    } finally {
      setBusy(false);
    }
  };

  const del = async () => {
    if (!window.confirm('Usunąć obecny plan? Tej operacji nie można cofnąć.')) return;
    try {
      await removePlan();
    } catch (e) {
      window.alert(e.message);
    }
  };

  if (!planLoaded) return <><h1 className="page-title">Plan treningowy</h1><p className="muted">Ładowanie…</p></>;

  return (
    <>
      <h1 className="page-title">Plan treningowy</h1>
      {draft ? (
        <PlanView plan={draft} runs={runs} draft busy={busy} error={error} onSave={save} onBack={() => setDraft(null)} />
      ) : plan ? (
        <PlanView plan={plan} runs={runs} onDelete={del} />
      ) : (
        <PlanForm runs={runs} initial={lastParams} onGenerate={(p) => { setLastParams(p.params); setDraft(p); }} />
      )}
    </>
  );
}
