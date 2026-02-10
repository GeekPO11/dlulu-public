// =============================================================================
// DELETE ACCOUNT - Edge Function
// Securely deletes a user's account using the service_role key
// GDPR Compliance: Hard delete of all user data via CASCADE
// =============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders } from '../_shared/cors.ts';
import { verifyAuth } from '../_shared/auth.ts';
import { logInfo, logError, Errors, createSuccessResponse, getRequestId } from '../_shared/logger.ts';

const FUNCTION_NAME = 'delete-account';

const USER_OWNED_TABLES = [
    'subscriptions',
    'user_entitlement_overrides',
    'user_usage_periods',
    'usage_events',
] as const;

serve(async (req) => {
    const requestOrigin = req.headers.get('origin');

    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: getCorsHeaders(requestOrigin) });
    }

    const requestId = getRequestId(req);
    const responseContext = { requestId, origin: requestOrigin || undefined };

    try {
        // Verify authentication - user can only delete their own account
        const { user, error: authError } = await verifyAuth(req);
        if (authError || !user) {
            logError(FUNCTION_NAME, 'UNAUTHORIZED', authError || 'No user found', { requestId });
            return Errors.unauthorized(undefined, responseContext);
        }

        const userId = user.id;
        logInfo(FUNCTION_NAME, 'Deleting user account', { requestId, userId });

        // Create admin client with service_role key
        // IMPORTANT: This key should NEVER be exposed to the client
        const supabaseAdmin = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
            {
                auth: {
                    autoRefreshToken: false,
                    persistSession: false,
                },
            }
        );

        // Proactively remove user-owned rows from billing/usage tables that may have
        // restrictive FKs in older schemas (missing ON DELETE CASCADE).
        for (const tableName of USER_OWNED_TABLES) {
            const { error: cleanupError } = await supabaseAdmin
                .from(tableName)
                .delete()
                .eq('user_id', userId);

            if (cleanupError) {
                logError(FUNCTION_NAME, 'INTERNAL_ERROR', `Failed to cleanup ${tableName}: ${cleanupError.message}`, {
                    requestId,
                    userId,
                    tableName,
                });
                return Errors.internalError(`Failed to cleanup user data in ${tableName}: ${cleanupError.message}`, responseContext);
            }
        }

        // Delete user from auth.users (hard delete).
        // Remaining public data linked via FK to auth.users should be removed by ON DELETE CASCADE.
        const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(
            userId,
            false // shouldSoftDelete = false for hard delete
        );

        if (deleteError) {
            logError(FUNCTION_NAME, 'INTERNAL_ERROR', deleteError.message, { requestId, userId });
            // Note: Data is already gone, but account might remain. 
            // We return error so client knows something went wrong.
            return Errors.internalError('Failed to delete auth account: ' + deleteError.message, responseContext);
        }

        logInfo(FUNCTION_NAME, 'Account and data deleted successfully', { requestId, userId });
        return createSuccessResponse({ message: 'Account successfully deleted' }, responseContext);

    } catch (error) {
        logError(FUNCTION_NAME, 'INTERNAL_ERROR', error.message, { requestId, stack: error.stack });
        return Errors.internalError('Failed to delete account: ' + error.message, responseContext);
    }
});
