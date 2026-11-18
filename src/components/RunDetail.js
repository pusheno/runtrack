import { useMemo } from 'react';
import RouteMap from './RouteMap';
import SplitsTable from './SplitsTable';
import { decodePolyline } from '../lib/gps';
import { fmtKm, fmtPace, fmtTime, pace } from '../lib/utils';

export default function RunDetail({ run, onClose }) {
  const coords = useMemo(() => (run.route ? decodePolyline(run.route) : []), [run.route]);
  const startTime = run.startedAt
    ? new Date(run.startedAt).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <section className="card">
      <div className="page-head">
        <h2>Bieg z {run.date}{startTime && `, ${startTime}`}</h2>
        <button className="ghost" onClick={onClose}>Zamknij</button>
      </div>
      <p>
        <strong>{fmtKm(run.distanceKm, 2)}</strong> · {fmtTime(run.durationSec)} · {fmtPace(pace(run))}
        {run.note && <span className="muted"> · {run.note}</span>}
      </p>
      {coords.length > 1 ? (
        <RouteMap coords={coords} />
      ) : (
        <p className="muted">Ten trening nie ma zapisanej trasy.</p>
      )}
      <h3 className="sub">Podział na kilometry</h3>
      <SplitsTable splits={run.splits} distanceKm={run.distanceKm} durationSec={run.durationSec} />
    </section>
  );
}
