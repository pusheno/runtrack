import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../context/DataContext';
import { useTracker } from '../context/TrackerContext';
import RunForm from '../components/RunForm';
import { BarChart } from '../components/Charts';
import {
  today, thisMonth, weekStart, inMonth, sumKm, inLastDays, avgPace, streaks,
  kmByWeek, fmtKm, fmtPace, fmtTime, pace, parseDate,
} from '../lib/utils';
import { nextSession } from '../lib/plan';

export default function Dashboard() {
  const { runs, profile, addRun, plan } = useData();
  const tracker = useTracker();
  const next = plan ? nextSession(plan, runs, today()) : null;
  const dayShort = (key) =>
    parseDate(key).toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'numeric' });

  const d = useMemo(() => {
    const monthKm = sumKm(inMonth(runs, thisMonth()));
    const ws = weekStart(today()).getTime();
    const weekKm = sumKm(runs.filter((r) => weekStart(r.date).getTime() === ws));
    const prevWeekKm = sumKm(runs.filter((r) => weekStart(r.date).getTime() === ws - 7 * 86400000));
    return {
      monthKm,
      weekKm,
      prevWeekKm,
      streak: streaks(runs),
      pace30: avgPace(inLastDays(runs, 0, 30)),
      weeks: kmByWeek(runs, 8),
    };
  }, [runs]);

  const goal = profile.monthlyGoalKm || 0;
  const percent = goal > 0 ? Math.min(100, (d.monthKm / goal) * 100) : 0;
  const last = runs[0];
  const weekDiff = d.weekKm - d.prevWeekKm;

  return (
    <>
      <h1 className="page-title">Cześć, {profile.nickname}! 👋</h1>

      <Link to="/bieg" className="cta">
        <span>{tracker.active ? '● Bieg trwa. Wróć do nagrywania' : '▶ Zacznij bieg z GPS'}</span>
      </Link>

      {plan && next && (
        <Link to="/plan" className="card plan-card">
          <span className="muted small">
            {next.date === today() ? 'Dziś w planie' : `Następny w planie: ${dayShort(next.date)}`}
          </span>
          <strong>{next.title}</strong>
          <span className="muted small">{next.detail}</span>
        </Link>
      )}

      <section className="card">
        <h2>Cel miesięczny</h2>
        {goal > 0 ? (
          <>
            <div className="progress"><div style={{ width: `${percent}%` }} /></div>
            <p>
              <strong>{fmtKm(d.monthKm)}</strong> z {fmtKm(goal, 0)} ({Math.round(percent)}%)
              {d.monthKm >= goal && ' 🎉 Cel osiągnięty!'}
            </p>
          </>
        ) : (
          <p className="muted">
            Nie ustawiono celu. Możesz go dodać w <Link to="/profil">profilu</Link>.
          </p>
        )}
      </section>

      <section className="stats">
        <div className="card stat">
          <span>Ten tydzień</span>
          <strong>{fmtKm(d.weekKm)}</strong>
          {d.prevWeekKm > 0 && (
            <small className={weekDiff >= 0 ? 'good' : 'bad'}>
              {weekDiff >= 0 ? '▲' : '▼'} {fmtKm(Math.abs(weekDiff))} vs poprzedni
            </small>
          )}
        </div>
        <div className="card stat">
          <span>Seria dni</span>
          <strong>{d.streak.current} 🔥</strong>
          <small className="muted">rekord: {d.streak.longest}</small>
        </div>
        <div className="card stat">
          <span>Tempo (30 dni)</span>
          <strong>{fmtPace(d.pace30)}</strong>
        </div>
      </section>

      <section className="card">
        <h2>Ostatni bieg</h2>
        {last ? (
          <p>
            <strong>{last.date}</strong> · {fmtKm(last.distanceKm, 2)} w {fmtTime(last.durationSec)} · tempo{' '}
            {fmtPace(pace(last))}
            {last.note && <span className="muted"> · {last.note}</span>}
          </p>
        ) : (
          <p className="muted">Brak treningów. Dodaj pierwszy poniżej! 👟</p>
        )}
      </section>

      <section className="card">
        <h2>Dodaj trening</h2>
        <RunForm onSubmit={addRun} />
      </section>

      <section className="card">
        <h2>Kilometry tygodniowo</h2>
        <BarChart data={d.weeks} />
        <p><Link to="/statystyki">Więcej statystyk →</Link></p>
      </section>
    </>
  );
}
