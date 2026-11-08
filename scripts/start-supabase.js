import { loadSupabaseEnv } from './supabase-env.js';
loadSupabaseEnv();
process.env.DATABASE_DRIVER='supabase';
await import('../server/index.js');
