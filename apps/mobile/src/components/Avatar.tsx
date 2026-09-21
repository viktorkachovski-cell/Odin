import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { avatarLightness, avatarSaturation, lightColors } from '@odin/design-tokens';
import { avatarHue, initialsOf } from '@odin/domain';

/**
 * Initials on a deterministic hue. The avatar is decorative and hidden from
 * TalkBack: the member's name always appears next to it, so neither colour nor
 * the avatar alone ever carries meaning.
 */
export function Avatar({
  userId,
  displayName,
  size = 32,
}: {
  readonly userId: string;
  readonly displayName: string;
  readonly size?: number;
}): ReactNode {
  const hue = avatarHue(userId);
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.avatar,
        {
          backgroundColor: `hsl(${String(hue)} ${String(avatarSaturation)}% ${String(avatarLightness)}%)`,
          borderRadius: size / 2,
          height: size,
          width: size,
        },
      ]}
    >
      <Text style={[styles.initials, { fontSize: size * 0.4 }]}>{initialsOf(displayName)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: { alignItems: 'center', justifyContent: 'center' },
  // Saturation and lightness are fixed by the tokens, so the darkest hue the
  // generator can produce still clears 4.5:1 against these initials (7.75:1).
  initials: { color: lightColors.avatarText, fontWeight: '700' },
});
