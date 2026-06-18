import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://bkowndltrknbkrbyfvnx.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrb3duZGx0cmtuYmtyYnlmdm54Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5Nzk3MjIsImV4cCI6MjA5NjU1NTcyMn0.eDfbZqKQgEKkU4pJZirhlWRMeykGoIEZFzxuMW1cO0Q';
const supabase = createClient(supabaseUrl, supabaseKey);

async function cleanUp() {
  console.log("Deleting old auto-circulars...");
  
  // Delete circulars starting with 'Duty Location Update' or 'Temporary'
  const { error: err1, data: d1 } = await supabase.from('circulars')
    .delete()
    .ilike('title', 'Duty Location Update%')
    .select();
  console.log("Deleted circulars:", d1?.length, err1?.message || 'OK');

  const { error: err2, data: d2 } = await supabase.from('circulars')
    .delete()
    .ilike('title', 'Temporary%')
    .select();
  console.log("Deleted temp circulars:", d2?.length, err2?.message || 'OK');

  // Delete matching notifications
  const { error: err3, data: d3 } = await supabase.from('notifications')
    .delete()
    .ilike('message', '%Duty Location Update%')
    .select();
  console.log("Deleted notifications:", d3?.length, err3?.message || 'OK');

  const { error: err4, data: d4 } = await supabase.from('notifications')
    .delete()
    .ilike('message', '%Temporary%')
    .select();
  console.log("Deleted temp notifications:", d4?.length, err4?.message || 'OK');

  const { error: err5, data: d5 } = await supabase.from('circulars')
    .delete()
    .ilike('title', 'New Shift%')
    .select();
  console.log("Deleted shift circulars:", d5?.length, err5?.message || 'OK');

  const { error: err6, data: d6 } = await supabase.from('notifications')
    .delete()
    .ilike('message', '%New Shift%')
    .select();
  console.log("Deleted shift notifications:", d6?.length, err6?.message || 'OK');

  const { error: err7, data: d7 } = await supabase.from('notifications')
    .delete()
    .eq('title', 'New Circular')
    .select();
  console.log("Deleted leftover New Circular notifications:", d7?.length, err7?.message || 'OK');
}

cleanUp();
