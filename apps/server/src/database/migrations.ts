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
  `
  CREATE TABLE roles (
    id    TEXT PRIMARY KEY,
    name  TEXT NOT NULL
  );

  CREATE TABLE role_permissions (
    role_id     TEXT NOT NULL REFERENCES roles (id),
    permission  TEXT NOT NULL,
    PRIMARY KEY (role_id, permission)
  );

  CREATE TABLE users (
    id             INTEGER PRIMARY KEY,
    username       TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash  TEXT NOT NULL,
    role_id        TEXT NOT NULL REFERENCES roles (id),
    disabled       INTEGER NOT NULL DEFAULT 0,
    created_at     INTEGER NOT NULL
  );

  CREATE TABLE sessions (
    token_hash  TEXT PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users (id),
    created_at  INTEGER NOT NULL,
    expires_at  INTEGER NOT NULL
  );

  -- Initial profiles (RF-08). Permissions are data: they can be changed through the API.
  INSERT INTO roles (id, name) VALUES ('user', 'Usuario'), ('engineer', 'Ingeniería');
  INSERT INTO role_permissions (role_id, permission) VALUES
    ('user', 'nodes.read'),
    ('user', 'telemetry.read'),
    ('user', 'commands.read'),
    ('user', 'modules.read'),
    ('user', 'command:*:set_setpoint'),
    ('user', 'command:*:set_mode'),
    ('engineer', '*');
  `,
  `
  -- Per-node thresholds of the alarms declared by each module (RF-05).
  CREATE TABLE alarm_configs (
    node_id    TEXT NOT NULL REFERENCES nodes (id),
    alarm_key  TEXT NOT NULL,
    variable   TEXT NOT NULL,
    type       TEXT NOT NULL CHECK (type IN ('high', 'low')),
    threshold  REAL NOT NULL,
    deadband   REAL NOT NULL DEFAULT 0,
    enabled    INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (node_id, alarm_key)
  );

  -- One row per occurrence: raised, acknowledged and cleared (normalized) independently.
  CREATE TABLE alarms (
    id             INTEGER PRIMARY KEY,
    node_id        TEXT NOT NULL REFERENCES nodes (id),
    alarm_key      TEXT NOT NULL,
    raised_at      INTEGER NOT NULL,
    raised_value   REAL,
    detail         TEXT,
    acked_at       INTEGER,
    acked_by       TEXT,
    cleared_at     INTEGER,
    cleared_value  REAL
  );
  CREATE INDEX alarms_node_key ON alarms (node_id, alarm_key, cleared_at);

  INSERT INTO role_permissions (role_id, permission) VALUES ('user', 'alarms.read'), ('user', 'alarms.ack');
  `,
];
