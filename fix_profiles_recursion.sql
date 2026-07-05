-- Run this in your Supabase SQL Editor to fix the login issue
DROP POLICY IF EXISTS "platform_admin_select_all" ON public.profiles;
