/**
 * Server identity and pairing (finding and trusting the server from the app).
 *
 * The core owns an Ed25519 key pair created on its first start. Its public key identifies
 * it: the pairing QR carries it, the app keeps it, and on every connection the app sends a
 * random challenge that the core must sign. Anyone can copy an address or a name, but only
 * the real core can sign with its private key, so a device impersonating it on the network
 * is rejected even if the core changed its IP address.
 */

/** Public: what GET /api/health answers, also used to recognise a server while scanning the network. */
export interface ServerHealth {
  status: 'ok';
  broker: 'connected' | 'disconnected';
  /** Short id derived from the public key, for people ("3f9a·c21e·…"). */
  serverId: string;
  /** Name of the computer running the core. */
  name: string;
  /** Ed25519 public key, raw 32 bytes in base64url. */
  publicKey: string;
}

/** GET /api/identity?nonce=…: the challenge signed by the core. */
export interface IdentityProof {
  serverId: string;
  publicKey: string;
  /** Ed25519 signature of identityMessage(nonce), base64url. */
  signature: string;
}

/** Authenticated: what the "pair a phone" card shows. */
export interface PairingInfo {
  name: string;
  serverId: string;
  /** Addresses (host:port) where phones on the local network can reach the core. */
  addresses: string[];
  /** Text encoded in the QR. */
  payload: string;
}

/** Exactly what the core signs: a fixed prefix stops the key from signing anything else. */
export function identityMessage(nonce: string): string {
  return `integralo-identity:v1:${nonce}`;
}

/** Challenges are random base64url strings; anything else is refused. */
export const NONCE_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

export interface PairingPayload {
  name: string;
  publicKey: string;
  addresses: string[];
}

const PAIRING_PREFIX = 'integralo://pair?';

/**
 * "integralo://pair?v=1&k=<public key>&n=<name>&a=<host:port>,<host:port>".
 * Built and parsed by hand: React Native's URL classes are incomplete on phones.
 */
export function buildPairingPayload(p: PairingPayload): string {
  return `${PAIRING_PREFIX}v=1&k=${p.publicKey}&n=${encodeURIComponent(p.name)}&a=${p.addresses.map(encodeURIComponent).join(',')}`;
}

/** Null when the text is not an IntegrAlo pairing code (any other QR). */
export function parsePairingPayload(text: string): PairingPayload | null {
  if (!text.startsWith(PAIRING_PREFIX)) return null;
  const fields = new Map<string, string>();
  for (const part of text.slice(PAIRING_PREFIX.length).split('&')) {
    const i = part.indexOf('=');
    if (i > 0) fields.set(part.slice(0, i), part.slice(i + 1));
  }
  const publicKey = fields.get('k') ?? '';
  const addresses = (fields.get('a') ?? '').split(',').filter(Boolean).map(decodeURIComponent);
  if (fields.get('v') !== '1' || !/^[A-Za-z0-9_-]{43}$/.test(publicKey) || addresses.length === 0) return null;
  return { publicKey, addresses, name: decodeURIComponent(fields.get('n') ?? '') };
}
