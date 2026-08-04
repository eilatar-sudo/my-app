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
  block.includes("CREATE TYPE grounding_assertion_status"),
);
const vectorBlock = sqlBlocks.find((block) =>
  block.includes("CREATE TABLE agent_grounding_claim_template_embedding"),
);
if (!ddlBlock || !vectorBlock) {
  throw new Error("could not locate executable SQL schema blocks");
}
if (
  !/CREATE TABLE agent_grounding_claim_template_embedding \(\n\s+account_id/.test(
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

    INSERT INTO agent_grounding_authorization_evidence (
      account_id, evidence_id, principal_id, policy_revision,
      resource_acl_revision, redacted_scope_summary,
      encrypted_evidence_ref, evidence_hash, immutable_archive_ref, created_at
    ) VALUES (
      101, '30000000-0000-0000-0000-000000000001', 'principal:test', 7, 11,
      '{"scopes":["claim.verify"]}', 'kms://evidence/fixture',
      repeat('8', 64), 'worm://evidence/fixture', now()
    );

    INSERT INTO agent_grounding_claim_template (
      account_id, template_id, template_version, name, status,
      definition_hash, canonicalization_version, compiler_version,
      approval_validation_hash, authorization_evidence_id,
      authorization_snapshot_hash, freshness_policy, max_bindings,
      max_remediation_depth, allowed_operations, claim_schema, semantic_tags,
      revocation_policy, created_by, created_at
    ) VALUES (
      101, '10000000-0000-0000-0000-000000000001', 1,
      'Incident severity grounded claim', 'DRAFT',
      repeat('a', 64), 'jcs-v1', 'grounding-compiler-1',
      NULL, '30000000-0000-0000-0000-000000000001',
      repeat('d', 64), 'BOUNDED_STALENESS', 8, 3,
      ARRAY['WRITEBACK', 'MEMORY_PROMOTE']::grounding_certificate_operation[],
      '{"type":"object"}', ARRAY['incident', 'severity'],
      'STOP_BEFORE_VERIFY', 'principal:test', now()
    );

    INSERT INTO agent_grounding_claim_template_predicate (
      account_id, template_id, template_version, predicate_id, ordinal,
      evidence_kinds, min_bindings, max_bindings, required, instruction,
      procedure_ref
    ) VALUES (
      101, '10000000-0000-0000-0000-000000000001', 1, 'has_status_signal', 1,
      ARRAY['board_item_snapshot', 'audit_packet'], 1, 4, true,
      '{"require":"status_column"}', 'proc:gather-status-evidence'
    );

    SELECT approve_agent_grounding_template(
      101,
      '10000000-0000-0000-0000-000000000001',
      1,
      repeat('a', 64),
      'principal:approver'
    );

    INSERT INTO agent_grounding_evidence_catalog (
      account_id, evidence_packet_id, packet_hash, evidence_kind,
      redaction_envelope_id, visibility_ok, revoked, source_watermark,
      observed_at
    ) VALUES (
      101, '40000000-0000-0000-0000-000000000001', repeat('1', 64),
      'board_item_snapshot', 'redaction:public', true, false,
      'row:101:board:9:wm:42', now()
    );

    INSERT INTO agent_grounding_assertion (
      account_id, assertion_id, template_id, template_version, status,
      state_revision, purpose, idempotency_key, claim_hash, claim_body,
      budget_read_units, budget_verify_units, budget_vector_units,
      budget_tool_units, consumed_read_units, consumed_verify_units,
      consumed_vector_units, consumed_tool_units, budget_max_wall_time_ms,
      max_remediation_depth, remediation_depth, deadline_at, started_by,
      principal_id, authorization_evidence_id, delegated_scope_hash,
      authorization_revision, resource_scope_hash, bindings_sealed,
      created_at, updated_at
    ) VALUES (
      101, '20000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001', 1, 'DRAFT', 0,
      'Severity is P1', 'request-1', repeat('b', 64),
      '{"severity":"P1"}'::jsonb, 100, 20, 5, 2, 0, 0, 0, 0, 60000,
      3, 0, now() + interval '1 minute', 'principal:test', 'principal:test',
      '30000000-0000-0000-0000-000000000001', repeat('e', 64), 7,
      repeat('f', 64), false, now(), now()
    );

    INSERT INTO agent_grounding_evidence_binding (
      account_id, assertion_id, evidence_packet_id, packet_hash, predicate_id,
      redaction_envelope_id, binding_role, binding_ordinal, sealed_revision,
      created_at
    ) VALUES (
      101, '20000000-0000-0000-0000-000000000001',
      '40000000-0000-0000-0000-000000000001', repeat('1', 64),
      'has_status_signal', 'redaction:public', 'SUPPORTS', 1, 0, now()
    );

    UPDATE agent_grounding_assertion
    SET bindings_sealed = true,
        status = 'BINDINGS_SEALED',
        state_revision = 1,
        updated_at = now()
    WHERE account_id = 101
      AND assertion_id = '20000000-0000-0000-0000-000000000001';

    INSERT INTO agent_grounding_verification_run (
      account_id, assertion_id, run_no, status, lease_generation,
      result_hash, freshness_fence, started_at, finished_at
    ) VALUES (
      101, '20000000-0000-0000-0000-000000000001', 1, 'GROUNDED', 1,
      repeat('2', 64), 'fence:row:42', now(), now()
    );

    INSERT INTO agent_grounding_certificate (
      account_id, certificate_id, assertion_id, run_no, status,
      certificate_hash, allowed_operations, freshness_fence, expires_at,
      created_at
    ) VALUES (
      101, '50000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000001', 1, 'ACTIVE',
      repeat('3', 64),
      ARRAY['WRITEBACK', 'MEMORY_PROMOTE']::grounding_certificate_operation[],
      'fence:row:42', now() + interval '5 minutes', now()
    );

    INSERT INTO agent_grounding_claim_template_embedding (
      account_id, template_id, template_version, embedding_model,
      embedding_dims, embedding, definition_hash, source_watermark, updated_at
    ) VALUES (
      101, '10000000-0000-0000-0000-000000000001', 1, 'text-embedding-test',
      1536, array_fill(0.01::real, ARRAY[1536])::vector, repeat('a', 64),
      'template-wm:1', now()
    );
  `);

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);

        INSERT INTO agent_grounding_assertion (
          account_id, assertion_id, template_id, template_version, status,
          state_revision, purpose, idempotency_key, claim_hash, claim_body,
          budget_read_units, budget_verify_units, budget_vector_units,
          budget_tool_units, consumed_read_units, consumed_verify_units,
          consumed_vector_units, consumed_tool_units, budget_max_wall_time_ms,
          max_remediation_depth, remediation_depth, deadline_at, started_by,
          principal_id, authorization_evidence_id, delegated_scope_hash,
          authorization_revision, resource_scope_hash, bindings_sealed,
          created_at, updated_at
        ) VALUES (
          101, '20000000-0000-0000-0000-000000000002',
          '10000000-0000-0000-0000-000000000001', 1, 'DRAFT', 0,
          'Duplicate request', 'request-1', repeat('c', 64),
          '{"severity":"P2"}'::jsonb, 100, 20, 5, 2, 0, 0, 0, 0, 60000,
          3, 0, now() + interval '1 minute', 'principal:test', 'principal:test',
          '30000000-0000-0000-0000-000000000001', repeat('e', 64), 7,
          repeat('f', 64), false, now(), now()
        );
      `),
    "duplicate tenant idempotency key",
    "23505",
  );

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);

        UPDATE agent_grounding_claim_template_predicate
        SET min_bindings = 2
        WHERE account_id = 101
          AND template_id = '10000000-0000-0000-0000-000000000001'
          AND template_version = 1
          AND predicate_id = 'has_status_signal';
      `),
    "mutation of a sealed procedure",
    "P0001",
  );

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);

        INSERT INTO agent_grounding_claim_template (
          account_id, template_id, template_version, name, status,
          definition_hash, canonicalization_version, compiler_version,
          approval_validation_hash, authorization_evidence_id,
          authorization_snapshot_hash, freshness_policy, max_bindings,
          max_remediation_depth, allowed_operations, claim_schema,
          semantic_tags, revocation_policy, created_by, created_at,
          approved_by, approved_at
        ) VALUES (
          101, '10000000-0000-0000-0000-000000000002', 1,
          'Bypass approval', 'APPROVED', repeat('a', 64), 'jcs-v1',
          'grounding-compiler-1', repeat('a', 64),
          '30000000-0000-0000-0000-000000000001', repeat('d', 64),
          'BOUNDED_STALENESS', 4, 2,
          ARRAY['WRITEBACK']::grounding_certificate_operation[],
          '{"type":"object"}', ARRAY['unsafe'], 'STOP_BEFORE_VERIFY',
          'principal:test', now(), 'principal:test', now()
        );
      `),
    "insertion of a pre-approved template",
    "P0001",
  );

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);

        INSERT INTO agent_grounding_evidence_binding (
          account_id, assertion_id, evidence_packet_id, packet_hash,
          predicate_id, redaction_envelope_id, binding_role, binding_ordinal,
          sealed_revision, created_at
        ) VALUES (
          101, '20000000-0000-0000-0000-000000000001',
          '40000000-0000-0000-0000-000000000001', repeat('1', 64),
          'has_status_signal', 'redaction:public', 'CONTEXT', 2, 1, now()
        );
      `),
    "mutation of sealed evidence bindings",
    "P0001",
  );

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);

        UPDATE agent_grounding_claim_template
        SET status = 'REVOKED',
            revoked_by = 'principal:unauthorized',
            revoked_at = now()
        WHERE account_id = 101
          AND template_id = '10000000-0000-0000-0000-000000000001'
          AND template_version = 1;
      `),
    "direct template revocation",
    "P0001",
  );

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);

        INSERT INTO agent_grounding_certificate (
          account_id, certificate_id, assertion_id, run_no, status,
          certificate_hash, allowed_operations, freshness_fence, expires_at,
          created_at
        ) VALUES (
          101, '50000000-0000-0000-0000-000000000002',
          '20000000-0000-0000-0000-000000000001', 1, 'CONSUMED',
          repeat('9', 64),
          ARRAY['WRITEBACK']::grounding_certificate_operation[],
          'fence:row:42', now() + interval '5 minutes', now()
        );
      `),
    "insertion of an already-consumed certificate",
    "P0001",
  );

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);

        UPDATE agent_grounding_certificate
        SET certificate_hash = repeat('7', 64)
        WHERE account_id = 101
          AND certificate_id = '50000000-0000-0000-0000-000000000001';
      `),
    "mutation of certificate identity",
    "P0001",
  );

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);

        INSERT INTO agent_grounding_refresh_intent (
          account_id, refresh_id, assertion_id, evidence_packet_id,
          intent_status, provider_idempotency_key, generation,
          canonical_request_hash, created_at, updated_at
        ) VALUES (
          101, '60000000-0000-0000-0000-000000000001',
          '20000000-0000-0000-0000-000000000001',
          '40000000-0000-0000-0000-000000000001', 'UNKNOWN_EFFECT',
          'provider-key-1', 1, repeat('4', 64), now(), now()
        );
      `),
    "insertion of a non-prepared refresh intent",
    "P0001",
  );

  await database.exec(`
    SELECT set_config('app.account_id', '101', true);

    INSERT INTO agent_grounding_refresh_intent (
      account_id, refresh_id, assertion_id, evidence_packet_id,
      intent_status, provider_idempotency_key, generation,
      canonical_request_hash, created_at, updated_at
    ) VALUES (
      101, '60000000-0000-0000-0000-000000000002',
      '20000000-0000-0000-0000-000000000001',
      '40000000-0000-0000-0000-000000000001', 'PREPARED',
      'provider-key-2', 0, repeat('5', 64), now(), now()
    );
  `);

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);

        UPDATE agent_grounding_refresh_intent
        SET canonical_request_hash = repeat('7', 64)
        WHERE account_id = 101
          AND refresh_id = '60000000-0000-0000-0000-000000000002';
      `),
    "mutation of a prepared refresh identity",
    "P0001",
  );

  const tenantCount = await database.query(
    "SELECT count(*)::int AS count FROM agent_grounding_assertion WHERE account_id = 101",
  );
  if (tenantCount.rows[0]?.count !== 1) {
    throw new Error("tenant-scoped fixture was not preserved");
  }

  const policies = await database.query(`
    SELECT count(*)::int AS count
    FROM pg_policies
    WHERE policyname = 'tenant_isolation'
  `);
  if ((policies.rows[0]?.count ?? 0) < tableCount) {
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
        executableConstraintChecks: 9,
        tenantPoliciesChecked: tableCount,
      },
      status: "ok",
    },
    null,
    2,
  ),
);
