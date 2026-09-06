import React, { useCallback, useEffect, useState } from 'react';
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
  TextInput,
} from 'react-native';
import { supabase } from '@/lib/supabase';
import type { ForumPoll } from '@/types/database';
import {
  deleteForumPollTextResponse,
  fetchForumPollTextResponses,
  showPollMemberActions,
  upsertForumPollTextResponse,
  type ForumPollTextResponseRow,
} from '@/lib/forumPolls';

const RESPONSES_MODAL_SCROLL_MAX = Math.max(200, Dimensions.get('window').height * 0.8 - 130);

function responderName(row: ForumPollTextResponseRow): string {
  const p = row.profiles as { name?: string } | { name?: string }[] | null | undefined;
  if (Array.isArray(p)) return p[0]?.name || 'Member';
  return p?.name || 'Member';
}

interface ForumOpenTextPollCardProps {
  poll: ForumPoll;
  currentUserId?: string;
  onResponded?: () => void;
}

export function ForumOpenTextPollCard({ poll, currentUserId, onResponded }: ForumOpenTextPollCardProps) {
  const [myResponse, setMyResponse] = useState('');
  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [answersOpen, setAnswersOpen] = useState(false);
  const [answersLoading, setAnswersLoading] = useState(false);
  const [responses, setResponses] = useState<ForumPollTextResponseRow[]>([]);

  const responseCount = poll.response_count ?? responses.length;

  const loadMyResponse = useCallback(async () => {
    if (!currentUserId || !poll.id) return;
    const { data, error } = await supabase
      .from('forum_poll_text_responses')
      .select('response_text')
      .eq('poll_id', poll.id)
      .eq('user_id', currentUserId)
      .maybeSingle();
    if (error) return;
    const text = data?.response_text ?? '';
    setMyResponse(text);
    setDraft(text);
  }, [currentUserId, poll.id]);

  useEffect(() => {
    void loadMyResponse();
  }, [loadMyResponse]);

  const openAnswers = async () => {
    if (!currentUserId) {
      Alert.alert('Sign in', 'Sign in to see everyone\'s answers.');
      return;
    }
    setAnswersOpen(true);
    setAnswersLoading(true);
    const { rows, error } = await fetchForumPollTextResponses(poll.id);
    setAnswersLoading(false);
    if (error) {
      Alert.alert('Could not load answers', error.message);
      return;
    }
    setResponses(rows);
  };

  const submitAnswer = async () => {
    if (!currentUserId) {
      Alert.alert('Sign in', 'Sign in to submit your answer.');
      return;
    }
    const text = draft.trim();
    if (!text) {
      Alert.alert('Answer', 'Write something first.');
      return;
    }
    setSubmitting(true);
    const { error } = await upsertForumPollTextResponse(poll.id, text);
    setSubmitting(false);
    if (error) {
      Alert.alert('Answer', error.message);
      return;
    }
    setMyResponse(text);
    onResponded?.();
  };

  const removeAnswer = async () => {
    if (!currentUserId || !myResponse) return;
    setSubmitting(true);
    const { error } = await deleteForumPollTextResponse(poll.id);
    setSubmitting(false);
    if (error) {
      Alert.alert('Answer', error.message);
      return;
    }
    setMyResponse('');
    setDraft('');
    onResponded?.();
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>Open poll</Text>
      </View>
      <Text style={styles.question} numberOfLines={4} ellipsizeMode="tail">
        {poll.question}
      </Text>
      <Text style={styles.hint}>Everyone writes their own answer</Text>

      {currentUserId ? (
        <View style={styles.answerBox}>
          <TextInput
            style={styles.answerInput}
            value={draft}
            onChangeText={setDraft}
            placeholder={myResponse ? 'Update your answer…' : 'Your answer…'}
            placeholderTextColor="#999"
            multiline
            maxLength={500}
            editable={!submitting}
          />
          <View style={styles.answerActions}>
            {myResponse ? (
              <TouchableOpacity
                style={styles.removeBtn}
                onPress={() => void removeAnswer()}
                disabled={submitting}
              >
                <Text style={styles.removeBtnText}>Remove</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              style={[styles.submitBtn, submitting && { opacity: 0.7 }]}
              onPress={() => void submitAnswer()}
              disabled={submitting || !draft.trim()}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.submitBtnText}>{myResponse ? 'Update' : 'Submit'}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <Text style={styles.signInHint}>Sign in to submit your answer</Text>
      )}

      <TouchableOpacity style={styles.answersBtn} onPress={() => void openAnswers()}>
        <Text style={styles.answersBtnText}>
          {currentUserId
            ? responseCount === 1
              ? 'View 1 answer'
              : `View ${responseCount} answers`
            : 'Sign in to view answers'}
        </Text>
      </TouchableOpacity>

      <Modal visible={answersOpen} transparent animationType="fade" onRequestClose={() => setAnswersOpen(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalRoot}
        >
          <TouchableWithoutFeedback onPress={() => setAnswersOpen(false)}>
            <View style={styles.modalOverlay}>
              <TouchableWithoutFeedback>
                <View style={styles.modalCard}>
                  <Text style={styles.modalTitle}>Answers</Text>
                  <Text style={styles.modalSubtitle}>Tap a name to message or view profile</Text>
                  {answersLoading ? (
                    <ActivityIndicator color="#FF8C42" style={styles.modalSpinner} />
                  ) : responses.length === 0 ? (
                    <Text style={styles.emptyAnswers}>No answers yet</Text>
                  ) : (
                    <ScrollView
                      style={[styles.modalScroll, { maxHeight: RESPONSES_MODAL_SCROLL_MAX }]}
                      contentContainerStyle={styles.modalScrollContent}
                      keyboardShouldPersistTaps="handled"
                      showsVerticalScrollIndicator
                    >
                      {responses.map((row) => {
                        const name = responderName(row);
                        return (
                          <View key={row.user_id} style={styles.responseRow}>
                            <TouchableOpacity
                              onPress={() =>
                                showPollMemberActions(row.user_id, name, currentUserId, !!currentUserId)
                              }
                              disabled={row.user_id === currentUserId}
                            >
                              <Text
                                style={[
                                  styles.responseName,
                                  row.user_id !== currentUserId && styles.responseNameLink,
                                ]}
                              >
                                {name}
                                {row.user_id === currentUserId ? ' (you)' : ''}
                              </Text>
                            </TouchableOpacity>
                            <Text style={styles.responseText}>{row.response_text}</Text>
                          </View>
                        );
                      })}
                    </ScrollView>
                  )}
                  <TouchableOpacity style={styles.modalClose} onPress={() => setAnswersOpen(false)}>
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
    marginBottom: 8,
  },
  signInHint: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    color: '#888',
    marginBottom: 8,
  },
  answerBox: {
    marginBottom: 8,
  },
  answerInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: '#333',
    minHeight: 64,
    textAlignVertical: 'top',
    backgroundColor: '#fff',
  },
  answerActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
  },
  removeBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  removeBtnText: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    color: '#c62828',
  },
  submitBtn: {
    backgroundColor: '#FF8C42',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    minWidth: 88,
    alignItems: 'center',
  },
  submitBtnText: {
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
    color: '#fff',
  },
  answersBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
  },
  answersBtnText: {
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
  emptyAnswers: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: '#999',
    fontStyle: 'italic',
    marginVertical: 16,
  },
  modalScroll: {
    flexGrow: 0,
    flexShrink: 1,
  },
  modalScrollContent: {
    paddingBottom: 16,
  },
  responseRow: {
    marginBottom: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  responseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  responseName: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
    color: '#333',
    flex: 1,
  },
  responseNameLink: {
    color: '#FF8C42',
  },
  responseText: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: 'Inter_400Regular',
    color: '#444',
    marginTop: 6,
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
