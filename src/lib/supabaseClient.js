import { createClient } from '@supabase/supabase-js'
import { supabaseUrl, supabaseKey } from './env.js'

export const supabase = createClient(supabaseUrl, supabaseKey)
