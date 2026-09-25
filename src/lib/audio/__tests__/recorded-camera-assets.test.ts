import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createHash } from 'crypto';

const dir = resolve(__dirname, '../../../../assets/audio');
const manifest = JSON.parse(readFileSync(resolve(dir, 'RECORDED-SOURCES.json'), 'utf8'));

test('recorded cues carry source provenance and match the shipped PCM hashes', () => {
  expect(manifest.license).toBe('CC0-1.0');
  expect(manifest.sources).toHaveLength(2);
  for (const asset of manifest.assets) {
    const wav = readFileSync(resolve(dir, asset.file));
    expect(wav.subarray(0, 4).toString()).toBe('RIFF');
    expect(wav.readUInt16LE(20)).toBe(1);
    expect(wav.readUInt16LE(22)).toBe(1);
    expect(wav.readUInt32LE(24)).toBe(22050);
    expect(wav.readUInt16LE(34)).toBe(16);
    expect((wav.length - 44) / 44100).toBeCloseTo(asset.outputSeconds, 4);
    expect(wav.length).toBe(asset.bytes);
    expect(createHash('sha256').update(wav).digest('hex')).toBe(asset.sha256);
    expect(manifest.sources.find((source: { id: string }) => source.id === asset.source)).toBeDefined();
  }
});

test('ratchet has one recorded click followed by silence in each exact 160ms cycle', () => {
  const wav = readFileSync(resolve(dir, 'observatory-ratchet.wav'));
  const samples = Array.from({ length: (wav.length - 44) / 2 }, (_, i) => wav.readInt16LE(44 + i * 2));
  expect(samples).toHaveLength(3528);
  expect(Math.max(...samples.map(Math.abs))).toBeGreaterThan(10000);
  expect(samples.slice(Math.ceil(22050 * 0.065)).every(sample => sample === 0)).toBe(true);
  expect(samples[0]).toBe(0);
});

test('native loop cleanup precedes expo-audio release and camera phases share their loop owner', () => {
  const native = readFileSync(resolve(__dirname, '../use-loop-media.ts'), 'utf8');
  const destination = readFileSync(resolve(__dirname, '../../../components/deep-space/StarDestination.tsx'), 'utf8');
  expect(native).toContain('useLayoutEffect(() =>');
  expect(native).toContain('controller.dispose()');
  expect(destination).toContain('<CameraCue phase={phase} />');
  expect(destination).not.toContain('<CameraCue key={phase}');
});
