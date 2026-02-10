// =============================================================================
// STRIPE CHECKOUT - Edge Function
// Creates a Stripe Checkout Session for subscriptions
// =============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno';
import { getCorsHeaders } from '../_shared/cors.ts';
import { verifyAuth } from '../_shared/auth.ts';
import { logInfo, logError, Errors, createSuccessResponse, getRequestId } from '../_shared/logger.ts';

const FUNCTION_NAME = 'stripe-checkout';

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

const ensureSessionIdParam = (url: string) => {
  if (url.includes('{CHECKOUT_SESSION_ID}')) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}session_id={CHECKOUT_SESSION_ID}`;
};

const getPriceId = (planId: string) => {
  const monthly = Deno.env.get('STRIPE_PRICE_PRO_MONTHLY') || Deno.env.get('STRIPE_PRICE_PRO_MONTHLY_ID') || '';
  const annual = Deno.env.get('STRIPE_PRICE_PRO_ANNUAL') || Deno.env.get('STRIPE_PRICE_PRO_ANNUAL_ID') || '';
  if (planId === 'pro_monthly') return monthly || null;
  if (planId === 'pro_annual') return annual || null;
  return null;
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

    const { plan_id } = await req.json();
    if (!plan_id || (plan_id !== 'pro_monthly' && plan_id !== 'pro_annual')) {
      return Errors.validationError('Invalid plan_id', responseContext);
    }

    const priceId = getPriceId(plan_id);
    if (!priceId) {
      return Errors.validationError('Missing Stripe price configuration', responseContext);
    }

    const origin = resolveOrigin(req);
    const successUrlEnv = Deno.env.get('STRIPE_SUCCESS_URL');
    const cancelUrlEnv = Deno.env.get('STRIPE_CANCEL_URL');
    const successUrl = ensureSessionIdParam(successUrlEnv || `${origin}/?checkout=success`);
    const cancelUrl = cancelUrlEnv || `${origin}/?checkout=cancel`;

    if (!origin && (!successUrlEnv || !cancelUrlEnv)) {
      return Errors.validationError('Missing success/cancel URLs', responseContext);
    }

    let customerId: string | null = null;

    const { data: latestSub } = await supabase
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .order('current_period_end', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestSub?.stripe_customer_id) {
      customerId = latestSub.stripe_customer_id;
    } else if (user.email) {
      const customers = await stripe.customers.list({ email: user.email, limit: 1 });
      if (customers.data.length > 0) {
        customerId = customers.data[0].id;
        await stripe.customers.update(customerId, { metadata: { user_id: user.id } });
      }
    }

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email || undefined,
        metadata: { user_id: user.id },
      });
      customerId = customer.id;
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      client_reference_id: user.id,
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: { user_id: user.id, plan_id },
      subscription_data: { metadata: { user_id: user.id, plan_id } },
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    logInfo(FUNCTION_NAME, 'Checkout session created', { requestId, userId: user.id, plan_id });
    return createSuccessResponse({ url: session.url }, responseContext);
  } catch (error: any) {
    logError(FUNCTION_NAME, 'INTERNAL_ERROR', error.message, { requestId });
    return Errors.internalError(error.message || 'Failed to create checkout session', responseContext);
  }
});
