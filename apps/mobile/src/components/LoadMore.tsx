import type { ReactNode } from 'react';

import type { Translator } from '@odin/i18n';
import { SecondaryButton } from './Button.tsx';

export function LoadMore({
  hasNextPage,
  isFetchingNextPage,
  isFetchNextPageError,
  onPress,
  t,
}: {
  readonly hasNextPage: boolean;
  readonly isFetchingNextPage: boolean;
  readonly isFetchNextPageError: boolean;
  readonly onPress: () => void;
  readonly t: Translator;
}): ReactNode {
  if (!hasNextPage) return null;
  return (
    <SecondaryButton
      label={
        isFetchingNextPage
          ? t('state.loading')
          : t(isFetchNextPageError ? 'state.retry' : 'state.load_more')
      }
      onPress={onPress}
      pending={isFetchingNextPage}
    />
  );
}
