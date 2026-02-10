// =============================================================================
// STRIPE WEBHOOK - Edge Function
// Handles subscription lifecycle events and syncs to subscriptions table
// =============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { logWarn, logError, logInfo, getRequestId } from '../_shared/logger.ts';
import { track } from '../_shared/analytics.ts';

const FUNCTION_NAME = 'stripe-webhook';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
});

// Helper to log to DB for debugging when console logs are inaccessible
const logToDB = async (supabase: any, message: string, details: any) => {
  try {
    await supabase.from('debug_logs').insert({ message, details });
  } catch (e) {
    // ignore
  }
};

const getPlanIdFromPrice = (priceId?: string | null) => {
  const monthly = Deno.env.get('STRIPE_PRICE_PRO_MONTHLY') || Deno.env.get('STRIPE_PRICE_PRO_MONTHLY_ID') || '';
  const annual = Deno.env.get('STRIPE_PRICE_PRO_ANNUAL') || Deno.env.get('STRIPE_PRICE_PRO_ANNUAL_ID') || '';
  if (priceId && monthly && priceId === monthly) return 'pro_monthly';
  if (priceId && annual && priceId === annual) return 'pro_annual';
  return null;
};

const toIso = (unixSeconds?: number | null) => {
  if (!unixSeconds) return null;
  const iso = new Date(unixSeconds * 1000).toISOString();
  console.log(`[Date Conversion] Unix: ${unixSeconds} -> ISO: ${iso}`);
  return iso;
};

const buildAdminClient = () => {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
};

const resolveUserIdFromCustomer = async (customerId?: string | null) => {
  if (!customerId) return null;
  const customer = await stripe.customers.retrieve(customerId);
  if (customer && !('deleted' in customer)) {
    return (customer.metadata as Record<string, string>)?.user_id || null;
  }
  return null;
};

const resolveUserIdFromSession = async (session: Stripe.Checkout.Session) => {
  return session.client_reference_id
    || session.metadata?.user_id
    || await resolveUserIdFromCustomer(
      typeof session.customer === 'string' ? session.customer : session.customer?.id
    );
};

const resolveUserIdFromSubscription = async (subscription: Stripe.Subscription) => {
  return subscription.metadata?.user_id
    || await resolveUserIdFromCustomer(
      typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id
    );
};

const upsertSubscription = async (
  supabaseAdmin: ReturnType<typeof buildAdminClient>,
  payload: {
    id: string;
    user_id: string;
    stripe_customer_id?: string | null;
    status: string;
    price_id?: string | null;
    plan_id?: string | null;
    cancel_at_period_end?: boolean | null;
    current_period_end?: string | null;
  }
) => {
  await logToDB(supabaseAdmin, 'Upserting Subscription', payload);

  const { error } = await supabaseAdmin
    .from('subscriptions')
    .upsert(payload, { onConflict: 'id' });

  if (error) {
    await logToDB(supabaseAdmin, 'Upsert Error', { error: error.message });
    throw new Error(`Failed to upsert subscription: ${error.message}`);
  }

  // Sync to profiles table for easy frontend access
  if (payload.plan_id) {
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({
        plan_tier: payload.plan_id.includes('pro') ? 'pro' : 'free',
        subscription_status: payload.status,
        stripe_customer_id: payload.stripe_customer_id
      })
      .eq('id', payload.user_id);

    if (profileError) {
      await logToDB(supabaseAdmin, 'Profile Sync Error', { error: profileError.message });
      logWarn(FUNCTION_NAME, 'Failed to sync profile', { userId: payload.user_id, error: profileError.message });
    } else {
      await logToDB(supabaseAdmin, 'Profile Synced', { userId: payload.user_id, plan: payload.plan_id });
    }
  }
};

serve(async (req) => {
  const requestId = getRequestId(req);

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const signature = req.headers.get('stripe-signature');
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '';

  const supabaseAdmin = buildAdminClient();

  if (!signature || !webhookSecret) {
    logError(FUNCTION_NAME, 'VALIDATION_ERROR', 'Missing Stripe signature or webhook secret', { requestId });
    await logToDB(supabaseAdmin, 'Validation Error', { message: 'Missing signature/secret' });
    return new Response('Missing signature', { status: 400 });
  }

  const body = await req.text();
  let event: Stripe.Event;

  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
  } catch (err: any) {
    logWarn(FUNCTION_NAME, 'Invalid Stripe signature', { requestId, message: err.message });
    await logToDB(supabaseAdmin, 'Signature Error', { message: err.message });
    return new Response('Invalid signature', { status: 400 });
  }

  await logToDB(supabaseAdmin, `Webhook Received: ${event.type}`, { id: event.id });

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = await resolveUserIdFromSession(session);

        if (!userId) {
          logWarn(FUNCTION_NAME, 'Missing user_id on checkout session', { requestId, sessionId: session.id });
          await logToDB(supabaseAdmin, 'Missing User ID', { sessionId: session.id });
          break;
        }

        const subscriptionId = session.subscription as string | null;
        if (!subscriptionId) break;

        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const priceId = subscription.items?.data?.[0]?.price?.id ?? null;
        const planId = getPlanIdFromPrice(priceId) || subscription.metadata?.plan_id || null;
        const stripeCustomerId =
          (typeof session.customer === 'string' ? session.customer : session.customer?.id)
          || (typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id)
          || null;

        await upsertSubscription(supabaseAdmin, {
          id: subscription.id,
          user_id: userId,
          stripe_customer_id: stripeCustomerId,
          status: subscription.status,
          price_id: priceId,
          plan_id: planId,
          cancel_at_period_end: subscription.cancel_at_period_end,
          current_period_end: toIso(subscription.current_period_end),
        });

        logInfo(FUNCTION_NAME, 'checkout.session.completed synced', {
          requestId,
          userId,
          eventType: event.type,
          subscriptionId: subscription.id,
          planId,
        });
        track('checkout_completed', { plan_id: planId, revenue: session.amount_total }, { functionName: FUNCTION_NAME, requestId, userId });
        track('subscription_active', { plan_id: planId, subscription_id: subscription.id }, { functionName: FUNCTION_NAME, requestId, userId });
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = await resolveUserIdFromSubscription(subscription);

        if (!userId) {
          logWarn(FUNCTION_NAME, 'Missing user_id on subscription', { requestId, subscriptionId: subscription.id });
          break;
        }

        const priceId = subscription.items?.data?.[0]?.price?.id ?? null;
        const planId = getPlanIdFromPrice(priceId) || subscription.metadata?.plan_id || null;
        const stripeCustomerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id || null;

        await upsertSubscription(supabaseAdmin, {
          id: subscription.id,
          user_id: userId,
          stripe_customer_id: stripeCustomerId,
          status: subscription.status,
          price_id: priceId,
          plan_id: planId,
          cancel_at_period_end: subscription.cancel_at_period_end,
          current_period_end: toIso(subscription.current_period_end),
        });

        logInfo(FUNCTION_NAME, 'subscription synced', {
          requestId,
          userId,
          eventType: event.type,
          subscriptionId: subscription.id,
          planId,
        });
        if (event.type === 'customer.subscription.deleted') {
          track('subscription_canceled', { subscription_id: subscription.id }, { functionName: FUNCTION_NAME, requestId, userId });
        } else {
          track('subscription_active', { plan_id: planId, subscription_id: subscription.id }, { functionName: FUNCTION_NAME, requestId, userId });
        }
        break;
      }

      case 'invoice.payment_succeeded':
      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice;
        if (invoice.subscription) {
          const subscription = await stripe.subscriptions.retrieve(String(invoice.subscription));
          const userId = await resolveUserIdFromSubscription(subscription);

          if (userId) {
            const priceId = subscription.items?.data?.[0]?.price?.id ?? null;
            const planId = getPlanIdFromPrice(priceId) || subscription.metadata?.plan_id || null;
            const stripeCustomerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id || null;

            await upsertSubscription(supabaseAdmin, {
              id: subscription.id,
              user_id: userId,
              stripe_customer_id: stripeCustomerId,
              status: subscription.status,
              price_id: priceId,
              plan_id: planId,
              cancel_at_period_end: subscription.cancel_at_period_end,
              current_period_end: toIso(subscription.current_period_end),
            });

            logInfo(FUNCTION_NAME, 'invoice event synced', {
              requestId,
              userId,
              eventType: event.type,
              subscriptionId: subscription.id,
              planId,
            });
          } else {
            await logToDB(supabaseAdmin, 'Missing User ID for Invoice', { invoiceId: invoice.id });
          }
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        if (invoice.subscription) {
          const subscription = await stripe.subscriptions.retrieve(String(invoice.subscription));
          const userId = await resolveUserIdFromSubscription(subscription);

          if (userId) {
            track('payment_failed', { subscription_id: subscription.id }, { functionName: FUNCTION_NAME, requestId, userId });
          }
        }
        break;
      }

      default:
        await logToDB(supabaseAdmin, `Refused Event: ${event.type}`, {});
        break;
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    logError(FUNCTION_NAME, 'INTERNAL_ERROR', error.message, { requestId });
    await logToDB(supabaseAdmin, 'Webhook Execution Error', { error: error.message, stack: error.stack });
    return new Response('Webhook error', { status: 500 });
  }
});
