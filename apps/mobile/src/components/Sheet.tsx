import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useTheme } from '../theme.ts';

/**
 * An editor sheet. It is dismissible with the Android back button (Modal's
 * `onRequestClose`) without committing partial data, and it avoids the
 * keyboard so the submit action stays reachable while typing.
 */
export function Sheet({
  title,
  children,
  footer,
  onClose,
}: {
  readonly title: string;
  readonly children: ReactNode;
  readonly footer: ReactNode;
  readonly onClose: () => void;
}): ReactNode {
  const theme = useTheme();

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.backdrop}
      >
        <View
          style={[
            styles.sheet,
            { backgroundColor: theme.colors.background, borderColor: theme.colors.border },
          ]}
        >
          <Text accessibilityRole="header" style={[styles.title, { color: theme.colors.text }]}>
            {title}
          </Text>
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
          <View style={styles.footer}>{footer}</View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(0,0,0,0.45)', flex: 1, justifyContent: 'flex-end' },
  body: { gap: 16, paddingBottom: 8 },
  footer: { flexDirection: 'row', gap: 12, justifyContent: 'flex-end', paddingTop: 12 },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    maxHeight: '90%',
    padding: 16,
  },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 12 },
});
