import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  console.error('CRITICAL: SUPABASE_URL is missing');
}

if (!supabaseServiceKey) {
  console.error('CRITICAL: SUPABASE_SERVICE_ROLE_KEY is missing');
}

// MANDATORY: Use Service Role Key for backend operations to bypass RLS
// Service Role Key bypasses Row Level Security completely
const adminKey = (supabaseServiceKey && supabaseServiceKey.length > 20) ? supabaseServiceKey : null;

if (supabaseUrl && adminKey) {
  console.log('SUPABASE: Initializing with SERVICE_ROLE_KEY (RLS Bypass Mode)');
  console.log('SUPABASE: Key length:', adminKey.length, 'Key starts with:', adminKey.substring(0, 20) + '...');
} else {
  console.error('SUPABASE: CRITICAL - SERVICE_ROLE_KEY is missing or invalid! Backend operations WILL FAIL.');
}

// Create admin client with proper configuration to bypass RLS
// The db.schema option and auth configuration are critical for service role access
export const supabaseAdmin = supabaseUrl && adminKey
  ? createClient(supabaseUrl, adminKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false
      },
      db: {
        schema: 'public'
      }
    })
  : null;

export const isSupabaseConfigured = () => !!supabaseAdmin;
