import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { CommandError } from '@odin/contracts';
import { TRANSLATION_KEYS, type TranslationKey, type Translator } from '@odin/i18n';

import { useTheme } from '../theme.ts';
import { SecondaryButton } from './Button.tsx';

/**
 * Renders a typed error as localized text. The server's `message_key` is used
 * when it is one we actually ship, otherwise we fall back to the generic message
 * for the code -- a raw key or SQL text must never reach the user.
 */
export function errorMessage(error: CommandError, t: Translator): string {
  const key = error.message_key;
  if ((TRANSLATION_KEYS as readonly string[]).includes(key)) {
    return t(key as TranslationKey);
  }
  return t(`error.${error.code.toLowerCase()}` as TranslationKey);
}

export function ErrorBanner({
  error,
  t,
  onRetry,
}: {
  readonly error: CommandError;
  readonly t: Translator;
  readonly onRetry?: (() => void) | undefined;
}): ReactNode {
  const theme = useTheme();
  return (
    <View
      accessibilityLiveRegion="assertive"
      accessibilityRole="alert"
      style={[
        styles.banner,
        { backgroundColor: theme.colors.surface, borderColor: theme.colors.danger },
      ]}
    >
      <Text style={[styles.text, { color: theme.colors.text }]}>{errorMessage(error, t)}</Text>
      {onRetry !== undefined && <SecondaryButton label={t('state.retry')} onPress={onRetry} />}
    </View>
  );
}

/** Offline and reconnecting states are announced politely, not as alerts. */
export function StaleBanner({
  online,
  realtimeHealthy,
  lastSyncedAt,
  t,
  locale,
}: {
  readonly online: boolean;
  readonly realtimeHealthy: boolean;
  readonly lastSyncedAt: number | null;
  readonly t: Translator;
  readonly locale: string;
}): ReactNode {
  const theme = useTheme();
  if (online && realtimeHealthy) return null;

  const synced =
    lastSyncedAt === null
      ? ''
      : ` ${new Intl.DateTimeFormat(locale, { timeStyle: 'short' }).format(new Date(lastSyncedAt))}`;

  return (
    <View
      accessibilityLiveRegion="polite"
      accessibilityRole="text"
      style={[
        styles.banner,
        { backgroundColor: theme.colors.surfaceMuted, borderColor: theme.colors.border },
      ]}
    >
      <Text style={[styles.text, { color: theme.colors.text }]}>
        {`${online ? t('state.stale') : t('state.offline')}${synced}`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  text: { flexShrink: 1, fontSize: 14 },
});
