-- Update the handle_new_agency_signup function to check for sub-users
CREATE OR REPLACE FUNCTION public.handle_new_agency_signup()
RETURNS trigger AS $$
DECLARE
  new_company_id UUID;
BEGIN
  -- If the user was created by an admin (is_sub_user is true), skip creating a new company
  IF (NEW.raw_user_meta_data->>'is_sub_user') = 'true' THEN
    RETURN NEW;
  END IF;

  -- 1. Create a new company (tenant) for this user
  INSERT INTO public.companies (name, contact_email, subscription_status)
  VALUES (split_part(NEW.email, '@', 1) || '''s Security Agency', NEW.email, 'trialing')
  RETURNING id INTO new_company_id;

  -- 2. Create the user profile and link them as the super_admin of the new company
  INSERT INTO public.profiles (id, company_id, name, role)
  VALUES (NEW.id, new_company_id, split_part(NEW.email, '@', 1), 'super_admin');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
