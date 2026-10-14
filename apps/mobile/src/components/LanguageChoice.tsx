import type { ReactNode } from 'react';

import type { Locale } from '@odin/i18n';

import { useOdin } from '../state/OdinContext.ts';
import { ChoiceGroup } from './ChoiceGroup.tsx';

const LOCALES = ['en', 'bg'] as const;

export function LanguageChoice({
  label,
  value,
  onChange,
}: {
  readonly label: string;
  readonly value: Locale;
  readonly onChange: (next: Locale) => void;
}): ReactNode {
  const { t } = useOdin();
  return (
    <ChoiceGroup
      label={label}
      onChange={onChange}
      options={LOCALES.map((locale) => ({ key: locale, label: t(`locale.${locale}`) }))}
      value={value}
    />
  );
}
