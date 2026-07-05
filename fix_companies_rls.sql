-- ============================================================
-- FIX COMPANIES RLS POLICIES
-- Run this in your Supabase SQL Editor
-- ============================================================

-- 1. Everyone in the company should be able to view their company details
DROP POLICY IF EXISTS "companies_select" ON public.companies;
CREATE POLICY "companies_select" ON public.companies 
FOR SELECT USING (
  id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
);

-- 2. Super Admins and Admins should be able to update their company details (like billing)
DROP POLICY IF EXISTS "companies_update" ON public.companies;
CREATE POLICY "companies_update" ON public.companies 
FOR UPDATE USING (
  id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  AND (
    LOWER((SELECT role FROM public.profiles WHERE id = auth.uid())) IN ('super_admin', 'admin')
  )
);

-- Reload Schema Cache
NOTIFY pgrst, 'reload schema';
