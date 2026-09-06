import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { supabase } from '@/lib/supabase';
import type { PlanGroupChatPoll, PlanGroupChatPollOption } from '@/lib/planGroupChatPolls';
import { clearPlanGroupChatPollVote, votePlanGroupChatPoll } from '@/lib/planGroupChatPolls';

interface PlanGroupChatPollCardProps {
  poll: PlanGroupChatPoll;
  currentUserId?: string;
  onVoted?: () => void;
}

export function PlanGroupChatPollCard({ poll, currentUserId, onVoted }: PlanGroupChatPollCardProps) {
  const options = useMemo(() => {
    const o = poll.plan_group_chat_poll_options ?? [];
    return [...o].sort((a, b) => a.sort_order - b.sort_order);
  }, [poll.plan_group_chat_poll_options]);

  const totalVotes = useMemo(
    () => options.reduce((s, o) => s + (o.vote_count ?? 0), 0),
    [options]
  );

  const [myOptionId, setMyOptionId] = useState<string | null>(null);
  const [voting, setVoting] = useState<string | null>(null);

  const loadMyVote = useCallback(async () => {
    if (!currentUserId || !poll.id) return;
    const { data, error } = await supabase
      .from('plan_group_chat_poll_votes')
      .select('option_id')
      .eq('poll_id', poll.id)
      .eq('user_id', currentUserId)
      .maybeSingle();
    if (error) return;
    setMyOptionId(data?.option_id ?? null);
  }, [currentUserId, poll.id]);

  useEffect(() => {
    void loadMyVote();
  }, [loadMyVote]);

  const onTapOption = async (option: PlanGroupChatPollOption) => {
    if (!currentUserId) {
      Alert.alert('Sign in', 'Sign in to vote.');
      return;
    }
    setVoting(option.id);
    if (myOptionId === option.id) {
      const { error } = await clearPlanGroupChatPollVote(poll.id);
      if (error) Alert.alert('Vote', error.message);
      else {
        setMyOptionId(null);
        onVoted?.();
      }
    } else {
      const { error } = await votePlanGroupChatPoll(poll.id, option.id);
      if (error) Alert.alert('Vote', error.message);
      else {
        setMyOptionId(option.id);
        onVoted?.();
      }
    }
    setVoting(null);
  };

  const maxCount = Math.max(...options.map((o) => o.vote_count ?? 0), 1);

  return (
    <View style={styles.wrap}>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>Poll</Text>
      </View>
      <Text style={styles.question} numberOfLines={3}>
        {poll.question}
      </Text>
      <Text style={styles.hint}>Tap an option · tap again to remove your vote</Text>
      {options.map((opt) => {
        const count = opt.vote_count ?? 0;
        const pct = totalVotes > 0 ? count / totalVotes : 0;
        const barPct = maxCount > 0 ? count / maxCount : 0;
        const selected = myOptionId === opt.id;
        const busy = voting === opt.id;
        return (
          <TouchableOpacity
            key={opt.id}
            style={[styles.optionRow, selected && styles.optionRowSelected]}
            onPress={() => void onTapOption(opt)}
            disabled={!!voting}
            activeOpacity={0.85}
          >
            <View style={styles.barBg}>
              <View style={[styles.barFill, { width: `${barPct * 100}%` }]} />
            </View>
            <View style={styles.optionContent}>
              {busy ? <ActivityIndicator size="small" color="#FF8C42" style={styles.optionLoader} /> : null}
              <Text style={styles.optionText} numberOfLines={2}>
                {opt.option_text}
              </Text>
              <Text style={styles.optionCount}>
                {count}
                {totalVotes > 0 ? ` · ${Math.round(pct * 100)}%` : ''}
              </Text>
            </View>
          </TouchableOpacity>
        );
      })}
      <Text style={styles.totalVotes}>
        {totalVotes === 1 ? '1 vote' : `${totalVotes} votes`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 2,
    padding: 8,
    backgroundColor: '#fffaf3',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ffe0c2',
    maxWidth: '100%',
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: '#FF8C42',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    marginBottom: 4,
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontFamily: 'Inter_700Bold',
  },
  question: {
    fontSize: 14,
    lineHeight: 19,
    fontFamily: 'Inter_600SemiBold',
    color: '#333',
    marginBottom: 4,
  },
  hint: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    color: '#888',
    marginBottom: 6,
  },
  optionRow: {
    borderRadius: 8,
    marginBottom: 4,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#eee',
    backgroundColor: '#fff',
  },
  optionRowSelected: {
    borderColor: '#FF8C42',
    backgroundColor: '#fff8f0',
  },
  barBg: { height: 2, backgroundColor: '#f0f0f0' },
  barFill: {
    height: 2,
    backgroundColor: '#FFCF56',
  },
  optionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 6,
  },
  optionLoader: { marginRight: 2 },
  optionText: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    color: '#333',
  },
  optionCount: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    color: '#666',
  },
  totalVotes: {
    fontSize: 11,
    fontFamily: 'Inter_500Medium',
    color: '#999',
    marginTop: 2,
  },
});
