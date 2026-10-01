/* Verify every exported avatar stays on one exact 64 x 64 visible pixel grid. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PNG } = require('pngjs');

const root = __dirname;
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const cell = manifest.renderSize / manifest.grid;
assert.equal(cell, 8, 'the 512px export must use 8px cells');
assert.equal(manifest.assets.length, 144, 'the complete catalog must be checked');

for (const asset of manifest.assets) {
  const image = PNG.sync.read(fs.readFileSync(path.join(root, asset.path)));
  assert.equal(image.width, 512, `${asset.path} width`);
  assert.equal(image.height, 512, `${asset.path} height`);
  for (let tileY = 0; tileY < image.height; tileY += cell) {
    for (let tileX = 0; tileX < image.width; tileX += cell) {
      const first = (tileY * image.width + tileX) * 4;
      const rgba = image.data.subarray(first, first + 4);
      assert.ok(rgba[3] === 0 || rgba[3] === 255,
        `${asset.path} has a partly transparent cell at ${tileX},${tileY}`);
      for (let y = tileY; y < tileY + cell; y++) {
        for (let x = tileX; x < tileX + cell; x++) {
          const at = (y * image.width + x) * 4;
          for (let channel = 0; channel < 4; channel++) {
            assert.equal(image.data[at + channel], rgba[channel],
              `${asset.path} has a split pixel cell at ${tileX},${tileY}`);
          }
        }
      }
    }
  }
}

process.stdout.write(`Verified ${manifest.assets.length} avatars on a uniform 8px pixel grid\n`);
