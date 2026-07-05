-- create_audit_logs.sql
CREATE TABLE IF NOT EXISTS platform_audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  action_type TEXT NOT NULL,
  description TEXT NOT NULL,
  actor_email TEXT,
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS Policies
ALTER TABLE platform_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_logs_insert"
ON platform_audit_logs FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "audit_logs_select"
ON platform_audit_logs FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'platform_admin'
  )
);
