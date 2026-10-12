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
  "ACKNOWLEDGED_RECEIPT_PURPOSE_BOUND",
  "RECEIPT_CANNOT_AUTHORIZE_TOOL",
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
  block.includes("CREATE TYPE actp_session_status"),
);
const vectorBlock = sqlBlocks.find((block) =>
  block.includes("CREATE TABLE agent_actp_profile_embedding"),
);
if (!ddlBlock || !vectorBlock) {
  throw new Error("could not locate executable SQL schema blocks");
}
if (
  !/CREATE TABLE agent_actp_profile_embedding \(\n\s+account_id/.test(
    vectorBlock,
  )
) {
  throw new Error("vector schema does not lead with account_id");
}
if (vectorBlock.includes("USING hnsw")) {
  throw new Error("reference schema must not create a cross-tenant HNSW index");
}
if (ddlBlock.includes("context_packet") || ddlBlock.includes("packet_catalog")) {
  throw new Error("tool-purpose schema must not scan or store a context-packet catalog");
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

const database = await PGlite.create({ extensions: { vector } });
let rejectionChecks = 0;
try {
  await database.exec("CREATE EXTENSION IF NOT EXISTS vector;");
  await database.exec(ddlBlock);
  await database.exec(vectorBlock);

  await database.exec(`
    SELECT set_config('app.account_id', '101', true);

    INSERT INTO agent_actp_authorization_evidence (
      account_id, evidence_id, principal_id, policy_revision,
      resource_acl_revision, redacted_scope_summary,
      encrypted_evidence_ref, evidence_hash, immutable_archive_ref, created_at
    ) VALUES (
      101, '30000000-0000-0000-0000-000000000001', 'principal:test', 7, 11,
      '{"scopes":["receipt.tool-purpose.bind"]}', 'kms://evidence/fixture',
      repeat('8', 64), 'worm://evidence/fixture', now()
    );

    INSERT INTO agent_actp_profile (
      account_id, profile_id, profile_version, name, status,
      definition_hash, canonicalization_version, compiler_version,
      approval_validation_hash, authorization_evidence_id,
      authorization_snapshot_hash, allowed_purpose, bind_threshold,
      max_receipts_per_session, max_nominated_receipts, semantic_tags,
      procedure_ref, revocation_policy, created_by, created_at
    ) VALUES (
      101, '10000000-0000-0000-0000-000000000001', 1,
      'Daily admitted count tool purpose bind', 'DRAFT',
      repeat('a', 64), 'jcs-v1', 'actp-bind-1',
      NULL, '30000000-0000-0000-0000-000000000001',
      repeat('d', 64), 'tool:cite-admitted-counts', 2, 1, 1,
      ARRAY['incident', 'tool-purpose-bind'],
      'proc:admitted-count-tool-purpose-bind',
      'STOP_BEFORE_PUBLISH', 'principal:test', now()
    );

    INSERT INTO agent_actp_profile_bind_rule (
      account_id, profile_id, profile_version, rule_id, ordinal,
      allowed_classes, bind_threshold, max_receipts_per_session,
      max_nominated_receipts, require_dual_control_bind, bind_instruction
    ) VALUES (
      101, '10000000-0000-0000-0000-000000000001', 1, 'bind-receipt', 1,
      ARRAY['ADMITTED', 'DENIED', 'UNKNOWN_EFFECT']::actp_admission_class[],
      2, 1, 1, true,
      '{"bind_one_receipt":true,"authorize_only_when_acknowledged":true,"one_purpose":true,"ack_never_trust":true,"point_lookup_only":true,"no_nested_expiry":true,"packet_never_scanned":true,"recorded_receipt_only":true,"executes_tool":false}'
    );

    SELECT approve_agent_actp_profile(
      101,
      '10000000-0000-0000-0000-000000000001',
      1,
      repeat('a', 64),
      'principal:approver'
    );

    INSERT INTO agent_actp_recorded_receipt_head (
      account_id, utc_day, consumer_principal_id, receipt_id, card_id, publication_id,
      admission_class, receipt_class, receipt_reason, freshness_class, counts_acknowledged,
      sealed_count, denied_count, unknown_effect_count,
      lag_publications, max_lag_budget, effect_observation, attested_key_kind,
      fact_disposition, body_visibility, metadata_trust, access_path,
      inlines_fact_body, opens_nested_expiry, ack_promoted_to_trust, packet_scan_used,
      receipt_steward_a, receipt_steward_b,
      card_steward_a, card_steward_b,
      admission_steward_a, admission_steward_b,
      attestation_steward_a, attestation_steward_b,
      synopsis_steward_a, synopsis_steward_b,
      publication_steward_a, publication_steward_b,
      receipt_body, sealed_at, created_at
    ) VALUES
    (
      101, DATE '2026-10-08', 'principal:reader-1',
      'b0000000-0000-0000-0000-000000000001',
      'b1000000-0000-0000-0000-000000000001',
      'd0000000-0000-0000-0000-000000000001',
      'ADMITTED', 'ACKNOWLEDGED', 'ADMITTED_COUNT_READ_RECORDED', 'LAGGING', true,
      1, 1, 1,
      3, 5, 'ACKED', 'AWAITING_CONFIRMATION',
      'DISPUTED_HELD', 'OMITTED', 'UNTRUSTED_METADATA', 'POINT_LOOKUP',
      false, false, false, false,
      'principal:rcpt-a', 'principal:rcpt-b',
      'principal:card-a', 'principal:card-b',
      'principal:adm-a', 'principal:adm-b',
      'principal:att-a', 'principal:att-b',
      'principal:syn-a', 'principal:syn-b',
      'principal:pub-a', 'principal:pub-b',
      '{"receiptClass":"ACKNOWLEDGED","countsAcknowledged":true,"sealedCount":1,"deniedCount":1,"unknownEffectCount":1,"lagPublications":3,"attestedKeyKind":"AWAITING_CONFIRMATION","ackPromotedToTrust":false}',
      now(), now()
    ),
    (
      101, DATE '2026-10-07', 'principal:reader-1',
      'b0000000-0000-0000-0000-000000000002',
      'b1000000-0000-0000-0000-000000000002',
      'd0000000-0000-0000-0000-000000000002',
      'DENIED', 'NOT_ACKNOWLEDGED', 'COUNTS_NOT_ACKNOWLEDGED', 'LAGGING', false,
      NULL, NULL, NULL,
      8, 5, 'ACKED', 'AWAITING_CONFIRMATION',
      'DISPUTED_HELD', 'OMITTED', 'UNTRUSTED_METADATA', 'POINT_LOOKUP',
      false, false, false, false,
      'principal:rcpt-a', 'principal:rcpt-b',
      'principal:card-a', 'principal:card-b',
      'principal:adm-a', 'principal:adm-b',
      'principal:att-a', 'principal:att-b',
      'principal:syn-a', 'principal:syn-b',
      'principal:pub-a', 'principal:pub-b',
      '{"receiptClass":"NOT_ACKNOWLEDGED","countsAcknowledged":false,"lagPublications":8,"attestedKeyKind":"AWAITING_CONFIRMATION","ackPromotedToTrust":false}',
      now(), now()
    ),
    (
      101, DATE '2026-10-05', 'principal:reader-1',
      'b0000000-0000-0000-0000-000000000003',
      'b1000000-0000-0000-0000-000000000003',
      'd0000000-0000-0000-0000-000000000003',
      'UNKNOWN_EFFECT', 'NOT_ACKNOWLEDGED', 'COUNTS_NOT_ACKNOWLEDGED', 'UNKNOWN_EFFECT', false,
      NULL, NULL, NULL,
      NULL, 5, 'UNKNOWN_EFFECT', 'AWAITING_CONFIRMATION',
      'DISPUTED_HELD', 'OMITTED', 'UNTRUSTED_METADATA', 'POINT_LOOKUP',
      false, false, false, false,
      'principal:rcpt-a', 'principal:rcpt-b',
      'principal:card-a', 'principal:card-b',
      'principal:adm-a', 'principal:adm-b',
      'principal:att-a', 'principal:att-b',
      'principal:syn-a', 'principal:syn-b',
      'principal:pub-a', 'principal:pub-b',
      '{"receiptClass":"NOT_ACKNOWLEDGED","countsAcknowledged":false,"attestedKeyKind":"AWAITING_CONFIRMATION","ackPromotedToTrust":false}',
      now(), now()
    );

    INSERT INTO agent_actp_session (
      account_id, session_id, profile_id, profile_version, status,
      state_revision, purpose, idempotency_key, budget_nominate_units,
      budget_bind_units, budget_receipt_units, budget_vector_units,
      budget_notify_units, consumed_nominate_units, consumed_bind_units,
      consumed_receipt_units, consumed_vector_units, consumed_notify_units,
      budget_max_wall_time_ms, bind_threshold, max_receipts_per_session,
      max_nominated_receipts, deadline_at, started_by, principal_id,
      authorization_evidence_id, delegated_scope_hash, authorization_revision,
      resource_scope_hash, created_at, updated_at
    ) VALUES
    (
      101, '20000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001', 1, 'OPEN', 0,
      'Bind one acknowledged receipt to one tool purpose', 'request-1',
      100, 40, 8, 5, 2,
      0, 0, 0, 0, 0, 60000, 2, 1, 1,
      now() + interval '1 minute',
      'principal:test', 'principal:reader-1',
      '30000000-0000-0000-0000-000000000001',
      repeat('e', 64), 7, repeat('f', 64), now(), now()
    ),
    (
      101, '20000000-0000-0000-0000-000000000002',
      '10000000-0000-0000-0000-000000000001', 1, 'OPEN', 0,
      'Refuse a tool purpose for one denied receipt', 'request-2',
      100, 40, 8, 5, 2,
      0, 0, 0, 0, 0, 60000, 2, 1, 1,
      now() + interval '1 minute',
      'principal:test', 'principal:reader-1',
      '30000000-0000-0000-0000-000000000001',
      repeat('e', 64), 7, repeat('f', 64), now(), now()
    ),
    (
      101, '20000000-0000-0000-0000-000000000003',
      '10000000-0000-0000-0000-000000000001', 1, 'OPEN', 0,
      'Refuse a tool purpose for one silent receipt', 'request-3',
      100, 40, 8, 5, 2,
      0, 0, 0, 0, 0, 60000, 2, 1, 1,
      now() + interval '1 minute',
      'principal:test', 'principal:reader-1',
      '30000000-0000-0000-0000-000000000001',
      repeat('e', 64), 7, repeat('f', 64), now(), now()
    );

    SELECT nominate_agent_actp_receipt(
      101,
      '20000000-0000-0000-0000-000000000001',
      DATE '2026-10-08',
      'principal:reader-1',
      '40000000-0000-0000-0000-000000000001',
      repeat('1', 64)
    );
    SELECT nominate_agent_actp_receipt(
      101,
      '20000000-0000-0000-0000-000000000002',
      DATE '2026-10-07',
      'principal:reader-1',
      '40000000-0000-0000-0000-000000000002',
      repeat('2', 64)
    );
    SELECT nominate_agent_actp_receipt(
      101,
      '20000000-0000-0000-0000-000000000003',
      DATE '2026-10-05',
      'principal:reader-1',
      '40000000-0000-0000-0000-000000000003',
      repeat('3', 64)
    );

    SELECT bind_agent_actp_tool_purpose(
      101,
      '20000000-0000-0000-0000-000000000001',
      DATE '2026-10-08',
      'principal:reader-1',
      'tool:cite-admitted-counts',
      '70000000-0000-0000-0000-000000000001',
      '90000000-0000-0000-0000-000000000001',
      'a0000000-0000-0000-0000-000000000001',
      'c2000000-0000-0000-0000-000000000001',
      repeat('6', 64),
      'principal:bind-a',
      'principal:bind-b'
    );
    SELECT bind_agent_actp_tool_purpose(
      101,
      '20000000-0000-0000-0000-000000000002',
      DATE '2026-10-07',
      'principal:reader-1',
      'tool:cite-admitted-counts',
      '70000000-0000-0000-0000-000000000002',
      '90000000-0000-0000-0000-000000000002',
      'a0000000-0000-0000-0000-000000000002',
      'c2000000-0000-0000-0000-000000000002',
      repeat('7', 64),
      'principal:bind-a',
      'principal:bind-b'
    );
    SELECT bind_agent_actp_tool_purpose(
      101,
      '20000000-0000-0000-0000-000000000003',
      DATE '2026-10-05',
      'principal:reader-1',
      'tool:cite-admitted-counts',
      '70000000-0000-0000-0000-000000000003',
      '90000000-0000-0000-0000-000000000003',
      'a0000000-0000-0000-0000-000000000003',
      'c2000000-0000-0000-0000-000000000003',
      repeat('9', 64),
      'principal:bind-a',
      'principal:bind-b'
    );
  `);

  const nominations = await database.query(
    "SELECT count(*)::int AS count FROM agent_actp_receipt_nomination WHERE account_id = 101 AND access_path = 'POINT_LOOKUP'",
  );
  if (nominations.rows[0]?.count !== 3) {
    throw new Error("point-lookup receipt nomination was not compiled");
  }

  const admitted = await database.query(`
    SELECT admission_class, receipt_class, bind_class, bind_reason, purpose_code,
           tool_authorized, executes_tool, sealed_count, denied_count,
           unknown_effect_count, lag_publications, attested_key_kind,
           effect_observation, ack_promoted_to_trust, inlines_fact_body,
           opens_nested_expiry, packet_scan_used, trusted_next_action, bind_body
    FROM agent_actp_tool_purpose_bind
    WHERE account_id = 101
      AND utc_day = DATE '2026-10-08'
      AND consumer_principal_id = 'principal:reader-1'
  `);
  const bind = admitted.rows[0];
  const body = bind?.bind_body ?? {};
  if (
    bind?.admission_class !== "ADMITTED" ||
    bind?.receipt_class !== "ACKNOWLEDGED" ||
    bind?.bind_class !== "AUTHORIZED" ||
    bind?.bind_reason !== "ACKNOWLEDGED_RECEIPT_PURPOSE_BOUND" ||
    bind?.purpose_code !== "tool:cite-admitted-counts" ||
    bind?.tool_authorized !== true ||
    bind?.executes_tool !== false ||
    Number(bind?.sealed_count) !== 1 ||
    Number(bind?.denied_count) !== 1 ||
    Number(bind?.unknown_effect_count) !== 1 ||
    Number(bind?.lag_publications) !== 3 ||
    bind?.attested_key_kind !== "AWAITING_CONFIRMATION" ||
    bind?.effect_observation !== "ACKED" ||
    bind?.ack_promoted_to_trust !== false ||
    bind?.inlines_fact_body !== false ||
    bind?.opens_nested_expiry !== false ||
    bind?.packet_scan_used !== false ||
    bind?.trusted_next_action !== "INVOKE_BOUND_PURPOSE" ||
    body.factBody !== undefined ||
    body.executesTool !== false ||
    body.ackPromotedToTrust !== false ||
    body.attestedKeyKind !== "AWAITING_CONFIRMATION" ||
    body.purposeCode !== "tool:cite-admitted-counts" ||
    Number(body.sealedCount) !== 1 ||
    Number(body.deniedCount) !== 1 ||
    Number(body.unknownEffectCount) !== 1
  ) {
    throw new Error(`authorized tool purpose bind mismatch: ${JSON.stringify(bind)}`);
  }

  const denied = await database.query(`
    SELECT admission_class, receipt_class, bind_class, bind_reason, tool_authorized,
           sealed_count, denied_count, unknown_effect_count, lag_publications,
           effect_observation, trusted_next_action, bind_body
    FROM agent_actp_tool_purpose_bind
    WHERE account_id = 101 AND utc_day = DATE '2026-10-07'
      AND consumer_principal_id = 'principal:reader-1'
  `);
  const deniedBind = denied.rows[0];
  const deniedBody = deniedBind?.bind_body ?? {};
  if (
    deniedBind?.admission_class !== "DENIED" ||
    deniedBind?.receipt_class !== "NOT_ACKNOWLEDGED" ||
    deniedBind?.bind_class !== "NOT_AUTHORIZED" ||
    deniedBind?.bind_reason !== "RECEIPT_CANNOT_AUTHORIZE_TOOL" ||
    deniedBind?.tool_authorized !== false ||
    deniedBind?.sealed_count !== null ||
    deniedBind?.denied_count !== null ||
    deniedBind?.unknown_effect_count !== null ||
    Number(deniedBind?.lag_publications) !== 8 ||
    deniedBind?.effect_observation !== "ACKED" ||
    deniedBind?.trusted_next_action !== "STOP_TOOL_PURPOSE" ||
    deniedBody.sealedCount !== undefined ||
    deniedBody.deniedCount !== undefined ||
    deniedBody.unknownEffectCount !== undefined
  ) {
    throw new Error(`denied tool purpose bind mismatch: ${JSON.stringify(deniedBind)}`);
  }

  const silent = await database.query(`
    SELECT admission_class, receipt_class, bind_class, tool_authorized, sealed_count,
           lag_publications, trusted_next_action, effect_observation
    FROM agent_actp_tool_purpose_bind
    WHERE account_id = 101 AND utc_day = DATE '2026-10-05'
      AND consumer_principal_id = 'principal:reader-1'
  `);
  const silentBind = silent.rows[0];
  if (
    silentBind?.admission_class !== "UNKNOWN_EFFECT" ||
    silentBind?.receipt_class !== "NOT_ACKNOWLEDGED" ||
    silentBind?.bind_class !== "NOT_AUTHORIZED" ||
    silentBind?.tool_authorized !== false ||
    silentBind?.sealed_count !== null ||
    silentBind?.lag_publications !== null ||
    silentBind?.trusted_next_action !== "OMIT_TOOL_PURPOSE" ||
    silentBind?.effect_observation !== "UNKNOWN_EFFECT"
  ) {
    throw new Error(`silent tool purpose bind mismatch: ${JSON.stringify(silentBind)}`);
  }

  const head = await database.query(`
    SELECT lag_publications, sealed_count, denied_count, unknown_effect_count,
           receipt_class, counts_acknowledged
    FROM agent_actp_recorded_receipt_head
    WHERE account_id = 101
      AND utc_day = DATE '2026-10-08'
      AND consumer_principal_id = 'principal:reader-1'
  `);
  const admittedHead = head.rows[0];
  if (
    Number(admittedHead?.lag_publications) !== 3 ||
    Number(admittedHead?.sealed_count) !== 1 ||
    Number(admittedHead?.denied_count) !== 1 ||
    Number(admittedHead?.unknown_effect_count) !== 1 ||
    admittedHead?.receipt_class !== "ACKNOWLEDGED" ||
    admittedHead?.counts_acknowledged !== true
  ) {
    throw new Error(`recorded receipt head was rewritten: ${JSON.stringify(admittedHead)}`);
  }

  const leaked = await database.query(`
    SELECT count(*)::int AS count
    FROM agent_actp_tool_purpose_bind
    WHERE account_id = 101
      AND receipt_class <> 'ACKNOWLEDGED'
      AND (tool_authorized OR sealed_count IS NOT NULL
           OR denied_count IS NOT NULL OR unknown_effect_count IS NOT NULL
           OR bind_body ? 'sealedCount' OR bind_body ? 'factBody')
  `);
  if (leaked.rows[0]?.count !== 0) {
    throw new Error("a not-acknowledged bind carried a tool grant or a fact body");
  }

  const perception = await database.query(`
    SELECT tool_authorized, purpose_code, sealed_count, attested_key_kind, ack_promoted_to_trust
    FROM agent_actp_bind_perception
    WHERE account_id = 101
      AND utc_day = DATE '2026-10-08'
      AND consumer_principal_id = 'principal:reader-1'
  `);
  const perceptionRow = perception.rows[0];
  if (
    perceptionRow?.tool_authorized !== true ||
    perceptionRow?.purpose_code !== "tool:cite-admitted-counts" ||
    Number(perceptionRow?.sealed_count) !== 1 ||
    perceptionRow?.attested_key_kind !== "AWAITING_CONFIRMATION" ||
    perceptionRow?.ack_promoted_to_trust !== false
  ) {
    throw new Error(`authorized perception mismatch: ${JSON.stringify(perceptionRow)}`);
  }

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);
        SELECT nominate_agent_actp_receipt(
          101,
          '20000000-0000-0000-0000-000000000001',
          NULL,
          'principal:reader-1',
          '40000000-0000-0000-0000-000000000099',
          repeat('1', 64)
        );
      `),
    "null receipt nomination",
    "P0001",
  );
  rejectionChecks += 1;

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);
        SELECT nominate_agent_actp_receipt(
          101,
          '20000000-0000-0000-0000-000000000001',
          DATE '2026-10-04',
          'principal:reader-1',
          '40000000-0000-0000-0000-000000000098',
          repeat('1', 64)
        );
      `),
    "second receipt nomination",
    "P0001",
  );
  rejectionChecks += 1;

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);
        INSERT INTO agent_actp_effect_intent (
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
  rejectionChecks += 1;

  await database.exec(`
    SELECT set_config('app.account_id', '101', true);
    INSERT INTO agent_actp_effect_intent (
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
        UPDATE agent_actp_effect_intent
        SET canonical_request_hash = repeat('7', 64)
        WHERE account_id = 101
          AND effect_id = '60000000-0000-0000-0000-000000000002';
      `),
    "mutation of a prepared effect identity",
    "P0001",
  );
  rejectionChecks += 1;

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);
        UPDATE agent_actp_profile
        SET definition_hash = repeat('9', 64)
        WHERE account_id = 101
          AND profile_id = '10000000-0000-0000-0000-000000000001'
          AND profile_version = 1;
      `),
    "mutation of sealed profile definition",
    "P0001",
  );
  rejectionChecks += 1;

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);
        INSERT INTO agent_actp_purpose_decision (
          account_id, decision_id, certificate_id, session_id, utc_day,
          consumer_principal_id, purpose_code, compile_kind, admission_class,
          receipt_class, bind_class, freshness_class, effect_observation,
          attested_key_kind, fact_disposition, body_visibility, access_path,
          metadata_trust, opens_nested_expiry, inlines_fact_body,
          ack_promoted_to_trust, packet_scan_used, tool_authorized, executes_tool,
          lag_publications, max_lag_budget, bind_hash, sealed_at, created_at
        ) VALUES (
          101, 'a0000000-0000-0000-0000-000000000091',
          '90000000-0000-0000-0000-000000000001',
          '20000000-0000-0000-0000-000000000001',
          DATE '2026-10-08', 'principal:reader-1', 'tool:cite-admitted-counts',
          'BIND_RECEIPT_TOOL_PURPOSE', 'ADMITTED', 'ACKNOWLEDGED', 'AUTHORIZED',
          'LAGGING', 'ACKED', 'TRUSTED_ENROLLED', 'DISPUTED_HELD', 'OMITTED',
          'POINT_LOOKUP', 'UNTRUSTED_METADATA', false, false, true, false, true,
          false, 3, 5, repeat('6', 64), now(), now()
        );
      `),
    "ack-as-trust fence",
    "P0001",
  );
  rejectionChecks += 1;

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);
        INSERT INTO agent_actp_recorded_receipt_head (
          account_id, utc_day, consumer_principal_id, receipt_id, card_id, publication_id,
          admission_class, receipt_class, receipt_reason, freshness_class, counts_acknowledged,
          sealed_count, denied_count, unknown_effect_count,
          lag_publications, max_lag_budget, effect_observation, attested_key_kind,
          fact_disposition, body_visibility, metadata_trust, access_path,
          inlines_fact_body, opens_nested_expiry, ack_promoted_to_trust, packet_scan_used,
          receipt_steward_a, receipt_steward_b,
          card_steward_a, card_steward_b,
          admission_steward_a, admission_steward_b,
          attestation_steward_a, attestation_steward_b,
          synopsis_steward_a, synopsis_steward_b,
          publication_steward_a, publication_steward_b,
          receipt_body, sealed_at, created_at
        ) VALUES (
          101, DATE '2026-10-04', 'principal:reader-1',
          'b0000000-0000-0000-0000-000000000004',
          'b1000000-0000-0000-0000-000000000004',
          'd0000000-0000-0000-0000-000000000004',
          'ADMITTED', 'ACKNOWLEDGED', 'ADMITTED_COUNT_READ_RECORDED', 'LAGGING', true,
          1, 0, 0,
          4, 5, 'ACKED', 'AWAITING_CONFIRMATION',
          'DISPUTED_HELD', 'OMITTED', 'UNTRUSTED_METADATA', 'POINT_LOOKUP',
          false, false, false, false,
          'principal:rcpt-a', 'principal:rcpt-b',
          'principal:card-a', 'principal:card-b',
          'principal:adm-a', 'principal:adm-b',
          'principal:att-a', 'principal:att-b',
          'principal:syn-a', 'principal:syn-b',
          'principal:pub-a', 'principal:pub-b',
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
        INSERT INTO agent_actp_purpose_decision (
          account_id, decision_id, certificate_id, session_id, utc_day,
          consumer_principal_id, purpose_code, compile_kind, admission_class,
          receipt_class, bind_class, freshness_class, effect_observation,
          attested_key_kind, fact_disposition, body_visibility, access_path,
          metadata_trust, opens_nested_expiry, inlines_fact_body,
          ack_promoted_to_trust, packet_scan_used, tool_authorized, executes_tool,
          lag_publications, max_lag_budget, bind_hash, sealed_at, created_at
        ) VALUES (
          101, 'a0000000-0000-0000-0000-000000000092',
          '90000000-0000-0000-0000-000000000001',
          '20000000-0000-0000-0000-000000000001',
          DATE '2026-10-08', 'principal:reader-1', 'tool:cite-admitted-counts',
          'BIND_RECEIPT_TOOL_PURPOSE', 'ADMITTED', 'ACKNOWLEDGED', 'AUTHORIZED',
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
        INSERT INTO agent_actp_purpose_decision (
          account_id, decision_id, certificate_id, session_id, utc_day,
          consumer_principal_id, purpose_code, compile_kind, admission_class,
          receipt_class, bind_class, freshness_class, effect_observation,
          attested_key_kind, fact_disposition, body_visibility, access_path,
          metadata_trust, opens_nested_expiry, inlines_fact_body,
          ack_promoted_to_trust, packet_scan_used, tool_authorized, executes_tool,
          lag_publications, max_lag_budget, bind_hash, sealed_at, created_at
        ) VALUES (
          101, 'a0000000-0000-0000-0000-000000000093',
          '90000000-0000-0000-0000-000000000001',
          '20000000-0000-0000-0000-000000000001',
          DATE '2026-10-08', 'principal:reader-1', 'tool:cite-admitted-counts',
          'BIND_RECEIPT_TOOL_PURPOSE', 'ADMITTED', 'ACKNOWLEDGED', 'AUTHORIZED',
          'LAGGING', 'ACKED', 'AWAITING_CONFIRMATION', 'DISPUTED_HELD', 'OMITTED',
          'PACKET_SCAN', 'UNTRUSTED_METADATA', false, false, false, true, true,
          false, 3, 5, repeat('6', 64), now(), now()
        );
      `),
    "context-packet scan fence",
    "P0001",
  );
  rejectionChecks += 1;

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);
        INSERT INTO agent_actp_purpose_certificate (
          account_id, certificate_id, session_id, compile_id, consumer_principal_id,
          utc_day, purpose_code, purpose_hash, admission_class, bind_class,
          tool_authorized, bind_steward_a, bind_steward_b,
          receipt_steward_a, receipt_steward_b,
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
          'principal:reader-1',
          DATE '2026-10-08', 'tool:cite-admitted-counts', repeat('a', 64),
          'ADMITTED', 'AUTHORIZED', true,
          'principal:rcpt-a', 'principal:bind-b',
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

  await database.exec(`
    SELECT set_config('app.account_id', '101', true);
    INSERT INTO agent_actp_recorded_receipt_head (
      account_id, utc_day, consumer_principal_id, receipt_id, card_id, publication_id,
      admission_class, receipt_class, receipt_reason, freshness_class, counts_acknowledged,
      sealed_count, denied_count, unknown_effect_count,
      lag_publications, max_lag_budget, effect_observation, attested_key_kind,
      fact_disposition, body_visibility, metadata_trust, access_path,
      inlines_fact_body, opens_nested_expiry, ack_promoted_to_trust, packet_scan_used,
      receipt_steward_a, receipt_steward_b,
      card_steward_a, card_steward_b,
      admission_steward_a, admission_steward_b,
      attestation_steward_a, attestation_steward_b,
      synopsis_steward_a, synopsis_steward_b,
      publication_steward_a, publication_steward_b,
      receipt_body, sealed_at, created_at
    ) VALUES (
      101, DATE '2026-10-07', 'principal:reader-2',
      'b0000000-0000-0000-0000-000000000005',
      'b1000000-0000-0000-0000-000000000005',
      'd0000000-0000-0000-0000-000000000005',
      'DENIED', 'NOT_ACKNOWLEDGED', 'COUNTS_NOT_ACKNOWLEDGED', 'LAGGING', false,
      NULL, NULL, NULL,
      8, 5, 'ACKED', 'AWAITING_CONFIRMATION',
      'DISPUTED_HELD', 'OMITTED', 'UNTRUSTED_METADATA', 'POINT_LOOKUP',
      false, false, false, false,
      'principal:rcpt-a', 'principal:rcpt-b',
      'principal:card-a', 'principal:card-b',
      'principal:adm-a', 'principal:adm-b',
      'principal:att-a', 'principal:att-b',
      'principal:syn-a', 'principal:syn-b',
      'principal:pub-a', 'principal:pub-b',
      '{"receiptClass":"NOT_ACKNOWLEDGED","countsAcknowledged":false,"lagPublications":8}',
      now(), now()
    );
  `);

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);
        INSERT INTO agent_actp_tool_purpose_bind (
          account_id, utc_day, consumer_principal_id, bind_id, session_id,
          certificate_id, receipt_id, purpose_code, admission_class, receipt_class,
          bind_class, bind_reason, tool_authorized, sealed_count, denied_count,
          unknown_effect_count, lag_publications, max_lag_budget, effect_observation,
          attested_key_kind, fact_disposition, body_visibility, metadata_trust,
          access_path, inlines_fact_body, opens_nested_expiry, ack_promoted_to_trust,
          packet_scan_used, executes_tool, trusted_next_action, bind_body, sealed_at, created_at
        ) VALUES (
          101, DATE '2026-10-07', 'principal:reader-2',
          'c2000000-0000-0000-0000-000000000091',
          '20000000-0000-0000-0000-000000000002',
          '90000000-0000-0000-0000-000000000002',
          'b0000000-0000-0000-0000-000000000005',
          'tool:cite-admitted-counts',
          'DENIED', 'NOT_ACKNOWLEDGED', 'AUTHORIZED',
          'ACKNOWLEDGED_RECEIPT_PURPOSE_BOUND', true,
          4, 2, 1,
          8, 5, 'ACKED', 'AWAITING_CONFIRMATION',
          'DISPUTED_HELD', 'OMITTED', 'UNTRUSTED_METADATA', 'POINT_LOOKUP',
          false, false, false, false, false, 'INVOKE_BOUND_PURPOSE',
          '{"sealedCount":4,"deniedCount":2,"unknownEffectCount":1,"purposeCode":"tool:cite-admitted-counts"}',
          now(), now()
        );
      `),
    "grant on a not-acknowledged receipt",
    "P0001",
  );
  rejectionChecks += 1;

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);
        UPDATE agent_actp_recorded_receipt_head
        SET lag_publications = 0
        WHERE account_id = 101
          AND utc_day = DATE '2026-10-08'
          AND consumer_principal_id = 'principal:reader-1';
      `),
    "mutation of a sealed recorded receipt head",
    "P0001",
  );
  rejectionChecks += 1;

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);
        UPDATE agent_actp_tool_purpose_bind
        SET sealed_count = 9
        WHERE account_id = 101
          AND utc_day = DATE '2026-10-08'
          AND consumer_principal_id = 'principal:reader-1';
      `),
    "mutation of a sealed tool purpose bind",
    "P0001",
  );
  rejectionChecks += 1;

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);
        INSERT INTO agent_actp_profile (
          account_id, profile_id, profile_version, name, status,
          definition_hash, canonicalization_version, compiler_version,
          approval_validation_hash, authorization_evidence_id,
          authorization_snapshot_hash, allowed_purpose, bind_threshold,
          max_receipts_per_session, max_nominated_receipts, semantic_tags,
          procedure_ref, revocation_policy, created_by, created_at,
          approved_by, approved_at
        ) VALUES (
          101, '10000000-0000-0000-0000-000000000099', 1,
          'Skip the fence', 'APPROVED',
          repeat('b', 64), 'jcs-v1', 'actp-bind-1',
          repeat('b', 64), '30000000-0000-0000-0000-000000000001',
          repeat('d', 64), 'tool:cite-admitted-counts', 2, 1, 1,
          ARRAY['incident'],
          'proc:skip',
          'STOP_BEFORE_PUBLISH', 'principal:test', now(),
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
        SELECT bind_agent_actp_tool_purpose(
          101,
          '20000000-0000-0000-0000-000000000001',
          DATE '2026-10-08',
          'principal:reader-1',
          'tool:cite-admitted-counts',
          '70000000-0000-0000-0000-000000000091',
          '90000000-0000-0000-0000-000000000091',
          'a0000000-0000-0000-0000-000000000091',
          'c2000000-0000-0000-0000-000000000091',
          repeat('6', 64),
          'principal:bind-a',
          'principal:bind-b'
        );
      `),
    "duplicate tool purpose bind",
    "P0001",
  );
  rejectionChecks += 1;

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);
        SELECT reject_agent_actp_unscoped_scan(false, true);
      `),
    "unscoped scan",
    "P0001",
  );
  rejectionChecks += 1;

  if (rejectionChecks < 15) {
    throw new Error(`expected at least 15 rejection checks, ran ${rejectionChecks}`);
  }

  const tenantCount = await database.query(
    "SELECT count(*)::int AS count FROM agent_actp_session WHERE account_id = 101",
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
