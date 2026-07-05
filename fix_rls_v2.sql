-- Drop ALL existing select policies on profiles to be safe
DROP POLICY IF EXISTS "profiles_isolation" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;

-- Create a clean, non-recursive policy for selecting profiles
CREATE POLICY "profiles_select" ON public.profiles 
FOR SELECT 
USING (auth.role() = 'authenticated');

-- Ensure authenticated users can insert/update if needed
DROP POLICY IF EXISTS "profiles_insert" ON public.profiles;
CREATE POLICY "profiles_insert" ON public.profiles FOR INSERT WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE USING (auth.role() = 'authenticated');
