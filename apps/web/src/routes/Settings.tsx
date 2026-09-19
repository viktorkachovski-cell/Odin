import { useState, type ReactNode } from 'react';

import type { InvitationDto, Locale } from '@odin/contracts';
import { createInvitation, keysAffectedByMembershipChange, updateProfile } from '@odin/data';
import { validateDisplayName } from '@odin/domain';
import type { TranslationKey } from '@odin/i18n';

import { useOdin } from '../app/OdinContext.ts';
import { useHouseholdQuery, useMembersQuery } from '../app/queries.ts';
import { useCommand } from '../app/useCommand.ts';
import { Avatar } from '../components/Avatar.tsx';
import { ErrorBanner } from '../components/Banner.tsx';
import { Field } from '../components/Field.tsx';

/**
 * Settings holds language, own display name, the member list, invitation
 * creation and sign out. Every member has identical permissions, so there is
 * deliberately no role control and no remove-member action: member removal is
 * an unapproved lifecycle decision (docs/01-DECISIONS.md).
 */

function InvitationPanel({ invitation }: { readonly invitation: InvitationDto }): ReactNode {
  const { t, locale } = useOdin();
  const [copied, setCopied] = useState(false);
  // The token travels in the fragment so it stays out of request paths and logs.
  const link = `${window.location.origin}/invite#token=${invitation.token}`;
  const expires = new Intl.DateTimeFormat(locale === 'bg' ? 'bg-BG' : 'en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(invitation.expires_at));

  return (
    <div className="stack">
      <p>{t('settings.invite.ready', { expires })}</p>
      <p className="invite-link">{link}</p>
      <div className="task-row__actions">
        <button
          className="button button--primary"
          onClick={() => {
            void navigator.clipboard.writeText(link).then(
              () => setCopied(true),
              () => setCopied(false),
            );
          }}
          type="button"
        >
          {t('settings.invite.copy')}
        </button>
        {copied && <span role="status">{t('settings.invite.copied')}</span>}
      </div>
    </div>
  );
}

export function Settings(): ReactNode {
  const { t, locale, setLocale, client, signOut } = useOdin();
  const household = useHouseholdQuery();
  const members = useMembersQuery(true);

  const [displayName, setDisplayName] = useState(() => household.data?.profile?.display_name ?? '');
  const [nameIssue, setNameIssue] = useState<string | undefined>(undefined);
  const [saved, setSaved] = useState(false);
  const [invitation, setInvitation] = useState<InvitationDto | null>(null);

  const saveProfile = useCommand(
    (requestId, input: { readonly displayName: string; readonly locale: Locale }) =>
      updateProfile(client, requestId, {
        displayName: input.displayName,
        locale: input.locale,
      }),
    {
      invalidate: keysAffectedByMembershipChange(),
      onSuccess: () => setSaved(true),
    },
  );

  // create_invitation takes nothing beyond the envelope, so the command's input
  // type is void rather than an unused placeholder object.
  const invite = useCommand<void, InvitationDto>(
    (requestId) => createInvitation(client, requestId),
    { onSuccess: (data) => setInvitation(data) },
  );

  const submitProfile = (): void => {
    const issue = validateDisplayName(displayName);
    setNameIssue(issue === null ? undefined : t(issue.message_key as TranslationKey));
    if (issue !== null) return;
    setSaved(false);
    void saveProfile.run({ displayName: displayName.trim(), locale });
  };

  return (
    <>
      <div className="page-header">
        <h1>{t('settings.title')}</h1>
        <button className="button" onClick={() => void signOut()} type="button">
          {t('auth.sign_out')}
        </button>
      </div>

      <section className="section">
        <h2 className="section__heading">{t('settings.profile.heading')}</h2>

        {saveProfile.state.error !== null && <ErrorBanner error={saveProfile.state.error} t={t} />}

        <form
          onSubmit={(event) => {
            event.preventDefault();
            submitProfile();
          }}
        >
          <Field error={nameIssue} label={t('onboarding.name.label')}>
            {(props) => (
              <input
                {...props}
                onChange={(event) => setDisplayName(event.target.value)}
                type="text"
                value={displayName}
              />
            )}
          </Field>

          <Field hint={t('settings.language.note')} label={t('settings.language.label')}>
            {(props) => (
              <select
                {...props}
                onChange={(event) => setLocale(event.target.value === 'bg' ? 'bg' : 'en')}
                value={locale}
              >
                <option value="en">{t('locale.en')}</option>
                <option value="bg">{t('locale.bg')}</option>
              </select>
            )}
          </Field>

          <button
            className="button button--primary"
            disabled={saveProfile.state.pending}
            type="submit"
          >
            {saveProfile.state.pending ? t('state.saving') : t('settings.save')}
          </button>
          {saved && <span role="status"> {t('settings.saved')}</span>}
        </form>
      </section>

      <section className="section">
        <h2 className="section__heading">{t('settings.members.heading')}</h2>
        <ul className="member-list">
          {(members.data ?? []).map((member) => (
            <li className="chip" key={member.user_id}>
              <Avatar displayName={member.display_name} userId={member.user_id} />
              {member.display_name}
            </li>
          ))}
        </ul>
      </section>

      <section className="section">
        <h2 className="section__heading">{t('settings.invite.heading')}</h2>

        {invite.state.error !== null && <ErrorBanner error={invite.state.error} t={t} />}

        {invitation === null ? (
          <button
            className="button button--primary"
            disabled={invite.state.pending}
            onClick={() => void invite.run()}
            type="button"
          >
            {invite.state.pending ? t('settings.invite.creating') : t('settings.invite.create')}
          </button>
        ) : (
          <>
            <InvitationPanel invitation={invitation} />
            <button
              className="button"
              onClick={() => {
                setInvitation(null);
                invite.reset();
              }}
              type="button"
            >
              {t('settings.invite.dismiss')}
            </button>
          </>
        )}
      </section>
    </>
  );
}
