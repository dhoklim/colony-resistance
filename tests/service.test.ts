import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { EventService } from "../app/server/service.ts";
import { createTestDatabase } from "./helpers/d1.ts";

let database: Awaited<ReturnType<typeof createTestDatabase>>;
let db: Awaited<ReturnType<typeof createTestDatabase>>["db"];
let service: EventService;
const register = (suffix: number) =>
  service.register(
    { nickname: `테스트 ${suffix}` },
    String(suffix).padStart(64, "0"),
  );

before(async () => {
  database = await createTestDatabase();
  db = database.db;
});
beforeEach(async () => {
  await db.batch(
    [
      "DELETE FROM draws",
      "DELETE FROM answers",
      "DELETE FROM participants",
      "DELETE FROM events",
      "DELETE FROM rate_limits",
    ].map((sql) => db.prepare(sql)),
  );
  service = new EventService(db);
});
after(() => database?.dispose());

test("a fresh event starts without configuration", async () => {
  const event = await service.getPublicEvent();
  assert.equal(event.status, "draft");
  assert.equal(event.participantCount, 0);
  assert.equal((await service.start()).status, "open");
});

async function openEvent() {
  await service.start();
}

test("registration retries recover one record while duplicate nicknames receive separate participant codes", async () => {
  await openEvent();
  const a = await register(1);
  const b = await register(1);
  assert.equal(a.id, b.id);
  assert.equal((await service.getPublicEvent()).participantCount, 1);
  await assert.rejects(
    () =>
      service.register(
        { nickname: "다른 사람" },
        "1".padStart(64, "0"),
      ),
    { status: 409 },
  );
  const sameNickname = await service.register(
    { nickname: "테스트 1" },
    "f".repeat(64),
  );
  assert.notEqual(a.id, sameNickname.id);
  const original = await service.getParticipant(a.id);
  const other = await service.getParticipant(sameNickname.id);
  assert.equal(original.displayName, other.displayName);
  assert.notEqual(original.code, other.code);
  assert.equal((await service.getPublicEvent()).participantCount, 2);
});

test("empty, invalid and overlong nicknames are rejected before registration", async () => {
  await openEvent();
  for (const input of [
    {},
    { nickname: "" },
    { nickname: "   " },
    { nickname: "이름\u0000" },
    { nickname: "가".repeat(41) },
    { nickname: 123 },
  ])
    await assert.rejects(() => service.register(input, "a".repeat(64)), {
      status: 400,
    });
});

test("the nickname migration preserves an ongoing event, existing sessions and saved answers", async (t) => {
  const legacy = await createTestDatabase(1);
  t.after(() => legacy.dispose());
  const id = "1234abcd-0000-4000-8000-000000000001";
  const tokenHash = "e".repeat(64);
  await legacy.db.batch([
    legacy.db.prepare("INSERT INTO events (id,status) VALUES (1,'open')"),
    legacy.db
      .prepare(
        "INSERT INTO participants (id,name,student_id,token_hash,expires_at,consent_version,created_at) VALUES (?,?,?,?,?,?,?)",
      )
      .bind(
        id,
        "기존 참가자",
        "20990001",
        tokenHash,
        Date.now() + 60000,
        1,
        new Date().toISOString(),
      ),
    legacy.db
      .prepare(
        "INSERT INTO answers (participant_id,question_id,option_index,created_at) VALUES (?,1,2,?)",
      )
      .bind(id, new Date().toISOString()),
  ]);
  await legacy.migrate();
  const upgraded = new EventService(legacy.db, true);
  assert.equal((await upgraded.getPublicEvent()).status, "open");
  assert.equal((await upgraded.getParticipantByToken(tokenHash))?.id, id);
  const participant = await upgraded.getParticipant(id);
  assert.equal(participant.code, "1234ABCD");
  assert.equal(participant.displayName, "기존 참가자");
  assert.deepEqual(participant.answers, [
    { questionId: 1, optionIndex: 2, points: 0 },
  ]);
  const columns = await legacy.db.prepare("PRAGMA table_info(participants)").all();
  assert.equal(
    columns.results.some((column: { name: string }) => column.name === "student_id"),
    false,
  );
  await upgraded.register({ nickname: "새 참가자" }, "f".repeat(64));
  assert.equal((await upgraded.getPublicEvent()).participantCount, 2);
});

test("duplicate and concurrent answer submissions count exactly once and lock the selected answer", async () => {
  await openEvent();
  const a = await register(1);
  await Promise.all([
    service.submitAnswer(a.id, 1, 0),
    service.submitAnswer(a.id, 1, 0),
  ]);
  const result = await service.getDistribution(a.id, 1);
  assert.deepEqual(result.counts, [1, 0, 0, 0]);
  await assert.rejects(() => service.submitAnswer(a.id, 1, 1), { status: 409 });
});

test("unanswered questions stay hidden and neither skip-ahead nor out-of-range submissions are accepted", async () => {
  await openEvent();
  const a = await register(1);
  await assert.rejects(() => service.getDistribution(a.id, 1), { status: 403 });
  await assert.rejects(() => service.submitAnswer(a.id, 2, 0), { status: 409 });
  await assert.rejects(() => service.submitAnswer(a.id, 1, 4), { status: 400 });
  await assert.rejects(() => service.submitAnswer(a.id, 0, 0), { status: 400 });
});

test("separate participants see shared counts and saved progress after reconnecting", async () => {
  await openEvent();
  const a = await register(1);
  const b = await register(2);
  await service.submitAnswer(a.id, 1, 0);
  await service.submitAnswer(b.id, 1, 1);
  assert.deepEqual(
    (await service.getDistribution(a.id, 1)).counts,
    [1, 1, 0, 0],
  );
  assert.equal(
    (await new EventService(db).getParticipantByToken("1".padStart(64, "0")))
      ?.id,
    a.id,
  );
  const snapshot = await service.getParticipant(a.id);
  assert.equal(snapshot.answers.length, 1);
  assert.equal(snapshot.answers[0].points, 1);
});

test("closing freezes counts, prevents new answers and registrations, and makes the score final", async () => {
  await openEvent();
  const a = await register(1);
  await service.submitAnswer(a.id, 1, 0);
  await service.close();
  await assert.rejects(() => service.submitAnswer(a.id, 2, 0), { status: 409 });
  await assert.rejects(() => register(2), { status: 409 });
  assert.equal((await service.getParticipant(a.id)).final, true);
  assert.deepEqual(
    (await service.getDistribution(a.id, 1)).counts,
    [1, 0, 0, 0],
  );
  await service.close();
  await assert.rejects(() => service.start(), { status: 409 });
});

test("an answer racing with closure is either included in the frozen totals or rejected", async () => {
  await openEvent();
  const a = await register(1);
  const [submitted] = await Promise.allSettled([
    service.submitAnswer(a.id, 1, 0),
    service.close(),
  ]);
  const snapshot = await service.getAdminSnapshot();
  const actual = snapshot.distributions[0].total;
  assert.equal(actual, submitted.status === "fulfilled" ? 1 : 0);
  assert.equal(snapshot.event.status, "closed");
});

test("only complete participants are eligible and repeat or concurrent draws keep the same winners", async () => {
  await openEvent();
  const a = await register(1);
  const b = await register(2);
  await register(3);
  for (let q = 1; q <= 10; q++) {
    await service.submitAnswer(a.id, q, 0);
    await service.submitAnswer(b.id, q, 1);
  }
  await assert.rejects(() => service.draw(), { status: 409 });
  await service.close();
  const [one, two] = await Promise.all([service.draw(), service.draw()]);
  assert.deepEqual(one, two);
  assert.equal(one.eligibleCount, 2);
  assert.equal(one.winners.length, 2);
  assert.deepEqual(
    one.winners.map((winner) => winner.score),
    [10, 10],
  );
  assert.equal((await service.getPublicEvent()).status, "drawn");
});

test("empty draws fail without changing status", async () => {
  await openEvent();
  const a = await register(1);
  await service.close();
  await assert.rejects(() => service.draw(), { status: 409 });
  assert.equal((await service.getPublicEvent()).status, "closed");
  assert.equal((await service.getParticipant(a.id)).completed, false);
});

test("rate limits reject excess requests and release them after the window", async () => {
  await service.consumeRateLimit("test", 2, 1000, 100);
  await service.consumeRateLimit("test", 2, 1000, 101);
  await assert.rejects(() => service.consumeRateLimit("test", 2, 1000, 102), {
    status: 429,
  });
  await service.consumeRateLimit("test", 2, 1000, 1101);
});
