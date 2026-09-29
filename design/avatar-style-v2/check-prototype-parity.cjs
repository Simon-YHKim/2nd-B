/* Keep the standalone PIXEL-CLAY avatar studio in sync with the approved catalog. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = __dirname;
const prototype = path.resolve(source, '../pixel_clay_v4/app');
for (const [origin, installed] of [
  ['avatar64.js', 'px-avatar64.js'],
  ['approved-style-renderer.js', 'px-approved-style-renderer.js'],
]) {
  assert.deepEqual(
    fs.readFileSync(path.join(prototype, installed)),
    fs.readFileSync(path.join(source, origin)),
    `${installed} must match ${origin}; regenerate both copies together`,
  );
}

const html = fs.readFileSync(path.join(prototype, '2nd-Brain.html'), 'utf8');
const scriptPosition = (name) => html.indexOf(`<script src="${name}"></script>`);
const catalog = scriptPosition('px-avatar64.js');
const renderer = scriptPosition('px-approved-style-renderer.js');
const studio = html.indexOf('<script type="text/babel" src="sb-avatar.jsx"></script>');
assert.ok(catalog >= 0 && catalog < renderer && renderer < studio,
  'load the approved catalog and renderer before the avatar studio');

const studioCode = fs.readFileSync(path.join(prototype, 'sb-avatar.jsx'), 'utf8');
assert.match(studioCode, /ApprovedStyleRenderer\.render\s*\(/,
  'the studio must render the approved treatment');
assert.match(studioCode, /EXT\.GARMENT/,
  'the studio must offer the six independent garments');
assert.match(studioCode, /garmentId/,
  'the chosen garment must be part of the saved avatar spec');
assert.match(studioCode, /<SbAvatar spec=\{sp\} size=\{128\}/,
  'the main studio preview must scale the 64-cell grid by an integer');

const preview = fs.readFileSync(path.join(source, 'preview.html'), 'utf8');
assert.doesNotMatch(preview, /max-height:\s*172px|imageSmoothingEnabled\s*=\s*true/,
  'the review sheet must not blur the fixed pixel grid');
assert.match(preview, /image-rendering:\s*pixelated/,
  'showcase and catalog images must use nearest-neighbor display');

process.stdout.write('Approved avatar catalog and standalone studio are in sync\n');
