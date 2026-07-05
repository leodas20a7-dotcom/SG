-- Weekly Shift Scheduling Migration
-- Run this in your Supabase SQL Editor

-- Step 1: Add day_of_week column (0=Mon, 1=Tue, 2=Wed, 3=Thu, 4=Fri, 5=Sat, 6=Sun)
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS day_of_week SMALLINT;

-- Step 2: Add shift_label for display name (e.g. "Morning Shift")
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS shift_label TEXT;

-- Step 3: Update RLS to allow update on shifts (needed for upsert)
DROP POLICY IF EXISTS "shifts_update" ON shifts;
CREATE POLICY "shifts_update" ON shifts
  FOR UPDATE USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "shifts_delete" ON shifts;
CREATE POLICY "shifts_delete" ON shifts
  FOR DELETE USING (auth.role() = 'authenticated');

-- Verify column was added:
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'shifts';
