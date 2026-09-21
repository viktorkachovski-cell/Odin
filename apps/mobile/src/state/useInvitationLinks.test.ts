import { captureInvitationLink } from './useInvitationLinks.ts';
import { clearPendingInvitation, getPendingInvitation } from './pending-invitation.ts';

it('does not resurrect a cleared launch invitation but accepts a newly opened link', () => {
  captureInvitationLink('odin://invite#token=test-token', true);
  expect(getPendingInvitation()).toBe('test-token');
  clearPendingInvitation();
  captureInvitationLink('odin://invite#token=test-token', true);
  expect(getPendingInvitation()).toBeNull();
  captureInvitationLink('odin://invite#token=test-token');
  expect(getPendingInvitation()).toBe('test-token');
  clearPendingInvitation();
});
