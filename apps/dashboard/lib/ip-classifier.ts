export function parseIPv4(value: string): [number, number, number, number] | null {
  const match = value.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return null;
  const octets = match.slice(1, 5).map((part) => Number(part));
  if (octets.some((n) => n < 0 || n > 255 || !Number.isInteger(n))) return null;
  return [octets[0], octets[1], octets[2], octets[3]];
}

export function parseIPv6(value: string): number[] | null {
  let input = value.split('%')[0];
  if (input.startsWith('[') && input.endsWith(']')) input = input.slice(1, -1);
  if (input.length === 0) return null;

  const embeddedV4 = input.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (embeddedV4) {
    const v4 = parseIPv4(embeddedV4[1]);
    if (!v4) return null;
    const g1 = ((v4[0] << 8) | v4[1]).toString(16);
    const g2 = ((v4[2] << 8) | v4[3]).toString(16);
    input = input.slice(0, embeddedV4.index) + g1 + ':' + g2;
  }

  const halves = input.split('::');
  if (halves.length > 2) return null;

  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 ? (halves[1] ? halves[1].split(':') : []) : null;

  let groups: string[];
  if (tail === null) {
    groups = head;
  } else {
    const missing = 8 - head.length - tail.length;
    if (missing < 1) return null;
    groups = [...head, ...Array<string>(missing).fill('0'), ...tail];
  }

  if (groups.length !== 8) return null;

  const bytes: number[] = [];
  for (const group of groups) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(group)) return null;
    const num = parseInt(group, 16);
    bytes.push((num >> 8) & 0xff, num & 0xff);
  }
  return bytes;
}

function isBlockedIPv4([a, b]: [number, number, number, number]): boolean {
  if (a === 0) return true;
  if (a === 10) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a >= 224) return true;
  return false;
}

function allZero(bytes: number[], start: number, end: number): boolean {
  for (let i = start; i < end; i += 1) {
    if (bytes[i] !== 0) return false;
  }
  return true;
}

function isBlockedIPv6(bytes: number[]): boolean {
  if (allZero(bytes, 0, 16)) return true;
  if (allZero(bytes, 0, 15) && bytes[15] === 1) return true;

  if ((bytes[0] & 0xff) === 0xff) return true;
  if ((bytes[0] & 0xfe) === 0xfc) return true;
  if (bytes[0] === 0xfe && (bytes[1] & 0xc0) === 0x80) return true;

  if (
    bytes[0] === 0x00 && bytes[1] === 0x64 &&
    bytes[2] === 0xff && bytes[3] === 0x9b &&
    allZero(bytes, 4, 12)
  ) {
    return isBlockedIPv4([bytes[12], bytes[13], bytes[14], bytes[15]]);
  }

  if (allZero(bytes, 0, 10) && bytes[10] === 0xff && bytes[11] === 0xff) {
    return isBlockedIPv4([bytes[12], bytes[13], bytes[14], bytes[15]]);
  }
  if (allZero(bytes, 0, 12) && !allZero(bytes, 12, 16)) {
    return isBlockedIPv4([bytes[12], bytes[13], bytes[14], bytes[15]]);
  }

  return false;
}

export function isPrivateOrReservedIp(ip: string): boolean {
  const v4 = parseIPv4(ip);
  if (v4) return isBlockedIPv4(v4);
  const v6 = parseIPv6(ip);
  if (v6) return isBlockedIPv6(v6);
  return true;
}
