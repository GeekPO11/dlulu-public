import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { callEdgeFunction } from '../lib/supabase';
import { logger } from '../lib/logger';
import { analytics, AnalyticsEvents } from '../lib/analytics';
import { cn } from '../lib/utils';
import CheckoutModal from './CheckoutModal';
import ThemeToggle from './ThemeToggle';
import { ScrollArea } from './ui/scroll-area';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './ui/accordion';

interface PricingPageProps {
  user: {
    id: string;
    name?: string;
    email?: string;
  };
  onBack: () => void;
  onNavigateToSettings?: () => void;
  onUpgradeActivated?: () => void;
}

interface PlanEntitlement {
  plan_id: string;
  max_active_goals: number | null;
  token_hard_cap: number | null;
  token_soft_cap: number | null;
  calendar_sync_enabled: boolean;
}

interface SubscriptionSummary {
  plan_id: string | null;
  status: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
}

const formatTokens = (value: number | null | undefined) => {
  if (!value || value <= 0) return 'Unlimited';
  if (value >= 1000000) return `${value / 1000000}M`;
  if (value >= 1000) return `${value / 1000}k`;
  return value.toLocaleString('en-US');
};

const formatDate = (date: string | null) => {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

const PricingPage: React.FC<PricingPageProps> = ({ user, onBack, onNavigateToSettings, onUpgradeActivated }) => {
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');
  const [planEntitlements, setPlanEntitlements] = useState<Record<string, PlanEntitlement>>({});
  const [currentPlanId, setCurrentPlanId] = useState('free');
  const [subscription, setSubscription] = useState<SubscriptionSummary | null>(null);
  const [checkoutError, setCheckoutError] = useState('');
  const [portalError, setPortalError] = useState('');
  const [checkoutStatus, setCheckoutStatus] = useState<'success' | 'cancel' | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutPlanId, setCheckoutPlanId] = useState<'pro_monthly' | 'pro_annual'>('pro_monthly');
  const [entitlementsRefreshKey, setEntitlementsRefreshKey] = useState(0);
  const [upgradeSuccess, setUpgradeSuccess] = useState(false);

  const handleCheckoutClose = (open: boolean) => {
    setCheckoutOpen(open);
    if (!open && upgradeSuccess && onNavigateToSettings && !onUpgradeActivated) {
      onNavigateToSettings();
    }
  };

  useEffect(() => {
    analytics.track(AnalyticsEvents.PRICING_PAGE_VIEWED, {
      current_plan: currentPlanId,
    });
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get('checkout');
    if (checkout === 'success' || checkout === 'cancel') {
      setCheckoutStatus(checkout);
      if (checkout === 'success') {
        analytics.track(AnalyticsEvents.CHECKOUT_COMPLETED);
      } else {
        analytics.track(AnalyticsEvents.CHECKOUT_ABANDONED);
      }
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadPlans = async () => {
      try {
        const authResult = await supabase.auth.getUser();
        const userId = user.id || authResult.data?.user?.id;
        if (!userId) return;

        const now = new Date();
        const { data: override } = await supabase
          .from('user_entitlement_overrides')
          .select('override_plan_id, starts_at, ends_at')
          .eq('user_id', userId)
          .maybeSingle();

        const isOverrideActive = override && (!override.starts_at || new Date(override.starts_at) <= now)
          && (!override.ends_at || new Date(override.ends_at) > now);

        let resolvedPlanId = 'free';

        if (isOverrideActive && override?.override_plan_id) {
          resolvedPlanId = override.override_plan_id;
        } else {
          const { data: subscriptionRow } = await supabase
            .from('subscriptions')
            .select('plan_id, status, current_period_end, cancel_at_period_end')
            .eq('user_id', userId)
            .order('current_period_end', { ascending: false, nullsFirst: false })
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          const status = (subscriptionRow?.status || '').toLowerCase();
          const periodEnd = subscriptionRow?.current_period_end ? new Date(subscriptionRow.current_period_end) : null;
          const isSubscriptionActive =
            ['active', 'trialing', 'past_due'].includes(status) ||
            (status === 'canceled' && periodEnd && periodEnd > now);

          if (isSubscriptionActive && subscriptionRow?.plan_id) {
            resolvedPlanId = subscriptionRow.plan_id;
          }

          if (subscriptionRow && isMounted) {
            setSubscription(subscriptionRow);
          }
        }

        const { data: plans } = await supabase
          .from('plan_entitlements')
          .select('*')
          .in('plan_id', ['free', 'pro_monthly', 'pro_annual', 'pro_early']);

        if (isMounted && plans) {
          const mapped: Record<string, PlanEntitlement> = {};
          for (const plan of plans) {
            mapped[plan.plan_id] = {
              plan_id: plan.plan_id,
              max_active_goals: plan.max_active_goals ?? null,
              token_hard_cap: plan.token_hard_cap ?? null,
              token_soft_cap: plan.token_soft_cap ?? null,
              calendar_sync_enabled: plan.calendar_sync_enabled ?? false,
            };
          }
          setPlanEntitlements(mapped);
          setCurrentPlanId(resolvedPlanId);
        }
      } catch (err) {
        logger.error('[PricingPage] Failed to load plans', err);
      }
    };

    void loadPlans();
    return () => {
      isMounted = false;
    };
  }, [user.id, entitlementsRefreshKey]);

  const planLabel = useMemo(() => {
    if (currentPlanId === 'pro_early') return 'Early Adopter';
    if (currentPlanId.startsWith('pro')) return 'Pro';
    return 'Free';
  }, [currentPlanId]);

  const planStatusLabel = useMemo(() => {
    const status = (subscription?.status || '').toLowerCase();
    if (!status) return 'No active subscription';
    if (status === 'past_due') return 'Past Due';
    if (status === 'canceled') return 'Canceled';
    if (status === 'trialing') return 'Trial';
    return 'Active';
  }, [subscription?.status]);

  const handleCheckout = (planId: 'pro_monthly' | 'pro_annual') => {
    analytics.trackCheckoutStarted(planId, {
      billing_cycle: billingCycle,
    });
    setCheckoutError('');
    setCheckoutPlanId(planId);
    setCheckoutOpen(true);
  };

  const handleManageBilling = async () => {
    analytics.track(AnalyticsEvents.BILLING_PORTAL_OPENED);
    setPortalError('');
    const { data, error } = await callEdgeFunction<{ url: string }>('stripe-portal', {});
    if (error || !data?.url) {
      setPortalError(error || 'Unable to open billing portal. Please upgrade first.');
      return;
    }
    window.location.href = data.url;
  };

  const freePlan = planEntitlements.free;
  const proMonthly = planEntitlements.pro_monthly;
  const proAnnual = planEntitlements.pro_annual;

  const isPro = currentPlanId.startsWith('pro');
  const isEarly = currentPlanId === 'pro_early';

  return (
    <div className="text-foreground min-h-screen bg-background relative overflow-x-hidden">
      {/* Background Gradients */}
      <div className="fixed top-0 left-0 w-full h-full pointer-events-none -z-10 overflow-hidden">
        <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-primary/5 blur-[120px]" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[30%] h-[30%] rounded-full bg-blue-500/5 blur-[100px]" />
      </div>

      <ScrollArea className="h-screen w-full">
        <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-10">
          {/* Header / Nav */}
          <div className="flex items-center justify-between mb-10 md:mb-12">
            <button
              onClick={onBack}
              className="flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
            >
              <span className="material-symbols-outlined text-lg">arrow_back</span>
              Back to Dashboard
            </button>
            <ThemeToggle />
          </div>

          {/* Hero Section */}
          <div className="text-center max-w-3xl mx-auto mb-12 md:mb-14">
            <h1 className="text-3xl sm:text-5xl font-black tracking-tight mb-4 bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
              Ambition is free. <br />
              <span className="text-primary">Execution is ensuring it happens.</span>
            </h1>
            <p className="text-base sm:text-lg text-muted-foreground leading-relaxed">
              Start designing your life today. Upgrade when you're ready to master it.
            </p>
          </div>

          {/* Value Props */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
            <div className="glass-surface p-4 rounded-2xl border border-border/50">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                <span className="material-symbols-outlined text-primary text-2xl">psychology</span>
              </div>
              <h3 className="text-lg font-bold mb-2">AI That Remembers</h3>
              <p className="text-sm text-muted-foreground">Unlike standard chatbots, dlulu remembers your context, constraints, and history forever.</p>
            </div>
            <div className="glass-surface p-4 rounded-2xl border border-border/50">
              <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center mb-4">
                <span className="material-symbols-outlined text-amber-500 text-2xl">route</span>
              </div>
              <h3 className="text-lg font-bold mb-2">Plans That Adapt</h3>
              <p className="text-sm text-muted-foreground">Life happens. Our scheduling engine rebuilds your roadmap instantly when you fall behind.</p>
            </div>
            <div className="glass-surface p-4 rounded-2xl border border-border/50">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center mb-4">
                <span className="material-symbols-outlined text-emerald-500 text-2xl">sync</span>
              </div>
              <h3 className="text-lg font-bold mb-2">Sync That Sticks</h3>
              <p className="text-sm text-muted-foreground">Turn abstract plans into concrete Google Calendar blocks that you actually follow.</p>
            </div>
          </div>

          {/* Notification Messages */}
          {checkoutStatus === 'success' && (
            <div className="mb-10 max-w-lg mx-auto glass-surface border border-emerald-500/30 rounded-2xl p-4 text-emerald-300 text-center">
              <div className="flex items-center justify-center gap-2">
                <span className="material-symbols-outlined text-lg">check_circle</span>
                Just kidding — this platform is totally free, but because you made an effort you are upgraded to Pro.
              </div>
            </div>
          )}

          {/* Pricing Toggle */}
          <div className="flex flex-col items-center gap-2 mb-8">
            <div className="glass-surface p-1 rounded-full border border-border inline-grid grid-cols-2 gap-1 min-w-[280px]">
              <button
                onClick={() => setBillingCycle('monthly')}
                className={cn(
                  'px-6 py-2 rounded-full text-sm font-bold transition-colors',
                  billingCycle === 'monthly'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                Monthly
              </button>
              <button
                onClick={() => setBillingCycle('annual')}
                className={cn(
                  'px-6 py-2 rounded-full text-sm font-bold transition-colors',
                  billingCycle === 'annual'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                Annual
              </button>
            </div>
            {billingCycle === 'annual' && (
              <span className="flex items-center text-xs font-bold text-emerald-500 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">
                2 months free
              </span>
            )}
          </div>


          {/* Pricing Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 max-w-4xl mx-auto mb-12 items-start">
            {/* Dreamer (Free) */}
            <div className="bg-card text-card-foreground rounded-2xl p-5 border border-border/80 flex flex-col shadow-sm hover:shadow-md transition-all">
              <div className="mb-5">
                <h3 className="text-2xl font-black mb-1">Dreamer</h3>
                <p className="text-muted-foreground text-sm">Turn one big dream into a clear plan.</p>
              </div>
              <div className="text-4xl font-black mb-6">
                $0
              </div>

              <ul className="space-y-3 text-sm text-foreground/80">
                <li className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-green-500 text-lg mt-0.5">check</span>
                  1 Active Goal
                </li>
                <li className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-green-500 text-lg mt-0.5">check</span>
                  Unlimited AI Blueprints
                </li>
                <li className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-green-500 text-lg mt-0.5">check</span>
                  Smart Roadmap Visualization
                </li>
                <li className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-green-500 text-lg mt-0.5">check</span>
                  Basic AI Chat ({formatTokens(freePlan?.token_hard_cap)}/mo)
                </li>
                <li className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-green-500 text-lg mt-0.5">check</span>
                  30-Day History
                </li>
              </ul>

              <button
                className={cn(
                  "w-full mt-6 py-3 rounded-xl font-bold border border-border transition-all",
                  currentPlanId === 'free' ? "bg-muted text-muted-foreground cursor-default" : "bg-background hover:bg-accent text-foreground"
                )}
                disabled={currentPlanId === 'free'}
                onClick={onBack}
              >
                {currentPlanId === 'free' ? 'Current Plan' : 'Use Free Version'}
              </button>
            </div>

            {/* Achiever (Pro) */}
            <div className={cn(
              "bg-card text-card-foreground rounded-2xl p-5 border-2 flex flex-col relative overflow-hidden shadow-lg transition-shadow hover:shadow-xl",
              billingCycle === 'annual' ? "border-amber-500" : "border-primary"
            )}>
              {billingCycle === 'annual' && (
                <div className="absolute top-4 right-[-34px] rotate-[45deg] bg-amber-500 text-amber-950 font-bold text-xs py-1 px-10">
                  BEST VALUE
                </div>
              )}

              <div className="mb-6">
                <h3 className="text-2xl font-black mb-1">Achiever</h3>
                <p className="text-muted-foreground text-sm">Engineer your entire life.</p>
              </div>
              <div className="mb-8">
                <div className="flex items-end gap-2">
                  <span className="text-4xl font-black">
                    {billingCycle === 'annual' ? '$100' : '$10'}
                  </span>
                  <span className="text-muted-foreground font-semibold mb-1">
                    /{billingCycle === 'annual' ? 'year' : 'mo'}
                  </span>
                </div>
                {billingCycle === 'annual' && (
                  <p className="text-xs text-emerald-400 mt-2 font-medium">Billed annually (equals $8.33/mo)</p>
                )}
              </div>

              <ul className="space-y-3 text-sm text-foreground/80">
                <li className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-primary text-lg mt-0.5">check_circle</span>
                  <span className="font-bold">Everything in Free, plus:</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-primary text-lg mt-0.5">check</span>
                  Unlimited Active Goals
                </li>
                <li className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-primary text-lg mt-0.5">check</span>
                  Google Calendar Sync (Coming Soon)
                </li>
                <li className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-primary text-lg mt-0.5">check</span>
                  Energy-Aware Auto-Scheduling
                </li>
                <li className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-primary text-lg mt-0.5">check</span>
                  Priority AI Chat ({formatTokens(proAnnual?.token_soft_cap || proMonthly?.token_soft_cap)}/mo)
                </li>
                <li className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-primary text-lg mt-0.5">check</span>
                  Unlimited History
                </li>
              </ul>

              {isPro ? (
                <button
                  onClick={handleManageBilling}
                  className="w-full py-3 rounded-xl bg-card hover:bg-card/80 border border-border text-foreground font-bold transition-all"
                >
                  Manage Billing
                </button>
              ) : (
                <button
                  onClick={() => handleCheckout(billingCycle === 'annual' ? 'pro_annual' : 'pro_monthly')}
                  className="w-full mt-6 py-3 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold transition-all shadow-lg shadow-primary/20"
                >
                  Upgrade to Pro
                </button>
              )}
              {checkoutError && (
                <p className="text-xs text-red-400 mt-2 text-center">{checkoutError}</p>
              )}
            </div>
          </div>

          {/* How Limits Work */}
          <div className="max-w-3xl mx-auto mb-20">
            <div className="glass-surface p-8 rounded-2xl border border-border/50 bg-card/20">
              <h3 className="text-lg font-bold mb-3 flex items-center gap-2">
                <span className="material-symbols-outlined text-muted-foreground">info</span>
                How Limits Work
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                <strong className="text-foreground">Fairness First:</strong> We don't charge usage fees. Free plans get a generous starter bucket of AI credits (approx 50 detailed chats). Pro plans get 20x that amount—enough for hours of daily planning. If you hit the limit, we never lock your data; we just slow things down a bit until next month.
              </p>
            </div>
          </div>


          {/* FAQs */}
          <div className="max-w-3xl mx-auto pb-20">
            <h2 className="text-2xl font-black mb-8 text-center">Frequently Asked Questions</h2>
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="item-1" className="border-border">
                <AccordionTrigger className="text-left font-semibold">Why pay when ChatGPT is free?</AccordionTrigger>
                <AccordionContent className="text-muted-foreground leading-relaxed">
                  ChatGPT is a chatbot that forgets you every session. dlulu is a stateful Life OS that tracks your progress, manages your schedule, and remembers your constraints forever. You're paying for the <em>system</em>, not just the text.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="item-2" className="border-border">
                <AccordionTrigger className="text-left font-semibold">Is Calendar Sync included in Free?</AccordionTrigger>
                <AccordionContent className="text-muted-foreground leading-relaxed">
                  No. Syncing to Google Calendar is a powerful "execution" feature available only on Pro. Free users can visualize their roadmap within the app.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="item-3" className="border-border">
                <AccordionTrigger className="text-left font-semibold">What happens if I hit my token limit?</AccordionTrigger>
                <AccordionContent className="text-muted-foreground leading-relaxed">
                  On Pro, you enter the "Economy Lane"—you can still chat, but responses may take a few seconds longer. On Free, chat pauses until your month resets, but you can still view and check off tasks.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="item-4" className="border-border">
                <AccordionTrigger className="text-left font-semibold">Can I cancel anytime?</AccordionTrigger>
                <AccordionContent className="text-muted-foreground leading-relaxed">
                  Yes. If you cancel, your data is preserved, but you'll be downgraded to the Free limits (1 active goal) at the end of your billing cycle.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="item-6" className="border-border">
                <AccordionTrigger className="text-left font-semibold">Why not unlimited AI?</AccordionTrigger>
                <AccordionContent className="text-muted-foreground leading-relaxed">
                  Real intelligence costs real energy. To sustain a high-quality, ad-free product without selling your data, we set generous but finite fair-use limits.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="item-7" className="border-border">
                <AccordionTrigger className="text-left font-semibold">Does the Annual plan include more?</AccordionTrigger>
                <AccordionContent className="text-muted-foreground leading-relaxed">
                  Yes! Annual members get 2 months free AND a 50% larger AI token allowance (3M tokens/mo) as a thank-you for your commitment.
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>



          <CheckoutModal
            open={checkoutOpen}
            onOpenChange={handleCheckoutClose}
            planId={checkoutPlanId}
            planLabel={checkoutPlanId === 'pro_annual' ? 'Pro Annual' : 'Pro Monthly'}
            userId={user.id}
            onUpgradeActivated={() => {
              setEntitlementsRefreshKey((prev) => prev + 1);
              setUpgradeSuccess(true);
              onUpgradeActivated?.();
            }}
          />
        </div>
      </ScrollArea>
    </div>
  );
};

export default PricingPage;
