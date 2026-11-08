// Force optimised React output even when the local .env is in development mode.
process.env.NODE_ENV='production';
const {build}=await import('vite');
await build();
