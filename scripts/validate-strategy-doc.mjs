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
  block.includes("CREATE TYPE synad_session_status"),
);
const vectorBlock = sqlBlocks.find((block) =>
  block.includes("CREATE TABLE agent_synad_profile_embedding"),
);
if (!ddlBlock || !vectorBlock) {
  throw new Error("could not locate executable SQL schema blocks");
}
if (
  !/CREATE TABLE agent_synad_profile_embedding \(\n\s+account_id/.test(
    vectorBlock,
  )
) {
  throw new Error("vector schema does not lead with account_id");
}
if (vectorBlock.includes("USING hnsw")) {
  throw new Error("reference schema must not create a cross-tenant HNSW index");
}
if (ddlBlock.includes("context_packet") || ddlBlock.includes("packet_catalog")) {
  throw new Error("admission schema must not scan or store a context-packet catalog");
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

    INSERT INTO agent_synad_authorization_evidence (
      account_id, evidence_id, principal_id, policy_revision,
      resource_acl_revision, redacted_scope_summary,
      encrypted_evidence_ref, evidence_hash, immutable_archive_ref, created_at
    ) VALUES (
      101, '30000000-0000-0000-0000-000000000001', 'principal:test', 7, 11,
      '{"scopes":["admission.synopsis-lag.publish"]}', 'kms://evidence/fixture',
      repeat('8', 64), 'worm://evidence/fixture', now()
    );

    INSERT INTO agent_synad_profile (
      account_id, profile_id, profile_version, name, status,
      definition_hash, canonicalization_version, compiler_version,
      approval_validation_hash, authorization_evidence_id,
      authorization_snapshot_hash, admit_threshold, max_days_per_session,
      max_nominated_days, max_lag_budget, semantic_tags, procedure_ref,
      revocation_policy, created_by, created_at
    ) VALUES (
      101, '10000000-0000-0000-0000-000000000001', 1,
      'Daily synopsis lag admission', 'DRAFT',
      repeat('a', 64), 'jcs-v1', 'synad-admit-1',
      NULL, '30000000-0000-0000-0000-000000000001',
      repeat('d', 64), 2, 1, 1, 5,
      ARRAY['incident', 'synopsis-admission'],
      'proc:synopsis-lag-admission',
      'STOP_BEFORE_DECIDE', 'principal:test', now()
    );

    INSERT INTO agent_synad_profile_admit_rule (
      account_id, profile_id, profile_version, rule_id, ordinal,
      allowed_classes, admit_threshold, max_days_per_session,
      max_nominated_days, max_lag_budget, require_dual_control_admit,
      admit_instruction
    ) VALUES (
      101, '10000000-0000-0000-0000-000000000001', 1, 'admit-day', 1,
      ARRAY['ADMITTED', 'DENIED', 'UNKNOWN_EFFECT'],
      2, 1, 1, 5, true,
      '{"admit_one_utc_day":true,"lag_budget_inclusive":true,"ack_never_trust":true,"point_lookup_only":true,"no_nested_expiry":true,"packet_never_scanned":true,"attestation_head_only":true}'
    );

    SELECT approve_agent_synad_profile(
      101,
      '10000000-0000-0000-0000-000000000001',
      1,
      repeat('a', 64),
      'principal:approver'
    );

    INSERT INTO agent_synad_freshness_head (
      account_id, utc_day, attestation_id, attestation_hash,
      freshness_class, lag_publications, synopsis_watermark_high,
      newest_receipt_publication_cursor, sealed_count, denied_count,
      unknown_effect_count, silence_observed,
      attestation_steward_a, attestation_steward_b,
      synopsis_steward_a, synopsis_steward_b,
      publication_steward_a, publication_steward_b,
      effect_observation, attested_key_kind, fact_disposition,
      body_visibility, metadata_trust, access_path,
      inlines_fact_body, opens_nested_expiry, ack_promoted_to_trust,
      packet_scan_used, attestation_body, attested_at, created_at
    ) VALUES
    (
      101, DATE '2026-10-08', 'b0000000-0000-0000-0000-000000000010',
      repeat('6', 64), 'LAGGING', 3, 12, 15, 1, 1, 1, false,
      'principal:att-a', 'principal:att-b',
      'principal:syn-a', 'principal:syn-b',
      'principal:pub-a', 'principal:pub-b',
      'ACKED', 'AWAITING_CONFIRMATION', 'DISPUTED_HELD',
      'OMITTED', 'UNTRUSTED_METADATA', 'POINT_LOOKUP',
      false, false, false, false,
      '{"lagPublications":3,"freshnessClass":"LAGGING","attestedKeyKind":"AWAITING_CONFIRMATION","ackPromotedToTrust":false}',
      now(), now()
    ),
    (
      101, DATE '2026-10-07', 'b0000000-0000-0000-0000-000000000011',
      repeat('7', 64), 'LAGGING', 8, 12, 20, 4, 2, 1, false,
      'principal:att-a', 'principal:att-b',
      'principal:syn-a', 'principal:syn-b',
      'principal:pub-a', 'principal:pub-b',
      'ACKED', 'AWAITING_CONFIRMATION', 'DISPUTED_HELD',
      'OMITTED', 'UNTRUSTED_METADATA', 'POINT_LOOKUP',
      false, false, false, false,
      '{"lagPublications":8,"freshnessClass":"LAGGING","attestedKeyKind":"AWAITING_CONFIRMATION","ackPromotedToTrust":false}',
      now(), now()
    ),
    (
      101, DATE '2026-10-05', 'b0000000-0000-0000-0000-000000000012',
      repeat('9', 64), 'UNKNOWN_EFFECT', NULL, 9, NULL, 0, 0, 1, true,
      'principal:att-a', 'principal:att-b',
      'principal:syn-a', 'principal:syn-b',
      'principal:pub-a', 'principal:pub-b',
      'UNKNOWN_EFFECT', 'AWAITING_CONFIRMATION', 'DISPUTED_HELD',
      'OMITTED', 'UNTRUSTED_METADATA', 'POINT_LOOKUP',
      false, false, false, false,
      '{"freshnessClass":"UNKNOWN_EFFECT","attestedKeyKind":"AWAITING_CONFIRMATION","ackPromotedToTrust":false}',
      now(), now()
    );

    INSERT INTO agent_synad_session (
      account_id, session_id, profile_id, profile_version, status,
      state_revision, purpose, idempotency_key, budget_nominate_units,
      budget_bind_units, budget_decide_units, budget_vector_units,
      budget_publish_units, budget_notify_units, consumed_nominate_units,
      consumed_bind_units, consumed_decide_units, consumed_vector_units,
      consumed_publish_units, consumed_notify_units,
      budget_max_wall_time_ms, admit_threshold, max_days_per_session,
      max_nominated_days, max_lag_budget, deadline_at, started_by,
      principal_id, authorization_evidence_id, delegated_scope_hash,
      authorization_revision, resource_scope_hash, created_at, updated_at
    ) VALUES
    (
      101, '20000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001', 1, 'OPEN', 0,
      'Admit one sealed synopsis day inside the lag budget', 'request-1',
      100, 40, 8, 5, 8, 2,
      0, 0, 0, 0, 0, 0, 60000, 2, 1, 1, 5,
      now() + interval '1 minute',
      'principal:test', 'principal:test',
      '30000000-0000-0000-0000-000000000001',
      repeat('e', 64), 7, repeat('f', 64), now(), now()
    ),
    (
      101, '20000000-0000-0000-0000-000000000002',
      '10000000-0000-0000-0000-000000000001', 1, 'OPEN', 0,
      'Deny one sealed synopsis day above the lag budget', 'request-2',
      100, 40, 8, 5, 8, 2,
      0, 0, 0, 0, 0, 0, 60000, 2, 1, 1, 5,
      now() + interval '1 minute',
      'principal:test', 'principal:test',
      '30000000-0000-0000-0000-000000000001',
      repeat('e', 64), 7, repeat('f', 64), now(), now()
    ),
    (
      101, '20000000-0000-0000-0000-000000000003',
      '10000000-0000-0000-0000-000000000001', 1, 'OPEN', 0,
      'Keep a silent freshness head as unknown effect', 'request-3',
      100, 40, 8, 5, 8, 2,
      0, 0, 0, 0, 0, 0, 60000, 2, 1, 1, 5,
      now() + interval '1 minute',
      'principal:test', 'principal:test',
      '30000000-0000-0000-0000-000000000001',
      repeat('e', 64), 7, repeat('f', 64), now(), now()
    );

    SELECT nominate_agent_synad_day(
      101,
      '20000000-0000-0000-0000-000000000001',
      DATE '2026-10-08',
      '40000000-0000-0000-0000-000000000001',
      repeat('1', 64)
    );
    SELECT nominate_agent_synad_day(
      101,
      '20000000-0000-0000-0000-000000000002',
      DATE '2026-10-07',
      '40000000-0000-0000-0000-000000000002',
      repeat('2', 64)
    );
    SELECT nominate_agent_synad_day(
      101,
      '20000000-0000-0000-0000-000000000003',
      DATE '2026-10-05',
      '40000000-0000-0000-0000-000000000003',
      repeat('3', 64)
    );

    SELECT decide_agent_synad_admission(
      101,
      '20000000-0000-0000-0000-000000000001',
      DATE '2026-10-08',
      '70000000-0000-0000-0000-000000000001',
      '90000000-0000-0000-0000-000000000001',
      'a0000000-0000-0000-0000-000000000099',
      'b0000000-0000-0000-0000-000000000001',
      repeat('6', 64),
      'principal:adm-a',
      'principal:adm-b'
    );
    SELECT decide_agent_synad_admission(
      101,
      '20000000-0000-0000-0000-000000000002',
      DATE '2026-10-07',
      '70000000-0000-0000-0000-000000000002',
      '90000000-0000-0000-0000-000000000002',
      'a0000000-0000-0000-0000-000000000098',
      'b0000000-0000-0000-0000-000000000002',
      repeat('7', 64),
      'principal:adm-a',
      'principal:adm-b'
    );
    SELECT decide_agent_synad_admission(
      101,
      '20000000-0000-0000-0000-000000000003',
      DATE '2026-10-05',
      '70000000-0000-0000-0000-000000000003',
      '90000000-0000-0000-0000-000000000003',
      'a0000000-0000-0000-0000-000000000097',
      'b0000000-0000-0000-0000-000000000003',
      repeat('9', 64),
      'principal:adm-a',
      'principal:adm-b'
    );

    SELECT publish_agent_synad_admission(
      101,
      DATE '2026-10-08',
      'b0000000-0000-0000-0000-000000000001',
      'd0000000-0000-0000-0000-000000000001'
    );
  `);

  const nominations = await database.query(
    "SELECT count(*)::int AS count FROM agent_synad_day_nomination WHERE account_id = 101 AND access_path = 'POINT_LOOKUP'",
  );
  if (nominations.rows[0]?.count !== 3) {
    throw new Error("point-lookup day nomination was not compiled");
  }

  const admitted = await database.query(`
    SELECT admission_class, freshness_class, lag_publications, max_lag_budget,
           synopsis_watermark_high, newest_receipt_publication_cursor,
           attested_key_kind, synopsis_effect_observation, metadata_trust,
           fact_disposition, body_visibility, inlines_fact_body,
           opens_nested_expiry, ack_promoted_to_trust, packet_scan_used,
           counts_visible, sealed_count, denied_count, unknown_effect_count,
           admission_body
    FROM agent_synad_synopsis_admission
    WHERE account_id = 101
      AND utc_day = DATE '2026-10-08'
  `);
  const admission = admitted.rows[0];
  const body = admission?.admission_body ?? {};
  if (
    admission?.admission_class !== "ADMITTED" ||
    admission?.freshness_class !== "LAGGING" ||
    admission?.lag_publications !== 3 ||
    admission?.max_lag_budget !== 5 ||
    admission?.synopsis_watermark_high !== 12 ||
    admission?.newest_receipt_publication_cursor !== 15 ||
    admission?.attested_key_kind !== "AWAITING_CONFIRMATION" ||
    admission?.synopsis_effect_observation !== "ACKED" ||
    admission?.metadata_trust !== "UNTRUSTED_METADATA" ||
    admission?.fact_disposition !== "DISPUTED_HELD" ||
    admission?.body_visibility !== "OMITTED" ||
    admission?.inlines_fact_body !== false ||
    admission?.opens_nested_expiry !== false ||
    admission?.ack_promoted_to_trust !== false ||
    admission?.packet_scan_used !== false ||
    admission?.counts_visible !== true ||
    admission?.sealed_count !== 1 ||
    admission?.denied_count !== 1 ||
    admission?.unknown_effect_count !== 1 ||
    body.factBody !== undefined ||
    body.fact_body !== undefined ||
    body.attestedKeyKind !== "AWAITING_CONFIRMATION" ||
    body.ackPromotedToTrust !== false ||
    body.lagPublications !== 3 ||
    body.sealedCount !== 1
  ) {
    throw new Error(
      `lag admission did not admit within budget without promoting ACKED: ${JSON.stringify(admission)}`,
    );
  }

  const denied = await database.query(`
    SELECT a.admission_class, a.lag_publications, a.max_lag_budget,
           a.counts_visible, a.admission_body,
           c.trusted_next_action, c.sealed_count, c.denied_count,
           c.unknown_effect_count, c.card_body
    FROM agent_synad_synopsis_admission AS a
    JOIN agent_synad_perception_card AS c
      ON c.account_id = a.account_id AND c.utc_day = a.utc_day
    WHERE a.account_id = 101
      AND a.utc_day = DATE '2026-10-07'
  `);
  const deniedRow = denied.rows[0];
  const deniedCard = deniedRow?.card_body ?? {};
  if (
    deniedRow?.admission_class !== "DENIED" ||
    deniedRow?.lag_publications !== 8 ||
    deniedRow?.max_lag_budget !== 5 ||
    deniedRow?.counts_visible !== false ||
    deniedRow?.trusted_next_action !== "STOP_SYNOPSIS_USE" ||
    deniedRow?.sealed_count !== null ||
    deniedRow?.denied_count !== null ||
    deniedRow?.unknown_effect_count !== null ||
    deniedCard.sealedCount !== undefined ||
    deniedCard.factBody !== undefined
  ) {
    throw new Error(
      `over-budget lag was not denied without showing counts: ${JSON.stringify(deniedRow)}`,
    );
  }

  const unknown = await database.query(`
    SELECT a.admission_class, a.lag_publications, a.freshness_class,
           c.trusted_next_action, c.sealed_count, c.lag_publications AS card_lag
    FROM agent_synad_synopsis_admission AS a
    JOIN agent_synad_perception_card AS c
      ON c.account_id = a.account_id AND c.utc_day = a.utc_day
    WHERE a.account_id = 101
      AND a.utc_day = DATE '2026-10-05'
  `);
  const unknownRow = unknown.rows[0];
  if (
    unknownRow?.admission_class !== "UNKNOWN_EFFECT" ||
    unknownRow?.lag_publications !== null ||
    unknownRow?.freshness_class !== "UNKNOWN_EFFECT" ||
    unknownRow?.trusted_next_action !== "UNKNOWN_EFFECT" ||
    unknownRow?.sealed_count !== null ||
    unknownRow?.card_lag !== null
  ) {
    throw new Error(
      `silence was not kept as UNKNOWN_EFFECT: ${JSON.stringify(unknownRow)}`,
    );
  }

  const head = await database.query(`
    SELECT lag_publications, synopsis_watermark_high, freshness_class
    FROM agent_synad_freshness_head
    WHERE account_id = 101
      AND utc_day = DATE '2026-10-08'
  `);
  if (
    head.rows[0]?.lag_publications !== 3 ||
    head.rows[0]?.synopsis_watermark_high !== 12 ||
    head.rows[0]?.freshness_class !== "LAGGING"
  ) {
    throw new Error(
      `freshness head was rewritten by admission: ${JSON.stringify(head.rows[0])}`,
    );
  }

  const admittedCard = await database.query(`
    SELECT trusted_next_action, sealed_count, denied_count, unknown_effect_count
    FROM agent_synad_perception_card
    WHERE account_id = 101
      AND utc_day = DATE '2026-10-08'
  `);
  if (
    admittedCard.rows[0]?.trusted_next_action !== "USE_SEALED_COUNTS" ||
    admittedCard.rows[0]?.sealed_count !== 1 ||
    admittedCard.rows[0]?.denied_count !== 1 ||
    admittedCard.rows[0]?.unknown_effect_count !== 1
  ) {
    throw new Error(
      `admitted perception card did not expose sealed counts: ${JSON.stringify(admittedCard.rows[0])}`,
    );
  }

  const records = await database.query(`
    SELECT reason_code, lag_publications, max_lag_budget, admission_class, freshness_class
    FROM agent_synad_admission_publication
    WHERE account_id = 101
      AND utc_day = DATE '2026-10-08'
  `);
  if (
    records.rows.length !== 1 ||
    records.rows[0]?.reason_code !== "SYNOPSIS_LAG_ADMISSION_DECIDED" ||
    records.rows[0]?.lag_publications !== 3 ||
    records.rows[0]?.max_lag_budget !== 5 ||
    records.rows[0]?.admission_class !== "ADMITTED" ||
    records.rows[0]?.freshness_class !== "LAGGING"
  ) {
    throw new Error(
      "admission publication did not cite the lag and budget by day point lookup",
    );
  }

  await database.exec(`
    SELECT set_config('app.account_id', '101', true);
    SELECT reject_agent_synad_unscoped_scan(true, true);
  `);

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);
        SELECT reject_agent_synad_unscoped_scan(true, false);
      `),
    "unscoped day scan",
    "P0001",
  );

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);
        SELECT nominate_agent_synad_day(
          101,
          '20000000-0000-0000-0000-000000000001',
          NULL,
          '40000000-0000-0000-0000-000000000004',
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
        INSERT INTO agent_synad_session (
          account_id, session_id, profile_id, profile_version, status,
          state_revision, purpose, idempotency_key, budget_nominate_units,
          budget_bind_units, budget_decide_units, budget_vector_units,
          budget_publish_units, budget_notify_units,
          consumed_nominate_units, consumed_bind_units,
          consumed_decide_units, consumed_vector_units,
          consumed_publish_units, consumed_notify_units,
          budget_max_wall_time_ms, admit_threshold, max_days_per_session,
          max_nominated_days, max_lag_budget, deadline_at, started_by,
          principal_id, authorization_evidence_id, delegated_scope_hash,
          authorization_revision, resource_scope_hash, created_at, updated_at
        ) VALUES (
          101, '20000000-0000-0000-0000-000000000004',
          '10000000-0000-0000-0000-000000000001', 1, 'OPEN', 0,
          'Duplicate request', 'request-1', 100, 40, 8, 5, 8, 2,
          0, 0, 0, 0, 0, 0, 60000, 2, 1, 1, 5,
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
        UPDATE agent_synad_profile_admit_rule
        SET require_dual_control_admit = false
        WHERE account_id = 101
          AND profile_id = '10000000-0000-0000-0000-000000000001'
          AND profile_version = 1
          AND rule_id = 'admit-day';
      `),
    "mutation of a sealed admit rule",
    "P0001",
  );

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);
        INSERT INTO agent_synad_profile (
          account_id, profile_id, profile_version, name, status,
          definition_hash, canonicalization_version, compiler_version,
          approval_validation_hash, authorization_evidence_id,
          authorization_snapshot_hash, admit_threshold,
          max_days_per_session, max_nominated_days, max_lag_budget,
          semantic_tags, procedure_ref, revocation_policy, created_by, created_at,
          approved_by, approved_at
        ) VALUES (
          101, '10000000-0000-0000-0000-000000000002', 1,
          'Illegal approved profile', 'APPROVED',
          repeat('b', 64), 'jcs-v1', 'synad-admit-1',
          repeat('c', 64), '30000000-0000-0000-0000-000000000001',
          repeat('d', 64), 2, 1, 1, 5,
          ARRAY['incident'], 'proc:illegal', 'STOP_BEFORE_DECIDE',
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
        UPDATE agent_synad_admission_decision
        SET admit_hash = repeat('e', 64)
        WHERE account_id = 101
          AND decision_id = 'a0000000-0000-0000-0000-000000000099';
      `),
    "mutation of admission-decision identity",
    "P0001",
  );

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);
        UPDATE agent_synad_profile
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
        INSERT INTO agent_synad_effect_intent (
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
    INSERT INTO agent_synad_effect_intent (
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
        UPDATE agent_synad_effect_intent
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
        UPDATE agent_synad_profile
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
        INSERT INTO agent_synad_admission_decision (
          account_id, decision_id, certificate_id, session_id, utc_day,
          compile_kind, admission_class, freshness_class, effect_observation,
          attested_key_kind, fact_disposition, body_visibility, access_path,
          metadata_trust, opens_nested_expiry, inlines_fact_body,
          ack_promoted_to_trust, packet_scan_used, lag_publications,
          max_lag_budget, admit_hash, sealed_at, created_at
        ) VALUES (
          101, 'c0000000-0000-0000-0000-000000000001',
          '90000000-0000-0000-0000-000000000001',
          '20000000-0000-0000-0000-000000000001',
          DATE '2026-10-08', 'DECIDE_SYNOPSIS_ADMISSION', 'ADMITTED', 'LAGGING',
          'ACKED', 'TRUSTED_ENROLLED', 'DISPUTED_HELD', 'OMITTED', 'POINT_LOOKUP',
          'UNTRUSTED_METADATA', false, false, true, false,
          3, 5, repeat('6', 64), now(), now()
        );
      `),
    "ack-as-trust fence",
    "P0001",
  );

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);
        INSERT INTO agent_synad_freshness_head (
          account_id, utc_day, attestation_id, attestation_hash,
          freshness_class, lag_publications, synopsis_watermark_high,
          newest_receipt_publication_cursor, sealed_count, denied_count,
          unknown_effect_count, silence_observed,
          attestation_steward_a, attestation_steward_b,
          synopsis_steward_a, synopsis_steward_b,
          publication_steward_a, publication_steward_b,
          effect_observation, attested_key_kind, fact_disposition,
          body_visibility, metadata_trust, access_path,
          inlines_fact_body, opens_nested_expiry, ack_promoted_to_trust,
          packet_scan_used, attestation_body, attested_at, created_at
        ) VALUES (
          101, DATE '2026-10-04', 'b0000000-0000-0000-0000-000000000013',
          repeat('4', 64), 'LAGGING', 4, 12, 16, 1, 0, 0, false,
          'principal:att-a', 'principal:att-b',
          'principal:syn-a', 'principal:syn-b',
          'principal:pub-a', 'principal:pub-b',
          'ACKED', 'AWAITING_CONFIRMATION', 'DISPUTED_HELD',
          'OMITTED', 'UNTRUSTED_METADATA', 'POINT_LOOKUP',
          false, false, false, false,
          '{"factBody":"the disputed sentence","lagPublications":4}',
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
        INSERT INTO agent_synad_admission_decision (
          account_id, decision_id, certificate_id, session_id, utc_day,
          compile_kind, admission_class, freshness_class, effect_observation,
          attested_key_kind, fact_disposition, body_visibility, access_path,
          metadata_trust, opens_nested_expiry, inlines_fact_body,
          ack_promoted_to_trust, packet_scan_used, lag_publications,
          max_lag_budget, admit_hash, sealed_at, created_at
        ) VALUES (
          101, 'c0000000-0000-0000-0000-000000000002',
          '90000000-0000-0000-0000-000000000001',
          '20000000-0000-0000-0000-000000000001',
          DATE '2026-10-08', 'DECIDE_SYNOPSIS_ADMISSION', 'ADMITTED', 'LAGGING',
          'ACKED', 'AWAITING_CONFIRMATION', 'DISPUTED_HELD', 'OMITTED',
          'POINT_LOOKUP', 'UNTRUSTED_METADATA', true, false, false, false,
          3, 5, repeat('6', 64), now(), now()
        );
      `),
    "nested-expiry fence",
    "P0001",
  );

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);
        INSERT INTO agent_synad_admission_decision (
          account_id, decision_id, certificate_id, session_id, utc_day,
          compile_kind, admission_class, freshness_class, effect_observation,
          attested_key_kind, fact_disposition, body_visibility, access_path,
          metadata_trust, opens_nested_expiry, inlines_fact_body,
          ack_promoted_to_trust, packet_scan_used, lag_publications,
          max_lag_budget, admit_hash, sealed_at, created_at
        ) VALUES (
          101, 'c0000000-0000-0000-0000-000000000003',
          '90000000-0000-0000-0000-000000000001',
          '20000000-0000-0000-0000-000000000001',
          DATE '2026-10-08', 'DECIDE_SYNOPSIS_ADMISSION', 'ADMITTED', 'LAGGING',
          'ACKED', 'AWAITING_CONFIRMATION', 'DISPUTED_HELD', 'OMITTED',
          'PACKET_SCAN', 'UNTRUSTED_METADATA', false, false, false, true,
          3, 5, repeat('6', 64), now(), now()
        );
      `),
    "context-packet scan fence",
    "P0001",
  );

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);
        INSERT INTO agent_synad_admission_certificate (
          account_id, certificate_id, session_id, compile_id, consumer_ref,
          utc_day, purpose_hash, lag_publications, max_lag_budget, admission_class,
          admission_steward_a, admission_steward_b,
          attestation_steward_a, attestation_steward_b,
          synopsis_steward_a, synopsis_steward_b,
          publication_steward_a, publication_steward_b,
          sealed_revision, sealed_at, created_at
        ) VALUES (
          101, '90000000-0000-0000-0000-000000000004',
          '20000000-0000-0000-0000-000000000001',
          '70000000-0000-0000-0000-000000000001',
          'consumer:reused-steward',
          DATE '2026-10-08', repeat('a', 64), 3, 5, 'ADMITTED',
          'principal:pub-a', 'principal:adm-b',
          'principal:att-a', 'principal:att-b',
          'principal:syn-a', 'principal:syn-b',
          'principal:pub-a', 'principal:pub-b',
          2, now(), now()
        );
      `),
    "steward reuse",
    "P0001",
  );

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);
        INSERT INTO agent_synad_admission_decision (
          account_id, decision_id, certificate_id, session_id, utc_day,
          compile_kind, admission_class, freshness_class, effect_observation,
          attested_key_kind, fact_disposition, body_visibility, access_path,
          metadata_trust, opens_nested_expiry, inlines_fact_body,
          ack_promoted_to_trust, packet_scan_used, lag_publications,
          max_lag_budget, admit_hash, sealed_at, created_at
        ) VALUES (
          101, 'c0000000-0000-0000-0000-000000000004',
          '90000000-0000-0000-0000-000000000001',
          '20000000-0000-0000-0000-000000000001',
          DATE '2026-10-08', 'DECIDE_SYNOPSIS_ADMISSION', 'ADMITTED', 'LAGGING',
          'ACKED', 'AWAITING_CONFIRMATION', 'DISPUTED_HELD', 'OMITTED',
          'POINT_LOOKUP', 'UNTRUSTED_METADATA', false, false, false, false,
          9, 5, repeat('6', 64), now(), now()
        );
      `),
    "forged admission above the lag budget",
    "P0001",
  );

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);
        UPDATE agent_synad_freshness_head
        SET lag_publications = 0
        WHERE account_id = 101
          AND utc_day = DATE '2026-10-08';
      `),
    "mutation of a sealed freshness head",
    "P0001",
  );

  const tenantCount = await database.query(
    "SELECT count(*)::int AS count FROM agent_synad_session WHERE account_id = 101",
  );
  if (tenantCount.rows[0]?.count !== 3) {
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
        executableConstraintChecks: 17,
        tenantPoliciesChecked: tableCount,
      },
      status: "ok",
    },
    null,
    2,
  ),
);
