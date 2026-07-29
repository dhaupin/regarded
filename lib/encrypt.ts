/**
 * Security & Encryption
 * 
 * AES-256-GCM encryption with PBKDF2 key derivation.
 */

import type { EncryptedSecrets } from './types';

const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;
const IV_LENGTH = 12;
const SALT_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const PBKDF2_ITERATIONS = 100000;

/**
 * Generate random bytes
 */
export function randomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

/**
 * Convert to/from Base64
 */
export function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

export function fromBase64(base64: string): Uint8Array {
  return Uint8Array.from(atob(base64), c => c.charCodeAt(0));
}

/**
 * Derive key from secret
 */
export async function deriveKey(userSecret: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', encoder.encode(userSecret), 'PBKDF2', false, ['deriveBits', 'deriveKey']
  );
  return crypto.subtle.deriveKey({
    name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256',
  }, keyMaterial, { name: ALGORITHM, length: KEY_LENGTH }, false, ['encrypt', 'decrypt']);
}

/**
 * Encrypt data
 */
export async function encrypt(data: string, userSecret: string): Promise<EncryptedSecrets> {
  const salt = randomBytes(SALT_LENGTH);
  const iv = randomBytes(IV_LENGTH);
  const key = await deriveKey(userSecret, salt);
  const encoder = new TextEncoder();
  
  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv, authTagLen: AUTH_TAG_LENGTH * 8 }, key, encoder.encode(data)
  );
  
  const ciphertextWithTag = new Uint8Array(ciphertext);
  const authTag = ciphertextWithTag.slice(-AUTH_TAG_LENGTH);
  const actualCiphertext = ciphertextWithTag.slice(0, -AUTH_TAG_LENGTH);
  
  return {
    ciphertext: toBase64(actualCiphertext),
    iv: toBase64(iv),
    auth_tag: toBase64(authTag),
    key_id: toBase64(salt.slice(0, 8)),
    encrypted_by: 'system',
    created_at: Date.now(),
    updated_at: Date.now(),
    version: 1,
  };
}

/**
 * Decrypt data
 */
export async function decrypt(encrypted: EncryptedSecrets, userSecret: string): Promise<string> {
  // Pad salt to 16 bytes for PBKDF2
  const keyIdBytes = fromBase64(encrypted.key_id);
  const salt = new Uint8Array(16);
  salt.set(keyIdBytes.slice(0, 8), 0);
  salt.set(new Uint8Array(8), 8);
  
  const iv = fromBase64(encrypted.iv);
  const ciphertext = fromBase64(encrypted.ciphertext);
  const authTag = fromBase64(encrypted.auth_tag);
  
  const key = await deriveKey(userSecret, salt);
  const combined = new Uint8Array(ciphertext.length + authTag.length);
  combined.set(ciphertext);
  combined.set(authTag, ciphertext.length);
  
  const plaintext = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv, authTagLen: AUTH_TAG_LENGTH * 8 }, key, combined
  );
  return new TextDecoder().decode(plaintext);
}

/**
 * Hash with SHA-256
 */
export async function hashSHA256(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(data));
  return toBase64(new Uint8Array(hashBuffer));
}

/**
 * Generate token
 */
export function generateToken(length: number = 32): string {
  return toBase64(randomBytes(length)).replace(/[+/=]/g, '').slice(0, length);
}

/**
 * Verify token
 */
export async function verifyToken(token: string, hash: string): Promise<boolean> {
  return (await hashSHA256(token)) === hash;
}

/**
 * Timing-safe comparison
 */
export function secureCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}
