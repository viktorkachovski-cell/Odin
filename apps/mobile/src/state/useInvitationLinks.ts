import { addEventListener, getInitialURL } from 'expo-linking';
import { useEffect } from 'react';

import { tokenFromDeepLink } from '../routing.ts';
import { rememberInvitation } from './pending-invitation.ts';

let initialLinkHandled = false;

/** Consume the launch URL once, never again when the invite screen remounts. */
export function captureInvitationLink(url: string | null, initial = false): void {
  if (initial && initialLinkHandled) return;
  initialLinkHandled = true;
  const token = tokenFromDeepLink(url);
  if (token !== null) rememberInvitation(token);
}

export function useInvitationLinks(): void {
  useEffect(() => {
    let cancelled = false;
    const subscription = addEventListener('url', ({ url }) => captureInvitationLink(url));
    void getInitialURL()
      .then((url) => {
        if (!cancelled) captureInvitationLink(url, true);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);
}
