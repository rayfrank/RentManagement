import Slider from '@react-native-community/slider';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from './ThemeProvider';

export function GlassControl({ compact = false }: { compact?: boolean }) {
  const { palette, transparency, setTransparency } = useTheme();
  const styles = useMemo(() => StyleSheet.create({
    shell: {
      flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 39,
      paddingHorizontal: compact ? 8 : 11, borderRadius: 999,
      backgroundColor: palette.surface, borderWidth: 1, borderColor: '#FFFFFFB8',
    },
    label: { color: palette.ink, fontSize: 8, fontWeight: '900' },
    value: { minWidth: 27, color: palette.muted, fontSize: 8, fontWeight: '800', textAlign: 'right' },
    slider: { width: compact ? 72 : 105, height: 30 },
  }), [compact, palette]);

  return (
    <View style={styles.shell} accessibilityLabel={`Glass transparency ${Math.round(transparency * 100)} percent`}>
      {!compact && <Text style={styles.label}>GLASS</Text>}
      <Slider
        style={styles.slider}
        minimumValue={0.35}
        maximumValue={0.95}
        step={0.05}
        value={transparency}
        onValueChange={setTransparency}
        minimumTrackTintColor={palette.brand}
        maximumTrackTintColor={`${palette.muted}55`}
        thumbTintColor={palette.brand}
      />
      <Text style={styles.value}>{Math.round(transparency * 100)}%</Text>
    </View>
  );
}
