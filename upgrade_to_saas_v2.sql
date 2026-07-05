-- ============================================================
-- SAAS MULTI-TENANT UPGRADE SCRIPT
-- Run this in your Supabase SQL Editor to upgrade the existing schema
-- ============================================================

-- 1. Update the 'profiles' role check constraint to include 'platform_admin'
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('platform_admin', 'super_admin', 'admin', 'supervisor', 'guard'));

-- 2. Create Subscriptions Table for eWay
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  eway_token_customer_id TEXT,
  status TEXT DEFAULT 'active',
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Create Billing History Table
CREATE TABLE IF NOT EXISTS public.billing_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT DEFAULT 'AUD',
  status TEXT DEFAULT 'paid',
  invoice_url TEXT,
  paid_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on new tables
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_history ENABLE ROW LEVEL SECURITY;

-- 4. Create a helper function to identify Platform Admins
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'platform_admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Add universal RLS policies so Platform Admins can see/manage EVERYTHING
-- We simply use FOR ALL to give full CRUD access to platform admins on every table

CREATE POLICY "platform_admin_all" ON public.companies FOR ALL USING (public.is_platform_admin());
CREATE POLICY "platform_admin_all" ON public.profiles FOR ALL USING (public.is_platform_admin());
CREATE POLICY "platform_admin_all" ON public.guards FOR ALL USING (public.is_platform_admin());
CREATE POLICY "platform_admin_all" ON public.duty_locations FOR ALL USING (public.is_platform_admin());
CREATE POLICY "platform_admin_all" ON public.attendance FOR ALL USING (public.is_platform_admin());
CREATE POLICY "platform_admin_all" ON public.incidents FOR ALL USING (public.is_platform_admin());
CREATE POLICY "platform_admin_all" ON public.shifts FOR ALL USING (public.is_platform_admin());
CREATE POLICY "platform_admin_all" ON public.live_tracking FOR ALL USING (public.is_platform_admin());
CREATE POLICY "platform_admin_all" ON public.attendance_requests FOR ALL USING (public.is_platform_admin());
CREATE POLICY "platform_admin_all" ON public.circulars FOR ALL USING (public.is_platform_admin());
CREATE POLICY "platform_admin_all" ON public.subscriptions FOR ALL USING (public.is_platform_admin());
CREATE POLICY "platform_admin_all" ON public.billing_history FOR ALL USING (public.is_platform_admin());

-- Also add basic RLS for companies so authenticated users can read their own company
DROP POLICY IF EXISTS "company_select" ON public.companies;
CREATE POLICY "company_select" ON public.companies FOR SELECT USING (
  id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
);

-- Allow companies to view their own billing history and subscriptions
CREATE POLICY "subscriptions_isolation" ON public.subscriptions FOR SELECT USING (
  company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
);
CREATE POLICY "billing_history_isolation" ON public.billing_history FOR SELECT USING (
  company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
);

-- Ensure profiles is fully accessible by authenticated users (as per fix_rls_v2.sql)
-- (We assume fix_rls_v2.sql is already run)
