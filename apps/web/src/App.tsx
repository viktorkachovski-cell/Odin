import type { ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router';
import { useOdin } from './app/OdinContext.ts';
import { isRecoveryUser } from './auth-links.ts';
import { Register } from './routes/Register.tsx';
import { ForgotPassword, ResetPassword } from './routes/PasswordRecovery.tsx';
import { EmailConfirmed } from './routes/EmailConfirmed.tsx';

import { AuthGate } from './app/AuthGate.tsx';
import { AppLayout } from './components/AppLayout.tsx';
import { Invite } from './routes/Invite.tsx';
import { ListDetail } from './routes/ListDetail.tsx';
import { Lists } from './routes/Lists.tsx';
import { Settings } from './routes/Settings.tsx';
import { SignIn } from './routes/SignIn.tsx';
import { Tasks } from './routes/Tasks.tsx';
import { Today } from './routes/Today.tsx';

/**
 * Every nested path is a real route so a browser refresh on `/lists/:id`
 * resolves correctly once the host rewrites unknown paths to index.html.
 */

export function App(): ReactNode {
  const { user, authReady } = useOdin();
  const location = useLocation();
  if (authReady && isRecoveryUser(user?.id) && location.pathname !== '/reset-password') {
    return <Navigate to="/reset-password" replace />;
  }
  return (
    <Routes>
      <Route element={<SignIn />} path="/sign-in" />
      <Route element={<Register />} path="/register" />
      <Route element={<ForgotPassword />} path="/forgot-password" />
      <Route element={<ResetPassword />} path="/reset-password" />
      <Route element={<EmailConfirmed />} path="/auth/confirmed" />
      <Route element={<Invite />} path="/invite" />
      <Route
        element={
          <AuthGate>
            <AppLayout />
          </AuthGate>
        }
        path="/"
      >
        <Route element={<Today />} index />
        <Route element={<Tasks />} path="tasks" />
        <Route element={<Lists />} path="lists" />
        <Route element={<ListDetail />} path="lists/:listId" />
        {/* The three task views merged into Tasks; old links and bookmarks still land. */}
        <Route element={<TasksRedirect view="mine" />} path="my-tasks" />
        <Route element={<TasksRedirect view="unassigned" />} path="unassigned" />
        <Route element={<TasksRedirect view="everyone" />} path="all-tasks" />
        <Route element={<Settings />} path="settings" />
      </Route>
      <Route element={<NotFound />} path="*" />
    </Routes>
  );
}

function TasksRedirect({ view }: { readonly view: string }): ReactNode {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  params.set('view', view);
  return <Navigate replace to={`/tasks?${params.toString()}`} />;
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
