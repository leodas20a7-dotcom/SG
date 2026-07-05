-- Drop the bad infinite-recursion policy from saas_setup.sql if it exists
DROP POLICY IF EXISTS "profiles_isolation" ON public.profiles;

-- Ensure authenticated users can read their own profile
CREATE POLICY "profiles_select" ON public.profiles 
FOR SELECT 
USING (auth.uid() = id OR company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

-- Also make sure authenticated users can insert/update if needed
DROP POLICY IF EXISTS "profiles_insert" ON public.profiles;
CREATE POLICY "profiles_insert" ON public.profiles FOR INSERT WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE USING (auth.role() = 'authenticated');
