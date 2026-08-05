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
  block.includes("CREATE TYPE fact_publication_status"),
);
const vectorBlock = sqlBlocks.find((block) =>
  block.includes("CREATE TABLE agent_fact_surface_template_embedding"),
);
if (!ddlBlock || !vectorBlock) {
  throw new Error("could not locate executable SQL schema blocks");
}
if (
  !/CREATE TABLE agent_fact_surface_template_embedding \(\n\s+account_id/.test(
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

    INSERT INTO agent_fact_authorization_evidence (
      account_id, evidence_id, principal_id, policy_revision,
      resource_acl_revision, redacted_scope_summary,
      encrypted_evidence_ref, evidence_hash, immutable_archive_ref, created_at
    ) VALUES (
      101, '30000000-0000-0000-0000-000000000001', 'principal:test', 7, 11,
      '{"scopes":["fact.publish"]}', 'kms://evidence/fixture',
      repeat('8', 64), 'worm://evidence/fixture', now()
    );

    INSERT INTO agent_fact_surface_template (
      account_id, template_id, template_version, name, status,
      definition_hash, canonicalization_version, compiler_version,
      approval_validation_hash, authorization_evidence_id,
      authorization_snapshot_hash, supersession_policy, impact_class,
      requires_dual_control, max_related_fan_out, fact_schema,
      surface_key_expression, semantic_tags, procedure_ref,
      revocation_policy, created_by, created_at
    ) VALUES (
      101, '10000000-0000-0000-0000-000000000001', 1,
      'Incident severity fact surface', 'DRAFT',
      repeat('a', 64), 'jcs-v1', 'fact-compiler-1',
      NULL, '30000000-0000-0000-0000-000000000001',
      repeat('d', 64), 'REPLACE', 'MEDIUM', false, 4,
      '{"type":"object"}', 'incident:{item_id}:severity',
      ARRAY['incident', 'severity'], 'proc:publish-severity',
      'STOP_BEFORE_PUBLISH', 'principal:test', now()
    );

    INSERT INTO agent_fact_surface_template_field (
      account_id, template_id, template_version, field_id, ordinal,
      field_type, required, citation_required, instruction
    ) VALUES (
      101, '10000000-0000-0000-0000-000000000001', 1, 'severity', 1,
      'enum', true, true, '{"require":"grounded_severity"}'
    );

    SELECT approve_agent_fact_template(
      101,
      '10000000-0000-0000-0000-000000000001',
      1,
      repeat('a', 64),
      'principal:approver'
    );

    INSERT INTO agent_fact_certificate_catalog (
      account_id, certificate_id, certificate_hash, assertion_id,
      allows_publish_conclusion, status, freshness_fence, expires_at,
      created_at
    ) VALUES (
      101, '50000000-0000-0000-0000-000000000001', repeat('3', 64),
      '20000000-0000-0000-0000-000000000099', true, 'ACTIVE',
      'fence:row:42', now() + interval '5 minutes', now()
    );

    INSERT INTO agent_fact_publication (
      account_id, publication_id, template_id, template_version, status,
      state_revision, surface_key, purpose, idempotency_key,
      grounding_certificate_id, certificate_hash, fact_hash, fact_body,
      budget_read_units, budget_publish_units, budget_vector_units,
      budget_notify_units, consumed_read_units, consumed_publish_units,
      consumed_vector_units, consumed_notify_units, budget_max_wall_time_ms,
      max_related_fan_out, deadline_at, started_by, principal_id,
      authorization_evidence_id, delegated_scope_hash, authorization_revision,
      resource_scope_hash, bindings_sealed, dual_control_approved,
      created_at, updated_at
    ) VALUES (
      101, '20000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001', 1, 'DRAFT', 0,
      'incident:9:severity', 'Publish severity', 'request-1',
      '50000000-0000-0000-0000-000000000001', repeat('3', 64),
      repeat('b', 64), '{"severity":"P1"}'::jsonb, 100, 20, 5, 2, 0, 0, 0, 0,
      60000, 4, now() + interval '1 minute', 'principal:test',
      'principal:test', '30000000-0000-0000-0000-000000000001',
      repeat('e', 64), 7, repeat('f', 64), false, false, now(), now()
    );

    INSERT INTO agent_fact_publication_binding (
      account_id, publication_id, certificate_id, certificate_hash,
      binding_ordinal, sealed_revision, created_at
    ) VALUES (
      101, '20000000-0000-0000-0000-000000000001',
      '50000000-0000-0000-0000-000000000001', repeat('3', 64),
      1, 0, now()
    );

    UPDATE agent_fact_publication
    SET bindings_sealed = true,
        status = 'BINDINGS_SEALED',
        state_revision = 1,
        updated_at = now()
    WHERE account_id = 101
      AND publication_id = '20000000-0000-0000-0000-000000000001';

    INSERT INTO agent_fact_ledger_entry (
      account_id, ledger_entry_id, publication_id, surface_key, status,
      fact_hash, fact_body, supersedes_entry_id, citation_count_budget,
      published_at, created_at
    ) VALUES (
      101, '70000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000001', 'incident:9:severity',
      'CURRENT', repeat('b', 64), '{"severity":"P1"}'::jsonb, NULL, 100,
      now(), now()
    );

    UPDATE agent_fact_publication
    SET status = 'PUBLISHED',
        ledger_entry_id = '70000000-0000-0000-0000-000000000001',
        state_revision = 2,
        updated_at = now()
    WHERE account_id = 101
      AND publication_id = '20000000-0000-0000-0000-000000000001';

    INSERT INTO agent_fact_current_pointer (
      account_id, surface_key, ledger_entry_id, publication_id, fact_hash,
      updated_at
    ) VALUES (
      101, 'incident:9:severity', '70000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000001', repeat('b', 64), now()
    );

    INSERT INTO agent_fact_surface_template_embedding (
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

        INSERT INTO agent_fact_publication (
          account_id, publication_id, template_id, template_version, status,
          state_revision, surface_key, purpose, idempotency_key,
          grounding_certificate_id, certificate_hash, fact_hash, fact_body,
          budget_read_units, budget_publish_units, budget_vector_units,
          budget_notify_units, consumed_read_units, consumed_publish_units,
          consumed_vector_units, consumed_notify_units, budget_max_wall_time_ms,
          max_related_fan_out, deadline_at, started_by, principal_id,
          authorization_evidence_id, delegated_scope_hash,
          authorization_revision, resource_scope_hash, bindings_sealed,
          dual_control_approved, created_at, updated_at
        ) VALUES (
          101, '20000000-0000-0000-0000-000000000002',
          '10000000-0000-0000-0000-000000000001', 1, 'DRAFT', 0,
          'incident:9:severity', 'Duplicate request', 'request-1',
          '50000000-0000-0000-0000-000000000001', repeat('3', 64),
          repeat('c', 64), '{"severity":"P2"}'::jsonb, 100, 20, 5, 2, 0, 0, 0,
          0, 60000, 4, now() + interval '1 minute', 'principal:test',
          'principal:test', '30000000-0000-0000-0000-000000000001',
          repeat('e', 64), 7, repeat('f', 64), false, false, now(), now()
        );
      `),
    "duplicate tenant idempotency key",
    "23505",
  );

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);

        UPDATE agent_fact_surface_template_field
        SET required = false
        WHERE account_id = 101
          AND template_id = '10000000-0000-0000-0000-000000000001'
          AND template_version = 1
          AND field_id = 'severity';
      `),
    "mutation of a sealed procedure",
    "P0001",
  );

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);

        INSERT INTO agent_fact_surface_template (
          account_id, template_id, template_version, name, status,
          definition_hash, canonicalization_version, compiler_version,
          approval_validation_hash, authorization_evidence_id,
          authorization_snapshot_hash, supersession_policy, impact_class,
          requires_dual_control, max_related_fan_out, fact_schema,
          surface_key_expression, semantic_tags, revocation_policy,
          created_by, created_at, approved_by, approved_at
        ) VALUES (
          101, '10000000-0000-0000-0000-000000000002', 1,
          'Bypass approval', 'APPROVED', repeat('a', 64), 'jcs-v1',
          'fact-compiler-1', repeat('a', 64),
          '30000000-0000-0000-0000-000000000001', repeat('d', 64),
          'REPLACE', 'LOW', false, 2, '{"type":"object"}',
          'unsafe:{id}', ARRAY['unsafe'], 'STOP_BEFORE_PUBLISH',
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

        INSERT INTO agent_fact_publication_binding (
          account_id, publication_id, certificate_id, certificate_hash,
          binding_ordinal, sealed_revision, created_at
        ) VALUES (
          101, '20000000-0000-0000-0000-000000000001',
          '50000000-0000-0000-0000-000000000001', repeat('3', 64),
          2, 1, now()
        );
      `),
    "mutation of sealed publication bindings",
    "P0001",
  );

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);

        UPDATE agent_fact_surface_template
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

        UPDATE agent_fact_ledger_entry
        SET fact_hash = repeat('7', 64)
        WHERE account_id = 101
          AND ledger_entry_id = '70000000-0000-0000-0000-000000000001';
      `),
    "mutation of ledger identity",
    "P0001",
  );

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);

        INSERT INTO agent_fact_notify_intent (
          account_id, notify_id, publication_id, ledger_entry_id,
          intent_status, provider_idempotency_key, generation,
          canonical_request_hash, created_at, updated_at
        ) VALUES (
          101, '60000000-0000-0000-0000-000000000001',
          '20000000-0000-0000-0000-000000000001',
          '70000000-0000-0000-0000-000000000001', 'UNKNOWN_EFFECT',
          'provider-key-1', 1, repeat('4', 64), now(), now()
        );
      `),
    "insertion of a non-prepared notify intent",
    "P0001",
  );

  await database.exec(`
    SELECT set_config('app.account_id', '101', true);

    INSERT INTO agent_fact_notify_intent (
      account_id, notify_id, publication_id, ledger_entry_id,
      intent_status, provider_idempotency_key, generation,
      canonical_request_hash, created_at, updated_at
    ) VALUES (
      101, '60000000-0000-0000-0000-000000000002',
      '20000000-0000-0000-0000-000000000001',
      '70000000-0000-0000-0000-000000000001', 'PREPARED',
      'provider-key-2', 0, repeat('5', 64), now(), now()
    );
  `);

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);

        UPDATE agent_fact_notify_intent
        SET canonical_request_hash = repeat('7', 64)
        WHERE account_id = 101
          AND notify_id = '60000000-0000-0000-0000-000000000002';
      `),
    "mutation of a prepared notify identity",
    "P0001",
  );

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);

        UPDATE agent_fact_surface_template
        SET definition_hash = repeat('9', 64)
        WHERE account_id = 101
          AND template_id = '10000000-0000-0000-0000-000000000001'
          AND template_version = 1;
      `),
    "mutation of sealed template definition",
    "P0001",
  );

  const tenantCount = await database.query(
    "SELECT count(*)::int AS count FROM agent_fact_publication WHERE account_id = 101",
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
