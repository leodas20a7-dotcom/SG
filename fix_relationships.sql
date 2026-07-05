-- ============================================================
-- FIX GUARDS AND PROFILES RELATIONSHIP
-- Run this in your Supabase SQL Editor
-- ============================================================

-- Ensure the guards table has the correct column and foreign key
ALTER TABLE public.guards ADD COLUMN IF NOT EXISTS auth_user_id UUID;

ALTER TABLE public.guards 
  DROP CONSTRAINT IF EXISTS guards_auth_user_id_profiles_fkey;

ALTER TABLE public.guards
  ADD CONSTRAINT guards_auth_user_id_profiles_fkey 
  FOREIGN KEY (auth_user_id) REFERENCES public.profiles(id) 
  ON DELETE CASCADE;

-- Reload PostgREST Schema Cache
NOTIFY pgrst, 'reload schema';
