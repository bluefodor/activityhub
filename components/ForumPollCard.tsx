import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Modal,
  ScrollView,
  Alert,
  TouchableWithoutFeedback,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
} from 'react-native';
import { supabase } from '@/lib/supabase';
import type { ForumPoll, ForumPollOption } from '@/types/database';
import { deleteForumPollVote, fetchForumPollVoters, insertForumPollVote, showPollMemberActions, type ForumPollVoterRow } from '@/lib/forumPolls';

export function normalizeForumPoll(
  raw: ForumPoll | ForumPoll[] | null | undefined
): ForumPoll | null {
  if (!raw) return null;
  return Array.isArray(raw) ? raw[0] ?? null : raw;
}

interface ForumPollCardProps {
  poll: ForumPoll;
  currentUserId?: string;
  onVoted?: () => void;
}

function voterName(v: ForumPollVoterRow): string {
  const p = v.profiles as { name?: string } | { name?: string }[] | null | undefined;
  if (Array.isArray(p)) return p[0]?.name || 'Member';
  return p?.name || 'Member';
}

/** Scroll area height inside the voters modal (card max 80% minus title + close). */
const VOTERS_MODAL_SCROLL_MAX = Math.max(200, Dimensions.get('window').height * 0.8 - 130);

export function ForumPollCard({ poll, currentUserId, onVoted }: ForumPollCardProps) {
  const options = useMemo(() => {
    const o = poll.forum_poll_options ?? [];
    return [...o].sort((a, b) => a.sort_order - b.sort_order);
  }, [poll.forum_poll_options]);

  const totalVotes = useMemo(
    () => options.reduce((s, o) => s + (o.vote_count ?? 0), 0),
    [options]
  );

  const [myOptionIds, setMyOptionIds] = useState<Set<string>>(new Set());
  const [voting, setVoting] = useState<string | null>(null);
  const [votersOpen, setVotersOpen] = useState(false);
  const [votersLoading, setVotersLoading] = useState(false);
  const [votersByOption, setVotersByOption] = useState<Record<string, ForumPollVoterRow[]>>({});

  const loadMyVotes = useCallback(async () => {
    if (!currentUserId || !poll.id) return;
    const { data, error } = await supabase
      .from('forum_poll_votes')
      .select('option_id')
      .eq('poll_id', poll.id)
      .eq('user_id', currentUserId);
    if (error) return;
    setMyOptionIds(new Set((data || []).map((r: { option_id: string }) => r.option_id)));
  }, [currentUserId, poll.id]);

  useEffect(() => {
    void loadMyVotes();
  }, [loadMyVotes]);

  const openVoters = async () => {
    if (!currentUserId) {
      Alert.alert('Sign in', 'Sign in to see who voted for each option.');
      return;
    }
    setVotersOpen(true);
    setVotersLoading(true);
    const { rows, error } = await fetchForumPollVoters(poll.id);
    setVotersLoading(false);
    if (error) {
      Alert.alert('Could not load voters', error.message);
      return;
    }
    const map: Record<string, ForumPollVoterRow[]> = {};
    for (const r of rows) {
      if (!map[r.option_id]) map[r.option_id] = [];
      map[r.option_id].push(r);
    }
    setVotersByOption(map);
  };

  const onTapOption = async (option: ForumPollOption) => {
    if (!currentUserId) {
      Alert.alert('Sign in', 'Sign in to cast a vote.');
      return;
    }
    const has = myOptionIds.has(option.id);
    setVoting(option.id);
    if (has) {
      const { error } = await deleteForumPollVote(poll.id, option.id);
      if (error) Alert.alert('Vote', error.message);
      else {
        setMyOptionIds((prev) => {
          const n = new Set(prev);
          n.delete(option.id);
          return n;
        });
        onVoted?.();
      }
    } else {
      const { error } = await insertForumPollVote(poll.id, option.id);
      if (error) Alert.alert('Vote', error.message);
      else {
        setMyOptionIds((prev) => {
          const n = new Set(prev);
          if (!poll.allow_multiple_selection) n.clear();
          n.add(option.id);
          return n;
        });
        onVoted?.();
      }
    }
    setVoting(null);
  };

  const maxCount = Math.max(...options.map((o) => o.vote_count ?? 0), 1);
  const compactOptionsScroll = options.length > 4;

  const optionRows = options.map((opt) => {
    const count = opt.vote_count ?? 0;
    const pct = totalVotes > 0 ? count / totalVotes : 0;
    const barPct = maxCount > 0 ? count / maxCount : 0;
    const selected = myOptionIds.has(opt.id);
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
          <Text style={styles.optionText} numberOfLines={2} ellipsizeMode="tail">
            {opt.option_text}
          </Text>
          <Text style={styles.optionCount}>
            {count}
            {totalVotes > 0 ? ` · ${Math.round(pct * 100)}%` : ''}
          </Text>
        </View>
      </TouchableOpacity>
    );
  });

  return (
    <View style={styles.wrap}>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>Poll</Text>
      </View>
      <Text style={styles.question} numberOfLines={4} ellipsizeMode="tail">
        {poll.question}
      </Text>
      <Text style={styles.hint} numberOfLines={1}>
        {poll.allow_multiple_selection ? 'Pick one or more' : 'One choice each'}
      </Text>
      {compactOptionsScroll ? (
        <ScrollView
          style={styles.optionsScroll}
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={options.length > 5}
        >
          {optionRows}
        </ScrollView>
      ) : (
        optionRows
      )}
      <TouchableOpacity style={styles.votersBtn} onPress={() => void openVoters()}>
        <Text style={styles.votersBtnText}>
          {currentUserId ? 'Who voted' : 'Sign in to see who voted'}
        </Text>
      </TouchableOpacity>

      <Modal visible={votersOpen} transparent animationType="fade" onRequestClose={() => setVotersOpen(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalRoot}
        >
          <TouchableWithoutFeedback onPress={() => setVotersOpen(false)}>
            <View style={styles.modalOverlay}>
              <TouchableWithoutFeedback>
                <View style={styles.modalCard}>
                  <Text style={styles.modalTitle}>Who voted</Text>
                  <Text style={styles.modalSubtitle}>Tap a name for profile or message</Text>
                  {votersLoading ? (
                    <ActivityIndicator color="#FF8C42" style={styles.modalSpinner} />
                  ) : (
                    <ScrollView
                      style={[styles.modalScroll, { maxHeight: VOTERS_MODAL_SCROLL_MAX }]}
                      contentContainerStyle={styles.modalScrollContent}
                      keyboardShouldPersistTaps="handled"
                      showsVerticalScrollIndicator
                    >
                      {options.map((opt) => (
                        <View key={opt.id} style={styles.voterGroup}>
                          <Text style={styles.voterOptLabel}>{opt.option_text}</Text>
                          {(votersByOption[opt.id] || []).length === 0 ? (
                            <Text style={styles.voterEmpty}>No votes yet</Text>
                          ) : (
                            (votersByOption[opt.id] || []).map((v) => (
                              <TouchableOpacity
                                key={`${v.user_id}-${opt.id}`}
                                onPress={() =>
                                  showPollMemberActions(v.user_id, voterName(v), currentUserId, !!currentUserId)
                                }
                                disabled={v.user_id === currentUserId}
                              >
                                <Text
                                  style={[
                                    styles.voterName,
                                    v.user_id !== currentUserId && styles.voterNameLink,
                                  ]}
                                >
                                  {voterName(v)}
                                </Text>
                              </TouchableOpacity>
                            ))
                          )}
                        </View>
                      ))}
                    </ScrollView>
                  )}
                  <TouchableOpacity style={styles.modalClose} onPress={() => setVotersOpen(false)}>
                    <Text style={styles.modalCloseText}>Close</Text>
                  </TouchableOpacity>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 4,
    padding: 8,
    backgroundColor: '#fffaf3',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ffe0c2',
    maxWidth: '100%',
  },
  optionsScroll: {
    maxHeight: 168,
    marginBottom: 2,
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
    letterSpacing: 0.3,
  },
  question: {
    fontSize: 14,
    lineHeight: 19,
    fontFamily: 'Inter_600SemiBold',
    color: '#333',
    marginBottom: 3,
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
  barBg: {
    height: 2,
    backgroundColor: '#f0f0f0',
  },
  barFill: {
    height: 2,
    backgroundColor: '#FFCF56',
    borderTopRightRadius: 2,
    borderBottomRightRadius: 2,
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
    lineHeight: 17,
    fontFamily: 'Inter_500Medium',
    color: '#333',
  },
  optionCount: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    color: '#666',
    flexShrink: 0,
  },
  votersBtn: {
    marginTop: 2,
    alignSelf: 'flex-start',
    paddingVertical: 4,
  },
  votersBtnText: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    color: '#FF8C42',
  },
  modalRoot: { flex: 1 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    maxHeight: '80%',
    overflow: 'hidden',
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
    color: '#333',
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: '#888',
    marginBottom: 12,
  },
  modalSpinner: { marginVertical: 24 },
  modalScroll: {
    flexGrow: 0,
    flexShrink: 1,
  },
  modalScrollContent: {
    paddingBottom: 16,
  },
  voterGroup: {
    marginBottom: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  voterOptLabel: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
    color: '#333',
    marginBottom: 6,
  },
  voterEmpty: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: '#999',
    fontStyle: 'italic',
  },
  voterName: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: '#444',
    marginBottom: 4,
  },
  voterNameLink: {
    color: '#FF8C42',
    fontFamily: 'Inter_600SemiBold',
  },
  modalClose: {
    marginTop: 12,
    alignSelf: 'center',
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  modalCloseText: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
    color: '#FF8C42',
  },
});
