import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Outlet } from 'react-router';

import { breakpoints } from '@odin/design-tokens';

import { useOdin } from '../app/OdinContext.ts';
import { StaleBanner } from './Banner.tsx';

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

/**
 * Hides the bottom bar on downward scroll and reveals it on upward scroll. It
 * stays visible at the top and bottom of the content, whenever focus is inside
 * it, and whenever the user prefers reduced motion.
 */
function useBottomNavVisibility(): boolean {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setVisible(true);
      return;
    }

    let previous = window.scrollY;

    const onScroll = (): void => {
      const current = window.scrollY;
      const atTop = current <= 0;
      const atEnd = window.innerHeight + current >= document.documentElement.scrollHeight - 2;

      if (atTop || atEnd) {
        setVisible(true);
      } else if (current > previous + 4) {
        setVisible(false);
      } else if (current < previous - 4) {
        setVisible(true);
      }
      previous = current;
    };

    const onFocusIn = (event: FocusEvent): void => {
      const target = event.target;
      if (target instanceof HTMLElement && target.closest('.shell__nav') !== null) {
        setVisible(true);
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('focusin', onFocusIn);
    return () => {
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('focusin', onFocusIn);
    };
  }, []);

  return visible;
}

export function AppLayout(): ReactNode {
  const { t, online, realtimeHealthy } = useOdin();
  const navVisible = useBottomNavVisibility();
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
