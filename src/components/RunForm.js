import { useState } from 'react';
import { today, fmtTime, parseTime } from '../lib/utils';

const blank = () => ({ date: today(), distanceKm: '', time: '', note: '' });

export default function RunForm({ initial, onSubmit, onCancel, submitLabel = 'Dodaj' }) {
  const [form, setForm] = useState(
    initial
      ? {
          date: initial.date,
          distanceKm: String(initial.distanceKm),
          time: fmtTime(initial.durationSec),
          note: initial.note || '',
        }
      : blank()
  );
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const change = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    const distanceKm = parseFloat(form.distanceKm.replace(',', '.'));
    const durationSec = parseTime(form.time);
    if (!(distanceKm > 0) || distanceKm > 500) return setError('Podaj poprawny dystans w km.');
    if (!durationSec) return setError('Podaj czas w formacie mm:ss lub g:mm:ss.');
    if (form.date > today()) return setError('Data nie może być z przyszłości.');

    setBusy(true);
    try {
      await onSubmit({
        date: form.date,
        distanceKm,
        durationSec,
        note: form.note.trim() || null,
      });
      if (!initial) setForm(blank());
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <div className="form">
        <input type="date" name="date" value={form.date} max={today()} onChange={change} required />
        <input name="distanceKm" placeholder="Dystans (km)" value={form.distanceKm} onChange={change} inputMode="decimal" required />
        <input name="time" placeholder="Czas (np. 45:30)" value={form.time} onChange={change} required />
        <input name="note" placeholder="Notatka (opcjonalnie)" value={form.note} onChange={change} maxLength={200} />
        <div className="form-actions">
          <button type="submit" disabled={busy}>{busy ? 'Zapisuję…' : submitLabel}</button>
          {onCancel && (
            <button type="button" className="ghost" onClick={onCancel}>Anuluj</button>
          )}
        </div>
      </div>
      {error && <p className="bad">{error}</p>}
    </form>
  );
}
