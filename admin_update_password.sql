-- Enable pgcrypto extension if not already enabled (usually enabled by default in Supabase)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create an RPC function for admins to update user passwords
CREATE OR REPLACE FUNCTION admin_update_user_password(target_user_id UUID, new_password TEXT)
RETURNS void AS $$
BEGIN
  -- Verify the caller is an admin, supervisor, or super_admin
  IF NOT EXISTS (
    SELECT 1 
    FROM public.profiles 
    WHERE id = auth.uid() 
      AND (role = 'admin' OR role = 'super_admin' OR role = 'supervisor' OR role = 'platform_admin')
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Only admins can change user passwords.';
  END IF;

  -- Update the password
  UPDATE auth.users
  SET encrypted_password = crypt(new_password, gen_salt('bf'))
  WHERE id = target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
