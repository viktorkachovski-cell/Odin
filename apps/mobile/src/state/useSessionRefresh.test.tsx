import { act, renderHook } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';
import { setSessionAutoRefresh } from '@odin/data';
import { useSessionRefresh } from './useSessionRefresh.ts';

jest.mock('@odin/data', () => ({ setSessionAutoRefresh: jest.fn(() => Promise.resolve()) }));

it('refreshes in the foreground, stops in background and removes its listener', async () => {
  let emit: (state: AppStateStatus) => void = () => undefined;
  const remove = jest.fn();
  const spy = jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    emit = listener;
    return { remove };
  });
  const client = {} as never;
  const view = await renderHook(() => useSessionRefresh(client));
  await act(async () => {
    emit('active');
    await Promise.resolve();
  });
  expect(setSessionAutoRefresh).toHaveBeenLastCalledWith(client, true);
  await act(async () => {
    emit('background');
    await Promise.resolve();
  });
  expect(setSessionAutoRefresh).toHaveBeenLastCalledWith(client, false);
  await view.unmount();
  expect(remove).toHaveBeenCalledTimes(1);
  spy.mockRestore();
});
