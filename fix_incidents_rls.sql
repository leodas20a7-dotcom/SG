-- Fix incidents RLS to allow guards to insert and read their own incident reports
-- Run this in the Supabase SQL Editor

-- Drop and re-create the incidents INSERT policy
DROP POLICY IF EXISTS "incidents_insert" ON incidents;

CREATE POLICY "incidents_insert" ON incidents
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Ensure guards can read incidents
DROP POLICY IF EXISTS "incidents_select" ON incidents;

CREATE POLICY "incidents_select" ON incidents
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Also fix the live_tracking table which guards use during check-in
DROP POLICY IF EXISTS "live_tracking_insert" ON live_tracking;

CREATE POLICY "live_tracking_insert" ON live_tracking
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "live_tracking_select" ON live_tracking;

CREATE POLICY "live_tracking_select" ON live_tracking
  FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "live_tracking_update" ON live_tracking;

CREATE POLICY "live_tracking_update" ON live_tracking
  FOR UPDATE
  USING (auth.role() = 'authenticated');
