-- Run this in your Supabase SQL Editor

CREATE OR REPLACE FUNCTION delete_auth_user(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  calling_role text;
BEGIN
  -- Get the role of the user calling this function
  SELECT role INTO calling_role FROM public.profiles WHERE id = auth.uid();
  
  -- Only allow admins or super_admins to delete users
  IF calling_role IN ('admin', 'super_admin') THEN
    DELETE FROM auth.users WHERE id = target_user_id;
  ELSE
    RAISE EXCEPTION 'Unauthorized: Only admins can delete users';
  END IF;
END;
$$;
