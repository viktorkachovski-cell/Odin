import { Redirect, router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  createHousehold,
  keysAffectedByMembershipChange,
  queryKeys,
  updateProfile,
  useCommand,
} from '@odin/data';
import { validateDisplayName, validateHouseholdName } from '@odin/domain';
import { issueText, type Locale } from '@odin/i18n';

import { useOdin } from '../src/state/OdinContext.ts';
import { useHouseholdQuery, useProfileQuery } from '../src/state/queries.ts';
import { ErrorBanner } from '../src/components/Banner.tsx';
import { PrimaryButton } from '../src/components/Button.tsx';
import { Field } from '../src/components/Field.tsx';
import { LanguageChoice } from '../src/components/LanguageChoice.tsx';
import { LoadingState } from '../src/components/Screen.tsx';
import { FormScreen as Screen } from '../src/components/FormScreen.tsx';
import { QueryFailure } from '../src/components/QueryFailure.tsx';
import { useTheme } from '../src/theme.ts';

/**
 * Onboarding. A profile is created first because `create_household` requires
 * one, then the account either starts a household or waits for an invitation
 * link. An invitation can never overwrite an existing membership: the server
 * rejects a second active household, and this screen never offers to replace
 * one.
 */

export default function OnboardingScreen(): ReactNode {
  const { t, client, locale, setLocale, user, authReady, online } = useOdin();
  const theme = useTheme();
  const profile = useProfileQuery();
  const household = useHouseholdQuery();

  const [displayName, setDisplayName] = useState('');
  const [householdName, setHouseholdName] = useState('');
  const [seedLocale, setSeedLocale] = useState<Locale>(locale);
  const [nameIssue, setNameIssue] = useState<string | undefined>(undefined);
  const [householdIssue, setHouseholdIssue] = useState<string | undefined>(undefined);

  // Invalidating the profile refetches it; that read is what moves onboarding on.
  const saveProfile = useCommand(
    (requestId, input: { readonly displayName: string; readonly locale: Locale }) =>
      updateProfile(client, requestId, input),
    { invalidate: [queryKeys.profile] },
  );

  const startHousehold = useCommand(
    (requestId, input: { readonly name: string; readonly seedLocale: Locale }) =>
      createHousehold(client, requestId, input),
    {
      invalidate: keysAffectedByMembershipChange(),
      onSuccess: () => router.replace('/'),
    },
  );

  if (!authReady) return <LoadingState />;
  if (user === null) return <Redirect href="/sign-in" />;
  if (profile.isError || household.isError) {
    return (
      <QueryFailure
        error={profile.error ?? household.error}
        onRetry={() => {
          void profile.refetch();
          void household.refetch();
        }}
      />
    );
  }
  if (profile.isPending || household.isPending) return <LoadingState />;
  // Invitation redemption may precede profile setup. Do not offer a second household.
  if (profile.data && household.data) return <Redirect href="/" />;

  const needsProfile = profile.data === null || profile.data === undefined;

  const submitProfile = (): void => {
    const issue = validateDisplayName(displayName);
    setNameIssue(issueText(issue, t));
    if (issue !== null) return;
    void saveProfile.run({ displayName: displayName.trim(), locale });
  };

  const submitHousehold = (): void => {
    const issue = validateHouseholdName(householdName);
    setHouseholdIssue(issueText(issue, t));
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
            disabled={!online}
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
          disabled={!online}
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
});
