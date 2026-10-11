import type { ReactNode } from 'react';

import { MOVE_DIRECTIONS, type MoveDirection } from '@odin/contracts';
import type { Translator } from '@odin/i18n';

import { Icon } from './Icon.tsx';

/** Mutually exclusive views with their counts, such as Mine / Unassigned / Everyone. */
export function Segmented<K extends string>({
  label,
  options,
  value,
  onChange,
}: {
  readonly label: string;
  readonly options: readonly { readonly key: K; readonly label: string; readonly count: number }[];
  readonly value: K;
  readonly onChange: (key: K) => void;
}): ReactNode {
  return (
    <div aria-label={label} className="segmented" role="group">
      {options.map((option) => (
        <button
          aria-pressed={value === option.key}
          className="segmented__option"
          key={option.key}
          onClick={() => onChange(option.key)}
          type="button"
        >
          {option.label} <span className="segmented__count">{option.count}</span>
        </button>
      ))}
    </div>
  );
}

export function ReorderToggle({
  t,
  on,
  onToggle,
}: {
  readonly t: Translator;
  readonly on: boolean;
  readonly onToggle: () => void;
}): ReactNode {
  return (
    <button aria-pressed={on} className="button button--quiet" onClick={onToggle} type="button">
      <Icon name="reorder" size={18} />
      {on ? t('lists.reorder.done') : t('lists.reorder')}
    </button>
  );
}

/** Up and down, for a task or a list in reorder mode. */
export function MoveButtons({
  label,
  onMove,
  upDisabled,
  downDisabled,
}: {
  readonly label: (direction: MoveDirection) => string;
  readonly onMove: (direction: MoveDirection) => void;
  readonly upDisabled: boolean;
  readonly downDisabled: boolean;
}): ReactNode {
  return (
    <>
      {MOVE_DIRECTIONS.map((direction) => (
        <button
          aria-label={label(direction)}
          className="button button--quiet button--icon"
          disabled={direction === 'up' ? upDisabled : downDisabled}
          key={direction}
          onClick={() => onMove(direction)}
          type="button"
        >
          <Icon name={direction === 'up' ? 'arrow-up' : 'arrow-down'} />
        </button>
      ))}
    </>
  );
}
