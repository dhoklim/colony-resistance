import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { EventService } from "../app/server/service.ts";
import { createTestDatabase } from "./helpers/d1.ts";

let database: Awaited<ReturnType<typeof createTestDatabase>>;
let db: Awaited<ReturnType<typeof createTestDatabase>>["db"];
let service: EventService;
const settings = {
  organizer: "테스트 학과",
  privacyContact: "test@example.invalid",
  retentionDays: 30,
  instagramUrl: "",
};
const register = (suffix: number) =>
  service.register(
    {
      name: `테스트 ${suffix}`,
      studentId: `2099${String(suffix).padStart(4, "0")}`,
      consent: true,
      privacyVersion: 2,
    },
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

test("a fresh event is private-data-free and cannot start without its privacy settings", async () => {
  const event = await service.getPublicEvent();
  assert.equal(event.status, "draft");
  assert.equal(event.participantCount, 0);
  await assert.rejects(() => service.start(), { status: 400 });
});

async function openEvent() {
  await service.updateSettings(settings);
  await service.start();
}

test("same-session registration retries recover the existing record; a different session cannot claim it", async () => {
  await openEvent();
  const a = await register(1);
  const b = await register(1);
  assert.equal(a.id, b.id);
  assert.equal((await service.getPublicEvent()).participantCount, 1);
  await assert.rejects(
    () =>
      service.register(
        {
          name: "다른 사람",
          studentId: "20990001",
          consent: true,
          privacyVersion: 2,
        },
        "f".repeat(64),
      ),
    { status: 409 },
  );
});

test("consent, outdated privacy text, and invalid input are rejected before registration", async () => {
  await openEvent();
  for (const input of [
    { name: "", studentId: "20990001", consent: true, privacyVersion: 2 },
    { name: "이름", studentId: "x", consent: true, privacyVersion: 2 },
    { name: "이름", studentId: "20990001", consent: false, privacyVersion: 2 },
    { name: "이름", studentId: "20990001", consent: true, privacyVersion: 1 },
  ])
    await assert.rejects(() => service.register(input, "a".repeat(64)), {
      status: 400,
    });
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
