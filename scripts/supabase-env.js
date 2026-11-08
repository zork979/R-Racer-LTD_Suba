import dotenv from 'dotenv';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { config, root } from '../server/config.js';

export function loadSupabaseEnv() {
  const index = process.argv.indexOf('--env');
  if (index !== -1 && !process.argv[index+1]) throw new Error('Provide a filename after --env.');
  const filename = index !== -1 ? process.argv[index+1] : '.env.supabase';
  const envFile = path.resolve(root, filename);
  if (existsSync(envFile)) dotenv.config({ path:envFile, override:true, quiet:true });
  else if (index !== -1) throw new Error('The specified environment file does not exist.');
  return config({ driver:'supabase' });
}
export function reportSetupError(error) {
  if (error.code === 'ENOTFOUND' || error.code === 'ENETUNREACH') return 'Cannot reach PostgreSQL. Use Connect → Session pooler in Supabase (IPv4 compatible), not the IPv6-only direct hostname.';
  if (error.code === '28P01') return 'Database authentication failed. Use your database password in the Session pooler URL; percent-encode special characters.';
  if (['SELF_SIGNED_CERT_IN_CHAIN','UNABLE_TO_VERIFY_LEAF_SIGNATURE','UNABLE_TO_GET_ISSUER_CERT_LOCALLY'].includes(error.code)) return 'TLS certificate verification failed. Download the database CA certificate from Supabase and set SUPABASE_CA_CERT_PATH (local) or SUPABASE_CA_CERT (hosting). Do not disable SSL.';
  return error.message;
}
