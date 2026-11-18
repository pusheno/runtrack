import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../context/DataContext';
import { client, listAll } from '../lib/api';
import { thisMonth, addMonths, monthLabel, fmtKm, fmtPace } from '../lib/utils';

const PERIODS = [
  { id: 'month', label: 'Ten miesiąc' },
  { id: 'prev', label: 'Poprzedni' },
  { id: 'all', label: 'Cały czas' },
];
const METRICS = [
  { id: 'km', label: 'Kilometry' },
  { id: 'runs', label: 'Liczba biegów' },
  { id: 'pace', label: 'Najlepsze tempo' },
];
const MEDALS = ['🥇', '🥈', '🥉'];

export default function Ranking() {
  const { userId, profile } = useData();
  const [period, setPeriod] = useState('month');
  const [metric, setMetric] = useState('km');
  const [scores, setScores] = useState(null);

  useEffect(() => {
    let off = false;
    setScores(null);
    (async () => {
      const now = thisMonth();
      const filter =
        period === 'all' ? undefined : { month: { eq: period === 'month' ? now : addMonths(now, -1) } };
      const items = await listAll(client.models.MonthlyScore, filter ? { filter } : {});
      if (!off) setScores(items);
    })().catch((e) => {
      console.error(e);
      if (!off) setScores([]);
    });
    return () => {
      off = true;
    };
  }, [period]);

  const rows = useMemo(() => {
    if (!scores) return [];
    const byUser = new Map();
    scores
      .slice()
      .sort((a, b) => (a.month < b.month ? -1 : 1))
      .forEach((s) => {
        const uid = s.id.split('_')[0];
        const cur = byUser.get(uid) || { userId: uid, km: 0, runs: 0, pace: null };
        cur.nickname = s.nickname; // najnowszy pseudonim
        cur.km += s.totalKm;
        cur.runs += s.runs;
        if (s.bestPaceSec && (cur.pace === null || s.bestPaceSec < cur.pace)) cur.pace = s.bestPaceSec;
        byUser.set(uid, cur);
      });

    let list = [...byUser.values()];
    if (metric === 'pace') list = list.filter((r) => r.pace !== null);
    list.sort((a, b) => {
      if (metric === 'runs') return b.runs - a.runs || b.km - a.km;
      if (metric === 'pace') return a.pace - b.pace;
      return b.km - a.km;
    });
    return list.map((r, i) => ({ ...r, rank: i + 1 }));
  }, [scores, metric]);

  const top = rows.slice(0, 10);
  const me = rows.find((r) => r.userId === userId);
  const meOutside = me && me.rank > 10;

  const value = (r) =>
    metric === 'runs' ? `${r.runs}` : metric === 'pace' ? fmtPace(r.pace) : fmtKm(r.km);

  const Row = ({ r }) => (
    <li className={r.userId === userId ? 'rank-row me' : 'rank-row'}>
      <span className="rank-pos">{MEDALS[r.rank - 1] || r.rank}</span>
      <span className="rank-name">{r.nickname}{r.userId === userId && ' (Ty)'}</span>
      <span className="rank-val">{value(r)}</span>
    </li>
  );

  return (
    <>
      <h1 className="page-title">🏆 Ranking</h1>

      {!profile.showInRanking && (
        <section className="card notice">
          Nie pokazujesz się w rankingu. Włącz to w <Link to="/profil">profilu</Link>, a Twój pseudonim i wyniki
          miesięczne (bez szczegółów treningów) będą widoczne dla innych.
        </section>
      )}

      <section className="card">
        <div className="pills">
          {PERIODS.map((p) => (
            <button key={p.id} className={period === p.id ? 'pill active' : 'pill'} onClick={() => setPeriod(p.id)}>{p.label}</button>
          ))}
        </div>
        <div className="pills">
          {METRICS.map((m) => (
            <button key={m.id} className={metric === m.id ? 'pill active' : 'pill'} onClick={() => setMetric(m.id)}>{m.label}</button>
          ))}
        </div>
        {period !== 'all' && (
          <p className="muted small">
            {monthLabel(period === 'month' ? thisMonth() : addMonths(thisMonth(), -1))}
          </p>
        )}

        {scores === null ? (
          <p className="muted">Ładowanie…</p>
        ) : top.length === 0 ? (
          <p className="muted">Nikt jeszcze nie pojawił się w tym rankingu. Bądź pierwszy! 🏁</p>
        ) : (
          <ol className="rank-list">
            {top.map((r) => <Row key={r.userId} r={r} />)}
            {meOutside && (
              <>
                <li className="rank-gap">…</li>
                <Row r={me} />
              </>
            )}
          </ol>
        )}
      </section>
    </>
  );
}
