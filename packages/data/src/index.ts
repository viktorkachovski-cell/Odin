/**
 * Public surface of @odin/data. Screens import from here and never from the
 * Supabase SDK or from deep paths inside this package.
 */

export type {
  OdinClientConfig,
  OdinClientOptions,
  OdinSupabaseClient,
  SessionStorageAdapter,
} from './client.ts';
export { createOdinClient } from './client.ts';
export { configureRequestIdGenerator } from './request-id.ts';
export { setSessionAutoRefresh } from './auth.ts';

export type { AuthUser } from './auth.ts';
export {
  getCurrentUser,
  onAuthStateChange,
  requestSignInCode,
  signOut,
  verifySignInCode,
} from './auth.ts';

export { OdinError } from './error-mapping.ts';
export {
  registerWithPassword,
  signInWithPassword,
  requestPasswordReset,
  resendConfirmation,
  updatePassword,
  restoreEmailSession,
} from './password-auth.ts';

export {
  getHome,
  getList,
  getMembers,
  getMyHousehold,
  getMyProfile,
  getMyTasks,
  getSession,
  getUnassigned,
} from './repositories.ts';

export {
  claimTask,
  copyTemplate,
  createHousehold,
  createInvitation,
  createList,
  createTask,
  deleteList,
  deleteTask,
  newRequestId,
  redeemInvitation,
  revokeInvitation,
  setTaskCompleted,
  updateList,
  updateProfile,
  updateTask,
} from './commands.ts';

export {
  keysAffectedByListChange,
  keysAffectedByMembershipChange,
  keysAffectedByTaskChange,
  keysAffectedByTaskTemplateChange,
  queryKeys,
} from './query-keys.ts';

export type { ChangeKind, Subscription, SubscriptionHandlers } from './realtime.ts';
export { subscribeToHousehold } from './realtime.ts';

export type { CommandState, UseCommandResult } from './use-command.ts';
export { useCommand } from './use-command.ts';

export { getTaskTemplates, saveTaskTemplate } from './task-templates.ts';
