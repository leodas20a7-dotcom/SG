import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://bkowndltrknbkrbyfvnx.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrb3duZGx0cmtuYmtyYnlmdm54Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5Nzk3MjIsImV4cCI6MjA5NjU1NTcyMn0.eDfbZqKQgEKkU4pJZirhlWRMeykGoIEZFzxuMW1cO0Q';
const supabase = createClient(supabaseUrl, supabaseKey);

async function deleteOldGuard() {
  const authUserId = 'f1f2bb84-3339-4108-b01c-91c3b710d8fe';

  // Find the guard ID associated with this auth_user_id
  const { data: guardData } = await supabase.from('guards').select('id').eq('auth_user_id', authUserId);
  
  if (guardData && guardData.length > 0) {
    for (const g of guardData) {
      const gId = g.id;
      console.log(`Found guard ID ${gId} for auth user. Cleaning up related data...`);
      
      await supabase.from("attendance").delete().eq("guard_id", gId);
      await supabase.from("shifts").delete().eq("guard_id", gId);
      await supabase.from("attendance_requests").delete().eq("guard_id", gId);
      await supabase.from("incidents").delete().eq("guard_id", gId);
      await supabase.from("notifications").delete().eq("guard_id", gId);
      await supabase.from("live_tracking").delete().eq("guard_id", gId);
      await supabase.from("guard_reviews").delete().eq("guard_id", gId);
      
      console.log(`Deleted related data for guard ID ${gId}`);
      
      await supabase.from("guards").delete().eq("id", gId);
      console.log(`Deleted guard record ID ${gId}`);
    }
  } else {
    console.log("No guard record found for this auth user. They might have already been deleted.");
  }

  // Delete the profile
  const { error: profileErr } = await supabase.from('profiles').delete().eq('id', authUserId);
  if (profileErr) {
    console.error("Error deleting profile:", profileErr.message);
  } else {
    console.log(`Deleted profile for ${authUserId}`);
  }

  console.log("Cleanup complete!");
}

deleteOldGuard();
