import { useId, type ReactNode } from 'react';

/**
 * Every control is a real labelled form field. The error is wired through
 * aria-describedby and aria-invalid so screen readers announce it with the
 * input rather than as loose text.
 */

export interface FieldProps {
  readonly label: string;
  readonly error?: string | undefined;
  readonly hint?: string | undefined;
  readonly children: (props: {
    readonly id: string;
    readonly 'aria-invalid': boolean | undefined;
    readonly 'aria-describedby': string | undefined;
    readonly className: string;
  }) => ReactNode;
}

export function Field({ label, error, hint, children }: FieldProps): ReactNode {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy =
    [error === undefined ? null : errorId, hint === undefined ? null : hintId]
      .filter((value): value is string => value !== null)
      .join(' ') || undefined;

  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      {children({
        id,
        'aria-invalid': error === undefined ? undefined : true,
        'aria-describedby': describedBy,
        className: 'field__control',
      })}
      {hint !== undefined && (
        <span className="field__error" id={hintId} style={{ color: 'inherit' }}>
          {hint}
        </span>
      )}
      {error !== undefined && (
        <span className="field__error" id={errorId}>
          {error}
        </span>
      )}
    </div>
  );
}
