-- Run this script in your Supabase SQL Editor to manually create the missing profile and company
-- for your existing codearcade@gmail.com account.

DO $$
DECLARE
  new_company_id UUID;
  target_user_id UUID := '0aa26591-b0b4-43bf-93ab-7fb6e0210493';
  target_email TEXT := 'codearcade@gmail.com';
BEGIN
  -- Check if the user exists in auth.users
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = target_user_id) THEN
    RAISE NOTICE 'User does not exist in auth.users. Please sign up first.';
    RETURN;
  END IF;

  -- Check if profile already exists
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = target_user_id) THEN
    RAISE NOTICE 'Profile already exists for this user.';
    RETURN;
  END IF;

  -- 1. Create the company
  INSERT INTO public.companies (name, contact_email, subscription_status)
  VALUES ('Codearcade Security Agency', target_email, 'trialing')
  RETURNING id INTO new_company_id;

  -- 2. Create the profile
  INSERT INTO public.profiles (id, company_id, name, role)
  VALUES (target_user_id, new_company_id, 'Codearcade Admin', 'super_admin');

  RAISE NOTICE 'Successfully created company and profile for the user!';
END $$;
