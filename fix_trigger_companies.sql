-- ============================================================
-- FIX SAAS ONBOARDING TRIGGER FOR SUB-USERS AND GUARDS
-- Run this in your Supabase SQL Editor
-- This ensures that when an admin creates a sub-user OR a guard, 
-- a new company is NOT created. They are added to the admin's existing company.
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_agency_signup()
RETURNS trigger AS $$
DECLARE
  new_company_id UUID;
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
  -- 1. Create a new company (tenant) for this user
  INSERT INTO public.companies (name, contact_email, subscription_status)
  VALUES (split_part(NEW.email, '@', 1) || '''s Security Agency', NEW.email, 'trialing')
  RETURNING id INTO new_company_id;

  -- 2. Create the user profile and link them as the super_admin of the new company
  INSERT INTO public.profiles (id, company_id, name, email, role)
  VALUES (NEW.id, new_company_id, split_part(NEW.email, '@', 1), NEW.email, 'super_admin');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
