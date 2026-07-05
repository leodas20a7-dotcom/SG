-- ============================================================
-- DELETE A SINGLE USER BY EMAIL
-- Run this in your Supabase SQL Editor if you ever need to manually free up an email
-- ============================================================

CREATE OR REPLACE FUNCTION public.delete_user_by_email(target_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  target_id UUID;
BEGIN
  -- 1. Verify caller is a super_admin or platform_admin
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role IN ('platform_admin', 'super_admin')
  ) THEN
    RAISE EXCEPTION 'Access denied.';
  END IF;

  -- 2. Find the user ID for that email
  SELECT id INTO target_id FROM auth.users WHERE email = target_email;

  IF target_id IS NOT NULL THEN
    -- 3. Delete from auth.users (cascades to profiles, guards, etc.)
    DELETE FROM auth.users WHERE id = target_id;
  END IF;
END;
$$;
