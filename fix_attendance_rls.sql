-- Fix attendance RLS to allow guards to insert their own attendance records
-- Run this in the Supabase SQL Editor

-- Drop and re-create the attendance INSERT policy to allow authenticated guards
DROP POLICY IF EXISTS "attendance_insert" ON attendance;

-- Allow any authenticated user to insert attendance records
-- (guards, admins, supervisors)
CREATE POLICY "attendance_insert" ON attendance
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Also ensure guards can update their own attendance (for check-out)
DROP POLICY IF EXISTS "attendance_update" ON attendance;

CREATE POLICY "attendance_update" ON attendance
  FOR UPDATE
  USING (auth.role() = 'authenticated');

-- Also ensure guards can read their own attendance
DROP POLICY IF EXISTS "attendance_select" ON attendance;

CREATE POLICY "attendance_select" ON attendance
  FOR SELECT
  USING (auth.role() = 'authenticated');
