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

const queryType = schema.getQueryType();
const mutationType = schema.getMutationType();
if (!queryType || !mutationType) {
  throw new Error("GraphQL schema is missing Query or Mutation");
}
const queryCount = Object.keys(queryType.getFields()).length;
const mutationCount = Object.keys(mutationType.getFields()).length;
if (queryCount !== 6 || mutationCount !== 10) {
  throw new Error(
    `expected 6 queries and 10 mutations, found ${queryCount} and ${mutationCount}`,
  );
}

const ddlBlock = sqlBlocks.find((block) =>
  block.includes("CREATE TYPE tra_session_status"),
);
const vectorBlock = sqlBlocks.find((block) =>
  block.includes("CREATE TABLE agent_tra_profile_embedding"),
);
if (!ddlBlock || !vectorBlock) {
  throw new Error("could not locate executable SQL schema blocks");
}
if (
  !/CREATE TABLE agent_tra_profile_embedding \(\n\s+account_id/.test(
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

    INSERT INTO agent_tra_authorization_evidence (
      account_id, evidence_id, principal_id, policy_revision,
      resource_acl_revision, redacted_scope_summary,
      encrypted_evidence_ref, evidence_hash, immutable_archive_ref, created_at
    ) VALUES (
      101, '30000000-0000-0000-0000-000000000001', 'principal:test', 7, 11,
      '{"scopes":["toolread.receipt.attest"]}', 'kms://evidence/fixture',
      repeat('8', 64), 'worm://evidence/fixture', now()
    );

    INSERT INTO agent_tra_profile (
      account_id, profile_id, profile_version, name, status,
      definition_hash, canonicalization_version, compiler_version,
      approval_validation_hash, authorization_evidence_id,
      authorization_snapshot_hash, attest_threshold, max_decisions_per_certificate,
      max_nominated_decisions, semantic_tags, procedure_ref, revocation_policy,
      created_by, created_at
    ) VALUES (
      101, '10000000-0000-0000-0000-000000000001', 1,
      'Incident tool-read receipt attestation', 'DRAFT',
      repeat('a', 64), 'jcs-v1', 'tra-attest-1',
      NULL, '30000000-0000-0000-0000-000000000001',
      repeat('d', 64), 2, 32, 32,
      ARRAY['incident', 'tool-read-receipt'],
      'proc:tool-read-receipt-attestation',
      'STOP_BEFORE_ATTEST', 'principal:test', now()
    );

    INSERT INTO agent_tra_profile_attest_rule (
      account_id, profile_id, profile_version, rule_id, ordinal,
      allowed_source_kinds, attest_threshold, max_decisions_per_certificate,
      require_dual_control_attest, attest_instruction
    ) VALUES (
      101, '10000000-0000-0000-0000-000000000001', 1, 'attest-case', 1,
      ARRAY['SEALED_TOOL_READ_DECISION', 'SEALED_EWG_GATE_CERT',
        'SEALED_PROVIDER_RECEIPT', 'SEALED_RECEIPT_SLOT',
        'SEALED_EFFECT_INTENT'],
      2, 32, true,
      '{"silence_never_success":true,"receipt_never_restores":true,"clock_is_not_trust":true}'
    );

    SELECT approve_agent_tra_profile(
      101,
      '10000000-0000-0000-0000-000000000001',
      1,
      repeat('a', 64),
      'principal:approver'
    );

    INSERT INTO agent_tra_decision_catalog (
      account_id, source_decision_id, source_session_id, source_certificate_id,
      receipt_ref, source_kind, gate_kind, gate_action, terminal_kind,
      placement_kind, key_lifecycle, clock_lifecycle, attested_key_kind, status,
      disputed_fact_hash, prior_clock_hash, successor_clock_hash,
      attenuation_hash, donor_purpose_hash, hop_count, halt_scope_hash,
      prior_gate_steward_a, prior_gate_steward_b,
      prior_extension_steward_a, prior_extension_steward_b,
      expires_at, first_seen_at, sealed_at, created_at
    ) VALUES (
      101, '50000000-0000-0000-0000-000000000001',
      '80000000-0000-0000-0000-000000000001',
      '90000000-0000-0000-0000-000000000099',
      'decision:envelope-read/purpose:incident-triage',
      'SEALED_TOOL_READ_DECISION', 'ALLOW_ENVELOPE_READ', 'READ',
      'PERMANENT_QUARANTINE', 'OMITTED',
      'REGRESSED', 'UNATTESTED', 'REGRESSED', 'SEALED',
      repeat('b', 64), repeat('4', 64), repeat('5', 64),
      repeat('c', 64), repeat('9', 64), 1, repeat('4', 64),
      'principal:gate-a', 'principal:gate-b',
      'principal:ext-a', 'principal:ext-b',
      now() - interval '1 day',
      now() - interval '2 days', now() - interval '1 day', now()
    ), (
      101, '50000000-0000-0000-0000-000000000002',
      '80000000-0000-0000-0000-000000000002',
      '90000000-0000-0000-0000-000000000098',
      'decision:tool-read/purpose:incident-triage',
      'SEALED_TOOL_READ_DECISION', 'ALLOW_TOOL_READ', 'TOOL_READ',
      'REQUIRE_HUMAN', 'EXTENDED_HALT',
      'FIRST_ENROLLMENT', 'ATTESTED', 'AWAITING_CONFIRMATION', 'SEALED',
      repeat('b', 64), repeat('4', 64), repeat('5', 64),
      repeat('c', 64), repeat('9', 64), 1, repeat('4', 64),
      'principal:gate-a', 'principal:gate-b',
      'principal:ext-a', 'principal:ext-b',
      now() + interval '30 minutes',
      now() - interval '12 hours', now() - interval '12 hours', now()
    );

    INSERT INTO agent_tra_session (
      account_id, session_id, profile_id, profile_version, status,
      state_revision, purpose, idempotency_key, budget_nominate_units,
      budget_bind_units, budget_seal_units, budget_vector_units,
      budget_invalidate_units, budget_notify_units, consumed_nominate_units,
      consumed_bind_units, consumed_seal_units, consumed_vector_units,
      consumed_invalidate_units, consumed_notify_units,
      budget_max_wall_time_ms, attest_threshold, max_decisions_per_certificate,
      max_nominated_decisions, deadline_at, started_by, principal_id,
      authorization_evidence_id, delegated_scope_hash, authorization_revision,
      resource_scope_hash, created_at, updated_at
    ) VALUES (
      101, '20000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001', 1, 'OPEN', 0,
      'Attest provider receipts for sealed tool-read decisions',
      'request-1',
      100, 40, 8, 5, 8, 2, 0, 0, 0, 0, 0, 0, 60000, 2, 32, 32,
      now() + interval '1 minute',
      'principal:test', 'principal:test',
      '30000000-0000-0000-0000-000000000001',
      repeat('e', 64), 7, repeat('f', 64), now(), now()
    );

    INSERT INTO agent_tra_nomination (
      account_id, nomination_id, session_id, source_decision_id,
      source_kind, gate_kind, gate_action, terminal_kind, placement_kind,
      key_lifecycle, clock_lifecycle, disputed_fact_hash, prior_clock_hash,
      successor_clock_hash, attenuation_hash, donor_purpose_hash, hop_count,
      halt_scope_hash, prior_gate_steward_a, prior_gate_steward_b,
      prior_extension_steward_a, prior_extension_steward_b,
      nomination_hash, nominated_at, expires_at
    ) VALUES (
      101, '40000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000001',
      '50000000-0000-0000-0000-000000000002', 'SEALED_TOOL_READ_DECISION',
      'ALLOW_TOOL_READ', 'TOOL_READ',
      'REQUIRE_HUMAN', 'EXTENDED_HALT', 'FIRST_ENROLLMENT', 'ATTESTED',
      repeat('b', 64), repeat('4', 64), repeat('5', 64), repeat('c', 64),
      repeat('9', 64), 1, repeat('4', 64),
      'principal:gate-a', 'principal:gate-b',
      'principal:ext-a', 'principal:ext-b',
      repeat('1', 64), now() - interval '12 hours',
      now() + interval '30 minutes'
    );

    INSERT INTO agent_tra_receipt_binding (
      account_id, receipt_binding_id, session_id, source_decision_id,
      provider_receipt_hash, receipt_disposition, effect_observation,
      silence_inferred, captured_at
    ) VALUES (
      101, 'b0000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000001',
      '50000000-0000-0000-0000-000000000002',
      repeat('7', 64), 'ATTESTED', 'ACKED', false, now()
    );

    INSERT INTO agent_tra_attest_record (
      account_id, attest_id, session_id, prior_clock_hash,
      successor_clock_hash, disputed_fact_hash, provider_receipt_hash,
      halt_scope_hash, attenuation_hash, decision_set_hash, attest_hash,
      attested_at
    ) VALUES (
      101, '70000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000001',
      repeat('4', 64), repeat('5', 64), repeat('b', 64), repeat('7', 64),
      repeat('4', 64), repeat('c', 64), repeat('2', 64),
      repeat('6', 64), now()
    );

    INSERT INTO agent_tra_attest_certificate (
      account_id, certificate_id, session_id, attest_id, consumer_ref,
      purpose_hash, prior_clock_hash, successor_clock_hash,
      disputed_fact_hash, provider_receipt_hash, halt_scope_hash,
      attenuation_hash, decision_set_hash,
      receipt_steward_a, receipt_steward_b,
      prior_gate_steward_a, prior_gate_steward_b,
      prior_extension_steward_a, prior_extension_steward_b,
      decision_watermark, sealed_revision, sealed_at, created_at
    ) VALUES (
      101, '90000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000001',
      '70000000-0000-0000-0000-000000000001',
      'consumer:incident-tool-read-receipt',
      repeat('c', 64), repeat('4', 64), repeat('5', 64),
      repeat('b', 64), repeat('7', 64), repeat('4', 64),
      repeat('c', 64), repeat('2', 64),
      'principal:receipt-a', 'principal:receipt-b',
      'principal:gate-a', 'principal:gate-b',
      'principal:ext-a', 'principal:ext-b',
      1, 1, now(), now()
    );

    INSERT INTO agent_tra_attest_decision (
      account_id, decision_id, certificate_id, session_id, source_decision_id,
      source_kind, decision_ordinal, status, placement_kind, key_lifecycle,
      clock_lifecycle, attested_key_kind, terminal_kind, gate_kind, gate_action,
      attest_kind, body_visibility, fact_disposition, clock_disposition,
      receipt_disposition, effect_observation, purpose_relation,
      disputed_fact_hash, prior_clock_hash, successor_clock_hash,
      provider_receipt_hash, attenuation_hash, requested_purpose_hash,
      donor_purpose_hash, hop_count, halt_scope_hash, silence_inferred,
      opens_nested_expiry, expires_at, sealed_revision, sealed_at, created_at
    ) VALUES (
      101, 'a0000000-0000-0000-0000-000000000099',
      '90000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000001',
      '50000000-0000-0000-0000-000000000002',
      'SEALED_TOOL_READ_DECISION', 1, 'SEALED',
      'EXTENDED_HALT', 'FIRST_ENROLLMENT', 'ATTESTED',
      'AWAITING_CONFIRMATION', 'REQUIRE_HUMAN', 'ALLOW_TOOL_READ', 'TOOL_READ',
      'ATTEST_TOOL_READ', 'ENVELOPE_ONLY', 'DISPUTED_HELD', 'REARMED',
      'ATTESTED', 'ACKED', 'NARROWS',
      repeat('b', 64), repeat('4', 64), repeat('5', 64), repeat('7', 64),
      repeat('c', 64), repeat('a', 64), repeat('9', 64), 1, repeat('4', 64),
      false, false, now() + interval '30 minutes', 1, now(), now()
    );

    UPDATE agent_tra_session
    SET status = 'SEALED',
        state_revision = 3,
        consumed_nominate_units = 1,
        consumed_bind_units = 1,
        consumed_seal_units = 1,
        updated_at = now()
    WHERE account_id = 101
      AND session_id = '20000000-0000-0000-0000-000000000001';

    INSERT INTO agent_tra_profile_embedding (
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

        INSERT INTO agent_tra_session (
          account_id, session_id, profile_id, profile_version, status,
          state_revision, purpose, idempotency_key, budget_nominate_units,
          budget_bind_units, budget_seal_units, budget_vector_units,
          budget_invalidate_units, budget_notify_units,
          consumed_nominate_units, consumed_bind_units,
          consumed_seal_units, consumed_vector_units,
          consumed_invalidate_units, consumed_notify_units,
          budget_max_wall_time_ms, attest_threshold, max_decisions_per_certificate,
          max_nominated_decisions, deadline_at, started_by, principal_id,
          authorization_evidence_id, delegated_scope_hash,
          authorization_revision, resource_scope_hash, created_at, updated_at
        ) VALUES (
          101, '20000000-0000-0000-0000-000000000002',
          '10000000-0000-0000-0000-000000000001', 1, 'OPEN', 0,
          'Duplicate request', 'request-1', 100, 40, 8, 5, 8, 2,
          0, 0, 0, 0, 0, 0, 60000, 2, 32, 32,
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

        UPDATE agent_tra_profile_attest_rule
        SET require_dual_control_attest = false
        WHERE account_id = 101
          AND profile_id = '10000000-0000-0000-0000-000000000001'
          AND profile_version = 1
          AND rule_id = 'attest-case';
      `),
    "mutation of a sealed attest rule",
    "P0001",
  );

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);

        INSERT INTO agent_tra_profile (
          account_id, profile_id, profile_version, name, status,
          definition_hash, canonicalization_version, compiler_version,
          approval_validation_hash, authorization_evidence_id,
          authorization_snapshot_hash, attest_threshold,
          max_decisions_per_certificate, max_nominated_decisions, semantic_tags,
          revocation_policy, created_by, created_at, approved_by, approved_at
        ) VALUES (
          101, '10000000-0000-0000-0000-000000000002', 1,
          'Bypass approval', 'APPROVED', repeat('a', 64), 'jcs-v1',
          'tra-attest-1', repeat('a', 64),
          '30000000-0000-0000-0000-000000000001', repeat('d', 64),
          2, 16, 16, ARRAY['unsafe'], 'STOP_BEFORE_ATTEST',
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

        UPDATE agent_tra_attest_decision
        SET disputed_fact_hash = repeat('7', 64)
        WHERE account_id = 101
          AND decision_id = 'a0000000-0000-0000-0000-000000000099';
      `),
    "mutation of attest-decision identity",
    "P0001",
  );

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);

        UPDATE agent_tra_profile
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

        INSERT INTO agent_tra_effect_intent (
          account_id, effect_id, session_id, certificate_id,
          intent_status, provider_idempotency_key, generation,
          canonical_request_hash, created_at, updated_at
        ) VALUES (
          101, '60000000-0000-0000-0000-000000000001',
          '20000000-0000-0000-0000-000000000001',
          '90000000-0000-0000-0000-000000000001', 'UNKNOWN_EFFECT',
          'provider-ack-1', 1, repeat('4', 64), now(), now()
        );
      `),
    "insertion of a non-prepared effect intent",
    "P0001",
  );

  await database.exec(`
    SELECT set_config('app.account_id', '101', true);

    INSERT INTO agent_tra_effect_intent (
      account_id, effect_id, session_id, certificate_id,
      intent_status, provider_idempotency_key, generation,
      canonical_request_hash, created_at, updated_at
    ) VALUES (
      101, '60000000-0000-0000-0000-000000000002',
      '20000000-0000-0000-0000-000000000001',
      '90000000-0000-0000-0000-000000000001', 'PREPARED',
      'provider-ack-2', 0, repeat('5', 64), now(), now()
    );
  `);

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);

        UPDATE agent_tra_effect_intent
        SET canonical_request_hash = repeat('7', 64)
        WHERE account_id = 101
          AND effect_id = '60000000-0000-0000-0000-000000000002';
      `),
    "mutation of a prepared effect identity",
    "P0001",
  );

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);

        UPDATE agent_tra_profile
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

        INSERT INTO agent_tra_attest_decision (
          account_id, decision_id, certificate_id, session_id, source_decision_id,
          source_kind, decision_ordinal, status, placement_kind, key_lifecycle,
          clock_lifecycle, attested_key_kind, terminal_kind, gate_kind, gate_action,
          attest_kind, body_visibility, fact_disposition, clock_disposition,
          receipt_disposition, effect_observation, purpose_relation,
          disputed_fact_hash, prior_clock_hash, successor_clock_hash,
          provider_receipt_hash, attenuation_hash, requested_purpose_hash,
          donor_purpose_hash, hop_count, halt_scope_hash, silence_inferred,
          opens_nested_expiry, expires_at, sealed_revision, sealed_at, created_at
        ) VALUES (
          101, 'c0000000-0000-0000-0000-000000000001',
          '90000000-0000-0000-0000-000000000001',
          '20000000-0000-0000-0000-000000000001',
          '50000000-0000-0000-0000-000000000002',
          'SEALED_TOOL_READ_DECISION', 2, 'SEALED',
          'EXTENDED_HALT', 'FIRST_ENROLLMENT', 'ATTESTED',
          'TRUSTED_ENROLLED', 'REQUIRE_HUMAN', 'ALLOW_TOOL_READ', 'TOOL_READ',
          'ATTEST_TOOL_READ', 'ENVELOPE_ONLY', 'DISPUTED_HELD', 'REARMED',
          'ATTESTED', 'ACKED', 'NARROWS',
          repeat('b', 64), repeat('4', 64), repeat('5', 64), repeat('7', 64),
          repeat('c', 64), repeat('a', 64), repeat('9', 64), 1, repeat('4', 64),
          false, false, now() + interval '30 minutes', 1, now(), now()
        );
      `),
    "receipt-as-trust fence",
    "P0001",
  );

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);

        INSERT INTO agent_tra_attest_decision (
          account_id, decision_id, certificate_id, session_id, source_decision_id,
          source_kind, decision_ordinal, status, placement_kind, key_lifecycle,
          clock_lifecycle, attested_key_kind, terminal_kind, gate_kind, gate_action,
          attest_kind, body_visibility, fact_disposition, clock_disposition,
          receipt_disposition, effect_observation, purpose_relation,
          disputed_fact_hash, prior_clock_hash, successor_clock_hash,
          provider_receipt_hash, attenuation_hash, requested_purpose_hash,
          donor_purpose_hash, hop_count, halt_scope_hash, silence_inferred,
          opens_nested_expiry, expires_at, sealed_revision, sealed_at, created_at
        ) VALUES (
          101, 'c0000000-0000-0000-0000-000000000002',
          '90000000-0000-0000-0000-000000000001',
          '20000000-0000-0000-0000-000000000001',
          '50000000-0000-0000-0000-000000000002',
          'SEALED_TOOL_READ_DECISION', 3, 'SEALED',
          'EXTENDED_HALT', 'FIRST_ENROLLMENT', 'ATTESTED',
          'AWAITING_CONFIRMATION', 'REQUIRE_HUMAN', 'ALLOW_TOOL_READ', 'TOOL_READ',
          'ATTEST_TOOL_READ', 'BODY_VISIBLE', 'RESTORED', 'REARMED',
          'ATTESTED', 'ACKED', 'NARROWS',
          repeat('b', 64), repeat('4', 64), repeat('5', 64), repeat('7', 64),
          repeat('c', 64), repeat('a', 64), repeat('9', 64), 1, repeat('4', 64),
          false, false, now() + interval '30 minutes', 1, now(), now()
        );
      `),
    "receipt-as-restore fence",
    "P0001",
  );

  const tenantCount = await database.query(
    "SELECT count(*)::int AS count FROM agent_tra_session WHERE account_id = 101",
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

console.log(
  JSON.stringify(
    {
      document: path,
      markdownFencePairs: fenceCount / 2,
      sections: 21,
      typeScriptBlocks: typeScriptBlocks.length,
      graphQL: { Query: queryCount, Mutation: mutationCount },
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
