-- ============================================================
-- MULTI-TENANT SaaS SCHEMA FOR SECURESYS
-- Run this in your NEW Supabase Project's SQL Editor
-- ============================================================

-- 1. Create Companies (Tenants) Table
CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  eway_customer_id TEXT,
  subscription_status TEXT DEFAULT 'trialing',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create User Profiles (Linked to auth.users and companies)
CREATE TABLE profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT CHECK (role IN ('super_admin', 'admin', 'supervisor', 'guard')) DEFAULT 'admin',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Create Guards Table
CREATE TABLE guards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT,
  status TEXT DEFAULT 'active',
  doc_security_licence TEXT,
  doc_driving_licence TEXT,
  doc_certificates TEXT,
  profile_picture TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Create Duty Locations Table
CREATE TABLE duty_locations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  place_name TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  radius_meters INTEGER DEFAULT 100,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Create Attendance Table
CREATE TABLE attendance (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  guard_id UUID REFERENCES guards(id) ON DELETE CASCADE NOT NULL,
  duty_location_id UUID REFERENCES duty_locations(id),
  check_in_time TIMESTAMPTZ NOT NULL,
  check_out_time TIMESTAMPTZ,
  status TEXT,
  check_in_photo TEXT,
  check_out_photo TEXT,
  check_in_lat DOUBLE PRECISION,
  check_in_long DOUBLE PRECISION,
  check_out_lat DOUBLE PRECISION,
  check_out_long DOUBLE PRECISION
);

-- 6. Create Incidents Table
CREATE TABLE incidents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  guard_id UUID REFERENCES guards(id) ON DELETE CASCADE NOT NULL,
  incident_type TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  audio_url TEXT,
  incident_status TEXT DEFAULT 'Open',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Create Shifts Table
CREATE TABLE shifts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  guard_id UUID REFERENCES guards(id) ON DELETE CASCADE NOT NULL,
  shift_date DATE,
  start_time TIME,
  end_time TIME,
  duty_location_id UUID REFERENCES duty_locations(id)
);

-- 8. Create Live Tracking Table
CREATE TABLE live_tracking (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  guard_id UUID REFERENCES guards(id) ON DELETE CASCADE NOT NULL,
  attendance_id UUID REFERENCES attendance(id) ON DELETE CASCADE,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. Create Attendance Requests Table
CREATE TABLE attendance_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  guard_id UUID REFERENCES guards(id) ON DELETE CASCADE NOT NULL,
  request_type TEXT NOT NULL,
  message TEXT,
  audio_url TEXT,
  status TEXT DEFAULT 'Pending',
  start_date DATE,
  end_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. Create Circulars Table
CREATE TABLE circulars (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);


-- ============================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- Ensures Company A cannot see Company B's data
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE guards ENABLE ROW LEVEL SECURITY;
ALTER TABLE duty_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE live_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE circulars ENABLE ROW LEVEL SECURITY;


-- 1. Profiles: Users can only see profiles in their own company
CREATE POLICY "profiles_isolation" ON profiles 
FOR ALL USING (
  company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
);

-- 2. Guards: Users can only see/edit guards in their own company
CREATE POLICY "guards_isolation" ON guards 
FOR ALL USING (
  company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
);

-- 3. Duty Locations: Isolated by company
CREATE POLICY "duty_locations_isolation" ON duty_locations 
FOR ALL USING (
  company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
);

-- 4. Attendance: Isolated by company
CREATE POLICY "attendance_isolation" ON attendance 
FOR ALL USING (
  company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
);

-- 5. Incidents: Isolated by company
CREATE POLICY "incidents_isolation" ON incidents 
FOR ALL USING (
  company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
);

-- 6. Shifts: Isolated by company
CREATE POLICY "shifts_isolation" ON shifts 
FOR ALL USING (
  company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
);

-- 7. Live Tracking: Isolated by company
CREATE POLICY "live_tracking_isolation" ON live_tracking 
FOR ALL USING (
  company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
);

-- 8. Attendance Requests: Isolated by company
CREATE POLICY "attendance_requests_isolation" ON attendance_requests 
FOR ALL USING (
  company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
);

-- 9. Circulars: Isolated by company
CREATE POLICY "circulars_isolation" ON circulars 
FOR ALL USING (
  company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
);

-- ============================================================
-- STORAGE BUCKET POLICIES
-- Run these AFTER creating the buckets manually in the dashboard
-- ============================================================
CREATE POLICY "Allow public select on guard-photos" ON storage.objects FOR SELECT USING (bucket_id = 'guard-photos');
CREATE POLICY "Allow public insert on guard-photos" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'guard-photos');
CREATE POLICY "Allow public delete on guard-photos" ON storage.objects FOR DELETE USING (bucket_id = 'guard-photos');

CREATE POLICY "Allow public select on voice-requests" ON storage.objects FOR SELECT USING (bucket_id = 'voice-requests');
CREATE POLICY "Allow public insert on voice-requests" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'voice-requests');
CREATE POLICY "Allow public delete on voice-requests" ON storage.objects FOR DELETE USING (bucket_id = 'voice-requests');

CREATE POLICY "Allow public select on guard-documents" ON storage.objects FOR SELECT USING (bucket_id = 'guard-documents');
CREATE POLICY "Allow public insert on guard-documents" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'guard-documents');
CREATE POLICY "Allow public delete on guard-documents" ON storage.objects FOR DELETE USING (bucket_id = 'guard-documents');
