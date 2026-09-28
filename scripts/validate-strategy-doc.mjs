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
  block.includes("CREATE TYPE opc_session_status"),
);
const vectorBlock = sqlBlocks.find((block) =>
  block.includes("CREATE TABLE agent_opc_profile_embedding"),
);
if (!ddlBlock || !vectorBlock) {
  throw new Error("could not locate executable SQL schema blocks");
}
if (
  !/CREATE TABLE agent_opc_profile_embedding \(\n\s+account_id/.test(
    vectorBlock,
  )
) {
  throw new Error("vector schema does not lead with account_id");
}
if (vectorBlock.includes("USING hnsw")) {
  throw new Error("reference schema must not create a cross-tenant HNSW index");
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

const decisionColumns = `
  account_id, decision_id, certificate_id, session_id, member_id,
  source_certificate_id, source_kind, decision_ordinal, status, placement_kind,
  key_lifecycle, clock_lifecycle, attested_key_kind, terminal_kind, gate_kind,
  gate_action, perceive_kind, compile_kind, body_visibility, fact_disposition,
  clock_disposition, receipt_disposition, effect_observation, purpose_relation,
  access_path, citation_state, membership_state, metadata_trust, disputed_fact_hash,
  prior_clock_hash, successor_clock_hash, provider_receipt_hash,
  attenuation_hash, requested_purpose_hash, donor_purpose_hash, hop_count,
  halt_scope_hash, silence_inferred, opens_nested_expiry, inlines_fact_body,
  expires_at, sealed_revision, sealed_at, created_at
`;

function decisionValues({
  decisionId,
  ordinal,
  attestedKey = "AWAITING_CONFIRMATION",
  factDisposition = "DISPUTED_HELD",
  bodyVisibility = "OMITTED",
  accessPath = "POINT_LOOKUP",
  opensNestedExpiry = "false",
  membership = "OMITTED",
  citation = "DROPPED",
}) {
  return `
    101, '${decisionId}',
    '90000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    '90000000-0000-0000-0000-000000000099',
    '50000000-0000-0000-0000-000000000099',
    'SEALED_OMISSION_MEMBER', ${ordinal}, 'SEALED',
    'EXTENDED_HALT', 'FIRST_ENROLLMENT', 'ATTESTED',
    '${attestedKey}', 'REQUIRE_HUMAN', 'ALLOW_TOOL_READ', 'TOOL_READ',
    'PERCEIVE_ATTESTED_RECEIPT', 'PERCEIVE_OMITTED_MEMBER', '${bodyVisibility}',
    '${factDisposition}', 'REARMED', 'ATTESTED', 'ACKED', 'NARROWS', '${accessPath}',
    '${citation}', '${membership}', 'UNTRUSTED_METADATA',
    repeat('b', 64), repeat('4', 64), repeat('5', 64), repeat('7', 64),
    repeat('c', 64), repeat('a', 64), repeat('9', 64), 1, repeat('4', 64),
    false, ${opensNestedExpiry}, false, now() + interval '30 minutes', 1, now(), now()
  `;
}

const database = await PGlite.create({ extensions: { vector } });
try {
  await database.exec("CREATE EXTENSION IF NOT EXISTS vector;");
  await database.exec(ddlBlock);
  await database.exec(vectorBlock);

  await database.exec(`
    SELECT set_config('app.account_id', '101', true);

    INSERT INTO agent_opc_authorization_evidence (
      account_id, evidence_id, principal_id, policy_revision,
      resource_acl_revision, redacted_scope_summary,
      encrypted_evidence_ref, evidence_hash, immutable_archive_ref, created_at
    ) VALUES (
      101, '30000000-0000-0000-0000-000000000001', 'principal:test', 7, 11,
      '{"scopes":["workingset.omission.perceive"]}', 'kms://evidence/fixture',
      repeat('8', 64), 'worm://evidence/fixture', now()
    );

    INSERT INTO agent_opc_profile (
      account_id, profile_id, profile_version, name, status,
      definition_hash, canonicalization_version, compiler_version,
      approval_validation_hash, authorization_evidence_id,
      authorization_snapshot_hash, compile_threshold, max_members_per_session,
      max_nominated_members, semantic_tags, procedure_ref, revocation_policy,
      created_by, created_at
    ) VALUES (
      101, '10000000-0000-0000-0000-000000000001', 1,
      'Incident omission perception card', 'DRAFT',
      repeat('a', 64), 'jcs-v1', 'opc-perceive-1',
      NULL, '30000000-0000-0000-0000-000000000001',
      repeat('d', 64), 2, 1, 1,
      ARRAY['incident', 'omission-perception-card'],
      'proc:omission-perception-card',
      'STOP_BEFORE_PERCEIVE', 'principal:test', now()
    );

    INSERT INTO agent_opc_profile_perceive_rule (
      account_id, profile_id, profile_version, rule_id, ordinal,
      allowed_source_kinds, compile_threshold, max_members_per_session,
      max_nominated_members, require_dual_control_compile, compile_instruction
    ) VALUES (
      101, '10000000-0000-0000-0000-000000000001', 1, 'perceive-case', 1,
      ARRAY['SEALED_OMISSION_MEMBER', 'SEALED_PERCEPTION_CARD',
        'SEALED_ATTEST_CERT', 'SEALED_TOOL_READ_DECISION',
        'SEALED_PROVIDER_RECEIPT', 'SEALED_EFFECT_INTENT'],
      2, 1, 1, true,
      '{"omit_one_dropped_packet":true,"metadata_only":true,"ack_never_trust":true,"point_lookup_only":true,"no_nested_expiry":true}'
    );

    SELECT approve_agent_opc_profile(
      101,
      '10000000-0000-0000-0000-000000000001',
      1,
      repeat('a', 64),
      'principal:approver'
    );

    INSERT INTO agent_opc_member_catalog (
      account_id, member_id, source_session_id, source_certificate_id,
      source_decision_id, member_ref, source_kind, perceive_kind, gate_kind,
      gate_action, terminal_kind, placement_kind, key_lifecycle, clock_lifecycle,
      attested_key_kind, status, citation_state, membership_state, disputed_fact_hash, prior_clock_hash,
      successor_clock_hash, provider_receipt_hash, attenuation_hash,
      donor_purpose_hash, hop_count, halt_scope_hash, receipt_disposition,
      effect_observation, silence_inferred, fact_disposition, body_visibility,
      clock_disposition, metadata_trust, inlines_fact_body,
      prior_compiler_steward_a, prior_compiler_steward_b,
      perception_steward_a, perception_steward_b,
      receipt_steward_a, receipt_steward_b,
      prior_gate_steward_a, prior_gate_steward_b,
      prior_extension_steward_a, prior_extension_steward_b,
      prior_omission_steward_a, prior_omission_steward_b,
      expires_at, first_seen_at, sealed_at, created_at
    ) VALUES (
      101, '90000000-0000-0000-0000-000000000099',
      '80000000-0000-0000-0000-000000000099',
      '50000000-0000-0000-0000-000000000099',
      '51000000-0000-0000-0000-000000000099',
      'member:omitted/purpose:incident-triage',
      'SEALED_OMISSION_MEMBER', 'PERCEIVE_ATTESTED_RECEIPT', 'ALLOW_TOOL_READ',
      'TOOL_READ', 'REQUIRE_HUMAN', 'EXTENDED_HALT',
      'FIRST_ENROLLMENT', 'ATTESTED', 'AWAITING_CONFIRMATION', 'DROPPED', 'DROPPED', 'OMITTED',
      repeat('b', 64), repeat('4', 64), repeat('5', 64), repeat('7', 64),
      repeat('c', 64), repeat('9', 64), 1, repeat('4', 64),
      'ATTESTED', 'ACKED', false, 'DISPUTED_HELD', 'OMITTED', 'REARMED',
      'UNTRUSTED_METADATA', false,
      'principal:comp-a', 'principal:comp-b',
      'principal:perc-a', 'principal:perc-b',
      'principal:rcpt-a', 'principal:rcpt-b',
      'principal:gate-a', 'principal:gate-b',
      'principal:ext-a', 'principal:ext-b',
      'principal:omit-a', 'principal:omit-b',
      now() + interval '30 minutes',
      now() - interval '12 hours', now() - interval '12 hours', now()
    );

    INSERT INTO agent_opc_member_catalog (
      account_id, member_id, source_session_id, source_certificate_id,
      source_decision_id, member_ref, source_kind, perceive_kind, gate_kind,
      gate_action, terminal_kind, placement_kind, key_lifecycle, clock_lifecycle,
      attested_key_kind, status, citation_state, membership_state, disputed_fact_hash, prior_clock_hash,
      successor_clock_hash, provider_receipt_hash, attenuation_hash,
      donor_purpose_hash, hop_count, halt_scope_hash, receipt_disposition,
      effect_observation, silence_inferred, fact_disposition, body_visibility,
      clock_disposition, metadata_trust, inlines_fact_body,
      prior_compiler_steward_a, prior_compiler_steward_b,
      perception_steward_a, perception_steward_b,
      receipt_steward_a, receipt_steward_b,
      prior_gate_steward_a, prior_gate_steward_b,
      prior_extension_steward_a, prior_extension_steward_b,
      prior_omission_steward_a, prior_omission_steward_b,
      expires_at, first_seen_at, sealed_at, created_at
    ) VALUES (
      101, '91000000-0000-0000-0000-000000000088',
      '80000000-0000-0000-0000-000000000088',
      '50000000-0000-0000-0000-000000000088',
      '51000000-0000-0000-0000-000000000088',
      'member:included/attached-decoy',
      'SEALED_OMISSION_MEMBER', 'PERCEIVE_ATTESTED_RECEIPT', 'ALLOW_TOOL_READ',
      'TOOL_READ', 'REQUIRE_HUMAN', 'EXTENDED_HALT',
      'FIRST_ENROLLMENT', 'ATTESTED', 'AWAITING_CONFIRMATION', 'ATTACHED', 'ATTACHED', 'INCLUDED',
      repeat('b', 64), repeat('4', 64), repeat('5', 64), repeat('6', 64),
      repeat('c', 64), repeat('9', 64), 1, repeat('4', 64),
      'ATTESTED', 'ACKED', false, 'DISPUTED_HELD', 'ENVELOPE_ONLY', 'REARMED',
      'UNTRUSTED_METADATA', false,
      'principal:comp-a', 'principal:comp-b',
      'principal:perc-a', 'principal:perc-b',
      'principal:rcpt-a', 'principal:rcpt-b',
      'principal:gate-a', 'principal:gate-b',
      'principal:ext-a', 'principal:ext-b',
      'principal:omit-a', 'principal:omit-b',
      now() + interval '30 minutes',
      now() - interval '12 hours', now() - interval '12 hours', now()
    );

    INSERT INTO agent_opc_session (
      account_id, session_id, profile_id, profile_version, status,
      state_revision, purpose, idempotency_key, budget_nominate_units,
      budget_bind_units, budget_seal_units, budget_vector_units,
      budget_publish_units, budget_notify_units, consumed_nominate_units,
      consumed_bind_units, consumed_seal_units, consumed_vector_units,
      consumed_publish_units, consumed_notify_units,
      budget_max_wall_time_ms, compile_threshold, max_members_per_session,
      max_nominated_members, deadline_at, started_by, principal_id,
      authorization_evidence_id, delegated_scope_hash,
      authorization_revision, resource_scope_hash, created_at, updated_at
    ) VALUES (
      101, '20000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001', 1, 'OPEN', 0,
      'Perceive one omitted working-set member as a card', 'request-1',
      100, 40, 8, 5, 8, 2,
      0, 0, 0, 0, 0, 0, 60000, 2, 1, 1,
      now() + interval '1 minute',
      'principal:test', 'principal:test',
      '30000000-0000-0000-0000-000000000001',
      repeat('e', 64), 7, repeat('f', 64), now(), now()
    );

    SELECT nominate_agent_opc_member(
      101,
      '20000000-0000-0000-0000-000000000001',
      '90000000-0000-0000-0000-000000000099',
      '40000000-0000-0000-0000-000000000001',
      repeat('1', 64)
    );

    INSERT INTO agent_opc_perceive_record (
      account_id, compile_id, session_id, member_id, prior_clock_hash,
      successor_clock_hash, disputed_fact_hash, provider_receipt_hash,
      halt_scope_hash, attenuation_hash, decision_set_hash, compile_hash,
      compiled_at
    ) VALUES (
      101, '70000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000001',
      '90000000-0000-0000-0000-000000000099',
      repeat('4', 64), repeat('5', 64), repeat('b', 64), repeat('7', 64),
      repeat('4', 64), repeat('c', 64), repeat('2', 64), repeat('3', 64), now()
    );

    INSERT INTO agent_opc_card_certificate (
      account_id, certificate_id, session_id, compile_id, consumer_ref,
      purpose_hash, prior_clock_hash, successor_clock_hash, disputed_fact_hash,
      provider_receipt_hash, halt_scope_hash, attenuation_hash, decision_set_hash,
      card_steward_a, card_steward_b,
      prior_omission_steward_a, prior_omission_steward_b,
      prior_compiler_steward_a, prior_compiler_steward_b,
      perception_steward_a, perception_steward_b,
      receipt_steward_a, receipt_steward_b,
      prior_gate_steward_a, prior_gate_steward_b,
      prior_extension_steward_a, prior_extension_steward_b,
      decision_watermark, sealed_revision, sealed_at, created_at
    ) VALUES (
      101, '90000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000001',
      '70000000-0000-0000-0000-000000000001',
      'consumer:incident-agent',
      repeat('a', 64), repeat('4', 64), repeat('5', 64), repeat('b', 64),
      repeat('7', 64), repeat('4', 64), repeat('c', 64), repeat('2', 64),
      'principal:card-a', 'principal:card-b',
      'principal:omit-a', 'principal:omit-b',
      'principal:comp-a', 'principal:comp-b',
      'principal:perc-a', 'principal:perc-b',
      'principal:rcpt-a', 'principal:rcpt-b',
      'principal:gate-a', 'principal:gate-b',
      'principal:ext-a', 'principal:ext-b',
      1, 1, now(), now()
    );

    INSERT INTO agent_opc_card_decision (${decisionColumns}) VALUES (
      ${decisionValues({
        decisionId: "a0000000-0000-0000-0000-000000000099",
        ordinal: 1,
      })}
    );

    INSERT INTO agent_opc_perception_card (
      account_id, card_id, session_id, certificate_id, member_id,
      membership_state, citation_state, metadata_trust, effect_observation,
      provider_receipt_hash, disputed_fact_hash, fact_disposition,
      attested_key_kind, body_visibility, inlines_fact_body, card_hash,
      card_body, created_at
    ) VALUES (
      101, 'b0000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000001',
      '90000000-0000-0000-0000-000000000001',
      '90000000-0000-0000-0000-000000000099',
      'OMITTED', 'DROPPED', 'UNTRUSTED_METADATA', 'ACKED', repeat('7', 64), repeat('b', 64),
      'DISPUTED_HELD', 'AWAITING_CONFIRMATION', 'OMITTED',
      false, repeat('6', 64),
      '{"effectObservation":"ACKED","providerReceiptHash":"777","metadataTrust":"UNTRUSTED_METADATA","factDisposition":"DISPUTED_HELD","attestedKeyKind":"AWAITING_CONFIRMATION","bodyVisibility":"OMITTED","membershipState":"OMITTED","citationState":"DROPPED"}',
      now()
    );

    SELECT publish_agent_opc_card(
      101,
      '90000000-0000-0000-0000-000000000099',
      'b0000000-0000-0000-0000-000000000001',
      'd0000000-0000-0000-0000-000000000001'
    );
  `);

  const nominations = await database.query(
    "SELECT count(*)::int AS count FROM agent_opc_nomination WHERE account_id = 101 AND access_path = 'POINT_LOOKUP'",
  );
  if (nominations.rows[0]?.count !== 1) {
    throw new Error("point-lookup nomination was not compiled");
  }

  const members = await database.query(`
    SELECT membership_state, citation_state, effect_observation, attested_key_kind,
           fact_disposition, metadata_trust, body_visibility, inlines_fact_body,
           card_body
    FROM agent_opc_perception_card
    WHERE account_id = 101
  `);
  const member = members.rows[0];
  const body = member?.card_body ?? {};
  if (
    member?.membership_state !== "OMITTED" ||
    member?.citation_state !== "DROPPED" ||
    member?.effect_observation !== "ACKED" ||
    member?.attested_key_kind !== "AWAITING_CONFIRMATION" ||
    member?.fact_disposition !== "DISPUTED_HELD" ||
    member?.metadata_trust !== "UNTRUSTED_METADATA" ||
    member?.body_visibility !== "OMITTED" ||
    member?.inlines_fact_body !== false ||
    body.factBody !== undefined ||
    body.fact_body !== undefined
  ) {
    throw new Error("perception card did not repeat OMITTED and DROPPED without restoring trust");
  }

  const records = await database.query(`
    SELECT reason_code, effect_observation
    FROM agent_opc_publication_record
    WHERE account_id = 101
      AND member_id = '90000000-0000-0000-0000-000000000099'
  `);
  if (
    records.rows.length !== 1 ||
    records.rows[0]?.reason_code !== "MEMBER_OMITTED" ||
    records.rows[0]?.effect_observation !== "ACKED"
  ) {
    throw new Error("publication record did not cite the omitted member by point lookup");
  }

  await database.exec(`
    SELECT set_config('app.account_id', '101', true);
    SELECT reject_agent_opc_unscoped_scan(true, true);
  `);

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);
        SELECT reject_agent_opc_unscoped_scan(true, false);
      `),
    "unscoped member scan",
    "P0001",
  );

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);
        SELECT nominate_agent_opc_member(
          101,
          '20000000-0000-0000-0000-000000000001',
          NULL,
          '40000000-0000-0000-0000-000000000002',
          repeat('1', 64)
        );
      `),
    "null packet id scan",
    "P0001",
  );

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);
        SELECT nominate_agent_opc_member(
          101,
          '20000000-0000-0000-0000-000000000001',
          '91000000-0000-0000-0000-000000000088',
          '40000000-0000-0000-0000-000000000003',
          repeat('1', 64)
        );
      `),
    "nomination of an attached packet",
    "P0001",
  );

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);

        INSERT INTO agent_opc_session (
          account_id, session_id, profile_id, profile_version, status,
          state_revision, purpose, idempotency_key, budget_nominate_units,
          budget_bind_units, budget_seal_units, budget_vector_units,
          budget_publish_units, budget_notify_units,
          consumed_nominate_units, consumed_bind_units,
          consumed_seal_units, consumed_vector_units,
          consumed_publish_units, consumed_notify_units,
          budget_max_wall_time_ms, compile_threshold, max_members_per_session,
          max_nominated_members, deadline_at, started_by, principal_id,
          authorization_evidence_id, delegated_scope_hash,
          authorization_revision, resource_scope_hash, created_at, updated_at
        ) VALUES (
          101, '20000000-0000-0000-0000-000000000002',
          '10000000-0000-0000-0000-000000000001', 1, 'OPEN', 0,
          'Duplicate request', 'request-1', 100, 40, 8, 5, 8, 2,
          0, 0, 0, 0, 0, 0, 60000, 2, 1, 1,
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

        UPDATE agent_opc_profile_perceive_rule
        SET require_dual_control_compile = false
        WHERE account_id = 101
          AND profile_id = '10000000-0000-0000-0000-000000000001'
          AND profile_version = 1
          AND rule_id = 'perceive-case';
      `),
    "mutation of a sealed compile rule",
    "P0001",
  );

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);

        INSERT INTO agent_opc_profile (
          account_id, profile_id, profile_version, name, status,
          definition_hash, canonicalization_version, compiler_version,
          approval_validation_hash, authorization_evidence_id,
          authorization_snapshot_hash, compile_threshold,
          max_members_per_session, max_nominated_members, semantic_tags,
          procedure_ref, revocation_policy, created_by, created_at,
          approved_by, approved_at
        ) VALUES (
          101, '10000000-0000-0000-0000-000000000002', 1,
          'Illegal approved profile', 'APPROVED',
          repeat('b', 64), 'jcs-v1', 'opc-perceive-1',
          repeat('c', 64), '30000000-0000-0000-0000-000000000001',
          repeat('d', 64), 2, 1, 1,
          ARRAY['incident'], 'proc:illegal', 'STOP_BEFORE_PERCEIVE',
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

        UPDATE agent_opc_card_decision
        SET disputed_fact_hash = repeat('e', 64)
        WHERE account_id = 101
          AND decision_id = 'a0000000-0000-0000-0000-000000000099';
      `),
    "mutation of perception-decision identity",
    "P0001",
  );

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);

        UPDATE agent_opc_profile
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

        INSERT INTO agent_opc_effect_intent (
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

    INSERT INTO agent_opc_effect_intent (
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

        UPDATE agent_opc_effect_intent
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

        UPDATE agent_opc_profile
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
        INSERT INTO agent_opc_card_decision (${decisionColumns}) VALUES (
          ${decisionValues({
            decisionId: "c0000000-0000-0000-0000-000000000001",
            ordinal: 2,
            attestedKey: "TRUSTED_ENROLLED",
          })}
        );
      `),
    "card-as-trust fence",
    "P0001",
  );

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);
        INSERT INTO agent_opc_card_decision (${decisionColumns}) VALUES (
          ${decisionValues({
            decisionId: "c0000000-0000-0000-0000-000000000002",
            ordinal: 3,
            factDisposition: "RESTORED",
            bodyVisibility: "BODY_VISIBLE",
            membership: "INCLUDED",
          })}
        );
      `),
    "card-as-restore fence",
    "P0001",
  );

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);
        INSERT INTO agent_opc_card_decision (${decisionColumns}) VALUES (
          ${decisionValues({
            decisionId: "c0000000-0000-0000-0000-000000000003",
            ordinal: 4,
            opensNestedExpiry: "true",
          })}
        );
      `),
    "nested-expiry fence",
    "P0001",
  );

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);
        INSERT INTO agent_opc_card_decision (${decisionColumns}) VALUES (
          ${decisionValues({
            decisionId: "c0000000-0000-0000-0000-000000000004",
            ordinal: 5,
            accessPath: "MEMBER_SCAN",
          })}
        );
      `),
    "member-scan fence",
    "P0001",
  );

  await expectDatabaseRejection(
    () =>
      database.exec(`
        SELECT set_config('app.account_id', '101', true);

        INSERT INTO agent_opc_perception_card (
          account_id, card_id, session_id, certificate_id, member_id,
          membership_state, citation_state, metadata_trust, effect_observation,
          provider_receipt_hash, disputed_fact_hash, fact_disposition,
          attested_key_kind, body_visibility, inlines_fact_body, card_hash,
          card_body, created_at
        ) VALUES (
          101, 'b0000000-0000-0000-0000-000000000002',
          '20000000-0000-0000-0000-000000000001',
          '90000000-0000-0000-0000-000000000001',
          '90000000-0000-0000-0000-000000000099',
          'OMITTED', 'DROPPED', 'UNTRUSTED_METADATA', 'ACKED', repeat('7', 64), repeat('b', 64),
          'DISPUTED_HELD', 'AWAITING_CONFIRMATION', 'OMITTED',
          false, repeat('6', 64),
          '{"factBody":"the disputed sentence","effectObservation":"ACKED","metadataTrust":"UNTRUSTED_METADATA","factDisposition":"DISPUTED_HELD","attestedKeyKind":"AWAITING_CONFIRMATION","bodyVisibility":"OMITTED","membershipState":"OMITTED","citationState":"DROPPED"}',
          now()
        );
      `),
    "fact-body inline fence",
    "P0001",
  );

  const tenantCount = await database.query(
    "SELECT count(*)::int AS count FROM agent_opc_session WHERE account_id = 101",
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
        executableConstraintChecks: 16,
        tenantPoliciesChecked: tableCount,
      },
      status: "ok",
    },
    null,
    2,
  ),
);
