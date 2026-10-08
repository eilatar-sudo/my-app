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
        `${reason} rejected with SQLSTATE ${String(error.code)}, expected ${expectedCode}: ${error.message}`,
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
  block.includes("CREATE TYPE synfr_session_status"),
);
const vectorBlock = sqlBlocks.find((block) =>
  block.includes("CREATE TABLE agent_synfr_profile_embedding"),
);
if (!ddlBlock || !vectorBlock) {
  throw new Error("could not locate executable SQL schema blocks");
}
if (
  !/CREATE TABLE agent_synfr_profile_embedding \(\n\s+account_id/.test(
    vectorBlock,
  )
) {
  throw new Error("vector schema does not lead with account_id");
}
if (vectorBlock.includes("USING hnsw")) {
  throw new Error("reference schema must not create a cross-tenant HNSW index");
}
if (ddlBlock.includes("context_packet") || ddlBlock.includes("packet_catalog")) {
  throw new Error("freshness schema must not scan or store a context-packet catalog");
}

const tableCount = (ddlBlock.match(/CREATE TABLE /g) ?? []).length;
const indexCount = (ddlBlock.match(/CREATE (?:UNIQUE )?INDEX /g) ?? []).length;
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

    INSERT INTO agent_synfr_authorization_evidence (
      account_id, evidence_id, principal_id, policy_revision,
      resource_acl_revision, redacted_scope_summary,
      encrypted_evidence_ref, evidence_hash, immutable_archive_ref, created_at
    ) VALUES (
      101, '30000000-0000-0000-0000-000000000001', 'principal:test', 7, 11,
      '{"scopes":["attestation.synopsis-freshness.publish"]}', 'kms://evidence/fixture',
      repeat('8', 64), 'worm://evidence/fixture', now()
    );

    INSERT INTO agent_synfr_profile (
      account_id, profile_id, profile_version, name, status,
      definition_hash, canonicalization_version, compiler_version,
      approval_validation_hash, authorization_evidence_id,
      authorization_snapshot_hash, attest_threshold, max_days_per_session,
      max_nominated_days, max_recordable_lag, semantic_tags, procedure_ref,
      revocation_policy, created_by, created_at
    ) VALUES (
      101, '10000000-0000-0000-0000-000000000001', 1,
      'Daily synopsis freshness attestation', 'DRAFT',
      repeat('a', 64), 'jcs-v1', 'synfr-attest-1',
      NULL, '30000000-0000-0000-0000-000000000001',
      repeat('d', 64), 2, 1, 1, 1000,
      ARRAY['incident', 'synopsis-freshness'],
      'proc:synopsis-freshness-attestation',
      'STOP_BEFORE_ATTEST', 'principal:test', now()
    );

    INSERT INTO agent_synfr_profile_attest_rule (
      account_id, profile_id, profile_version, rule_id, ordinal,
      allowed_classes, attest_threshold, max_days_per_session,
      max_nominated_days, max_recordable_lag, require_dual_control_attest,
      attest_instruction
    ) VALUES (
      101, '10000000-0000-0000-0000-000000000001', 1, 'attest-day', 1,
      ARRAY['CURRENT', 'LAGGING', 'UNKNOWN_EFFECT'],
      2, 1, 1, 1000, true,
      '{"attest_one_utc_day":true,"lag_only":true,"ack_never_trust":true,"point_lookup_only":true,"no_nested_expiry":true,"packet_never_scanned":true,"cursor_head_only":true}'
    );

    SELECT approve_agent_synfr_profile(
      101,
      '10000000-0000-0000-0000-000000000001',
      1,
      repeat('a', 64),
      'principal:approver'
    );

    INSERT INTO agent_synfr_sealed_synopsis (
      account_id, utc_day, synopsis_id, synopsis_hash,
      sealed_count, denied_count, unknown_effect_count,
      watermark_high, synopsis_steward_a, synopsis_steward_b,
      publication_steward_a, publication_steward_b,
      effect_observation, attested_key_kind, fact_disposition,
      body_visibility, metadata_trust, access_path,
      inlines_fact_body, opens_nested_expiry, ack_promoted_to_trust,
      packet_scan_used, synopsis_body, sealed_at, created_at
    ) VALUES (
      101, DATE '2026-10-06', 'b0000000-0000-0000-0000-000000000010',
      repeat('6', 64),
      1, 1, 1,
      12, 'principal:syn-a', 'principal:syn-b',
      'principal:pub-a', 'principal:pub-b',
      'ACKED', 'AWAITING_CONFIRMATION', 'DISPUTED_HELD',
      'OMITTED', 'UNTRUSTED_METADATA', 'POINT_LOOKUP',
      false, false, false,
      false,
      '{"sealedCount":1,"deniedCount":1,"unknownEffectCount":1,"watermarkHigh":12,"attestedKeyKind":"AWAITING_CONFIRMATION","ackPromotedToTrust":false}',
      now(), now()
    );

    INSERT INTO agent_synfr_receipt_cursor_head (
      account_id, utc_day, newest_publication_cursor, cursor_hash,
      publication_steward_a, publication_steward_b,
      silence_observed, access_path, metadata_trust,
      inlines_fact_body, opens_nested_expiry, ack_promoted_to_trust,
      cursor_payload, observed_at, created_at
    ) VALUES (
      101, DATE '2026-10-06', 15, repeat('5', 64),
      'principal:pub-a', 'principal:pub-b',
      false, 'POINT_LOOKUP', 'UNTRUSTED_METADATA',
      false, false, false,
      '{"newestPublicationCursor":15,"source":"RECEIPT_CURSOR_HEAD"}',
      now(), now()
    );

    INSERT INTO agent_synfr_session (
      account_id, session_id, profile_id, profile_version, status,
      state_revision, purpose, idempotency_key, budget_nominate_units,
      budget_bind_units, budget_attest_units, budget_vector_units,
      budget_publish_units, budget_notify_units, consumed_nominate_units,
      consumed_bind_units, consumed_attest_units, consumed_vector_units,
      consumed_publish_units, consumed_notify_units,
      budget_max_wall_time_ms, attest_threshold, max_days_per_session,
      max_nominated_days, max_recordable_lag, deadline_at, started_by,
      principal_id, authorization_evidence_id, delegated_scope_hash,
      authorization_revision, resource_scope_hash, created_at, updated_at
    ) VALUES (
      101, '20000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001', 1, 'OPEN', 0,
      'Attest freshness for one sealed synopsis day', 'request-1',
      100, 40, 8, 5, 8, 2,
      0, 0, 0, 0, 0, 0, 60000, 2, 1, 1, 1000,
      now() + interval '1 minute',
      'principal:test', 'principal:test',
      '30000000-0000-0000-0000-000000000001',
      repeat('e', 64), 7, repeat('f', 64), now(), now()
    );

    SELECT nominate_agent_synfr_day(
      101,
      '20000000-0000-0000-0000-000000000001',
      DATE '2026-10-06',
      '40000000-0000-0000-0000-000000000001',
      repeat('1', 64)
    );

    SELECT attest_agent_synfr_freshness(
      101,
      '20000000-0000-0000-0000-000000000001',
      DATE '2026-10-06',
      '70000000-0000-0000-0000-000000000001',
      '90000000-0000-0000-0000-000000000001',
      'a0000000-0000-0000-0000-000000000099',
      'b0000000-0000-0000-0000-000000000001',
      repeat('6', 64),
      'principal:att-a',
      'principal:att-b'
    );

    SELECT publish_agent_synfr_attestation(
      101,
      DATE '2026-10-06',
      'b0000000-0000-0000-0000-000000000001',
      'd0000000-0000-0000-0000-000000000001'
    );
  `);

  const nominations = await database.query(
    "SELECT count(*)::int AS count FROM agent_synfr_day_nomination WHERE account_id = 101 AND access_path = 'POINT_LOOKUP'",
  );
  if (nominations.rows[0]?.count !== 1) {
    throw new Error("point-lookup day nomination was not compiled");
  }

  const attestations = await database.query(`
    SELECT lag_publications, freshness_class, synopsis_watermark_high,
           newest_receipt_publication_cursor, attested_key_kind,
           synopsis_effect_observation, metadata_trust, fact_disposition,
           body_visibility, inlines_fact_body, opens_nested_expiry,
           ack_promoted_to_trust, packet_scan_used, sealed_count,
           denied_count, unknown_effect_count, attestation_body
    FROM agent_synfr_freshness_attestation
    WHERE account_id = 101
      AND utc_day = DATE '2026-10-06'
  `);
  const attestation = attestations.rows[0];
  const body = attestation?.attestation_body ?? {};
  if (
    attestation?.lag_publications !== 3 ||
    attestation?.freshness_class !== "LAGGING" ||
    attestation?.synopsis_watermark_high !== 12 ||
    attestation?.newest_receipt_publication_cursor !== 15 ||
    attestation?.attested_key_kind !== "AWAITING_CONFIRMATION" ||
    attestation?.synopsis_effect_observation !== "ACKED" ||
    attestation?.metadata_trust !== "UNTRUSTED_METADATA" ||
    attestation?.fact_disposition !== "DISPUTED_HELD" ||
    attestation?.body_visibility !== "OMITTED" ||
    attestation?.inlines_fact_body !== false ||
    attestation?.opens_nested_expiry !== false ||
    attestation?.ack_promoted_to_trust !== false ||
    attestation?.packet_scan_used !== false ||
    attestation?.sealed_count !== 1 ||
    attestation?.denied_count !== 1 ||
    attestation?.unknown_effect_count !== 1 ||
    body.factBody !== undefined ||
    body.fact_body !== undefined ||
    body.attestedKeyKind !== "AWAITING_CONFIRMATION" ||
    body.ackPromotedToTrust !== false ||
    body.lagPublications !== 3
  ) {
    throw new Error(
      `freshness attestation did not record lag without promoting ACKED: ${JSON.stringify(attestation)}`,
    );
  }

  const records = await database.query(`
    SELECT reason_code, lag_publications, synopsis_watermark_high,
           newest_receipt_publication_cursor, freshness_class
    FROM agent_synfr_attestation_publication
    WHERE account_id = 101
      AND utc_day = DATE '2026-10-06'
  `);
  if (
    records.rows.length !== 1 ||
    records.rows[0]?.reason_code !== "SYNOPSIS_FRESHNESS_ATTESTED" ||
    records.rows[0]?.lag_publications !== 3 ||
    records.rows[0]?.synopsis_watermark_high !== 12 ||
    records.rows[0]?.newest_receipt_publication_cursor !== 15 ||
    records.rows[0]?.freshness_class !== "LAGGING"
  ) {
    throw new Error(
      "freshness publication did not cite the sealed synopsis and receipt cursor by day point lookup",
    );
  }

  await database.exec(`
    SELECT set_config('app.account_id', '101', true);
    SELECT reject_agent_synfr_unscoped_scan(true, true);
  `);

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);
        SELECT reject_agent_synfr_unscoped_scan(true, false);
      `),
    "unscoped day scan",
    "P0001",
  );

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);
        SELECT nominate_agent_synfr_day(
          101,
          '20000000-0000-0000-0000-000000000001',
          NULL,
          '40000000-0000-0000-0000-000000000002',
          repeat('1', 64)
        );
      `),
    "null utc day scan",
    "P0001",
  );

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);
        INSERT INTO agent_synfr_session (
          account_id, session_id, profile_id, profile_version, status,
          state_revision, purpose, idempotency_key, budget_nominate_units,
          budget_bind_units, budget_attest_units, budget_vector_units,
          budget_publish_units, budget_notify_units,
          consumed_nominate_units, consumed_bind_units,
          consumed_attest_units, consumed_vector_units,
          consumed_publish_units, consumed_notify_units,
          budget_max_wall_time_ms, attest_threshold, max_days_per_session,
          max_nominated_days, max_recordable_lag, deadline_at, started_by,
          principal_id, authorization_evidence_id, delegated_scope_hash,
          authorization_revision, resource_scope_hash, created_at, updated_at
        ) VALUES (
          101, '20000000-0000-0000-0000-000000000002',
          '10000000-0000-0000-0000-000000000001', 1, 'OPEN', 0,
          'Duplicate request', 'request-1', 100, 40, 8, 5, 8, 2,
          0, 0, 0, 0, 0, 0, 60000, 2, 1, 1, 1000,
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
        UPDATE agent_synfr_profile_attest_rule
        SET require_dual_control_attest = false
        WHERE account_id = 101
          AND profile_id = '10000000-0000-0000-0000-000000000001'
          AND profile_version = 1
          AND rule_id = 'attest-day';
      `),
    "mutation of a sealed attest rule",
    "P0001",
  );

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);
        INSERT INTO agent_synfr_profile (
          account_id, profile_id, profile_version, name, status,
          definition_hash, canonicalization_version, compiler_version,
          approval_validation_hash, authorization_evidence_id,
          authorization_snapshot_hash, attest_threshold,
          max_days_per_session, max_nominated_days, max_recordable_lag,
          semantic_tags, procedure_ref, revocation_policy, created_by, created_at,
          approved_by, approved_at
        ) VALUES (
          101, '10000000-0000-0000-0000-000000000002', 1,
          'Illegal approved profile', 'APPROVED',
          repeat('b', 64), 'jcs-v1', 'synfr-attest-1',
          repeat('c', 64), '30000000-0000-0000-0000-000000000001',
          repeat('d', 64), 2, 1, 1, 1000,
          ARRAY['incident'], 'proc:illegal', 'STOP_BEFORE_ATTEST',
          'principal:test', now(), 'principal:test', now()
        );
      `),
    "profile inserted as approved",
    "P0001",
  );

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);
        UPDATE agent_synfr_attestation_decision
        SET attest_hash = repeat('e', 64)
        WHERE account_id = 101
          AND decision_id = 'a0000000-0000-0000-0000-000000000099';
      `),
    "mutation of attestation-decision identity",
    "P0001",
  );

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);
        UPDATE agent_synfr_profile
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
        INSERT INTO agent_synfr_effect_intent (
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
    INSERT INTO agent_synfr_effect_intent (
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
        UPDATE agent_synfr_effect_intent
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
        UPDATE agent_synfr_profile
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
        INSERT INTO agent_synfr_attestation_decision (
          account_id, decision_id, certificate_id, session_id, utc_day,
          compile_kind, freshness_class, effect_observation, attested_key_kind,
          fact_disposition, body_visibility, access_path, metadata_trust,
          opens_nested_expiry, inlines_fact_body, ack_promoted_to_trust,
          packet_scan_used, synopsis_watermark_high,
          newest_receipt_publication_cursor, lag_publications,
          attest_hash, sealed_at, created_at
        ) VALUES (
          101, 'c0000000-0000-0000-0000-000000000001',
          '90000000-0000-0000-0000-000000000001',
          '20000000-0000-0000-0000-000000000001',
          DATE '2026-10-06', 'ATTEST_SYNOPSIS_FRESHNESS', 'LAGGING', 'ACKED',
          'TRUSTED_ENROLLED', 'DISPUTED_HELD', 'OMITTED', 'POINT_LOOKUP',
          'UNTRUSTED_METADATA', false, false, true, false,
          12, 15, 3, repeat('6', 64), now(), now()
        );
      `),
    "ack-as-trust fence",
    "P0001",
  );

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);
        INSERT INTO agent_synfr_receipt_cursor_head (
          account_id, utc_day, newest_publication_cursor, cursor_hash,
          publication_steward_a, publication_steward_b,
          silence_observed, access_path, metadata_trust,
          inlines_fact_body, opens_nested_expiry, ack_promoted_to_trust,
          cursor_payload, observed_at, created_at
        ) VALUES (
          101, DATE '2026-10-07', 4, repeat('9', 64),
          'principal:pub-a', 'principal:pub-b',
          false, 'POINT_LOOKUP', 'UNTRUSTED_METADATA',
          false, false, false,
          '{"factBody":"the disputed sentence","newestPublicationCursor":4}',
          now(), now()
        );
      `),
    "fact-body inline fence",
    "P0001",
  );

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);
        INSERT INTO agent_synfr_attestation_decision (
          account_id, decision_id, certificate_id, session_id, utc_day,
          compile_kind, freshness_class, effect_observation, attested_key_kind,
          fact_disposition, body_visibility, access_path, metadata_trust,
          opens_nested_expiry, inlines_fact_body, ack_promoted_to_trust,
          packet_scan_used, synopsis_watermark_high,
          newest_receipt_publication_cursor, lag_publications,
          attest_hash, sealed_at, created_at
        ) VALUES (
          101, 'c0000000-0000-0000-0000-000000000002',
          '90000000-0000-0000-0000-000000000001',
          '20000000-0000-0000-0000-000000000001',
          DATE '2026-10-06', 'ATTEST_SYNOPSIS_FRESHNESS', 'LAGGING', 'ACKED',
          'AWAITING_CONFIRMATION', 'DISPUTED_HELD', 'OMITTED', 'POINT_LOOKUP',
          'UNTRUSTED_METADATA', true, false, false, false,
          12, 15, 3, repeat('6', 64), now(), now()
        );
      `),
    "nested-expiry fence",
    "P0001",
  );

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);
        INSERT INTO agent_synfr_attestation_decision (
          account_id, decision_id, certificate_id, session_id, utc_day,
          compile_kind, freshness_class, effect_observation, attested_key_kind,
          fact_disposition, body_visibility, access_path, metadata_trust,
          opens_nested_expiry, inlines_fact_body, ack_promoted_to_trust,
          packet_scan_used, synopsis_watermark_high,
          newest_receipt_publication_cursor, lag_publications,
          attest_hash, sealed_at, created_at
        ) VALUES (
          101, 'c0000000-0000-0000-0000-000000000003',
          '90000000-0000-0000-0000-000000000001',
          '20000000-0000-0000-0000-000000000001',
          DATE '2026-10-06', 'ATTEST_SYNOPSIS_FRESHNESS', 'LAGGING', 'ACKED',
          'AWAITING_CONFIRMATION', 'DISPUTED_HELD', 'OMITTED', 'PACKET_SCAN',
          'UNTRUSTED_METADATA', false, false, false, true,
          12, 15, 3, repeat('6', 64), now(), now()
        );
      `),
    "context-packet scan fence",
    "P0001",
  );

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);
        INSERT INTO agent_synfr_attestation_certificate (
          account_id, certificate_id, session_id, compile_id, consumer_ref,
          utc_day, purpose_hash, synopsis_watermark_high,
          newest_receipt_publication_cursor, lag_publications,
          attestation_steward_a, attestation_steward_b,
          synopsis_steward_a, synopsis_steward_b,
          publication_steward_a, publication_steward_b,
          sealed_revision, sealed_at, created_at
        ) VALUES (
          101, '90000000-0000-0000-0000-000000000002',
          '20000000-0000-0000-0000-000000000001',
          '70000000-0000-0000-0000-000000000001',
          'consumer:reused-steward',
          DATE '2026-10-06', repeat('a', 64), 12, 15, 3,
          'principal:pub-a', 'principal:att-b',
          'principal:syn-a', 'principal:syn-b',
          'principal:pub-a', 'principal:pub-b',
          2, now(), now()
        );
      `),
    "steward reuse",
    "P0001",
  );

  const tenantCount = await database.query(
    "SELECT count(*)::int AS count FROM agent_synfr_session WHERE account_id = 101",
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
        executableConstraintChecks: 15,
        tenantPoliciesChecked: tableCount,
      },
      status: "ok",
    },
    null,
    2,
  ),
);
