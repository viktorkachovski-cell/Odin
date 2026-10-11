import { Redirect } from 'expo-router';
import type { ReactNode } from 'react';

/** Merged into Tasks; kept so old links and notifications still land. */
export default function UnassignedRedirect(): ReactNode {
  return <Redirect href="/tasks?view=unassigned" />;
}
