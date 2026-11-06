import { identityMessage, type IdentityProof } from '@integralo/contract';
import { getRandomBytes } from 'expo-crypto';
import nacl from 'tweetnacl';
import { ApiError, apiRequest } from '@/api/client';

/** The server answered, but it is not the one this app was paired with (or its signature is wrong). */
export class IdentityMismatchError extends Error {
  constructor() {
    super('identity mismatch');
  }
}

/**
 * Asks the core to sign a fresh random challenge and checks the signature (Ed25519, with
 * tweetnacl: plain JavaScript, so it works in Expo Go). With `expected`, the server must
 * also have that public key, the one kept when pairing: an impostor on the network can copy
 * an address or a name, never the private key. Returns the server's public key.
 */
export async function verifyServer(baseUrl: string, expected?: string | null): Promise<string> {
  const nonce = toBase64Url(getRandomBytes(24));
  const proof = await apiRequest<IdentityProof>(baseUrl, 'GET', `/identity?nonce=${nonce}`);
  if (typeof proof?.publicKey !== 'string' || typeof proof.signature !== 'string') throw new ApiError(-1, 'not_integralo');
  if (expected && proof.publicKey !== expected) throw new IdentityMismatchError();
  let valid = false;
  try {
    valid = nacl.sign.detached.verify(
      new TextEncoder().encode(identityMessage(nonce)),
      fromBase64Url(proof.signature),
      fromBase64Url(proof.publicKey),
    );
  } catch {
    valid = false;
  }
  if (!valid) throw new IdentityMismatchError();
  return proof.publicKey;
}

/** "3f9a·c21e·07bd"-style short fingerprint, for showing which server is paired. */
export function shortKey(publicKey: string): string {
  return publicKey.slice(0, 4) + '·' + publicKey.slice(4, 8);
}

// base64url by hand: Buffer and atob are not reliable on phones (Hermes).
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

export function toBase64Url(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    const chars = Math.min(4, Math.ceil(((bytes.length - i) * 8) / 6));
    for (let c = 0; c < chars; c++) out += ALPHABET[(n >> (18 - 6 * c)) & 63];
  }
  return out;
}

export function fromBase64Url(text: string): Uint8Array {
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const char of text) {
    const value = ALPHABET.indexOf(char);
    if (value < 0) throw new Error('invalid base64url');
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 255);
    }
  }
  return new Uint8Array(bytes);
}
