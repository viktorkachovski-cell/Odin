import { fireEvent, render, screen } from '@testing-library/react-native';
import { createTranslator } from '@odin/i18n';
import { DEFAULT_TASK_FILTERS, TaskFilters } from './TaskFilters.tsx';

const t = createTranslator('en');

describe('Task filter sheet', () => {
  it('only commits a valid selection when Apply is pressed', async () => {
    const onApply = jest.fn();
    const onClose = jest.fn();
    await render(
      <TaskFilters
        value={DEFAULT_TASK_FILTERS}
        view="everyone"
        t={t}
        onApply={onApply}
        onClose={onClose}
      />,
    );
    await fireEvent.press(screen.getByRole('radio', { name: 'Overdue' }));
    await fireEvent(screen.getByLabelText('Blocked only'), 'valueChange', true);
    expect(onApply).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText('Apply filters'));
    expect(onApply).toHaveBeenCalledWith({
      deadline: { preset: 'overdue' },
      blockedOnly: true,
      showDone: false,
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('discards a changed selection on Cancel and keeps Show done out of Mine', async () => {
    const onApply = jest.fn();
    const onClose = jest.fn();
    await render(
      <TaskFilters
        value={DEFAULT_TASK_FILTERS}
        view="mine"
        t={t}
        onApply={onApply}
        onClose={onClose}
      />,
    );
    expect(screen.queryByLabelText('Show done')).toBeNull();
    await fireEvent.press(screen.getByRole('radio', { name: 'Upcoming' }));
    await fireEvent.press(screen.getByLabelText('Cancel'));
    expect(onApply).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps an invalid range open with its draft, then accepts the corrected inclusive dates', async () => {
    const onApply = jest.fn();
    const onClose = jest.fn();
    await render(
      <TaskFilters
        value={DEFAULT_TASK_FILTERS}
        view="everyone"
        t={t}
        onApply={onApply}
        onClose={onClose}
      />,
    );
    await fireEvent.press(screen.getByRole('radio', { name: 'Date range' }));
    await fireEvent.changeText(screen.getByLabelText('From'), '2030-04-08');
    await fireEvent.changeText(screen.getByLabelText('Through'), '2030-04-07');
    await fireEvent.press(screen.getByLabelText('Apply filters'));
    expect(screen.getByRole('alert')).toHaveTextContent(t('filter.date.invalid'));
    expect(screen.getByLabelText('From')).toHaveDisplayValue('2030-04-08');
    expect(onApply).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText('Through'), '2030-04-08');
    await fireEvent.press(screen.getByLabelText('Apply filters'));
    expect(onApply).toHaveBeenCalledWith({
      deadline: { preset: 'range', from: '2030-04-08', to: '2030-04-08' },
      blockedOnly: false,
      showDone: false,
    });
  });

  it('resets deadline, Blocked and Show done as a draft before applying', async () => {
    const onApply = jest.fn();
    await render(
      <TaskFilters
        value={{ deadline: { preset: 'overdue' }, blockedOnly: true, showDone: true }}
        view="everyone"
        t={t}
        onApply={onApply}
        onClose={jest.fn()}
      />,
    );
    await fireEvent.press(screen.getByLabelText('Reset filters'));
    expect(onApply).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText('Apply filters'));
    expect(onApply).toHaveBeenCalledWith(DEFAULT_TASK_FILTERS);
  });
});
