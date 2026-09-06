import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { useAuth } from '@/hooks/useAuth';
import {
  useAppUpdates,
  useAppUpdateComments,
  useAppUpdateRequests,
  type AppUpdate,
} from '@/hooks/useAppUpdates';
import { CachedImage } from '@/components/CachedImage';
import { ICONS } from '@/lib/helperUtils';
import { Ionicons } from '@expo/vector-icons';

// ─── Update card ─────────────────────────────────────────────────────────────

function UpdateCard({ update }: { update: AppUpdate }) {
  const { user } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { comments, loading: commentsLoading, addComment } = useAppUpdateComments(
    expanded ? update.id : ''
  );

  const handleAddComment = async () => {
    if (!commentText.trim()) return;
    setSubmitting(true);
    const ok = await addComment(commentText);
    if (ok) setCommentText('');
    setSubmitting(false);
  };

  const lines = update.body.split('\n').filter(Boolean);

  return (
    <View style={styles.updateCard}>
      <View style={styles.updateCardAccent} />
      <View style={styles.updateHeader}>
        <View style={styles.updateHeaderLeft}>
          <Text style={styles.updateSenderEmoji}>🎉</Text>
          <Text style={styles.updateSender}>Active Portland</Text>
          {update.version ? (
            <View style={styles.versionBadge}>
              <Text style={styles.versionText}>{update.version}</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.updateDate}>
          {new Date(update.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </Text>
      </View>

      <Text style={styles.updateTitle}>{update.title}</Text>

      <View style={styles.updateBody}>
        {lines.map((line, i) => {
          // Lines like "• Feature name — description" get the feature name in orange bold
          const bulletMatch = line.match(/^([•\-\*])\s*(.+?)\s*[—–-]\s*(.+)$/);
          if (bulletMatch) {
            const [, bullet, featureName, description] = bulletMatch;
            return (
              <View key={i} style={styles.updateLineRow}>
                <Text style={styles.updateBullet}>{bullet}</Text>
                <Text style={styles.updateLine}>
                  <Text style={styles.updateFeatureName}>{featureName}</Text>
                  <Text style={styles.updateLineSep}> — </Text>
                  <Text>{description}</Text>
                </Text>
              </View>
            );
          }
          return (
            <Text key={i} style={styles.updateLine}>{line}</Text>
          );
        })}
      </View>

      <TouchableOpacity
        style={styles.commentsToggle}
        onPress={() => setExpanded(e => !e)}
        activeOpacity={0.7}
      >
        <Ionicons
          name={expanded ? 'chatbubble' : 'chatbubble-outline'}
          size={14}
          color="#888"
        />
        <Text style={styles.commentsToggleText}>
          {update.comment_count > 0
            ? `${update.comment_count} comment${update.comment_count !== 1 ? 's' : ''}`
            : 'Add a comment'}
        </Text>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={12}
          color="#aaa"
          style={{ marginLeft: 2 }}
        />
      </TouchableOpacity>

      {expanded && (
        <View style={styles.commentsSection}>
          {commentsLoading ? (
            <ActivityIndicator size="small" color="#ccc" style={{ marginVertical: 8 }} />
          ) : (
            comments.map(c => {
              const profile = Array.isArray(c.profiles) ? c.profiles[0] : c.profiles;
              return (
                <View key={c.id} style={styles.commentRow}>
                  <CachedImage
                    source={profile?.avatar_url ? { uri: profile.avatar_url } : ICONS.profileIcon}
                    style={styles.commentAvatar}
                  />
                  <View style={styles.commentContent}>
                    <Text style={styles.commentAuthor}>
                      {profile?.name ?? 'User'}
                      <Text style={styles.commentTime}>
                        {'  '}{new Date(c.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </Text>
                    </Text>
                    <Text style={styles.commentText}>{c.message}</Text>
                  </View>
                </View>
              );
            })
          )}
          {user && (
            <View style={styles.commentInputRow}>
              <TextInput
                style={styles.commentInput}
                value={commentText}
                onChangeText={setCommentText}
                placeholder="Add a comment…"
                placeholderTextColor="#aaa"
                maxLength={500}
                multiline
              />
              <TouchableOpacity
                style={[styles.commentSendBtn, (!commentText.trim() || submitting) && { opacity: 0.4 }]}
                onPress={handleAddComment}
                disabled={!commentText.trim() || submitting}
              >
                <Ionicons name="send" size={16} color="#fff" />
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

// ─── Requests section ────────────────────────────────────────────────────────

function RequestsSection() {
  const { user } = useAuth();
  const { requests, loading, addRequest, toggleVote } = useAppUpdateRequests();
  const [adding, setAdding] = useState(false);
  const [requestText, setRequestText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!requestText.trim()) return;
    if (!user) { Alert.alert('Sign in required', 'Please sign in to submit a request.'); return; }
    setSubmitting(true);
    await addRequest(requestText);
    setRequestText('');
    setAdding(false);
    setSubmitting(false);
  };

  return (
    <View style={styles.requestsSection}>
      <View style={styles.requestsHeader}>
        <View>
          <Text style={styles.requestsTitle}>Have a feature request?</Text>
          <Text style={styles.requestsSubtitle}>Vote on what gets built next.</Text>
        </View>
        {user && (
          <TouchableOpacity
            style={styles.addRequestBtn}
            onPress={() => setAdding(a => !a)}
          >
            <Ionicons name={adding ? 'close' : 'add'} size={18} color="#3a7bd5" />
          </TouchableOpacity>
        )}
      </View>

      {adding && (
        <View style={styles.newRequestRow}>
          <TextInput
            autoFocus
            style={styles.requestInput}
            value={requestText}
            onChangeText={setRequestText}
            placeholder="Describe your idea briefly…"
            placeholderTextColor="#aaa"
            maxLength={200}
            multiline
          />
          <TouchableOpacity
            style={[styles.submitRequestBtn, (!requestText.trim() || submitting) && { opacity: 0.5 }]}
            onPress={handleSubmit}
            disabled={!requestText.trim() || submitting}
          >
            <Text style={styles.submitRequestText}>Submit</Text>
          </TouchableOpacity>
        </View>
      )}

      {loading && requests.length === 0 ? (
        <ActivityIndicator size="small" color="#ccc" style={{ marginTop: 12 }} />
      ) : requests.length === 0 ? (
        <Text style={styles.emptyRequests}>No requests yet — be the first!</Text>
      ) : (
        requests.map(req => (
          <View key={req.id} style={styles.requestRow}>
            <TouchableOpacity
              style={[styles.voteBtn, req.user_voted && styles.voteBtnActive]}
              onPress={() => user ? toggleVote(req.id) : Alert.alert('Sign in required', 'Please sign in to vote.')}
              activeOpacity={0.7}
            >
              <Ionicons
                name="chevron-up"
                size={12}
                color={req.user_voted ? '#3a7bd5' : '#888'}
              />
              <Text style={[styles.voteCount, req.user_voted && styles.voteCountActive]}>
                {req.vote_count}
              </Text>
            </TouchableOpacity>
            <Text style={styles.requestText}>{req.text}</Text>
          </View>
        ))
      )}
    </View>
  );
}

// ─── Main tab ─────────────────────────────────────────────────────────────────

export function UpdatesTab() {
  const { updates, loading, refetch } = useAppUpdates();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {loading && updates.length === 0 ? (
        <ActivityIndicator size="small" color="#ccc" style={{ marginTop: 40 }} />
      ) : updates.length === 0 ? (
        <Text style={styles.emptyText}>No updates yet.</Text>
      ) : (
        updates.map(u => <UpdateCard key={u.id} update={u} />)
      )}

      <RequestsSection />
    </ScrollView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f7f7f7' },
  content: { padding: 12, paddingBottom: 40 },
  emptyText: { textAlign: 'center', color: '#aaa', marginTop: 40, fontSize: 15 },

  // Update card
  updateCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    marginBottom: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#ececec',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 2,
  },
  updateCardAccent: {
    height: 4,
    backgroundColor: '#FF8C42',
  },
  updateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
    paddingHorizontal: 14,
    paddingTop: 12,
  },
  updateHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  updateSenderEmoji: { fontSize: 16 },
  updateSender: { fontSize: 14, fontWeight: '700', color: '#222' },
  versionBadge: {
    backgroundColor: '#fff3e8',
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: '#ffd4a8',
  },
  versionText: { fontSize: 11, color: '#FF8C42', fontWeight: '700' },
  updateDate: { fontSize: 12, color: '#aaa' },
  updateTitle: { fontSize: 17, fontWeight: '800', color: '#111', marginBottom: 10, paddingHorizontal: 14 },
  updateBody: { gap: 6, marginBottom: 12, paddingHorizontal: 14 },
  updateLineRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 5 },
  updateBullet: { fontSize: 13, color: '#FF8C42', fontWeight: '700', lineHeight: 20, marginTop: 1 },
  updateFeatureName: { fontSize: 13, color: '#FF8C42', fontWeight: '700' },
  updateLineSep: { fontSize: 13, color: '#bbb' },
  updateLine: { fontSize: 13, color: '#555', lineHeight: 20, flex: 1 },

  // Comments toggle
  commentsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingTop: 8,
    paddingBottom: 10,
    paddingHorizontal: 14,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  commentsToggleText: { fontSize: 13, color: '#888', flex: 1 },

  // Comments section
  commentsSection: { marginTop: 4, gap: 10, paddingHorizontal: 14, paddingBottom: 12 },
  commentRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  commentAvatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#eee' },
  commentContent: { flex: 1 },
  commentAuthor: { fontSize: 12, fontWeight: '600', color: '#333', marginBottom: 2 },
  commentTime: { fontSize: 11, color: '#aaa', fontWeight: '400' },
  commentText: { fontSize: 13, color: '#444', lineHeight: 18 },
  commentInputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 4 },
  commentInput: {
    flex: 1, borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 7, fontSize: 13,
    color: '#333', backgroundColor: '#fafafa', maxHeight: 80,
  },
  commentSendBtn: {
    backgroundColor: '#3a7bd5', borderRadius: 8,
    width: 34, height: 34, alignItems: 'center', justifyContent: 'center',
  },

  // Requests section
  requestsSection: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#ececec',
    marginTop: 4,
  },
  requestsHeader: {
    flexDirection: 'row', alignItems: 'flex-start',
    justifyContent: 'space-between', marginBottom: 4,
  },
  requestsTitle: { fontSize: 15, fontWeight: '700', color: '#111', marginBottom: 2 },
  requestsSubtitle: { fontSize: 12, color: '#aaa' },
  addRequestBtn: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: '#eef3ff',
    alignItems: 'center', justifyContent: 'center',
  },
  newRequestRow: { marginTop: 10, gap: 8 },
  requestInput: {
    borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 8, fontSize: 13,
    color: '#333', backgroundColor: '#fafafa', maxHeight: 80,
  },
  submitRequestBtn: {
    backgroundColor: '#3a7bd5', borderRadius: 8,
    paddingVertical: 8, paddingHorizontal: 16, alignSelf: 'flex-end',
  },
  submitRequestText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  emptyRequests: { color: '#aaa', fontSize: 13, marginTop: 10 },
  requestRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 9,
    borderBottomWidth: 1, borderBottomColor: '#f4f4f4',
  },
  voteBtn: {
    alignItems: 'center', paddingHorizontal: 8, paddingVertical: 5,
    borderRadius: 8, borderWidth: 1, borderColor: '#e0e0e0',
    backgroundColor: '#fafafa', minWidth: 36,
  },
  voteBtnActive: { borderColor: '#3a7bd5', backgroundColor: '#eef3ff' },
  voteCount: { fontSize: 12, fontWeight: '700', color: '#666', marginTop: 1 },
  voteCountActive: { color: '#3a7bd5' },
  requestText: { flex: 1, fontSize: 13, color: '#333', lineHeight: 18 },
});
