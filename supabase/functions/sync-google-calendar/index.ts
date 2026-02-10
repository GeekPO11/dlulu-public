// =============================================================================
// SYNC GOOGLE CALENDAR - Edge Function (Scaffold)
//
// NOTE:
// This function is intentionally a scaffold. The repo currently has:
// - A Google-compatible `CalendarEvent` model
// - A `calendar_events` table with `external_event_id`, `source`, and `sync_status`
//
// What is NOT implemented yet:
// - Secure server-side access to Google OAuth refresh tokens with Calendar scopes
// - Pull/import: Google -> Supabase upserts
// - Push/export: Supabase -> Google creates/updates/deletes
// - Conflict resolution rules
//
// Before implementing, confirm product decisions:
// - One-way import vs bidirectional sync
// - Primary calendar only vs selectable calendars
// - How conflicts are resolved
// =============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getCorsHeaders } from '../_shared/cors.ts';
import { verifyAuth } from '../_shared/auth.ts';
import { logInfo, logError, Errors, getRequestId } from '../_shared/logger.ts';

const FUNCTION_NAME = 'sync-google-calendar';

serve(async (req) => {
  const requestOrigin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(requestOrigin);
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const requestId = getRequestId(req);
  const responseHeaders = {
    ...corsHeaders,
    'Content-Type': 'application/json',
    ...(requestId ? { 'x-request-id': requestId } : {}),
  };

  try {
    const { user, error: authError } = await verifyAuth(req);
    if (authError || !user) {
      logError(FUNCTION_NAME, 'UNAUTHORIZED', authError || 'Unauthorized', { requestId });
      return Errors.unauthorized(undefined, { requestId });
    }

    logInfo(FUNCTION_NAME, 'Sync not implemented', { requestId, userId: user.id });
    return new Response(
      JSON.stringify({
        success: false,
        error: {
          code: 'NOT_IMPLEMENTED',
          message: 'Google Calendar sync is not implemented yet in this repo.',
          nextSteps: [
            'Decide sync direction (import-only vs bidirectional).',
            'Implement secure token storage/refresh for Google Calendar scopes.',
            'Implement pull/import and push/export paths and conflict rules.',
          ],
        },
      }),
      { status: 501, headers: responseHeaders }
    );
  } catch (error: any) {
    logError(FUNCTION_NAME, 'INTERNAL_ERROR', error.message || 'Sync failed', { requestId, stack: error.stack });
    return new Response(
      JSON.stringify({ success: false, error: { code: 'ERROR', message: error.message } }),
      { status: 500, headers: responseHeaders }
    );
  }
});
