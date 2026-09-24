import { createClient } from '@supabase/supabase-js';

// Only the Node backend has the secret key. No client-side Storage policies needed.
export function createImageStorage(c) {
  const client = createClient(c.supabaseUrl, c.supabaseSecretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (url, options = {}) => fetch(url, { ...options, signal: options.signal || AbortSignal.timeout(30000) }) },
  });
  const bucket = c.supabaseBucket;
  const files = client.storage.from(bucket);
  const storageError = (operation, error) => {
    const e = new Error(`Supabase Storage ${operation} failed. Check the secret key, private bucket and storage quota.`);
    e.code = 'STORAGE_ERROR';
    e.status = 503;
    e.storageStatus = Number(error?.statusCode || error?.status);
    return e;
  };
  return {
    async check() {
      const { data, error } = await client.storage.getBucket(bucket);
      if (error) throw storageError('connection', error);
      if (data.public) throw new Error('The R Racer image bucket must be private. Set it to private in Supabase Storage.');
      return data;
    },
    async setup() {
      let result = await client.storage.getBucket(bucket);
      if (result.error) {
        // Do not change an existing bucket after an authentication/network failure.
        if (!['404','400'].includes(String(result.error.statusCode)) || !/not found|does not exist/i.test(result.error.message || '')) throw storageError('connection', result.error);
        const created = await client.storage.createBucket(bucket, {
          public: false, fileSizeLimit: 10485760,
          allowedMimeTypes: ['image/webp','image/jpeg','image/png'],
        });
        if (created.error) throw storageError('bucket creation', created.error);
      }
      return this.check();
    },
    async put(objectPath, bytes, mime) {
      const { error } = await files.upload(objectPath, bytes, { contentType: mime, cacheControl: '31536000', upsert: false });
      if (error) throw storageError('upload', error);
    },
    async get(objectPath) {
      const { data, error } = await files.download(objectPath);
      if (error) throw storageError('download', error);
      return Buffer.from(await data.arrayBuffer());
    },
    async remove(objectPath) {
      const { error } = await files.remove([objectPath]);
      if (error) throw storageError('deletion', error);
    },
  };
}
