import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../context/DataContext';
import { useTracker } from '../context/TrackerContext';
import RouteMap from '../components/RouteMap';
import SplitsTable from '../components/SplitsTable';
import { fmtKm, fmtPace, fmtTime, toKey } from '../lib/utils';

const MIN_SAVE_M = 50;

function Metric({ label, value, big }) {
  return (
    <div className={big ? 'metric big' : 'metric'}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function GpsChip({ accuracy }) {
  if (accuracy == null) return <span className="chip">GPS: …</span>;
  const cls = accuracy <= 12 ? 'good' : accuracy <= 30 ? 'mid' : 'bad';
  const txt = accuracy <= 12 ? 'dobry' : accuracy <= 30 ? 'średni' : 'słaby';
  return <span className={`chip ${cls}`}>GPS: {txt} (±{accuracy} m)</span>;
}

// ---------- ekran po zakończeniu biegu ----------
function Review() {
  const { result, demo, reset } = useTracker();
  const { addRun } = useData();
  const navigate = useNavigate();
  const [note, setNote] = useState(demo ? 'Symulacja (do usunięcia)' : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const km = result.distanceM / 1000;
  const tooShort = result.distanceM < MIN_SAVE_M || result.durationSec < 10;
  const avg = km > 0 ? result.durationSec / km : null;
  const best = result.splits.length ? Math.min(...result.splits) : null;

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      await addRun({
        date: toKey(new Date(result.startedAt)),
        distanceKm: Math.round(result.distanceM) / 1000,
        durationSec: result.durationSec,
        note: note.trim() || null,
        route: result.route || null,
        splits: result.splits,
        startedAt: result.startedAt,
        source: demo ? 'demo' : 'gps',
      });
      reset();
      navigate('/treningi');
    } catch (e) {
      setError(e.message || 'Nie udało się zapisać treningu.');
    } finally {
      setBusy(false);
    }
  };

  const discard = () => {
    if (window.confirm('Odrzucić ten bieg? Nie będzie można go odzyskać.')) reset();
  };

  return (
    <>
      <h1 className="page-title">Podsumowanie biegu 🎉</h1>
      {demo && (
        <section className="card notice">
          To była <strong>symulacja</strong>. Jeśli ją zapiszesz, usuń potem ten trening w zakładce Treningi, żeby nie psuł statystyk i rankingu.
        </section>
      )}

      <section className="stats">
        <div className="card stat"><span>Dystans</span><strong>{fmtKm(km, 2)}</strong></div>
        <div className="card stat"><span>Czas</span><strong>{fmtTime(result.durationSec)}</strong></div>
        <div className="card stat"><span>Średnie tempo</span><strong>{fmtPace(avg)}</strong></div>
        <div className="card stat"><span>Najszybszy km</span><strong>{best ? fmtPace(best) : '–'}</strong></div>
      </section>

      <section className="card">
        <h2>Trasa</h2>
        {result.coords.length > 1 ? <RouteMap coords={result.coords} /> : <p className="muted">Brak zapisanych punktów trasy.</p>}
      </section>

      <section className="card">
        <h2>Podział na kilometry</h2>
        <SplitsTable splits={result.splits} distanceKm={km} durationSec={result.durationSec} />
      </section>

      <section className="card">
        <input
          className="wide"
          placeholder="Notatka (opcjonalnie)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={200}
        />
        {tooShort && (
          <p className="bad">Ten bieg jest za krótki, żeby go zapisać (minimum {MIN_SAVE_M} m i 10 s).</p>
        )}
        {error && <p className="bad">{error}</p>}
        <div className="form-actions" style={{ marginTop: 12 }}>
          <button onClick={save} disabled={busy || tooShort}>{busy ? 'Zapisuję…' : 'Zapisz trening'}</button>
          <button className="ghost" onClick={discard} disabled={busy}>Odrzuć</button>
        </div>
      </section>
    </>
  );
}

// ---------- główny widok ----------
export default function Record() {
  const t = useTracker();

  if (t.phase === 'finished' && t.result) return <Review />;

  const { phase, live, info, path } = t;
  const km = live.distanceM / 1000;
  const avg = km > 0.01 ? live.elapsedMs / 1000 / km : null;

  const finish = () => {
    if (window.confirm('Zakończyć bieg?')) t.finish();
  };

  if (phase === 'idle') {
    return (
      <>
        <h1 className="page-title">Nagraj bieg</h1>
        <section className="card center">
          <p className="muted">
            Po naciśnięciu Start przeglądarka poprosi o zgodę na lokalizację. Trasa, dystans i tempo
            policzą się na podstawie GPS.
          </p>
          {!t.secure && (
            <p className="bad">Lokalizacja działa tylko na stronach HTTPS (albo localhost). Ta strona jest otwarta przez zwykłe HTTP.</p>
          )}
          {info.error && <p className="bad">{info.error}</p>}
          <button className="start-btn" onClick={() => t.start(false)}>▶ Start</button>
        </section>

        <section className="card">
          <h2>Zanim pobiegniesz</h2>
          <ul className="tips">
            <li>Trzymaj aplikację otwartą i ekran włączony. Przeglądarka zwykle wstrzymuje GPS po zablokowaniu telefonu.</li>
            <li>Przed startem poczekaj na dobry sygnał GPS (±30 m lub lepiej). Pomiar ruszy dopiero wtedy.</li>
            <li>Szczegóły trasy widzisz tylko Ty. W rankingu pokazują się wyłącznie sumy miesięczne.</li>
          </ul>
          <button className="ghost" onClick={() => t.start(true)}>Tryb symulacji (test bez wychodzenia)</button>
        </section>
      </>
    );
  }

  return (
    <>
      <h1 className="page-title">
        {phase === 'running' ? 'Bieg trwa' : phase === 'paused' ? 'Pauza' : 'Szukam GPS…'}
        {t.demo && <span className="chip mid" style={{ marginLeft: 8 }}>symulacja ×10</span>}
      </h1>

      {t.recovered && (
        <section className="card notice">
          Odzyskano nieukończony bieg. Możesz go wznowić albo zakończyć i zapisać.
        </section>
      )}
      {info.error && <section className="card notice bad">{info.error}</section>}

      <section className="card">
        <div className="live-top">
          <GpsChip accuracy={info.accuracy} />
          {phase === 'searching' && <span className="muted small">Czekam na dokładność ±30 m lub lepszą…</span>}
          {!t.wakeLockSupported && phase === 'running' && (
            <span className="muted small">Przeglądarka nie pozwala zablokować wygaszania ekranu. Wyłącz je ręcznie na czas biegu.</span>
          )}
        </div>
        <div className="metrics">
          <Metric big label="czas" value={fmtTime(live.elapsedMs / 1000)} />
          <Metric big label="dystans" value={fmtKm(km, 2)} />
          <Metric label="tempo teraz" value={fmtPace(live.currentPace)} />
          <Metric label="tempo średnie" value={fmtPace(avg)} />
        </div>

        <div className="controls">
          {phase === 'running' && <button className="pause-btn" onClick={t.pause}>⏸ Pauza</button>}
          {phase === 'paused' && <button onClick={t.resume}>▶ Wznów</button>}
          {phase === 'searching' && <button className="ghost" onClick={t.pause}>Anuluj</button>}
          {phase !== 'searching' && <button className="stop-btn" onClick={finish}>⏹ Koniec</button>}
        </div>
      </section>

      <section className="card">
        <RouteMap coords={path} follow={phase === 'running'} height={340} />
      </section>
    </>
  );
}
