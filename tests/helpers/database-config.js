export function testDatabaseConfig() {
  return process.env.TEST_SUPABASE_DATABASE_URL ? {
    driver:'supabase',supabaseDatabaseUrl:process.env.TEST_SUPABASE_DATABASE_URL,
    supabaseUrl:process.env.TEST_SUPABASE_URL,supabaseSecretKey:process.env.TEST_SUPABASE_SECRET_KEY,
    supabaseSsl:false,supabaseBucket:'rracer-images',supabasePoolMax:Number(process.env.TEST_SUPABASE_POOL_MAX||5),
  } : {};
}
