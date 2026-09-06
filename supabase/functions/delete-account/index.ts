import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid session' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const uid = user.id;

    // Best-effort storage cleanup (avatars folder per user).
    try {
      const { data: files } = await admin.storage.from('avatars').list(uid);
      if (files?.length) {
        const paths = files.map((f) => `${uid}/${f.name}`);
        await admin.storage.from('avatars').remove(paths);
      }
    } catch (e) {
      console.warn('Avatar storage cleanup skipped:', e);
    }

    // Direct chats (may not cascade from profiles).
    await admin.from('chats').delete().or(`participant_1.eq.${uid},participant_2.eq.${uid}`);

    // Public profile row — cascades to most user-owned rows via FK.
    const { error: profileError } = await admin.from('profiles').delete().eq('id', uid);
    if (profileError) {
      console.error('Profile delete error:', profileError);
      return new Response(JSON.stringify({ error: 'Could not delete profile data' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { error: authDeleteError } = await admin.auth.admin.deleteUser(uid);
    if (authDeleteError) {
      console.error('Auth delete error:', authDeleteError);
      return new Response(JSON.stringify({ error: 'Could not delete auth account' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('delete-account error:', e);
    return new Response(JSON.stringify({ error: 'Unexpected error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
