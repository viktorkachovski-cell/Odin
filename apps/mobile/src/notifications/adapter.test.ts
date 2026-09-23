import { cancelAllReminders, enqueueReminderUpdate, scheduleReminder } from './adapter.ts';

const native = jest.requireMock<{
  __scheduled: Map<string, unknown>;
  __reset: () => void;
}>('expo-notifications');

it('does not recreate an alarm after mute overtakes a pending schedule', async () => {
  native.__reset();
  let release: () => void = () => undefined;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const scheduling = enqueueReminderUpdate(async () => {
    await pending;
    await scheduleReminder('odin-due:en:t1:day', Date.now() + 60_000, {
      title: 'Due soon',
      body: 'Task',
    });
  });
  const muting = enqueueReminderUpdate(cancelAllReminders);

  release();
  await Promise.all([scheduling, muting]);
  expect(native.__scheduled.size).toBe(0);
});
