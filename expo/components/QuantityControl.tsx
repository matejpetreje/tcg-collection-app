import React, { useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Minus, Plus } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';

interface QuantityControlProps {
  label: string;
  value: number;
  onIncrement: () => void;
  onDecrement: () => void;
  color?: string;
  min?: number;
}

function QuantityControlComponent({ label, value, onIncrement, onDecrement, color = Colors.primary, min = 0 }: QuantityControlProps) {
  const handleIncrement = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onIncrement();
  }, [onIncrement]);

  const handleDecrement = useCallback(() => {
    if (value > min) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onDecrement();
    }
  }, [onDecrement, value, min]);

  return (
    <View style={styles.container} testID={`qty-control-${label}`}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.controls}>
        <TouchableOpacity
          onPress={handleDecrement}
          style={[styles.button, value <= min && styles.buttonDisabled]}
          disabled={value <= min}
          testID={`qty-dec-${label}`}
        >
          <Minus size={16} color={value <= min ? Colors.textMuted : Colors.text} />
        </TouchableOpacity>
        <View style={[styles.valueContainer, { borderColor: color }]}>
          <Text style={[styles.value, { color }]}>{value}</Text>
        </View>
        <TouchableOpacity
          onPress={handleIncrement}
          style={styles.button}
          testID={`qty-inc-${label}`}
        >
          <Plus size={16} color={Colors.text} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default React.memo(QuantityControlComponent);

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: 6,
  },
  label: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: '600' as const,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  button: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  valueContainer: {
    minWidth: 36,
    height: 32,
    borderRadius: 8,
    borderWidth: 1.5,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  value: {
    fontSize: 16,
    fontWeight: '700' as const,
  },
});
