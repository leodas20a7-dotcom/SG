-- ============================================================
-- FIX PLATFORM ADMIN RLS
-- Run this in your Supabase SQL Editor
-- This ensures that 'platform_admin' bypasses RLS and can count/view 
-- everything across all companies on the platform.
-- ============================================================

DO $$ 
DECLARE
    t_name text;
    tables text[] := ARRAY['guards', 'duty_locations', 'incidents', 'attendance', 'profiles'];
BEGIN
    FOREACH t_name IN ARRAY tables
    LOOP
        -- Drop the policy if it already exists to avoid errors
        EXECUTE format('DROP POLICY IF EXISTS "platform_admin_select_all" ON public.%I', t_name);
        
        -- Create the God Mode policy for SELECT
        EXECUTE format('
            CREATE POLICY "platform_admin_select_all" ON public.%I
            FOR SELECT USING (
                ''platform_admin'' = (SELECT role FROM public.profiles WHERE id = auth.uid())
            )
        ', t_name);
    END LOOP;
END $$;
