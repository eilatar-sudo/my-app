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
  "ACKNOWLEDGED_OBSERVATION_HELD",
  "NOT_ACKNOWLEDGED_OBSERVATION_CANNOT_HOLD",
  "does not open another nested expiry",
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
if (queryCount !== 6 || mutationCount !== 8) {
  throw new Error(
    `expected 6 queries and 8 mutations, found ${queryCount} and ${mutationCount}`,
  );
}

const ddlBlock = sqlBlocks.find((block) =>
  block.includes("CREATE TYPE acrah_session_status"),
);
const vectorBlock = sqlBlocks.find((block) =>
  block.includes("CREATE TABLE agent_acrah_profile_embedding"),
);
if (!ddlBlock || !vectorBlock) {
  throw new Error("could not locate executable SQL schema blocks");
}
if (
  !/CREATE TABLE agent_acrah_profile_embedding \(\n\s+account_id/.test(
    vectorBlock,
  )
) {
  throw new Error("vector schema does not lead with account_id");
}
if (vectorBlock.includes("USING hnsw")) {
  throw new Error("reference schema must not create a cross-tenant HNSW index");
}
if (ddlBlock.includes("context_packet") || ddlBlock.includes("packet_catalog")) {
  throw new Error("hold schema must not scan or store a context-packet catalog");
}

const tableCount = (ddlBlock.match(/CREATE TABLE /g) ?? []).length;
const indexCount = (ddlBlock.match(/CREATE (?:UNIQUE )?INDEX /g) ?? []).length;
if (tableCount < 20) {
  throw new Error(`expected at least 20 relational tables, found ${tableCount}`);
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

const stewards = `
  'principal:ack-a', 'principal:ack-b',
  'principal:rrec-a', 'principal:rrec-b',
  'principal:grant-a', 'principal:grant-b',
  'principal:cite-a', 'principal:cite-b',
  'principal:prov-a', 'principal:prov-b',
  'principal:effect-a', 'principal:effect-b',
  'principal:bind-a', 'principal:bind-b',
  'principal:rcpt-a', 'principal:rcpt-b',
  'principal:card-a', 'principal:card-b',
  'principal:adm-a', 'principal:adm-b',
  'principal:att-a', 'principal:att-b',
  'principal:syn-a', 'principal:syn-b',
  'principal:pub-a', 'principal:pub-b'
`;

function observationHead(
  day,
  consumer,
  acknowledgementId,
  admission,
  acknowledgementClass,
  acknowledgementReason,
  acknowledgementRecorded,
  receiptIssued,
  freshness,
  sealed,
  denied,
  unknown,
  lag,
  budget,
  observation,
  next,
  body,
) {
  const count = (value) => (value === null ? "NULL" : String(value));
  const flag = (value) => (value ? "true" : "false");
  return `(
    101, DATE '${day}', '${consumer}',
    '${acknowledgementId}', 'principal:reader-1',
    'tool:cite-admitted-counts', 'effect:cited-admitted-counts',
    'provider:receipt-cited-admitted-counts',
    'citation:card-cited-admitted-counts',
    'grant:reader-cited-admitted-counts',
    'receipt:reader-cited-admitted-counts',
    'ack:reader-cited-admitted-counts',
    '${admission}', '${acknowledgementClass}', '${acknowledgementReason}',
    ${flag(acknowledgementRecorded)}, ${flag(receiptIssued)}, '${freshness}',
    ${count(sealed)}, ${count(denied)}, ${count(unknown)}, ${count(lag)}, ${budget},
    '${observation}', 'AWAITING_CONFIRMATION', 'DISPUTED_HELD', 'OMITTED',
    'UNTRUSTED_METADATA', 'POINT_LOOKUP', false, false, false, false, false,
    '${next}',
    ${stewards},
    '${body}',
    now(), now()
  )`;
}

const database = await PGlite.create({ extensions: { vector } });
let rejectionChecks = 0;
try {
  await database.exec("CREATE EXTENSION IF NOT EXISTS vector;");
  await database.exec(ddlBlock);
  await database.exec(vectorBlock);

  await database.exec(`
    SELECT set_config('app.account_id', '101', true);

    INSERT INTO agent_acrah_authorization_evidence (
      account_id, evidence_id, principal_id, policy_revision,
      resource_acl_revision, redacted_scope_summary,
      encrypted_evidence_ref, evidence_hash, immutable_archive_ref, created_at
    ) VALUES (
      101, '30000000-0000-0000-0000-000000000001', 'principal:test', 7, 11,
      '{"scopes":["acknowledgement.hold.record"]}', 'kms://evidence/fixture',
      repeat('8', 64), 'worm://evidence/fixture', now()
    );

    INSERT INTO agent_acrah_profile (
      account_id, profile_id, profile_version, name, status,
      definition_hash, canonicalization_version, compiler_version,
      approval_validation_hash, authorization_evidence_id,
      authorization_snapshot_hash, allowed_purpose, allowed_effect_code,
      allowed_provider_code, allowed_citation_code, allowed_grant_code,
      allowed_receipt_code, allowed_acknowledgement_code, allowed_hold_code,
      hold_threshold, max_observations_per_session, max_nominated_observations,
      max_readers_per_observation, semantic_tags, procedure_ref,
      revocation_policy, created_by, created_at
    ) VALUES (
      101, '10000000-0000-0000-0000-000000000001', 1,
      'Daily admitted count acknowledgement hold', 'DRAFT',
      repeat('a', 64), 'jcs-v1', 'acrah-hold-1',
      NULL, '30000000-0000-0000-0000-000000000001',
      repeat('d', 64), 'tool:cite-admitted-counts', 'effect:cited-admitted-counts',
      'provider:receipt-cited-admitted-counts',
      'citation:card-cited-admitted-counts',
      'grant:reader-cited-admitted-counts',
      'receipt:reader-cited-admitted-counts',
      'ack:reader-cited-admitted-counts',
      'hold:reader-cited-admitted-counts',
      2, 1, 1, 1,
      ARRAY['incident', 'acknowledgement-hold'],
      'proc:admitted-count-acknowledgement-hold',
      'STOP_BEFORE_HOLD', 'principal:test', now()
    );

    INSERT INTO agent_acrah_profile_hold_rule (
      account_id, profile_id, profile_version, rule_id, ordinal,
      allowed_classes, hold_threshold, max_observations_per_session,
      max_nominated_observations, max_readers_per_observation,
      require_dual_control_hold, hold_instruction
    ) VALUES (
      101, '10000000-0000-0000-0000-000000000001', 1, 'hold-observation', 1,
      ARRAY['ADMITTED', 'DENIED', 'UNKNOWN_EFFECT']::acrah_admission_class[],
      2, 1, 1, 1, true,
      '{"hold_one_observation":true,"observation_reader_only":true,"counts_only_when_acknowledgement_recorded":true,"ack_never_trust":true,"point_lookup_only":true,"no_nested_expiry":true,"packet_never_scanned":true,"acknowledged_observation_only":true,"executes_tool":false}'
    );

    SELECT approve_agent_acrah_profile(
      101,
      '10000000-0000-0000-0000-000000000001',
      1,
      repeat('a', 64),
      'principal:approver'
    );

    INSERT INTO agent_acrah_acknowledgement_head (
      account_id, utc_day, consumer_principal_id, receipt_acknowledgement_id,
      reader_principal_id, purpose_code, effect_code, provider_code, citation_code,
      grant_code, receipt_code, acknowledgement_code, admission_class,
      acknowledgement_class, acknowledgement_reason, acknowledgement_recorded,
      receipt_issued, freshness_class, sealed_count, denied_count, unknown_effect_count,
      lag_publications, max_lag_budget, effect_observation, attested_key_kind,
      fact_disposition, body_visibility, metadata_trust, access_path, inlines_fact_body,
      opens_nested_expiry, ack_promoted_to_trust, packet_scan_used, executes_tool,
      trusted_next_action, acknowledgement_steward_a, acknowledgement_steward_b,
      reader_receipt_steward_a, reader_receipt_steward_b,
      grant_steward_a, grant_steward_b,
      citation_steward_a, citation_steward_b,
      provider_steward_a, provider_steward_b,
      effect_steward_a, effect_steward_b,
      bind_steward_a, bind_steward_b,
      provider_receipt_steward_a, provider_receipt_steward_b,
      card_steward_a, card_steward_b,
      admission_steward_a, admission_steward_b,
      attestation_steward_a, attestation_steward_b,
      synopsis_steward_a, synopsis_steward_b,
      publication_steward_a, publication_steward_b,
      acknowledgement_body, sealed_at, created_at
    ) VALUES
    ${observationHead(
      "2026-10-08",
      "principal:consumer-1",
      "e4000000-0000-0000-0000-000000000001",
      "ADMITTED",
      "ACKNOWLEDGED",
      "ISSUED_READER_RECEIPT_ACKNOWLEDGED",
      true,
      true,
      "LAGGING",
      1,
      1,
      1,
      3,
      5,
      "ACKED",
      "HOLD_RECEIPT_ACKNOWLEDGEMENT",
      '{"acknowledgementClass":"ACKNOWLEDGED","acknowledgementRecorded":true,"sealedCount":1,"deniedCount":1,"unknownEffectCount":1,"lagPublications":3}',
    )},
    ${observationHead(
      "2026-10-07",
      "principal:consumer-1",
      "e4000000-0000-0000-0000-000000000002",
      "DENIED",
      "NOT_ACKNOWLEDGED",
      "NOT_ISSUED_RECEIPT_CANNOT_ACKNOWLEDGE",
      false,
      false,
      "LAGGING",
      null,
      null,
      null,
      8,
      5,
      "ACKED",
      "STOP_RECEIPT_ACKNOWLEDGEMENT",
      '{"acknowledgementClass":"NOT_ACKNOWLEDGED","acknowledgementRecorded":false,"lagPublications":8}',
    )},
    ${observationHead(
      "2026-10-05",
      "principal:consumer-1",
      "e4000000-0000-0000-0000-000000000003",
      "UNKNOWN_EFFECT",
      "NOT_ACKNOWLEDGED",
      "NOT_ISSUED_RECEIPT_CANNOT_ACKNOWLEDGE",
      false,
      false,
      "UNKNOWN_EFFECT",
      null,
      null,
      null,
      null,
      5,
      "UNKNOWN_EFFECT",
      "OMIT_RECEIPT_ACKNOWLEDGEMENT",
      '{"acknowledgementClass":"NOT_ACKNOWLEDGED","acknowledgementRecorded":false}',
    )};

    INSERT INTO agent_acrah_session (
      account_id, session_id, profile_id, profile_version, status,
      state_revision, purpose, idempotency_key, budget_nominate_units,
      budget_hold_units, budget_vector_units, budget_notify_units,
      consumed_nominate_units, consumed_hold_units, consumed_vector_units,
      consumed_notify_units, budget_max_wall_time_ms, hold_threshold,
      max_observations_per_session, max_nominated_observations,
      max_readers_per_observation, deadline_at, started_by, principal_id,
      authorization_evidence_id, delegated_scope_hash, authorization_revision,
      resource_scope_hash, created_at, updated_at
    ) VALUES
    (
      101, '20000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001', 1, 'OPEN', 0,
      'Hold one acknowledged observation for its reader', 'request-1',
      100, 40, 5, 2,
      0, 0, 0, 0, 60000, 2, 1, 1, 1,
      now() + interval '1 minute',
      'principal:test', 'principal:consumer-1',
      '30000000-0000-0000-0000-000000000001',
      repeat('e', 64), 7, repeat('f', 64), now(), now()
    ),
    (
      101, '20000000-0000-0000-0000-000000000002',
      '10000000-0000-0000-0000-000000000001', 1, 'OPEN', 0,
      'Refuse a hold for one not-acknowledged observation', 'request-2',
      100, 40, 5, 2,
      0, 0, 0, 0, 60000, 2, 1, 1, 1,
      now() + interval '1 minute',
      'principal:test', 'principal:consumer-1',
      '30000000-0000-0000-0000-000000000001',
      repeat('e', 64), 7, repeat('f', 64), now(), now()
    ),
    (
      101, '20000000-0000-0000-0000-000000000003',
      '10000000-0000-0000-0000-000000000001', 1, 'OPEN', 0,
      'Refuse a hold for one silent observation', 'request-3',
      100, 40, 5, 2,
      0, 0, 0, 0, 60000, 2, 1, 1, 1,
      now() + interval '1 minute',
      'principal:test', 'principal:consumer-1',
      '30000000-0000-0000-0000-000000000001',
      repeat('e', 64), 7, repeat('f', 64), now(), now()
    );

    SELECT nominate_agent_acrah_observation(
      101, '20000000-0000-0000-0000-000000000001', DATE '2026-10-08',
      'principal:consumer-1', '40000000-0000-0000-0000-000000000001', repeat('1', 64)
    );
    SELECT nominate_agent_acrah_observation(
      101, '20000000-0000-0000-0000-000000000002', DATE '2026-10-07',
      'principal:consumer-1', '40000000-0000-0000-0000-000000000002', repeat('2', 64)
    );
    SELECT nominate_agent_acrah_observation(
      101, '20000000-0000-0000-0000-000000000003', DATE '2026-10-05',
      'principal:consumer-1', '40000000-0000-0000-0000-000000000003', repeat('3', 64)
    );

    SELECT hold_agent_acrah_acknowledgement(
      101, '20000000-0000-0000-0000-000000000001', DATE '2026-10-08',
      'principal:consumer-1', 'principal:reader-1',
      'hold:reader-cited-admitted-counts',
      '70000000-0000-0000-0000-000000000001',
      '90000000-0000-0000-0000-000000000001',
      'a0000000-0000-0000-0000-000000000001',
      'c4000000-0000-0000-0000-000000000001',
      repeat('6', 64),
      'principal:hold-a', 'principal:hold-b'
    );
    SELECT hold_agent_acrah_acknowledgement(
      101, '20000000-0000-0000-0000-000000000002', DATE '2026-10-07',
      'principal:consumer-1', 'principal:reader-1',
      'hold:reader-cited-admitted-counts',
      '70000000-0000-0000-0000-000000000002',
      '90000000-0000-0000-0000-000000000002',
      'a0000000-0000-0000-0000-000000000002',
      'c4000000-0000-0000-0000-000000000002',
      repeat('7', 64),
      'principal:hold-a', 'principal:hold-b'
    );
    SELECT hold_agent_acrah_acknowledgement(
      101, '20000000-0000-0000-0000-000000000003', DATE '2026-10-05',
      'principal:consumer-1', 'principal:reader-1',
      'hold:reader-cited-admitted-counts',
      '70000000-0000-0000-0000-000000000003',
      '90000000-0000-0000-0000-000000000003',
      'a0000000-0000-0000-0000-000000000003',
      'c4000000-0000-0000-0000-000000000003',
      repeat('8', 64),
      'principal:hold-a', 'principal:hold-b'
    );
  `);

  const recorded = await database.query(`
    SELECT hold_class, hold_reason, hold_recorded, acknowledgement_recorded,
           reader_principal_id, sealed_count, denied_count, unknown_effect_count,
           lag_publications, trusted_next_action, executes_tool, attested_key_kind,
           ack_promoted_to_trust
    FROM agent_acrah_consumer_hold
    WHERE account_id = 101
      AND utc_day = DATE '2026-10-08'
      AND consumer_principal_id = 'principal:consumer-1'
  `);
  const recordedRow = recorded.rows[0];
  if (
    recordedRow?.hold_class !== "HELD" ||
    recordedRow?.hold_reason !== "ACKNOWLEDGED_OBSERVATION_HELD" ||
    recordedRow?.hold_recorded !== true ||
    recordedRow?.acknowledgement_recorded !== true ||
    recordedRow?.reader_principal_id !== "principal:reader-1" ||
    Number(recordedRow?.sealed_count) !== 1 ||
    Number(recordedRow?.denied_count) !== 1 ||
    Number(recordedRow?.unknown_effect_count) !== 1 ||
    Number(recordedRow?.lag_publications) !== 3 ||
    recordedRow?.trusted_next_action !== "HOLD_ACKNOWLEDGED_OBSERVATION" ||
    recordedRow?.executes_tool !== false ||
    recordedRow?.attested_key_kind !== "AWAITING_CONFIRMATION" ||
    recordedRow?.ack_promoted_to_trust !== false
  ) {
    throw new Error(`held observation fixture mismatch: ${JSON.stringify(recordedRow)}`);
  }

  const head = await database.query(`
    SELECT lag_publications, sealed_count, acknowledgement_class,
           acknowledgement_recorded, reader_principal_id
    FROM agent_acrah_acknowledgement_head
    WHERE account_id = 101
      AND utc_day = DATE '2026-10-08'
      AND consumer_principal_id = 'principal:consumer-1'
  `);
  if (
    Number(head.rows[0]?.lag_publications) !== 3 ||
    Number(head.rows[0]?.sealed_count) !== 1 ||
    head.rows[0]?.acknowledgement_class !== "ACKNOWLEDGED" ||
    head.rows[0]?.acknowledgement_recorded !== true ||
    head.rows[0]?.reader_principal_id !== "principal:reader-1"
  ) {
    throw new Error("acknowledgement head was rewritten");
  }

  const denied = await database.query(`
    SELECT hold_class, hold_reason, hold_recorded, acknowledgement_recorded,
           sealed_count, lag_publications, trusted_next_action
    FROM agent_acrah_consumer_hold
    WHERE account_id = 101
      AND utc_day = DATE '2026-10-07'
      AND consumer_principal_id = 'principal:consumer-1'
  `);
  if (
    denied.rows[0]?.hold_class !== "NOT_HELD" ||
    denied.rows[0]?.hold_reason !== "NOT_ACKNOWLEDGED_OBSERVATION_CANNOT_HOLD" ||
    denied.rows[0]?.hold_recorded !== false ||
    denied.rows[0]?.acknowledgement_recorded !== false ||
    denied.rows[0]?.sealed_count !== null ||
    Number(denied.rows[0]?.lag_publications) !== 8 ||
    denied.rows[0]?.trusted_next_action !== "STOP_ACKNOWLEDGEMENT_HOLD"
  ) {
    throw new Error(`denied hold fixture mismatch: ${JSON.stringify(denied.rows[0])}`);
  }

  const deniedHead = await database.query(`
    SELECT lag_publications, acknowledgement_class, acknowledgement_recorded
    FROM agent_acrah_acknowledgement_head
    WHERE account_id = 101
      AND utc_day = DATE '2026-10-07'
      AND consumer_principal_id = 'principal:consumer-1'
  `);
  if (
    Number(deniedHead.rows[0]?.lag_publications) !== 8 ||
    deniedHead.rows[0]?.acknowledgement_class !== "NOT_ACKNOWLEDGED" ||
    deniedHead.rows[0]?.acknowledgement_recorded !== false
  ) {
    throw new Error("denied acknowledgement head was rewritten");
  }

  const silent = await database.query(`
    SELECT hold_class, hold_recorded, sealed_count, lag_publications, trusted_next_action
    FROM agent_acrah_consumer_hold
    WHERE account_id = 101
      AND utc_day = DATE '2026-10-05'
      AND consumer_principal_id = 'principal:consumer-1'
  `);
  if (
    silent.rows[0]?.hold_class !== "NOT_HELD" ||
    silent.rows[0]?.hold_recorded !== false ||
    silent.rows[0]?.sealed_count !== null ||
    silent.rows[0]?.lag_publications !== null ||
    silent.rows[0]?.trusted_next_action !== "OMIT_ACKNOWLEDGEMENT_HOLD"
  ) {
    throw new Error(`silent hold fixture mismatch: ${JSON.stringify(silent.rows[0])}`);
  }

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);
        SELECT nominate_agent_acrah_observation(
          101, '20000000-0000-0000-0000-000000000001', NULL,
          'principal:consumer-1', '40000000-0000-0000-0000-000000000091', repeat('9', 64)
        );
      `),
    "null day nomination",
    "P0001",
  );
  rejectionChecks += 1;

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);
        SELECT nominate_agent_acrah_observation(
          101, '20000000-0000-0000-0000-000000000001', DATE '2026-10-08',
          'principal:consumer-1', '40000000-0000-0000-0000-000000000092', repeat('9', 64)
        );
      `),
    "second observation nomination",
    "P0001",
  );
  rejectionChecks += 1;

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);
        SELECT hold_agent_acrah_acknowledgement(
          101, '20000000-0000-0000-0000-000000000001', DATE '2026-10-08',
          'principal:consumer-1', 'principal:reader-1',
          'hold:other-reader',
          '70000000-0000-0000-0000-000000000091',
          '90000000-0000-0000-0000-000000000091',
          'a0000000-0000-0000-0000-000000000091',
          'c4000000-0000-0000-0000-000000000091',
          repeat('6', 64),
          'principal:hold-a', 'principal:hold-b'
        );
      `),
    "hold code outside the profile",
    "P0001",
  );
  rejectionChecks += 1;

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);
        INSERT INTO agent_acrah_acknowledgement_head (
          account_id, utc_day, consumer_principal_id, receipt_acknowledgement_id,
          reader_principal_id, purpose_code, effect_code, provider_code, citation_code,
          grant_code, receipt_code, acknowledgement_code, admission_class,
          acknowledgement_class, acknowledgement_reason, acknowledgement_recorded,
          receipt_issued, freshness_class, sealed_count, denied_count, unknown_effect_count,
          lag_publications, max_lag_budget, effect_observation, attested_key_kind,
          fact_disposition, body_visibility, metadata_trust, access_path, inlines_fact_body,
          opens_nested_expiry, ack_promoted_to_trust, packet_scan_used, executes_tool,
          trusted_next_action, acknowledgement_steward_a, acknowledgement_steward_b,
          reader_receipt_steward_a, reader_receipt_steward_b,
          grant_steward_a, grant_steward_b,
          citation_steward_a, citation_steward_b,
          provider_steward_a, provider_steward_b,
          effect_steward_a, effect_steward_b,
          bind_steward_a, bind_steward_b,
          provider_receipt_steward_a, provider_receipt_steward_b,
          card_steward_a, card_steward_b,
          admission_steward_a, admission_steward_b,
          attestation_steward_a, attestation_steward_b,
          synopsis_steward_a, synopsis_steward_b,
          publication_steward_a, publication_steward_b,
          acknowledgement_body, sealed_at, created_at
        ) VALUES (
          101, DATE '2026-10-04', 'principal:consumer-1',
          'e4000000-0000-0000-0000-000000000004', 'principal:reader-1',
          'tool:cite-admitted-counts', 'effect:cited-admitted-counts',
          'provider:receipt-cited-admitted-counts',
          'citation:card-cited-admitted-counts',
          'grant:reader-cited-admitted-counts',
          'receipt:reader-cited-admitted-counts',
          'ack:reader-cited-admitted-counts',
          'ADMITTED', 'ACKNOWLEDGED', 'ISSUED_READER_RECEIPT_ACKNOWLEDGED',
          true, true, 'LAGGING', 1, 0, 0, 4, 5,
          'ACKED', 'AWAITING_CONFIRMATION', 'DISPUTED_HELD', 'OMITTED',
          'UNTRUSTED_METADATA', 'POINT_LOOKUP', false, false, false, false, false,
          'HOLD_RECEIPT_ACKNOWLEDGEMENT',
          ${stewards},
          '{"factBody":"the disputed sentence","sealedCount":1,"deniedCount":0,"unknownEffectCount":0}',
          now(), now()
        );
      `),
    "fact-body inline fence",
    "P0001",
  );
  rejectionChecks += 1;

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);
        INSERT INTO agent_acrah_hold_decision (
          account_id, decision_id, certificate_id, session_id, utc_day,
          consumer_principal_id, reader_principal_id, hold_code, compile_kind,
          admission_class, acknowledgement_class, hold_class, freshness_class,
          effect_observation, attested_key_kind, fact_disposition, body_visibility,
          access_path, metadata_trust, opens_nested_expiry, inlines_fact_body,
          ack_promoted_to_trust, packet_scan_used, hold_recorded, executes_tool,
          lag_publications, max_lag_budget, hold_hash, sealed_at, created_at
        ) VALUES (
          101, 'a0000000-0000-0000-0000-000000000092',
          '90000000-0000-0000-0000-000000000001',
          '20000000-0000-0000-0000-000000000001',
          DATE '2026-10-08', 'principal:consumer-1', 'principal:reader-1',
          'hold:reader-cited-admitted-counts',
          'HOLD_ACKNOWLEDGED_OBSERVATION', 'ADMITTED', 'ACKNOWLEDGED', 'HELD',
          'LAGGING', 'ACKED', 'AWAITING_CONFIRMATION', 'DISPUTED_HELD', 'OMITTED',
          'POINT_LOOKUP', 'UNTRUSTED_METADATA', true, false, false, false, true,
          false, 3, 5, repeat('6', 64), now(), now()
        );
      `),
    "nested-expiry fence",
    "P0001",
  );
  rejectionChecks += 1;

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);
        INSERT INTO agent_acrah_hold_decision (
          account_id, decision_id, certificate_id, session_id, utc_day,
          consumer_principal_id, reader_principal_id, hold_code, compile_kind,
          admission_class, acknowledgement_class, hold_class, freshness_class,
          effect_observation, attested_key_kind, fact_disposition, body_visibility,
          access_path, metadata_trust, opens_nested_expiry, inlines_fact_body,
          ack_promoted_to_trust, packet_scan_used, hold_recorded, executes_tool,
          lag_publications, max_lag_budget, hold_hash, sealed_at, created_at
        ) VALUES (
          101, 'a0000000-0000-0000-0000-000000000093',
          '90000000-0000-0000-0000-000000000001',
          '20000000-0000-0000-0000-000000000001',
          DATE '2026-10-08', 'principal:consumer-1', 'principal:reader-1',
          'hold:reader-cited-admitted-counts',
          'HOLD_ACKNOWLEDGED_OBSERVATION', 'ADMITTED', 'ACKNOWLEDGED', 'HELD',
          'LAGGING', 'ACKED', 'AWAITING_CONFIRMATION', 'DISPUTED_HELD', 'OMITTED',
          'PACKET_SCAN', 'UNTRUSTED_METADATA', false, false, false, true, true,
          false, 3, 5, repeat('6', 64), now(), now()
        );
      `),
    "packet scan fence",
    "P0001",
  );
  rejectionChecks += 1;

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);
        INSERT INTO agent_acrah_hold_certificate (
          account_id, certificate_id, session_id, compile_id, consumer_principal_id,
          reader_principal_id, utc_day, hold_code, acknowledgement_code, provider_code,
          hold_hash, admission_class, acknowledgement_class, hold_class, hold_recorded,
          hold_steward_a, hold_steward_b,
          acknowledgement_steward_a, acknowledgement_steward_b,
          reader_receipt_steward_a, reader_receipt_steward_b,
          grant_steward_a, grant_steward_b,
          citation_steward_a, citation_steward_b,
          provider_steward_a, provider_steward_b,
          effect_steward_a, effect_steward_b,
          bind_steward_a, bind_steward_b,
          provider_receipt_steward_a, provider_receipt_steward_b,
          card_steward_a, card_steward_b,
          admission_steward_a, admission_steward_b,
          attestation_steward_a, attestation_steward_b,
          synopsis_steward_a, synopsis_steward_b,
          publication_steward_a, publication_steward_b,
          sealed_revision, sealed_at, created_at
        ) VALUES (
          101, '90000000-0000-0000-0000-000000000091',
          '20000000-0000-0000-0000-000000000001',
          '70000000-0000-0000-0000-000000000001',
          'principal:consumer-1', 'principal:reader-1',
          DATE '2026-10-08', 'hold:reader-cited-admitted-counts',
          'ack:reader-cited-admitted-counts',
          'provider:receipt-cited-admitted-counts', repeat('a', 64),
          'ADMITTED', 'ACKNOWLEDGED', 'HELD', true,
          'principal:cite-a', 'principal:hold-b',
          'principal:ack-a', 'principal:ack-b',
          'principal:rrec-a', 'principal:rrec-b',
          'principal:grant-a', 'principal:grant-b',
          'principal:cite-a', 'principal:cite-b',
          'principal:prov-a', 'principal:prov-b',
          'principal:effect-a', 'principal:effect-b',
          'principal:bind-a', 'principal:bind-b',
          'principal:rcpt-a', 'principal:rcpt-b',
          'principal:card-a', 'principal:card-b',
          'principal:adm-a', 'principal:adm-b',
          'principal:att-a', 'principal:att-b',
          'principal:syn-a', 'principal:syn-b',
          'principal:pub-a', 'principal:pub-b',
          2, now(), now()
        );
      `),
    "steward reuse",
    "P0001",
  );
  rejectionChecks += 1;

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);
        INSERT INTO agent_acrah_consumer_hold (
          account_id, utc_day, consumer_principal_id, consumer_hold_id, session_id,
          certificate_id, receipt_acknowledgement_id, reader_principal_id, purpose_code,
          effect_code, provider_code, citation_code, grant_code, receipt_code,
          acknowledgement_code, hold_code, admission_class, acknowledgement_class, hold_class,
          acknowledgement_reason, hold_reason, acknowledgement_recorded, hold_recorded,
          sealed_count, denied_count, unknown_effect_count, lag_publications, max_lag_budget,
          effect_observation, attested_key_kind, fact_disposition, body_visibility, metadata_trust,
          access_path, inlines_fact_body, opens_nested_expiry, ack_promoted_to_trust,
          packet_scan_used, executes_tool, trusted_next_action, hold_steward_a, hold_steward_b,
          acknowledgement_steward_a, acknowledgement_steward_b, hold_body, sealed_at, created_at
        ) VALUES (
          101, DATE '2026-10-07', 'principal:consumer-1',
          'c4000000-0000-0000-0000-000000000091',
          '20000000-0000-0000-0000-000000000002',
          '90000000-0000-0000-0000-000000000002',
          'e4000000-0000-0000-0000-000000000002',
          'principal:reader-1',
          'tool:cite-admitted-counts', 'effect:cited-admitted-counts',
          'provider:receipt-cited-admitted-counts',
          'citation:card-cited-admitted-counts',
          'grant:reader-cited-admitted-counts',
          'receipt:reader-cited-admitted-counts',
          'ack:reader-cited-admitted-counts',
          'hold:reader-cited-admitted-counts',
          'DENIED', 'ACKNOWLEDGED', 'HELD',
          'NOT_ISSUED_RECEIPT_CANNOT_ACKNOWLEDGE', 'ACKNOWLEDGED_OBSERVATION_HELD',
          true, true,
          4, 2, 1,
          8, 5, 'ACKED', 'AWAITING_CONFIRMATION',
          'DISPUTED_HELD', 'OMITTED', 'UNTRUSTED_METADATA', 'POINT_LOOKUP',
          false, false, false, false, false, 'HOLD_ACKNOWLEDGED_OBSERVATION',
          'principal:hold-a', 'principal:hold-b',
          'principal:ack-a', 'principal:ack-b',
          '{"sealedCount":4,"deniedCount":2,"unknownEffectCount":1,"holdCode":"hold:reader-cited-admitted-counts"}',
          now(), now()
        );
      `),
    "successful hold on a not-acknowledged observation",
    "P0001",
  );
  rejectionChecks += 1;

  await database.exec(`
    SELECT set_config('app.account_id', '101', true);
    INSERT INTO agent_acrah_acknowledgement_head (
      account_id, utc_day, consumer_principal_id, receipt_acknowledgement_id,
      reader_principal_id, purpose_code, effect_code, provider_code, citation_code,
      grant_code, receipt_code, acknowledgement_code, admission_class,
      acknowledgement_class, acknowledgement_reason, acknowledgement_recorded,
      receipt_issued, freshness_class, sealed_count, denied_count, unknown_effect_count,
      lag_publications, max_lag_budget, effect_observation, attested_key_kind,
      fact_disposition, body_visibility, metadata_trust, access_path, inlines_fact_body,
      opens_nested_expiry, ack_promoted_to_trust, packet_scan_used, executes_tool,
      trusted_next_action, acknowledgement_steward_a, acknowledgement_steward_b,
      reader_receipt_steward_a, reader_receipt_steward_b,
      grant_steward_a, grant_steward_b,
      citation_steward_a, citation_steward_b,
      provider_steward_a, provider_steward_b,
      effect_steward_a, effect_steward_b,
      bind_steward_a, bind_steward_b,
      provider_receipt_steward_a, provider_receipt_steward_b,
      card_steward_a, card_steward_b,
      admission_steward_a, admission_steward_b,
      attestation_steward_a, attestation_steward_b,
      synopsis_steward_a, synopsis_steward_b,
      publication_steward_a, publication_steward_b,
      acknowledgement_body, sealed_at, created_at
    ) VALUES
    ${observationHead(
      "2026-10-06",
      "principal:consumer-2",
      "e4000000-0000-0000-0000-000000000006",
      "ADMITTED",
      "ACKNOWLEDGED",
      "ISSUED_READER_RECEIPT_ACKNOWLEDGED",
      true,
      true,
      "LAGGING",
      1,
      1,
      1,
      2,
      5,
      "ACKED",
      "HOLD_RECEIPT_ACKNOWLEDGEMENT",
      '{"acknowledgementClass":"ACKNOWLEDGED","acknowledgementRecorded":true,"sealedCount":1,"deniedCount":1,"unknownEffectCount":1,"lagPublications":2}',
    )};

    INSERT INTO agent_acrah_session (
      account_id, session_id, profile_id, profile_version, status,
      state_revision, purpose, idempotency_key, budget_nominate_units,
      budget_hold_units, budget_vector_units, budget_notify_units,
      consumed_nominate_units, consumed_hold_units, consumed_vector_units,
      consumed_notify_units, budget_max_wall_time_ms, hold_threshold,
      max_observations_per_session, max_nominated_observations,
      max_readers_per_observation, deadline_at, started_by, principal_id,
      authorization_evidence_id, delegated_scope_hash, authorization_revision,
      resource_scope_hash, created_at, updated_at
    ) VALUES (
      101, '20000000-0000-0000-0000-000000000004',
      '10000000-0000-0000-0000-000000000001', 1, 'OPEN', 0,
      'Reject a reader who is the consumer', 'request-4',
      100, 40, 5, 2,
      0, 0, 0, 0, 60000, 2, 1, 1, 1,
      now() + interval '1 minute',
      'principal:test', 'principal:consumer-2',
      '30000000-0000-0000-0000-000000000001',
      repeat('e', 64), 7, repeat('f', 64), now(), now()
    );

    SELECT nominate_agent_acrah_observation(
      101, '20000000-0000-0000-0000-000000000004', DATE '2026-10-06',
      'principal:consumer-2', '40000000-0000-0000-0000-000000000004', repeat('4', 64)
    );
  `);

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);
        SELECT hold_agent_acrah_acknowledgement(
          101, '20000000-0000-0000-0000-000000000004', DATE '2026-10-06',
          'principal:consumer-2', 'principal:consumer-2',
          'hold:reader-cited-admitted-counts',
          '70000000-0000-0000-0000-000000000096',
          '90000000-0000-0000-0000-000000000096',
          'a0000000-0000-0000-0000-000000000096',
          'c4000000-0000-0000-0000-000000000096',
          repeat('4', 64),
          'principal:hold-a', 'principal:hold-b'
        );
      `),
    "reader equal to the consumer",
    "P0001",
  );
  rejectionChecks += 1;

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);
        INSERT INTO agent_acrah_consumer_hold (
          account_id, utc_day, consumer_principal_id, consumer_hold_id, session_id,
          certificate_id, receipt_acknowledgement_id, reader_principal_id, purpose_code,
          effect_code, provider_code, citation_code, grant_code, receipt_code,
          acknowledgement_code, hold_code, admission_class, acknowledgement_class, hold_class,
          acknowledgement_reason, hold_reason, acknowledgement_recorded, hold_recorded,
          sealed_count, denied_count, unknown_effect_count, lag_publications, max_lag_budget,
          effect_observation, attested_key_kind, fact_disposition, body_visibility, metadata_trust,
          access_path, inlines_fact_body, opens_nested_expiry, ack_promoted_to_trust,
          packet_scan_used, executes_tool, trusted_next_action, hold_steward_a, hold_steward_b,
          acknowledgement_steward_a, acknowledgement_steward_b, hold_body, sealed_at, created_at
        ) VALUES (
          101, DATE '2026-10-06', 'principal:consumer-2',
          'c4000000-0000-0000-0000-000000000097',
          '20000000-0000-0000-0000-000000000004',
          '90000000-0000-0000-0000-000000000001',
          'e4000000-0000-0000-0000-000000000006',
          'principal:reader-1',
          'tool:cite-admitted-counts', 'effect:cited-admitted-counts',
          'provider:receipt-cited-admitted-counts',
          'citation:card-cited-admitted-counts',
          'grant:reader-cited-admitted-counts',
          'receipt:reader-cited-admitted-counts',
          'ack:reader-cited-admitted-counts',
          'hold:reader-cited-admitted-counts',
          'ADMITTED', 'ACKNOWLEDGED', 'HELD',
          'ISSUED_READER_RECEIPT_ACKNOWLEDGED', 'ACKNOWLEDGED_OBSERVATION_HELD',
          true, true,
          9, 1, 1,
          2, 5, 'ACKED', 'AWAITING_CONFIRMATION',
          'DISPUTED_HELD', 'OMITTED', 'UNTRUSTED_METADATA', 'POINT_LOOKUP',
          false, false, false, false, false, 'HOLD_ACKNOWLEDGED_OBSERVATION',
          'principal:hold-a', 'principal:hold-b',
          'principal:ack-a', 'principal:ack-b',
          '{"sealedCount":9,"deniedCount":1,"unknownEffectCount":1}',
          now(), now()
        );
      `),
    "hold counts that differ from the acknowledgement head",
    "P0001",
  );
  rejectionChecks += 1;

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);
        INSERT INTO agent_acrah_consumer_hold (
          account_id, utc_day, consumer_principal_id, consumer_hold_id, session_id,
          certificate_id, receipt_acknowledgement_id, reader_principal_id, purpose_code,
          effect_code, provider_code, citation_code, grant_code, receipt_code,
          acknowledgement_code, hold_code, admission_class, acknowledgement_class, hold_class,
          acknowledgement_reason, hold_reason, acknowledgement_recorded, hold_recorded,
          sealed_count, denied_count, unknown_effect_count, lag_publications, max_lag_budget,
          effect_observation, attested_key_kind, fact_disposition, body_visibility, metadata_trust,
          access_path, inlines_fact_body, opens_nested_expiry, ack_promoted_to_trust,
          packet_scan_used, executes_tool, trusted_next_action, hold_steward_a, hold_steward_b,
          acknowledgement_steward_a, acknowledgement_steward_b, hold_body, sealed_at, created_at
        ) VALUES (
          101, DATE '2026-10-06', 'principal:consumer-2',
          'c4000000-0000-0000-0000-000000000098',
          '20000000-0000-0000-0000-000000000004',
          '90000000-0000-0000-0000-000000000001',
          'e4000000-0000-0000-0000-000000000006',
          'principal:reader-1',
          'tool:cite-admitted-counts', 'effect:cited-admitted-counts',
          'provider:receipt-cited-admitted-counts',
          'citation:card-cited-admitted-counts',
          'grant:reader-cited-admitted-counts',
          'receipt:reader-cited-admitted-counts',
          'ack:reader-cited-admitted-counts',
          'hold:reader-cited-admitted-counts',
          'ADMITTED', 'ACKNOWLEDGED', 'HELD',
          'ISSUED_READER_RECEIPT_ACKNOWLEDGED', 'ACKNOWLEDGED_OBSERVATION_HELD',
          true, true,
          1, 1, 1,
          2, 5, 'ACKED', 'TRUSTED_ENROLLED',
          'DISPUTED_HELD', 'OMITTED', 'UNTRUSTED_METADATA', 'POINT_LOOKUP',
          false, false, true, false, false, 'HOLD_ACKNOWLEDGED_OBSERVATION',
          'principal:hold-a', 'principal:hold-b',
          'principal:ack-a', 'principal:ack-b',
          '{"sealedCount":1,"deniedCount":1,"unknownEffectCount":1}',
          now(), now()
        );
      `),
    "ack promoted to trust",
    "P0001",
  );
  rejectionChecks += 1;

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);
        INSERT INTO agent_acrah_consumer_hold (
          account_id, utc_day, consumer_principal_id, consumer_hold_id, session_id,
          certificate_id, receipt_acknowledgement_id, reader_principal_id, purpose_code,
          effect_code, provider_code, citation_code, grant_code, receipt_code,
          acknowledgement_code, hold_code, admission_class, acknowledgement_class, hold_class,
          acknowledgement_reason, hold_reason, acknowledgement_recorded, hold_recorded,
          sealed_count, denied_count, unknown_effect_count, lag_publications, max_lag_budget,
          effect_observation, attested_key_kind, fact_disposition, body_visibility, metadata_trust,
          access_path, inlines_fact_body, opens_nested_expiry, ack_promoted_to_trust,
          packet_scan_used, executes_tool, trusted_next_action, hold_steward_a, hold_steward_b,
          acknowledgement_steward_a, acknowledgement_steward_b, hold_body, sealed_at, created_at
        ) VALUES (
          101, DATE '2026-10-06', 'principal:consumer-2',
          'c4000000-0000-0000-0000-000000000099',
          '20000000-0000-0000-0000-000000000004',
          '90000000-0000-0000-0000-000000000001',
          'e4000000-0000-0000-0000-000000000006',
          'principal:reader-1',
          'tool:cite-admitted-counts', 'effect:cited-admitted-counts',
          'provider:receipt-cited-admitted-counts',
          'citation:card-cited-admitted-counts',
          'grant:reader-cited-admitted-counts',
          'receipt:reader-cited-admitted-counts',
          'ack:reader-cited-admitted-counts',
          'hold:reader-cited-admitted-counts',
          'ADMITTED', 'ACKNOWLEDGED', 'HELD',
          'ISSUED_READER_RECEIPT_ACKNOWLEDGED', 'ACKNOWLEDGED_OBSERVATION_HELD',
          true, true,
          1, 1, 1,
          2, 5, 'ACKED', 'AWAITING_CONFIRMATION',
          'DISPUTED_HELD', 'OMITTED', 'UNTRUSTED_METADATA', 'POINT_LOOKUP',
          false, false, false, false, true, 'HOLD_ACKNOWLEDGED_OBSERVATION',
          'principal:hold-a', 'principal:hold-b',
          'principal:ack-a', 'principal:ack-b',
          '{"sealedCount":1,"deniedCount":1,"unknownEffectCount":1}',
          now(), now()
        );
      `),
    "tool execution inside the hold",
    "P0001",
  );
  rejectionChecks += 1;

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);
        UPDATE agent_acrah_acknowledgement_head
        SET lag_publications = 0
        WHERE account_id = 101
          AND utc_day = DATE '2026-10-08'
          AND consumer_principal_id = 'principal:consumer-1';
      `),
    "mutation of a sealed acknowledgement head",
    "P0001",
  );
  rejectionChecks += 1;

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);
        UPDATE agent_acrah_consumer_hold
        SET sealed_count = 9
        WHERE account_id = 101
          AND utc_day = DATE '2026-10-08'
          AND consumer_principal_id = 'principal:consumer-1';
      `),
    "mutation of a sealed consumer hold",
    "P0001",
  );
  rejectionChecks += 1;

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);
        INSERT INTO agent_acrah_profile (
          account_id, profile_id, profile_version, name, status,
          definition_hash, canonicalization_version, compiler_version,
          approval_validation_hash, authorization_evidence_id,
          authorization_snapshot_hash, allowed_purpose, allowed_effect_code,
          allowed_provider_code, allowed_citation_code, allowed_grant_code,
          allowed_receipt_code, allowed_acknowledgement_code, allowed_hold_code,
          hold_threshold, max_observations_per_session, max_nominated_observations,
          max_readers_per_observation, semantic_tags, procedure_ref,
          revocation_policy, created_by, created_at, approved_by, approved_at
        ) VALUES (
          101, '10000000-0000-0000-0000-000000000099', 1,
          'Skip the fence', 'APPROVED',
          repeat('b', 64), 'jcs-v1', 'acrah-hold-1',
          repeat('b', 64), '30000000-0000-0000-0000-000000000001',
          repeat('d', 64), 'tool:cite-admitted-counts', 'effect:cited-admitted-counts',
          'provider:receipt-cited-admitted-counts',
          'citation:card-cited-admitted-counts',
          'grant:reader-cited-admitted-counts',
          'receipt:reader-cited-admitted-counts',
          'ack:reader-cited-admitted-counts',
          'hold:reader-cited-admitted-counts',
          2, 1, 1, 1,
          ARRAY['incident'],
          'proc:skip',
          'STOP_BEFORE_HOLD', 'principal:test', now(),
          'principal:approver', now()
        );
      `),
    "profile inserted as approved",
    "P0001",
  );
  rejectionChecks += 1;

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);
        SELECT hold_agent_acrah_acknowledgement(
          101, '20000000-0000-0000-0000-000000000001', DATE '2026-10-08',
          'principal:consumer-1', 'principal:reader-other',
          'hold:reader-cited-admitted-counts',
          '70000000-0000-0000-0000-000000000094',
          '90000000-0000-0000-0000-000000000094',
          'a0000000-0000-0000-0000-000000000094',
          'c4000000-0000-0000-0000-000000000094',
          repeat('6', 64),
          'principal:hold-a', 'principal:hold-b'
        );
      `),
    "second reader for the same observation",
    "P0001",
  );
  rejectionChecks += 1;

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);
        SELECT reject_agent_acrah_unscoped_scan(false, true);
      `),
    "unscoped scan",
    "P0001",
  );
  rejectionChecks += 1;

  if (rejectionChecks < 16) {
    throw new Error(`expected at least 16 rejection checks, ran ${rejectionChecks}`);
  }

  const tenantCount = await database.query(
    "SELECT count(*)::int AS count FROM agent_acrah_session WHERE account_id = 101",
  );
  if (tenantCount.rows[0]?.count !== 4) {
    throw new Error("tenant-scoped fixture was not preserved");
  }

  const policies = await database.query(`
    SELECT count(*)::int AS count
    FROM pg_policies
    WHERE policyname = 'tenant_isolation'
  `);
  if ((policies.rows[0]?.count ?? 0) < tableCount) {
    throw new Error(
      `not every table has a tenant isolation policy: ${policies.rows[0]?.count} < ${tableCount}`,
    );
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
        executableConstraintChecks: rejectionChecks,
        tenantPoliciesChecked: tableCount,
      },
      status: "ok",
    },
    null,
    2,
  ),
);
