-- Run this in your Supabase SQL Editor

CREATE OR REPLACE FUNCTION clear_non_admin_auth_users()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role text;
  caller_company_id uuid;
BEGIN
  -- Get the role and company of the user calling this function
  SELECT role, company_id INTO caller_role, caller_company_id FROM public.profiles WHERE id = auth.uid();
  
  -- Only allow admins or super_admins to delete users
  IF caller_role IN ('admin', 'super_admin') THEN
    -- Delete users from auth.users ONLY if they belong to the caller's company AND are not admins
    DELETE FROM auth.users 
    WHERE id IN (
      SELECT id FROM public.profiles 
      WHERE company_id = caller_company_id 
      AND role NOT IN ('admin', 'super_admin')
    );
  ELSE
    RAISE EXCEPTION 'Unauthorized: Only admins can perform a full reset';
  END IF;
END;
$$;
