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
  block.includes("CREATE TYPE th_session_status"),
);
const vectorBlock = sqlBlocks.find((block) =>
  block.includes("CREATE TABLE agent_th_profile_embedding"),
);
if (!ddlBlock || !vectorBlock) {
  throw new Error("could not locate executable SQL schema blocks");
}
if (
  !/CREATE TABLE agent_th_profile_embedding \(\n\s+account_id/.test(
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

    INSERT INTO agent_th_authorization_evidence (
      account_id, evidence_id, principal_id, policy_revision,
      resource_acl_revision, redacted_scope_summary,
      encrypted_evidence_ref, evidence_hash, immutable_archive_ref, created_at
    ) VALUES (
      101, '30000000-0000-0000-0000-000000000001', 'principal:test', 7, 11,
      '{"scopes":["thaw.sla"]}', 'kms://evidence/fixture',
      repeat('8', 64), 'worm://evidence/fixture', now()
    );

    INSERT INTO agent_th_profile (
      account_id, profile_id, profile_version, name, status,
      definition_hash, canonicalization_version, compiler_version,
      approval_validation_hash, authorization_evidence_id,
      authorization_snapshot_hash, thaw_threshold, extend_threshold,
      sla_duration_ms, max_holds_per_certificate, semantic_tags, procedure_ref,
      revocation_policy, created_by, created_at
    ) VALUES (
      101, '10000000-0000-0000-0000-000000000001', 1,
      'Incident thaw SLA', 'DRAFT',
      repeat('a', 64), 'jcs-v1', 'th-compiler-1',
      NULL, '30000000-0000-0000-0000-000000000001',
      repeat('d', 64), 2, 2, 86400000, 32,
      ARRAY['incident', 'thaw-sla'], 'proc:thaw-sla-incident',
      'STOP_BEFORE_ARM', 'principal:test', now()
    );

    INSERT INTO agent_th_profile_thaw_rule (
      account_id, profile_id, profile_version, rule_id, ordinal,
      allowed_case_kinds, thaw_threshold, extend_threshold, sla_duration_ms,
      require_notify, thaw_instruction
    ) VALUES (
      101, '10000000-0000-0000-0000-000000000001', 1, 'thaw-case', 1,
      ARRAY['SEALED_FREEZE_CERT', 'UNRELEASED_FREEZE_HOLD'], 2, 2, 86400000,
      true, '{"narrow_only":true,"no_winner":true,"no_auto_restore":true}'
    );

    SELECT approve_agent_th_profile(
      101,
      '10000000-0000-0000-0000-000000000001',
      1,
      repeat('a', 64),
      'principal:approver'
    );

    INSERT INTO agent_th_freeze_catalog (
      account_id, case_id, source_freeze_certificate_id, freeze_session_id,
      case_ref, case_kind, status, disputed_fact_hash, attenuation_hash,
      halt_scope_hash, freeze_sealed_at, freeze_caster_ids,
      excluded_principal_ids, sealed_at, created_at
    ) VALUES (
      101, '50000000-0000-0000-0000-000000000001',
      'a0000000-0000-0000-0000-000000000001',
      '80000000-0000-0000-0000-000000000001',
      'freeze:agent-c/purpose:incident-triage',
      'SEALED_FREEZE_CERT', 'SEALED', repeat('b', 64), repeat('c', 64),
      repeat('6', 64), now() - interval '2 days',
      ARRAY['principal:exec-a'],
      ARRAY['principal:first-tier-a', 'principal:authority-a'],
      now() - interval '2 days', now()
    );

    INSERT INTO agent_th_session (
      account_id, session_id, profile_id, profile_version, status,
      state_revision, purpose, idempotency_key, budget_nominate_units,
      budget_arm_units, budget_thaw_units, budget_vector_units,
      budget_seal_units, budget_notify_units, consumed_nominate_units,
      consumed_arm_units, consumed_thaw_units, consumed_vector_units,
      consumed_seal_units, consumed_notify_units, budget_max_wall_time_ms,
      thaw_threshold, extend_threshold, sla_duration_ms,
      max_holds_per_certificate, deadline_at, started_by, principal_id,
      authorization_evidence_id, delegated_scope_hash, authorization_revision,
      resource_scope_hash, created_at, updated_at
    ) VALUES (
      101, '20000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001', 1, 'OPEN', 0,
      'Thaw overdue incident freezes under dual-control SLA', 'request-1',
      100, 40, 40, 5, 8, 2, 0, 0, 0, 0, 0, 0, 60000, 2, 2, 86400000, 32,
      now() + interval '1 minute',
      'principal:test', 'principal:test',
      '30000000-0000-0000-0000-000000000001',
      repeat('e', 64), 7, repeat('f', 64), now(), now()
    );

    INSERT INTO agent_th_nomination_receipt (
      account_id, receipt_id, session_id, case_id, case_kind,
      disputed_fact_hash, attenuation_hash, nomination_hash, nominated_at
    ) VALUES (
      101, '40000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000001',
      '50000000-0000-0000-0000-000000000001', 'SEALED_FREEZE_CERT',
      repeat('b', 64), repeat('c', 64), repeat('1', 64), now()
    );

    INSERT INTO agent_th_clock_arm (
      account_id, clock_id, session_id, case_id, freeze_sealed_at,
      sla_duration_ms, deadline_at, clock_hash, armed_at
    ) VALUES (
      101, 'b0000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000001',
      '50000000-0000-0000-0000-000000000001',
      now() - interval '2 days', 86400000, now() - interval '1 day',
      repeat('7', 64), now()
    );

    INSERT INTO agent_th_certificate (
      account_id, certificate_id, session_id, consumer_ref, purpose_hash,
      certificate_kind, steward_set_hash, disputed_fact_set_hash,
      halt_scope_hash, hold_watermark, sealed_revision, sealed_at, created_at
    ) VALUES (
      101, '90000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000001',
      'consumer:agent-d/purpose:incident-triage',
      repeat('2', 64), 'BREACH', repeat('3', 64), repeat('b', 64),
      repeat('6', 64), 1, 1, now(), now()
    );

    INSERT INTO agent_th_certificate_hold (
      account_id, hold_id, certificate_id, session_id, case_id, case_kind,
      hold_ordinal, status, disputed_fact_hash, attenuation_hash,
      sealed_revision, sealed_at, created_at
    ) VALUES (
      101, 'a0000000-0000-0000-0000-000000000099',
      '90000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000001',
      '50000000-0000-0000-0000-000000000001',
      'SEALED_FREEZE_CERT', 0, 'SEALED',
      repeat('b', 64), repeat('c', 64), 1, now(), now()
    );

    UPDATE agent_th_session
    SET status = 'BREACHED',
        state_revision = 1,
        consumed_nominate_units = 1,
        consumed_arm_units = 1,
        consumed_seal_units = 1,
        updated_at = now()
    WHERE account_id = 101
      AND session_id = '20000000-0000-0000-0000-000000000001';

    INSERT INTO agent_th_profile_embedding (
      account_id, profile_id, profile_version, embedding_model,
      embedding_dims, embedding, definition_hash, source_watermark, updated_at
    ) VALUES (
      101, '10000000-0000-0000-0000-000000000001', 1, 'text-embedding-test',
      1536, array_fill(0.01::real, ARRAY[1536])::vector, repeat('a', 64),
      'profile-wm:1', now()
    );
  `);

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);

        INSERT INTO agent_th_session (
          account_id, session_id, profile_id, profile_version, status,
          state_revision, purpose, idempotency_key, budget_nominate_units,
          budget_arm_units, budget_thaw_units, budget_vector_units,
          budget_seal_units, budget_notify_units, consumed_nominate_units,
          consumed_arm_units, consumed_thaw_units, consumed_vector_units,
          consumed_seal_units, consumed_notify_units, budget_max_wall_time_ms,
          thaw_threshold, extend_threshold, sla_duration_ms,
          max_holds_per_certificate, deadline_at, started_by, principal_id,
          authorization_evidence_id, delegated_scope_hash,
          authorization_revision, resource_scope_hash, created_at, updated_at
        ) VALUES (
          101, '20000000-0000-0000-0000-000000000002',
          '10000000-0000-0000-0000-000000000001', 1, 'OPEN', 0,
          'Duplicate request', 'request-1', 100, 40, 40, 5, 8, 2,
          0, 0, 0, 0, 0, 0, 60000, 2, 2, 86400000, 32,
          now() + interval '1 minute',
          'principal:test', 'principal:test',
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

        UPDATE agent_th_profile_thaw_rule
        SET require_notify = false
        WHERE account_id = 101
          AND profile_id = '10000000-0000-0000-0000-000000000001'
          AND profile_version = 1
          AND rule_id = 'thaw-case';
      `),
    "mutation of a sealed thaw rule",
    "P0001",
  );

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);

        INSERT INTO agent_th_profile (
          account_id, profile_id, profile_version, name, status,
          definition_hash, canonicalization_version, compiler_version,
          approval_validation_hash, authorization_evidence_id,
          authorization_snapshot_hash, thaw_threshold, extend_threshold,
          sla_duration_ms, max_holds_per_certificate, semantic_tags,
          revocation_policy, created_by, created_at, approved_by, approved_at
        ) VALUES (
          101, '10000000-0000-0000-0000-000000000002', 1,
          'Bypass approval', 'APPROVED', repeat('a', 64), 'jcs-v1',
          'th-compiler-1', repeat('a', 64),
          '30000000-0000-0000-0000-000000000001', repeat('d', 64),
          2, 2, 86400000, 16, ARRAY['unsafe'], 'STOP_BEFORE_ARM',
          'principal:test', now(), 'principal:test', now()
        );
      `),
    "insertion of a pre-approved profile",
    "P0001",
  );

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);

        UPDATE agent_th_certificate_hold
        SET disputed_fact_hash = repeat('7', 64)
        WHERE account_id = 101
          AND hold_id = 'a0000000-0000-0000-0000-000000000099';
      `),
    "mutation of certificate hold identity",
    "P0001",
  );

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);

        UPDATE agent_th_profile
        SET status = 'REVOKED',
            revoked_by = 'principal:unauthorized',
            revoked_at = now()
        WHERE account_id = 101
          AND profile_id = '10000000-0000-0000-0000-000000000001'
          AND profile_version = 1;
      `),
    "direct profile revocation",
    "P0001",
  );

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);

        INSERT INTO agent_th_refresh_intent (
          account_id, refresh_id, session_id, certificate_id,
          intent_status, provider_idempotency_key, generation,
          canonical_request_hash, created_at, updated_at
        ) VALUES (
          101, '60000000-0000-0000-0000-000000000001',
          '20000000-0000-0000-0000-000000000001',
          '90000000-0000-0000-0000-000000000001', 'UNKNOWN_EFFECT',
          'provider-key-1', 1, repeat('4', 64), now(), now()
        );
      `),
    "insertion of a non-prepared refresh intent",
    "P0001",
  );

  await database.exec(`
    SELECT set_config('app.account_id', '101', true);

    INSERT INTO agent_th_refresh_intent (
      account_id, refresh_id, session_id, certificate_id,
      intent_status, provider_idempotency_key, generation,
      canonical_request_hash, created_at, updated_at
    ) VALUES (
      101, '60000000-0000-0000-0000-000000000002',
      '20000000-0000-0000-0000-000000000001',
      '90000000-0000-0000-0000-000000000001', 'PREPARED',
      'provider-key-2', 0, repeat('5', 64), now(), now()
    );
  `);

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);

        UPDATE agent_th_refresh_intent
        SET canonical_request_hash = repeat('7', 64)
        WHERE account_id = 101
          AND refresh_id = '60000000-0000-0000-0000-000000000002';
      `),
    "mutation of a prepared refresh identity",
    "P0001",
  );

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);

        UPDATE agent_th_profile
        SET definition_hash = repeat('9', 64)
        WHERE account_id = 101
          AND profile_id = '10000000-0000-0000-0000-000000000001'
          AND profile_version = 1;
      `),
    "mutation of sealed profile definition",
    "P0001",
  );

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);

        INSERT INTO agent_th_thaw_cast (
          account_id, step_id, session_id, case_id,
          steward_principal_id, vote_kind, thaw_ordinal, halt_scope_hash,
          attenuation_hash, thaw_hash, cast_at
        ) VALUES (
          101, 'c0000000-0000-0000-0000-000000000001',
          '20000000-0000-0000-0000-000000000001',
          '50000000-0000-0000-0000-000000000001',
          'principal:first-tier-a', 'THAW', 1, repeat('6', 64),
          repeat('c', 64), repeat('8', 64), now()
        );
      `),
    "prior-principal exclusion fence",
    "P0001",
  );

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);

        INSERT INTO agent_th_thaw_cast (
          account_id, step_id, session_id, case_id,
          steward_principal_id, vote_kind, thaw_ordinal, halt_scope_hash,
          attenuation_hash, thaw_hash, cast_at
        ) VALUES (
          101, 'c0000000-0000-0000-0000-000000000002',
          '20000000-0000-0000-0000-000000000001',
          '50000000-0000-0000-0000-000000000001',
          'principal:exec-a', 'THAW', 1, repeat('6', 64),
          repeat('c', 64), repeat('9', 64), now()
        );
      `),
    "anti-self-thaw fence",
    "P0001",
  );

  const tenantCount = await database.query(
    "SELECT count(*)::int AS count FROM agent_th_session WHERE account_id = 101",
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
        executableConstraintChecks: 10,
        tenantPoliciesChecked: tableCount,
      },
      status: "ok",
    },
    null,
    2,
  ),
);
