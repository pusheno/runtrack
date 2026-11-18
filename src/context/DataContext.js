import { createContext, useContext, useEffect, useState } from 'react';
import { getCurrentUser, fetchAuthSession } from 'aws-amplify/auth';
import { client, syncMonth, syncAll } from '../lib/api';
import { monthKey } from '../lib/utils';
import { buildUserStats, sameStats } from '../lib/adminStats';

const Ctx = createContext(null);
export const useData = () => useContext(Ctx);

const byDateDesc = (a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0);

export function DataProvider({ user, signOut, children }) {
  const [userId, setUserId] = useState(null);
  const [profile, setProfile] = useState(null);
  const [runs, setRuns] = useState([]);
  const [runsLoaded, setRunsLoaded] = useState(false);
  const [fatal, setFatal] = useState('');
  const [plan, setPlan] = useState(null);
  const [planLoaded, setPlanLoaded] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  // aktywny plan treningowy
  useEffect(() => {
    if (!userId) return undefined;
    let off = false;
    client.models.TrainingPlan.get({ id: userId })
      .then(({ data }) => {
        if (off) return;
        try {
          setPlan(data ? JSON.parse(data.planJson) : null);
        } catch (e) {
          console.error('Uszkodzony plan', e);
        }
        setPlanLoaded(true);
      })
      .catch((e) => {
        console.error(e);
        if (!off) setPlanLoaded(true);
      });
    return () => {
      off = true;
    };
  }, [userId]);

  // profil (id = userId z Cognito); tworzony automatycznie przy pierwszym logowaniu
  useEffect(() => {
    let off = false;
    (async () => {
      const { userId: id } = await getCurrentUser();
      const { data } = await client.models.Profile.get({ id });
      let p = data;
      if (!p) {
        const res = await client.models.Profile.create({
          id,
          nickname: `Biegacz${Math.floor(100 + Math.random() * 900)}`,
          monthlyGoalKm: 50,
          showInRanking: false,
        });
        if (res.errors) throw new Error(res.errors[0].message);
        p = res.data;
      }
      let admin = false;
      try {
        const session = await fetchAuthSession();
        const groups = session.tokens?.accessToken?.payload?.['cognito:groups'] || [];
        admin = groups.includes('admin');
      } catch (e) {
        console.error('Nie udało się odczytać grup', e);
      }
      if (!off) {
        setUserId(id);
        setProfile(p);
        setIsAdmin(admin);
      }
    })().catch((e) => {
      console.error(e);
      if (!off) setFatal(e.message);
    });
    return () => {
      off = true;
    };
  }, []);

  // treningi na żywo
  useEffect(() => {
    const sub = client.models.Run.observeQuery().subscribe({
      next: ({ items, isSynced }) => {
        setRuns([...items].sort(byDateDesc));
        if (isSynced) setRunsLoaded(true); // dopiero po pobraniu wszystkich stron
      },
      error: (e) => console.error(e),
    });
    return () => sub.unsubscribe();
  }, []);

  // Podsumowanie dla administratora: aktualizujemy je automatycznie po każdej zmianie danych
  // (dzięki temu uzupełnia się też dla starych kont, bez ręcznych kroków).
  useEffect(() => {
    if (!userId || !profile || !runsLoaded || !planLoaded) return undefined;
    const t = setTimeout(async () => {
      try {
        const next = buildUserStats(runs, profile.nickname, plan);
        const { data: cur } = await client.models.UserStats.get({ id: userId });
        if (cur && sameStats(cur, next)) return;
        const payload = { id: userId, ...next };
        const res = cur
          ? await client.models.UserStats.update(payload)
          : await client.models.UserStats.create(payload);
        if (res.errors) console.error('UserStats', res.errors);
      } catch (e) {
        console.error('UserStats', e);
      }
    }, 2500);
    return () => clearTimeout(t);
  }, [userId, profile, runs, runsLoaded, plan, planLoaded]);

  const addRun = async (values) => {
    const { data, errors } = await client.models.Run.create(values);
    if (errors) throw new Error(errors[0].message);
    await syncMonth(userId, profile, [data, ...runs], monthKey(values.date));
  };

  const updateRun = async (id, values) => {
    const { errors } = await client.models.Run.update({ id, ...values });
    if (errors) throw new Error(errors[0].message);
    const old = runs.find((r) => r.id === id);
    const next = runs.map((r) => (r.id === id ? { ...r, ...values } : r));
    const months = new Set([monthKey(values.date)]);
    if (old) months.add(monthKey(old.date));
    for (const m of months) await syncMonth(userId, profile, next, m);
  };

  const removeRun = async (id) => {
    const old = runs.find((r) => r.id === id);
    const { errors } = await client.models.Run.delete({ id });
    if (errors) throw new Error(errors[0].message);
    if (old) await syncMonth(userId, profile, runs.filter((r) => r.id !== id), monthKey(old.date));
  };

  const savePlan = async (p) => {
    const payload = { id: userId, startDate: p.params.startDate, planJson: JSON.stringify(p) };
    const { data: existing } = await client.models.TrainingPlan.get({ id: userId });
    const res = existing
      ? await client.models.TrainingPlan.update(payload)
      : await client.models.TrainingPlan.create(payload);
    if (res.errors) throw new Error(res.errors[0].message);
    setPlan(p);
  };

  const removePlan = async () => {
    const { errors } = await client.models.TrainingPlan.delete({ id: userId });
    if (errors) throw new Error(errors[0].message);
    setPlan(null);
  };

  const saveProfile = async (values) => {
    const { data, errors } = await client.models.Profile.update({ id: userId, ...values });
    if (errors) throw new Error(errors[0].message);
    setProfile(data);
    await syncAll(userId, data, runs);
  };

  if (fatal) {
    return (
      <div className="splash">
        <p>Nie udało się wczytać profilu.</p>
        <p className="muted">{fatal}</p>
        <button onClick={signOut}>Wyloguj</button>
      </div>
    );
  }
  if (!profile) return <div className="splash">Ładowanie…</div>;

  const value = {
    user,
    signOut,
    userId,
    profile,
    runs,
    runsLoaded,
    email: user?.signInDetails?.loginId,
    addRun,
    updateRun,
    removeRun,
    saveProfile,
    isAdmin,
    plan,
    planLoaded,
    savePlan,
    removePlan,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
