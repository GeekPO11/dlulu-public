import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { verifyAuth } from '../_shared/auth.ts';
import { getCorsHeaders } from '../_shared/cors.ts';

const isEnabled = () => Deno.env.get('DEBUG_STATE_ENABLED') === 'true';

const isAllowlisted = (userId: string) => {
  const raw = Deno.env.get('DEBUG_STATE_ALLOWED_USERS') || '';
  const allowed = raw
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);

  // If no allowlist is configured, default deny.
  if (allowed.length === 0) return false;
  return allowed.includes(userId);
};

serve(async (req) => {
  const requestOrigin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(requestOrigin);
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (!isEnabled()) {
    return new Response(
      JSON.stringify({ success: false, error: 'Not found' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const { user, error: authError, supabase } = await verifyAuth(req);
  if (authError || !user || !supabase) {
    return new Response(
      JSON.stringify({ success: false, error: 'Unauthorized' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  if (!isAllowlisted(user.id)) {
    return new Response(
      JSON.stringify({ success: false, error: 'Forbidden' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const { data: subscriptions, error: subscriptionError } = await supabase
    .from('subscriptions')
    .select('id, plan_id, status, current_period_end, created_at, updated_at')
    .eq('user_id', user.id)
    .order('current_period_end', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(5);

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, email, name, role, bio, chronotype, energy_level, work_style, onboarding_completed, onboarding_step, created_at, updated_at')
    .eq('id', user.id)
    .maybeSingle();

  return new Response(
    JSON.stringify({
      success: true,
      user_id: user.id,
      profile,
      subscriptions,
      errors: {
        profile: profileError?.message || null,
        subscriptions: subscriptionError?.message || null,
      },
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
});
