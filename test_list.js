import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envData = fs.readFileSync('.env', 'utf-8');
const env = {};
envData.split('\n').forEach(line => {
  const [key, ...val] = line.split('=');
  if (key && val) env[key.trim()] = val.join('=').trim();
});

const supabaseUrl = env.VITE_SUPABASE_URL;
const supabaseKey = env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  await supabase.storage.from("guard-photos").upload("dummy.txt", "dummy content");
  const { data: files } = await supabase.storage.from("guard-photos").list("", { limit: 5 });
  console.log(JSON.stringify(files, null, 2));
}
run();
