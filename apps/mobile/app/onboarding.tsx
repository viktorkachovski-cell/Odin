import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  createHousehold,
  keysAffectedByMembershipChange,
  updateProfile,
  useCommand,
} from '@odin/data';
import { validateDisplayName, validateHouseholdName } from '@odin/domain';
import type { Locale, TranslationKey } from '@odin/i18n';

import { useOdin } from '../src/state/OdinContext.ts';
import { useProfileQuery } from '../src/state/queries.ts';
import { ErrorBanner } from '../src/components/Banner.tsx';
import { PrimaryButton, SecondaryButton } from '../src/components/Button.tsx';
import { Field } from '../src/components/Field.tsx';
import { LoadingState, Screen } from '../src/components/Screen.tsx';
import { useTheme } from '../src/theme.ts';

/**
 * Onboarding. A profile is created first because `create_household` requires
 * one, then the account either starts a household or waits for an invitation
 * link. An invitation can never overwrite an existing membership: the server
 * rejects a second active household, and this screen never offers to replace
 * one.
 */

function LanguageChoice({
  value,
  onChange,
  label,
}: {
  readonly value: Locale;
  readonly onChange: (next: Locale) => void;
  readonly label: string;
}): ReactNode {
  const theme = useTheme();
  const { t } = useOdin();
  return (
    <View style={styles.group}>
      <Text style={[styles.label, { color: theme.colors.textMuted }]}>{label}</Text>
      <View accessibilityRole="radiogroup" style={styles.row}>
        {(['en', 'bg'] as const).map((locale) => (
          <SecondaryButton
            accessibilityLabel={t(`locale.${locale}` as TranslationKey)}
            key={locale}
            label={`${value === locale ? '● ' : '○ '}${t(`locale.${locale}` as TranslationKey)}`}
            onPress={() => onChange(locale)}
          />
        ))}
      </View>
    </View>
  );
}

export default function OnboardingScreen(): ReactNode {
  const { t, client, locale, setLocale } = useOdin();
  const theme = useTheme();
  const profile = useProfileQuery();

  const [displayName, setDisplayName] = useState('');
  const [householdName, setHouseholdName] = useState('');
  const [seedLocale, setSeedLocale] = useState<Locale>(locale);
  const [nameIssue, setNameIssue] = useState<string | undefined>(undefined);
  const [householdIssue, setHouseholdIssue] = useState<string | undefined>(undefined);

  const saveProfile = useCommand(
    (requestId, input: { readonly displayName: string; readonly locale: Locale }) =>
      updateProfile(client, requestId, { displayName: input.displayName, locale: input.locale }),
    { invalidate: [['profile']], onSuccess: () => void profile.refetch() },
  );

  const startHousehold = useCommand(
    (requestId, input: { readonly name: string; readonly seedLocale: Locale }) =>
      createHousehold(client, requestId, input),
    {
      invalidate: keysAffectedByMembershipChange(),
      onSuccess: () => router.replace('/'),
    },
  );

  if (profile.isPending) return <LoadingState label={t('state.loading')} />;

  const needsProfile = profile.data === null || profile.data === undefined;

  const submitProfile = (): void => {
    const issue = validateDisplayName(displayName);
    setNameIssue(issue === null ? undefined : t(issue.message_key as TranslationKey));
    if (issue !== null) return;
    void saveProfile.run({ displayName: displayName.trim(), locale });
  };

  const submitHousehold = (): void => {
    const issue = validateHouseholdName(householdName);
    setHouseholdIssue(issue === null ? undefined : t(issue.message_key as TranslationKey));
    if (issue !== null) return;
    void startHousehold.run({ name: householdName.trim(), seedLocale });
  };

  if (needsProfile) {
    return (
      <Screen title={t('onboarding.name.title')}>
        <View style={styles.form}>
          {saveProfile.state.error !== null && (
            <ErrorBanner error={saveProfile.state.error} t={t} />
          )}
          <LanguageChoice
            label={t('settings.language.label')}
            onChange={setLocale}
            value={locale}
          />
          <Field
            error={nameIssue}
            label={t('onboarding.name.label')}
            onChangeText={setDisplayName}
            value={displayName}
          />
          <PrimaryButton
            label={t('onboarding.name.continue')}
            onPress={submitProfile}
            pending={saveProfile.state.pending}
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen title={t('onboarding.choice.title')}>
      <View style={styles.form}>
        <Text style={{ color: theme.colors.textMuted }}>{t('onboarding.choice.intro')}</Text>
        {startHousehold.state.error !== null && (
          <ErrorBanner error={startHousehold.state.error} t={t} />
        )}
        <Field
          error={householdIssue}
          label={t('onboarding.household.label')}
          onChangeText={setHouseholdName}
          value={householdName}
        />
        <LanguageChoice
          label={t('onboarding.seed_language.label')}
          onChange={setSeedLocale}
          value={seedLocale}
        />
        <PrimaryButton
          label={startHousehold.state.pending ? t('onboarding.creating') : t('onboarding.create')}
          onPress={submitHousehold}
          pending={startHousehold.state.pending}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { gap: 16 },
  group: { gap: 6 },
  label: { fontSize: 14, fontWeight: '500' },
  row: { flexDirection: 'row', gap: 8 },
});
