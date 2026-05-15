CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS mondaydb_agentic_memories (
  account_id UUID NOT NULL,
  memory_id UUID NOT NULL,
  namespace TEXT NOT NULL,
  memory_type TEXT NOT NULL CHECK (memory_type IN ('semantic', 'procedural')),
  instruction TEXT,
  content TEXT NOT NULL,
  embedding VECTOR(1536),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_actor_id TEXT NOT NULL,
  source_actor_type TEXT NOT NULL CHECK (source_actor_type IN ('agent', 'human', 'system')),
  source_operation_id TEXT NOT NULL,
  version BIGINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, memory_id)
);

ALTER TABLE mondaydb_agentic_memories ENABLE ROW LEVEL SECURITY;

CREATE POLICY mondaydb_agentic_memories_account_isolation
  ON mondaydb_agentic_memories
  USING (account_id = current_setting('mondaydb.account_id', true)::uuid)
  WITH CHECK (account_id = current_setting('mondaydb.account_id', true)::uuid);

CREATE INDEX IF NOT EXISTS mondaydb_agentic_memories_lookup_idx
  ON mondaydb_agentic_memories (account_id, namespace, memory_type, updated_at DESC);

CREATE INDEX IF NOT EXISTS mondaydb_agentic_memories_metadata_idx
  ON mondaydb_agentic_memories USING gin (metadata jsonb_path_ops);

CREATE INDEX IF NOT EXISTS mondaydb_agentic_memories_embedding_hnsw_idx
  ON mondaydb_agentic_memories USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE TABLE IF NOT EXISTS mondaydb_agentic_audit_traces (
  account_id UUID NOT NULL,
  audit_digest TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('agent', 'human', 'system')),
  agent_run_id TEXT,
  operation_id TEXT NOT NULL,
  operation_kind TEXT NOT NULL,
  allowed BOOLEAN NOT NULL,
  reasons TEXT[] NOT NULL,
  policy_hash TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, audit_digest)
);

CREATE INDEX IF NOT EXISTS mondaydb_agentic_audit_actor_idx
  ON mondaydb_agentic_audit_traces (account_id, actor_id, occurred_at DESC);
