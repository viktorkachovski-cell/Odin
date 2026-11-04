import { fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';

import { createTranslator } from '@odin/i18n';

import { AssigneePicker } from './AssigneePicker.tsx';

const t = createTranslator('en');
const tBg = createTranslator('bg');
const members = [
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
  me = 'u1',
  translator = t,
  onChange,
}: {
  readonly initial?: readonly string[];
  readonly me?: string | null;
  readonly translator?: typeof t;
  readonly onChange?: (ids: readonly string[]) => void;
}) {
  const [selected, setSelected] = useState<readonly string[]>(initial);
  return (
    <AssigneePicker
      currentUserId={me}
      members={members}
      onChange={(ids) => {
        setSelected(ids);
        onChange?.(ids);
      }}
      selected={selected}
      t={translator}
    />
  );
}

describe('AssigneePicker', () => {
  it('says Nobody for an empty set and lists every member as a checkbox', async () => {
    await render(<Harness />);
    expect(screen.getByTestId('assignee-summary')).toHaveTextContent('Nobody');
    expect(screen.getAllByRole('checkbox')).toHaveLength(4);
    expect(screen.getByLabelText('Ana (you)')).toBeTruthy();
  });

  it('selects several members, announcing each state, and writes the names out', async () => {
    const onChange = jest.fn();
    await render(<Harness onChange={onChange} />);
    await fireEvent.press(screen.getByLabelText('Boris'));
    await fireEvent.press(screen.getByLabelText('Ana (you)'));
    expect(onChange).toHaveBeenLastCalledWith(['u1', 'u2']);
    expect(screen.getByLabelText('Boris').props.accessibilityState).toMatchObject({
      checked: true,
    });
    expect(screen.getByTestId('assignee-summary')).toHaveTextContent('Ana (you), Boris');
    await fireEvent.press(screen.getByLabelText('Boris'));
    expect(onChange).toHaveBeenLastCalledWith(['u1']);
  });

  it('tells two members called Boris apart in text and for TalkBack', async () => {
    await render(<Harness />);
    expect(screen.getByLabelText('Boris')).toBeTruthy();
    expect(screen.getByLabelText('Boris (2)')).toBeTruthy();
  });

  it('adds the member without removing anyone, then removes only the member', async () => {
    const onChange = jest.fn();
    await render(<Harness initial={['u2', 'u3']} onChange={onChange} />);
    await fireEvent.press(screen.getByLabelText('Assign to me'));
    expect(onChange).toHaveBeenLastCalledWith(['u1', 'u2', 'u3']);
    await fireEvent.press(screen.getByLabelText('Remove me'));
    expect(onChange).toHaveBeenLastCalledWith(['u2', 'u3']);
    expect(screen.queryByLabelText('Remove me')).toBeNull();
  });

  it('clears everyone', async () => {
    const onChange = jest.fn();
    await render(<Harness initial={['u1', 'u2']} onChange={onChange} />);
    await fireEvent.press(screen.getByLabelText('Clear all'));
    expect(onChange).toHaveBeenLastCalledWith([]);
    expect(screen.getByTestId('assignee-summary')).toHaveTextContent('Nobody');
    expect(screen.queryByLabelText('Clear all')).toBeNull();
  });

  it('shows a long name in full rather than cutting it', async () => {
    await render(<Harness initial={['u4']} />);
    expect(screen.getByTestId('assignee-summary')).toHaveTextContent(
      'Maria-Magdalena Konstantinopolitanska-Papadopoulou',
    );
  });

  it('refuses a further member once the set is full', async () => {
    const many = Array.from({ length: 50 }, (_, index) => `x${String(index).padStart(2, '0')}`);
    await render(<Harness initial={many} />);
    expect(screen.getByText('A task can have up to 50 assignees.')).toBeTruthy();
    expect(screen.getByLabelText('Boris').props.accessibilityState).toMatchObject({
      disabled: true,
    });
  });

  it('is available in Bulgarian', async () => {
    await render(<Harness initial={['u2']} translator={tBg} />);
    expect(screen.getByLabelText('Назначи на мен')).toBeTruthy();
    expect(screen.getByLabelText('Изчисти всички')).toBeTruthy();
    expect(screen.getByLabelText('Ana (ти)')).toBeTruthy();
  });

  it('shows someone who has left as a former member the member can take off', async () => {
    const onChange = jest.fn();
    await render(<Harness initial={['u2', 'gone']} onChange={onChange} />);
    expect(screen.getByLabelText('Former member')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Former member'));
    expect(onChange).toHaveBeenLastCalledWith(['u2']);
    expect(screen.queryByLabelText('Former member')).toBeNull();
  });
});
