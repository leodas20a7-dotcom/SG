import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envData = fs.readFileSync('.env', 'utf-8');
const env = {};
envData.split('\n').forEach(line => {
  const [key, ...val] = line.split('=');
  if (key && val) env[key.trim()] = val.join('=').trim();
});

const supabaseUrl = env.VITE_SUPABASE_URL;
const supabaseKey = env.VITE_SUPABASE_SERVICE_ROLE_KEY; // Using anon key since we don't have service role
const supabase = createClient(supabaseUrl, env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const { data, error } = await supabase.from('companies').select('*').limit(1);
  if (error) {
    console.error("Error:", error);
  } else {
    console.log("Companies Schema via data:", Object.keys(data[0] || {}));
  }
}
run();
