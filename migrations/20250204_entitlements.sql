-- =============================================================================
-- ENTITLEMENTS, OVERRIDES, SUBSCRIPTIONS, USAGE PERIODS
-- Date: 2025-02-04
-- =============================================================================

-- -----------------------------------------------------------------------------
-- PLAN ENTITLEMENTS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.plan_entitlements (
    plan_id text PRIMARY KEY,
    max_active_goals integer,
    token_hard_cap bigint,
    token_soft_cap bigint,
    calendar_sync_enabled boolean DEFAULT false,
    warning_thresholds jsonb DEFAULT '{"token_warning_50":0.5,"token_warning_80":0.8,"token_warning_100":1.0}'::jsonb,
    throttle_policy jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

DO $$ BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'plan_entitlements'
    ) THEN
        ALTER TABLE public.plan_entitlements
            ADD COLUMN IF NOT EXISTS max_active_goals integer,
            ADD COLUMN IF NOT EXISTS token_hard_cap bigint,
            ADD COLUMN IF NOT EXISTS token_soft_cap bigint,
            ADD COLUMN IF NOT EXISTS calendar_sync_enabled boolean DEFAULT false,
            ADD COLUMN IF NOT EXISTS warning_thresholds jsonb DEFAULT '{"token_warning_50":0.5,"token_warning_80":0.8,"token_warning_100":1.0}'::jsonb,
            ADD COLUMN IF NOT EXISTS throttle_policy jsonb DEFAULT '{}'::jsonb,
            ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
            ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
    END IF;
END $$;

DROP TRIGGER IF EXISTS set_plan_entitlements_updated_at ON public.plan_entitlements;
CREATE TRIGGER set_plan_entitlements_updated_at
    BEFORE UPDATE ON public.plan_entitlements
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Seed rows (upsert)
INSERT INTO public.plan_entitlements
    (plan_id, max_active_goals, token_hard_cap, token_soft_cap, calendar_sync_enabled, warning_thresholds, throttle_policy)
VALUES
    ('free', 1, 100000, NULL, false,
        '{"token_warning_50":0.5,"token_warning_80":0.8,"token_warning_100":1.0}'::jsonb,
        '{"mode":"hard_stop"}'::jsonb),
    ('pro_monthly', NULL, NULL, 2000000, true,
        '{"token_warning_50":0.5,"token_warning_80":0.8,"token_warning_100":1.0}'::jsonb,
        '{"mode":"economy_lane","delay_ms":3000}'::jsonb),
    ('pro_annual', NULL, NULL, 3000000, true,
        '{"token_warning_50":0.5,"token_warning_80":0.8,"token_warning_100":1.0}'::jsonb,
        '{"mode":"economy_lane","delay_ms":3000}'::jsonb),
    ('pro_early', NULL, NULL, 2000000, true,
        '{"token_warning_50":0.5,"token_warning_80":0.8,"token_warning_100":1.0}'::jsonb,
        '{"mode":"economy_lane","delay_ms":3000}'::jsonb),
    -- QA hook (staging/testing): attach via override when needed
    ('staging_free', 1, 1000, 2000, false,
        '{"token_warning_50":0.5,"token_warning_80":0.8,"token_warning_100":1.0}'::jsonb,
        '{"mode":"hard_stop"}'::jsonb)
ON CONFLICT (plan_id) DO UPDATE SET
    max_active_goals = EXCLUDED.max_active_goals,
    token_hard_cap = EXCLUDED.token_hard_cap,
    token_soft_cap = EXCLUDED.token_soft_cap,
    calendar_sync_enabled = EXCLUDED.calendar_sync_enabled,
    warning_thresholds = EXCLUDED.warning_thresholds,
    throttle_policy = EXCLUDED.throttle_policy,
    updated_at = now();

-- -----------------------------------------------------------------------------
-- USER ENTITLEMENT OVERRIDES (EARLY ADOPTERS)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_entitlement_overrides (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    override_plan_id text NOT NULL REFERENCES public.plan_entitlements(plan_id),
    reason text,
    starts_at timestamptz DEFAULT now(),
    ends_at timestamptz,
    created_at timestamptz DEFAULT now(),
    UNIQUE(user_id)
);

DO $$ BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'user_entitlement_overrides'
    ) THEN
        ALTER TABLE public.user_entitlement_overrides
            ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
            ADD COLUMN IF NOT EXISTS override_plan_id text REFERENCES public.plan_entitlements(plan_id),
            ADD COLUMN IF NOT EXISTS reason text,
            ADD COLUMN IF NOT EXISTS starts_at timestamptz DEFAULT now(),
            ADD COLUMN IF NOT EXISTS ends_at timestamptz,
            ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_user_entitlement_overrides_user ON public.user_entitlement_overrides(user_id);
CREATE INDEX IF NOT EXISTS idx_user_entitlement_overrides_reason ON public.user_entitlement_overrides(reason);

-- -----------------------------------------------------------------------------
-- SUBSCRIPTIONS (STRIPE SOURCE OF TRUTH)
-- -----------------------------------------------------------------------------
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'subscriptions'
    ) THEN
        CREATE TABLE public.subscriptions (
            id text PRIMARY KEY,
            user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
            status text NOT NULL,
            price_id text,
            plan_id text REFERENCES public.plan_entitlements(plan_id),
            cancel_at_period_end boolean DEFAULT false,
            current_period_end timestamptz,
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now()
        );
    ELSE
        ALTER TABLE public.subscriptions
            ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
            ADD COLUMN IF NOT EXISTS status text,
            ADD COLUMN IF NOT EXISTS price_id text,
            ADD COLUMN IF NOT EXISTS plan_id text REFERENCES public.plan_entitlements(plan_id),
            ADD COLUMN IF NOT EXISTS cancel_at_period_end boolean DEFAULT false,
            ADD COLUMN IF NOT EXISTS current_period_end timestamptz,
            ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
            ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON public.subscriptions(user_id);

DROP TRIGGER IF EXISTS set_subscriptions_updated_at ON public.subscriptions;
CREATE TRIGGER set_subscriptions_updated_at
    BEFORE UPDATE ON public.subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- -----------------------------------------------------------------------------
-- USAGE PERIODS (TOKEN + GOAL COUNTS)
-- -----------------------------------------------------------------------------
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'user_usage_periods'
    ) THEN
        CREATE TABLE public.user_usage_periods (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
            period_start timestamptz NOT NULL,
            period_end timestamptz NOT NULL,
            token_usage bigint DEFAULT 0,
            active_goal_count integer DEFAULT 0,
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now(),
            UNIQUE(user_id, period_start, period_end)
        );
    ELSE
        ALTER TABLE public.user_usage_periods
            ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
            ADD COLUMN IF NOT EXISTS period_start timestamptz,
            ADD COLUMN IF NOT EXISTS period_end timestamptz,
            ADD COLUMN IF NOT EXISTS token_usage bigint DEFAULT 0,
            ADD COLUMN IF NOT EXISTS active_goal_count integer DEFAULT 0,
            ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
            ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_user_usage_periods_user ON public.user_usage_periods(user_id);

DROP TRIGGER IF EXISTS set_user_usage_periods_updated_at ON public.user_usage_periods;
CREATE TRIGGER set_user_usage_periods_updated_at
    BEFORE UPDATE ON public.user_usage_periods
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- -----------------------------------------------------------------------------
-- EARLY ADOPTER ASSIGNMENT (RACE-SAFE)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user_entitlement()
RETURNS TRIGGER AS $$
DECLARE
    current_count integer;
BEGIN
    -- Ensure only one transaction can assign at a time
    PERFORM pg_advisory_xact_lock(hashtext('early_adopter_assign'));

    SELECT count(*) INTO current_count
    FROM public.user_entitlement_overrides
    WHERE reason = 'early_adopter_100';

    IF current_count < 100 THEN
        INSERT INTO public.user_entitlement_overrides (user_id, override_plan_id, reason)
        VALUES (NEW.id, 'pro_early', 'early_adopter_100')
        ON CONFLICT (user_id) DO NOTHING;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_entitlement_created ON auth.users;
CREATE TRIGGER on_auth_user_entitlement_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user_entitlement();

-- -----------------------------------------------------------------------------
-- RLS POLICIES (READ-ONLY FOR USERS; WRITE VIA SERVICE ROLE)
-- -----------------------------------------------------------------------------
ALTER TABLE public.plan_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_entitlement_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_usage_periods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Plan entitlements are readable" ON public.plan_entitlements;
CREATE POLICY "Plan entitlements are readable"
    ON public.plan_entitlements FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Users can view own entitlement overrides" ON public.user_entitlement_overrides;
CREATE POLICY "Users can view own entitlement overrides"
    ON public.user_entitlement_overrides FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own subscriptions" ON public.subscriptions;
CREATE POLICY "Users can view own subscriptions"
    ON public.subscriptions FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own usage periods" ON public.user_usage_periods;
CREATE POLICY "Users can view own usage periods"
    ON public.user_usage_periods FOR SELECT
    USING (auth.uid() = user_id);
