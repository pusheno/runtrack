import { Authenticator } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';
import { Routes, Route, Navigate } from 'react-router-dom';
import './App.css';

import { DataProvider } from './context/DataContext';
import { TrackerProvider } from './context/TrackerContext';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Record from './pages/Record';
import Plan from './pages/Plan';
import Admin from './pages/Admin';
import Runs from './pages/Runs';
import Stats from './pages/Stats';
import Ranking from './pages/Ranking';
import Profile from './pages/Profile';

export default function App() {
  return (
    <Authenticator>
      {({ signOut, user }) => (
        <DataProvider user={user} signOut={signOut}>
          <TrackerProvider>
            <Routes>
              <Route element={<Layout />}>
                <Route index element={<Dashboard />} />
                <Route path="bieg" element={<Record />} />
                <Route path="plan" element={<Plan />} />
                <Route path="treningi" element={<Runs />} />
                <Route path="statystyki" element={<Stats />} />
                <Route path="ranking" element={<Ranking />} />
                <Route path="profil" element={<Profile />} />
                <Route path="admin" element={<Admin />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </TrackerProvider>
        </DataProvider>
      )}
    </Authenticator>
  );
}
