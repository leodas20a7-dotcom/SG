-- ============================================================
-- FIX GUARDS RLS POLICIES
-- Run this in your Supabase SQL Editor
-- ============================================================

-- 1. Disable RLS temporarily to drop all policies cleanly
ALTER TABLE public.guards DISABLE ROW LEVEL SECURITY;

-- 2. Drop ANY possible existing policies that might contain the bad 'profiles.email' logic
DROP POLICY IF EXISTS "Enable read access for all users" ON public.guards;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.guards;
DROP POLICY IF EXISTS "Enable update for users based on email" ON public.guards;
DROP POLICY IF EXISTS "Enable delete for users based on user_id" ON public.guards;
DROP POLICY IF EXISTS "guards_isolation" ON public.guards;
DROP POLICY IF EXISTS "guards_select" ON public.guards;
DROP POLICY IF EXISTS "guards_insert" ON public.guards;
DROP POLICY IF EXISTS "guards_update" ON public.guards;
DROP POLICY IF EXISTS "guards_delete" ON public.guards;

-- 3. Re-enable RLS
ALTER TABLE public.guards ENABLE ROW LEVEL SECURITY;

-- 4. Create new, clean company-isolated policies
CREATE POLICY "guards_select" ON public.guards 
FOR SELECT USING (
  company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
);

CREATE POLICY "guards_insert" ON public.guards 
FOR INSERT WITH CHECK (
  company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
);

CREATE POLICY "guards_update" ON public.guards 
FOR UPDATE USING (
  company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
);

CREATE POLICY "guards_delete" ON public.guards 
FOR DELETE USING (
  company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
);

-- 5. Reload Schema Cache
NOTIFY pgrst, 'reload schema';
