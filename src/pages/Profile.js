import { useState } from 'react';
import { useData } from '../context/DataContext';

export default function Profile() {
  const { profile, email, saveProfile, signOut } = useData();
  const [nickname, setNickname] = useState(profile.nickname);
  const [goal, setGoal] = useState(profile.monthlyGoalKm ? String(profile.monthlyGoalKm) : '');
  const [show, setShow] = useState(!!profile.showInRanking);
  const [msg, setMsg] = useState({ type: '', text: '' });
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setMsg({ type: '', text: '' });
    const nick = nickname.trim();
    const goalKm = goal === '' ? 0 : parseFloat(goal.replace(',', '.'));
    if (nick.length < 3 || nick.length > 20) return setMsg({ type: 'bad', text: 'Pseudonim: 3-20 znaków.' });
    if (isNaN(goalKm) || goalKm < 0 || goalKm > 5000) return setMsg({ type: 'bad', text: 'Podaj poprawny cel (km).' });

    setBusy(true);
    try {
      await saveProfile({ nickname: nick, monthlyGoalKm: goalKm, showInRanking: show });
      setMsg({ type: 'good', text: 'Zapisano ✔' });
    } catch (err) {
      setMsg({ type: 'bad', text: err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <h1 className="page-title">Profil</h1>

      <section className="card">
        <p className="muted">Konto: {email}</p>
        <form onSubmit={submit} className="profile-form">
          <label>
            Pseudonim (widoczny w rankingu)
            <input value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={20} />
          </label>
          <label>
            Cel miesięczny (km)
            <input value={goal} onChange={(e) => setGoal(e.target.value)} inputMode="decimal" placeholder="np. 100" />
          </label>
          <label className="check">
            <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
            Pokazuj mnie w rankingu (pseudonim + sumy miesięczne; bez e-maila i szczegółów treningów)
          </label>
          <div className="form-actions">
            <button type="submit" disabled={busy}>{busy ? 'Zapisuję…' : 'Zapisz'}</button>
          </div>
          {msg.text && <p className={msg.type}>{msg.text}</p>}
        </form>
      </section>

      <section className="card">
        <h2>Prywatność</h2>
        <p className="muted small">
          Trasy GPS, notatki i szczegóły treningów widzisz tylko Ty. Administrator aplikacji widzi wyłącznie
          zbiorcze podsumowanie: pseudonim, sumę kilometrów, liczbę biegów, średnie i najlepsze tempo, sumy
          miesięczne oraz informację, czy masz plan. Nie widzi Twojego e-maila.
        </p>
      </section>

      <section className="card">
        <button className="ghost" onClick={signOut}>Wyloguj</button>
      </section>
    </>
  );
}
