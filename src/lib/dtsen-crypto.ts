/**
 * Kripto untuk data DTSEN ByNameByAddress.
 * - nikHash: HMAC-SHA256 (identitas tak terbaca, untuk lookup by-NIK)
 * - namaAsliEnc/nikEnc: AES-256-GCM dengan DTSEN_DATA_KEY (hanya DTSEN_ROOT bisa dekripsi)
 * Format enkripsi: base64( iv(12B) || tag(16B) || ciphertext )
 */
import crypto from 'crypto';

function dataKey(): Buffer | null {
  const k = process.env.DTSEN_DATA_KEY;
  if (!k) return null;
  const b = Buffer.from(k, 'base64url');
  return b.length === 32 ? b : null;
}

export function encryptField(plain: string): string | null {
  const key = dataKey();
  if (!key || !plain) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

export function decryptField(enc: string | null | undefined): string | null {
  if (!enc) return null;
  const key = dataKey();
  if (!key) return null;
  try {
    const buf = Buffer.from(enc, 'base64');
    if (buf.length < 28) return null;
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const data = buf.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

/** Role yang boleh melihat data by-name lengkap (tanpa mask). */
export function canSeeFullIdentitas(role: string | null | undefined): boolean {
  return role === 'DTSEN_ROOT';
}
