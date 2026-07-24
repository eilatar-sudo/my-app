import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";
import { buildSchema, validateSchema } from "graphql";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";

const path = process.argv[2];
if (!path) {
  throw new Error("usage: validate-strategy-doc.mjs <markdown-path>");
}

const markdown = await readFile(path, "utf8");

function fencedBlocks(language) {
  const expression = new RegExp(
    `^\\\`\\\`\\\`${language}\\n([\\s\\S]*?)^\\\`\\\`\\\`$`,
    "gm",
  );
  return [...markdown.matchAll(expression)].map((match) => match[1]);
}

async function validateTypeScript(source) {
  const directory = await mkdtemp(join(tmpdir(), "strategy-contracts-"));
  const fileName = join(directory, "contracts.ts");
  try {
    await writeFile(fileName, source, "utf8");
    const compiler = spawnSync(
      join(process.cwd(), "node_modules", ".bin", "tsc"),
      [
        fileName,
        "--strict",
        "--noEmit",
        "--skipLibCheck",
        "--target",
        "ES2022",
      ],
      { encoding: "utf8" },
    );
    if (compiler.status !== 0) {
      throw new Error(
        `TypeScript validation failed:\n${compiler.stdout}${compiler.stderr}`,
      );
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function expectDatabaseRejection(operation, reason, expectedCode) {
  try {
    await operation();
  } catch (error) {
    if (
      expectedCode !== undefined &&
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code !== expectedCode
    ) {
      throw new Error(
        `${reason} rejected with SQLSTATE ${String(error.code)}, expected ${expectedCode}`,
      );
    }
    return;
  }
  throw new Error(`database accepted invalid operation: ${reason}`);
}

const fenceCount = markdown.match(/^```/gm)?.length ?? 0;
if (fenceCount % 2 !== 0) {
  throw new Error(`unbalanced Markdown fences: ${fenceCount}`);
}

for (let section = 1; section <= 21; section += 1) {
  if (!markdown.includes(`## ${section}.`)) {
    throw new Error(`missing required section ${section}`);
  }
}

for (const requiredStatement of [
  "FULL SCAN REJECTED",
  "account_id",
  "UNKNOWN_EFFECT",
  "99.99%",
  "procedural memory",
  "HNSW",
]) {
  if (!markdown.includes(requiredStatement)) {
    throw new Error(`missing required strategy statement: ${requiredStatement}`);
  }
}

const typeScriptBlocks = fencedBlocks("ts");
const sqlBlocks = fencedBlocks("sql");
const graphQLBlocks = fencedBlocks("graphql");
if (typeScriptBlocks.length < 2 || sqlBlocks.length < 2) {
  throw new Error("expected multiple TypeScript and SQL contract blocks");
}
if (graphQLBlocks.length !== 1) {
  throw new Error(`expected one GraphQL block, found ${graphQLBlocks.length}`);
}

await validateTypeScript(typeScriptBlocks.join("\n\n"));

const schema = buildSchema(graphQLBlocks[0]);
const graphQLErrors = validateSchema(schema);
if (graphQLErrors.length > 0) {
  throw new Error(
    `GraphQL validation failed:\n${graphQLErrors
      .map((error) => error.message)
      .join("\n")}`,
  );
}

const ddlBlock = sqlBlocks.find((block) =>
  block.includes("CREATE TYPE saga_status"),
);
const vectorBlock = sqlBlocks.find((block) =>
  block.includes("CREATE TABLE agent_saga_template_embedding"),
);
if (!ddlBlock || !vectorBlock) {
  throw new Error("could not locate executable SQL schema blocks");
}
if (
  !/CREATE TABLE agent_saga_template_embedding \(\n\s+account_id/.test(
    vectorBlock,
  )
) {
  throw new Error("vector schema does not lead with account_id");
}
if (vectorBlock.includes("USING hnsw")) {
  throw new Error("reference schema must not create a cross-tenant HNSW index");
}

const tableCount = (ddlBlock.match(/CREATE TABLE /g) ?? []).length;
const indexCount = (
  ddlBlock.match(/CREATE (?:UNIQUE )?INDEX /g) ?? []
).length;
if (tableCount < 17) {
  throw new Error(`expected at least 17 relational tables, found ${tableCount}`);
}
if (indexCount < 10) {
  throw new Error(`expected at least 10 tenant access indexes, found ${indexCount}`);
}

for (const tableDefinition of ddlBlock.matchAll(
  /CREATE TABLE ([a-z0-9_]+) \(\n\s+([a-z0-9_]+)/g,
)) {
  if (tableDefinition[2] !== "account_id") {
    throw new Error(`${tableDefinition[1]} does not lead with account_id`);
  }
}
for (const indexDefinition of ddlBlock.matchAll(
  /CREATE (?:UNIQUE )?INDEX ([a-z0-9_]+)[\s\S]*?\(\n\s+([a-z0-9_]+)/g,
)) {
  if (indexDefinition[2] !== "account_id") {
    throw new Error(`${indexDefinition[1]} does not lead with account_id`);
  }
}

const database = await PGlite.create({ extensions: { vector } });
try {
  await database.exec("CREATE EXTENSION IF NOT EXISTS vector;");
  await database.exec(ddlBlock);
  await database.exec(vectorBlock);

  await database.exec(`
    SELECT set_config('app.account_id', '101', true);

    INSERT INTO agent_saga_authorization_evidence (
      account_id, evidence_id, principal_id, policy_revision,
      resource_acl_revision, redacted_scope_summary,
      encrypted_evidence_ref, evidence_hash, immutable_archive_ref, created_at
    ) VALUES (
      101, '30000000-0000-0000-0000-000000000001', 'principal:test', 7, 11,
      '{"scopes":["ticket.create"]}', 'kms://evidence/fixture',
      repeat('8', 64), 'worm://evidence/fixture', now()
    );

    INSERT INTO agent_saga_template (
      account_id, template_id, template_version, name, status,
      definition_hash, canonicalization_version, compiler_version,
      approval_validation_hash, authorization_evidence_id,
      authorization_snapshot_hash, revocation_policy, input_schema, semantic_tags,
      max_steps, max_parallelism, created_by, created_at
    ) VALUES (
      101, '10000000-0000-0000-0000-000000000001', 1,
      'Safe ticket escalation', 'DRAFT',
      repeat('a', 64), 'jcs-v1', 'saga-compiler-1',
      NULL, '30000000-0000-0000-0000-000000000001',
      repeat('d', 64), 'STOP_BEFORE_NEXT_EFFECT',
      '{"type":"object"}', ARRAY['ticket', 'safe'],
      4, 2, 'principal:test', now()
    );

    INSERT INTO agent_saga_template_step (
      account_id, template_id, template_version, step_id, ordinal,
      step_kind, capability, timeout_ms, max_attempts,
      idempotency_required, compensation_step_id, instruction,
      precondition, estimated_read_units, estimated_write_units,
      estimated_tool_units
    ) VALUES (
      101, '10000000-0000-0000-0000-000000000001', 1, 'open_ticket', 1,
      'EXTERNAL_EFFECT', 'ticket.create', 5000, 2, true, NULL,
      '{"action":"create_ticket"}', '{"approved":true}', 1, 1, 1
    );

    SELECT approve_agent_saga_template(
      101,
      '10000000-0000-0000-0000-000000000001',
      1,
      repeat('a', 64),
      'principal:approver'
    );

    INSERT INTO agent_saga_instance (
      account_id, saga_id, template_id, template_version, status,
      state_revision, purpose, idempotency_key, input_hash, budget_read_units,
      budget_write_units, budget_tool_units, consumed_read_units,
      consumed_write_units, consumed_tool_units, budget_max_wall_time_ms,
      deadline_at, consistency_mode, started_by, principal_id,
      authorization_evidence_id, delegated_scope_hash,
      authorization_revision, resource_scope_hash,
      created_at, updated_at
    ) VALUES (
      101, '20000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001', 1, 'READY', 0,
      'Escalate customer incident', 'request-1', repeat('b', 64),
      100, 20, 3, 0, 0, 0, 60000, now() + interval '1 minute',
      'BOUNDED_STALENESS', 'principal:test', 'principal:test',
      '30000000-0000-0000-0000-000000000001',
      repeat('e', 64), 7, repeat('f', 64), now(), now()
    );
  `);

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '202', true);

        INSERT INTO agent_saga_instance (
          account_id, saga_id, template_id, template_version, status,
          state_revision, purpose, idempotency_key, input_hash, budget_read_units,
          budget_write_units, budget_tool_units, consumed_read_units,
          consumed_write_units, consumed_tool_units, budget_max_wall_time_ms,
          deadline_at, consistency_mode, started_by, principal_id,
          authorization_evidence_id, delegated_scope_hash,
          authorization_revision, resource_scope_hash,
          created_at, updated_at
        ) VALUES (
          202, '20000000-0000-0000-0000-000000000003',
          '10000000-0000-0000-0000-000000000001', 1, 'READY', 0,
          'Cross-account request', 'request-x', repeat('c', 64),
          100, 20, 3, 0, 0, 0, 60000, now() + interval '1 minute',
          'BOUNDED_STALENESS', 'principal:test', 'principal:test',
          '30000000-0000-0000-0000-000000000001',
          repeat('e', 64), 7, repeat('f', 64), now(), now()
        );
      `),
    "cross-account template reference",
    "23503",
  );

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);

        INSERT INTO agent_saga_instance (
          account_id, saga_id, template_id, template_version, status,
          state_revision, purpose, idempotency_key, input_hash, budget_read_units,
          budget_write_units, budget_tool_units, consumed_read_units,
          consumed_write_units, consumed_tool_units, budget_max_wall_time_ms,
          deadline_at, consistency_mode, started_by, principal_id,
          authorization_evidence_id, delegated_scope_hash,
          authorization_revision, resource_scope_hash,
          created_at, updated_at
        ) VALUES (
          101, '20000000-0000-0000-0000-000000000002',
          '10000000-0000-0000-0000-000000000001', 1, 'READY', 0,
          'Duplicate request', 'request-1', repeat('c', 64),
          100, 20, 3, 0, 0, 0, 60000, now() + interval '1 minute',
          'BOUNDED_STALENESS', 'principal:test', 'principal:test',
          '30000000-0000-0000-0000-000000000001',
          repeat('e', 64), 7, repeat('f', 64), now(), now()
        );
      `),
    "duplicate tenant idempotency key",
    "23505",
  );

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);

        UPDATE agent_saga_template_step
        SET timeout_ms = 6000
        WHERE account_id = 101
          AND template_id = '10000000-0000-0000-0000-000000000001'
          AND template_version = 1
          AND step_id = 'open_ticket';
      `),
    "mutation of a sealed procedure",
    "P0001",
  );

  const tenantCount = await database.query(
    "SELECT count(*)::int AS count FROM agent_saga_instance WHERE account_id = 101",
  );
  if (tenantCount.rows[0]?.count !== 1) {
    throw new Error("tenant-scoped fixture was not preserved");
  }

  const policies = await database.query(`
    SELECT count(*)::int AS count
    FROM pg_policies
    WHERE policyname = 'tenant_isolation'
  `);
  if ((policies.rows[0]?.count ?? 0) < tableCount + 1) {
    throw new Error("not every table has a tenant isolation policy");
  }
} finally {
  await database.close();
}

const rootFieldCounts = Object.fromEntries(
  ["Query", "Mutation"].map((name) => [
    name,
    Object.keys(schema.getType(name).getFields()).length,
  ]),
);

console.log(
  JSON.stringify(
    {
      document: path,
      markdownFencePairs: fenceCount / 2,
      sections: 21,
      typeScriptBlocks: typeScriptBlocks.length,
      graphQL: rootFieldCounts,
      sql: {
        tables: tableCount + 1,
        indexes: indexCount,
        executableConstraintChecks: 3,
        tenantPoliciesChecked: tableCount + 1,
      },
      status: "ok",
    },
    null,
    2,
  ),
);
