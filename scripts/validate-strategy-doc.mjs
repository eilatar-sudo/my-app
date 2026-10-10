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
  "ADMITTED_COUNT_PERCEPTION_PUBLISHED",
  "COUNT_PERCEPTION_WITHHELD",
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
if (queryCount !== 6 || mutationCount !== 10) {
  throw new Error(
    `expected 6 queries and 10 mutations, found ${queryCount} and ${mutationCount}`,
  );
}

const ddlBlock = sqlBlocks.find((block) =>
  block.includes("CREATE TYPE acpc_session_status"),
);
const vectorBlock = sqlBlocks.find((block) =>
  block.includes("CREATE TABLE agent_acpc_profile_embedding"),
);
if (!ddlBlock || !vectorBlock) {
  throw new Error("could not locate executable SQL schema blocks");
}
if (
  !/CREATE TABLE agent_acpc_profile_embedding \(\n\s+account_id/.test(
    vectorBlock,
  )
) {
  throw new Error("vector schema does not lead with account_id");
}
if (vectorBlock.includes("USING hnsw")) {
  throw new Error("reference schema must not create a cross-tenant HNSW index");
}
if (ddlBlock.includes("context_packet") || ddlBlock.includes("packet_catalog")) {
  throw new Error("count-card schema must not scan or store a context-packet catalog");
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
let rejectionChecks = 0;
try {
  await database.exec("CREATE EXTENSION IF NOT EXISTS vector;");
  await database.exec(ddlBlock);
  await database.exec(vectorBlock);

  await database.exec(`
    SELECT set_config('app.account_id', '101', true);

    INSERT INTO agent_acpc_authorization_evidence (
      account_id, evidence_id, principal_id, policy_revision,
      resource_acl_revision, redacted_scope_summary,
      encrypted_evidence_ref, evidence_hash, immutable_archive_ref, created_at
    ) VALUES (
      101, '30000000-0000-0000-0000-000000000001', 'principal:test', 7, 11,
      '{"scopes":["card.count-perception.publish"]}', 'kms://evidence/fixture',
      repeat('8', 64), 'worm://evidence/fixture', now()
    );

    INSERT INTO agent_acpc_profile (
      account_id, profile_id, profile_version, name, status,
      definition_hash, canonicalization_version, compiler_version,
      approval_validation_hash, authorization_evidence_id,
      authorization_snapshot_hash, publish_threshold, max_days_per_session,
      max_nominated_days, semantic_tags, procedure_ref,
      revocation_policy, created_by, created_at
    ) VALUES (
      101, '10000000-0000-0000-0000-000000000001', 1,
      'Daily admitted count perception card', 'DRAFT',
      repeat('a', 64), 'jcs-v1', 'acpc-card-1',
      NULL, '30000000-0000-0000-0000-000000000001',
      repeat('d', 64), 2, 1, 1,
      ARRAY['incident', 'count-perception'],
      'proc:admitted-count-perception-card',
      'STOP_BEFORE_PUBLISH', 'principal:test', now()
    );

    INSERT INTO agent_acpc_profile_publish_rule (
      account_id, profile_id, profile_version, rule_id, ordinal,
      allowed_classes, publish_threshold, max_days_per_session,
      max_nominated_days, require_dual_control_publish, publish_instruction
    ) VALUES (
      101, '10000000-0000-0000-0000-000000000001', 1, 'publish-day', 1,
      ARRAY['ADMITTED', 'DENIED', 'UNKNOWN_EFFECT'],
      2, 1, 1, true,
      '{"publish_one_utc_day":true,"counts_only_when_admitted":true,"ack_never_trust":true,"point_lookup_only":true,"no_nested_expiry":true,"packet_never_scanned":true,"admission_head_only":true}'
    );

    SELECT approve_agent_acpc_profile(
      101,
      '10000000-0000-0000-0000-000000000001',
      1,
      repeat('a', 64),
      'principal:approver'
    );

    INSERT INTO agent_acpc_admission_head (
      account_id, utc_day, admission_id, admission_hash,
      admission_class, freshness_class, lag_publications, max_lag_budget,
      synopsis_watermark_high, newest_receipt_publication_cursor,
      replay_sealed_count, replay_denied_count, replay_unknown_effect_count,
      counts_visible, silence_observed,
      admission_steward_a, admission_steward_b,
      attestation_steward_a, attestation_steward_b,
      synopsis_steward_a, synopsis_steward_b,
      publication_steward_a, publication_steward_b,
      effect_observation, attested_key_kind, fact_disposition,
      body_visibility, metadata_trust, access_path,
      inlines_fact_body, opens_nested_expiry, ack_promoted_to_trust,
      packet_scan_used, admission_body, decided_at, created_at
    ) VALUES
    (
      101, DATE '2026-10-08', 'c0000000-0000-0000-0000-000000000001',
      repeat('6', 64), 'ADMITTED', 'LAGGING', 3, 5, 12, 15,
      1, 1, 1, true, false,
      'principal:adm-a', 'principal:adm-b',
      'principal:att-a', 'principal:att-b',
      'principal:syn-a', 'principal:syn-b',
      'principal:pub-a', 'principal:pub-b',
      'ACKED', 'AWAITING_CONFIRMATION', 'DISPUTED_HELD',
      'OMITTED', 'UNTRUSTED_METADATA', 'POINT_LOOKUP',
      false, false, false, false,
      '{"admissionClass":"ADMITTED","lagPublications":3,"attestedKeyKind":"AWAITING_CONFIRMATION","ackPromotedToTrust":false}',
      now(), now()
    ),
    (
      101, DATE '2026-10-07', 'c0000000-0000-0000-0000-000000000002',
      repeat('7', 64), 'DENIED', 'LAGGING', 8, 5, 12, 20,
      4, 2, 1, false, false,
      'principal:adm-a', 'principal:adm-b',
      'principal:att-a', 'principal:att-b',
      'principal:syn-a', 'principal:syn-b',
      'principal:pub-a', 'principal:pub-b',
      'ACKED', 'AWAITING_CONFIRMATION', 'DISPUTED_HELD',
      'OMITTED', 'UNTRUSTED_METADATA', 'POINT_LOOKUP',
      false, false, false, false,
      '{"admissionClass":"DENIED","lagPublications":8,"attestedKeyKind":"AWAITING_CONFIRMATION","ackPromotedToTrust":false}',
      now(), now()
    ),
    (
      101, DATE '2026-10-05', 'c0000000-0000-0000-0000-000000000003',
      repeat('9', 64), 'UNKNOWN_EFFECT', 'UNKNOWN_EFFECT', NULL, 5, 9, NULL,
      0, 0, 1, false, true,
      'principal:adm-a', 'principal:adm-b',
      'principal:att-a', 'principal:att-b',
      'principal:syn-a', 'principal:syn-b',
      'principal:pub-a', 'principal:pub-b',
      'UNKNOWN_EFFECT', 'AWAITING_CONFIRMATION', 'DISPUTED_HELD',
      'OMITTED', 'UNTRUSTED_METADATA', 'POINT_LOOKUP',
      false, false, false, false,
      '{"admissionClass":"UNKNOWN_EFFECT","attestedKeyKind":"AWAITING_CONFIRMATION","ackPromotedToTrust":false}',
      now(), now()
    );

    INSERT INTO agent_acpc_session (
      account_id, session_id, profile_id, profile_version, status,
      state_revision, purpose, idempotency_key, budget_nominate_units,
      budget_bind_units, budget_publish_units, budget_vector_units,
      budget_notify_units, consumed_nominate_units, consumed_bind_units,
      consumed_publish_units, consumed_vector_units, consumed_notify_units,
      budget_max_wall_time_ms, publish_threshold, max_days_per_session,
      max_nominated_days, deadline_at, started_by, principal_id,
      authorization_evidence_id, delegated_scope_hash, authorization_revision,
      resource_scope_hash, created_at, updated_at
    ) VALUES
    (
      101, '20000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001', 1, 'OPEN', 0,
      'Publish counts for one admitted synopsis day', 'request-1',
      100, 40, 8, 5, 2,
      0, 0, 0, 0, 0, 60000, 2, 1, 1,
      now() + interval '1 minute',
      'principal:test', 'principal:test',
      '30000000-0000-0000-0000-000000000001',
      repeat('e', 64), 7, repeat('f', 64), now(), now()
    ),
    (
      101, '20000000-0000-0000-0000-000000000002',
      '10000000-0000-0000-0000-000000000001', 1, 'OPEN', 0,
      'Withhold counts for one denied synopsis day', 'request-2',
      100, 40, 8, 5, 2,
      0, 0, 0, 0, 0, 60000, 2, 1, 1,
      now() + interval '1 minute',
      'principal:test', 'principal:test',
      '30000000-0000-0000-0000-000000000001',
      repeat('e', 64), 7, repeat('f', 64), now(), now()
    ),
    (
      101, '20000000-0000-0000-0000-000000000003',
      '10000000-0000-0000-0000-000000000001', 1, 'OPEN', 0,
      'Omit counts for one silent synopsis day', 'request-3',
      100, 40, 8, 5, 2,
      0, 0, 0, 0, 0, 60000, 2, 1, 1,
      now() + interval '1 minute',
      'principal:test', 'principal:test',
      '30000000-0000-0000-0000-000000000001',
      repeat('e', 64), 7, repeat('f', 64), now(), now()
    );

    SELECT nominate_agent_acpc_day(
      101,
      '20000000-0000-0000-0000-000000000001',
      DATE '2026-10-08',
      '40000000-0000-0000-0000-000000000001',
      repeat('1', 64)
    );
    SELECT nominate_agent_acpc_day(
      101,
      '20000000-0000-0000-0000-000000000002',
      DATE '2026-10-07',
      '40000000-0000-0000-0000-000000000002',
      repeat('2', 64)
    );
    SELECT nominate_agent_acpc_day(
      101,
      '20000000-0000-0000-0000-000000000003',
      DATE '2026-10-05',
      '40000000-0000-0000-0000-000000000003',
      repeat('3', 64)
    );

    SELECT publish_agent_acpc_count_card(
      101,
      '20000000-0000-0000-0000-000000000001',
      DATE '2026-10-08',
      '70000000-0000-0000-0000-000000000001',
      '90000000-0000-0000-0000-000000000001',
      'a0000000-0000-0000-0000-000000000001',
      'b0000000-0000-0000-0000-000000000001',
      repeat('6', 64),
      'principal:card-a',
      'principal:card-b'
    );
    SELECT publish_agent_acpc_count_card(
      101,
      '20000000-0000-0000-0000-000000000002',
      DATE '2026-10-07',
      '70000000-0000-0000-0000-000000000002',
      '90000000-0000-0000-0000-000000000002',
      'a0000000-0000-0000-0000-000000000002',
      'b0000000-0000-0000-0000-000000000002',
      repeat('7', 64),
      'principal:card-a',
      'principal:card-b'
    );
    SELECT publish_agent_acpc_count_card(
      101,
      '20000000-0000-0000-0000-000000000003',
      DATE '2026-10-05',
      '70000000-0000-0000-0000-000000000003',
      '90000000-0000-0000-0000-000000000003',
      'a0000000-0000-0000-0000-000000000003',
      'b0000000-0000-0000-0000-000000000003',
      repeat('9', 64),
      'principal:card-a',
      'principal:card-b'
    );

    SELECT publish_agent_acpc_card_record(
      101,
      DATE '2026-10-08',
      'b0000000-0000-0000-0000-000000000001',
      'd0000000-0000-0000-0000-000000000001'
    );
    SELECT publish_agent_acpc_card_record(
      101,
      DATE '2026-10-07',
      'b0000000-0000-0000-0000-000000000002',
      'd0000000-0000-0000-0000-000000000002'
    );
    SELECT publish_agent_acpc_card_record(
      101,
      DATE '2026-10-05',
      'b0000000-0000-0000-0000-000000000003',
      'd0000000-0000-0000-0000-000000000003'
    );
  `);

  const nominations = await database.query(
    "SELECT count(*)::int AS count FROM agent_acpc_day_nomination WHERE account_id = 101 AND access_path = 'POINT_LOOKUP'",
  );
  if (nominations.rows[0]?.count !== 3) {
    throw new Error("point-lookup day nomination was not compiled");
  }

  const admitted = await database.query(`
    SELECT admission_class, freshness_class, lag_publications, max_lag_budget,
           counts_published, sealed_count, denied_count, unknown_effect_count,
           attested_key_kind, effect_observation, metadata_trust,
           fact_disposition, body_visibility, inlines_fact_body,
           opens_nested_expiry, ack_promoted_to_trust, packet_scan_used,
           trusted_next_action, card_body
    FROM agent_acpc_count_perception_card
    WHERE account_id = 101
      AND utc_day = DATE '2026-10-08'
  `);
  const card = admitted.rows[0];
  const body = card?.card_body ?? {};
  if (
    card?.admission_class !== "ADMITTED" ||
    card?.freshness_class !== "LAGGING" ||
    Number(card?.lag_publications) !== 3 ||
    Number(card?.max_lag_budget) !== 5 ||
    card?.counts_published !== true ||
    Number(card?.sealed_count) !== 1 ||
    Number(card?.denied_count) !== 1 ||
    Number(card?.unknown_effect_count) !== 1 ||
    card?.attested_key_kind !== "AWAITING_CONFIRMATION" ||
    card?.effect_observation !== "ACKED" ||
    card?.metadata_trust !== "UNTRUSTED_METADATA" ||
    card?.fact_disposition !== "DISPUTED_HELD" ||
    card?.body_visibility !== "OMITTED" ||
    card?.inlines_fact_body !== false ||
    card?.opens_nested_expiry !== false ||
    card?.ack_promoted_to_trust !== false ||
    card?.packet_scan_used !== false ||
    card?.trusted_next_action !== "USE_SEALED_COUNTS" ||
    body.factBody !== undefined ||
    body.fact_body !== undefined ||
    body.attestedKeyKind !== "AWAITING_CONFIRMATION" ||
    body.ackPromotedToTrust !== false ||
    Number(body.lagPublications) !== 3 ||
    Number(body.sealedCount) !== 1 ||
    Number(body.deniedCount) !== 1 ||
    Number(body.unknownEffectCount) !== 1
  ) {
    throw new Error(`admitted count card mismatch: ${JSON.stringify(card)}`);
  }

  const denied = await database.query(`
    SELECT admission_class, counts_published, sealed_count, denied_count,
           unknown_effect_count, lag_publications, trusted_next_action, card_body
    FROM agent_acpc_count_perception_card
    WHERE account_id = 101 AND utc_day = DATE '2026-10-07'
  `);
  const deniedCard = denied.rows[0];
  const deniedBody = deniedCard?.card_body ?? {};
  if (
    deniedCard?.admission_class !== "DENIED" ||
    deniedCard?.counts_published !== false ||
    deniedCard?.sealed_count !== null ||
    deniedCard?.denied_count !== null ||
    deniedCard?.unknown_effect_count !== null ||
    Number(deniedCard?.lag_publications) !== 8 ||
    deniedCard?.trusted_next_action !== "STOP_SYNOPSIS_USE" ||
    deniedBody.sealedCount !== undefined ||
    deniedBody.deniedCount !== undefined ||
    deniedBody.unknownEffectCount !== undefined
  ) {
    throw new Error(`denied count card mismatch: ${JSON.stringify(deniedCard)}`);
  }

  const silent = await database.query(`
    SELECT admission_class, counts_published, sealed_count, lag_publications,
           trusted_next_action
    FROM agent_acpc_count_perception_card
    WHERE account_id = 101 AND utc_day = DATE '2026-10-05'
  `);
  const silentCard = silent.rows[0];
  if (
    silentCard?.admission_class !== "UNKNOWN_EFFECT" ||
    silentCard?.counts_published !== false ||
    silentCard?.sealed_count !== null ||
    silentCard?.lag_publications !== null ||
    silentCard?.trusted_next_action !== "OMIT_COUNTS"
  ) {
    throw new Error(`silent count card mismatch: ${JSON.stringify(silentCard)}`);
  }

  const head = await database.query(`
    SELECT lag_publications, replay_sealed_count, replay_denied_count,
           replay_unknown_effect_count, admission_class
    FROM agent_acpc_admission_head
    WHERE account_id = 101 AND utc_day = DATE '2026-10-08'
  `);
  const admittedHead = head.rows[0];
  if (
    Number(admittedHead?.lag_publications) !== 3 ||
    Number(admittedHead?.replay_sealed_count) !== 1 ||
    admittedHead?.admission_class !== "ADMITTED"
  ) {
    throw new Error(`admission head was rewritten: ${JSON.stringify(admittedHead)}`);
  }

  const deniedHead = await database.query(`
    SELECT replay_sealed_count, replay_denied_count, replay_unknown_effect_count,
           counts_visible, admission_class
    FROM agent_acpc_admission_head
    WHERE account_id = 101 AND utc_day = DATE '2026-10-07'
  `);
  const deniedHeadRow = deniedHead.rows[0];
  if (
    Number(deniedHeadRow?.replay_sealed_count) !== 4 ||
    Number(deniedHeadRow?.replay_denied_count) !== 2 ||
    Number(deniedHeadRow?.replay_unknown_effect_count) !== 1 ||
    deniedHeadRow?.counts_visible !== false ||
    deniedHeadRow?.admission_class !== "DENIED"
  ) {
    throw new Error(`denied replay counts changed: ${JSON.stringify(deniedHeadRow)}`);
  }

  const published = await database.query(`
    SELECT reason_code, counts_published, sealed_count, denied_count, unknown_effect_count
    FROM agent_acpc_card_publication
    WHERE account_id = 101 AND utc_day = DATE '2026-10-08'
  `);
  const publishedRow = published.rows[0];
  if (
    publishedRow?.reason_code !== "ADMITTED_COUNT_PERCEPTION_PUBLISHED" ||
    publishedRow?.counts_published !== true ||
    Number(publishedRow?.sealed_count) !== 1 ||
    Number(publishedRow?.denied_count) !== 1 ||
    Number(publishedRow?.unknown_effect_count) !== 1
  ) {
    throw new Error(`admitted publication mismatch: ${JSON.stringify(publishedRow)}`);
  }

  const withheld = await database.query(`
    SELECT reason_code, counts_published, sealed_count, denied_count, unknown_effect_count
    FROM agent_acpc_card_publication
    WHERE account_id = 101 AND utc_day IN (DATE '2026-10-07', DATE '2026-10-05')
  `);
  if (withheld.rows.length !== 2) {
    throw new Error("withheld publications were not appended");
  }
  for (const row of withheld.rows) {
    if (
      row.reason_code !== "COUNT_PERCEPTION_WITHHELD" ||
      row.counts_published !== false ||
      row.sealed_count !== null ||
      row.denied_count !== null ||
      row.unknown_effect_count !== null
    ) {
      throw new Error(`withheld publication leaked counts: ${JSON.stringify(row)}`);
    }
  }

  const leaked = await database.query(`
    SELECT count(*)::int AS count
    FROM agent_acpc_count_perception_card
    WHERE account_id = 101
      AND admission_class <> 'ADMITTED'
      AND (counts_published OR sealed_count IS NOT NULL
           OR denied_count IS NOT NULL OR unknown_effect_count IS NOT NULL
           OR card_body ? 'sealedCount' OR card_body ? 'factBody')
  `);
  if (leaked.rows[0]?.count !== 0) {
    throw new Error("a withheld card carried counts or a fact body");
  }

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);
        SELECT nominate_agent_acpc_day(
          101,
          '20000000-0000-0000-0000-000000000001',
          NULL,
          '40000000-0000-0000-0000-000000000099',
          repeat('1', 64)
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
        SELECT nominate_agent_acpc_day(
          101,
          '20000000-0000-0000-0000-000000000001',
          DATE '2026-10-04',
          '40000000-0000-0000-0000-000000000098',
          repeat('1', 64)
        );
      `),
    "second day nomination",
    "P0001",
  );
  rejectionChecks += 1;

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);
        INSERT INTO agent_acpc_effect_intent (
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
    INSERT INTO agent_acpc_effect_intent (
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
        UPDATE agent_acpc_effect_intent
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
        UPDATE agent_acpc_profile
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
        INSERT INTO agent_acpc_card_decision (
          account_id, decision_id, certificate_id, session_id, utc_day,
          compile_kind, admission_class, freshness_class, effect_observation,
          attested_key_kind, fact_disposition, body_visibility, access_path,
          metadata_trust, opens_nested_expiry, inlines_fact_body,
          ack_promoted_to_trust, packet_scan_used, counts_published,
          lag_publications, max_lag_budget, card_hash, sealed_at, created_at
        ) VALUES (
          101, 'a0000000-0000-0000-0000-000000000091',
          '90000000-0000-0000-0000-000000000001',
          '20000000-0000-0000-0000-000000000001',
          DATE '2026-10-08', 'PUBLISH_COUNT_PERCEPTION_CARD', 'ADMITTED', 'LAGGING',
          'ACKED', 'TRUSTED_ENROLLED', 'DISPUTED_HELD', 'OMITTED', 'POINT_LOOKUP',
          'UNTRUSTED_METADATA', false, false, true, false, true,
          3, 5, repeat('6', 64), now(), now()
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
        INSERT INTO agent_acpc_admission_head (
          account_id, utc_day, admission_id, admission_hash,
          admission_class, freshness_class, lag_publications, max_lag_budget,
          synopsis_watermark_high, newest_receipt_publication_cursor,
          replay_sealed_count, replay_denied_count, replay_unknown_effect_count,
          counts_visible, silence_observed,
          admission_steward_a, admission_steward_b,
          attestation_steward_a, attestation_steward_b,
          synopsis_steward_a, synopsis_steward_b,
          publication_steward_a, publication_steward_b,
          effect_observation, attested_key_kind, fact_disposition,
          body_visibility, metadata_trust, access_path,
          inlines_fact_body, opens_nested_expiry, ack_promoted_to_trust,
          packet_scan_used, admission_body, decided_at, created_at
        ) VALUES (
          101, DATE '2026-10-04', 'c0000000-0000-0000-0000-000000000004',
          repeat('4', 64), 'ADMITTED', 'LAGGING', 4, 5, 12, 16,
          1, 0, 0, true, false,
          'principal:adm-a', 'principal:adm-b',
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
  rejectionChecks += 1;

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);
        INSERT INTO agent_acpc_card_decision (
          account_id, decision_id, certificate_id, session_id, utc_day,
          compile_kind, admission_class, freshness_class, effect_observation,
          attested_key_kind, fact_disposition, body_visibility, access_path,
          metadata_trust, opens_nested_expiry, inlines_fact_body,
          ack_promoted_to_trust, packet_scan_used, counts_published,
          lag_publications, max_lag_budget, card_hash, sealed_at, created_at
        ) VALUES (
          101, 'a0000000-0000-0000-0000-000000000092',
          '90000000-0000-0000-0000-000000000001',
          '20000000-0000-0000-0000-000000000001',
          DATE '2026-10-08', 'PUBLISH_COUNT_PERCEPTION_CARD', 'ADMITTED', 'LAGGING',
          'ACKED', 'AWAITING_CONFIRMATION', 'DISPUTED_HELD', 'OMITTED',
          'POINT_LOOKUP', 'UNTRUSTED_METADATA', true, false, false, false, true,
          3, 5, repeat('6', 64), now(), now()
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
        INSERT INTO agent_acpc_card_decision (
          account_id, decision_id, certificate_id, session_id, utc_day,
          compile_kind, admission_class, freshness_class, effect_observation,
          attested_key_kind, fact_disposition, body_visibility, access_path,
          metadata_trust, opens_nested_expiry, inlines_fact_body,
          ack_promoted_to_trust, packet_scan_used, counts_published,
          lag_publications, max_lag_budget, card_hash, sealed_at, created_at
        ) VALUES (
          101, 'a0000000-0000-0000-0000-000000000093',
          '90000000-0000-0000-0000-000000000001',
          '20000000-0000-0000-0000-000000000001',
          DATE '2026-10-08', 'PUBLISH_COUNT_PERCEPTION_CARD', 'ADMITTED', 'LAGGING',
          'ACKED', 'AWAITING_CONFIRMATION', 'DISPUTED_HELD', 'OMITTED',
          'PACKET_SCAN', 'UNTRUSTED_METADATA', false, false, false, true, true,
          3, 5, repeat('6', 64), now(), now()
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
        INSERT INTO agent_acpc_card_certificate (
          account_id, certificate_id, session_id, compile_id, consumer_ref,
          utc_day, purpose_hash, admission_class, counts_published,
          lag_publications, max_lag_budget,
          card_steward_a, card_steward_b,
          admission_steward_a, admission_steward_b,
          attestation_steward_a, attestation_steward_b,
          synopsis_steward_a, synopsis_steward_b,
          publication_steward_a, publication_steward_b,
          sealed_revision, sealed_at, created_at
        ) VALUES (
          101, '90000000-0000-0000-0000-000000000091',
          '20000000-0000-0000-0000-000000000001',
          '70000000-0000-0000-0000-000000000091',
          'consumer:reused-steward',
          DATE '2026-10-08', repeat('a', 64), 'ADMITTED', true,
          3, 5,
          'principal:adm-a', 'principal:card-b',
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
        INSERT INTO agent_acpc_count_perception_card (
          account_id, utc_day, card_id, session_id, certificate_id, admission_id,
          admission_class, freshness_class, counts_published,
          sealed_count, denied_count, unknown_effect_count,
          lag_publications, max_lag_budget, effect_observation, attested_key_kind,
          fact_disposition, body_visibility, metadata_trust, access_path,
          inlines_fact_body, opens_nested_expiry, ack_promoted_to_trust,
          packet_scan_used, trusted_next_action, card_body, sealed_at, created_at
        ) VALUES (
          101, DATE '2026-10-06', 'b0000000-0000-0000-0000-000000000091',
          '20000000-0000-0000-0000-000000000002',
          '90000000-0000-0000-0000-000000000002',
          'c0000000-0000-0000-0000-000000000002',
          'DENIED', 'LAGGING', true,
          4, 2, 1,
          8, 5, 'ACKED', 'AWAITING_CONFIRMATION',
          'DISPUTED_HELD', 'OMITTED', 'UNTRUSTED_METADATA', 'POINT_LOOKUP',
          false, false, false, false, 'STOP_SYNOPSIS_USE',
          '{"sealedCount":4,"deniedCount":2,"unknownEffectCount":1}',
          now(), now()
        );
      `),
    "counts on a withheld card",
    "P0001",
  );
  rejectionChecks += 1;

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);
        UPDATE agent_acpc_admission_head
        SET lag_publications = 0
        WHERE account_id = 101
          AND utc_day = DATE '2026-10-08';
      `),
    "mutation of a sealed admission head",
    "P0001",
  );
  rejectionChecks += 1;

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);
        INSERT INTO agent_acpc_admission_head (
          account_id, utc_day, admission_id, admission_hash,
          admission_class, freshness_class, lag_publications, max_lag_budget,
          synopsis_watermark_high, newest_receipt_publication_cursor,
          replay_sealed_count, replay_denied_count, replay_unknown_effect_count,
          counts_visible, silence_observed,
          admission_steward_a, admission_steward_b,
          attestation_steward_a, attestation_steward_b,
          synopsis_steward_a, synopsis_steward_b,
          publication_steward_a, publication_steward_b,
          effect_observation, attested_key_kind, fact_disposition,
          body_visibility, metadata_trust, access_path,
          inlines_fact_body, opens_nested_expiry, ack_promoted_to_trust,
          packet_scan_used, admission_body, decided_at, created_at
        ) VALUES (
          101, DATE '2026-10-03', 'c0000000-0000-0000-0000-000000000091',
          repeat('3', 64), 'ADMITTED', 'LAGGING', 9, 5, 12, 21,
          1, 0, 0, true, false,
          'principal:adm-a', 'principal:adm-b',
          'principal:att-a', 'principal:att-b',
          'principal:syn-a', 'principal:syn-b',
          'principal:pub-a', 'principal:pub-b',
          'ACKED', 'AWAITING_CONFIRMATION', 'DISPUTED_HELD',
          'OMITTED', 'UNTRUSTED_METADATA', 'POINT_LOOKUP',
          false, false, false, false,
          '{"admissionClass":"ADMITTED","lagPublications":9,"attestedKeyKind":"AWAITING_CONFIRMATION"}',
          now(), now()
        );
      `),
    "forged admitted head above the lag budget",
    "P0001",
  );
  rejectionChecks += 1;

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);
        INSERT INTO agent_acpc_card_publication (
          account_id, record_id, utc_day, card_id, reason_code, admission_class,
          counts_published, sealed_count, denied_count, unknown_effect_count,
          lag_publications, max_lag_budget, created_at
        ) VALUES (
          101, 'd0000000-0000-0000-0000-000000000091',
          DATE '2026-10-06',
          'b0000000-0000-0000-0000-000000000002',
          'COUNT_PERCEPTION_WITHHELD', 'DENIED',
          true, 4, 2, 1,
          8, 5, now()
        );
      `),
    "withheld publication carrying counts",
    "P0001",
  );
  rejectionChecks += 1;

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);
        INSERT INTO agent_acpc_profile (
          account_id, profile_id, profile_version, name, status,
          definition_hash, canonicalization_version, compiler_version,
          approval_validation_hash, authorization_evidence_id,
          authorization_snapshot_hash, publish_threshold, max_days_per_session,
          max_nominated_days, semantic_tags, procedure_ref,
          revocation_policy, created_by, created_at, approved_by, approved_at
        ) VALUES (
          101, '10000000-0000-0000-0000-000000000091', 1,
          'Skip the fence', 'APPROVED',
          repeat('b', 64), 'jcs-v1', 'acpc-card-1',
          repeat('b', 64), '30000000-0000-0000-0000-000000000001',
          repeat('d', 64), 2, 1, 1,
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
        UPDATE agent_acpc_count_perception_card
        SET sealed_count = 9
        WHERE account_id = 101
          AND utc_day = DATE '2026-10-08';
      `),
    "mutation of a sealed count card",
    "P0001",
  );
  rejectionChecks += 1;

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);
        SELECT reject_agent_acpc_unscoped_scan(false, true);
      `),
    "unscoped scan",
    "P0001",
  );
  rejectionChecks += 1;

  if (rejectionChecks < 15) {
    throw new Error(`expected at least 15 rejection checks, ran ${rejectionChecks}`);
  }

  const tenantCount = await database.query(
    "SELECT count(*)::int AS count FROM agent_acpc_session WHERE account_id = 101",
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
        executableConstraintChecks: rejectionChecks,
        tenantPoliciesChecked: tableCount,
      },
      status: "ok",
    },
    null,
    2,
  ),
);
