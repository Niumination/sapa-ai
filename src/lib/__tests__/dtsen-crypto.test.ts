import { describe, test, expect } from 'vitest';
import { encryptField, decryptField } from '@/lib/dtsen-crypto';

describe('dtsen-crypto — WP0.14 key-length gate', () => {
  test('reject 33-byte base64url key', () => {
    process.env.DTSEN_DATA_KEY = Buffer.from('x'.repeat(33)).toString('base64url');
    expect(encryptField('test')).toBeNull();
  });

  test('reject 48-byte hex key (64 chars)', () => {
    process.env.DTSEN_DATA_KEY = 'a'.repeat(64);
    expect(encryptField('test')).toBeNull();
  });

  test('accept exactly 32-byte base64url key roundtrip', () => {
    process.env.DTSEN_DATA_KEY = Buffer.from('x'.repeat(32)).toString('base64url');
    const enc = encryptField('hello');
    expect(enc).not.toBeNull();
    expect(decryptField(enc!)).toBe('hello');
  });
});
