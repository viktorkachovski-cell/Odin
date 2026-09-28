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
  getAllTasks,
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
  saveListTemplate,
  setTaskCompleted,
  updateList,
  updateProfile,
  updateTask,
} from './commands.ts';

export {
  keysAffectedByChanges,
  keysAffectedByListChange,
  keysAffectedByMembershipChange,
  keysAffectedByTaskChange,
  keysAffectedByTaskTemplateChange,
  queryKeys,
} from './query-keys.ts';

export type {
  ChangeKind,
  Subscription,
  SubscriptionHandlers,
  SubscriptionOptions,
} from './realtime.ts';
export { subscribeToHousehold } from './realtime.ts';

export type { AuthRequest } from './use-auth-request.ts';
export { EMAIL_COOLDOWN_SECONDS, useAuthRequest } from './use-auth-request.ts';

export type { CommandState, UseCommandResult } from './use-command.ts';
export { useCommand } from './use-command.ts';

export { getTaskTemplates, saveTaskTemplate } from './task-templates.ts';
export { getTask } from './task-detail.ts';
export { moveList, moveTask, setTaskState } from './task-workflow.ts';
export type { TaskRowActions, TaskRowCommandError } from './use-task-actions.ts';
export { useTaskRowActions } from './use-task-actions.ts';
