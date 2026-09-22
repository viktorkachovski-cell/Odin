import * as Clipboard from 'expo-clipboard';
import { useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import type { InvitationDto } from '@odin/contracts';
import { createInvitation, updateProfile, useCommand } from '@odin/data';
import { validateDisplayName } from '@odin/domain';
import type { Locale, TranslationKey } from '@odin/i18n';

import { useNavVisibility } from '../../src/state/NavVisibility.tsx';
import { useOdin } from '../../src/state/OdinContext.ts';
import { useHouseholdQuery, useMembersQuery, useProfileQuery } from '../../src/state/queries.ts';
import { Avatar } from '../../src/components/Avatar.tsx';
import { ErrorBanner } from '../../src/components/Banner.tsx';
import { NavSpacer } from '../../src/components/BottomNav.tsx';
import { PrimaryButton, SecondaryButton } from '../../src/components/Button.tsx';
import { Field } from '../../src/components/Field.tsx';
import { LoadingState, Screen } from '../../src/components/Screen.tsx';
import { inviteLink } from '../../src/env.ts';
import { useTheme } from '../../src/theme.ts';

/**
 * Settings offers exactly what the decisions allow: language, own display
 * name, the member list and invitation creation. There is deliberately no
 * remove-member, delete or expel control -- that authority is undecided
 * (docs/decisions.md) and must not be invented here.
 *
 * The invitation link is shown once, copied on demand and never persisted.
 */

function InvitePanel({
  invitation,
  onDismiss,
}: {
  readonly invitation: InvitationDto;
  readonly onDismiss: () => void;
}): ReactNode {
  const { t, locale } = useOdin();
  const theme = useTheme();
  const [copied, setCopied] = useState(false);

  const expires = new Intl.DateTimeFormat(locale === 'bg' ? 'bg-BG' : 'en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(invitation.expires_at));

  return (
    <View style={[styles.panel, { borderColor: theme.colors.border }]}>
      <Text style={{ color: theme.colors.text }}>{t('settings.invite.ready', { expires })}</Text>
      <SecondaryButton
        label={copied ? t('settings.invite.copied') : t('settings.invite.copy')}
        onPress={() => {
          // The link is copied but never rendered, so a shoulder-surfer or a
          // screenshot cannot capture a working token.
          void Clipboard.setStringAsync(inviteLink(invitation.token));
          setCopied(true);
        }}
      />
      <SecondaryButton label={t('settings.invite.dismiss')} onPress={onDismiss} />
    </View>
  );
}

export default function SettingsScreen(): ReactNode {
  const { t, locale, setLocale, client, signOut } = useOdin();
  const theme = useTheme();
  const nav = useNavVisibility();
  const profile = useProfileQuery();
  const household = useHouseholdQuery();
  const members = useMembersQuery(true);

  const [displayName, setDisplayName] = useState<string | null>(null);
  const [nameIssue, setNameIssue] = useState<string | undefined>(undefined);
  const [invitation, setInvitation] = useState<InvitationDto | null>(null);

  const saveProfile = useCommand(
    (requestId, input: { readonly displayName: string; readonly locale: Locale }) =>
      updateProfile(client, requestId, input),
    { invalidate: [['profile']] },
  );

  // create_invitation takes nothing beyond the envelope, so the input is void.
  const invite = useCommand<void, InvitationDto>(
    (requestId) => createInvitation(client, requestId),
    { onSuccess: setInvitation },
  );

  if (profile.isPending) return <LoadingState label={t('state.loading')} />;

  const currentName = displayName ?? profile.data?.display_name ?? '';

  const submitName = (): void => {
    const issue = validateDisplayName(currentName);
    setNameIssue(issue === null ? undefined : t(issue.message_key as TranslationKey));
    if (issue !== null) return;
    void saveProfile.run({ displayName: currentName.trim(), locale });
  };

  const chooseLanguage = (next: Locale): void => {
    setLocale(next);
    // The preference lives on the profile, so it follows the account.
    void saveProfile.run({ displayName: currentName.trim(), locale: next });
  };

  return (
    <Screen title={t('settings.title')}>
      <ScrollView
        contentContainerStyle={styles.content}
        onScroll={nav.onScroll}
        scrollEventThrottle={16}
      >
        {saveProfile.state.error !== null && <ErrorBanner error={saveProfile.state.error} t={t} />}

        <Text accessibilityRole="header" style={[styles.heading, { color: theme.colors.text }]}>
          {t('settings.profile.heading')}
        </Text>
        <Field
          error={nameIssue}
          label={t('onboarding.name.label')}
          onChangeText={setDisplayName}
          value={currentName}
        />
        <PrimaryButton
          label={saveProfile.state.pending ? t('state.saving') : t('settings.save')}
          onPress={submitName}
          pending={saveProfile.state.pending}
        />

        <Text style={[styles.label, { color: theme.colors.textMuted }]}>
          {t('settings.language.label')}
        </Text>
        <View accessibilityRole="radiogroup" style={styles.row}>
          {(['en', 'bg'] as const).map((option) => (
            <SecondaryButton
              accessibilityLabel={t(`locale.${option}` as TranslationKey)}
              key={option}
              label={`${locale === option ? '● ' : '○ '}${t(`locale.${option}` as TranslationKey)}`}
              onPress={() => chooseLanguage(option)}
            />
          ))}
        </View>
        <Text style={[styles.note, { color: theme.colors.textMuted }]}>
          {t('settings.language.note')}
        </Text>

        <Text accessibilityRole="header" style={[styles.heading, { color: theme.colors.text }]}>
          {t('settings.household.heading')}
        </Text>
        <Text style={{ color: theme.colors.text }}>{household.data?.name ?? ''}</Text>

        <Text accessibilityRole="header" style={[styles.heading, { color: theme.colors.text }]}>
          {t('settings.members.heading')}
        </Text>
        {(members.data ?? []).map((member) => (
          <View key={member.user_id} style={styles.member}>
            <Avatar displayName={member.display_name} userId={member.user_id} />
            <Text style={{ color: theme.colors.text }}>{member.display_name}</Text>
          </View>
        ))}

        <Text accessibilityRole="header" style={[styles.heading, { color: theme.colors.text }]}>
          {t('settings.invite.heading')}
        </Text>
        {invite.state.error !== null && <ErrorBanner error={invite.state.error} t={t} />}
        {invitation === null ? (
          <PrimaryButton
            label={
              invite.state.pending ? t('settings.invite.creating') : t('settings.invite.create')
            }
            onPress={() => void invite.run()}
            pending={invite.state.pending}
          />
        ) : (
          <InvitePanel
            invitation={invitation}
            onDismiss={() => {
              invite.reset();
              setInvitation(null);
            }}
          />
        )}

        <SecondaryButton label={t('auth.sign_out')} onPress={() => void signOut()} />
        <NavSpacer />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 12, paddingBottom: 16 },
  heading: { fontSize: 18, fontWeight: '700', marginTop: 8 },
  label: { fontSize: 14, fontWeight: '500' },
  member: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  note: { fontSize: 13 },
  panel: { borderRadius: 10, borderWidth: 1, gap: 8, padding: 12 },
  row: { flexDirection: 'row', gap: 8 },
});
