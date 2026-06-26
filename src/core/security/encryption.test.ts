import { describe, it, expect } from 'vitest';
import { encrypt, decrypt } from './encryption';

// Clave de 64 chars hex = 32 bytes (AES-256)
const KEY = '0'.repeat(64);
const WRONG_KEY = '1'.repeat(64);

describe('encrypt / decrypt', () => {
  it('el texto cifrado es distinto al original', () => {
    const plain = 'mi-refresh-token-secreto';
    expect(encrypt(plain, KEY)).not.toBe(plain);
  });

  it('decrypt restaura el texto original', () => {
    const plain = 'mi-refresh-token-secreto';
    const cipher = encrypt(plain, KEY);
    expect(decrypt(cipher, KEY)).toBe(plain);
  });

  it('cada llamada produce un ciphertext distinto (IV aleatorio)', () => {
    const plain = 'mismo-texto';
    expect(encrypt(plain, KEY)).not.toBe(encrypt(plain, KEY));
  });

  it('decrypt lanza con clave incorrecta', () => {
    const cipher = encrypt('secreto', KEY);
    expect(() => decrypt(cipher, WRONG_KEY)).toThrow();
  });

  it('decrypt lanza con payload manipulado', () => {
    const cipher = encrypt('secreto', KEY);
    // Corrompe el último caracter del base64
    const tampered = cipher.slice(0, -2) + 'AA';
    expect(() => decrypt(tampered, KEY)).toThrow();
  });
});
