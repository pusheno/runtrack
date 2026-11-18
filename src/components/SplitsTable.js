import { fmtTime, fmtPace } from '../lib/utils';

// splits: sekundy na każdy pełny kilometr; distanceKm i durationSec służą do policzenia ostatniego, niepełnego odcinka
export default function SplitsTable({ splits, distanceKm, durationSec }) {
  const rows = (splits || []).map((sec, i) => ({ label: String(i + 1), sec, pace: sec }));
  const full = rows.length;
  const restKm = distanceKm - full;
  const restSec = durationSec - rows.reduce((s, r) => s + r.sec, 0);
  if (restKm >= 0.05 && restSec > 0) {
    rows.push({ label: `${restKm.toFixed(2).replace('.', ',')} km`, sec: restSec, pace: restSec / restKm });
  }
  if (rows.length === 0) return <p className="muted small">Za krótki bieg na podział na kilometry.</p>;

  const paces = rows.map((r) => r.pace);
  const fastest = Math.min(...paces);
  const slowest = Math.max(...paces);

  return (
    <div className="splits">
      {rows.map((r, i) => {
        const width = slowest === fastest ? 100 : 55 + ((slowest - r.pace) / (slowest - fastest)) * 45;
        return (
          <div key={i} className={r.pace === fastest && rows.length > 1 ? 'split best' : 'split'}>
            <span className="split-km">{r.label}</span>
            <span className="split-bar"><i style={{ width: `${width}%` }} /></span>
            <span className="split-pace">{fmtPace(r.pace)}</span>
            <span className="split-time muted">{fmtTime(r.sec)}</span>
          </div>
        );
      })}
    </div>
  );
}
