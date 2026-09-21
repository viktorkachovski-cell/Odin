import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * The menu that holds a row's or a card's secondary and destructive actions, so
 * neither competes with the action a person actually came for.
 *
 * Its accessible name is scoped to its subject -- "Actions for <task title>",
 * not "Actions" -- because a twenty-row list otherwise gives a screen-reader
 * user twenty identical buttons.
 *
 * Keyboard: Enter, Space or ArrowDown opens and focuses the first item;
 * ArrowUp opens on the last. Arrows rove, Home and End jump, Escape closes and
 * returns focus to the trigger, Tab closes and moves on.
 */

export interface OverflowItem {
  readonly key: string;
  readonly label: string;
  readonly glyph?: string | undefined;
  /** Destructive items are grouped last, behind a rule. */
  readonly danger?: boolean | undefined;
  readonly disabled?: boolean | undefined;
  readonly onSelect: () => void;
}

export interface OverflowMenuProps {
  /** The full accessible name, already naming its subject. */
  readonly label: string;
  readonly items: readonly OverflowItem[];
  readonly disabled?: boolean | undefined;
}

export function OverflowMenu({ label, items, disabled = false }: OverflowMenuProps): ReactNode {
  const [open, setOpen] = useState(false);
  const [focusIndex, setFocusIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const close = useCallback((returnFocus: boolean): void => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  // Ordered so destructive actions are always last, whatever the caller passed.
  const ordered = [...items].sort(
    (left, right) => Number(left.danger ?? false) - Number(right.danger ?? false),
  );
  const firstDanger = ordered.findIndex((item) => item.danger === true);

  useEffect(() => {
    if (!open) return;
    itemRefs.current[focusIndex]?.focus();
  }, [open, focusIndex]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent): void => {
      const target = event.target;
      if (target instanceof Node && containerRef.current?.contains(target) === false) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  const openAt = (index: number): void => {
    setFocusIndex(index);
    setOpen(true);
  };

  const onTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>): void => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      openAt(0);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      openAt(ordered.length - 1);
    }
  };

  const onMenuKeyDown = (event: React.KeyboardEvent<HTMLUListElement>): void => {
    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        close(true);
        break;
      case 'Tab':
        close(false);
        break;
      case 'ArrowDown':
        event.preventDefault();
        setFocusIndex((current) => (current + 1) % ordered.length);
        break;
      case 'ArrowUp':
        event.preventDefault();
        setFocusIndex((current) => (current - 1 + ordered.length) % ordered.length);
        break;
      case 'Home':
        event.preventDefault();
        setFocusIndex(0);
        break;
      case 'End':
        event.preventDefault();
        setFocusIndex(ordered.length - 1);
        break;
      default:
        break;
    }
  };

  const select = (item: OverflowItem): void => {
    close(true);
    item.onSelect();
  };

  return (
    <div className="overflow" ref={containerRef}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={label}
        className="button button--quiet overflow__trigger"
        disabled={disabled}
        onClick={() => (open ? close(false) : openAt(0))}
        onKeyDown={onTriggerKeyDown}
        ref={triggerRef}
        type="button"
      >
        <span aria-hidden="true">⋯</span>
      </button>

      {open && (
        <ul aria-label={label} className="overflow__menu" onKeyDown={onMenuKeyDown} role="menu">
          {ordered.map((item, index) => (
            <li key={item.key}>
              {index === firstDanger && index > 0 && (
                <div aria-hidden="true" className="overflow__separator" />
              )}
              <button
                className={
                  item.danger === true ? 'overflow__item overflow__item--danger' : 'overflow__item'
                }
                disabled={item.disabled ?? false}
                onClick={() => select(item)}
                ref={(node) => {
                  itemRefs.current[index] = node;
                }}
                role="menuitem"
                tabIndex={index === focusIndex ? 0 : -1}
                type="button"
              >
                {item.glyph !== undefined && (
                  <span aria-hidden="true" className="button__glyph">
                    {item.glyph}
                  </span>
                )}
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
