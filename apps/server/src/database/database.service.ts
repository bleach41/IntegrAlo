import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { APP_CONFIG, AppConfig } from '../config';
import { MIGRATIONS } from './migrations';

/**
 * SQLite through Node's built-in driver (node:sqlite): no native module to compile,
 * which keeps the all-in-one installation simple.
 * WAL journal + synchronous=NORMAL: a power cut can lose the last transactions,
 * but never corrupts the database (requirement RNF-02).
 */
@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  readonly db: DatabaseSync;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    if (config.databasePath !== ':memory:') {
      mkdirSync(dirname(config.databasePath), { recursive: true });
    }
    this.db = new DatabaseSync(config.databasePath);
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON;');
    this.migrate();
  }

  onModuleDestroy(): void {
    this.db.close();
  }

  /** Runs pending migrations in order, each inside a transaction. */
  private migrate(): void {
    this.db.exec('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)');
    const row = this.db.prepare('SELECT MAX(version) AS version FROM schema_version').get() as { version: number | null };
    const current = row.version ?? 0;
    for (const [index, sql] of MIGRATIONS.entries()) {
      const version = index + 1;
      if (version <= current) continue;
      this.transaction(() => {
        this.db.exec(sql);
        this.db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(version);
      });
      this.logger.log(`database migrated to version ${version}`);
    }
  }

  transaction<T>(work: () => T): T {
    this.db.exec('BEGIN');
    try {
      const result = work();
      this.db.exec('COMMIT');
      return result;
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }
}
