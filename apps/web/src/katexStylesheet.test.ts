import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import katex from 'katex';

// The stylesheet comes from a CDN, so nothing else ties it to the installed
// katex; since 0.18 the JS emits prefixed class names an older sheet misses.
test('index.html loads the KaTeX stylesheet of the installed katex version', () => {
  const html = readFileSync(
    // Not new URL('../index.html', import.meta.url): Vite rewrites that literal into an asset URL.
    path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'index.html'),
    'utf8'
  );
  const cdnVersion = html.match(/katex@([^/]+)\/dist\/katex\.min\.css/)?.[1];
  expect(cdnVersion).toBe(katex.version);
});
