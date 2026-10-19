import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'dist');
await rm(out, { recursive: true, force: true });
await mkdir(path.join(out, 'vendor', 'addons', 'controls'), { recursive: true });
await mkdir(path.join(out, 'vendor', 'addons', 'utils'), { recursive: true });
await cp(path.join(root, 'public'), out, { recursive: true });
await cp(path.join(root, 'src'), path.join(out, 'src'), { recursive: true });
for (const file of ['three.module.js', 'three.core.js']) {
  await cp(path.join(root, 'node_modules/three/build', file), path.join(out, 'vendor', file));
}
await cp(path.join(root, 'node_modules/three/examples/jsm/controls/OrbitControls.js'), path.join(out, 'vendor/addons/controls/OrbitControls.js'));
await cp(path.join(root, 'node_modules/three/examples/jsm/utils/BufferGeometryUtils.js'), path.join(out, 'vendor/addons/utils/BufferGeometryUtils.js'));
await cp(path.join(root, 'node_modules/three/LICENSE'), path.join(out, 'vendor/THREE-LICENSE.txt'));
const html = await readFile(path.join(out, 'index.html'), 'utf8');
for (const file of ['src/main.js', 'styles.css', 'vendor/three.module.js']) {
  if (!html.includes(file)) throw new Error(`Missing entrypoint: ${file}`);
}
await writeFile(path.join(out, '_headers'), '/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  X-Frame-Options: SAMEORIGIN\n');
console.log('Built static browser game in dist/ with locally bundled Three.js.');
