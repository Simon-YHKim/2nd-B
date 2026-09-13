const NETWORK_LITERAL_PATTERN = /^[0-9a-f:.]{2,64}$/i;

function parseIpv4(value: string): number[] | null {
  const parts = value.split('.');
  if (parts.length !== 4) return null;

  const bytes: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const byte = Number(part);
    if (!Number.isInteger(byte) || byte > 255) return null;
    bytes.push(byte);
  }
  return bytes;
}

function parseIpv6(value: string): number[] | null {
  let expanded = value;
  if (expanded.includes('.')) {
    const lastColon = expanded.lastIndexOf(':');
    if (lastColon < 0) return null;
    const ipv4 = parseIpv4(expanded.slice(lastColon + 1));
    if (!ipv4) return null;
    const high = ((ipv4[0] ?? 0) << 8) | (ipv4[1] ?? 0);
    const low = ((ipv4[2] ?? 0) << 8) | (ipv4[3] ?? 0);
    const prefix = expanded.slice(0, lastColon + 1);
    expanded = `${prefix}${high.toString(16)}:${low.toString(16)}`;
  }

  const compressionAt = expanded.indexOf('::');
  if (compressionAt !== -1 && compressionAt !== expanded.lastIndexOf('::')) return null;

  const leftText = compressionAt === -1 ? expanded : expanded.slice(0, compressionAt);
  const rightText = compressionAt === -1 ? '' : expanded.slice(compressionAt + 2);
  const left = leftText === '' ? [] : leftText.split(':');
  const right = rightText === '' ? [] : rightText.split(':');
  if (left.some((part) => part === '') || right.some((part) => part === '')) return null;

  const missing = 8 - left.length - right.length;
  if ((compressionAt === -1 && missing !== 0) || (compressionAt !== -1 && missing < 1)) {
    return null;
  }

  const parts = compressionAt === -1
    ? left
    : [...left, ...Array<string>(missing).fill('0'), ...right];
  const words: number[] = [];
  for (const part of parts) {
    if (!/^[0-9a-f]{1,4}$/i.test(part)) return null;
    words.push(Number.parseInt(part, 16));
  }
  return words.length === 8 ? words : null;
}

function mappedIpv4(words: number[]): string | null {
  if (!words.slice(0, 5).every((word) => word === 0) || words[5] !== 0xffff) {
    return null;
  }
  const high = words[6] ?? 0;
  const low = words[7] ?? 0;
  return [high >> 8, high & 0xff, low >> 8, low & 0xff].join('.');
}

/**
 * Canonical, non-secret input for unauthenticated abuse-control HMACs.
 * IPv6 is deliberately coarsened to /64 so address rotation within a normal
 * client prefix cannot mint fresh quota buckets.
 */
export function canonicalNetworkIdentity(value: string): string | null {
  if (!NETWORK_LITERAL_PATTERN.test(value)) return null;

  if (!value.includes(':')) {
    const ipv4 = parseIpv4(value);
    return ipv4 ? ipv4.join('.') : null;
  }

  const ipv6 = parseIpv6(value);
  if (!ipv6) return null;
  const ipv4 = mappedIpv4(ipv6);
  if (ipv4) return ipv4;

  return `ipv6/64:${ipv6.slice(0, 4).map((word) => word.toString(16)).join(':')}`;
}
