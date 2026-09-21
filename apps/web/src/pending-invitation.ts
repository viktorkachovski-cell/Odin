/** Bearer invitation lives only in this tab's memory, never persistent storage. */
let token: string | null = null;
export function rememberInvitation(value: string): void {
  token = value;
}
export function getPendingInvitation(): string | null {
  return token;
}
export function clearPendingInvitation(): void {
  token = null;
}
