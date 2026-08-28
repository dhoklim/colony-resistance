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
    { questionId: 1, optionIndex: 2, points: null },
  ]);
  assert.equal(participant.score, null);
  assert.deepEqual((await upgraded.getPublicEvent()).revealedQuestions, []);
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
  await service.reveal(1, 1);
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
    [],
  );
  assert.equal(
    (await new EventService(db).getParticipantByToken("1".padStart(64, "0")))
      ?.id,
    a.id,
  );
  const snapshot = await service.getParticipant(a.id);
  assert.equal(snapshot.answers.length, 1);
  assert.equal(snapshot.answers[0].points, null);
  await service.reveal(1, 1);
  assert.deepEqual((await service.getDistribution(a.id, 1)).counts, [1, 1, 0, 0]);
  assert.equal((await service.getParticipant(a.id)).answers[0].points, 1);
});

test("answers wait for their question's reveal before showing points or advancing", async () => {
  await openEvent();
  const a = await register(1);
  const b = await register(2);
  const first = await service.submitAnswer(a.id, 1, 0);
  await service.submitAnswer(b.id, 1, 1);
  assert.deepEqual(first.points, []);
  assert.deepEqual(first.counts, []);
  assert.deepEqual(first.percentages, []);
  assert.equal(first.revealed, false);
  const refreshed = await new EventService(db).getDistribution(a.id, 1);
  assert.deepEqual(refreshed.counts, []);
  assert.deepEqual(refreshed.percentages, []);
  assert.equal(refreshed.total, 2);
  const hidden = await service.getParticipant(a.id);
  assert.equal(hidden.answers[0].points, null);
  assert.equal(hidden.score, null);
  await assert.rejects(() => service.submitAnswer(a.id, 2, 0), { status: 409 });
  await service.reveal(1, 1);
  const visible = await new EventService(db).getDistribution(a.id, 1);
  assert.equal(visible.revealed, true);
  assert.deepEqual(visible.counts, [1, 1, 0, 0]);
  assert.deepEqual(visible.percentages, [50, 50, 0, 0]);
  assert.deepEqual(visible.points, [1, 1, 5, 5]);
  const second = await service.submitAnswer(a.id, 2, 0);
  assert.equal(second.revealed, false);
  assert.deepEqual(second.points, []);
  await service.close();
  const closed = await service.getDistribution(a.id, 2);
  assert.equal(closed.revealed, false);
  assert.deepEqual(closed.counts, []);
  assert.deepEqual(closed.percentages, []);
  assert.equal((await service.getParticipant(a.id)).score, null);
  await service.reveal(2, 1);
  assert.equal((await service.getParticipant(a.id)).answers[1].points, 0);
});

test("admin views and CSV cannot disclose unreleased results, even after closing", async () => {
  await openEvent();
  const a = await register(1);
  const b = await register(2);
  await service.submitAnswer(a.id, 1, 0);
  await service.submitAnswer(b.id, 1, 1);
  for (const final of [false, true]) {
    if (final) await service.close(1);
    const snapshot = await new EventService(db, true).getAdminSnapshot();
    assert.deepEqual(snapshot.distributions[0], {
      questionId: 1, counts: [], total: 2, points: [],
    });
    assert.ok(snapshot.distributions.every((question) => question.counts.length === 0 && question.points.length === 0));
    assert.ok(snapshot.participants.every((person) => person.score === null));
    assert.match(await service.exportCsv(), /"1","공개 대기","미공개"/);
  }
  await service.reveal(1, 1);
  const partial = await service.getAdminSnapshot();
  assert.deepEqual(partial.distributions[0].counts, [1, 1, 0, 0]);
  assert.deepEqual(partial.distributions[0].points, [1, 1, 5, 5]);
  assert.deepEqual(partial.distributions[1].points, []);
  assert.ok(partial.participants.every((person) => person.score === null));
  for (let questionId = 2; questionId <= 10; questionId++) await service.reveal(questionId, 1);
  const publicScores = await service.getAdminSnapshot();
  assert.deepEqual(publicScores.participants.map((person) => person.score), [1, 1]);
  assert.match(await service.exportCsv(), /"1","1","확정"/);
});

test("drawing cannot disclose the last unreleased score", async () => {
  await openEvent();
  const a = await register(1);
  for (let questionId = 1; questionId <= 10; questionId++) {
    await service.submitAnswer(a.id, questionId, 0);
    if (questionId < 10) await service.reveal(questionId, 1);
  }
  await service.close(1);
  await assert.rejects(() => service.draw(1), { status: 409 });
  assert.equal((await service.getAdminSnapshot()).draw, null);
  await service.reveal(10, 1);
  const draw = await service.draw(1);
  assert.equal(draw.winners[0].score, 0);
  // A legacy saved draw must not expose scores when its release flags are absent.
  await db.prepare("UPDATE events SET revealed_questions = 0 WHERE id = 1").run();
  assert.equal((await service.getAdminSnapshot()).draw, null);
});

for (const surface of ["participant", "distribution", "admin", "CSV"] as const) {
  test(`a reset during ${surface} reads cannot apply old reveals to new answers`, async () => {
    await openEvent();
    const previous = await register(1);
    await service.submitAnswer(previous.id, 1, 0);
    for (let questionId = 1; questionId <= 10; questionId++) await service.reveal(questionId, 1);
    let resetTriggered = false;
    const racing = new EventService({
      prepare(sql: string) {
        const statement = db.prepare(sql);
        return new Proxy(statement, {
          get(target, key, receiver) {
            if (key === "all" && sql.startsWith("SELECT question_id AS questionId")) {
              return async (...args: unknown[]) => {
                if (!resetTriggered) {
                  resetTriggered = true;
                  await service.reset(1);
                  const next = await register(2);
                  await service.submitAnswer(next.id, 1, 1, 2);
                }
                return Reflect.apply(target.all, target, args);
              };
            }
            const value = Reflect.get(target, key, receiver);
            return typeof value === "function" ? value.bind(target) : value;
          },
        });
      },
      batch: db.batch.bind(db),
    }, true);
    const read = {
      participant: () => racing.getParticipant(previous.id),
      distribution: () => racing.getDistribution(previous.id, 1),
      admin: () => racing.getAdminSnapshot(),
      CSV: () => racing.exportCsv(),
    }[surface];
    await assert.rejects(read, { status: 409 });
    assert.equal(resetTriggered, true);
    assert.deepEqual((await service.getPublicEvent()).revealedQuestions, []);
  });
}

test("reveals persist independently, validate their target, and reset with the round", async () => {
  await assert.rejects(() => service.reveal(1, 1), { status: 409 });
  await openEvent();
  for (const questionId of [0, 11, 1.5])
    await assert.rejects(() => service.reveal(questionId, 1), { status: 400 });
  await Promise.all([service.reveal(1, 1), service.reveal(2, 1), service.reveal(1, 1)]);
  assert.deepEqual((await new EventService(db).getPublicEvent()).revealedQuestions, [1, 2]);
  await Promise.allSettled([service.reveal(3, 1), service.reset(1)]);
  assert.deepEqual((await service.getPublicEvent()).revealedQuestions, []);
  await assert.rejects(() => service.reveal(1, 1), { status: 409 });
  await service.reveal(1, 2);
  assert.deepEqual((await service.getPublicEvent()).revealedQuestions, [1]);
});

test("closing freezes counts, prevents new answers and registrations, and makes the score final", async () => {
  await openEvent();
  const a = await register(1);
  await service.submitAnswer(a.id, 1, 0);
  await service.close();
  await assert.rejects(() => service.submitAnswer(a.id, 2, 0), { status: 409 });
  await assert.rejects(() => register(2), { status: 409 });
  assert.equal((await service.getParticipant(a.id)).final, true);
  await service.reveal(1, 1);
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
    await service.reveal(q, 1);
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

test("reset clears a finished event and lets the same browser participate in a fresh round", async () => {
  await openEvent();
  assert.equal((await service.getPublicEvent()).round, 1);
  const previous = await register(1);
  for (let questionId = 1; questionId <= 10; questionId++) {
    await service.submitAnswer(previous.id, questionId, 0);
    await service.reveal(questionId, 1);
  }
  await service.close();
  await service.draw();
  await service.reset(1);
  const restarted = await service.getAdminSnapshot();
  assert.equal(restarted.event.status, "open");
  assert.equal(restarted.event.round, 2);
  assert.deepEqual(restarted.event.revealedQuestions, []);
  assert.equal(restarted.event.closedAt, null);
  assert.equal(restarted.event.participantCount, 0);
  assert.equal(restarted.event.completedCount, 0);
  assert.equal(restarted.draw, null);
  assert.deepEqual(restarted.participants, []);
  assert.ok(restarted.distributions.every((question) => question.total === 0));
  assert.equal(await service.getParticipantByToken("1".padStart(64, "0")), null);
  const next = await register(1);
  assert.notEqual(next.id, previous.id);
  const answer = await service.submitAnswer(next.id, 1, 2);
  assert.deepEqual(answer.counts, []);
  assert.equal(answer.final, false);
  await service.reveal(1, 2);
  assert.deepEqual((await service.getDistribution(next.id, 1)).counts, [0, 0, 1, 0]);
  for (let questionId = 2; questionId <= 10; questionId++) {
    await service.submitAnswer(next.id, questionId, 2);
    await service.reveal(questionId, 2);
  }
  await service.close(2);
  const secondDraw = await service.draw(2);
  assert.deepEqual(secondDraw.winners.map((winner) => winner.id), [next.id]);
});

test("duplicate resets and stale controls cannot clear or close the new round", async () => {
  await openEvent();
  assert.equal((await service.getPublicEvent()).round, 1);
  const previous = await register(1);
  await service.submitAnswer(previous.id, 1, 0);
  await Promise.allSettled([service.close(1), service.reset(1)]);
  assert.equal((await service.getPublicEvent()).status, "open");
  const next = await register(1);
  await service.submitAnswer(next.id, 1, 2);
  await Promise.all([service.reset(1), service.reset(1)]);
  assert.equal((await service.getPublicEvent()).round, 2);
  assert.equal((await service.getPublicEvent()).participantCount, 1);
  assert.deepEqual((await service.getDistribution(next.id, 1)).counts, []);
  assert.deepEqual((await service.getParticipant(next.id)).answers, [{ questionId: 1, optionIndex: 2, points: null }]);
  await assert.rejects(() => service.close(1), { status: 409 });
  await assert.rejects(() => service.draw(1), { status: 409 });
  await assert.rejects(() => service.reset(0), { status: 400 });
  await assert.rejects(() => service.reset(3), { status: 409 });
  await Promise.all([service.reset(2), service.reset(2)]);
  assert.equal((await service.getPublicEvent()).round, 3);
  assert.equal((await service.getPublicEvent()).participantCount, 0);
});

test("rate limits reject excess requests and release them after the window", async () => {
  await service.consumeRateLimit("test", 2, 1000, 100);
  await service.consumeRateLimit("test", 2, 1000, 101);
  await assert.rejects(() => service.consumeRateLimit("test", 2, 1000, 102), {
    status: 429,
  });
  await service.consumeRateLimit("test", 2, 1000, 1101);
});
