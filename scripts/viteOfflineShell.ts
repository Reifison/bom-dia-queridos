import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { Plugin, ResolvedConfig } from 'vite';

/** Native assets are bundled by Capacitor; this adds equivalent repeat-open support on Web. */
export function offlineShell(): Plugin {
  let config: ResolvedConfig;
  return {
    name: 'bdq-offline-shell',
    apply: 'build',
    configResolved(resolved) { config = resolved; },
    generateBundle(_options, bundle) {
      const paths: string[] = [];
      const hash = createHash('sha256');
      for (const [name, file] of Object.entries(bundle)) {
        if (name.endsWith('.map')) continue;
        paths.push(name);
        hash.update(name).update(file.type === 'chunk' ? file.code : file.source);
      }
      const collect = (directory: string, prefix = '') => {
        if (!fs.existsSync(directory)) return;
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
          if (entry.name.startsWith('.')) continue;
          const relative = path.posix.join(prefix, entry.name);
          const absolute = path.join(directory, entry.name);
          if (entry.isDirectory()) collect(absolute, relative);
          else { paths.push(relative); hash.update(relative).update(fs.readFileSync(absolute)); }
        }
      };
      collect(config.publicDir);
      const files = [...new Set(['index.html', ...paths])].map((name) => `./${name}`);
      const cache = `bdq-offline-${hash.digest('hex').slice(0, 12)}`;
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: `
const CACHE = ${JSON.stringify(cache)};
const FILES = ${JSON.stringify(files)};
const BASE = new URL('./', self.location.href);
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('bdq-offline-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== BASE.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.open(CACHE).then(cache => cache.match(new URL('index.html', BASE).href, { ignoreVary: true }))));
    return;
  }
  // These are public, versioned app assets. Preview servers can add Vary: Origin,
  // although the same photo/font is returned for every same-origin request.
  event.respondWith(caches.open(CACHE).then(cache => cache.match(request, { ignoreSearch: true, ignoreVary: true })).then(cached => cached || fetch(request)));
});
` });
    },
  };
}
