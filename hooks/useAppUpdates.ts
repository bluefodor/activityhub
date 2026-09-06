import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from './useAuth';

export interface AppUpdate {
  id: string;
  version: string | null;
  title: string;
  body: string;
  created_at: string;
  published_at: string | null;
  comment_count: number;
}

export interface AppUpdateComment {
  id: string;
  update_id: string;
  user_id: string;
  message: string;
  created_at: string;
  profiles: { name: string; avatar_url: string | null } | null;
}

export interface AppUpdateRequest {
  id: string;
  user_id: string;
  text: string;
  created_at: string;
  vote_count: number;
  user_voted: boolean;
}

export function useAppUpdates() {
  const { user } = useAuth();
  const [updates, setUpdates] = useState<AppUpdate[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchUpdates = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('app_updates')
        .select('id, version, title, body, created_at, published_at, app_update_comments(count)')
        .not('published_at', 'is', null)
        .lte('published_at', new Date().toISOString())
        .order('published_at', { ascending: false });
      if (error) { console.error('useAppUpdates fetch error:', error); return; }
      setUpdates(
        (data ?? []).map((row: any) => ({
          ...row,
          comment_count: row.app_update_comments?.[0]?.count ?? 0,
        }))
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUpdates(); }, [fetchUpdates]);

  return { updates, loading, refetch: fetchUpdates };
}

export function useAppUpdateComments(updateId: string) {
  const { user } = useAuth();
  const [comments, setComments] = useState<AppUpdateComment[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchComments = useCallback(async () => {
    if (!updateId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('app_update_comments')
        .select('id, update_id, user_id, message, created_at, profiles(name, avatar_url)')
        .eq('update_id', updateId)
        .order('created_at', { ascending: true });
      if (error) { console.error('useAppUpdateComments fetch error:', error); return; }
      setComments(data ?? []);
    } finally {
      setLoading(false);
    }
  }, [updateId]);

  useEffect(() => { fetchComments(); }, [fetchComments]);

  const addComment = useCallback(async (message: string): Promise<boolean> => {
    if (!user || !message.trim()) return false;
    const { error } = await supabase
      .from('app_update_comments')
      .insert({ update_id: updateId, user_id: user.id, message: message.trim() });
    if (error) { console.error('addComment error:', error); return false; }
    await fetchComments();
    return true;
  }, [user, updateId, fetchComments]);

  return { comments, loading, addComment, refetch: fetchComments };
}

export function useAppUpdateRequests() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<AppUpdateRequest[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: reqData, error: reqError }, { data: voteData }] = await Promise.all([
        supabase
          .from('app_update_requests')
          .select('id, user_id, text, created_at, app_update_request_votes(count)')
          .order('created_at', { ascending: false }),
        user
          ? supabase
              .from('app_update_request_votes')
              .select('request_id')
              .eq('user_id', user.id)
          : Promise.resolve({ data: [] }),
      ]);
      if (reqError) { console.error('useAppUpdateRequests fetch error:', reqError); return; }
      const votedIds = new Set((voteData ?? []).map((v: any) => v.request_id));
      const mapped: AppUpdateRequest[] = (reqData ?? []).map((row: any) => ({
        id: row.id,
        user_id: row.user_id,
        text: row.text,
        created_at: row.created_at,
        vote_count: row.app_update_request_votes?.[0]?.count ?? 0,
        user_voted: votedIds.has(row.id),
      }));
      mapped.sort((a, b) => b.vote_count - a.vote_count);
      setRequests(mapped);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  const addRequest = useCallback(async (text: string): Promise<boolean> => {
    if (!user || !text.trim()) return false;
    const { data, error } = await supabase
      .from('app_update_requests')
      .insert({ user_id: user.id, text: text.trim() })
      .select('id')
      .single();
    if (error || !data) { console.error('addRequest error:', error); return false; }
    // Auto-vote for own request
    await supabase
      .from('app_update_request_votes')
      .insert({ request_id: data.id, user_id: user.id });
    await fetchRequests();
    return true;
  }, [user, fetchRequests]);

  const toggleVote = useCallback(async (requestId: string): Promise<void> => {
    if (!user) return;
    const req = requests.find(r => r.id === requestId);
    if (!req) return;
    if (req.user_voted) {
      await supabase
        .from('app_update_request_votes')
        .delete()
        .eq('request_id', requestId)
        .eq('user_id', user.id);
    } else {
      await supabase
        .from('app_update_request_votes')
        .insert({ request_id: requestId, user_id: user.id });
    }
    await fetchRequests();
  }, [user, requests, fetchRequests]);

  return { requests, loading, addRequest, toggleVote, refetch: fetchRequests };
}
