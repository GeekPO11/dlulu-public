-- ===============================================================
-- CHECK DEBUG LOGS & SUBSCRIPTIONS
-- ===============================================================

-- 1. Check for the specific Webhook Logs (The function writes to this table)
SELECT * 
FROM debug_logs 
ORDER BY created_at DESC 
LIMIT 20;

-- 2. Check Subscriptions Table (In case it was inserted but you missed it)
SELECT * 
FROM subscriptions 
ORDER BY created_at DESC 
LIMIT 5;

-- 3. Check if table 'debug_logs' even exists (by selecting from information_schema)
-- If this returns empty, the table doesn't exist.
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name = 'debug_logs';
