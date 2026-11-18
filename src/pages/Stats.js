import { useMemo, useState } from 'react';
import { useData } from '../context/DataContext';
import { BarChart, LineChart, Heatmap } from '../components/Charts';
import {
  thisMonth, addMonths, monthLabel, inMonth, sumKm, avgPace, pace, streaks,
  kmByMonth, paceByMonth, weekdayStats, bestPeriods, heatmapWeeks, predictions,
  fmtKm, fmtPace, fmtTime,
} from '../lib/utils';

function Record({ label, value, sub }) {
  return (
    <div className="card stat">
      <span>{label}</span>
      <strong>{value}</strong>
      {sub && <small className="muted">{sub}</small>}
    </div>
  );
}

export default function Stats() {
  const { runs } = useData();
  const [range, setRange] = useState(6);

  const s = useMemo(() => {
    const longest = runs.reduce((b, r) => (!b || r.distanceKm > b.distanceKm ? r : b), null);
    const fastest = runs.reduce((b, r) => (!b || pace(r) < pace(b) ? r : b), null);
    const cur = inMonth(runs, thisMonth());
    const prev = inMonth(runs, addMonths(thisMonth(), -1));
    return {
      longest,
      fastest,
      best: bestPeriods(runs),
      streak: streaks(runs),
      months: kmByMonth(runs, 12),
      weekdays: weekdayStats(runs),
      heat: heatmapWeeks(runs, 26),
      preds: predictions(runs),
      cmp: {
        cur: { km: sumKm(cur), n: cur.length, pace: avgPace(cur) },
        prev: { km: sumKm(prev), n: prev.length, pace: avgPace(prev) },
      },
    };
  }, [runs]);

  const paceData = useMemo(() => paceByMonth(runs, range), [runs, range]);

  if (runs.length === 0) {
    return (
      <>
        <h1 className="page-title">Statystyki</h1>
        <section className="card"><p className="muted">Dodaj pierwsze treningi, a tutaj pojawią się wykresy i rekordy.</p></section>
      </>
    );
  }

  const weekLabel = s.best.week && `tydzień od ${s.best.week.key}`;
  const delta = s.cmp.cur.pace && s.cmp.prev.pace ? s.cmp.prev.pace - s.cmp.cur.pace : null;

  return (
    <>
      <h1 className="page-title">Statystyki</h1>

      <h2 className="section-title">Rekordy</h2>
      <section className="stats">
        <Record label="Najdłuższy bieg" value={fmtKm(s.longest.distanceKm, 2)} sub={s.longest.date} />
        <Record label="Najszybsze tempo" value={fmtPace(pace(s.fastest))} sub={s.fastest.date} />
        <Record label="Najlepszy tydzień" value={fmtKm(s.best.week.value)} sub={weekLabel} />
        <Record label="Najlepszy miesiąc" value={fmtKm(s.best.month.value)} sub={monthLabel(s.best.month.key)} />
        <Record label="Najdłuższa seria" value={`${s.streak.longest} dni`} sub={`aktualna: ${s.streak.current}`} />
      </section>

      <section className="card">
        <h2>Ten miesiąc vs poprzedni</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th></th><th>{monthLabel(thisMonth())}</th><th>{monthLabel(addMonths(thisMonth(), -1))}</th></tr></thead>
            <tbody>
              <tr><td>Dystans</td><td>{fmtKm(s.cmp.cur.km)}</td><td>{fmtKm(s.cmp.prev.km)}</td></tr>
              <tr><td>Biegi</td><td>{s.cmp.cur.n}</td><td>{s.cmp.prev.n}</td></tr>
              <tr><td>Średnie tempo</td><td>{fmtPace(s.cmp.cur.pace)}</td><td>{fmtPace(s.cmp.prev.pace)}</td></tr>
            </tbody>
          </table>
        </div>
        {delta !== null && (
          <p className={delta >= 0 ? 'good' : 'bad'}>
            {delta >= 0 ? '▲ szybciej o ' : '▼ wolniej o '}{Math.abs(Math.round(delta))} s/km
          </p>
        )}
      </section>

      <section className="card">
        <h2>Kilometry miesięczne</h2>
        <BarChart data={s.months} />
      </section>

      <section className="card">
        <div className="page-head">
          <h2>Tempo w czasie</h2>
          <div className="pills">
            {[3, 6, 12].map((n) => (
              <button key={n} className={range === n ? 'pill active' : 'pill'} onClick={() => setRange(n)}>{n} mies.</button>
            ))}
          </div>
        </div>
        <LineChart data={paceData} invert format={(v) => fmtPace(v).replace(' /km', '')} />
        <p className="muted small">Średnie tempo w miesiącu. Im wyżej na wykresie, tym szybciej.</p>
      </section>

      <section className="card">
        <h2>Kalendarz aktywności (26 tygodni)</h2>
        <Heatmap weeks={s.heat} />
      </section>

      <section className="card">
        <h2>Dni tygodnia</h2>
        <BarChart data={s.weekdays} format={(v) => String(v)} height={170} />
        <p className="muted small">Liczba biegów w poszczególne dni tygodnia (cała historia).</p>
      </section>

      <section className="card">
        <h2>Prognozy czasów</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Dystans</th><th>Szacowany czas</th><th>Tempo</th></tr></thead>
            <tbody>
              {s.preds.map((p) => (
                <tr key={p.label}>
                  <td>{p.label}</td>
                  <td>{p.sec ? fmtTime(p.sec) : '–'}</td>
                  <td>{p.sec ? fmtPace(p.sec / p.km) : '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted small">
          Szacunek wzorem Riegela na podstawie Twoich najlepszych biegów od 3 km. To orientacyjna prognoza, a nie obietnica. 😉
        </p>
      </section>
    </>
  );
}
