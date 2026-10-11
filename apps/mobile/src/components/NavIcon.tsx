import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

/**
 * Navigation icons drawn from plain views, so they look the same on every
 * Android build without an icon font or a new native dependency. The text
 * glyphs they replace (☰ ? ☺ ✓ ⚙) came from whatever font the device had.
 * Always decorative: each tab carries its own text label.
 */

export type NavIconName = 'today' | 'tasks' | 'lists' | 'settings';

function Today({ color }: { readonly color: string }): ReactNode {
  return (
    <View style={[styles.calendar, { borderColor: color }]}>
      <View style={[styles.calendarBar, { backgroundColor: color }]} />
    </View>
  );
}

function Tasks({ color }: { readonly color: string }): ReactNode {
  return (
    <View style={styles.stack}>
      {[0, 1, 2].map((row) => (
        <View key={row} style={styles.taskLine}>
          <View style={[styles.dot, { backgroundColor: color }]} />
          <View style={[styles.bar, { backgroundColor: color }]} />
        </View>
      ))}
    </View>
  );
}

function Lists({ color }: { readonly color: string }): ReactNode {
  return (
    <View style={styles.layers}>
      <View style={[styles.layer, { borderColor: color, top: 0 }]} />
      <View style={[styles.layer, { borderColor: color, top: 5 }]} />
      <View style={[styles.layer, { borderColor: color, top: 10 }]} />
    </View>
  );
}

function Settings({ color }: { readonly color: string }): ReactNode {
  return (
    <View style={styles.stack}>
      <View style={styles.slider}>
        <View style={[styles.track, { backgroundColor: color }]} />
        <View style={[styles.knob, { borderColor: color, left: 10 }]} />
      </View>
      <View style={styles.slider}>
        <View style={[styles.track, { backgroundColor: color }]} />
        <View style={[styles.knob, { borderColor: color, left: 3 }]} />
      </View>
    </View>
  );
}

export function NavIcon({
  name,
  color,
}: {
  readonly name: NavIconName;
  readonly color: string;
}): ReactNode {
  const Icon = { today: Today, tasks: Tasks, lists: Lists, settings: Settings }[name];
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.frame}
    >
      <Icon color={color} />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { borderRadius: 1, height: 2, width: 11 },
  calendar: { borderRadius: 3, borderWidth: 1.75, height: 16, overflow: 'hidden', width: 17 },
  calendarBar: { height: 4, width: '100%' },
  dot: { borderRadius: 1.5, height: 3, width: 3 },
  frame: { alignItems: 'center', height: 20, justifyContent: 'center', width: 24 },
  knob: {
    backgroundColor: 'transparent',
    borderRadius: 3.5,
    borderWidth: 1.75,
    height: 7,
    position: 'absolute',
    top: -2.5,
    width: 7,
  },
  layer: {
    borderRadius: 2,
    borderWidth: 1.75,
    height: 7,
    left: 0,
    position: 'absolute',
    transform: [{ scaleX: 1 }],
    width: 16,
  },
  layers: { height: 18, width: 16 },
  slider: { height: 3, justifyContent: 'center', width: 17 },
  stack: { gap: 4 },
  taskLine: { alignItems: 'center', flexDirection: 'row', gap: 3 },
  track: { borderRadius: 1, height: 1.75, width: 17 },
});
