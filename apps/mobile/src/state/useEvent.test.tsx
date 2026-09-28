import { renderHook } from '@testing-library/react-native';

import { useEvent } from './useEvent.ts';

it('keeps one identity across renders and runs the latest handler', async () => {
  const calls: string[] = [];
  const hook = await renderHook(
    ({ label }: { label: string }) => useEvent(() => calls.push(label)),
    {
      initialProps: { label: 'first' },
    },
  );
  const first = hook.result.current;

  await hook.rerender({ label: 'second' });
  hook.result.current();

  expect(hook.result.current).toBe(first);
  expect(calls).toEqual(['second']);
});
