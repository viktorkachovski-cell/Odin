import { useAuthRequest as useSharedAuthRequest, type AuthRequest } from '@odin/data';

import { useOdin } from './OdinContext.ts';

export { EMAIL_COOLDOWN_SECONDS } from '@odin/data';

export function useAuthRequest(): AuthRequest {
  return useSharedAuthRequest(useOdin().online);
}
