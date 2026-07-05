-- Run this in your Supabase SQL Editor to add the email column to profiles

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS email TEXT DEFAULT NULL;
