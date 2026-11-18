import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useData } from './DataContext';
import { Tracker, MAX_ACCURACY, buildResult, recentPace, demoFix } from '../lib/gps';

// Tracker żyje poza stroną /bieg, więc bieg trwa dalej, gdy przechodzisz między podstronami.
const Ctx = createContext(null);
export const useTracker = () => useContext(Ctx);

export function TrackerProvider({ children }) {
  const { userId } = useData();
  const storageKey = `runtrack.session.v1.${userId}`;

  // idle | searching (czeka na pierwszy dobry odczyt) | running | paused | finished
  const [phase, setPhaseState] = useState('idle');
  const [path, setPath] = useState([]); // [[lat, lng], ...] do rysowania na mapie
  const [live, setLive] = useState({ distanceM: 0, elapsedMs: 0, currentPace: null });
  const [info, setInfo] = useState({ accuracy: null, error: '' });
  const [result, setResult] = useState(null);
  const [demo, setDemo] = useState(false);
  const [recovered, setRecovered] = useState(false);

  const phaseRef = useRef('idle');
  const tracker = useRef(new Tracker());
  const watchId = useRef(null);
  const demoTimer = useRef(null);
  const demoStep = useRef(0);
  const virtual = useRef(0); // wirtualny zegar trybu demo (10x szybszy od rzeczywistego)
  const demoRef = useRef(false);
  const movingAcc = useRef(0); // ms ruchu z zakończonych odcinków
  const segStart = useRef(null); // początek bieżącego odcinka (ms) albo null
  const startedAt = useRef(null);
  const wakeLock = useRef(null);
  const lastSave = useRef(0);

  const setPhase = (p) => {
    phaseRef.current = p;
    setPhaseState(p);
  };
  const now = () => (demoRef.current ? virtual.current : Date.now());
  const elapsedMs = () => movingAcc.current + (segStart.current != null ? now() - segStart.current : 0);

  const refreshLive = () => {
    const pts = tracker.current.points;
    setLive({
      distanceM: tracker.current.distanceM,
      elapsedMs: elapsedMs(),
      currentPace: recentPace(pts),
    });
  };

  // ---------- zapis sesji w przeglądarce (ochrona przed odświeżeniem strony) ----------
  const persist = (force) => {
    if (demoRef.current) return;
    const t = Date.now();
    if (!force && t - lastSave.current < 5000) return;
    lastSave.current = t;
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          v: 1,
          phase: phaseRef.current === 'finished' ? 'finished' : 'paused',
          startedAt: startedAt.current ? startedAt.current.toISOString() : null,
          movingMs: segStart.current != null ? elapsedMs() : movingAcc.current,
          points: tracker.current.points,
          distanceM: tracker.current.distanceM,
        })
      );
    } catch (e) {
      /* brak miejsca albo zablokowany storage: trudno, bieg działa dalej */
    }
  };
  const clearSaved = () => {
    try {
      localStorage.removeItem(storageKey);
    } catch (e) {
      /* ignoruj */
    }
  };

  // ---------- blokada wygaszania ekranu ----------
  const acquireWakeLock = async () => {
    try {
      if ('wakeLock' in navigator && !wakeLock.current) {
        const lock = await navigator.wakeLock.request('screen');
        wakeLock.current = lock;
        lock.addEventListener('release', () => {
          if (wakeLock.current === lock) wakeLock.current = null;
        });
      }
    } catch (e) {
      /* nieobsługiwane albo odmowa: pokażemy tylko podpowiedź w interfejsie */
    }
  };
  const releaseWakeLock = () => {
    try {
      if (wakeLock.current) wakeLock.current.release();
    } catch (e) {
      /* ignoruj */
    }
    wakeLock.current = null;
  };

  // ---------- odczyty GPS ----------
  const onFix = useCallback((pos) => {
    const c = pos.coords;
    setInfo((i) => (i.accuracy === Math.round(c.accuracy) && !i.error ? i : { accuracy: Math.round(c.accuracy), error: '' }));

    if (phaseRef.current === 'searching') {
      if (c.accuracy > MAX_ACCURACY) return; // czekamy na wystarczająco dobry sygnał
      segStart.current = now();
      setPhase('running');
    }
    if (phaseRef.current !== 'running') return;

    const res = tracker.current.addFix(
      { lat: c.latitude, lng: c.longitude, acc: c.accuracy, ts: pos.timestamp },
      elapsedMs()
    );
    if (res === 'ok') {
      setPath(tracker.current.points.map((p) => [p.lat, p.lng]));
      refreshLive();
      persist(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopWatch = () => {
    if (watchId.current != null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
    if (demoTimer.current) {
      clearInterval(demoTimer.current);
      demoTimer.current = null;
    }
  };

  const onError = useCallback((err) => {
    if (err.code === 1) {
      stopWatch();
      releaseWakeLock();
      const hasData = tracker.current.points.length > 0 || movingAcc.current > 0;
      setPhase(hasData ? 'paused' : 'idle');
      setInfo({
        accuracy: null,
        error: 'Brak zgody na lokalizację. Zezwól na nią w ustawieniach przeglądarki (ikona kłódki przy adresie) i spróbuj ponownie.',
      });
    } else if (err.code === 2) {
      setInfo((i) => ({ ...i, error: 'Sygnał GPS jest niedostępny. Wyjdź na otwartą przestrzeń.' }));
    } else {
      setInfo((i) => ({ ...i, error: 'Nie mogę ustalić pozycji. Szukam dalej…' }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startWatch = () => {
    stopWatch();
    if (demoRef.current) {
      demoTimer.current = setInterval(() => {
        virtual.current += 1000;
        const f = demoFix(demoStep.current++, virtual.current);
        onFix({ coords: { latitude: f.lat, longitude: f.lng, accuracy: f.acc }, timestamp: f.ts });
      }, 100);
    } else {
      watchId.current = navigator.geolocation.watchPosition(onFix, onError, {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 20000,
      });
    }
    acquireWakeLock();
  };

  // ---------- akcje ----------
  const start = (useDemo = false) => {
    if (phaseRef.current !== 'idle') return;
    if (!useDemo) {
      if (!window.isSecureContext) {
        setInfo({ accuracy: null, error: 'Lokalizacja działa tylko na stronach HTTPS (albo localhost).' });
        return;
      }
      if (!('geolocation' in navigator)) {
        setInfo({ accuracy: null, error: 'Ta przeglądarka nie obsługuje lokalizacji.' });
        return;
      }
    }
    demoRef.current = useDemo;
    setDemo(useDemo);
    demoStep.current = 0;
    virtual.current = Date.now();
    tracker.current = new Tracker();
    movingAcc.current = 0;
    segStart.current = null;
    startedAt.current = new Date();
    setPath([]);
    setResult(null);
    setRecovered(false);
    setInfo({ accuracy: null, error: '' });
    setLive({ distanceM: 0, elapsedMs: 0, currentPace: null });
    setPhase('searching');
    startWatch();
  };

  const pause = () => {
    const p = phaseRef.current;
    if (p !== 'running' && p !== 'searching') return;
    if (segStart.current != null) {
      movingAcc.current += now() - segStart.current;
      segStart.current = null;
    }
    tracker.current.breakSegment();
    stopWatch();
    releaseWakeLock(); // na pauzie ekran może się wygaszać; wznowienie odnowi blokadę
    refreshLive();
    const hasData = tracker.current.points.length > 0 || movingAcc.current > 0;
    setPhase(hasData ? 'paused' : 'idle');
    if (hasData) persist(true);
  };

  const resume = () => {
    if (phaseRef.current !== 'paused') return;
    setRecovered(false);
    setInfo({ accuracy: null, error: '' });
    setPhase('searching');
    startWatch();
  };

  const finish = () => {
    const p = phaseRef.current;
    if (p !== 'running' && p !== 'searching' && p !== 'paused') return;
    if (segStart.current != null) {
      movingAcc.current += now() - segStart.current;
      segStart.current = null;
    }
    stopWatch();
    releaseWakeLock();
    setRecovered(false);
    setResult(buildResult(tracker.current, movingAcc.current, startedAt.current || new Date()));
    refreshLive();
    setPhase('finished');
    persist(true);
  };

  const reset = () => {
    stopWatch();
    releaseWakeLock();
    clearSaved();
    demoRef.current = false;
    setDemo(false);
    tracker.current = new Tracker();
    movingAcc.current = 0;
    segStart.current = null;
    startedAt.current = null;
    setPath([]);
    setResult(null);
    setRecovered(false);
    setInfo({ accuracy: null, error: '' });
    setLive({ distanceM: 0, elapsedMs: 0, currentPace: null });
    setPhase('idle');
  };

  // ---------- efekty ----------
  // odzyskanie przerwanej sesji po odświeżeniu strony
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const s = JSON.parse(raw);
      const started = s.startedAt ? new Date(s.startedAt) : null;
      if (s.v !== 1 || !Array.isArray(s.points) || !started || isNaN(started)) return;

      const t = new Tracker({ points: s.points, distanceM: s.distanceM });
      t.breakSegment();
      tracker.current = t;
      movingAcc.current = s.movingMs || 0;
      segStart.current = null;
      startedAt.current = started;
      setPath(t.points.map((p) => [p.lat, p.lng]));
      setLive({ distanceM: t.distanceM, elapsedMs: movingAcc.current, currentPace: null });
      if (s.phase === 'finished') {
        setResult(buildResult(t, movingAcc.current, started));
        setPhase('finished');
      } else {
        setPhase('paused');
        setRecovered(true);
      }
    } catch (e) {
      /* uszkodzony zapis: pomijamy */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  // licznik na ekranie
  useEffect(() => {
    if (phase !== 'running' && phase !== 'searching') return undefined;
    const id = setInterval(refreshLive, 500);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // po powrocie do karty: odnów blokadę ekranu; po ukryciu: zapisz sesję
  useEffect(() => {
    const onVis = () => {
      const p = phaseRef.current;
      if (document.visibilityState === 'visible' && (p === 'running' || p === 'searching')) acquireWakeLock();
      if (document.visibilityState === 'hidden' && (p === 'running' || p === 'paused')) persist(true);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ostrzeżenie przed zamknięciem karty w trakcie biegu
  useEffect(() => {
    const warn = (e) => {
      const p = phaseRef.current;
      if (p === 'running' || p === 'searching' || p === 'paused') {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  // sprzątanie przy zamknięciu aplikacji
  useEffect(
    () => () => {
      stopWatch();
      releaseWakeLock();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const value = {
    phase,
    path,
    live,
    info,
    result,
    demo,
    recovered,
    active: phase === 'running' || phase === 'searching' || phase === 'paused',
    wakeLockSupported: typeof navigator !== 'undefined' && 'wakeLock' in navigator,
    secure: typeof window !== 'undefined' && window.isSecureContext,
    start,
    pause,
    resume,
    finish,
    reset,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
