-- ============================================================
-- SAAS ONBOARDING TRIGGER
-- Run this in your Supabase SQL Editor
-- This automatically creates a company and profile when a new user signs up.
-- ============================================================

-- Create a function to handle new user signups
CREATE OR REPLACE FUNCTION public.handle_new_agency_signup()
RETURNS trigger AS $$
DECLARE
  new_company_id UUID;
BEGIN
  -- 1. Create a new company (tenant) for this user
  -- We use the email prefix as a placeholder name until they change it
  INSERT INTO public.companies (name, contact_email, subscription_status)
  VALUES (split_part(NEW.email, '@', 1) || '''s Security Agency', NEW.email, 'trialing')
  RETURNING id INTO new_company_id;

  -- 2. Create the user profile and link them as the super_admin of the new company
  INSERT INTO public.profiles (id, company_id, name, role)
  VALUES (NEW.id, new_company_id, split_part(NEW.email, '@', 1), 'super_admin');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create the trigger that fires every time a user signs up
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_agency_signup();
