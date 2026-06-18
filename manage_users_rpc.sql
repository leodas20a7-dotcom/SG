-- ============================================================
-- SQL Script to Create Admin User Management RPC Function
-- Run this in your Supabase SQL Editor (https://supabase.com/dashboard)
-- ============================================================

-- Create the admin_manage_user function to create, update, and delete login credentials
CREATE OR REPLACE FUNCTION public.admin_manage_user(
  p_action text, -- 'create', 'update', or 'delete'
  p_user_id uuid DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_password text DEFAULT NULL,
  p_full_name text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER -- Runs with database owner privileges
AS $$
DECLARE
  v_user_id uuid;
  v_encrypted_pw text;
BEGIN
  -- Verify the caller is an authenticated admin
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RETURN json_build_object('success', false, 'message', 'Unauthorized: Only admins can manage credentials');
  END IF;

  IF p_action = 'create' THEN
    IF p_email IS NULL OR p_password IS NULL THEN
      RETURN json_build_object('success', false, 'message', 'Email and password are required for creation');
    END IF;

    -- Check if email already exists in auth.users
    SELECT id INTO v_user_id FROM auth.users WHERE email = p_email;
    IF v_user_id IS NOT NULL THEN
      RETURN json_build_object('success', false, 'message', 'User already exists');
    END IF;

    -- Generate a new UUID for the user
    v_user_id := gen_random_uuid();
    -- Hash the password using pgcrypto's crypt
    v_encrypted_pw := crypt(p_password, gen_salt('bf', 10));

    -- Create user in auth.users
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password, 
      email_confirmed_at, recovery_sent_at, last_sign_in_at, 
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at, 
      confirmation_token, email_change, email_change_token_new, recovery_token
    )
    VALUES (
      '00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated', 'authenticated', p_email, v_encrypted_pw,
      now(), null, null,
      jsonb_build_object('provider', 'email', 'providers', array['email']),
      jsonb_build_object('email', p_email, 'email_verified', true, 'phone_verified', false),
      now(), now(),
      '', '', '', ''
    );

    -- Create user profile
    INSERT INTO public.profiles (id, email, role, full_name, created_at)
    VALUES (v_user_id, p_email, 'guard', p_full_name, now())
    ON CONFLICT (id) DO UPDATE 
    SET email = p_email, full_name = p_full_name;

    RETURN json_build_object('success', true, 'user_id', v_user_id);

  ELSIF p_action = 'update' THEN
    IF p_user_id IS NULL THEN
      RETURN json_build_object('success', false, 'message', 'User ID is required for update');
    END IF;

    -- Update auth.users credentials
    IF p_email IS NOT NULL AND p_password IS NOT NULL AND p_password <> '' THEN
      v_encrypted_pw := crypt(p_password, gen_salt('bf', 10));
      UPDATE auth.users
      SET email = p_email,
          encrypted_password = v_encrypted_pw,
          raw_user_meta_data = jsonb_build_object('email', p_email, 'email_verified', true, 'phone_verified', false),
          email_confirmed_at = COALESCE(email_confirmed_at, now()),
          updated_at = now()
      WHERE id = p_user_id;
    ELSIF p_email IS NOT NULL THEN
      UPDATE auth.users
      SET email = p_email,
          raw_user_meta_data = jsonb_build_object('email', p_email, 'email_verified', true, 'phone_verified', false),
          updated_at = now()
      WHERE id = p_user_id;
    ELSIF p_password IS NOT NULL AND p_password <> '' THEN
      v_encrypted_pw := crypt(p_password, gen_salt('bf', 10));
      UPDATE auth.users
      SET encrypted_password = v_encrypted_pw,
          updated_at = now()
      WHERE id = p_user_id;
    END IF;

    -- Update public.profiles
    UPDATE public.profiles
    SET email = COALESCE(p_email, email),
        full_name = COALESCE(p_full_name, full_name)
    WHERE id = p_user_id;

    RETURN json_build_object('success', true);

  ELSIF p_action = 'delete' THEN
    IF p_user_id IS NULL THEN
      RETURN json_build_object('success', false, 'message', 'User ID is required for delete');
    END IF;

    -- Delete profile
    DELETE FROM public.profiles WHERE id = p_user_id;
    -- Delete auth user
    DELETE FROM auth.users WHERE id = p_user_id;

    RETURN json_build_object('success', true);
  ELSE
    RETURN json_build_object('success', false, 'message', 'Invalid action');
  END IF;
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'message', SQLERRM);
END;
$$;
