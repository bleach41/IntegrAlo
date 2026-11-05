/**
 * Schema migrations. Never edit an applied migration: add a new one at the end.
 * Times are stored as Unix milliseconds (platform clock).
 */
export const MIGRATIONS: string[] = [
  `
  CREATE TABLE nodes (
    id           TEXT PRIMARY KEY,
    module       TEXT NOT NULL,
    fw           TEXT NOT NULL,
    name         TEXT,
    approval     TEXT NOT NULL DEFAULT 'pending' CHECK (approval IN ('pending', 'approved')),
    online       INTEGER NOT NULL DEFAULT 0,
    first_seen   INTEGER NOT NULL,
    last_seen    INTEGER NOT NULL,
    approved_at  INTEGER
  );

  CREATE TABLE telemetry (
    id           INTEGER PRIMARY KEY,
    node_id      TEXT NOT NULL REFERENCES nodes (id),
    received_at  INTEGER NOT NULL,
    seq          INTEGER NOT NULL,
    values_json  TEXT NOT NULL
  );
  CREATE INDEX telemetry_node_time ON telemetry (node_id, received_at);

  CREATE TABLE commands (
    id           TEXT PRIMARY KEY,
    node_id      TEXT NOT NULL REFERENCES nodes (id),
    type         TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    status       TEXT NOT NULL CHECK (status IN ('sent', 'confirmed', 'rejected', 'unconfirmed')),
    reason       TEXT,
    state_json   TEXT,
    sent_at      INTEGER NOT NULL,
    resolved_at  INTEGER
  );
  CREATE INDEX commands_node_time ON commands (node_id, sent_at);

  CREATE TABLE events (
    id           INTEGER PRIMARY KEY,
    at           INTEGER NOT NULL,
    kind         TEXT NOT NULL,
    node_id      TEXT,
    actor        TEXT NOT NULL,
    detail_json  TEXT
  );
  CREATE INDEX events_time ON events (at);
  `,
];
