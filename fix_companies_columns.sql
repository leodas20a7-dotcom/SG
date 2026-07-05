-- ============================================================
-- FIX COMPANIES TABLE STRUCTURE
-- Run this in your Supabase SQL Editor
-- ============================================================

-- Add the missing billing columns to the companies table
ALTER TABLE public.companies 
ADD COLUMN IF NOT EXISTS purchased_seats INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ;

-- Reload Schema Cache
NOTIFY pgrst, 'reload schema';
