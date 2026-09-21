import type { ReactNode } from 'react';

import type { Translator } from '@odin/i18n';

import { Dialog } from './Dialog.tsx';

/**
 * The confirmation step for a destructive command, replacing `window.confirm`.
 *
 * Native confirm cannot be translated into Bulgarian, ignores the theme, and
 * looks like a browser error at the exact moment somebody is deciding whether
 * to destroy something. `Dialog` already traps focus, closes on Escape and
 * returns focus to the trigger.
 *
 * Cancel is the first focusable element in the panel, so `Dialog` focuses it on
 * open and Enter never destroys anything.
 */
export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  pending,
  t,
  onConfirm,
  onCancel,
}: {
  readonly title: string;
  readonly body: string;
  readonly confirmLabel: string;
  readonly pending: boolean;
  readonly t: Translator;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}): ReactNode {
  return (
    <Dialog
      footer={
        <>
          <button className="button" onClick={onCancel} type="button">
            {t('action.cancel')}
          </button>
          <button
            className="button button--primary button--danger"
            disabled={pending}
            onClick={onConfirm}
            type="button"
          >
            {confirmLabel}
          </button>
        </>
      }
      onClose={onCancel}
      title={title}
    >
      <p className="dialog__body">{body}</p>
    </Dialog>
  );
}
