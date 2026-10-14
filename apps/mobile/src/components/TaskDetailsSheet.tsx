import type { ReactNode } from 'react';
import { Text } from 'react-native';

import type { Translator } from '@odin/i18n';

import { PrimaryButton, SecondaryButton } from './Button.tsx';
import { LoadingState } from './Screen.tsx';
import { Sheet } from './Sheet.tsx';

export function TaskDetailsLoadingSheet({
  t,
  onClose,
}: {
  readonly t: Translator;
  readonly onClose: () => void;
}): ReactNode {
  return (
    <Sheet
      footer={<SecondaryButton label={t('task.details.close')} onPress={onClose} />}
      onClose={onClose}
      title={t('task.details.title')}
    >
      <LoadingState label={t('task.details.loading')} />
    </Sheet>
  );
}

export function TaskDetailsErrorSheet({
  t,
  onClose,
  onRetry,
}: {
  readonly t: Translator;
  readonly onClose: () => void;
  readonly onRetry: () => void;
}): ReactNode {
  return (
    <Sheet
      footer={
        <>
          <SecondaryButton label={t('task.details.close')} onPress={onClose} />
          <PrimaryButton label={t('state.retry')} onPress={onRetry} />
        </>
      }
      onClose={onClose}
      title={t('task.details.title')}
    >
      <Text>{t('task.details.error')}</Text>
    </Sheet>
  );
}
