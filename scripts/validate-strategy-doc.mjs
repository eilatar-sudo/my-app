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

function tableBody(ddl, tableName) {
  const match = ddl.match(
    new RegExp(`CREATE TABLE ${tableName} \\(([\\s\\S]*?)\\n\\);`),
  );
  if (!match) {
    throw new Error(`could not isolate CREATE TABLE ${tableName}`);
  }
  return match[1];
}

const fenceCount = markdown.match(/^```/gm)?.length ?? 0;
if (fenceCount % 2 !== 0) {
  throw new Error(`unbalanced Markdown fences: ${fenceCount}`);
}

let sectionCount = 0;
for (let section = 1; section <= 21; section += 1) {
  if (!markdown.includes(`## ${section}.`)) {
    throw new Error(`missing required section ${section}`);
  }
  sectionCount += 1;
}

for (const requiredStatement of [
  "FULL SCAN REJECTED",
  "account_id",
  "UNKNOWN_EFFECT",
  "99.99%",
  "procedural memory",
  "HNSW",
  "ACKNOWLEDGED_ACKNOWLEDGEMENT_HELD",
  "NOT_ACKNOWLEDGED_ACKNOWLEDGEMENT_CANNOT_HOLD",
  "HOLD_ACKNOWLEDGED_RECEIPT",
  "ACK_HELD_HOLD_PERCEIVED",
  "NOT_ACK_HELD_HOLD_CANNOT_PERCEIVE",
  "PERCEIVE_ACK_HELD_HOLD",
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
const queryNames = Object.keys(queryType.getFields());
const mutationNames = Object.keys(mutationType.getFields());
const expectedQueries = [
  "admittedCountCardSynopsis",
  "admittedCountCardRollup",
  "admittedCountCardProjection",
  "admittedCountCardSynopsisAudit",
];
const expectedMutations = [
  "projectAdmittedCountCard",
  "publishAdmittedCountCardSynopsis",
  "rejectAdmittedCountBoardScan",
  "rejectAdmittedCountSecondReader",
  "approveAdmittedCountCardSynopsisProfile",
  "openAdmittedCountCardSynopsisSession",
];
if (
  queryNames.length !== expectedQueries.length ||
  expectedQueries.some((name) => !queryNames.includes(name))
) {
  throw new Error(`unexpected queries: ${queryNames.join(", ")}`);
}
if (
  mutationNames.length !== expectedMutations.length ||
  expectedMutations.some((name) => !mutationNames.includes(name))
) {
  throw new Error(`unexpected mutations: ${mutationNames.join(", ")}`);
}
for (const name of [...queryNames, ...mutationNames]) {
  const field =
    queryType.getFields()[name] ?? mutationType.getFields()[name];
  if (!field.args.some((argument) => argument.name === "accountId")) {
    throw new Error(`${name} is missing accountId`);
  }
}

const synopsisFields = Object.keys(
  schema.getType("AdmittedCountCardSynopsis").getFields(),
);
const hiddenGapFields = [
  "projectedCount",
  "sealedCardCount",
  "unprojectedCardCount",
  "publishedAt",
  "watermark",
];
for (const hidden of hiddenGapFields) {
  if (synopsisFields.includes(hidden)) {
    throw new Error(
      `admittedCountCardSynopsis exposes the operator gap as ${hidden}`,
    );
  }
}
const publishArgs = mutationType
  .getFields()
  .publishAdmittedCountCardSynopsis.args.map((argument) => argument.name);
if (publishArgs.join(",") !== "accountId,utcDay") {
  throw new Error(
    `publish mutation gained arguments: ${publishArgs.join(", ")}`,
  );
}
if (markdown.includes("awaiting age") || markdown.includes("that question stays a question")) {
  throw new Error("awaiting freshness must stay the day-counter gap");
}
if (!markdown.includes("unprojected card count") || !markdown.includes("for COMPLETE rows only")) {
  throw new Error("missing the closed awaiting-freshness reading");
}

const ddlBlock = sqlBlocks.find((block) => block.includes("CREATE TYPE accs_bucket"));
const vectorBlock = sqlBlocks.find((block) =>
  block.includes("CREATE TABLE agent_accs_profile_embedding"),
);
if (!ddlBlock || !vectorBlock) {
  throw new Error("could not locate executable SQL schema blocks");
}
if (
  !/CREATE TABLE agent_accs_profile_embedding \(\n\s+account_id/.test(vectorBlock)
) {
  throw new Error("vector schema does not lead with account_id");
}
if (vectorBlock.includes("USING hnsw") || ddlBlock.includes("USING hnsw")) {
  throw new Error("reference schema must not create a cross-tenant HNSW index");
}
if (ddlBlock.includes("context_packet") || ddlBlock.includes("packet_catalog")) {
  throw new Error("synopsis schema must not store a context-packet catalog");
}
if (/\bJOIN\b/.test(ddlBlock) || ddlBlock.includes("RECURSIVE") || ddlBlock.includes("COUNT(")) {
  throw new Error("synopsis schema must not join, recurse, or count card rows");
}
if (!ddlBlock.includes("PRIMARY KEY (account_id, utc_day, bucket)")) {
  throw new Error("columnar segment is missing the tenant-day-bucket primary key");
}

const tableCount = (ddlBlock.match(/CREATE TABLE /g) ?? []).length;
const indexCount = (ddlBlock.match(/CREATE (?:UNIQUE )?INDEX /g) ?? []).length;
if (tableCount < 12) {
  throw new Error(`expected at least 12 relational tables, found ${tableCount}`);
}
if (indexCount < 8) {
  throw new Error(`expected at least 8 tenant access indexes, found ${indexCount}`);
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

for (const hiddenTable of [
  "agent_accs_projection_ledger",
  "agent_accs_day_column",
  "agent_accs_synopsis",
]) {
  const body = tableBody(ddlBlock, hiddenTable);
  if (
    body.includes("reader_principal_id") ||
    /(?<!inlines_)fact_body/.test(body)
  ) {
    throw new Error(`${hiddenTable} publishes a reader or a fact body`);
  }
}
if (tableBody(ddlBlock, "agent_accs_synopsis").includes("consumer_principal_id")) {
  throw new Error("synopsis publishes a consumer list");
}
if (tableBody(ddlBlock, "agent_accs_day_column").includes("consumer_principal_id")) {
  throw new Error("columnar segment is not narrowed to buckets");
}

const database = new PGlite({ extensions: { vector } });
let rejectionChecks = 0;

async function expectRejection(statement, reason) {
  try {
    await database.exec(statement);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes(reason)) {
      throw new Error(
        `${reason} rejected with a different error: ${message}`,
      );
    }
    rejectionChecks += 1;
    return;
  }
  throw new Error(`database accepted invalid operation: ${reason}`);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function cardInsert({
  day,
  consumer,
  cardId,
  reader = "principal:reader-1",
  shape = "ADMITTED",
  inlinesFactBody = false,
  executesTool = false,
  opensNestedExpiry = false,
  packetScanUsed = false,
  ackPromotedToTrust = false,
  attestedKeyKind = "AWAITING_CONFIRMATION",
  accessPath = "POINT_LOOKUP",
}) {
  const shapes = {
    ADMITTED: {
      holdClass: "HOLD_PERCEIVED",
      holdReason: "ACK_HELD_HOLD_PERCEIVED",
      holdRecorded: true,
      next: "PERCEIVE_ACK_HELD_HOLD",
      ackClass: "ACK_HELD",
      ackReason: "ACKNOWLEDGED_ACKNOWLEDGEMENT_HELD",
      ackRecorded: true,
      effect: "ACKED",
    },
    REFUSED: {
      holdClass: "NOT_HOLD_PERCEIVED",
      holdReason: "NOT_ACK_HELD_HOLD_CANNOT_PERCEIVE",
      holdRecorded: false,
      next: "STOP_ACK_HOLD_CARD",
      ackClass: "NOT_ACK_HELD",
      ackReason: "NOT_ACKNOWLEDGED_ACKNOWLEDGEMENT_CANNOT_HOLD",
      ackRecorded: false,
      effect: "ACKED",
    },
    OMITTED: {
      holdClass: "NOT_HOLD_PERCEIVED",
      holdReason: "NOT_ACK_HELD_HOLD_CANNOT_PERCEIVE",
      holdRecorded: false,
      next: "OMIT_ACK_HOLD_CARD",
      ackClass: "NOT_ACK_HELD",
      ackReason: "NOT_ACKNOWLEDGED_ACKNOWLEDGEMENT_CANNOT_HOLD",
      ackRecorded: false,
      effect: "UNKNOWN_EFFECT",
    },
  };
  const picked = shapes[shape];
  const flag = (value) => (value ? "TRUE" : "FALSE");
  return `
    INSERT INTO agent_accs_sealed_card (
      account_id, utc_day, consumer_principal_id, ack_hold_card_id,
      reader_principal_id, source_plane, hold_card_class, hold_card_reason,
      hold_card_recorded, trusted_next_action, ack_hold_class, ack_hold_reason,
      ack_hold_recorded, effect_observation, attested_key_kind, body_visibility,
      access_path, inlines_fact_body, executes_tool, opens_nested_expiry,
      packet_scan_used, ack_promoted_to_trust, sealed_at, created_at
    ) VALUES (
      101, DATE '${day}', '${consumer}', '${cardId}',
      '${reader}', 'ack-hold-card', '${picked.holdClass}', '${picked.holdReason}',
      ${flag(picked.holdRecorded)}, '${picked.next}', '${picked.ackClass}',
      '${picked.ackReason}', ${flag(picked.ackRecorded)}, '${picked.effect}',
      '${attestedKeyKind}', 'OMITTED', '${accessPath}',
      ${flag(inlinesFactBody)}, ${flag(executesTool)}, ${flag(opensNestedExpiry)},
      ${flag(packetScanUsed)}, ${flag(ackPromotedToTrust)},
      TIMESTAMPTZ '2026-10-26 00:00:00+00', TIMESTAMPTZ '2026-10-26 00:00:00+00'
    );
  `;
}

try {
  await database.exec("CREATE EXTENSION IF NOT EXISTS vector;");
  await database.exec(ddlBlock);
  await database.exec(vectorBlock);
  await database.exec("SELECT set_config('app.account_id', '101', false);");

  const profile = (id, hash, maxCards, budget) => `
    INSERT INTO agent_accs_profile (
      account_id, profile_id, profile_version, status, definition_hash,
      max_cards_per_day, budget_project_units, synopsis_steward_a,
      synopsis_steward_b, procedure_ref, evidence_id, created_at, approved_at
    ) VALUES (
      101, '${id}', 1, 'DRAFT', '${hash}',
      ${maxCards}, ${budget}, 'principal:accs-a', 'principal:accs-b',
      'procedure:fold-admitted-count-card-day',
      '30000000-0000-0000-0000-000000000001',
      TIMESTAMPTZ '2026-10-26 00:00:00+00', NULL
    );
  `;

  await database.exec(`
    INSERT INTO agent_accs_authorization_evidence (
      account_id, evidence_id, principal_id, evidence_digest, created_at
    ) VALUES (
      101, '30000000-0000-0000-0000-000000000001', 'principal:operator',
      repeat('b', 32), TIMESTAMPTZ '2026-10-26 00:00:00+00'
    );
    ${profile("10000000-0000-0000-0000-000000000001", "a".repeat(32), 100, 10)}
    ${profile("10000000-0000-0000-0000-000000000002", "c".repeat(32), 1, 5)}
    ${profile("10000000-0000-0000-0000-000000000003", "d".repeat(32), 100, 1)}
  `);

  await database.exec(`
    SELECT approve_agent_accs_profile(
      101, '10000000-0000-0000-0000-000000000001', 1, '${"a".repeat(32)}'
    );
    SELECT approve_agent_accs_profile(
      101, '10000000-0000-0000-0000-000000000002', 1, '${"c".repeat(32)}'
    );
    SELECT approve_agent_accs_profile(
      101, '10000000-0000-0000-0000-000000000003', 1, '${"d".repeat(32)}'
    );
    SELECT open_agent_accs_session(
      101, '20000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001', 1, 'principal:operator'
    );
    SELECT open_agent_accs_session(
      101, '20000000-0000-0000-0000-000000000002',
      '10000000-0000-0000-0000-000000000002', 1, 'principal:operator'
    );
    SELECT open_agent_accs_session(
      101, '20000000-0000-0000-0000-000000000003',
      '10000000-0000-0000-0000-000000000003', 1, 'principal:operator'
    );
  `);

  await database.exec(`
    ${cardInsert({ day: "2026-10-26", consumer: "principal:consumer-admitted-1", cardId: "40000000-0000-0000-0000-000000000001" })}
    ${cardInsert({ day: "2026-10-26", consumer: "principal:consumer-admitted-2", cardId: "40000000-0000-0000-0000-000000000002" })}
    ${cardInsert({ day: "2026-10-26", consumer: "principal:consumer-refused", cardId: "40000000-0000-0000-0000-000000000003", shape: "REFUSED" })}
    ${cardInsert({ day: "2026-10-26", consumer: "principal:consumer-omitted", cardId: "40000000-0000-0000-0000-000000000004", shape: "OMITTED" })}
    ${cardInsert({ day: "2026-10-27", consumer: "principal:consumer-await", cardId: "40000000-0000-0000-0000-000000000005" })}
    ${cardInsert({ day: "2026-10-20", consumer: "principal:consumer-over-1", cardId: "40000000-0000-0000-0000-000000000006" })}
    ${cardInsert({ day: "2026-10-20", consumer: "principal:consumer-over-2", cardId: "40000000-0000-0000-0000-000000000007" })}
    ${cardInsert({ day: "2026-10-21", consumer: "principal:consumer-budget-1", cardId: "40000000-0000-0000-0000-000000000008" })}
    ${cardInsert({ day: "2026-10-21", consumer: "principal:consumer-budget-2", cardId: "40000000-0000-0000-0000-000000000009" })}
    ${cardInsert({
      day: "2026-10-28",
      consumer: "principal:consumer-collision",
      cardId: "40000000-0000-0000-0000-000000000010",
      reader: "principal:accs-a",
    })}
  `);

  const project = (session, day, consumer) =>
    `SELECT project_agent_accs_card(101, '${session}', DATE '${day}', '${consumer}') AS bucket;`;

  const happyProjects = await database.exec(`
    ${project("20000000-0000-0000-0000-000000000001", "2026-10-26", "principal:consumer-admitted-1")}
    ${project("20000000-0000-0000-0000-000000000001", "2026-10-26", "principal:consumer-admitted-2")}
    ${project("20000000-0000-0000-0000-000000000001", "2026-10-26", "principal:consumer-refused")}
    ${project("20000000-0000-0000-0000-000000000001", "2026-10-26", "principal:consumer-omitted")}
    ${project("20000000-0000-0000-0000-000000000001", "2026-10-26", "principal:consumer-admitted-1")}
  `);
  const buckets = happyProjects.map((result) => result.rows[0]?.bucket);
  assert(
    buckets.join(",") === "ADMITTED,ADMITTED,REFUSED,OMITTED,ADMITTED",
    `happy projection buckets mismatch: ${buckets.join(",")}`,
  );

  const consumed = await database.query(
    "SELECT consumed_project_units FROM agent_accs_session WHERE account_id = 101 AND session_id = '20000000-0000-0000-0000-000000000001'",
  );
  assert(
    Number(consumed.rows[0]?.consumed_project_units) === 4,
    `replay consumed a second budget unit: ${JSON.stringify(consumed.rows[0])}`,
  );

  const firstDigest = await database.query(`
    SELECT publish_agent_accs_day_synopsis(
      101, '10000000-0000-0000-0000-000000000001', 1, DATE '2026-10-26',
      'a1000000-0000-0000-0000-000000000001'
    ) AS digest
  `);
  const secondDigest = await database.query(`
    SELECT publish_agent_accs_day_synopsis(
      101, '10000000-0000-0000-0000-000000000001', 1, DATE '2026-10-26',
      'a1000000-0000-0000-0000-000000000099'
    ) AS digest
  `);
  assert(
    firstDigest.rows[0]?.digest === secondDigest.rows[0]?.digest,
    "complete publish did not replay the same digest",
  );

  const happy = await database.query(`
    SELECT admitted_tally, refused_tally, omitted_tally, sealed_card_count,
           completeness, synopsis_class, trusted_next_action, second_reader_granted,
           inlines_fact_body, executes_tool, opens_nested_expiry, body_visibility,
           digest = accs_synopsis_digest(
             account_id, utc_day, profile_id, profile_version, completeness,
             admitted_tally, refused_tally, omitted_tally, sealed_card_count
           ) AS digest_matches
    FROM agent_accs_synopsis
    WHERE account_id = 101 AND utc_day = DATE '2026-10-26'
  `);
  const happyRow = happy.rows[0];
  assert(
    Number(happyRow?.admitted_tally) === 2 &&
      Number(happyRow?.refused_tally) === 1 &&
      Number(happyRow?.omitted_tally) === 1 &&
      Number(happyRow?.sealed_card_count) === 4 &&
      happyRow?.completeness === "COMPLETE" &&
      happyRow?.synopsis_class === "PUBLISHED" &&
      happyRow?.trusted_next_action === "READ_CARD_DAY_SYNOPSIS" &&
      happyRow?.second_reader_granted === false &&
      happyRow?.inlines_fact_body === false &&
      happyRow?.executes_tool === false &&
      happyRow?.opens_nested_expiry === false &&
      happyRow?.body_visibility === "OMITTED" &&
      happyRow?.digest_matches === true,
    `happy synopsis mismatch: ${JSON.stringify(happyRow)}`,
  );

  const rollup = await database.query(`
    SELECT bucket, tally
    FROM read_agent_accs_rollup(101, DATE '2026-10-26')
    ORDER BY bucket
  `);
  assert(
    rollup.rows.map((row) => `${row.bucket}:${Number(row.tally)}`).join(",") ===
      "ADMITTED:2,REFUSED:1,OMITTED:1",
    `rollup mismatch: ${JSON.stringify(rollup.rows)}`,
  );

  const emptyDigest = await database.query(`
    SELECT publish_agent_accs_day_synopsis(
      101, '10000000-0000-0000-0000-000000000001', 1, DATE '2026-10-01',
      'a1000000-0000-0000-0000-000000000002'
    ) AS digest
  `);
  const empty = await database.query(`
    SELECT admitted_tally, refused_tally, omitted_tally, completeness
    FROM agent_accs_synopsis
    WHERE account_id = 101 AND utc_day = DATE '2026-10-01'
  `);
  assert(
    Number(empty.rows[0]?.admitted_tally) === 0 &&
      Number(empty.rows[0]?.refused_tally) === 0 &&
      Number(empty.rows[0]?.omitted_tally) === 0 &&
      empty.rows[0]?.completeness === "COMPLETE" &&
      typeof emptyDigest.rows[0]?.digest === "string",
    `empty day mismatch: ${JSON.stringify(empty.rows[0])}`,
  );

  await database.query(`
    SELECT publish_agent_accs_day_synopsis(
      101, '10000000-0000-0000-0000-000000000001', 1, DATE '2026-10-27',
      'a1000000-0000-0000-0000-000000000003'
    )
  `);
  const awaiting = await database.query(`
    SELECT completeness, admitted_tally, trusted_next_action, projected_count
    FROM agent_accs_synopsis
    WHERE account_id = 101 AND utc_day = DATE '2026-10-27'
  `);
  const awaitingGap = await database.query(`
    SELECT sealed_card_count - projected_count AS gap
    FROM agent_accs_day_counter
    WHERE account_id = 101 AND utc_day = DATE '2026-10-27'
  `);
  assert(
    awaiting.rows[0]?.completeness === "AWAITING_PROJECTION" &&
      awaiting.rows[0]?.admitted_tally === null &&
      awaiting.rows[0]?.trusted_next_action === "AWAIT_CARD_PROJECTION" &&
      Number(awaiting.rows[0]?.projected_count) === 0 &&
      Number(awaitingGap.rows[0]?.gap) === 1,
    `awaiting synopsis mismatch: ${JSON.stringify({
      awaiting: awaiting.rows[0],
      gap: awaitingGap.rows[0],
    })}`,
  );
  const hiddenPartial = await database.query(
    "SELECT count(*)::int AS n FROM read_agent_accs_rollup(101, DATE '2026-10-27')",
  );
  assert(Number(hiddenPartial.rows[0]?.n) === 0, "awaiting day leaked a rollup");

  await database.query(
    project(
      "20000000-0000-0000-0000-000000000001",
      "2026-10-27",
      "principal:consumer-await",
    ),
  );
  const staleSnapshot = await database.query(`
    SELECT completeness, admitted_tally, projected_count
    FROM agent_accs_synopsis
    WHERE account_id = 101 AND utc_day = DATE '2026-10-27'
  `);
  const liveGap = await database.query(`
    SELECT projected_count, sealed_card_count - projected_count AS gap
    FROM agent_accs_day_counter
    WHERE account_id = 101 AND utc_day = DATE '2026-10-27'
  `);
  const stillHidden = await database.query(
    "SELECT count(*)::int AS n FROM read_agent_accs_rollup(101, DATE '2026-10-27')",
  );
  assert(
    staleSnapshot.rows[0]?.completeness === "AWAITING_PROJECTION" &&
      staleSnapshot.rows[0]?.admitted_tally === null &&
      Number(staleSnapshot.rows[0]?.projected_count) === 0 &&
      Number(liveGap.rows[0]?.projected_count) === 1 &&
      Number(liveGap.rows[0]?.gap) === 0 &&
      Number(stillHidden.rows[0]?.n) === 0,
    `live counter gap leaked into the agent snapshot: ${JSON.stringify({
      snapshot: staleSnapshot.rows[0],
      counter: liveGap.rows[0],
      rollup: stillHidden.rows[0],
    })}`,
  );
  await database.query(`
    SELECT publish_agent_accs_day_synopsis(
      101, '10000000-0000-0000-0000-000000000001', 1, DATE '2026-10-27',
      'a1000000-0000-0000-0000-000000000003'
    )
  `);
  const closedAwait = await database.query(`
    SELECT admitted_tally, refused_tally, omitted_tally, completeness
    FROM agent_accs_synopsis
    WHERE account_id = 101 AND utc_day = DATE '2026-10-27'
  `);
  assert(
    Number(closedAwait.rows[0]?.admitted_tally) === 1 &&
      Number(closedAwait.rows[0]?.refused_tally) === 0 &&
      Number(closedAwait.rows[0]?.omitted_tally) === 0 &&
      closedAwait.rows[0]?.completeness === "COMPLETE",
    `closed awaiting day mismatch: ${JSON.stringify(closedAwait.rows[0])}`,
  );

  await database.exec(`
    ${cardInsert({ day: "2026-10-02", consumer: "principal:consumer-gap-1", cardId: "40000000-0000-0000-0000-000000000020" })}
    ${cardInsert({ day: "2026-10-02", consumer: "principal:consumer-gap-2", cardId: "40000000-0000-0000-0000-000000000021" })}
  `);
  const gapDigest = await database.query(`
    SELECT publish_agent_accs_day_synopsis(
      101, '10000000-0000-0000-0000-000000000001', 1, DATE '2026-10-02',
      'a1000000-0000-0000-0000-000000000020'
    ) AS digest
  `);
  await database.query(
    project(
      "20000000-0000-0000-0000-000000000001",
      "2026-10-02",
      "principal:consumer-gap-1",
    ),
  );
  const gapReplay = await database.query(`
    SELECT publish_agent_accs_day_synopsis(
      101, '10000000-0000-0000-0000-000000000001', 1, DATE '2026-10-02',
      'a1000000-0000-0000-0000-000000000021'
    ) AS digest
  `);
  const gapSnapshot = await database.query(`
    SELECT completeness, admitted_tally, projected_count
    FROM agent_accs_synopsis
    WHERE account_id = 101 AND utc_day = DATE '2026-10-02'
  `);
  const gapCounter = await database.query(`
    SELECT projected_count, sealed_card_count - projected_count AS gap
    FROM agent_accs_day_counter
    WHERE account_id = 101 AND utc_day = DATE '2026-10-02'
  `);
  const gapRollup = await database.query(
    "SELECT count(*)::int AS n FROM read_agent_accs_rollup(101, DATE '2026-10-02')",
  );
  const gapAudits = await database.query(`
    SELECT count(*)::int AS n
    FROM agent_accs_audit_event
    WHERE account_id = 101
      AND utc_day = DATE '2026-10-02'
      AND event_kind = 'SYNOPSIS_PUBLISHED'
  `);
  assert(
    gapDigest.rows[0]?.digest === gapReplay.rows[0]?.digest &&
      gapSnapshot.rows[0]?.completeness === "AWAITING_PROJECTION" &&
      gapSnapshot.rows[0]?.admitted_tally === null &&
      Number(gapSnapshot.rows[0]?.projected_count) === 0 &&
      Number(gapCounter.rows[0]?.projected_count) === 1 &&
      Number(gapCounter.rows[0]?.gap) === 1 &&
      Number(gapRollup.rows[0]?.n) === 0 &&
      Number(gapAudits.rows[0]?.n) === 1,
    `awaiting republish refreshed the synopsis copy: ${JSON.stringify({
      snapshot: gapSnapshot.rows[0],
      counter: gapCounter.rows[0],
      audits: gapAudits.rows[0],
    })}`,
  );

  const refused = await database.query(`
    SELECT publish_agent_accs_day_synopsis(
      101, '10000000-0000-0000-0000-000000000002', 1, DATE '2026-10-20',
      'a1000000-0000-0000-0000-000000000004'
    ) AS digest
  `);
  const refusedRow = await database.query(`
    SELECT completeness, admitted_tally, trusted_next_action, sealed_card_count
    FROM agent_accs_synopsis
    WHERE account_id = 101 AND utc_day = DATE '2026-10-20'
  `);
  assert(
    refusedRow.rows[0]?.completeness === "REFUSED_OVER_BUDGET" &&
      refusedRow.rows[0]?.admitted_tally === null &&
      refusedRow.rows[0]?.trusted_next_action === "STOP_CARD_DAY_SYNOPSIS" &&
      Number(refusedRow.rows[0]?.sealed_card_count) === 2 &&
      typeof refused.rows[0]?.digest === "string",
    `over-budget synopsis mismatch: ${JSON.stringify(refusedRow.rows[0])}`,
  );

  await database.query(
    project(
      "20000000-0000-0000-0000-000000000003",
      "2026-10-21",
      "principal:consumer-budget-1",
    ),
  );
  const budgetColumn = await database.query(`
    SELECT tally FROM agent_accs_day_column
    WHERE account_id = 101 AND utc_day = DATE '2026-10-21' AND bucket = 'ADMITTED'
  `);
  await database.query(`
    SELECT publish_agent_accs_day_synopsis(
      101, '10000000-0000-0000-0000-000000000003', 1, DATE '2026-10-21',
      'a1000000-0000-0000-0000-000000000005'
    )
  `);
  const budgetSynopsis = await database.query(`
    SELECT completeness, admitted_tally
    FROM agent_accs_synopsis
    WHERE account_id = 101 AND utc_day = DATE '2026-10-21'
  `);
  const budgetGap = await database.query(`
    SELECT sealed_card_count - projected_count AS gap
    FROM agent_accs_day_counter
    WHERE account_id = 101 AND utc_day = DATE '2026-10-21'
  `);
  assert(
    Number(budgetColumn.rows[0]?.tally) === 1 &&
      budgetSynopsis.rows[0]?.completeness === "AWAITING_PROJECTION" &&
      budgetSynopsis.rows[0]?.admitted_tally === null &&
      Number(budgetGap.rows[0]?.gap) === 1,
    "partial columnar tally was published to the agent read",
  );

  const procedure = await database.query(`
    SELECT engine_executes_instruction, char_length(instruction_digest) AS hash_len
    FROM agent_accs_procedure
    WHERE account_id = 101
  `);
  assert(
    procedure.rows.length === 1 &&
      procedure.rows[0]?.engine_executes_instruction === false &&
      Number(procedure.rows[0]?.hash_len) === 32,
    `procedure memory mismatch: ${JSON.stringify(procedure.rows)}`,
  );

  const projectedEvents = await database.query(`
    SELECT count(*)::int AS n
    FROM agent_accs_audit_event
    WHERE account_id = 101
      AND utc_day = DATE '2026-10-26'
      AND event_kind = 'CARD_PROJECTED'
  `);
  const publishEvents = await database.query(`
    SELECT count(*)::int AS n
    FROM agent_accs_audit_event
    WHERE account_id = 101
      AND utc_day = DATE '2026-10-26'
      AND event_kind = 'SYNOPSIS_PUBLISHED'
  `);
  assert(
    Number(projectedEvents.rows[0]?.n) === 4 &&
      Number(publishEvents.rows[0]?.n) === 1,
    "audit chain recorded a replay",
  );

  await database.exec(`
    INSERT INTO agent_accs_profile_embedding (
      account_id, profile_id, profile_version, embedding_model, embedding_dims,
      embedding, definition_hash, source_watermark, updated_at
    ) VALUES (
      101, '10000000-0000-0000-0000-000000000001', 1,
      'reference-synopsis-tags-v1', 4, '[0.25,0.25,0.25,0.25]',
      '${"a".repeat(32)}', 'ack-hold-card-seal', TIMESTAMPTZ '2026-10-26 00:00:00+00'
    );
  `);

  await expectRejection(
    cardInsert({
      day: "2026-10-26",
      consumer: "principal:consumer-late",
      cardId: "40000000-0000-0000-0000-000000000011",
    }),
    "SYNOPSIS ALREADY SEALED",
  );
  await expectRejection(
    project(
      "20000000-0000-0000-0000-000000000002",
      "2026-10-20",
      "principal:consumer-over-1",
    ),
    "DAY OVER CARD BUDGET",
  );
  await expectRejection(
    project(
      "20000000-0000-0000-0000-000000000003",
      "2026-10-21",
      "principal:consumer-budget-2",
    ),
    "PROJECT BUDGET EXCEEDED",
  );
  await expectRejection(
    project(
      "20000000-0000-0000-0000-000000000001",
      "2026-10-28",
      "principal:consumer-collision",
    ),
    "SECOND READER REJECTED",
  );
  await expectRejection(
    "SELECT project_agent_accs_card(202, '20000000-0000-0000-0000-000000000001', DATE '2026-10-26', 'principal:consumer-admitted-1')",
    "TENANT SCOPE REJECTED",
  );
  await expectRejection(
    cardInsert({
      day: "2026-10-22",
      consumer: "principal:consumer-unsafe",
      cardId: "40000000-0000-0000-0000-000000000012",
      inlinesFactBody: true,
    }),
    "UNSAFE CARD REJECTED",
  );
  await expectRejection(
    cardInsert({
      day: "2026-10-22",
      consumer: "principal:consumer-tool",
      cardId: "40000000-0000-0000-0000-000000000013",
      executesTool: true,
    }),
    "UNSAFE CARD REJECTED",
  );
  await expectRejection(
    cardInsert({
      day: "2026-10-22",
      consumer: "principal:consumer-expiry",
      cardId: "40000000-0000-0000-0000-000000000014",
      opensNestedExpiry: true,
    }),
    "UNSAFE CARD REJECTED",
  );
  await expectRejection(
    cardInsert({
      day: "2026-10-22",
      consumer: "principal:consumer-packet",
      cardId: "40000000-0000-0000-0000-000000000015",
      packetScanUsed: true,
    }),
    "UNSAFE CARD REJECTED",
  );
  await expectRejection(
    cardInsert({
      day: "2026-10-22",
      consumer: "principal:consumer-trust",
      cardId: "40000000-0000-0000-0000-000000000016",
      ackPromotedToTrust: true,
    }),
    "UNSAFE CARD REJECTED",
  );
  await expectRejection(
    cardInsert({
      day: "2026-10-22",
      consumer: "principal:consumer-enrolled",
      cardId: "40000000-0000-0000-0000-000000000017",
      attestedKeyKind: "TRUSTED_ENROLLED",
    }),
    "TRUSTED ENROLLMENT REJECTED",
  );
  await expectRejection(
    cardInsert({
      day: "2026-10-22",
      consumer: "principal:consumer-scan",
      cardId: "40000000-0000-0000-0000-000000000018",
      accessPath: "BOARD_SCAN",
    }),
    "FULL SCAN REJECTED",
  );
  await expectRejection(
    "UPDATE agent_accs_sealed_card SET source_plane = 'ack-hold-card' WHERE account_id = 101",
    "SEALED CARD IMMUTABLE",
  );
  await expectRejection(
    `INSERT INTO agent_accs_day_column (
      account_id, utc_day, bucket, tally, updated_at
    ) VALUES (
      101, DATE '2026-10-22', 'ADMITTED', 1, TIMESTAMPTZ '2026-10-26 00:00:00+00'
    )`,
    "COLUMN TALLY REJECTED",
  );
  await expectRejection(
    `INSERT INTO agent_accs_synopsis (
      account_id, utc_day, synopsis_id, profile_id, profile_version,
      admitted_tally, refused_tally, omitted_tally, sealed_card_count,
      projected_count, max_cards_per_day, completeness, synopsis_class,
      synopsis_reason, trusted_next_action, body_visibility, access_path,
      metadata_trust, inlines_fact_body, executes_tool, opens_nested_expiry,
      packet_scan_used, second_reader_granted, synopsis_steward_a,
      synopsis_steward_b, digest, published_at
    ) VALUES (
      101, DATE '2026-10-22', 'a1000000-0000-0000-0000-000000000006',
      '10000000-0000-0000-0000-000000000001', 1,
      0, 0, 0, 0, 0, 100, 'COMPLETE', 'PUBLISHED', 'SEALED_CARDS_TALLIED',
      'READ_CARD_DAY_SYNOPSIS', 'OMITTED', 'COLUMN_PRUNE', 'UNTRUSTED_METADATA',
      FALSE, FALSE, FALSE, FALSE, FALSE, 'principal:accs-a', 'principal:accs-b',
      repeat('e', 32), TIMESTAMPTZ '2026-10-26 00:00:00+00'
    )`,
    "SYNOPSIS WRITE REJECTED",
  );

  const scanRejected = await database.query(
    "SELECT reject_agent_accs_board_scan(101, 1000000, TRUE, TRUE) AS reason",
  );
  const scanAllowed = await database.query(
    "SELECT reject_agent_accs_board_scan(101, 10, TRUE, TRUE) AS reason",
  );
  const scanUnscoped = await database.query(
    "SELECT reject_agent_accs_board_scan(101, 1, TRUE, FALSE) AS reason",
  );
  const scanRows = await database.query(
    "SELECT count(*)::int AS n FROM agent_accs_scan_rejection WHERE account_id = 101 AND reason = 'FULL SCAN REJECTED'",
  );
  assert(
    scanRejected.rows[0]?.reason === "FULL SCAN REJECTED" &&
      scanAllowed.rows[0]?.reason === null &&
      scanUnscoped.rows[0]?.reason === "FULL SCAN REJECTED" &&
      Number(scanRows.rows[0]?.n) === 2,
    `board scan gate mismatch: ${JSON.stringify({
      scanRejected: scanRejected.rows[0],
      scanAllowed: scanAllowed.rows[0],
      scanUnscoped: scanUnscoped.rows[0],
      scanRows: scanRows.rows[0],
    })}`,
  );
  rejectionChecks += 2;

  const secondReader = await database.query(
    "SELECT reject_agent_accs_second_reader(101, 'principal:reader-2') AS reason",
  );
  const secondRows = await database.query(
    "SELECT count(*)::int AS n FROM agent_accs_second_reader_rejection WHERE account_id = 101",
  );
  assert(
    secondReader.rows[0]?.reason === "SECOND READER REJECTED" &&
      Number(secondRows.rows[0]?.n) === 1,
    "second reader grant was not rejected",
  );
  rejectionChecks += 1;

  await database.exec(`
    CREATE ROLE accs_reader NOLOGIN;
    GRANT USAGE ON SCHEMA public TO accs_reader;
    GRANT SELECT ON agent_accs_synopsis TO accs_reader;
  `);
  await database.exec("SET ROLE accs_reader");
  try {
    await database.exec("SELECT set_config('app.account_id', '101', false);");
    const visible = await database.query(
      "SELECT count(*)::int AS n FROM agent_accs_synopsis",
    );
    await database.exec("SELECT set_config('app.account_id', '999', false);");
    const hidden = await database.query(
      "SELECT count(*)::int AS n FROM agent_accs_synopsis",
    );
    assert(
      Number(visible.rows[0]?.n) >= 1 && Number(hidden.rows[0]?.n) === 0,
      `tenant read isolation failed: visible ${visible.rows[0]?.n}, hidden ${hidden.rows[0]?.n}`,
    );
    await expectRejection(
      "SELECT count(*) FROM agent_accs_day_column",
      "permission denied",
    );
  } finally {
    await database.exec("RESET ROLE");
    await database.exec("SELECT set_config('app.account_id', '101', false);");
  }

  console.log(
    `status ok (${sectionCount} sections, ${typeScriptBlocks.length} TypeScript blocks, GraphQL ${queryNames.length} queries / ${mutationNames.length} mutations, ${tableCount} tables, ${indexCount} indexes, ${rejectionChecks} rejection checks)`,
  );
} finally {
  await database.close();
}
