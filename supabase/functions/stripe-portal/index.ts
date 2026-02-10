// =============================================================================
// STRIPE PORTAL - Edge Function
// Creates a Stripe Billing Portal session
// =============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno';
import { getCorsHeaders } from '../_shared/cors.ts';
import { verifyAuth } from '../_shared/auth.ts';
import { logInfo, logError, logWarn, Errors, createSuccessResponse, getRequestId } from '../_shared/logger.ts';

const FUNCTION_NAME = 'stripe-portal';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
});

const resolveOrigin = (req: Request) => {
  const origin = req.headers.get('origin');
  if (origin) return origin;
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
  const proto = req.headers.get('x-forwarded-proto') || 'https';
  if (host) return `${proto}://${host}`;
  return (
    Deno.env.get('SITE_URL') ||
    Deno.env.get('PUBLIC_SITE_URL') ||
    Deno.env.get('VITE_SITE_URL') ||
    ''
  );
};

serve(async (req) => {
  const requestOrigin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(requestOrigin);
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const requestId = getRequestId(req);
  const responseContext = { requestId, origin: requestOrigin || undefined };

  try {
    const { user, error: authError, supabase } = await verifyAuth(req);
    if (authError || !user || !supabase) {
      logError(FUNCTION_NAME, 'UNAUTHORIZED', authError || 'Invalid token', { requestId });
      return Errors.unauthorized(undefined, responseContext);
    }

    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('id, stripe_customer_id')
      .eq('user_id', user.id)
      .order('current_period_end', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!subscription?.id) {
      return Errors.validationError('No active subscription found. Upgrade first.', responseContext);
    }

    let customerId = subscription.stripe_customer_id || null;

    // 1. Verify if the customer ID from DB is valid in Stripe
    if (customerId) {
      try {
        const existingCustomer = await stripe.customers.retrieve(customerId);
        if (!existingCustomer || existingCustomer.deleted) {
          logInfo(FUNCTION_NAME, 'Stale customer ID', { customerId });
          customerId = null;
        }
      } catch (e) {
        logWarn(FUNCTION_NAME, 'Failed to retrieve customer', { error: e.message });
        customerId = null;
      }
    }

    // 2. If no valid ID, try finding by email
    if (!customerId && user.email) {
      const customers = await stripe.customers.list({ email: user.email, limit: 1 });
      if (customers.data.length > 0) {
        customerId = customers.data[0].id;
        await stripe.customers.update(customerId, { metadata: { user_id: user.id } });
      }
    }

    // 3. Last resort: Create a new customer so the portal doesn't crash
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email || undefined,
        metadata: { user_id: user.id },
      });
      customerId = customer.id;

      // Attempt to save this new ID back to the subscription to fix it for next time
      await supabase
        .from('subscriptions')
        .update({ stripe_customer_id: customerId })
        .eq('id', subscription.id);
    }

    if (!customerId) {
      return Errors.validationError('Unable to resolve customer for billing portal.', responseContext);
    }

    const origin = resolveOrigin(req);
    const returnUrl = Deno.env.get('STRIPE_PORTAL_RETURN_URL') || `${origin}/settings`;
    if (!origin && !Deno.env.get('STRIPE_PORTAL_RETURN_URL')) {
      return Errors.validationError('Missing portal return URL', responseContext);
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });

    logInfo(FUNCTION_NAME, 'Portal session created', { requestId, userId: user.id });
    return createSuccessResponse({ url: portalSession.url }, responseContext);
  } catch (error: any) {
    logError(FUNCTION_NAME, 'INTERNAL_ERROR', error.message, { requestId });
    return Errors.internalError(error.message || 'Failed to create portal session', responseContext);
  }
});
