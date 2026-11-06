import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, KeyObject, sign } from 'node:crypto';
import { hostname, networkInterfaces } from 'node:os';
import { buildPairingPayload, identityMessage, IdentityProof, PairingInfo } from '@integralo/contract';
import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { APP_CONFIG, AppConfig } from '../config';
import { DatabaseService } from '../database/database.service';

interface IdentityRow {
  public_key: string;
  private_key: string;
}

/**
 * Identity of this core: an Ed25519 key pair created on the first start and kept in the
 * database. The public key identifies the server to the apps (pairing QR); the private key
 * never leaves the core and only signs identity challenges (see the contract's pairing.ts).
 */
@Injectable()
export class IdentityService implements OnModuleInit {
  private readonly logger = new Logger(IdentityService.name);
  private privateKey!: KeyObject;
  /** Raw 32-byte public key, base64url. */
  publicKey = '';
  /** Short id for people, from the public key: "3f9a·c21e·07bd". */
  serverId = '';
  readonly name = hostname();

  constructor(
    private readonly database: DatabaseService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  onModuleInit(): void {
    let row = this.database.db.prepare('SELECT public_key, private_key FROM server_identity WHERE id = 1').get() as IdentityRow | undefined;
    if (!row) {
      const { publicKey, privateKey } = generateKeyPairSync('ed25519');
      row = {
        public_key: publicKey.export({ format: 'jwk' }).x as string,
        private_key: privateKey.export({ format: 'pem', type: 'pkcs8' }) as string,
      };
      this.database.db
        .prepare('INSERT INTO server_identity (id, public_key, private_key, created_at) VALUES (1, ?, ?, ?)')
        .run(row.public_key, row.private_key, Date.now());
      this.logger.log('server identity created');
    }
    this.privateKey = createPrivateKey(row.private_key);
    this.publicKey = row.public_key;
    // Sanity check: the stored public key must be the one of the stored private key.
    if (createPublicKey(this.privateKey).export({ format: 'jwk' }).x !== this.publicKey) {
      throw new Error('server identity is inconsistent: public and private keys do not match');
    }
    const hex = createHash('sha256').update(Buffer.from(this.publicKey, 'base64url')).digest('hex');
    this.serverId = [hex.slice(0, 4), hex.slice(4, 8), hex.slice(8, 12)].join('·');
  }

  /** Signs a challenge sent by an app (the nonce has been validated by the caller). */
  prove(nonce: string): IdentityProof {
    const signature = sign(null, Buffer.from(identityMessage(nonce), 'utf8'), this.privateKey).toString('base64url');
    return { serverId: this.serverId, publicKey: this.publicKey, signature };
  }

  /** What the "pair a phone" card shows: addresses on the local network and the QR text. */
  pairing(): PairingInfo {
    const addresses = Object.values(networkInterfaces())
      .flat()
      // 169.254.x.x is link-local (an adapter without an address): no phone can use it.
      .filter((a) => a && a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.'))
      .map((a) => `${a!.address}:${this.config.port}`);
    return {
      name: this.name,
      serverId: this.serverId,
      addresses,
      payload: buildPairingPayload({ name: this.name, publicKey: this.publicKey, addresses }),
    };
  }
}
