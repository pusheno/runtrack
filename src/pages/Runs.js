import { useMemo, useState } from 'react';
import { useData } from '../context/DataContext';
import RunForm from '../components/RunForm';
import RunDetail from '../components/RunDetail';
import { monthKey, monthLabel, sumKm, fmtKm, fmtPace, fmtTime, pace } from '../lib/utils';

export default function Runs() {
  const { runs, runsLoaded, addRun, updateRun, removeRun } = useData();
  const [month, setMonth] = useState('all');
  const [minKm, setMinKm] = useState('');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const [viewingId, setViewingId] = useState(null);
  const [error, setError] = useState('');
  const viewing = runs.find((r) => r.id === viewingId) || null;

  const months = useMemo(() => [...new Set(runs.map((r) => monthKey(r.date)))].sort().reverse(), [runs]);

  const filtered = useMemo(() => {
    const min = parseFloat(minKm.replace(',', '.')) || 0;
    return runs.filter((r) => (month === 'all' || monthKey(r.date) === month) && r.distanceKm >= min);
  }, [runs, month, minKm]);

  const remove = async (id) => {
    if (!window.confirm('Usunąć ten trening?')) return;
    setError('');
    try {
      await removeRun(id);
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <>
      <div className="page-head">
        <h1 className="page-title">Treningi</h1>
        <button onClick={() => { setAdding(!adding); setEditing(null); }}>
          {adding ? 'Zamknij' : '+ Nowy trening'}
        </button>
      </div>

      {viewing && <RunDetail key={viewing.id} run={viewing} onClose={() => setViewingId(null)} />}

      {adding && (
        <section className="card">
          <h2>Nowy trening</h2>
          <RunForm onSubmit={addRun} />
        </section>
      )}

      {editing && (
        <section className="card">
          <h2>Edytuj trening</h2>
          <RunForm
            key={editing.id}
            initial={editing}
            submitLabel="Zapisz"
            onCancel={() => setEditing(null)}
            onSubmit={async (values) => {
              await updateRun(editing.id, values);
              setEditing(null);
            }}
          />
        </section>
      )}

      <section className="card">
        <div className="filters">
          <select value={month} onChange={(e) => setMonth(e.target.value)}>
            <option value="all">Wszystkie miesiące</option>
            {months.map((m) => (
              <option key={m} value={m}>{monthLabel(m)}</option>
            ))}
          </select>
          <input
            placeholder="Min. dystans (km)"
            value={minKm}
            onChange={(e) => setMinKm(e.target.value)}
            inputMode="decimal"
          />
          <span className="muted">
            {filtered.length} bieg(ów) · {fmtKm(sumKm(filtered))}
          </span>
        </div>

        {error && <p className="bad">{error}</p>}

        {!runsLoaded ? (
          <p className="muted">Ładowanie…</p>
        ) : filtered.length === 0 ? (
          <p className="muted">Brak treningów dla wybranych filtrów.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Data</th><th>Dystans</th><th>Czas</th><th>Tempo</th><th>Notatka</th><th></th></tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id}>
                    <td>{r.date}</td>
                    <td>{fmtKm(r.distanceKm, 2)}</td>
                    <td>{fmtTime(r.durationSec)}</td>
                    <td>{fmtPace(pace(r))}</td>
                    <td>{r.note}</td>
                    <td className="row-actions">
                      {r.route && (
                        <button className="ghost" title="Trasa i podział km" onClick={() => { setViewingId(r.id); window.scrollTo(0, 0); }}>🗺</button>
                      )}
                      <button className="ghost" title="Edytuj" onClick={() => { setEditing(r); setAdding(false); window.scrollTo(0, 0); }}>✎</button>
                      <button className="ghost" title="Usuń" onClick={() => remove(r.id)}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
