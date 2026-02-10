import React, { useEffect, useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { callEdgeFunction, supabase } from '../lib/supabase';
import { logger } from '../lib/logger';
import { analytics, AnalyticsEvents } from '../lib/analytics';
import { cn } from '../lib/utils';

interface CheckoutModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planId: 'pro_monthly' | 'pro_annual';
  planLabel: string;
  userId?: string;
  onUpgradeActivated?: () => void;
}

const STRIPE_PUBLISHABLE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '';
const isSecureOrigin = typeof window === 'undefined' || window.location.protocol === 'https:';
const allowInsecureStripeInDev = import.meta.env.VITE_ALLOW_STRIPE_HTTP_DEV === 'true'
  || (import.meta.env.DEV && import.meta.env.VITE_ALLOW_STRIPE_HTTP_DEV !== 'false');
const stripeCanInitialize = !!STRIPE_PUBLISHABLE_KEY && (isSecureOrigin || allowInsecureStripeInDev);
const stripePromise = stripeCanInitialize ? loadStripe(STRIPE_PUBLISHABLE_KEY) : null;
const DEDICATION_REWARD_MESSAGE = 'Just kidding — this platform is totally free, but because you made an effort you are upgraded to Pro.';
const ALREADY_PRO_MESSAGES = [
  'You already have an active Pro subscription',
  'You are already upgraded to Pro',
];

const appearanceFallback = {
  colorPrimary: 'hsl(25 95% 52.94%)',
  colorBackground: 'hsl(25 18.18% 12.94%)',
  colorText: 'hsl(0 0% 95%)',
  colorDanger: 'hsl(0 62.8% 30.6%)',
};

const resolveHslVar = (varName: string, fallback: string) => {
  if (typeof window === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  if (!value) return fallback;
  return `hsl(${value})`;
};

const CheckoutForm: React.FC<{
  planLabel: string;
  onComplete: (paymentIntentId: string) => void;
  onProcessingChange: (processing: boolean) => void;
  disabled?: boolean;
}> = ({ planLabel, onComplete, onProcessingChange, disabled = false }) => {
  const stripe = useStripe();
  const elements = useElements();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting || disabled) return;
    setErrorMessage('');
    if (!stripe || !elements) return;

    setIsSubmitting(true);
    onProcessingChange(true);
    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/?checkout=success`,
      },
      redirect: 'if_required',
    });

    if (error) {
      setErrorMessage(error.message || 'Payment failed. Please try again.');
      setIsSubmitting(false);
      onProcessingChange(false);
      return;
    }

    if (paymentIntent?.status === 'succeeded' && paymentIntent.id) {
      onComplete(paymentIntent.id);
    } else {
      setErrorMessage('Payment succeeded but we could not verify the payment intent. Please contact support.');
    }
    setIsSubmitting(false);
    onProcessingChange(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="glass-surface rounded-xl border border-border p-4">
        <PaymentElement />
      </div>
      {errorMessage && (
        <div className="text-xs text-red-400">{errorMessage}</div>
      )}
      <Button type="submit" className={cn("w-full", isSubmitting && "opacity-70")} disabled={!stripe || isSubmitting || disabled}>
        {isSubmitting ? 'Processing...' : `Confirm ${planLabel}`}
      </Button>
    </form>
  );
};

const CheckoutModal: React.FC<CheckoutModalProps> = ({
  open,
  onOpenChange,
  planId,
  planLabel,
  userId,
  onUpgradeActivated,
}) => {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [completed, setCompleted] = useState(false);
  const [appearance, setAppearance] = useState<any>(null);
  const [processing, setProcessing] = useState(false);
  const [activationSent, setActivationSent] = useState(false);
  const [priceSummary, setPriceSummary] = useState<{
    unit_amount: number | null;
    currency: string | null;
    interval: string | null;
    product_name: string | null;
  } | null>(null);
  const [pollingMessage, setPollingMessage] = useState('');
  const [dedicationRewardUnlocked, setDedicationRewardUnlocked] = useState(false);
  const [alreadyPro, setAlreadyPro] = useState(false);

  const formatPrice = (amount: number | null | undefined, currency: string | null | undefined) => {
    if (!amount || !currency) return '—';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
      maximumFractionDigits: 2,
    }).format(amount / 100);
  };

  useEffect(() => {
    if (!open) {
      setClientSecret(null);
      setError('');
      setCompleted(false);
      setPriceSummary(null);
      setPollingMessage('');
      setDedicationRewardUnlocked(false);
      setActivationSent(false);
      setAlreadyPro(false);
      return;
    }
    if (!stripePromise) {
      if (!STRIPE_PUBLISHABLE_KEY) {
        setError('Stripe publishable key missing.');
      } else {
        setError('Stripe checkout requires HTTPS. Use HTTPS or set VITE_ALLOW_STRIPE_HTTP_DEV=true for local testing.');
      }
      return;
    }
    setAppearance({
      theme: 'night',
      variables: {
        colorPrimary: resolveHslVar('--primary', appearanceFallback.colorPrimary),
        colorBackground: resolveHslVar('--background', appearanceFallback.colorBackground),
        colorText: resolveHslVar('--foreground', appearanceFallback.colorText),
        colorDanger: resolveHslVar('--destructive', appearanceFallback.colorDanger),
        spacingUnit: '4px',
        borderRadius: '12px',
      },
    });
    const createIntent = async () => {
      setLoading(true);
      setError('');
      setAlreadyPro(false);
      try {
        const { data, error: edgeError } = await callEdgeFunction<{
          client_secret: string;
          price?: {
            unit_amount: number | null;
            currency: string | null;
            interval: string | null;
            product_name: string | null;
          };
        }>('stripe-elements', {
          plan_id: planId,
        });
        if (edgeError || !data?.client_secret) {
          const message = edgeError || 'Unable to start checkout.';
          const isAlreadyPro = ALREADY_PRO_MESSAGES.some((needle) => message.includes(needle));
          if (isAlreadyPro) {
            // Avoid an "upgrade loop" for users who already have Pro (legacy/preregistered).
            setAlreadyPro(true);
            setCompleted(true);
            setPollingMessage("You're already Pro. No payment is required.");
            emitUpgradeActivated();
            return;
          }
          setError(message);
          return;
        }
        setClientSecret(data.client_secret);
        if (data.price) {
          setPriceSummary(data.price);
        }
      } catch (err) {
        logger.error('[CheckoutModal] Failed to create intent', err);
        setError('Unable to start checkout.');
      } finally {
        setLoading(false);
      }
    };
    void createIntent();
  }, [open, planId]);

  const emitUpgradeActivated = () => {
    if (activationSent) return;
    setActivationSent(true);
    analytics.track(AnalyticsEvents.SUBSCRIPTION_ACTIVATED, {
      plan_id: planId,
    });
    onUpgradeActivated?.();
  };

  const pollForSubscription = async () => {
    const start = Date.now();
    const maxMs = 30_000;
    const user =
      userId
      || (await supabase.auth.getUser()).data?.user?.id
      || null;

    if (!user) {
      setPollingMessage('Upgrade processing. Please refresh in a moment.');
      return;
    }

    while (Date.now() - start < maxMs) {
      const { data } = await supabase
        .from('subscriptions')
        .select('plan_id, status, current_period_end, created_at')
        .eq('user_id', user)
        .order('created_at', { ascending: false })
        .limit(5);

      const rows = data || [];
      const now = new Date();
      const matched = rows.find((row) => {
        const status = String(row.status || '').toLowerCase();
        const periodEnd = row.current_period_end ? new Date(row.current_period_end) : null;
        const active = ['active', 'trialing', 'past_due'].includes(status)
          || (status === 'canceled' && !!periodEnd && periodEnd > now);
        return active && !!row.plan_id;
      });

      if (matched) {
        setDedicationRewardUnlocked(true);
        setPollingMessage(DEDICATION_REWARD_MESSAGE);
        emitUpgradeActivated();
        return;
      }

      await new Promise((r) => setTimeout(r, 2500));
    }

    setPollingMessage('Payment received. Unlock is still syncing. If this takes more than a minute, contact support.');
  };

  const handleComplete = async (paymentIntentId: string) => {
    analytics.track(AnalyticsEvents.CHECKOUT_COMPLETED, {
      plan_id: planId,
      plan_label: planLabel,
    });
    setCompleted(true);
    setPollingMessage('Finalizing your upgrade…');

    const { data, error } = await callEdgeFunction<{
      unlocked: boolean;
      plan_id: string | null;
      subscription_status: string | null;
      subscription_id: string;
    }>('stripe-elements', {
      action: 'confirm_payment',
      payment_intent_id: paymentIntentId,
    });

    if (error) {
      logger.warn('[CheckoutModal] Direct confirmation failed, falling back to polling', { error });
      await pollForSubscription();
      return;
    }

    if (data?.unlocked) {
      setDedicationRewardUnlocked(true);
      setPollingMessage(DEDICATION_REWARD_MESSAGE);
      emitUpgradeActivated();
      return;
    }

    await pollForSubscription();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (processing && !nextOpen) return;
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-card/70 border border-border flex items-center justify-center">
              <img src="/logoFinal.png" alt="dlulu life" className="w-6 h-6 object-contain" />
            </div>
            <div className="text-sm font-semibold text-foreground">dlulu life</div>
          </div>
          <DialogTitle>Secure Checkout</DialogTitle>
          <DialogDescription>
            You’re upgrading to {planLabel}. Payments are processed securely by Stripe.
          </DialogDescription>
        </DialogHeader>

        {!stripePromise && (
          <div className="text-sm text-red-400">
            {!STRIPE_PUBLISHABLE_KEY
              ? 'Stripe publishable key is missing.'
              : 'Stripe checkout requires HTTPS on this origin.'}
          </div>
        )}

        {loading && (
          <div className="text-sm text-muted-foreground">Preparing checkout…</div>
        )}

        {error && (
          <div className="text-sm text-red-400">{error}</div>
        )}

        {priceSummary && (
          <div className="glass-surface rounded-xl border border-border p-4 text-sm text-muted-foreground">
            <div className="flex items-center justify-between">
              <span>{priceSummary.product_name || planLabel}</span>
              <span className="font-semibold text-foreground">
                {formatPrice(priceSummary.unit_amount, priceSummary.currency)}
                {priceSummary.interval ? `/${priceSummary.interval === 'year' ? 'yr' : 'mo'}` : ''}
              </span>
            </div>
            <div className="text-xs text-muted-foreground mt-1">Taxes calculated by Stripe.</div>
          </div>
        )}

        {completed ? (
          <div className={cn(
            "glass-surface rounded-xl p-4 text-sm border",
            dedicationRewardUnlocked || alreadyPro
              ? "border-emerald-500/40 text-emerald-300"
              : "border-emerald-500/30 text-emerald-300"
          )}>
            {dedicationRewardUnlocked || alreadyPro ? (
              <div className="space-y-1">
                <p className="font-semibold text-emerald-200">Full package unlocked.</p>
                <p>{pollingMessage}</p>
              </div>
            ) : (
              <p>Payment complete. {pollingMessage || 'Your plan will update shortly.'}</p>
            )}
          </div>
        ) : (
          stripePromise && clientSecret && appearance && (
            <Elements stripe={stripePromise} options={{ clientSecret, appearance }}>
              <CheckoutForm
                planLabel={planLabel}
                onComplete={handleComplete}
                onProcessingChange={setProcessing}
                disabled={processing}
              />
            </Elements>
          )
        )}

        {processing && !completed && (
          <div className="text-xs text-muted-foreground">Processing payment…</div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default CheckoutModal;
