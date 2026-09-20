import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';

import { createOdinClient } from '@odin/data';

import { App } from './App.tsx';
import { OdinProvider } from './app/OdinProvider.tsx';
import { InvalidEnvError, MissingEnvError, readEnv } from './env.ts';
import './styles.css';
import { applyTheme, watchColorScheme } from './theme.ts';

const container = document.getElementById('root');
if (container === null) throw new Error('Missing #root container');

applyTheme();
watchColorScheme();

function renderConfigurationError(variables: readonly string[], detail: string): void {
  const root = createRoot(container as HTMLElement);
  root.render(
    <div className="auth-shell">
      <div className="auth-card">
        <h1>Configuration required</h1>
        <p>{detail}</p>
        <ul>
          {variables.map((name) => (
            <li key={name}>
              <code>{name}</code>
            </li>
          ))}
        </ul>
      </div>
    </div>,
  );
}

try {
  const env = readEnv();
  const client = createOdinClient(
    { url: env.supabaseUrl, publishableKey: env.supabasePublishableKey },
    // The browser uses the normal Supabase session mechanism.
    { detectSessionInUrl: true },
  );

  createRoot(container).render(
    <StrictMode>
      <OdinProvider client={client}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </OdinProvider>
    </StrictMode>,
  );
} catch (cause) {
  if (cause instanceof MissingEnvError) {
    renderConfigurationError(
      cause.missing,
      'This deployment is missing required client configuration. Set the following environment variables and redeploy.',
    );
  } else if (cause instanceof InvalidEnvError) {
    renderConfigurationError(
      [cause.variable],
      `This deployment has invalid client configuration (${cause.reason}). Correct the following environment variable and redeploy.`,
    );
  } else {
    throw cause;
  }
}
