const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const envFile = fs.readFileSync('.env', 'utf-8');
const envVars = {};
envFile.split('\n').forEach(line => {
  const [key, val] = line.split('=');
  if (key && val) envVars[key.trim()] = val.trim();
});

const supabaseUrl = envVars['EXPO_PUBLIC_SUPABASE_URL'];
const supabaseKey = envVars['EXPO_PUBLIC_SUPABASE_ANON_KEY'];
const supabase = createClient(supabaseUrl, supabaseKey);

async function signUp() {
  const { data, error } = await supabase.auth.signUp({
    email: 'test@example.com',
    password: 'password123',
  });
  console.log("SignUp Result:", data, error);
}

signUp();
