import { NavLink, Link, Outlet, useLocation } from 'react-router-dom';
import { useData } from '../context/DataContext';
import { useTracker } from '../context/TrackerContext';
import { fmtKm, fmtTime } from '../lib/utils';

const links = [
  { to: '/', label: 'Pulpit', icon: '🏠', end: true },
  { to: '/bieg', label: 'Bieg', icon: '▶️' },
  { to: '/plan', label: 'Plan', icon: '📅' },
  { to: '/treningi', label: 'Treningi', icon: '👟' },
  { to: '/statystyki', label: 'Statystyki', icon: '📊' },
  { to: '/ranking', label: 'Ranking', icon: '🏆' },
];

export default function Layout() {
  const { profile, isAdmin } = useData();
  const { active, phase, live } = useTracker();
  const { pathname } = useLocation();

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">🏃 RunTrack</div>
        <nav className="nav">
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => (isActive ? 'active' : '')}>
              <span className="nav-icon">{l.icon}</span>
              <span className="nav-label">{l.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="topright">
          {isAdmin && <Link to="/admin" className="who" title="Panel administratora">🛡 Admin</Link>}
          <Link to="/profil" className="who" title="Profil i ustawienia">👤 {profile.nickname}</Link>
        </div>
      </header>

      {active && pathname !== '/bieg' && (
        <Link to="/bieg" className="run-banner">
          <span className={phase === 'running' ? 'rec-dot' : 'rec-dot off'} />
          {phase === 'paused' ? 'Bieg wstrzymany' : phase === 'searching' ? 'Szukam GPS…' : 'Trwa bieg'}
          {' · '}{fmtTime(live.elapsedMs / 1000)} · {fmtKm(live.distanceM / 1000, 2)}
          <span className="banner-go">Wróć →</span>
        </Link>
      )}

      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
