import { useState, type ReactNode } from 'react';

import type { Locale } from '@odin/contracts';
import {
  createHousehold,
  keysAffectedByMembershipChange,
  updateProfile,
  useCommand,
} from '@odin/data';
import { validateDisplayName, validateHouseholdName } from '@odin/domain';
import type { TranslationKey } from '@odin/i18n';

import { useOdin } from '../app/OdinContext.ts';
import { errorMessage } from '../components/Banner.tsx';
import { Field } from '../components/Field.tsx';

/**
 * Onboarding runs after sign-in for an account with no profile or no active
 * household. A member who already belongs to a household never reaches here, so
 * an invitation link cannot overwrite an existing membership.
 */

export function Onboarding({ needsProfile }: { readonly needsProfile: boolean }): ReactNode {
  const { t, locale, setLocale } = useOdin();
  const [displayName, setDisplayName] = useState('');
  const [householdName, setHouseholdName] = useState('');
  const [seedLocale, setSeedLocale] = useState<Locale>(locale);
  const [nameIssue, setNameIssue] = useState<string | undefined>(undefined);
  const [householdIssue, setHouseholdIssue] = useState<string | undefined>(undefined);

  const { client } = useOdin();

  const profileCommand = useCommand(
    (requestId, input: { readonly displayName: string }) =>
      updateProfile(client, requestId, { displayName: input.displayName, locale }),
    { invalidate: keysAffectedByMembershipChange() },
  );

  const householdCommand = useCommand(
    (requestId, input: { readonly name: string; readonly seedLocale: Locale }) =>
      createHousehold(client, requestId, input),
    { invalidate: keysAffectedByMembershipChange() },
  );

  if (needsProfile) {
    const submitProfile = (): void => {
      const issue = validateDisplayName(displayName);
      setNameIssue(issue === null ? undefined : t(issue.message_key as TranslationKey));
      if (issue !== null) return;
      void profileCommand.run({ displayName: displayName.trim() });
    };

    return (
      <div className="auth-shell">
        <div className="auth-card">
          <h1>{t('onboarding.name.title')}</h1>
          {profileCommand.state.error !== null && (
            <div className="banner banner--danger" role="alert">
              {errorMessage(profileCommand.state.error, t)}
            </div>
          )}
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
                  autoComplete="nickname"
                  onChange={(event) => setDisplayName(event.target.value)}
                  type="text"
                  value={displayName}
                />
              )}
            </Field>
            <button
              className="button button--primary"
              disabled={profileCommand.state.pending}
              type="submit"
            >
              {t('onboarding.name.continue')}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const submitHousehold = (): void => {
    const issue = validateHouseholdName(householdName);
    setHouseholdIssue(issue === null ? undefined : t(issue.message_key as TranslationKey));
    if (issue !== null) return;
    void householdCommand.run({ name: householdName.trim(), seedLocale });
  };

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <h1>{t('onboarding.choice.title')}</h1>
        <p>{t('onboarding.choice.intro')}</p>

        {householdCommand.state.error !== null && (
          <div className="banner banner--danger" role="alert">
            {errorMessage(householdCommand.state.error, t)}
          </div>
        )}

        <form
          onSubmit={(event) => {
            event.preventDefault();
            submitHousehold();
          }}
        >
          <Field error={householdIssue} label={t('onboarding.household.label')}>
            {(props) => (
              <input
                {...props}
                onChange={(event) => setHouseholdName(event.target.value)}
                type="text"
                value={householdName}
              />
            )}
          </Field>

          <Field label={t('onboarding.seed_language.label')}>
            {(props) => (
              <select
                {...props}
                onChange={(event) => {
                  const next = event.target.value === 'bg' ? 'bg' : 'en';
                  setSeedLocale(next);
                  setLocale(next);
                }}
                value={seedLocale}
              >
                <option value="en">{t('locale.en')}</option>
                <option value="bg">{t('locale.bg')}</option>
              </select>
            )}
          </Field>

          <button
            className="button button--primary"
            disabled={householdCommand.state.pending}
            type="submit"
          >
            {householdCommand.state.pending ? t('onboarding.creating') : t('onboarding.create')}
          </button>
        </form>
      </div>
    </div>
  );
}
