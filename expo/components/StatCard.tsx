import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Colors from '@/constants/colors';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  color?: string;
  compact?: boolean;
}

function StatCardComponent({ title, value, icon, color = Colors.primary, compact = false }: StatCardProps) {
  if (compact) {
    return (
      <View style={styles.compactContainer} testID={`stat-${title}`}>
        <View style={[styles.compactIcon, { backgroundColor: color + '20' }]}>
          {icon}
        </View>
        <View style={styles.compactText}>
          <Text style={styles.compactValue} numberOfLines={1}>{value}</Text>
          <Text style={styles.compactTitle} numberOfLines={1}>{title}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container} testID={`stat-${title}`}>
      <View style={[styles.iconContainer, { backgroundColor: color + '20' }]}>
        {icon}
      </View>
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.title}>{title}</Text>
    </View>
  );
}

export default React.memo(StatCardComponent);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: {
    fontSize: 22,
    fontWeight: '800' as const,
    color: Colors.text,
  },
  title: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: '600' as const,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    textAlign: 'center' as const,
  },
  compactContainer: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  compactIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactText: {
    flex: 1,
  },
  compactValue: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  compactTitle: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: '500' as const,
  },
});
