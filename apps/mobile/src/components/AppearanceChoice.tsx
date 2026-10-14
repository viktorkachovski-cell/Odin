import type { ReactNode } from 'react';

import { APPEARANCE_PREFERENCES } from '../appearance/preference.ts';
import { useAppearance } from '../state/AppearanceProvider.tsx';
import { useOdin } from '../state/OdinContext.ts';
import { ChoiceGroup } from './ChoiceGroup.tsx';

export function AppearanceChoice(): ReactNode {
  const { t } = useOdin();
  const { preference, setPreference } = useAppearance();
  return (
    <ChoiceGroup
      label={t('settings.appearance.label')}
      onChange={setPreference}
      options={APPEARANCE_PREFERENCES.map((key) => ({
        key,
        label: t(`settings.appearance.${key}`),
      }))}
      value={preference}
    />
  );
}
