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
  "AUTHORIZED_PURPOSE_EFFECT_RECORDED",
  "UNAUTHORIZED_BIND_CANNOT_SUCCEED",
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
  block.includes("CREATE TYPE acte_session_status"),
);
const vectorBlock = sqlBlocks.find((block) =>
  block.includes("CREATE TABLE agent_acte_profile_embedding"),
);
if (!ddlBlock || !vectorBlock) {
  throw new Error("could not locate executable SQL schema blocks");
}
if (
  !/CREATE TABLE agent_acte_profile_embedding \(\n\s+account_id/.test(
    vectorBlock,
  )
) {
  throw new Error("vector schema does not lead with account_id");
}
if (vectorBlock.includes("USING hnsw")) {
  throw new Error("reference schema must not create a cross-tenant HNSW index");
}
if (ddlBlock.includes("context_packet") || ddlBlock.includes("packet_catalog")) {
  throw new Error("tool-effect schema must not scan or store a context-packet catalog");
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

    INSERT INTO agent_acte_authorization_evidence (
      account_id, evidence_id, principal_id, policy_revision,
      resource_acl_revision, redacted_scope_summary,
      encrypted_evidence_ref, evidence_hash, immutable_archive_ref, created_at
    ) VALUES (
      101, '30000000-0000-0000-0000-000000000001', 'principal:test', 7, 11,
      '{"scopes":["bind.tool-effect.record"]}', 'kms://evidence/fixture',
      repeat('8', 64), 'worm://evidence/fixture', now()
    );

    INSERT INTO agent_acte_profile (
      account_id, profile_id, profile_version, name, status,
      definition_hash, canonicalization_version, compiler_version,
      approval_validation_hash, authorization_evidence_id,
      authorization_snapshot_hash, allowed_purpose, allowed_effect_code,
      effect_threshold, max_binds_per_session, max_nominated_binds, semantic_tags,
      procedure_ref, revocation_policy, created_by, created_at
    ) VALUES (
      101, '10000000-0000-0000-0000-000000000001', 1,
      'Daily admitted count tool effect outcome', 'DRAFT',
      repeat('a', 64), 'jcs-v1', 'acte-record-1',
      NULL, '30000000-0000-0000-0000-000000000001',
      repeat('d', 64), 'tool:cite-admitted-counts', 'effect:cited-admitted-counts',
      2, 1, 1,
      ARRAY['incident', 'tool-effect-outcome'],
      'proc:admitted-count-tool-effect-outcome',
      'STOP_BEFORE_PUBLISH', 'principal:test', now()
    );

    INSERT INTO agent_acte_profile_effect_rule (
      account_id, profile_id, profile_version, rule_id, ordinal,
      allowed_classes, effect_threshold, max_binds_per_session,
      max_nominated_binds, require_dual_control_effect, effect_instruction
    ) VALUES (
      101, '10000000-0000-0000-0000-000000000001', 1, 'record-effect', 1,
      ARRAY['ADMITTED', 'DENIED', 'UNKNOWN_EFFECT']::acte_admission_class[],
      2, 1, 1, true,
      '{"record_one_bind":true,"record_only_when_authorized":true,"one_effect":true,"ack_never_trust":true,"point_lookup_only":true,"no_nested_expiry":true,"packet_never_scanned":true,"recorded_bind_only":true,"executes_tool":false}'
    );

    SELECT approve_agent_acte_profile(
      101,
      '10000000-0000-0000-0000-000000000001',
      1,
      repeat('a', 64),
      'principal:approver'
    );

    INSERT INTO agent_acte_recorded_bind_head (
      account_id, utc_day, consumer_principal_id, bind_id, receipt_id, purpose_code,
      admission_class, receipt_class, bind_class, bind_reason, tool_authorized,
      freshness_class, sealed_count, denied_count, unknown_effect_count,
      lag_publications, max_lag_budget, effect_observation, attested_key_kind,
      fact_disposition, body_visibility, metadata_trust, access_path,
      inlines_fact_body, opens_nested_expiry, ack_promoted_to_trust, packet_scan_used,
      executes_tool, trusted_next_action,
      bind_steward_a, bind_steward_b,
      receipt_steward_a, receipt_steward_b,
      card_steward_a, card_steward_b,
      admission_steward_a, admission_steward_b,
      attestation_steward_a, attestation_steward_b,
      synopsis_steward_a, synopsis_steward_b,
      publication_steward_a, publication_steward_b,
      bind_body, sealed_at, created_at
    ) VALUES
    (
      101, DATE '2026-10-08', 'principal:reader-1',
      'c2000000-0000-0000-0000-000000000001',
      'b0000000-0000-0000-0000-000000000001',
      'tool:cite-admitted-counts',
      'ADMITTED', 'ACKNOWLEDGED', 'AUTHORIZED', 'ACKNOWLEDGED_RECEIPT_PURPOSE_BOUND', true,
      'LAGGING', 1, 1, 1,
      3, 5, 'ACKED', 'AWAITING_CONFIRMATION',
      'DISPUTED_HELD', 'OMITTED', 'UNTRUSTED_METADATA', 'POINT_LOOKUP',
      false, false, false, false, false, 'INVOKE_BOUND_PURPOSE',
      'principal:bind-a', 'principal:bind-b',
      'principal:rcpt-a', 'principal:rcpt-b',
      'principal:card-a', 'principal:card-b',
      'principal:adm-a', 'principal:adm-b',
      'principal:att-a', 'principal:att-b',
      'principal:syn-a', 'principal:syn-b',
      'principal:pub-a', 'principal:pub-b',
      '{"bindClass":"AUTHORIZED","toolAuthorized":true,"sealedCount":1,"deniedCount":1,"unknownEffectCount":1,"lagPublications":3,"attestedKeyKind":"AWAITING_CONFIRMATION","ackPromotedToTrust":false}',
      now(), now()
    ),
    (
      101, DATE '2026-10-07', 'principal:reader-1',
      'c2000000-0000-0000-0000-000000000002',
      'b0000000-0000-0000-0000-000000000002',
      'tool:cite-admitted-counts',
      'DENIED', 'NOT_ACKNOWLEDGED', 'NOT_AUTHORIZED', 'RECEIPT_CANNOT_AUTHORIZE_TOOL', false,
      'LAGGING', NULL, NULL, NULL,
      8, 5, 'ACKED', 'AWAITING_CONFIRMATION',
      'DISPUTED_HELD', 'OMITTED', 'UNTRUSTED_METADATA', 'POINT_LOOKUP',
      false, false, false, false, false, 'STOP_TOOL_PURPOSE',
      'principal:bind-a', 'principal:bind-b',
      'principal:rcpt-a', 'principal:rcpt-b',
      'principal:card-a', 'principal:card-b',
      'principal:adm-a', 'principal:adm-b',
      'principal:att-a', 'principal:att-b',
      'principal:syn-a', 'principal:syn-b',
      'principal:pub-a', 'principal:pub-b',
      '{"bindClass":"NOT_AUTHORIZED","toolAuthorized":false,"lagPublications":8,"attestedKeyKind":"AWAITING_CONFIRMATION","ackPromotedToTrust":false}',
      now(), now()
    ),
    (
      101, DATE '2026-10-05', 'principal:reader-1',
      'c2000000-0000-0000-0000-000000000003',
      'b0000000-0000-0000-0000-000000000003',
      'tool:cite-admitted-counts',
      'UNKNOWN_EFFECT', 'NOT_ACKNOWLEDGED', 'NOT_AUTHORIZED', 'RECEIPT_CANNOT_AUTHORIZE_TOOL', false,
      'UNKNOWN_EFFECT', NULL, NULL, NULL,
      NULL, 5, 'UNKNOWN_EFFECT', 'AWAITING_CONFIRMATION',
      'DISPUTED_HELD', 'OMITTED', 'UNTRUSTED_METADATA', 'POINT_LOOKUP',
      false, false, false, false, false, 'OMIT_TOOL_PURPOSE',
      'principal:bind-a', 'principal:bind-b',
      'principal:rcpt-a', 'principal:rcpt-b',
      'principal:card-a', 'principal:card-b',
      'principal:adm-a', 'principal:adm-b',
      'principal:att-a', 'principal:att-b',
      'principal:syn-a', 'principal:syn-b',
      'principal:pub-a', 'principal:pub-b',
      '{"bindClass":"NOT_AUTHORIZED","toolAuthorized":false,"attestedKeyKind":"AWAITING_CONFIRMATION","ackPromotedToTrust":false}',
      now(), now()
    );

    INSERT INTO agent_acte_session (
      account_id, session_id, profile_id, profile_version, status,
      state_revision, purpose, idempotency_key, budget_nominate_units,
      budget_record_units, budget_vector_units, budget_notify_units,
      consumed_nominate_units, consumed_record_units, consumed_vector_units,
      consumed_notify_units, budget_max_wall_time_ms, effect_threshold,
      max_binds_per_session, max_nominated_binds, deadline_at, started_by,
      principal_id, authorization_evidence_id, delegated_scope_hash,
      authorization_revision, resource_scope_hash, created_at, updated_at
    ) VALUES
    (
      101, '20000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001', 1, 'OPEN', 0,
      'Record one effect for an authorized bind', 'request-1',
      100, 40, 5, 2,
      0, 0, 0, 0, 60000, 2, 1, 1,
      now() + interval '1 minute',
      'principal:test', 'principal:reader-1',
      '30000000-0000-0000-0000-000000000001',
      repeat('e', 64), 7, repeat('f', 64), now(), now()
    ),
    (
      101, '20000000-0000-0000-0000-000000000002',
      '10000000-0000-0000-0000-000000000001', 1, 'OPEN', 0,
      'Refuse an effect for one denied bind', 'request-2',
      100, 40, 5, 2,
      0, 0, 0, 0, 60000, 2, 1, 1,
      now() + interval '1 minute',
      'principal:test', 'principal:reader-1',
      '30000000-0000-0000-0000-000000000001',
      repeat('e', 64), 7, repeat('f', 64), now(), now()
    ),
    (
      101, '20000000-0000-0000-0000-000000000003',
      '10000000-0000-0000-0000-000000000001', 1, 'OPEN', 0,
      'Refuse an effect for one silent bind', 'request-3',
      100, 40, 5, 2,
      0, 0, 0, 0, 60000, 2, 1, 1,
      now() + interval '1 minute',
      'principal:test', 'principal:reader-1',
      '30000000-0000-0000-0000-000000000001',
      repeat('e', 64), 7, repeat('f', 64), now(), now()
    );

    SELECT nominate_agent_acte_bind(
      101,
      '20000000-0000-0000-0000-000000000001',
      DATE '2026-10-08',
      'principal:reader-1',
      '40000000-0000-0000-0000-000000000001',
      repeat('1', 64)
    );
    SELECT nominate_agent_acte_bind(
      101,
      '20000000-0000-0000-0000-000000000002',
      DATE '2026-10-07',
      'principal:reader-1',
      '40000000-0000-0000-0000-000000000002',
      repeat('2', 64)
    );
    SELECT nominate_agent_acte_bind(
      101,
      '20000000-0000-0000-0000-000000000003',
      DATE '2026-10-05',
      'principal:reader-1',
      '40000000-0000-0000-0000-000000000003',
      repeat('3', 64)
    );

    SELECT record_agent_acte_tool_effect(
      101,
      '20000000-0000-0000-0000-000000000001',
      DATE '2026-10-08',
      'principal:reader-1',
      'effect:cited-admitted-counts',
      '70000000-0000-0000-0000-000000000001',
      '90000000-0000-0000-0000-000000000001',
      'a0000000-0000-0000-0000-000000000001',
      'c3000000-0000-0000-0000-000000000001',
      repeat('6', 64),
      'principal:effect-a',
      'principal:effect-b'
    );
    SELECT record_agent_acte_tool_effect(
      101,
      '20000000-0000-0000-0000-000000000002',
      DATE '2026-10-07',
      'principal:reader-1',
      'effect:cited-admitted-counts',
      '70000000-0000-0000-0000-000000000002',
      '90000000-0000-0000-0000-000000000002',
      'a0000000-0000-0000-0000-000000000002',
      'c3000000-0000-0000-0000-000000000002',
      repeat('7', 64),
      'principal:effect-a',
      'principal:effect-b'
    );
    SELECT record_agent_acte_tool_effect(
      101,
      '20000000-0000-0000-0000-000000000003',
      DATE '2026-10-05',
      'principal:reader-1',
      'effect:cited-admitted-counts',
      '70000000-0000-0000-0000-000000000003',
      '90000000-0000-0000-0000-000000000003',
      'a0000000-0000-0000-0000-000000000003',
      'c3000000-0000-0000-0000-000000000003',
      repeat('8', 64),
      'principal:effect-a',
      'principal:effect-b'
    );
  `);

  const recorded = await database.query(`
    SELECT outcome_class, outcome_reason, tool_effect_recorded,
           sealed_count, denied_count, unknown_effect_count, lag_publications,
           trusted_next_action, executes_tool, attested_key_kind, ack_promoted_to_trust
    FROM agent_acte_tool_effect_outcome
    WHERE account_id = 101
      AND utc_day = DATE '2026-10-08'
      AND consumer_principal_id = 'principal:reader-1'
  `);
  const recordedRow = recorded.rows[0];
  if (
    recordedRow?.outcome_class !== "RECORDED" ||
    recordedRow?.outcome_reason !== "AUTHORIZED_PURPOSE_EFFECT_RECORDED" ||
    recordedRow?.tool_effect_recorded !== true ||
    Number(recordedRow?.sealed_count) !== 1 ||
    Number(recordedRow?.denied_count) !== 1 ||
    Number(recordedRow?.unknown_effect_count) !== 1 ||
    Number(recordedRow?.lag_publications) !== 3 ||
    recordedRow?.trusted_next_action !== "CITE_RECORDED_EFFECT" ||
    recordedRow?.executes_tool !== false ||
    recordedRow?.attested_key_kind !== "AWAITING_CONFIRMATION" ||
    recordedRow?.ack_promoted_to_trust !== false
  ) {
    throw new Error(`authorized effect fixture mismatch: ${JSON.stringify(recordedRow)}`);
  }

  const head = await database.query(`
    SELECT lag_publications, sealed_count, bind_class, tool_authorized
    FROM agent_acte_recorded_bind_head
    WHERE account_id = 101
      AND utc_day = DATE '2026-10-08'
      AND consumer_principal_id = 'principal:reader-1'
  `);
  if (
    Number(head.rows[0]?.lag_publications) !== 3 ||
    Number(head.rows[0]?.sealed_count) !== 1 ||
    head.rows[0]?.bind_class !== "AUTHORIZED" ||
    head.rows[0]?.tool_authorized !== true
  ) {
    throw new Error("recorded bind head was rewritten");
  }

  const denied = await database.query(`
    SELECT outcome_class, outcome_reason, tool_effect_recorded,
           sealed_count, lag_publications, trusted_next_action
    FROM agent_acte_tool_effect_outcome
    WHERE account_id = 101
      AND utc_day = DATE '2026-10-07'
      AND consumer_principal_id = 'principal:reader-1'
  `);
  if (
    denied.rows[0]?.outcome_class !== "NOT_RECORDED" ||
    denied.rows[0]?.outcome_reason !== "UNAUTHORIZED_BIND_CANNOT_SUCCEED" ||
    denied.rows[0]?.tool_effect_recorded !== false ||
    denied.rows[0]?.sealed_count !== null ||
    Number(denied.rows[0]?.lag_publications) !== 8 ||
    denied.rows[0]?.trusted_next_action !== "STOP_EFFECT_RECORD"
  ) {
    throw new Error(`denied effect fixture mismatch: ${JSON.stringify(denied.rows[0])}`);
  }

  const silent = await database.query(`
    SELECT outcome_class, tool_effect_recorded, sealed_count, lag_publications, trusted_next_action
    FROM agent_acte_tool_effect_outcome
    WHERE account_id = 101
      AND utc_day = DATE '2026-10-05'
      AND consumer_principal_id = 'principal:reader-1'
  `);
  if (
    silent.rows[0]?.outcome_class !== "NOT_RECORDED" ||
    silent.rows[0]?.tool_effect_recorded !== false ||
    silent.rows[0]?.sealed_count !== null ||
    silent.rows[0]?.lag_publications !== null ||
    silent.rows[0]?.trusted_next_action !== "OMIT_EFFECT_RECORD"
  ) {
    throw new Error(`silent effect fixture mismatch: ${JSON.stringify(silent.rows[0])}`);
  }

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);
        SELECT nominate_agent_acte_bind(
          101,
          '20000000-0000-0000-0000-000000000001',
          NULL,
          'principal:reader-1',
          '40000000-0000-0000-0000-000000000091',
          repeat('9', 64)
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
        SELECT nominate_agent_acte_bind(
          101,
          '20000000-0000-0000-0000-000000000001',
          DATE '2026-10-08',
          'principal:reader-1',
          '40000000-0000-0000-0000-000000000092',
          repeat('9', 64)
        );
      `),
    "second bind nomination",
    "P0001",
  );
  rejectionChecks += 1;

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);
        SELECT record_agent_acte_tool_effect(
          101,
          '20000000-0000-0000-0000-000000000001',
          DATE '2026-10-08',
          'principal:reader-1',
          'effect:other-tool',
          '70000000-0000-0000-0000-000000000091',
          '90000000-0000-0000-0000-000000000091',
          'a0000000-0000-0000-0000-000000000091',
          'c3000000-0000-0000-0000-000000000091',
          repeat('6', 64),
          'principal:effect-a',
          'principal:effect-b'
        );
      `),
    "effect code outside the profile",
    "P0001",
  );
  rejectionChecks += 1;

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);
        INSERT INTO agent_acte_recorded_bind_head (
          account_id, utc_day, consumer_principal_id, bind_id, receipt_id, purpose_code,
          admission_class, receipt_class, bind_class, bind_reason, tool_authorized,
          freshness_class, sealed_count, denied_count, unknown_effect_count,
          lag_publications, max_lag_budget, effect_observation, attested_key_kind,
          fact_disposition, body_visibility, metadata_trust, access_path,
          inlines_fact_body, opens_nested_expiry, ack_promoted_to_trust, packet_scan_used,
          executes_tool, trusted_next_action,
          bind_steward_a, bind_steward_b,
          receipt_steward_a, receipt_steward_b,
          card_steward_a, card_steward_b,
          admission_steward_a, admission_steward_b,
          attestation_steward_a, attestation_steward_b,
          synopsis_steward_a, synopsis_steward_b,
          publication_steward_a, publication_steward_b,
          bind_body, sealed_at, created_at
        ) VALUES (
          101, DATE '2026-10-04', 'principal:reader-1',
          'c2000000-0000-0000-0000-000000000004',
          'b0000000-0000-0000-0000-000000000004',
          'tool:cite-admitted-counts',
          'ADMITTED', 'ACKNOWLEDGED', 'AUTHORIZED', 'ACKNOWLEDGED_RECEIPT_PURPOSE_BOUND', true,
          'LAGGING', 1, 0, 0,
          4, 5, 'ACKED', 'AWAITING_CONFIRMATION',
          'DISPUTED_HELD', 'OMITTED', 'UNTRUSTED_METADATA', 'POINT_LOOKUP',
          false, false, false, false, false, 'INVOKE_BOUND_PURPOSE',
          'principal:bind-a', 'principal:bind-b',
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
        INSERT INTO agent_acte_effect_decision (
          account_id, decision_id, certificate_id, session_id, utc_day,
          consumer_principal_id, effect_code, compile_kind, admission_class,
          bind_class, outcome_class, freshness_class, effect_observation,
          attested_key_kind, fact_disposition, body_visibility, access_path,
          metadata_trust, opens_nested_expiry, inlines_fact_body,
          ack_promoted_to_trust, packet_scan_used, tool_effect_recorded, executes_tool,
          lag_publications, max_lag_budget, outcome_hash, sealed_at, created_at
        ) VALUES (
          101, 'a0000000-0000-0000-0000-000000000092',
          '90000000-0000-0000-0000-000000000001',
          '20000000-0000-0000-0000-000000000001',
          DATE '2026-10-08', 'principal:reader-1', 'effect:cited-admitted-counts',
          'RECORD_AUTHORIZED_TOOL_EFFECT', 'ADMITTED', 'AUTHORIZED', 'RECORDED',
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
        INSERT INTO agent_acte_effect_decision (
          account_id, decision_id, certificate_id, session_id, utc_day,
          consumer_principal_id, effect_code, compile_kind, admission_class,
          bind_class, outcome_class, freshness_class, effect_observation,
          attested_key_kind, fact_disposition, body_visibility, access_path,
          metadata_trust, opens_nested_expiry, inlines_fact_body,
          ack_promoted_to_trust, packet_scan_used, tool_effect_recorded, executes_tool,
          lag_publications, max_lag_budget, outcome_hash, sealed_at, created_at
        ) VALUES (
          101, 'a0000000-0000-0000-0000-000000000093',
          '90000000-0000-0000-0000-000000000001',
          '20000000-0000-0000-0000-000000000001',
          DATE '2026-10-08', 'principal:reader-1', 'effect:cited-admitted-counts',
          'RECORD_AUTHORIZED_TOOL_EFFECT', 'ADMITTED', 'AUTHORIZED', 'RECORDED',
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
        INSERT INTO agent_acte_effect_certificate (
          account_id, certificate_id, session_id, compile_id, consumer_principal_id,
          utc_day, effect_code, effect_hash, admission_class, outcome_class,
          tool_effect_recorded, effect_steward_a, effect_steward_b,
          bind_steward_a, bind_steward_b,
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
          DATE '2026-10-08', 'effect:cited-admitted-counts', repeat('a', 64),
          'ADMITTED', 'RECORDED', true,
          'principal:bind-a', 'principal:effect-b',
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
        INSERT INTO agent_acte_tool_effect_outcome (
          account_id, utc_day, consumer_principal_id, outcome_id, session_id,
          certificate_id, bind_id, purpose_code, effect_code, admission_class, bind_class,
          outcome_class, outcome_reason, tool_effect_recorded, sealed_count, denied_count,
          unknown_effect_count, lag_publications, max_lag_budget, effect_observation,
          attested_key_kind, fact_disposition, body_visibility, metadata_trust,
          access_path, inlines_fact_body, opens_nested_expiry, ack_promoted_to_trust,
          packet_scan_used, executes_tool, trusted_next_action, effect_steward_a,
          effect_steward_b, outcome_body, sealed_at, created_at
        ) VALUES (
          101, DATE '2026-10-07', 'principal:reader-1',
          'c3000000-0000-0000-0000-000000000091',
          '20000000-0000-0000-0000-000000000002',
          '90000000-0000-0000-0000-000000000002',
          'c2000000-0000-0000-0000-000000000002',
          'tool:cite-admitted-counts', 'effect:cited-admitted-counts',
          'DENIED', 'NOT_AUTHORIZED', 'RECORDED',
          'AUTHORIZED_PURPOSE_EFFECT_RECORDED', true,
          4, 2, 1,
          8, 5, 'ACKED', 'AWAITING_CONFIRMATION',
          'DISPUTED_HELD', 'OMITTED', 'UNTRUSTED_METADATA', 'POINT_LOOKUP',
          false, false, false, false, false, 'CITE_RECORDED_EFFECT',
          'principal:effect-a', 'principal:effect-b',
          '{"sealedCount":4,"deniedCount":2,"unknownEffectCount":1,"effectCode":"effect:cited-admitted-counts"}',
          now(), now()
        );
      `),
    "successful effect on a not-authorized bind",
    "P0001",
  );
  rejectionChecks += 1;

  await database.exec(`
    SELECT set_config('app.account_id', '101', true);
    INSERT INTO agent_acte_recorded_bind_head (
      account_id, utc_day, consumer_principal_id, bind_id, receipt_id, purpose_code,
      admission_class, receipt_class, bind_class, bind_reason, tool_authorized,
      freshness_class, sealed_count, denied_count, unknown_effect_count,
      lag_publications, max_lag_budget, effect_observation, attested_key_kind,
      fact_disposition, body_visibility, metadata_trust, access_path,
      inlines_fact_body, opens_nested_expiry, ack_promoted_to_trust, packet_scan_used,
      executes_tool, trusted_next_action,
      bind_steward_a, bind_steward_b,
      receipt_steward_a, receipt_steward_b,
      card_steward_a, card_steward_b,
      admission_steward_a, admission_steward_b,
      attestation_steward_a, attestation_steward_b,
      synopsis_steward_a, synopsis_steward_b,
      publication_steward_a, publication_steward_b,
      bind_body, sealed_at, created_at
    ) VALUES (
      101, DATE '2026-10-06', 'principal:reader-2',
      'c2000000-0000-0000-0000-000000000006',
      'b0000000-0000-0000-0000-000000000006',
      'tool:cite-admitted-counts',
      'ADMITTED', 'ACKNOWLEDGED', 'AUTHORIZED', 'ACKNOWLEDGED_RECEIPT_PURPOSE_BOUND', true,
      'LAGGING', 1, 1, 1,
      2, 5, 'ACKED', 'AWAITING_CONFIRMATION',
      'DISPUTED_HELD', 'OMITTED', 'UNTRUSTED_METADATA', 'POINT_LOOKUP',
      false, false, false, false, false, 'INVOKE_BOUND_PURPOSE',
      'principal:bind-a', 'principal:bind-b',
      'principal:rcpt-a', 'principal:rcpt-b',
      'principal:card-a', 'principal:card-b',
      'principal:adm-a', 'principal:adm-b',
      'principal:att-a', 'principal:att-b',
      'principal:syn-a', 'principal:syn-b',
      'principal:pub-a', 'principal:pub-b',
      '{"sealedCount":1,"deniedCount":1,"unknownEffectCount":1}',
      now(), now()
    );
  `);

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);
        INSERT INTO agent_acte_tool_effect_outcome (
          account_id, utc_day, consumer_principal_id, outcome_id, session_id,
          certificate_id, bind_id, purpose_code, effect_code, admission_class, bind_class,
          outcome_class, outcome_reason, tool_effect_recorded, sealed_count, denied_count,
          unknown_effect_count, lag_publications, max_lag_budget, effect_observation,
          attested_key_kind, fact_disposition, body_visibility, metadata_trust,
          access_path, inlines_fact_body, opens_nested_expiry, ack_promoted_to_trust,
          packet_scan_used, executes_tool, trusted_next_action, effect_steward_a,
          effect_steward_b, outcome_body, sealed_at, created_at
        ) VALUES (
          101, DATE '2026-10-06', 'principal:reader-2',
          'c3000000-0000-0000-0000-000000000096',
          '20000000-0000-0000-0000-000000000001',
          '90000000-0000-0000-0000-000000000001',
          'c2000000-0000-0000-0000-000000000006',
          'tool:cite-admitted-counts', 'effect:cited-admitted-counts',
          'ADMITTED', 'AUTHORIZED', 'RECORDED',
          'AUTHORIZED_PURPOSE_EFFECT_RECORDED', true,
          9, 1, 1,
          2, 5, 'ACKED', 'AWAITING_CONFIRMATION',
          'DISPUTED_HELD', 'OMITTED', 'UNTRUSTED_METADATA', 'POINT_LOOKUP',
          false, false, false, false, false, 'CITE_RECORDED_EFFECT',
          'principal:effect-a', 'principal:effect-b',
          '{"sealedCount":9,"deniedCount":1,"unknownEffectCount":1}',
          now(), now()
        );
      `),
    "recorded counts that differ from the bind head",
    "P0001",
  );
  rejectionChecks += 1;

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);
        INSERT INTO agent_acte_tool_effect_outcome (
          account_id, utc_day, consumer_principal_id, outcome_id, session_id,
          certificate_id, bind_id, purpose_code, effect_code, admission_class, bind_class,
          outcome_class, outcome_reason, tool_effect_recorded, sealed_count, denied_count,
          unknown_effect_count, lag_publications, max_lag_budget, effect_observation,
          attested_key_kind, fact_disposition, body_visibility, metadata_trust,
          access_path, inlines_fact_body, opens_nested_expiry, ack_promoted_to_trust,
          packet_scan_used, executes_tool, trusted_next_action, effect_steward_a,
          effect_steward_b, outcome_body, sealed_at, created_at
        ) VALUES (
          101, DATE '2026-10-06', 'principal:reader-2',
          'c3000000-0000-0000-0000-000000000097',
          '20000000-0000-0000-0000-000000000001',
          '90000000-0000-0000-0000-000000000001',
          'c2000000-0000-0000-0000-000000000006',
          'tool:cite-admitted-counts', 'effect:cited-admitted-counts',
          'ADMITTED', 'AUTHORIZED', 'RECORDED',
          'AUTHORIZED_PURPOSE_EFFECT_RECORDED', true,
          1, 1, 1,
          2, 5, 'ACKED', 'TRUSTED_ENROLLED',
          'DISPUTED_HELD', 'OMITTED', 'UNTRUSTED_METADATA', 'POINT_LOOKUP',
          false, false, true, false, false, 'CITE_RECORDED_EFFECT',
          'principal:effect-a', 'principal:effect-b',
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
        INSERT INTO agent_acte_tool_effect_outcome (
          account_id, utc_day, consumer_principal_id, outcome_id, session_id,
          certificate_id, bind_id, purpose_code, effect_code, admission_class, bind_class,
          outcome_class, outcome_reason, tool_effect_recorded, sealed_count, denied_count,
          unknown_effect_count, lag_publications, max_lag_budget, effect_observation,
          attested_key_kind, fact_disposition, body_visibility, metadata_trust,
          access_path, inlines_fact_body, opens_nested_expiry, ack_promoted_to_trust,
          packet_scan_used, executes_tool, trusted_next_action, effect_steward_a,
          effect_steward_b, outcome_body, sealed_at, created_at
        ) VALUES (
          101, DATE '2026-10-06', 'principal:reader-2',
          'c3000000-0000-0000-0000-000000000098',
          '20000000-0000-0000-0000-000000000001',
          '90000000-0000-0000-0000-000000000001',
          'c2000000-0000-0000-0000-000000000006',
          'tool:cite-admitted-counts', 'effect:cited-admitted-counts',
          'ADMITTED', 'AUTHORIZED', 'RECORDED',
          'AUTHORIZED_PURPOSE_EFFECT_RECORDED', true,
          1, 1, 1,
          2, 5, 'ACKED', 'AWAITING_CONFIRMATION',
          'DISPUTED_HELD', 'OMITTED', 'UNTRUSTED_METADATA', 'POINT_LOOKUP',
          false, false, false, false, true, 'CITE_RECORDED_EFFECT',
          'principal:effect-a', 'principal:effect-b',
          '{"sealedCount":1,"deniedCount":1,"unknownEffectCount":1}',
          now(), now()
        );
      `),
    "tool execution inside the record",
    "P0001",
  );
  rejectionChecks += 1;

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);
        UPDATE agent_acte_recorded_bind_head
        SET lag_publications = 0
        WHERE account_id = 101
          AND utc_day = DATE '2026-10-08'
          AND consumer_principal_id = 'principal:reader-1';
      `),
    "mutation of a sealed recorded bind head",
    "P0001",
  );
  rejectionChecks += 1;

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);
        UPDATE agent_acte_tool_effect_outcome
        SET sealed_count = 9
        WHERE account_id = 101
          AND utc_day = DATE '2026-10-08'
          AND consumer_principal_id = 'principal:reader-1';
      `),
    "mutation of a sealed tool effect outcome",
    "P0001",
  );
  rejectionChecks += 1;

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);
        INSERT INTO agent_acte_profile (
          account_id, profile_id, profile_version, name, status,
          definition_hash, canonicalization_version, compiler_version,
          approval_validation_hash, authorization_evidence_id,
          authorization_snapshot_hash, allowed_purpose, allowed_effect_code,
          effect_threshold, max_binds_per_session, max_nominated_binds, semantic_tags,
          procedure_ref, revocation_policy, created_by, created_at,
          approved_by, approved_at
        ) VALUES (
          101, '10000000-0000-0000-0000-000000000099', 1,
          'Skip the fence', 'APPROVED',
          repeat('b', 64), 'jcs-v1', 'acte-record-1',
          repeat('b', 64), '30000000-0000-0000-0000-000000000001',
          repeat('d', 64), 'tool:cite-admitted-counts', 'effect:cited-admitted-counts',
          2, 1, 1,
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
        SELECT record_agent_acte_tool_effect(
          101,
          '20000000-0000-0000-0000-000000000001',
          DATE '2026-10-08',
          'principal:reader-1',
          'effect:cited-admitted-counts',
          '70000000-0000-0000-0000-000000000094',
          '90000000-0000-0000-0000-000000000094',
          'a0000000-0000-0000-0000-000000000094',
          'c3000000-0000-0000-0000-000000000094',
          repeat('6', 64),
          'principal:effect-a',
          'principal:effect-b'
        );
      `),
    "duplicate tool effect outcome",
    "P0001",
  );
  rejectionChecks += 1;

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);
        SELECT reject_agent_acte_unscoped_scan(false, true);
      `),
    "unscoped scan",
    "P0001",
  );
  rejectionChecks += 1;

  if (rejectionChecks < 16) {
    throw new Error(`expected at least 16 rejection checks, ran ${rejectionChecks}`);
  }

  const tenantCount = await database.query(
    "SELECT count(*)::int AS count FROM agent_acte_session WHERE account_id = 101",
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
