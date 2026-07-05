-- ============================================================
-- FIX SAAS ONBOARDING TRIGGER
-- Run this in your Supabase SQL Editor
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_agency_signup()
RETURNS trigger AS $$
DECLARE
  new_company_id UUID;
  is_guard BOOLEAN;
  passed_company_id UUID;
BEGIN
  -- Check if this user is a guard being created by an admin
  is_guard := (NEW.raw_user_meta_data->>'is_guard')::boolean;
  passed_company_id := (NEW.raw_user_meta_data->>'company_id')::uuid;

  IF is_guard = true AND passed_company_id IS NOT NULL THEN
    -- This is a guard. DO NOT create a new company.
    -- Just create their profile and link them to the existing company.
    INSERT INTO public.profiles (id, company_id, name, role)
    VALUES (NEW.id, passed_company_id, split_part(NEW.email, '@', 1), 'guard');
    
    RETURN NEW;
  END IF;

  -- 1. Create a new company (tenant) for this user (Agency Signup)
  INSERT INTO public.companies (name, contact_email, subscription_status)
  VALUES (split_part(NEW.email, '@', 1) || '''s Security Agency', NEW.email, 'trialing')
  RETURNING id INTO new_company_id;

  -- 2. Create the user profile and link them as the super_admin of the new company
  INSERT INTO public.profiles (id, company_id, name, role)
  VALUES (NEW.id, new_company_id, split_part(NEW.email, '@', 1), 'super_admin');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
