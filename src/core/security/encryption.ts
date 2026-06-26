import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;    // bytes — recomendado para GCM
const TAG_LEN = 16;   // bytes — auth tag por defecto de GCM

function keyBuffer(hexKey: string): Buffer {
  return Buffer.from(hexKey, 'hex');
}

/**
 * Cifra con AES-256-GCM.
 * Salida base64: [IV 12B][authTag 16B][ciphertext NB]
 */
export function encrypt(plaintext: string, hexKey: string): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, keyBuffer(hexKey), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

/**
 * Descifra con AES-256-GCM. Lanza si la clave es incorrecta o el payload fue manipulado.
 */
export function decrypt(ciphertext: string, hexKey: string): string {
  const buf = Buffer.from(ciphertext, 'base64');
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const encrypted = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGO, keyBuffer(hexKey), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}
