// Proste wykresy w SVG (bez dodatkowych bibliotek)

export function BarChart({ data, format = (v) => v.toFixed(1), height = 200 }) {
  const W = 600;
  const H = height;
  const padX = 16;
  const top = 18;
  const bottom = 26;
  const max = Math.max(...data.map((d) => d.value), 1);
  const step = (W - padX * 2) / data.length;
  const bw = Math.min(44, step * 0.7);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img">
      <line x1={padX} x2={W - padX} y1={H - bottom} y2={H - bottom} className="axis" />
      {data.map((d, i) => {
        const h = (d.value / max) * (H - top - bottom);
        const x = padX + i * step + (step - bw) / 2;
        const y = H - bottom - h;
        return (
          <g key={i}>
            {d.value > 0 && <rect x={x} y={y} width={bw} height={h} rx="5" className="bar" />}
            {d.value > 0 && (
              <text x={x + bw / 2} y={y - 5} textAnchor="middle" className="chart-val">
                {format(d.value)}
              </text>
            )}
            <text x={x + bw / 2} y={H - 8} textAnchor="middle" className="chart-label">
              {d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// invert = true: mniejsza wartość (np. szybsze tempo) jest wyżej na wykresie
export function LineChart({ data, format = (v) => v.toFixed(1), invert = false, height = 220 }) {
  const pts = data.map((d, i) => ({ ...d, i })).filter((d) => d.value != null);
  if (pts.length < 2) {
    return <p className="muted">Za mało danych do wykresu (potrzebne co najmniej 2 miesiące z biegami).</p>;
  }

  const W = 600;
  const H = height;
  const px = 30;
  const top = 26;
  const bottom = 28;
  const vals = pts.map((p) => p.value);
  let min = Math.min(...vals);
  let max = Math.max(...vals);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const span = max - min;
  min -= span * 0.1;
  max += span * 0.1;

  const x = (i) => px + (i * (W - px * 2)) / (data.length - 1);
  const y = (v) => {
    const r = (v - min) / (max - min);
    return top + (invert ? r : 1 - r) * (H - top - bottom);
  };
  const path = pts.map((p, k) => `${k === 0 ? 'M' : 'L'}${x(p.i)},${y(p.value)}`).join(' ');

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img">
      <line x1={px} x2={W - px} y1={H - bottom} y2={H - bottom} className="axis" />
      <path d={path} className="line" />
      {pts.map((p) => (
        <g key={p.i}>
          <circle cx={x(p.i)} cy={y(p.value)} r="4" className="dot" />
          <text x={x(p.i)} y={y(p.value) - 10} textAnchor="middle" className="chart-val">
            {format(p.value)}
          </text>
        </g>
      ))}
      {data.map((d, i) => (
        <text key={i} x={x(i)} y={H - 8} textAnchor="middle" className="chart-label">
          {d.label}
        </text>
      ))}
    </svg>
  );
}

// kalendarz aktywności: kolumny = tygodnie, wiersze = dni (Pn..Nd)
export function Heatmap({ weeks }) {
  const size = 14;
  const gap = 3;
  const W = weeks.length * (size + gap);
  const H = 7 * (size + gap);
  const level = (km) => (km === 0 ? 0 : km < 3 ? 1 : km < 6 ? 2 : km < 10 ? 3 : 4);

  return (
    <div className="heat-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="heat" role="img" aria-label="Kalendarz aktywności">
        {weeks.map((col, w) =>
          col.map((day, d) =>
            day.future ? null : (
              <rect
                key={day.date}
                x={w * (size + gap)}
                y={d * (size + gap)}
                width={size}
                height={size}
                rx="3"
                className={`heat-l${level(day.km)}`}
              >
                <title>{`${day.date}: ${day.km > 0 ? day.km.toFixed(1) + ' km' : 'brak biegu'}`}</title>
              </rect>
            )
          )
        )}
      </svg>
      <div className="heat-legend">
        mniej
        {[0, 1, 2, 3, 4].map((l) => (
          <span key={l} className={`heat-box heat-l${l}`} />
        ))}
        więcej
      </div>
    </div>
  );
}
