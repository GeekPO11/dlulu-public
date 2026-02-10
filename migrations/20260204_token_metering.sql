-- =============================================================================
-- TOKEN METERING PIPELINE
-- Date: 2026-02-04
-- =============================================================================

-- -----------------------------------------------------------------------------
-- USER USAGE PERIODS (ADD TOKEN COUNTERS)
-- -----------------------------------------------------------------------------
ALTER TABLE public.user_usage_periods
  ADD COLUMN IF NOT EXISTS tokens_input_used bigint DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tokens_output_used bigint DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tokens_total_used bigint DEFAULT 0,
  ADD COLUMN IF NOT EXISTS token_usage bigint DEFAULT 0;

-- -----------------------------------------------------------------------------
-- USAGE EVENTS (IDEMPOTENCY)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.usage_events (
  event_id text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_start timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_usage_events_user_period
  ON public.usage_events(user_id, period_start);

-- -----------------------------------------------------------------------------
-- PERFORMANCE INDEXES
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_chat_messages_user_created
  ON public.chat_messages(user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_user_usage_periods_user_period
  ON public.user_usage_periods(user_id, period_start);

-- -----------------------------------------------------------------------------
-- FUNCTIONS (SECURITY DEFINER) FOR METERING
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ensure_usage_period(
  p_user_id uuid,
  p_period_start timestamptz,
  p_period_end timestamptz
)
RETURNS void AS $$
BEGIN
  INSERT INTO public.user_usage_periods (
    user_id,
    period_start,
    period_end,
    tokens_input_used,
    tokens_output_used,
    tokens_total_used,
    token_usage,
    created_at,
    updated_at
  ) VALUES (
    p_user_id,
    p_period_start,
    p_period_end,
    0,
    0,
    0,
    0,
    now(),
    now()
  )
  ON CONFLICT (user_id, period_start, period_end) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.increment_usage_period(
  p_user_id uuid,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_tokens_input bigint,
  p_tokens_output bigint
)
RETURNS void AS $$
BEGIN
  INSERT INTO public.user_usage_periods (
    user_id,
    period_start,
    period_end,
    tokens_input_used,
    tokens_output_used,
    tokens_total_used,
    token_usage,
    created_at,
    updated_at
  ) VALUES (
    p_user_id,
    p_period_start,
    p_period_end,
    COALESCE(p_tokens_input, 0),
    COALESCE(p_tokens_output, 0),
    COALESCE(p_tokens_input, 0) + COALESCE(p_tokens_output, 0),
    COALESCE(p_tokens_input, 0) + COALESCE(p_tokens_output, 0),
    now(),
    now()
  )
  ON CONFLICT (user_id, period_start, period_end) DO UPDATE SET
    tokens_input_used = COALESCE(public.user_usage_periods.tokens_input_used, 0) + COALESCE(p_tokens_input, 0),
    tokens_output_used = COALESCE(public.user_usage_periods.tokens_output_used, 0) + COALESCE(p_tokens_output, 0),
    tokens_total_used = COALESCE(public.user_usage_periods.tokens_total_used, 0) + COALESCE(p_tokens_input, 0) + COALESCE(p_tokens_output, 0),
    token_usage = COALESCE(public.user_usage_periods.token_usage, 0) + COALESCE(p_tokens_input, 0) + COALESCE(p_tokens_output, 0),
    updated_at = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.compute_token_usage(
  p_user_id uuid,
  p_period_start timestamptz,
  p_period_end timestamptz
)
RETURNS TABLE(tokens_input bigint, tokens_output bigint) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(sum(tokens_input), 0)::bigint AS tokens_input,
    COALESCE(sum(tokens_output), 0)::bigint AS tokens_output
  FROM public.chat_messages
  WHERE user_id = p_user_id
    AND created_at >= p_period_start
    AND created_at < p_period_end;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.record_usage_event(
  p_event_id text,
  p_user_id uuid,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_tokens_input bigint,
  p_tokens_output bigint
)
RETURNS boolean AS $$
DECLARE
  rows_affected integer;
  inserted boolean := false;
BEGIN
  INSERT INTO public.usage_events (event_id, user_id, period_start)
  VALUES (p_event_id, p_user_id, p_period_start)
  ON CONFLICT (event_id) DO NOTHING;

  GET DIAGNOSTICS rows_affected = ROW_COUNT;
  inserted := rows_affected > 0;

  IF inserted THEN
    PERFORM public.increment_usage_period(
      p_user_id,
      p_period_start,
      p_period_end,
      p_tokens_input,
      p_tokens_output
    );
  END IF;

  RETURN inserted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

