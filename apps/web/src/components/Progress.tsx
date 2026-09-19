import type { ReactNode } from 'react';

import { progressPercent } from '@odin/domain';
import type { Translator } from '@odin/i18n';

/**
 * Active list progress shows the count AND the percentage, per the desktop
 * brief. The bar is decorative; the numbers carry the meaning.
 */

export function Progress({
  completed,
  total,
  t,
}: {
  readonly completed: number;
  readonly total: number;
  readonly t: Translator;
}): ReactNode {
  const percent = progressPercent(completed, total);
  const label = t('home.progress', { completed, total, percent });

  return (
    <div className="progress">
      <span className="progress__label">{label}</span>
      <div
        aria-label={label}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={percent}
        className="progress__track"
        role="progressbar"
      >
        <div className="progress__fill" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
