import { fireEvent, render, screen } from '@testing-library/react-native';
import { createTranslator } from '@odin/i18n';
import { BottomNav } from './BottomNav.tsx';

const mockNavigate = jest.fn();
jest.mock('expo-router', () => ({
  usePathname: () => '/list/l1',
  useRouter: () => ({ navigate: mockNavigate }),
}));

it('keeps all destinations reachable and Lists selected in list detail, with the own-task badge announced', async () => {
  await render(<BottomNav badge={3} t={createTranslator('en')} />);
  expect(screen.getAllByRole('tab')).toHaveLength(4);
  expect(screen.getByRole('tab', { name: 'Lists' })).toBeSelected();
  await fireEvent.press(screen.getByRole('tab', { name: 'Tasks, 3' }));
  expect(mockNavigate).toHaveBeenCalledWith('/tasks');
});
