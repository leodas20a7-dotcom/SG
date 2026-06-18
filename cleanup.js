import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// Read .env file
const envData = fs.readFileSync('.env', 'utf-8');
const env = {};
envData.split('\n').forEach(line => {
  const [key, ...val] = line.split('=');
  if (key && val) env[key.trim()] = val.join('=').trim();
});

const supabaseUrl = env.VITE_SUPABASE_URL;
const supabaseKey = env.VITE_SUPABASE_ANON_KEY;
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
    .ilike('title', 'Temporary %')
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
}

cleanUp();
