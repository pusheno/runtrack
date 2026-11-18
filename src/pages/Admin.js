import { useCallback, useEffect, useMemo, useState } from 'react';
import { useData } from '../context/DataContext';
import { client, listAll } from '../lib/api';
import { BarChart } from '../components/Charts';
import { aggregate, toCsv } from '../lib/adminStats';
import { today, fmtKm, fmtPace } from '../lib/utils';

const pct = (x) => (x == null ? '–' : `${Math.round(x * 100)}%`);
const num = (x, d = 1) => (x == null ? '–' : x.toFixed(d).replace('.', ','));

function Tile({ label, value, sub }) {
  return (
    <div className="card stat">
      <span>{label}</span>
      <strong>{value}</strong>
      {sub && <small className="muted">{sub}</small>}
    </div>
  );
}

const COLUMNS = [
  { key: 'nickname', label: 'Pseudonim', get: (r) => (r.nickname || '').toLowerCase() },
  { key: 'runs', label: 'Biegi', get: (r) => r.runs },
  { key: 'totalKm', label: 'Km', get: (r) => r.totalKm },
  { key: 'avgPace', label: 'Śr. tempo', get: (r) => (r.totalKm > 0 ? r.totalSec / r.totalKm : Infinity) },
  { key: 'bestPaceSec', label: 'Najlepsze', get: (r) => r.bestPaceSec ?? Infinity },
  { key: 'lastRun', label: 'Ostatni bieg', get: (r) => r.lastRun || '' },
];

export default function Admin() {
  const { isAdmin } = useData();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sort, setSort] = useState({ key: 'totalKm', dir: -1 });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setRows(await listAll(client.models.UserStats));
    } catch (e) {
      setError(e.message || 'Nie udało się pobrać statystyk.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  const agg = useMemo(() => (rows ? aggregate(rows, today()) : null), [rows]);

  const sorted = useMemo(() => {
    if (!rows) return [];
    const col = COLUMNS.find((c) => c.key === sort.key);
    return rows.slice().sort((a, b) => {
      const x = col.get(a);
      const y = col.get(b);
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
  }, [rows, sort]);

  const setSortKey = (key) =>
    setSort((s) => (s.key === key ? { key, dir: -s.dir } : { key, dir: key === 'nickname' || key === 'avgPace' || key === 'bestPaceSec' ? 1 : -1 }));

  const exportCsv = () => {
    const blob = new Blob([toCsv(sorted)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `runtrack-uzytkownicy-${today()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!isAdmin) {
    return (
      <>
        <h1 className="page-title">Panel administratora</h1>
        <section className="card">
          <p>Ta strona jest dostępna tylko dla administratora.</p>
        </section>
      </>
    );
  }

  return (
    <>
      <div className="page-head">
        <h1 className="page-title">🛡 Panel administratora</h1>
        <div className="form-actions">
          <button className="ghost" onClick={load} disabled={loading}>{loading ? 'Odświeżam…' : '↻ Odśwież'}</button>
          <button className="ghost" onClick={exportCsv} disabled={!rows || rows.length === 0}>⬇ CSV</button>
        </div>
      </div>

      {error && <section className="card notice bad">{error}</section>}
      {!rows && !error && <p className="muted">Ładowanie…</p>}

      {agg && (
        <>
          <p className="muted small">
            Dane zbiorcze: pseudonim, sumy i średnie. Brak tras, notatek i pojedynczych treningów. Podsumowanie
            użytkownika odświeża się, gdy ten otworzy aplikację.
          </p>

          <h2 className="section-title">Użytkownicy</h2>
          <section className="stats">
            <Tile label="Wszyscy" value={agg.users} sub={`z biegami: ${agg.withRuns}`} />
            <Tile label="Aktywni 7 dni" value={agg.active7} sub="ostatni bieg ≤ 7 dni temu" />
            <Tile label="Aktywni 30 dni" value={agg.active30} />
            <Tile label="Nowi biegacze" value={agg.newcomers30} sub="pierwszy bieg w 30 dni" />
            <Tile label="Z planem" value={agg.plans} sub={agg.users ? pct(agg.plans / agg.users) : ''} />
          </section>

          <h2 className="section-title">Średnie</h2>
          <section className="stats">
            <Tile label="Łącznie km" value={fmtKm(agg.totalKm, 0)} sub={`${agg.totalRuns} biegów`} />
            <Tile label="Km na użytkownika" value={agg.avgKmPerUser == null ? '–' : fmtKm(agg.avgKmPerUser)} />
            <Tile label="Biegi na użytkownika" value={num(agg.avgRunsPerUser)} />
            <Tile label="Średni bieg" value={agg.avgRunKm == null ? '–' : fmtKm(agg.avgRunKm, 2)} />
            <Tile label="Tempo (ważone km)" value={fmtPace(agg.pooledPace)} />
            <Tile label="Mediana tempa" value={fmtPace(agg.medianUserPace)} sub="średnie tempo użytkowników" />
            <Tile label="Biegi z GPS" value={pct(agg.gpsShare)} />
          </section>

          <section className="card">
            <h2>Kilometry wszystkich, miesięcznie</h2>
            <BarChart data={agg.months.map((m) => ({ label: m.label, value: m.km }))} format={(v) => v.toFixed(0)} />
          </section>

          <section className="card">
            <h2>Aktywni użytkownicy, miesięcznie</h2>
            <BarChart data={agg.months.map((m) => ({ label: m.label, value: m.active }))} format={(v) => String(v)} height={170} />
          </section>

          <section className="card">
            <h2>Rozkład średniego tempa użytkowników</h2>
            <BarChart data={agg.buckets} format={(v) => String(v)} height={170} />
            <p className="muted small">Przedziały co 30 s/km, np. „4:30" to 4:30–4:59 /km.</p>
          </section>

          <section className="card">
            <h2>Użytkownicy ({rows.length})</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    {COLUMNS.map((c) => (
                      <th key={c.key} className="sortable" onClick={() => setSortKey(c.key)}>
                        {c.label}{sort.key === c.key ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
                      </th>
                    ))}
                    <th>Plan</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((r) => (
                    <tr key={r.id}>
                      <td>{r.nickname}</td>
                      <td>{r.runs}</td>
                      <td>{fmtKm(r.totalKm, 1)}</td>
                      <td>{r.totalKm > 0 ? fmtPace(r.totalSec / r.totalKm) : '–'}</td>
                      <td>{r.bestPaceSec ? fmtPace(r.bestPaceSec) : '–'}</td>
                      <td>{r.lastRun || '–'}</td>
                      <td>{r.hasPlan ? '✔' : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </>
  );
}
