-- ============================================================
-- FIX ALL RLS POLICIES DYNAMICALLY
-- Run this in your Supabase SQL Editor
-- ============================================================

DO $$ 
DECLARE
    pol record;
BEGIN
    -- Drop all policies on GUARDS
    FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'guards' AND schemaname = 'public' LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.guards', pol.policyname);
    END LOOP;

    -- Drop all policies on DUTY_LOCATIONS
    FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'duty_locations' AND schemaname = 'public' LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.duty_locations', pol.policyname);
    END LOOP;
END $$;

-- Enable RLS
ALTER TABLE public.guards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.duty_locations ENABLE ROW LEVEL SECURITY;

-- Create Clean Guards Policies
CREATE POLICY "guards_select" ON public.guards 
FOR SELECT USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "guards_insert" ON public.guards 
FOR INSERT WITH CHECK (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "guards_update" ON public.guards 
FOR UPDATE USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "guards_delete" ON public.guards 
FOR DELETE USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

-- Create Clean Duty Locations Policies
CREATE POLICY "duty_locations_select" ON public.duty_locations 
FOR SELECT USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "duty_locations_insert" ON public.duty_locations 
FOR INSERT WITH CHECK (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "duty_locations_update" ON public.duty_locations 
FOR UPDATE USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "duty_locations_delete" ON public.duty_locations 
FOR DELETE USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

-- Reload Schema Cache
NOTIFY pgrst, 'reload schema';
