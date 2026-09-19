import { readFileSync, writeFileSync } from 'node:fs';

let html = readFileSync('dist/index.html', 'utf8');

// Move the module bundle to the end of <body> as a classic script (works in more sandboxes/previewers).
const match = html.match(/<script type="module" crossorigin>([\s\S]*?)<\/script>/);
if (!match) { console.error('bundle not found'); process.exit(1); }
html = html.replace(match[0], '');
html = html.replace('</body>', () => '<script>' + match[1] + '</script></body>');

// Embed favicon + track images as data URLs.
html = html.split('/favicon.svg').join('data:image/svg+xml;base64,' + readFileSync('public/favicon.svg').toString('base64'));
for (const name of ['sunset-skyline.png', 'pacific-coast.png', 'midnight-pass.png', 'neon-mesa.png']) {
  html = html.split(`/images/${name}`).join('data:image/png;base64,' + readFileSync(`public/images/${name}`).toString('base64'));
}

if (html.includes('/images/')) { console.error('ERROR: unreplaced image refs remain'); process.exit(1); }
writeFileSync('game.html', html);
writeFileSync('docs/index.html', html);
console.log('standalone 3D game built:', (html.length / 1048576).toFixed(2), 'MB');
