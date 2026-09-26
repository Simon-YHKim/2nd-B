// First-party procedural camera SFX. No samples, downloads, API or dependencies.
// Run once with local ffmpeg; -n / exclusive writes protect existing assets.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const out = path.resolve(__dirname, '../assets/audio');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), '2ndb-camera-sfx-'));
const rate = 22050;
const sounds = [
  ['camera-aim', 0.42, (t, noise) => {
    const envelope = Math.sin(Math.PI * t / 0.42) ** 2;
    return envelope * (0.26 * Math.sin(2 * Math.PI * (155 * t + 160 * t * t)) * (0.65 + 0.35 * Math.sin(2 * Math.PI * 32 * t)) + 0.07 * noise);
  }],
  ['camera-focus', 0.36, (t, noise) => {
    const pulse = (start, length, pitch) => {
      const dt = t - start;
      return dt < 0 || dt > length ? 0 : Math.sin(Math.PI * dt / length) ** 2 * (0.24 * Math.sin(2 * Math.PI * (pitch * dt + 900 * dt * dt)) + 0.035 * noise);
    };
    return pulse(0.015, 0.13, 310) + pulse(0.17, 0.09, 490) + pulse(0.28, 0.06, 360);
  }],
  ['camera-shutter', 0.28, (t, noise) => {
    const click = (start, amplitude, decay) => {
      const dt = t - start;
      return dt < 0 ? 0 : amplitude * Math.exp(-dt / decay) * (0.78 * noise + 0.22 * Math.sin(2 * Math.PI * 1250 * dt));
    };
    return click(0.008, 0.95, 0.015) + click(0.075, 0.75, 0.023) + click(0.15, 0.2, 0.012);
  }],
];
for (const [name, seconds, sample] of sounds) {
  const destination = path.join(out, name + '.mp3');
  if (fs.existsSync(destination)) throw new Error('Already exists: ' + name);
  const count = Math.ceil(seconds * rate), pcm = Buffer.alloc(44 + count * 2);
  pcm.write('RIFF'); pcm.writeUInt32LE(36 + count * 2, 4); pcm.write('WAVEfmt ', 8);
  pcm.writeUInt32LE(16, 16); pcm.writeUInt16LE(1, 20); pcm.writeUInt16LE(1, 22);
  pcm.writeUInt32LE(rate, 24); pcm.writeUInt32LE(rate * 2, 28); pcm.writeUInt16LE(2, 32); pcm.writeUInt16LE(16, 34);
  pcm.write('data', 36); pcm.writeUInt32LE(count * 2, 40);
  let seed = 260925, peak = 0;
  for (let i = 0; i < count; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const value = sample(i / rate, seed / 2147483648 - 1);
    peak = Math.max(peak, Math.abs(value));
    if (Math.abs(value) >= 1) throw new Error('Clipped sample');
    pcm.writeInt16LE(Math.round(value * 32767), 44 + i * 2);
  }
  const wav = path.join(tmp, name + '.wav'); fs.writeFileSync(wav, pcm, { flag: 'wx' });
  const result = spawnSync('ffmpeg', ['-v', 'error', '-n', '-i', wav, '-codec:a', 'libmp3lame', '-b:a', '64k', destination], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr);
  console.log(name, seconds + 's', 'peak=' + peak.toFixed(3), fs.statSync(destination).size + ' bytes');
}
