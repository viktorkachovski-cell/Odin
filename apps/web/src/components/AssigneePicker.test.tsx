import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { MemberDto } from '@odin/contracts';
import { createTranslator } from '@odin/i18n';

import { AssigneePicker } from './AssigneePicker.tsx';

const members: MemberDto[] = [
  { user_id: 'u1', display_name: 'Ana', avatar_ref: null },
  { user_id: 'u2', display_name: 'Boris', avatar_ref: null },
  { user_id: 'u3', display_name: 'Boris', avatar_ref: null },
  {
    user_id: 'u4',
    display_name: 'Maria-Magdalena Konstantinopolitanska-Papadopoulou',
    avatar_ref: null,
  },
];

function Harness({
  initial = [],
  locale = 'en',
  onChange = vi.fn(),
}: {
  readonly initial?: readonly string[];
  readonly locale?: 'en' | 'bg';
  readonly onChange?: (ids: readonly string[]) => void;
}) {
  const [selected, setSelected] = useState<readonly string[]>(initial);
  return (
    <AssigneePicker
      currentUserId="u1"
      members={members}
      onChange={(ids) => {
        setSelected(ids);
        onChange(ids);
      }}
      selected={selected}
      t={createTranslator(locale)}
    />
  );
}

describe('AssigneePicker', () => {
  it('is a labelled group of native checkboxes, one per member', () => {
    render(<Harness />);
    expect(screen.getByRole('group', { name: 'Assigned to' })).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')).toHaveLength(4);
    expect(screen.getByTestId('assignee-summary')).toHaveTextContent('Nobody');
  });

  it('selects several members and writes every selected name out', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Boris (2)' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Ana (you)' }));
    expect(onChange).toHaveBeenLastCalledWith(['u1', 'u3']);
    expect(screen.getByTestId('assignee-summary')).toHaveTextContent('Ana (you), Boris (2)');
    expect(screen.getByRole('checkbox', { name: 'Boris (2)' })).toBeChecked();
  });

  it('works from the keyboard with Space', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await userEvent.tab();
    await userEvent.tab();
    expect(screen.getAllByRole('checkbox')[0]).toHaveFocus();
    await userEvent.keyboard(' ');
    expect(onChange).toHaveBeenLastCalledWith(['u1']);
  });

  it('adds the member without removing anyone, removes only the member, and clears all', async () => {
    const onChange = vi.fn();
    render(<Harness initial={['u2', 'u3']} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Assign to me' }));
    expect(onChange).toHaveBeenLastCalledWith(['u1', 'u2', 'u3']);
    expect(screen.queryByRole('button', { name: 'Assign to me' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Remove me' }));
    expect(onChange).toHaveBeenLastCalledWith(['u2', 'u3']);
    await userEvent.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(onChange).toHaveBeenLastCalledWith([]);
    expect(screen.getByTestId('assignee-summary')).toHaveTextContent('Nobody');
  });

  it('announces the count politely and keeps a long name whole', () => {
    render(<Harness initial={['u4']} />);
    expect(screen.getByText('1 selected')).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByTestId('assignee-summary')).toHaveTextContent(
      'Maria-Magdalena Konstantinopolitanska-Papadopoulou',
    );
  });

  it('refuses a further member once the set is full', () => {
    const many = Array.from({ length: 50 }, (_, index) => `x${String(index).padStart(2, '0')}`);
    render(<Harness initial={many} />);
    expect(screen.getByText('A task can have up to 50 assignees.')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Boris' })).toBeDisabled();
  });

  it('shows someone who has left so the member can take them off', async () => {
    const onChange = vi.fn();
    render(<Harness initial={['u2', 'gone']} onChange={onChange} />);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Former member' }));
    expect(onChange).toHaveBeenLastCalledWith(['u2']);
    expect(screen.queryByRole('checkbox', { name: 'Former member' })).toBeNull();
  });

  it('speaks Bulgarian', () => {
    render(<Harness initial={['u2']} locale="bg" />);
    expect(screen.getByRole('button', { name: 'Назначи на мен' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Изчисти всички' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Възложено на' })).toBeInTheDocument();
  });
});
