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
          { action: "start", confirmation: "행사 시작" },
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
        request("/api/participant", { name: "x".repeat(5000) }),
      )
    ).status,
    413,
  );
});
test("registration uses an HttpOnly session cookie and public responses omit other participants", async () => {
  await service.updateSettings({
    organizer: "검증 학과",
    privacyContact: "test@example.invalid",
    retentionDays: 30,
    instagramUrl: "",
  });
  await service.start();
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
      {
        name: "보호된이름",
        studentId: "20998888",
        consent: true,
        privacyVersion: 2,
      },
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
  assert.equal(text.includes("20998888"), false);
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
  assert.deepEqual(answered.distribution.counts, [1, 0, 0, 0]);
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
test("admin transitions require an explicit confirmation and cannot be triggered through GET", async () => {
  assert.equal(
    (
      await api(admin).handle(
        "admin",
        request("/api/admin", { action: "close" }),
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
  const configured = await api(admin).handle(
    "admin",
    request("/api/admin", {
      action: "settings",
      settings: {
        organizer: "검증 학과",
        privacyContact: "test@example.invalid",
        retentionDays: 30,
        instagramUrl: "",
      },
    }),
  );
  assert.equal(configured.status, 200);
  const started = await api(admin).handle(
    "admin",
    request("/api/admin", { action: "start", confirmation: "행사 시작" }),
  );
  assert.equal(started.status, 200);
  async function enter(studentId: string) {
    const initial = await api().handle(
      "participant",
      request("/api/participant"),
    );
    const cookie = initial.headers.get("set-cookie")!.split(";")[0];
    const response = await api().handle(
      "participant",
      request(
        "/api/participant",
        {
          name: `검증 ${studentId}`,
          studentId,
          consent: true,
          privacyVersion: 2,
        },
        { cookie },
      ),
    );
    assert.equal(response.status, 200);
    return cookie;
  }
  const cookies = await Promise.all([enter("20990001"), enter("20990002")]);
  for (let questionId = 1; questionId <= 10; questionId++) {
    const responses = await Promise.all(
      cookies.map((cookie, optionIndex) =>
        api().handle(
          "answer",
          request("/api/answer", { questionId, optionIndex }, { cookie }),
        ),
      ),
    );
    for (const response of responses) assert.equal(response.status, 200);
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
    request("/api/admin", { action: "close", confirmation: "응답 마감" }),
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
        request("/api/admin", { action: "draw", confirmation: "당첨자 추첨" }),
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
