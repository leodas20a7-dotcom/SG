-- ============================================================
-- DELETE COMPANY & ALL USERS RPC
-- Run this in your Supabase SQL Editor
-- This completely wipes a company AND deletes all their logins (auth.users).
-- ============================================================

CREATE OR REPLACE FUNCTION public.delete_company_and_users(target_company_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER -- Runs as database admin to bypass RLS and delete from auth.users
AS $$
DECLARE
  caller_role text;
  user_rec record;
BEGIN
  -- 1. Verify the person calling this is the Platform Admin
  SELECT role INTO caller_role FROM public.profiles WHERE id = auth.uid();
  IF caller_role != 'platform_admin' THEN
    RAISE EXCEPTION 'Access denied. Only Platform Admins can delete companies.';
  END IF;

  -- 2. Find all user accounts associated with this company and delete them
  -- Deleting from auth.users will automatically cascade and delete their public.profiles
  FOR user_rec IN 
    SELECT id FROM public.profiles WHERE company_id = target_company_id
  LOOP
    DELETE FROM auth.users WHERE id = user_rec.id;
  END LOOP;

  -- 3. Delete the company
  -- This will automatically cascade and delete all guards, locations, incidents, etc.
  -- because of the ON DELETE CASCADE constraints set on those tables.
  DELETE FROM public.companies WHERE id = target_company_id;

END;
$$;
