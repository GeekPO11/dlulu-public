-- =============================================================================
-- DIAGNOSTIC SCRIPT: Check Payment & Webhook Status
-- Run this in the Supabase SQL Editor
-- =============================================================================

-- 1. Check if the "debug_logs" table exists and has entries
-- This tells us if the Webhook is even being hit or erroring
SELECT 
    id, 
    created_at, 
    message, 
    details 
FROM public.debug_logs 
ORDER BY created_at DESC 
LIMIT 10;

-- 2. Check the most recent subscriptions (ignoring RLS for you as admin)
SELECT 
    id, 
    user_id, 
    status, 
    plan_id, 
    price_id, 
    created_at, 
    updated_at
FROM public.subscriptions
ORDER BY updated_at DESC
LIMIT 5;

-- 3. Check your user's profile plan status
-- Replace 'YOUR_EMAIL_HERE' with your email if you want to filter specifically
SELECT 
    id, 
    email, 
    plan_tier, 
    subscription_status, 
    stripe_customer_id 
FROM public.profiles
ORDER BY updated_at DESC
LIMIT 5;
