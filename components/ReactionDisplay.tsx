import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import type { ReactionSummary } from '@/hooks/useMessageReactions';

interface ReactionDisplayProps {
  reactions: ReactionSummary[];
  currentUserEmoji: string | null;
  /** When true, no top margin (e.g. for chat bubble corner) */
  compact?: boolean;
  /** Optional: tap to open a \"who reacted\" list */
  onPressReactions?: () => void;
}

export function ReactionDisplay({
  reactions,
  currentUserEmoji,
  compact = false,
  onPressReactions,
}: ReactionDisplayProps) {
  if (!reactions || reactions.length === 0) return null;

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPressReactions}
      disabled={!onPressReactions}
    >
      <View style={[styles.container, compact && styles.containerCompact]}>
        {reactions.map((r, index) => {
          const overlap = index > 0;
          return (
            <View
              key={r.emoji}
              style={[styles.pill, overlap && styles.pillOverlap]}
            >
              <View style={styles.pillInner}>
                <Text style={styles.emoji}>{r.emoji}</Text>
                {r.count > 1 && (
                  <Text style={styles.count}>{r.count}</Text>
                )}
              </View>
            </View>
          );
        })}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    // No explicit gap; spacing comes only from pill padding
    gap: 0,
    marginTop: 6,
  },
  containerCompact: {
    marginTop: 0,
  },
  pill: {
    minHeight: 24,
    justifyContent: 'center',
  },
  pillOverlap: {
    marginLeft: -10,
  },
  pillInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 1,
    paddingHorizontal: 4,
  },
  emoji: {
    fontSize: 18,
  },
  count: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    color: '#666',
    marginLeft: 2,
  },
});
