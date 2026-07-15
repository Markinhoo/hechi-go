import { supabase } from '../lib/supabaseClient';

export const db = supabase.schema('hechi');
export { supabase };
