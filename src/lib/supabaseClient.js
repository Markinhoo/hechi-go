import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
const missingSupabaseConfig = !supabaseUrl || !supabaseAnonKey;

if (missingSupabaseConfig) {
  console.warn('Faltan VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.');
}

const offlineError = {
  message: 'Configura VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en .env para usar Supabase.'
};

const offlineSupabase = {
  auth: {
    signInWithPassword: async () => ({ data: null, error: offlineError }),
    signOut: async () => ({ error: null }),
    getUser: async () => ({ data: { user: null }, error: offlineError })
  },
  schema: () => ({
    rpc: async () => ({ data: null, error: offlineError })
  })
};

export const supabase = missingSupabaseConfig ? offlineSupabase : createClient(supabaseUrl, supabaseAnonKey);
