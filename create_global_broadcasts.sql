-- ============================================================
-- GLOBAL BROADCASTS TABLE
-- Run this in your Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS public.global_broadcasts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  message TEXT NOT NULL,
  type TEXT CHECK (type IN ('info', 'warning', 'critical')) DEFAULT 'info',
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.global_broadcasts ENABLE ROW LEVEL SECURITY;

-- 1. Everyone can read active broadcasts
DROP POLICY IF EXISTS "broadcasts_select_all" ON public.global_broadcasts;
CREATE POLICY "broadcasts_select_all" ON public.global_broadcasts 
FOR SELECT USING (active = true);

-- 1b. Platform admins can read ALL broadcasts (active and inactive)
DROP POLICY IF EXISTS "broadcasts_select_admin" ON public.global_broadcasts;
CREATE POLICY "broadcasts_select_admin" ON public.global_broadcasts 
FOR SELECT USING (
  'platform_admin' = (SELECT role FROM public.profiles WHERE id = auth.uid())
);

-- 2. Only platform_admin can insert or update broadcasts
-- (Assuming they have role='platform_admin' in profiles)
DROP POLICY IF EXISTS "broadcasts_insert_admin" ON public.global_broadcasts;
CREATE POLICY "broadcasts_insert_admin" ON public.global_broadcasts 
FOR INSERT WITH CHECK (
  'platform_admin' = (SELECT role FROM public.profiles WHERE id = auth.uid())
);

DROP POLICY IF EXISTS "broadcasts_update_admin" ON public.global_broadcasts;
CREATE POLICY "broadcasts_update_admin" ON public.global_broadcasts 
FOR UPDATE USING (
  'platform_admin' = (SELECT role FROM public.profiles WHERE id = auth.uid())
);

DROP POLICY IF EXISTS "broadcasts_delete_admin" ON public.global_broadcasts;
CREATE POLICY "broadcasts_delete_admin" ON public.global_broadcasts 
FOR DELETE USING (
  'platform_admin' = (SELECT role FROM public.profiles WHERE id = auth.uid())
);
