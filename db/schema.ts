export const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS worlds (
    id TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    snapshot_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (owner_id, id)
  )`,
  `CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    world_id TEXT NOT NULL,
    gm_peer_id TEXT NOT NULL,
    gm_name TEXT NOT NULL,
    active_until INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS participants (
    id TEXT NOT NULL,
    room_id TEXT NOT NULL,
    token_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    last_seen_at INTEGER NOT NULL,
    PRIMARY KEY (room_id, id),
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS idx_participants_room_seen
    ON participants(room_id, last_seen_at)`,
  `CREATE TABLE IF NOT EXISTS room_events (
    sequence INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id TEXT NOT NULL,
    event_id TEXT NOT NULL,
    author_peer_id TEXT NOT NULL,
    target_peer_id TEXT,
    envelope_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    UNIQUE (room_id, event_id),
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS idx_room_events_room_sequence
    ON room_events(room_id, sequence)`
] as const;
