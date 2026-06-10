-- ============================================================
-- RLS Policies for Safety Guard Management System
-- Run this in Supabase SQL Editor (https://supabase.com/dashboard)
-- ============================================================

-- 1. Enable RLS on all tables
ALTER TABLE guards ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE duty_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE circulars ENABLE ROW LEVEL SECURITY;
ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE live_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_timings ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing policies (safe to re-run)
DO $$ BEGIN
  -- guards
  DROP POLICY IF EXISTS "guards_select" ON guards;
  DROP POLICY IF EXISTS "guards_insert" ON guards;
  DROP POLICY IF EXISTS "guards_update" ON guards;
  DROP POLICY IF EXISTS "guards_delete" ON guards;
  -- profiles
  DROP POLICY IF EXISTS "profiles_select" ON profiles;
  DROP POLICY IF EXISTS "profiles_insert" ON profiles;
  DROP POLICY IF EXISTS "profiles_update" ON profiles;
  -- duty_locations
  DROP POLICY IF EXISTS "duty_locations_select" ON duty_locations;
  DROP POLICY IF EXISTS "duty_locations_insert" ON duty_locations;
  DROP POLICY IF EXISTS "duty_locations_delete" ON duty_locations;
  -- attendance
  DROP POLICY IF EXISTS "attendance_select" ON attendance;
  DROP POLICY IF EXISTS "attendance_insert" ON attendance;
  DROP POLICY IF EXISTS "attendance_update" ON attendance;
  -- attendance_requests
  DROP POLICY IF EXISTS "attendance_requests_select" ON attendance_requests;
  DROP POLICY IF EXISTS "attendance_requests_insert" ON attendance_requests;
  -- circulars
  DROP POLICY IF EXISTS "circulars_select" ON circulars;
  DROP POLICY IF EXISTS "circulars_insert" ON circulars;
  -- incidents
  DROP POLICY IF EXISTS "incidents_select" ON incidents;
  DROP POLICY IF EXISTS "incidents_insert" ON incidents;
  -- live_tracking
  DROP POLICY IF EXISTS "live_tracking_select" ON live_tracking;
  DROP POLICY IF EXISTS "live_tracking_insert" ON live_tracking;
  -- shifts
  DROP POLICY IF EXISTS "shifts_select" ON shifts;
  DROP POLICY IF EXISTS "shifts_insert" ON shifts;
  -- shift_timings
  DROP POLICY IF EXISTS "shift_timings_select" ON shift_timings;
  DROP POLICY IF EXISTS "shift_timings_upsert" ON shift_timings;
END $$;

-- 3. Create policies: Authenticated users have full access

-- guards
CREATE POLICY "guards_select" ON guards FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "guards_insert" ON guards FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "guards_update" ON guards FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "guards_delete" ON guards FOR DELETE USING (auth.role() = 'authenticated');

-- profiles
CREATE POLICY "profiles_select" ON profiles FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "profiles_insert" ON profiles FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "profiles_update" ON profiles FOR UPDATE USING (auth.role() = 'authenticated');

-- duty_locations
CREATE POLICY "duty_locations_select" ON duty_locations FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "duty_locations_insert" ON duty_locations FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "duty_locations_delete" ON duty_locations FOR DELETE USING (auth.role() = 'authenticated');

-- attendance
CREATE POLICY "attendance_select" ON attendance FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "attendance_insert" ON attendance FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "attendance_update" ON attendance FOR UPDATE USING (auth.role() = 'authenticated');

-- attendance_requests
CREATE POLICY "attendance_requests_select" ON attendance_requests FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "attendance_requests_insert" ON attendance_requests FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- circulars
CREATE POLICY "circulars_select" ON circulars FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "circulars_insert" ON circulars FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- incidents
CREATE POLICY "incidents_select" ON incidents FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "incidents_insert" ON incidents FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- live_tracking
CREATE POLICY "live_tracking_select" ON live_tracking FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "live_tracking_insert" ON live_tracking FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- shifts
CREATE POLICY "shifts_select" ON shifts FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "shifts_insert" ON shifts FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- shift_timings
CREATE POLICY "shift_timings_select" ON shift_timings FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "shift_timings_upsert" ON shift_timings FOR INSERT WITH CHECK (auth.role() = 'authenticated');
