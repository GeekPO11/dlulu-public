// =============================================================================
// STRIPE ELEMENTS - Edge Function
// Creates a subscription and returns a PaymentIntent client_secret
// =============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders } from '../_shared/cors.ts';
import { verifyAuth } from '../_shared/auth.ts';
import { logInfo, logError, logWarn, Errors, createSuccessResponse, getRequestId } from '../_shared/logger.ts';

const FUNCTION_NAME = 'stripe-elements';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
});

const getPriceId = (planId: string) => {
  const monthly = Deno.env.get('STRIPE_PRICE_PRO_MONTHLY') || Deno.env.get('STRIPE_PRICE_PRO_MONTHLY_ID') || '';
  const annual = Deno.env.get('STRIPE_PRICE_PRO_ANNUAL') || Deno.env.get('STRIPE_PRICE_PRO_ANNUAL_ID') || '';
  if (planId === 'pro_monthly') return monthly || null;
  if (planId === 'pro_annual') return annual || null;
  return null;
};

const getPlanIdFromPrice = (priceId?: string | null) => {
  const monthly = Deno.env.get('STRIPE_PRICE_PRO_MONTHLY') || Deno.env.get('STRIPE_PRICE_PRO_MONTHLY_ID') || '';
  const annual = Deno.env.get('STRIPE_PRICE_PRO_ANNUAL') || Deno.env.get('STRIPE_PRICE_PRO_ANNUAL_ID') || '';
  if (priceId && monthly && priceId === monthly) return 'pro_monthly';
  if (priceId && annual && priceId === annual) return 'pro_annual';
  return null;
};

const toIso = (unixSeconds?: number | null) =>
  unixSeconds ? new Date(unixSeconds * 1000).toISOString() : null;

const isActiveStatus = (status: string) =>
  ['active', 'trialing', 'past_due'].includes(status);

const isCanceledButStillInPeriod = (status: string, currentPeriodEnd?: number | null) =>
  status === 'canceled'
  && typeof currentPeriodEnd === 'number'
  && (currentPeriodEnd * 1000) > Date.now();

const buildAdminClient = () => createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const upsertSubscription = async (
  supabaseClient: ReturnType<typeof createClient>,
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
  await supabaseClient
    .from('subscriptions')
    .upsert(payload, { onConflict: 'id' });
};

const extractClientSecret = (subscription: Stripe.Subscription) => {
  const latestInvoice = subscription.latest_invoice;
  if (!latestInvoice || typeof latestInvoice === 'string') return null;
  const paymentIntent = latestInvoice.payment_intent;
  if (!paymentIntent || typeof paymentIntent === 'string') return null;
  return paymentIntent.client_secret || null;
};

const syncStripeSubscriptionToDb = async (
  supabaseAdmin: ReturnType<typeof buildAdminClient>,
  userId: string,
  stripeCustomerId: string | null,
  subscription: Stripe.Subscription
) => {
  try {
    const priceId = subscription.items?.data?.[0]?.price?.id ?? null;
    const planId = getPlanIdFromPrice(priceId) || subscription.metadata?.plan_id || null;
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
  } catch (err: any) {
    // Best-effort: do not fail checkout flow on sync issues.
    console.warn('[stripe-elements] Failed to sync Stripe subscription to DB', err?.message || err);
  }
};

const resolveSubscriptionFromPaymentIntent = async (paymentIntentId: string) => {
  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, {
    expand: ['invoice.subscription', 'customer'],
  });

  let subscription: Stripe.Subscription | null = null;
  if (paymentIntent.invoice && typeof paymentIntent.invoice !== 'string') {
    const invoiceSubscription = paymentIntent.invoice.subscription;
    if (invoiceSubscription && typeof invoiceSubscription !== 'string') {
      subscription = invoiceSubscription as Stripe.Subscription;
    } else if (typeof invoiceSubscription === 'string') {
      subscription = await stripe.subscriptions.retrieve(invoiceSubscription);
    }
  }

  return { paymentIntent, subscription };
};

const ensureCustomerBelongsToUser = async (customerId: string | null, userId: string) => {
  if (!customerId) return false;
  const customer = await stripe.customers.retrieve(customerId);
  if (!customer || customer.deleted) return false;
  return (customer.metadata as Record<string, string>)?.user_id === userId;
};

serve(async (req) => {
  const requestOrigin = req.headers.get('origin');
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(requestOrigin) });
  }

  const requestId = getRequestId(req);
  const responseContext = { requestId, origin: requestOrigin || undefined };

  try {
    const { user, error: authError, supabase } = await verifyAuth(req);
    if (authError || !user || !supabase) {
      logError(FUNCTION_NAME, 'UNAUTHORIZED', authError || 'Invalid token', { requestId });
      return Errors.unauthorized(undefined, responseContext);
    }
    const supabaseAdmin = buildAdminClient();

    const body = await req.json();
    const action = typeof body?.action === 'string' ? body.action : 'create_intent';

    if (action === 'confirm_payment') {
      const paymentIntentId = typeof body?.payment_intent_id === 'string' ? body.payment_intent_id : '';
      if (!paymentIntentId) {
        return Errors.validationError('Missing payment_intent_id', responseContext);
      }

      const { paymentIntent, subscription } = await resolveSubscriptionFromPaymentIntent(paymentIntentId);
      const customerId =
        (typeof paymentIntent.customer === 'string' ? paymentIntent.customer : paymentIntent.customer?.id)
        || (subscription
          ? (typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id)
          : null);

      const belongsToUser = await ensureCustomerBelongsToUser(customerId, user.id);
      if (!belongsToUser) {
        logWarn(FUNCTION_NAME, 'Payment intent customer mismatch', { requestId, userId: user.id });
        return Errors.unauthorized('Unauthorized payment intent', responseContext);
      }

      if (paymentIntent.status !== 'succeeded') {
        return Errors.validationError(`Payment is not complete (status: ${paymentIntent.status})`, responseContext);
      }

      if (!subscription) {
        return Errors.validationError('Subscription not found for payment intent', responseContext);
      }

      const priceId = subscription.items?.data?.[0]?.price?.id ?? null;
      const planId = getPlanIdFromPrice(priceId) || subscription.metadata?.plan_id || null;

      try {
        await upsertSubscription(supabaseAdmin, {
          id: subscription.id,
          user_id: user.id,
          stripe_customer_id: customerId,
          status: subscription.status,
          price_id: priceId,
          plan_id: planId,
          cancel_at_period_end: subscription.cancel_at_period_end,
          current_period_end: toIso(subscription.current_period_end),
        });
      } catch (dbErr: any) {
        logWarn(FUNCTION_NAME, 'Failed to upsert confirmed subscription', {
          requestId,
          userId: user.id,
          error: dbErr?.message,
        });
      }

      try {
        const overridePlan = planId || 'pro_monthly';
        await supabaseAdmin
          .from('user_entitlement_overrides')
          .upsert({
            user_id: user.id,
            override_plan_id: overridePlan,
            reason: 'dedication_reward_after_payment',
            starts_at: new Date().toISOString(),
            ends_at: null,
          }, { onConflict: 'user_id' });
      } catch (overrideErr: any) {
        logWarn(FUNCTION_NAME, 'Failed to apply entitlement override', {
          requestId,
          userId: user.id,
          error: overrideErr?.message,
        });
      }

      logInfo(FUNCTION_NAME, 'Payment confirmed and entitlement unlocked', {
        requestId,
        userId: user.id,
        paymentIntentId,
        subscriptionId: subscription.id,
        planId,
      });

      return createSuccessResponse({
        unlocked: true,
        plan_id: planId,
        subscription_status: subscription.status,
        subscription_id: subscription.id,
      }, responseContext);
    }

    const plan_id = body?.plan_id;
    if (!plan_id || (plan_id !== 'pro_monthly' && plan_id !== 'pro_annual')) {
      return Errors.validationError('Invalid plan_id', responseContext);
    }

    const priceId = getPriceId(plan_id);
    if (!priceId) {
      return Errors.validationError('Missing Stripe price configuration', responseContext);
    }

    const now = new Date();
    const { data: activeOverride } = await supabase
      .from('user_entitlement_overrides')
      .select('override_plan_id, starts_at, ends_at')
      .eq('user_id', user.id)
      .maybeSingle();

    const overrideIsActive =
      !!activeOverride
      && (!activeOverride.starts_at || new Date(activeOverride.starts_at) <= now)
      && (!activeOverride.ends_at || new Date(activeOverride.ends_at) > now);

    if (overrideIsActive && String(activeOverride.override_plan_id || '').startsWith('pro')) {
      return Errors.validationError('You are already upgraded to Pro.', responseContext);
    }

    const { data: existingSubscriptions } = await supabase
      .from('subscriptions')
      .select('id, status, plan_id, current_period_end, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(8);

    const activeSubscription = (existingSubscriptions || []).find((sub: any) => {
      const status = String(sub.status || '').toLowerCase();
      if (isActiveStatus(status)) return true;
      if (status === 'canceled' && sub.current_period_end) {
        return new Date(sub.current_period_end) > now;
      }
      return false;
    });

    if (activeSubscription) {
      return Errors.validationError('You already have an active Pro subscription.', responseContext);
    }

    const recentIncomplete = (existingSubscriptions || []).find((sub: any) => {
      const status = String(sub.status || '').toLowerCase();
      if (status !== 'incomplete') return false;
      if (sub.plan_id && sub.plan_id !== plan_id) return false;
      if (!sub.created_at) return true;
      return (Date.now() - new Date(sub.created_at).getTime()) < 1000 * 60 * 30;
    });

    if (recentIncomplete?.id) {
      try {
        const existingStripeSub = await stripe.subscriptions.retrieve(recentIncomplete.id, {
          expand: ['latest_invoice.payment_intent'],
        });
        const existingStatus = String(existingStripeSub.status || '').toLowerCase();

        if (isActiveStatus(existingStatus)) {
          return Errors.validationError('You already have an active Pro subscription.', responseContext);
        }

        const existingClientSecret = extractClientSecret(existingStripeSub);
        if (existingStatus === 'incomplete' && existingClientSecret) {
          const existingPriceId = existingStripeSub.items?.data?.[0]?.price?.id ?? null;
          const existingPrice = existingPriceId
            ? await stripe.prices.retrieve(existingPriceId, { expand: ['product'] })
            : null;
          const productName = existingPrice && typeof existingPrice.product !== 'string'
            ? existingPrice.product?.name ?? null
            : null;

          logInfo(FUNCTION_NAME, 'Reusing incomplete subscription intent', {
            requestId,
            userId: user.id,
            subscriptionId: existingStripeSub.id,
          });

          return createSuccessResponse({
            client_secret: existingClientSecret,
            reused_subscription: true,
            subscription_id: existingStripeSub.id,
            price: {
              unit_amount: existingPrice?.unit_amount ?? null,
              currency: existingPrice?.currency ?? null,
              interval: existingPrice?.recurring?.interval ?? null,
              product_name: productName,
            },
          }, responseContext);
        }
      } catch (resumeErr: any) {
        logWarn(FUNCTION_NAME, 'Failed to reuse incomplete subscription', {
          requestId,
          userId: user.id,
          subscriptionId: recentIncomplete.id,
          error: resumeErr?.message,
        });
      }
    }

    let customerId: string | null = null;

    const { data: latestSub } = await supabase
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .order('current_period_end', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestSub?.stripe_customer_id) {
      try {
        const existingCustomer = await stripe.customers.retrieve(latestSub.stripe_customer_id);
        if (!existingCustomer || existingCustomer.deleted) {
          console.log('Stale customer ID in DB, ignoring:', latestSub.stripe_customer_id);
          customerId = null;
        } else {
          customerId = latestSub.stripe_customer_id;
        }
      } catch (err) {
        console.warn('Failed to retrieve customer from Stripe, creating new one:', err.message);
        customerId = null;
      }
    }

    if (!customerId && user.email) {
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

    const stripeSubscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: 'all',
      limit: 20,
      expand: ['data.latest_invoice.payment_intent'],
    });

    const activeStripeSubscription = stripeSubscriptions.data.find((sub) => {
      const status = String(sub.status || '').toLowerCase();
      return isActiveStatus(status) || isCanceledButStillInPeriod(status, sub.current_period_end);
    });

    if (activeStripeSubscription) {
      // Fundamental fix: if Stripe knows you're active but DB doesn't, sync it so the app can unlock Pro
      // and avoid an "upgrade loop" for preregistered / legacy customers.
      await syncStripeSubscriptionToDb(supabaseAdmin, user.id, customerId, activeStripeSubscription);
      return Errors.validationError('You already have an active Pro subscription.', responseContext);
    }

    const reusableIncompleteStripeSubscription = stripeSubscriptions.data.find((sub) => {
      const status = String(sub.status || '').toLowerCase();
      if (status !== 'incomplete') return false;
      const subPriceId = sub.items?.data?.[0]?.price?.id ?? null;
      const subPlanId = getPlanIdFromPrice(subPriceId) || sub.metadata?.plan_id || null;
      if (subPlanId && subPlanId !== plan_id) return false;
      if (!sub.created) return true;
      return (Date.now() - (sub.created * 1000)) < 1000 * 60 * 30;
    });

    if (reusableIncompleteStripeSubscription) {
      const reusableClientSecret = extractClientSecret(reusableIncompleteStripeSubscription);
      if (reusableClientSecret) {
        const reusablePriceId = reusableIncompleteStripeSubscription.items?.data?.[0]?.price?.id ?? null;
        const reusablePrice = reusablePriceId
          ? await stripe.prices.retrieve(reusablePriceId, { expand: ['product'] })
          : null;
        const reusableProductName = reusablePrice && typeof reusablePrice.product !== 'string'
          ? reusablePrice.product?.name ?? null
          : null;

        await upsertSubscription(supabaseAdmin, {
          id: reusableIncompleteStripeSubscription.id,
          user_id: user.id,
          stripe_customer_id: customerId,
          status: reusableIncompleteStripeSubscription.status,
          price_id: reusablePriceId,
          plan_id: getPlanIdFromPrice(reusablePriceId) || reusableIncompleteStripeSubscription.metadata?.plan_id || plan_id,
          cancel_at_period_end: reusableIncompleteStripeSubscription.cancel_at_period_end,
          current_period_end: toIso(reusableIncompleteStripeSubscription.current_period_end),
        });

        logInfo(FUNCTION_NAME, 'Reusing Stripe incomplete subscription intent', {
          requestId,
          userId: user.id,
          subscriptionId: reusableIncompleteStripeSubscription.id,
        });

        return createSuccessResponse({
          client_secret: reusableClientSecret,
          reused_subscription: true,
          subscription_id: reusableIncompleteStripeSubscription.id,
          price: {
            unit_amount: reusablePrice?.unit_amount ?? null,
            currency: reusablePrice?.currency ?? null,
            interval: reusablePrice?.recurring?.interval ?? null,
            product_name: reusableProductName,
          },
        }, responseContext);
      }
    }

    const price = await stripe.prices.retrieve(priceId, { expand: ['product'] });
    const productName = typeof price.product === 'string' ? null : price.product?.name ?? null;

    const idempotencyKey = `sub_create_${user.id}_${plan_id}_${Math.floor(Date.now() / (1000 * 60 * 5))}`;
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId, quantity: 1 }],
      payment_behavior: 'default_incomplete',
      payment_settings: {
        save_default_payment_method: 'on_subscription',
        payment_method_types: ['card'],
      },
      metadata: { user_id: user.id, plan_id },
      expand: ['latest_invoice.payment_intent'],
    }, { idempotencyKey });

    const paymentIntent = subscription.latest_invoice && typeof subscription.latest_invoice !== 'string'
      ? subscription.latest_invoice.payment_intent
      : null;

    const clientSecret = paymentIntent && typeof paymentIntent !== 'string'
      ? paymentIntent.client_secret
      : null;

    if (!clientSecret) {
      logError(FUNCTION_NAME, 'MISSING_CLIENT_SECRET', 'Missing client_secret', { requestId, userId: user.id });
      return Errors.internalError('Unable to create payment intent', responseContext);
    }

    // IMMEDIATE SYNC: Upsert subscription to DB to avoid webhook race conditions
    // This ensures the UI has data immediately, including the start/end dates
    try {
      const periodEnd = subscription.current_period_end ? new Date(subscription.current_period_end * 1000).toISOString() : null;
      await upsertSubscription(supabaseAdmin, {
        id: subscription.id,
        user_id: user.id,
        stripe_customer_id: customerId,
        status: subscription.status,
        price_id: priceId,
        plan_id: plan_id,
        cancel_at_period_end: subscription.cancel_at_period_end,
        current_period_end: periodEnd,
      });
    } catch (dbErr) {
      logWarn(FUNCTION_NAME, 'Failed to immediate-upsert subscription', { error: dbErr.message });
      // Don't fail the request, just warn. Webhook will eventually catch up.
    }

    logInfo(FUNCTION_NAME, 'Payment intent created', { requestId, userId: user.id, plan_id });
    return createSuccessResponse({
      client_secret: clientSecret,
      payment_intent_id: typeof paymentIntent !== 'string' ? paymentIntent?.id ?? null : null,
      subscription_id: subscription.id,
      price: {
        unit_amount: price.unit_amount,
        currency: price.currency,
        interval: price.recurring?.interval ?? null,
        product_name: productName,
      },
    }, responseContext);
  } catch (error: any) {
    logError(FUNCTION_NAME, 'INTERNAL_ERROR', error.message, { requestId });
    return Errors.internalError(error.message || 'Failed to create payment intent', responseContext);
  }
});
