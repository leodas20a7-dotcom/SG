-- ============================================================
-- FIX GUARDS TABLE COLUMNS
-- Run this in your Supabase SQL Editor
-- ============================================================

-- Add the missing columns to the guards table
ALTER TABLE public.guards 
  ADD COLUMN IF NOT EXISTS site TEXT,
  ADD COLUMN IF NOT EXISTS duty_location_id UUID REFERENCES public.duty_locations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS temp_location_id UUID REFERENCES public.duty_locations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS temp_location_from DATE,
  ADD COLUMN IF NOT EXISTS temp_location_to DATE;

-- Reload Schema Cache
NOTIFY pgrst, 'reload schema';
