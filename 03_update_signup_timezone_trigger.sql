-- ============================================================
-- UPDATE SAAS ONBOARDING TRIGGER (WITH TIMEZONE SUPPORT)
-- Run this in your Supabase SQL Editor
-- This ensures the timezone and company name chosen during signup are saved.
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_agency_signup()
RETURNS trigger AS $$
DECLARE
  new_company_id UUID;
  meta_company_name TEXT;
  meta_timezone TEXT;
BEGIN
  -- If the user was created by an admin (either as a sub_user or a guard)
  IF (NEW.raw_user_meta_data->>'is_sub_user') = 'true' OR (NEW.raw_user_meta_data->>'is_guard') = 'true' THEN
    -- Insert profile directly using the metadata provided by the admin
    INSERT INTO public.profiles (id, company_id, name, email, role)
    VALUES (
      NEW.id, 
      (NEW.raw_user_meta_data->>'company_id')::UUID, 
      COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)), 
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'role', 'guard')
    );
    RETURN NEW;
  END IF;

  -- Normal Sign up (e.g. from the public landing page)
  meta_company_name := COALESCE(NEW.raw_user_meta_data->>'company_name', split_part(NEW.email, '@', 1) || '''s Security Agency');
  meta_timezone := COALESCE(NEW.raw_user_meta_data->>'timezone', 'UTC');

  -- 1. Create a new company (tenant) for this user with their chosen timezone and name
  INSERT INTO public.companies (name, contact_email, subscription_status, timezone)
  VALUES (meta_company_name, NEW.email, 'trialing', meta_timezone)
  RETURNING id INTO new_company_id;

  -- 2. Create the user profile and link them as the super_admin of the new company
  INSERT INTO public.profiles (id, company_id, name, email, role)
  VALUES (NEW.id, new_company_id, split_part(NEW.email, '@', 1), NEW.email, 'super_admin');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
