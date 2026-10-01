import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Colors from '@/constants/colors';

interface InkBadgeProps {
  inkColor: string;
  count?: number;
  size?: 'small' | 'medium';
}

function InkBadgeComponent({ inkColor, count, size = 'small' }: InkBadgeProps) {
  const color = Colors.ink[inkColor] ?? Colors.textSecondary;
  const isSmall = size === 'small';

  return (
    <View style={[styles.container, { backgroundColor: color + '20' }, isSmall ? styles.small : styles.medium]}>
      <View style={[styles.dot, { backgroundColor: color }, isSmall ? styles.dotSmall : styles.dotMedium]} />
      <Text style={[styles.text, { color }, isSmall ? styles.textSmall : styles.textMedium]}>
        {inkColor}
      </Text>
      {count !== undefined && (
        <Text style={[styles.count, { color }]}>{count}</Text>
      )}
    </View>
  );
}

export default React.memo(InkBadgeComponent);

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 8,
  },
  small: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  medium: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  dot: {
    borderRadius: 10,
  },
  dotSmall: {
    width: 7,
    height: 7,
  },
  dotMedium: {
    width: 9,
    height: 9,
  },
  text: {
    fontWeight: '600' as const,
  },
  textSmall: {
    fontSize: 11,
  },
  textMedium: {
    fontSize: 13,
  },
  count: {
    fontSize: 12,
    fontWeight: '700' as const,
    marginLeft: 2,
  },
});
