-- ============================================================
-- FIX GUARDS AND DUTY LOCATIONS RELATIONSHIP
-- Run this in your Supabase SQL Editor
-- ============================================================

-- 1. Ensure duty_locations table exists
CREATE TABLE IF NOT EXISTS public.duty_locations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  place_name TEXT NOT NULL,
  latitude NUMERIC NOT NULL,
  longitude NUMERIC NOT NULL,
  radius_meters INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Enable RLS on duty_locations
ALTER TABLE public.duty_locations ENABLE ROW LEVEL SECURITY;

-- 3. Ensure guards table has the correct foreign key columns
ALTER TABLE public.guards 
  ADD COLUMN IF NOT EXISTS duty_location_id UUID,
  ADD COLUMN IF NOT EXISTS temp_location_id UUID;

-- 4. Ensure guards table has the correct foreign keys
ALTER TABLE public.guards 
  DROP CONSTRAINT IF EXISTS guards_duty_location_id_fkey,
  DROP CONSTRAINT IF EXISTS guards_temp_location_id_fkey;

ALTER TABLE public.guards
  ADD CONSTRAINT guards_duty_location_id_fkey FOREIGN KEY (duty_location_id) REFERENCES public.duty_locations(id) ON DELETE SET NULL,
  ADD CONSTRAINT guards_temp_location_id_fkey FOREIGN KEY (temp_location_id) REFERENCES public.duty_locations(id) ON DELETE SET NULL;

-- 5. Reload PostgREST Schema Cache (this fixes the API error)
NOTIFY pgrst, 'reload schema';
