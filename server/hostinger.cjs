'use strict';

// Hostinger/LiteSpeed loads the configured Node.js entry file with require().
// The R Racer server is ESM and may use top-level await, so load it with
// dynamic import() from this CommonJS-compatible wrapper.
(async () => {
  try {
    await import('./index.js');
  } catch (error) {
    console.error('Failed to start R Racer:', error);
    process.exit(1);
  }
})();
