// Edits of CC0 field recordings, not synthesis. Originals remain untouched.
// First ingest the public previews listed in assets/audio/RECORDED-SOURCES.json.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const rate = 22050;
const root = path.resolve(__dirname, '..');
const provenance = JSON.parse(fs.readFileSync(path.join(root, 'assets/audio/RECORDED-SOURCES.json'), 'utf8'));
const recipes = [
  { name: 'observatory-ratchet', source: 'sfx_001.mp3', start: 8.435, length: 0.065, total: 0.16, peak: 0.55, lowpass: 3600 },
  { name: 'observatory-focus-lock', source: 'sfx_002.mp3', start: 0.875, length: 0.20, total: 0.20, peak: 0.6, lowpass: 7000 },
  { name: 'observatory-shutter', source: 'sfx_002.mp3', start: 1.332, length: 0.29, total: 0.29, peak: 0.7, lowpass: 10000 },
];
for (const recipe of recipes) {
  const input = path.join(root, '.media/audio/sfx', recipe.source);
  const target = path.join(root, 'assets/audio', recipe.name + '.wav');
  if (fs.existsSync(target)) throw new Error('Refusing to replace existing asset: ' + target);
  const sourceSha256 = createHash('sha256').update(fs.readFileSync(input)).digest('hex');
  const expected = provenance.sources.find(source => path.basename(source.cachedInput) === recipe.source);
  if (!expected || sourceSha256 !== expected.sha256) throw new Error('Source recording hash mismatch: ' + recipe.source);
  const filter = `atrim=start=${recipe.start}:duration=${recipe.length},asetpts=PTS-STARTPTS,highpass=f=180,lowpass=f=${recipe.lowpass},afade=t=in:d=0.001,afade=t=out:st=${recipe.length - 0.008}:d=0.008`;
  const result = spawnSync('ffmpeg', ['-v', 'error', '-i', input, '-af', filter, '-ac', '1', '-ar', String(rate), '-f', 'f32le', 'pipe:1']);
  if (result.status !== 0) throw new Error(String(result.stderr));
  const samples = result.stdout;
  let peak = 0;
  for (let i = 0; i < samples.length; i += 4) peak = Math.max(peak, Math.abs(samples.readFloatLE(i)));
  if (peak < 0.0001) throw new Error('Source slice is silent');
  const count = Math.round(rate * recipe.total);
  const wav = Buffer.alloc(44 + count * 2);
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write('data', 36); wav.writeUInt32LE(count * 2, 40);
  for (let i = 0; i < Math.min(count, samples.length / 4); i++) wav.writeInt16LE(Math.round(samples.readFloatLE(i * 4) / peak * recipe.peak * 32767), 44 + i * 2);
  fs.writeFileSync(target, wav, { flag: 'wx' });
  console.log(JSON.stringify({ ...recipe, bytes: wav.length, sha256: createHash('sha256').update(wav).digest('hex'), sourceSha256: createHash('sha256').update(fs.readFileSync(input)).digest('hex') }));
}
