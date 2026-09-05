import { StyleSheet, View } from 'react-native';
import { colors } from '../theme';

/**
 * Subtle print-grain overlay. Deliberately built from a sparse grid of
 * near-transparent dots rather than a bitmap: it ships no asset, costs nothing
 * to render, and stays crisp at any density. It should read as texture — if you
 * can consciously see it, turn the opacity down.
 */
export function Grain({ opacity = 0.035 }: { opacity?: number }) {
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity }]}>
      {Array.from({ length: 60 }).map((_, row) => (
        <View key={row} style={styles.row}>
          {Array.from({ length: 20 }).map((__, col) => (
            <View
              key={col}
              style={[styles.dot, { opacity: ((row * 7 + col * 13) % 5) / 4 }]}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flex: 1 },
  dot: { flex: 1, backgroundColor: colors.text },
});
