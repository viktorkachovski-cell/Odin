import type { ReactNode } from 'react';
import { Route, Routes } from 'react-router';

import { AuthGate } from './app/AuthGate.tsx';
import { AppLayout } from './components/AppLayout.tsx';
import { Home } from './routes/Home.tsx';
import { Invite } from './routes/Invite.tsx';
import { ListDetail } from './routes/ListDetail.tsx';
import { MyTasks } from './routes/MyTasks.tsx';
import { Settings } from './routes/Settings.tsx';
import { SignIn } from './routes/SignIn.tsx';
import { Unassigned } from './routes/Unassigned.tsx';

/**
 * Every nested path is a real route so a browser refresh on `/lists/:id`
 * resolves correctly once the host rewrites unknown paths to index.html.
 */

export function App(): ReactNode {
  return (
    <Routes>
      <Route element={<SignIn />} path="/sign-in" />
      <Route element={<Invite />} path="/invite" />
      <Route
        element={
          <AuthGate>
            <AppLayout />
          </AuthGate>
        }
        path="/"
      >
        <Route element={<Home />} index />
        <Route element={<ListDetail />} path="lists/:listId" />
        <Route element={<Unassigned />} path="unassigned" />
        <Route element={<MyTasks />} path="my-tasks" />
        <Route element={<Settings />} path="settings" />
      </Route>
      <Route element={<NotFound />} path="*" />
    </Routes>
  );
}

function NotFound(): ReactNode {
  return (
    <div className="auth-shell">
      <div className="auth-card">
        <h1>404</h1>
        <a className="button" href="/">
          Odin
        </a>
      </div>
    </div>
  );
}
