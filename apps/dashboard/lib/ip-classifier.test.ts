import { describe, expect, test } from 'vitest';
import { isPrivateOrReservedIp, parseIPv4, parseIPv6 } from './ip-classifier.js';

describe('parseIPv4', () => {
  test('parses valid addresses', () => {
    expect(parseIPv4('1.2.3.4')).toEqual([1, 2, 3, 4]);
    expect(parseIPv4('255.255.255.255')).toEqual([255, 255, 255, 255]);
  });
  test('rejects invalid', () => {
    expect(parseIPv4('256.0.0.1')).toBeNull();
    expect(parseIPv4('1.2.3')).toBeNull();
    expect(parseIPv4('::1')).toBeNull();
  });
});

describe('parseIPv6', () => {
  test('parses compressed and full forms', () => {
    expect(parseIPv6('::1')?.length).toBe(16);
    expect(parseIPv6('2001:db8::1')?.length).toBe(16);
    expect(parseIPv6('fe80::1')?.[0]).toBe(0xfe);
  });
  test('parses ipv4-mapped', () => {
    const bytes = parseIPv6('::ffff:127.0.0.1');
    expect(bytes?.slice(10)).toEqual([0xff, 0xff, 127, 0, 0, 1]);
  });
});

describe('isPrivateOrReservedIp - IPv4 blocked', () => {
  const blocked = [
    '0.0.0.0',
    '10.0.0.1',
    '100.64.0.1',
    '100.127.255.255',
    '127.0.0.1',
    '169.254.169.254',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '198.18.0.1',
    '198.19.255.255',
    '224.0.0.1',
    '255.255.255.255',
  ];
  test.each(blocked)('blocks %s', (ip) => {
    expect(isPrivateOrReservedIp(ip)).toBe(true);
  });
});

describe('isPrivateOrReservedIp - IPv4 public allowed', () => {
  const allowed = [
    '1.1.1.1',
    '8.8.8.8',
    '93.184.216.34',
    '172.15.255.255',
    '172.32.0.1',
    '100.63.255.255',
    '100.128.0.1',
    '198.17.255.255',
    '198.20.0.1',
    '223.255.255.255',
  ];
  test.each(allowed)('allows %s', (ip) => {
    expect(isPrivateOrReservedIp(ip)).toBe(false);
  });
});

describe('isPrivateOrReservedIp - IPv6', () => {
  const blocked = [
    '::1',
    '::',
    'fc00::1',
    'fd12:3456::1',
    'fe80::1',
    'febf::1',
    'ff02::1',
    '64:ff9b::7f00:1',
    '64:ff9b::a00:1',
    '::ffff:127.0.0.1',
    '::ffff:10.0.0.1',
    '::ffff:169.254.169.254',
    '::7f00:1',
  ];
  test.each(blocked)('blocks %s', (ip) => {
    expect(isPrivateOrReservedIp(ip)).toBe(true);
  });

  const allowed = [
    '2001:4860:4860::8888',
    '2606:4700:4700::1111',
    '2001:db8::1',
    '::ffff:8.8.8.8',
    '64:ff9b::8.8.8.8',
  ];
  test.each(allowed)('allows %s', (ip) => {
    expect(isPrivateOrReservedIp(ip)).toBe(false);
  });
});

describe('isPrivateOrReservedIp - fail closed', () => {
  test('blocks unparseable input', () => {
    expect(isPrivateOrReservedIp('not-an-ip')).toBe(true);
    expect(isPrivateOrReservedIp('')).toBe(true);
  });
});
