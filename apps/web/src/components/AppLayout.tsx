import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Outlet } from 'react-router';

import { breakpoints } from '@odin/design-tokens';

import { useOdin } from '../app/OdinContext.ts';
import { StaleBanner } from './Banner.tsx';
import { useCompactChromeVisible } from './useCompactChrome.ts';

/**
 * Desktop keeps a persistent left rail; compact viewports fall back to the
 * source-specified bottom navigation that hides on downward scroll.
 *
 * The persistent rail is a desktop adaptation recorded for UI review: the
 * destinations and actions are identical to the mobile brief, only the chrome
 * differs.
 */

const DESTINATIONS = [
  { to: '/', glyph: '⌂', key: 'nav.home' },
  { to: '/unassigned', glyph: '?', key: 'nav.unassigned' },
  { to: '/my-tasks', glyph: '☺', key: 'nav.my_tasks' },
  { to: '/settings', glyph: '⚙', key: 'nav.settings' },
] as const;

export function AppLayout(): ReactNode {
  const { t, online, realtimeHealthy } = useOdin();
  const navVisible = useCompactChromeVisible();
  const [compact, setCompact] = useState(() => window.innerWidth <= breakpoints.compact);

  useEffect(() => {
    const query = window.matchMedia(`(max-width: ${breakpoints.compact}px)`);
    const listener = (): void => setCompact(query.matches);
    listener();
    query.addEventListener('change', listener);
    return () => query.removeEventListener('change', listener);
  }, []);

  const navClass = ['shell__nav', compact && !navVisible ? 'shell__nav--hidden' : '']
    .filter((value) => value.length > 0)
    .join(' ');

  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        {t('nav.primary')}
      </a>

      <nav aria-label={t('nav.primary')} className={navClass}>
        <span className="shell__brand">{t('app.name')}</span>
        <ul className="shell__nav-list">
          {DESTINATIONS.map((destination) => (
            <li key={destination.to}>
              <NavLink className="nav-link" end={destination.to === '/'} to={destination.to}>
                <span aria-hidden="true" className="nav-link__glyph">
                  {destination.glyph}
                </span>
                {t(destination.key)}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <main className="shell__main" id="main" tabIndex={-1}>
        <StaleBanner online={online} realtimeHealthy={realtimeHealthy} t={t} />
        <Outlet />
      </main>
    </div>
  );
}
