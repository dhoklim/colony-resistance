import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { EventApi } from "../app/server/api.ts";
import { EventService } from "../app/server/service.ts";
import { createTestDatabase } from "./helpers/d1.ts";
import type {
  AdminSnapshot,
  Distribution,
  ParticipantSnapshot,
} from "../app/lib/contracts.ts";

let database: Awaited<ReturnType<typeof createTestDatabase>>;
let service: EventService;
const origin = "https://event.example";
const admin = { userId: "verified-admin", email: "admin@example.invalid" };
before(async () => {
  database = await createTestDatabase();
  service = new EventService(database.db);
});
after(() => database?.dispose());
const api = (
  identity: typeof admin | null = null,
  allow = ["admin@example.invalid"],
) =>
  new EventApi(service, {
    canonicalOrigin: origin,
    adminEmails: allow,
    getUser: async () => identity,
  });
const request = (
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
) =>
  new Request(origin + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { origin, "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

test("a public one-use event needs only nicknames and start, close and draw actions", async (t) => {
  t.after(async () => {
    await database.db.batch(
      [
        "DELETE FROM draws",
        "DELETE FROM answers",
        "DELETE FROM participants",
        "DELETE FROM events",
        "DELETE FROM rate_limits",
      ].map((sql) => database.db.prepare(sql)),
    );
  });
  const publicService = new EventService(database.db, true);
  const publicApi = new EventApi(publicService, {
    canonicalOrigin: origin,
    adminEmails: [],
    getUser: async () => null,
  });
  const snapshot = await publicApi.handle("admin", request("/api/admin"));
  assert.equal(snapshot.status, 200);
  assert.equal(
    ((await snapshot.json()) as AdminSnapshot).event.publicAdmin,
    true,
  );
  const untrusted = await publicApi.handle(
    "admin",
    request(
      "/api/admin",
      { action: "start" },
      { origin: "https://untrusted.example" },
    ),
  );
  assert.equal(untrusted.status, 403);
  assert.equal((await publicService.getPublicEvent()).status, "draft");
  const started = await publicApi.handle(
    "admin",
    request("/api/admin", { action: "start" }),
  );
  assert.equal(started.status, 200);
  const initial = await publicApi.handle(
    "participant",
    request("/api/participant"),
  );
  const cookie = initial.headers.get("set-cookie")!.split(";")[0];
  const registered = await publicApi.handle(
    "participant",
    request(
      "/api/participant",
      { nickname: "생존자" },
      { cookie },
    ),
  );
  assert.equal(registered.status, 200);
  const { participant } = (await registered.json()) as {
    participant: ParticipantSnapshot;
  };
  assert.equal(participant.displayName, "생존자");
  assert.match(participant.code, /^[A-F0-9]{8}$/);
  const csv = await publicApi.handle("export", request("/api/admin/export"));
  assert.equal(csv.status, 200);
  const exported = await csv.text();
  assert.ok(exported.includes(`"${participant.code}","생존자"`));
  assert.equal(exported.includes("학번"), false);
  await publicApi.handle("admin", request("/api/admin?action=close"));
  assert.equal((await publicService.getPublicEvent()).status, "open");
  const lobbyAnswer = await publicApi.handle("answer",
    request("/api/answer", { questionId: 1, optionIndex: 0 }, { cookie }));
  assert.equal(lobbyAnswer.status, 409);
  for (let questionId = 1; questionId <= 10; questionId++) {
    const opened = await publicApi.handle("admin", request("/api/admin", {
      action: "advance", step: questionId * 2 - 2, round: 1,
    }));
    assert.equal(opened.status, 200);
    const answered = await publicApi.handle(
      "answer",
      request("/api/answer", { questionId, optionIndex: 0 }, { cookie }),
    );
    assert.equal(answered.status, 200);
    const waiting = (await answered.json()) as {
      participant: ParticipantSnapshot;
      distribution: Distribution;
    };
    assert.equal(waiting.participant.score, null);
    assert.equal(waiting.participant.answers.at(-1)?.points, null);
    assert.deepEqual(waiting.distribution.points, []);
    assert.deepEqual(waiting.distribution.counts, []);
    assert.deepEqual(waiting.distribution.percentages, []);
    const poll = await publicApi.handle("answer", request(`/api/answer?questionId=${questionId}`, undefined, { cookie }));
    const polled = ((await poll.json()) as { distribution: Distribution }).distribution;
    assert.deepEqual(polled.counts, []);
    assert.deepEqual(polled.percentages, []);
    const adminRead = await publicApi.handle("admin", request("/api/admin"));
    const hiddenAdmin = (await adminRead.json()) as AdminSnapshot;
    assert.deepEqual(hiddenAdmin.distributions[questionId - 1].counts, []);
    assert.deepEqual(hiddenAdmin.distributions[questionId - 1].points, []);
    assert.equal(hiddenAdmin.participants[0].score, null);
    const hiddenCsv = await publicApi.handle("export", request("/api/admin/export"));
    assert.match(await hiddenCsv.text(), /"공개 대기","미공개"/);
    if (questionId < 10) {
      const tooEarly = await publicApi.handle(
        "answer",
        request("/api/answer", { questionId: questionId + 1, optionIndex: 0 }, { cookie }),
      );
      assert.equal(tooEarly.status, 409);
    }
    if (questionId === 1) {
      await publicApi.handle("admin", request("/api/admin?action=reveal&questionId=1"));
      assert.deepEqual((await publicService.getPublicEvent()).revealedQuestions, []);
      const invalidReveal = await publicApi.handle(
        "admin",
        request("/api/admin", { action: "reveal", questionId: "1", round: 1 }),
      );
      assert.equal(invalidReveal.status, 400);
    }
    const revealed = await publicApi.handle(
      "admin",
      request("/api/admin", { action: "advance", step: questionId * 2 - 1, round: 1 }),
    );
    assert.equal(revealed.status, 200);
    const visible = await publicApi.handle(
      "answer",
      request(`/api/answer?questionId=${questionId}`, undefined, { cookie }),
    );
    const shown = ((await visible.json()) as { distribution: Distribution }).distribution;
    assert.equal(shown.revealed, true);
    assert.deepEqual(shown.counts, [1, 0, 0, 0]);
    assert.deepEqual(shown.percentages, [100, 0, 0, 0]);
  }
  const completed = await publicApi.handle("participant", request("/api/participant", undefined, { cookie }));
  assert.equal(((await completed.json()) as { participant: ParticipantSnapshot }).participant.score, 0);
  const closed = await publicApi.handle(
    "admin",
    request("/api/admin", { action: "close" }),
  );
  assert.equal(closed.status, 200);
  const draw = await publicApi.handle(
    "admin",
    request("/api/admin", { action: "draw" }),
  );
  assert.equal(draw.status, 200);
  const result = (await draw.json()) as AdminSnapshot;
  assert.equal(result.draw?.winners.length, 1);
  assert.equal(result.draw?.winners[0].name, "생존자");
  assert.equal(result.draw?.winners[0].code, participant.code);
  assert.equal(Object.hasOwn(result.draw!.winners[0], "studentId"), false);
  assert.equal(Object.hasOwn(result.participants[0], "studentId"), false);
  await publicApi.handle("admin", request("/api/admin?action=reset"));
  assert.equal((await publicService.getPublicEvent()).status, "drawn");
  const invalidReset = await publicApi.handle(
    "admin",
    request("/api/admin", { action: "reset" }),
  );
  assert.equal(invalidReset.status, 400);
  const reset = await publicApi.handle(
    "admin",
    request("/api/admin", { action: "reset", round: 1 }),
  );
  assert.equal(reset.status, 200);
  const nextRound = (await reset.json()) as AdminSnapshot;
  assert.equal(nextRound.event.status, "open");
  assert.equal(nextRound.event.round, 2);
  assert.equal(nextRound.event.progressStep, 0);
  assert.deepEqual(nextRound.event.revealedQuestions, []);
  assert.equal(nextRound.event.participantCount, 0);
  assert.equal(nextRound.draw, null);
  const oldSession = await publicApi.handle(
    "participant",
    request("/api/participant", undefined, { cookie }),
  );
  assert.deepEqual(await oldSession.json(), { participant: null });
  for (const round of [1, undefined]) {
    const staleRegistration = await publicApi.handle(
      "participant",
      request("/api/participant", { nickname: "이전 화면", round }, { cookie }),
    );
    assert.equal(staleRegistration.status, 409);
  }
  assert.equal((await publicService.getPublicEvent()).participantCount, 0);
  const rejoined = await publicApi.handle(
    "participant",
    request("/api/participant", { nickname: "다시 생존자", round: 2 }, { cookie }),
  );
  assert.equal(rejoined.status, 200);
  assert.notEqual(
    ((await rejoined.json()) as { participant: ParticipantSnapshot }).participant.code,
    participant.code,
  );
  for (const round of [1, undefined]) {
    const staleAnswer = await publicApi.handle(
      "answer",
      request("/api/answer", { questionId: 1, optionIndex: 0, round }, { cookie }),
    );
    assert.equal(staleAnswer.status, 409);
  }
  const untouched = await publicApi.handle(
    "participant",
    request("/api/participant", undefined, { cookie }),
  );
  assert.deepEqual(
    ((await untouched.json()) as { participant: ParticipantSnapshot }).participant.answers,
    [],
  );
  await publicApi.handle("admin", request("/api/admin", { action: "advance", step: 0, round: 2 }));
  const newAnswer = await publicApi.handle(
    "answer",
    request("/api/answer", { questionId: 1, optionIndex: 1, round: 2 }, { cookie }),
  );
  assert.equal(newAnswer.status, 200);
  assert.deepEqual(
    ((await newAnswer.json()) as { distribution: Distribution }).distribution.counts,
    [],
  );
  const staleClose = await publicApi.handle(
    "admin",
    request("/api/admin", { action: "close", round: 1 }),
  );
  assert.equal(staleClose.status, 409);
  const staleReveal = await publicApi.handle(
    "admin",
    request("/api/admin", { action: "reveal", questionId: 1, round: 1 }),
  );
  assert.equal(staleReveal.status, 409);
  assert.equal((await publicService.getPublicEvent()).status, "open");
  const newClose = await publicApi.handle(
    "admin",
    request("/api/admin", { action: "close", round: 2 }),
  );
  assert.equal(newClose.status, 200);
  assert.equal((await publicService.getPublicEvent()).status, "closed");
});

test("admin data and exports require a verified identity even when client headers claim one", async () => {
  const forged = request("/api/admin", undefined, {
    "oai-authenticated-user-email": admin.email,
  });
  assert.equal((await api().handle("admin", forged)).status, 401);
  assert.equal(
    (await api().handle("export", request("/api/admin/export"))).status,
    401,
  );
});
test("signed-in users outside the allowlist and an empty allowlist fail closed", async () => {
  assert.equal(
    (
      await api({ ...admin, email: "other@example.invalid" }).handle(
        "admin",
        request("/api/admin"),
      )
    ).status,
    403,
  );
  assert.equal(
    (await api(admin, []).handle("admin", request("/api/admin"))).status,
    403,
  );
});
test("state-changing requests reject cross-origin and absent-origin requests", async () => {
  assert.equal(
    (
      await api(admin).handle(
        "admin",
        request(
          "/api/admin",
          { action: "start" },
          { origin: "https://attacker.example" },
        ),
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await api().handle(
        "participant",
        new Request(origin + "/api/participant", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        }),
      )
    ).status,
    403,
  );
});
test("malformed and oversized JSON return bounded client errors", async () => {
  const invalid = new Request(origin + "/api/participant", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: "{",
  });
  assert.equal((await api().handle("participant", invalid)).status, 400);
  assert.equal(
    (
      await api().handle(
        "participant",
        request("/api/participant", { nickname: "x".repeat(5000) }),
      )
    ).status,
    413,
  );
});
test("registration uses an HttpOnly session cookie and public responses omit other participants", async () => {
  await service.start();
  await service.advance(0, 1);
  const initial = await api().handle(
    "participant",
    request("/api/participant"),
  );
  const setCookie = initial.headers.get("set-cookie")!;
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Lax/);
  assert.match(setCookie, /Secure/);
  const cookie = setCookie.split(";")[0];
  const registered = await api().handle(
    "participant",
    request(
      "/api/participant",
      { nickname: "보호된이름" },
      { cookie },
    ),
  );
  assert.equal(registered.status, 200);
  const me = (await registered.json()) as { participant: ParticipantSnapshot };
  assert.equal(me.participant.displayName, "보호된이름");
  assert.equal(Object.hasOwn(me.participant, "studentId"), false);
  const publicResponse = await api().handle("event", request("/api/event"));
  const text = await publicResponse.text();
  assert.equal(text.includes("보호된이름"), false);
  assert.equal(
    publicResponse.headers.get("cache-control"),
    "private, no-store",
  );
  assert.equal(
    (
      await api().handle(
        "answer",
        request("/api/answer?questionId=1", { questionId: 1, optionIndex: 0 }),
      )
    ).status,
    401,
  );
  assert.equal(
    (
      await api().handle(
        "answer",
        request("/api/answer?questionId=1", undefined, { cookie }),
      )
    ).status,
    403,
  );
  const answer = await api().handle(
    "answer",
    request("/api/answer", { questionId: 1, optionIndex: 0 }, { cookie }),
  );
  assert.equal(answer.status, 200);
  const answered = (await answer.json()) as { distribution: Distribution };
  assert.deepEqual(answered.distribution.counts, []);
  assert.equal(answered.distribution.selectedIndex, 0);
  const restored = await api().handle(
    "participant",
    request("/api/participant", undefined, { cookie }),
  );
  assert.equal(
    ((await restored.json()) as { participant: ParticipantSnapshot })
      .participant.answers.length,
    1,
  );
});
test("admin transitions reject unknown actions and cannot be triggered through GET", async () => {
  assert.equal(
    (
      await api(admin).handle(
        "admin",
        request("/api/admin", { action: "unknown" }),
      )
    ).status,
    400,
  );
  assert.equal(
    (await api(admin).handle("admin", request("/api/admin?action=close")))
      .status,
    200,
  );
  assert.equal((await service.getPublicEvent()).status, "open");
});

test("two independent HTTP sessions finish the event, receive final scores, and preserve one draw", async () => {
  await database.db.batch(
    [
      "DELETE FROM draws",
      "DELETE FROM answers",
      "DELETE FROM participants",
      "DELETE FROM events",
      "DELETE FROM rate_limits",
    ].map((sql) => database.db.prepare(sql)),
  );
  const started = await api(admin).handle(
    "admin",
    request("/api/admin", { action: "start" }),
  );
  assert.equal(started.status, 200);
  async function enter(nickname: string) {
    const initial = await api().handle(
      "participant",
      request("/api/participant"),
    );
    const cookie = initial.headers.get("set-cookie")!.split(";")[0];
    const response = await api().handle(
      "participant",
      request(
        "/api/participant",
        { nickname },
        { cookie },
      ),
    );
    assert.equal(response.status, 200);
    return cookie;
  }
  const cookies = await Promise.all([enter("검증 A"), enter("검증 B")]);
  for (let questionId = 1; questionId <= 10; questionId++) {
    await service.advance(questionId * 2 - 2, 1);
    const responses = await Promise.all(
      cookies.map((cookie, optionIndex) =>
        api().handle(
          "answer",
          request("/api/answer", { questionId, optionIndex }, { cookie }),
        ),
      ),
    );
    for (const response of responses) assert.equal(response.status, 200);
    const revealed = await api(admin).handle(
      "admin",
      request("/api/admin", { action: "reveal", questionId, round: 1 }),
    );
    assert.equal(revealed.status, 200);
  }
  const totals = await api().handle(
    "answer",
    request("/api/answer?questionId=10", undefined, { cookie: cookies[0] }),
  );
  assert.deepEqual(
    ((await totals.json()) as { distribution: Distribution }).distribution
      .counts,
    [1, 1, 0, 0],
  );
  const closed = await api(admin).handle(
    "admin",
    request("/api/admin", { action: "close" }),
  );
  assert.equal(closed.status, 200);
  for (const cookie of cookies) {
    const response = await api().handle(
      "participant",
      request("/api/participant", undefined, { cookie }),
    );
    const { participant } = (await response.json()) as {
      participant: ParticipantSnapshot;
    };
    assert.equal(participant.completed, true);
    assert.equal(participant.final, true);
    assert.equal(participant.score, 10);
  }
  const drawResponses = await Promise.all(
    [1, 2].map(() =>
      api(admin).handle(
        "admin",
        request("/api/admin", { action: "draw" }),
      ),
    ),
  );
  const draws = await Promise.all(
    drawResponses.map(async (response) => {
      assert.equal(response.status, 200);
      return ((await response.json()) as AdminSnapshot).draw;
    }),
  );
  assert.deepEqual(draws[0], draws[1]);
  assert.equal(new Set(draws[0]!.winners.map((winner) => winner.id)).size, 2);
  const restored = await api(admin).handle("admin", request("/api/admin"));
  assert.deepEqual(((await restored.json()) as AdminSnapshot).draw, draws[0]);
});

test("GitHub Pages uses an explicit CORS origin and bearer sessions without third-party cookies", async () => {
  await database.db.batch(
    [
      "DELETE FROM draws",
      "DELETE FROM answers",
      "DELETE FROM participants",
      "DELETE FROM events",
      "DELETE FROM rate_limits",
    ].map((sql) => database.db.prepare(sql)),
  );
  await service.start();
  const pagesOrigin = "https://dhoklim.github.io";
  await service.advance(0, 1);
  const pagesApi = new EventApi(service, {
    canonicalOrigin: origin,
    participantOrigin: pagesOrigin,
    adminEmails: [admin.email],
    getUser: async () => null,
  });
  const headers = { origin: pagesOrigin, "sec-fetch-site": "cross-site" };
  const preflight = await pagesApi.handle(
    "participant",
    new Request(origin + "/api/participant", {
      method: "OPTIONS",
      headers: {
        ...headers,
        "access-control-request-method": "POST",
        "access-control-request-headers": "authorization,content-type",
      },
    }),
  );
  assert.equal(preflight.status, 204);
  assert.equal(
    preflight.headers.get("access-control-allow-origin"),
    pagesOrigin,
  );
  assert.equal(preflight.headers.get("access-control-allow-credentials"), null);
  const initial = await pagesApi.handle(
    "participant",
    request("/api/participant", undefined, headers),
  );
  const { sessionToken } = (await initial.json()) as { sessionToken: string };
  assert.match(sessionToken, /^[a-f0-9]{64}$/);
  assert.equal(initial.headers.get("set-cookie"), null);
  const authHeaders = { ...headers, authorization: `Bearer ${sessionToken}` };
  const registered = await pagesApi.handle(
    "participant",
    request(
      "/api/participant",
      { nickname: "페이지 참가자" },
      authHeaders,
    ),
  );
  assert.equal(registered.status, 200);
  const answer = await pagesApi.handle(
    "answer",
    request("/api/answer", { questionId: 1, optionIndex: 2 }, authHeaders),
  );
  assert.equal(answer.status, 200);
  assert.equal(answer.headers.get("access-control-allow-origin"), pagesOrigin);
  const resumed = await pagesApi.handle(
    "participant",
    request("/api/participant", undefined, authHeaders),
  );
  assert.equal(
    ((await resumed.json()) as { participant: ParticipantSnapshot }).participant
      .answers.length,
    1,
  );
  const other = await pagesApi.handle(
    "participant",
    request("/api/participant", undefined, headers),
  );
  assert.equal(
    ((await other.json()) as { participant: null }).participant,
    null,
  );
  const invalid = await pagesApi.handle(
    "participant",
    new Request(origin + "/api/participant", {
      method: "OPTIONS",
      headers: { origin: "https://attacker.example" },
    }),
  );
  assert.equal(invalid.status, 403);
  assert.equal(invalid.headers.get("access-control-allow-origin"), null);
  const adminPreflight = await pagesApi.handle(
    "admin",
    new Request(origin + "/api/admin", { method: "OPTIONS", headers }),
  );
  assert.equal(adminPreflight.status, 403);
  const adminPost = await pagesApi.handle(
    "admin",
    request(
      "/api/admin",
      { action: "close" },
      authHeaders,
    ),
  );
  assert.equal(adminPost.status, 403);
});
