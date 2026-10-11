import { useEffect, useId, useRef, type ReactNode } from 'react';

/**
 * Modal dialog. Escape closes without saving, focus moves in on open and
 * returns to the trigger on close, and Tab is trapped inside so keyboard users
 * cannot wander into the inert page behind it.
 */

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface DialogProps {
  readonly title: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
  /**
   * `side` docks the panel to the right edge at full height -- the task panel,
   * where the list behind stays visible for context. It is still modal.
   */
  readonly variant?: 'center' | 'side';
}

export function Dialog({
  title,
  onClose,
  children,
  footer,
  variant = 'center',
}: DialogProps): ReactNode {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    openerRef.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel)?.focus();

    return () => {
      // Returning focus to the trigger keeps keyboard context after closing.
      openerRef.current?.focus();
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;

      const panel = panelRef.current;
      if (panel === null) return;
      const focusable = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (first === undefined || last === undefined) return;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [onClose]);

  return (
    <div
      className={variant === 'side' ? 'dialog-backdrop dialog-backdrop--side' : 'dialog-backdrop'}
    >
      <div
        aria-labelledby={titleId}
        aria-modal="true"
        className={variant === 'side' ? 'dialog dialog--side' : 'dialog'}
        ref={panelRef}
        role="dialog"
        tabIndex={-1}
      >
        <h2 className="dialog__title" id={titleId}>
          {title}
        </h2>
        {children}
        {footer !== undefined && <div className="dialog__actions">{footer}</div>}
      </div>
    </div>
  );
}
