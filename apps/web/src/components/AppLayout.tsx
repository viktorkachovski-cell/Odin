import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Outlet } from 'react-router';

import { breakpoints } from '@odin/design-tokens';
import { summarizeTasks } from '@odin/domain';
import type { TranslationKey } from '@odin/i18n';

import { useOdin } from '../app/OdinContext.ts';
import { useHouseholdTasksQuery, useProfileQuery } from '../app/queries.ts';
import { StaleBanner } from './Banner.tsx';
import { Icon, type IconName } from './Icon.tsx';
import { useCompactChromeVisible } from './useCompactChrome.ts';

/**
 * Desktop keeps a persistent left rail; compact viewports fall back to the
 * bottom navigation that hides on downward scroll. Three work destinations --
 * Today, Tasks, Lists -- with Settings set apart at the foot of the rail. Tasks
 * carries the member's open-task count so it is visible from every screen.
 */

interface Destination {
  readonly to: string;
  readonly icon: IconName;
  readonly key: TranslationKey;
  readonly end?: boolean;
}

const WORK: readonly Destination[] = [
  { to: '/', icon: 'today', key: 'nav.today', end: true },
  { to: '/tasks', icon: 'tasks', key: 'nav.tasks' },
  { to: '/lists', icon: 'lists', key: 'nav.lists' },
];

const SETTINGS: Destination = { to: '/settings', icon: 'settings', key: 'nav.settings' };

function useCompact(): boolean {
  const [compact, setCompact] = useState(() => window.innerWidth <= breakpoints.compact);
  useEffect(() => {
    const query = window.matchMedia(`(max-width: ${breakpoints.compact}px)`);
    const listener = (): void => setCompact(query.matches);
    listener();
    query.addEventListener('change', listener);
    return () => query.removeEventListener('change', listener);
  }, []);
  return compact;
}

function NavItem({
  destination,
  label,
  badge,
}: {
  readonly destination: Destination;
  readonly label: string;
  readonly badge?: number | undefined;
}): ReactNode {
  return (
    <NavLink className="nav-link" end={destination.end === true} to={destination.to}>
      <Icon name={destination.icon} />
      <span className="nav-link__label">{label}</span>
      {badge !== undefined && badge > 0 && <span className="nav-link__badge">{badge}</span>}
    </NavLink>
  );
}

export function AppLayout(): ReactNode {
  const { t, online, realtimeHealthy, user } = useOdin();
  const navVisible = useCompactChromeVisible();
  const compact = useCompact();
  const tasks = useHouseholdTasksQuery();
  const profile = useProfileQuery();
  const mine = summarizeTasks(tasks.data?.items ?? [], user?.id ?? null).mine;

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
          {WORK.map((destination) => (
            <li key={destination.to}>
              <NavItem
                badge={destination.to === '/tasks' ? mine : undefined}
                destination={destination}
                label={t(destination.key)}
              />
            </li>
          ))}
          <li className="shell__nav-end">
            <NavItem destination={SETTINGS} label={t(SETTINGS.key)} />
          </li>
        </ul>
        {profile.data !== null && profile.data !== undefined && (
          <span className="shell__user">{profile.data.display_name}</span>
        )}
      </nav>

      <main className="shell__main" id="main" tabIndex={-1}>
        <StaleBanner online={online} realtimeHealthy={realtimeHealthy} t={t} />
        <Outlet />
      </main>
    </div>
  );
}
