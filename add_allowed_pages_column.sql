-- Run this in your Supabase SQL Editor to add the allowed_pages column

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS allowed_pages JSONB DEFAULT NULL;
