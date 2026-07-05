-- ============================================================
-- PRE-PAID BILLING UPGRADE SCRIPT
-- Run this in your Supabase SQL Editor
-- ============================================================

-- 1. Add purchased_seats and current_period_end to companies table
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS purchased_seats INTEGER DEFAULT 0;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ;

-- 2. Give 1 free seat and 14-days free trial to all existing active companies as a courtesy upgrade
UPDATE public.companies 
SET 
  purchased_seats = 1,
  current_period_end = NOW() + INTERVAL '14 days'
WHERE purchased_seats = 0;
