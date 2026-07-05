-- ============================================================
-- CREATE NOTIFICATIONS TABLE
-- Run this in your Supabase SQL Editor
-- ============================================================

-- 1. Create the notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    guard_id UUID REFERENCES public.guards(id) ON DELETE CASCADE,
    user_role TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT DEFAULT 'info',
    is_read BOOLEAN DEFAULT false,
    is_broadcast BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Enable RLS on the table
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- 3. Drop any existing broad policies just in case
DROP POLICY IF EXISTS "notifications_select_all" ON public.notifications;
DROP POLICY IF EXISTS "notifications_insert_all" ON public.notifications;
DROP POLICY IF EXISTS "notifications_update_all" ON public.notifications;
DROP POLICY IF EXISTS "notifications_delete_all" ON public.notifications;
DROP POLICY IF EXISTS "notifications_isolation" ON public.notifications;
DROP POLICY IF EXISTS "notifications_platform_admin" ON public.notifications;

-- 4. Create the isolation policy for regular tenants
-- Guards, Supervisors, and Admins can only see/edit notifications that belong to their company,
-- OR where the company_id is NULL (for global system broadcasts).
CREATE POLICY "notifications_isolation" ON public.notifications 
FOR ALL USING (
  company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  OR company_id IS NULL
  OR public.is_platform_admin()
);
