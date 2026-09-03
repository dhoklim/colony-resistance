import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Home from "../app/page.tsx";
import { Completion } from "../app/components/completion.tsx";
import { QuestionStage } from "../app/components/question-stage.tsx";
import AdminDashboard from "../app/components/admin-dashboard.tsx";
import { questions } from "../app/lib/questions.ts";
import { JSDOM } from "jsdom";
import { createApiClient } from "../app/lib/client.ts";
import type {
  AdminSnapshot,
  Distribution,
  ParticipantSnapshot,
  PublicEvent,
} from "../app/lib/contracts.ts";

test("the event introduction provides a participant entry link", () => {
  const html = renderToStaticMarkup(<Home />);
  assert.match(html, /<a[^>]+href="\/participate"[^>]*>/);
});

test("an unreleased answer hides ratios, bars and points even if a stale response includes them", () => {
  const distribution: Distribution = {
    round: 1,
    questionId: 1, counts: [1, 2, 3, 4], total: 10,
    percentages: [10, 20, 30, 40], points: [5, 3, 1, 0],
    revealed: false, selectedIndex: 0, final: false,
    updatedAt: "2026-08-28T00:00:00Z",
  };
  const render = () => new JSDOM(renderToStaticMarkup(
    <QuestionStage question={questions[0]} selection={0} distribution={distribution}
      pending={false} onSelect={() => {}} onSubmit={async () => {}} />,
  ));
  const hidden = render();
  assert.equal(hidden.window.document.querySelector(".option-percentage, .option-fill, .chosen-ratio, .earned-points strong"), null);
  assert.equal(hidden.window.document.body.textContent?.includes("%"), false);
  assert.equal(hidden.window.document.querySelector("button"), null);
  hidden.window.close();
  distribution.revealed = true;
  const visible = render();
  assert.equal(visible.window.document.querySelectorAll(".option-percentage").length, 4);
  assert.match(visible.window.document.querySelector(".earned-points")?.textContent ?? "", /\+5/);
  assert.equal(visible.window.document.querySelector("button"), null);
  visible.window.close();
});

test("the public operator page also hides unreleased distributions and totals", () => {
  const initial: AdminSnapshot = {
    event: {
      status: "open", round: 1, progressStep: 1, revealedQuestions: [], publicAdmin: true,
      settings: { organizer: "", privacyContact: "", retentionDays: 0, instagramUrl: "" },
      participantCount: 1, completedCount: 0, closedAt: null, privacyVersion: 2,
    },
    distributions: [{ questionId: 1, counts: [1, 2, 3, 4], total: 10, points: [5, 3, 1, 0] }],
    participants: [{ id: "test", name: "테스트", code: "TEST0001", completed: false,
      answeredCount: 1, score: 5, registeredAt: "2026-08-28T00:00:00Z" }],
    page: 1, pageSize: 50, totalPages: 1, draw: null,
  };
  const render = () => new JSDOM(renderToStaticMarkup(<AdminDashboard initial={initial} exportUrl="https://event.example/api/admin/export" />));
  const hidden = render();
  assert.equal(hidden.window.document.querySelector('a[href="https://event.example/api/admin/export"]')?.textContent?.includes("CSV"), true);
  assert.equal(hidden.window.document.querySelector(".aggregate-bar, .aggregate-label b"), null);
  assert.match(hidden.window.document.querySelector(".table-score")?.textContent ?? "", /공개 대기/);
  assert.match(hidden.window.document.querySelector(".aggregate-question")?.textContent ?? "", /10명 응답/);
  hidden.window.close();
  initial.event.revealedQuestions = [1];
  const partial = render();
  assert.equal(partial.window.document.querySelectorAll(".aggregate-bar").length, 4);
  assert.match(partial.window.document.querySelector(".table-score")?.textContent ?? "", /공개 대기/);
  partial.window.close();
  initial.event.revealedQuestions = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const complete = render();
  assert.match(complete.window.document.querySelector(".table-score")?.textContent ?? "", /5.*50/);
  complete.window.close();
});

test("the operator screen follows the published question, including the lobby and final result", () => {
  const initial: AdminSnapshot = {
    event: { status: "open", round: 1, progressStep: 0, revealedQuestions: [], publicAdmin: true,
      settings: { organizer: "", privacyContact: "", retentionDays: 0, instagramUrl: "" },
      participantCount: 10, completedCount: 0, closedAt: null, privacyVersion: 2 },
    distributions: questions.map((question) => ({ questionId: question.id, total: 10,
      counts: [1, 2, 3, 4], points: [5, 3, 1, 0] })),
    participants: [], page: 1, pageSize: 50, totalPages: 1, draw: null,
  };
  for (const [step, questionId] of [[0, null], [1, 1], [2, 1], [3, 2], [17, 9], [19, 10], [20, 10]] as const) {
    initial.event.progressStep = step;
    const dom = new JSDOM(renderToStaticMarkup(<AdminDashboard initial={initial} />));
    try {
      const screen = dom.window.document.querySelector('[aria-label="스크린 문제"]');
      assert.ok(screen, "The operator dashboard needs a screen-facing question area.");
      assert.equal(screen.querySelectorAll("button, input").length, 0, "Answers are still submitted on phones.");
      if (questionId === null) {
        assert.equal(screen.querySelectorAll(".screen-option").length, 0);
        for (const question of questions) assert.equal(screen.textContent?.includes(question.prompt), false);
      } else {
        assert.equal(screen.querySelector("h2")?.textContent, questions[questionId - 1].prompt);
        assert.deepEqual(Array.from(screen.querySelectorAll(".screen-option-text"), (item) => item.textContent),
          [...questions[questionId - 1].options]);
      }
      const main = dom.window.document.querySelector("main")!;
      assert.ok(Array.from(main.children).indexOf(screen.closest(".reveal-panel")!) <
        Array.from(main.children).indexOf(main.querySelector(".admin-stats")!));
    } finally {
      dom.window.close();
    }
  }
});

test("the operator screen shows percentages and points only for an explicitly released current result", () => {
  const initial: AdminSnapshot = {
    event: { status: "open", round: 1, progressStep: 1, revealedQuestions: [], publicAdmin: true,
      settings: { organizer: "", privacyContact: "", retentionDays: 0, instagramUrl: "" },
      participantCount: 10, completedCount: 0, closedAt: null, privacyVersion: 2 },
    distributions: [{ questionId: 1, counts: [1, 2, 3, 4], total: 10, points: [5, 3, 1, 0] },
      { questionId: 2, counts: [4, 3, 2, 1], total: 10, points: [0, 1, 3, 5] }],
    participants: [], page: 1, pageSize: 50, totalPages: 1, draw: null,
  };
  for (const state of [
    { step: 1, revealed: [], ratios: [], points: [] },
    { step: 1, revealed: [1], ratios: [], points: [] },
    { step: 2, revealed: [], ratios: [], points: [] },
    { step: 2, revealed: [1], ratios: ["10%", "20%", "30%", "40%"], points: ["5", "3", "1", "0"] },
    { step: 3, revealed: [1], ratios: [], points: [] },
    { step: 4, revealed: [1, 2], ratios: ["40%", "30%", "20%", "10%"], points: ["0", "1", "3", "5"] },
  ]) {
    initial.event.progressStep = state.step;
    initial.event.revealedQuestions = state.revealed;
    const dom = new JSDOM(renderToStaticMarkup(<AdminDashboard initial={initial} />));
    try {
      const screen = dom.window.document.querySelector('[aria-label="스크린 문제"]');
      assert.ok(screen);
      assert.deepEqual(Array.from(screen.querySelectorAll(".screen-option-percentage"), (item) => item.textContent), state.ratios);
      assert.deepEqual(Array.from(screen.querySelectorAll(".screen-option-points b"), (item) => item.textContent), state.points);
      assert.equal(screen.querySelectorAll(".screen-option-fill").length, state.ratios.length);
    } finally {
      dom.window.close();
    }
  }
  initial.event.status = "closed";
  initial.event.progressStep = 2;
  initial.event.revealedQuestions = [1];
  initial.distributions[0] = { questionId: 1, total: 0, counts: [0, 0, 0, 0], points: [5, 5, 5, 5] };
  const empty = new JSDOM(renderToStaticMarkup(<AdminDashboard initial={initial} />));
  const screen = empty.window.document.querySelector('[aria-label="스크린 문제"]')!;
  assert.deepEqual(Array.from(screen.querySelectorAll(".screen-option-percentage"), (item) => item.textContent), ["0%", "0%", "0%", "0%"]);
  assert.equal(screen.querySelectorAll(".screen-option-points").length, 0);
  empty.window.close();
});

test("a completed participant sees only revealed answer points until all ten scores are public", () => {
  const event: PublicEvent = {
    status: "closed", round: 1, progressStep: 2, revealedQuestions: [1],
    settings: { organizer: "", privacyContact: "", retentionDays: 0, instagramUrl: "" },
    participantCount: 1, completedCount: 1, closedAt: "2026-08-28T00:00:00Z",
    privacyVersion: 2, publicAdmin: true,
  };
  const participant: ParticipantSnapshot = {
    round: 1,
    displayName: "테스트", code: "TEST0001", completed: true, final: true, score: 50,
    answers: Array.from({ length: 10 }, (_, index) => ({
      questionId: index + 1, optionIndex: 0, points: 5,
    })),
  };
  const hidden = new JSDOM(renderToStaticMarkup(<Completion participant={participant} event={event} />));
  assert.match(hidden.window.document.body.textContent ?? "", /총점 공개 대기 중/);
  assert.equal(hidden.window.document.querySelector('[aria-label="군체 저항도"]') === null, true);
  assert.equal(hidden.window.document.querySelectorAll(".review-row b").length, 1);
  hidden.window.close();
  participant.score = 50;
  participant.answers.forEach((answer) => { answer.points = 5; });
  event.revealedQuestions = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const shown = new JSDOM(renderToStaticMarkup(<Completion participant={participant} event={event} />));
  assert.match(shown.window.document.querySelector('[aria-label="군체 저항도"]')?.textContent ?? "", /50.*50/);
  assert.equal(shown.window.document.querySelectorAll(".review-row b").length, 10);
  shown.window.close();
});

test("the Pages client persists an opaque session and sends it only to the configured API without cookies", async (t) => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
  const token = "a".repeat(64);
  const calls: { url: string; init?: RequestInit }[] = [];
  t.mock.method(
    globalThis,
    "fetch",
    async (url: unknown, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return Response.json({
        participant: null,
        ...(calls.length === 1 ? { sessionToken: token } : {}),
      });
    },
  );
  const client = createApiClient("https://event.example", storage);
  await client("/api/participant");
  const resumed = createApiClient("https://event.example", storage);
  await resumed("/api/answer", { questionId: 1, optionIndex: 0 });
  assert.equal(calls[0].url, "https://event.example/api/participant");
  assert.equal(calls[1].init?.credentials, "omit");
  assert.equal(
    new Headers(calls[1].init?.headers).get("authorization"),
    `Bearer ${token}`,
  );
  assert.equal(values.size, 1);
});

test("a delayed bootstrap in another tab preserves and resumes the registered session", async (t) => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
  const firstToken = "a".repeat(64);
  const delayedToken = "b".repeat(64);
  const pending: ((response: Response) => void)[] = [];
  const participant = { code: "TEST0001", displayName: "테스트" };
  let registered = false;
  t.mock.method(globalThis, "fetch", (_url: unknown, init?: RequestInit) => {
    const authorization = new Headers(init?.headers).get("authorization");
    if (!authorization)
      return new Promise<Response>((resolve) => pending.push(resolve));
    if (authorization === `Bearer ${firstToken}`) {
      if (init?.method === "POST") registered = true;
      return Promise.resolve(
        Response.json({ participant: registered ? participant : null }),
      );
    }
    return Promise.resolve(Response.json({ participant: null }));
  });
  const firstTab = createApiClient("https://event.example", storage);
  const secondTab = createApiClient("https://event.example", storage);
  const firstBootstrap = firstTab("/api/participant");
  const delayedBootstrap = secondTab("/api/participant");
  assert.equal(pending.length, 2);
  pending[0](Response.json({ participant: null, sessionToken: firstToken }));
  await firstBootstrap;
  await firstTab("/api/participant", { displayName: "테스트" });
  pending[1](Response.json({ participant: null, sessionToken: delayedToken }));
  assert.deepEqual(await delayedBootstrap, { participant });
  assert.equal(values.get("colony-session:https://event.example"), firstToken);
  assert.deepEqual(await firstTab("/api/participant"), { participant });
});

test("the public Pages operator client does not depend on participant storage or credentials", async (t) => {
  const calls: { url: string; init?: RequestInit }[] = [];
  t.mock.method(globalThis, "fetch", async (url: unknown, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return Response.json({ ok: true });
  });
  const client = createApiClient("https://event.example", {
    getItem() { throw new Error("participant storage is blocked"); },
    setItem() { throw new Error("participant storage is blocked"); },
  });
  await client("/api/admin?page=1");
  await client("/api/admin", { action: "advance", step: 0, round: 1 });
  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.ok(call.url.startsWith("https://event.example/api/admin"));
    assert.equal(call.init?.credentials, "omit");
    assert.equal(new Headers(call.init?.headers).get("authorization"), null);
  }
});

test("the GitHub admin hash route loads, retries, controls the event and survives a refresh", async (t) => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "https://dhoklim.github.io/colony-resistance/#/admin", pretendToBeVisual: true,
  });
  const properties: Record<string, unknown> = {
    window: dom.window, self: dom.window, document: dom.window.document,
    navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, Node: dom.window.Node,
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  const originals = Object.fromEntries(Object.keys(properties).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(properties))
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  dom.window.scrollTo = () => {};
  const { render, fireEvent, waitFor, cleanup, act } = await import("@testing-library/react");
  t.after(async () => {
    await act(async () => { cleanup(); });
    dom.window.close();
    for (const key of Object.keys(properties)) {
      if (originals[key]) Object.defineProperty(globalThis, key, originals[key]!);
      else Reflect.deleteProperty(globalThis, key);
    }
  });
  const snapshot: AdminSnapshot = {
    event: { status: "open", round: 7, progressStep: 0, revealedQuestions: [], publicAdmin: true,
      settings: { organizer: "", privacyContact: "", retentionDays: 0, instagramUrl: "" },
      participantCount: 0, completedCount: 0, closedAt: null, privacyVersion: 2 },
    distributions: [], participants: [], page: 1, pageSize: 50, totalPages: 1, draw: null,
  };
  let failed = false;
  t.mock.method(globalThis, "fetch", async (url: unknown, init?: RequestInit) => {
    assert.ok(String(url).startsWith("/api/admin"));
    if (!failed) {
      failed = true;
      return Response.json({ error: "잠시 후 다시 연결해 주세요." }, { status: 503 });
    }
    if (init?.method === "POST") {
      assert.deepEqual(JSON.parse(String(init.body)), { action: "advance", step: 0, round: 7 });
      snapshot.event.progressStep = 1;
    }
    return Response.json(snapshot);
  });
  const { default: PagesApp } = await import("../github-pages/app.tsx");
  const { default: PagesLink } = await import("../github-pages/link.tsx");
  const link = new JSDOM(renderToStaticMarkup(<PagesLink href="/admin">운영자</PagesLink>));
  assert.match(link.window.document.querySelector("a")!.getAttribute("href")!, /#\/admin$/);
  link.window.close();
  let view = render(<PagesApp />);
  await view.findByText("잠시 후 다시 연결해 주세요.");
  fireEvent.click(view.getByRole("button", { name: "다시 연결하기" }));
  await view.findByRole("heading", { name: "이벤트 운영실." });
  await waitFor(() => assert.equal(dom.window.document.title, "이벤트 운영실 | 군체 저항도"));
  await waitFor(() => assert.equal((view.getByLabelText("참여 주소") as HTMLInputElement).value,
    "https://dhoklim.github.io/colony-resistance/#/participate"));
  fireEvent.click(view.getByRole("button", { name: "1번 문제 공개" }));
  await view.findByRole("button", { name: "1번 결과 공개" });
  assert.ok(view.getByRole("region", { name: "스크린 문제" }).textContent?.includes(questions[0].prompt));
  view.unmount();
  view = render(<PagesApp />);
  await view.findByRole("button", { name: "1번 결과 공개" });
  assert.ok(view.getByRole("region", { name: "스크린 문제" }).textContent?.includes(questions[0].prompt));
});

test("operators start without setup and close with a simple retryable confirmation", async (t) => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "https://event.example/",
    pretendToBeVisual: true,
  });
  const properties: Record<string, unknown> = {
    window: dom.window,
    self: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement,
    Node: dom.window.Node,
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  const originals = Object.fromEntries(
    Object.keys(properties).map((key) => [
      key,
      Object.getOwnPropertyDescriptor(globalThis, key),
    ]),
  );
  for (const [key, value] of Object.entries(properties))
    Object.defineProperty(globalThis, key, {
      value,
      configurable: true,
      writable: true,
    });
  const { render, fireEvent, cleanup, act } =
    await import("@testing-library/react");
  t.after(async () => {
    // Flush framework-scheduled work before removing the browser globals.
    await act(async () => {
      cleanup();
    });
    dom.window.close();
    for (const key of Object.keys(properties)) {
      const original = originals[key];
      if (original) Object.defineProperty(globalThis, key, original);
      else Reflect.deleteProperty(globalThis, key);
    }
  });
  const initial: AdminSnapshot = {
    event: {
      status: "draft",
      round: 1,
      progressStep: 0,
      revealedQuestions: [],
      settings: {
        organizer: "",
        privacyContact: "",
        retentionDays: 0,
        instagramUrl: "",
      },
      participantCount: 0,
      completedCount: 0,
      closedAt: null,
      privacyVersion: 2,
      publicAdmin: true,
    },
    distributions: [],
    participants: [],
    page: 1,
    pageSize: 50,
    totalPages: 1,
    draw: null,
  };
  const requests: unknown[] = [];
  let current = initial;
  t.mock.method(
    globalThis,
    "fetch",
    async (_input: unknown, init?: RequestInit) => {
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        requests.push(body);
        if (requests.length === 2)
          return Response.json(
            { error: "연결을 확인해 주세요." },
            { status: 500 },
          );
        if (body.action === "advance") {
          current = {
            ...current,
            event: { ...current.event, progressStep: body.step + 1,
              revealedQuestions: body.step % 2 === 1
                ? [...current.event.revealedQuestions, Math.ceil(body.step / 2)]
                : current.event.revealedQuestions },
          };
          return Response.json(current);
        }
        current = {
          ...initial,
          event: {
            ...initial.event,
            status: requests.length === 1 || body.action === "reset" ? "open" : "closed",
            round: body.action === "reset" ? 2 : 1,
            closedAt: requests.length === 1 || body.action === "reset" ? null : new Date().toISOString(),
          },
        };
      }
      return Response.json(current);
    },
  );
  const { default: AdminDashboard } =
    await import("../app/components/admin-dashboard.tsx");
  const view = render(<AdminDashboard initial={initial} />);
  assert.equal(
    view.queryByText("로그인 없이 누구나 이용할 수 있습니다.") === null,
    true,
  );
  assert.equal(view.container.textContent?.includes("&#x20;"), false);
  assert.equal(view.container.textContent?.includes("\\"), false);
  assert.equal(view.queryByLabelText("운영 주체"), null);
  assert.equal(view.queryByLabelText("개인정보 문의처"), null);
  const start = view.getByRole("button", { name: "이벤트 시작하기" });
  assert.equal((view.getByRole("button", { name: "1번 문제 공개" }) as HTMLButtonElement).disabled, true);
  assert.equal((start as HTMLButtonElement).disabled, false);
  fireEvent.click(start);
  await view.findByRole("button", { name: "응답 마감하기" });
  assert.deepEqual(requests[0], { action: "start", round: 1 });
  assert.equal(view.queryByRole("dialog"), null);
  fireEvent.click(view.getByRole("button", { name: "응답 마감하기" }));
  const dialog = view.getByRole("dialog", { name: "응답을 마감할까요?" });
  assert.ok(dialog);
  const confirm = view.getByRole("button", { name: "마감 확정" });
  assert.equal((confirm as HTMLButtonElement).disabled, false);
  assert.equal(view.queryByLabelText("확인 문구"), null);
  assert.equal(requests.length, 1);
  fireEvent.click(confirm);
  await view.findByText("연결을 확인해 주세요.");
  assert.deepEqual(requests[1], { action: "close", round: 1 });
  assert.ok(view.getByRole("dialog"));
  fireEvent.click(view.getByRole("button", { name: "마감 확정" }));
  await view.findByText("응답을 마감하고 최종 점수를 확정했습니다.");
  assert.equal(view.queryByRole("dialog"), null);
  assert.equal(view.queryByRole("button", { name: "응답 마감하기" }), null);
  fireEvent.click(view.getByRole("button", { name: "행사 다시하기" }));
  assert.ok(view.getByRole("dialog", { name: "행사를 처음부터 다시 시작할까요?" }));
  assert.match(view.getByRole("dialog").textContent ?? "", /참가 명단·답변·점수·추첨 결과/);
  assert.equal(requests.length, 3);
  fireEvent.click(view.getByRole("button", { name: "취소" }));
  assert.equal(requests.length, 3);
  fireEvent.click(view.getByRole("button", { name: "행사 다시하기" }));
  fireEvent.click(view.getByRole("button", { name: "지우고 다시 시작" }));
  await view.findByText("기록을 초기화하고 행사를 다시 시작했습니다.");
  assert.deepEqual(requests[3], { action: "reset", round: 1 });
  assert.ok(view.getByRole("button", { name: "응답 마감하기" }));
  assert.equal(view.getByRole("region", { name: "스크린 문제" }).querySelectorAll(".screen-option").length, 0);
  for (let step = 0; step < 20; step++) {
    const questionId = Math.floor(step / 2) + 1;
    const name = step % 2 === 0 ? `${questionId}번 문제 공개` : `${questionId}번 결과 공개`;
    assert.equal(view.container.querySelectorAll(".reveal-panel button").length, 1);
    fireEvent.click(await view.findByRole("button", { name }));
    await view.findByText(`${questionId}번 ${step % 2 === 0 ? "문제를" : "결과를"} 공개했습니다.`);
    assert.deepEqual(requests[4 + step], { action: "advance", step, round: 2 });
    assert.ok(view.getByRole("region", { name: "스크린 문제" }).textContent?.includes(questions[questionId - 1].prompt));
  }
  assert.equal((view.getByRole("button", { name: "모든 문제 진행 완료" }) as HTMLButtonElement).disabled, true);
});

test("a participant can recover a failed submission and complete all ten questions without seeing results early", async (t) => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "https://event.example/",
    pretendToBeVisual: true,
  });
  const properties: Record<string, unknown> = {
    window: dom.window,
    self: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement,
    Node: dom.window.Node,
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  const originals = Object.fromEntries(
    Object.keys(properties).map((key) => [
      key,
      Object.getOwnPropertyDescriptor(globalThis, key),
    ]),
  );
  for (const [key, value] of Object.entries(properties))
    Object.defineProperty(globalThis, key, {
      value,
      configurable: true,
      writable: true,
    });
  const { render, fireEvent, waitFor, cleanup, act } =
    await import("@testing-library/react");
  t.after(async () => {
    // Flush framework-scheduled work before removing the browser globals.
    await act(async () => {
      cleanup();
    });
    dom.window.close();
    for (const key of Object.keys(properties)) {
      const original = originals[key];
      if (original) Object.defineProperty(globalThis, key, original);
      else Reflect.deleteProperty(globalThis, key);
    }
  });
  const event: PublicEvent = {
    status: "open",
    round: 1,
    progressStep: 0,
    revealedQuestions: [],
    settings: {
      organizer: "검증 학과",
      privacyContact: "test@example.invalid",
      retentionDays: 30,
      instagramUrl: "",
    },
    participantCount: 0,
    completedCount: 0,
    closedAt: null,
    privacyVersion: 2,
    publicAdmin: true,
  };
  const participant: ParticipantSnapshot = {
    round: 1,
    displayName: "테스트",
    code: "TEST0001",
    answers: [],
    completed: false,
    score: null,
    final: false,
  };
  let registered = false;
  let failed = false;
  let distribution: Distribution | null = null;
  let holdSavedDistribution = false;
  let releaseSavedDistribution: (() => void) | undefined;
  t.mock.method(
    globalThis,
    "fetch",
    async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/event")) return Response.json({ event });
      if (url.includes("/api/participant")) {
        if (init?.method === "POST") {
          const body = JSON.parse(String(init.body));
          assert.deepEqual(body, { nickname: "테스트", round: event.round });
          registered = true;
        }
        return Response.json({ participant: registered ? participant : null });
      }
      if (url.includes("/api/answer")) {
        if (init?.method !== "POST" && holdSavedDistribution)
          return new Promise<Response>((resolve) => {
            releaseSavedDistribution = () => resolve(Response.json({ distribution }));
          });
        if (init?.method === "POST") {
          if (!failed) {
            failed = true;
            return Response.json(
              { error: "연결을 확인해 주세요." },
              { status: 500 },
            );
          }
          const body = JSON.parse(String(init.body)) as {
            questionId: number;
            optionIndex: number;
            round: number;
          };
          assert.equal(body.round, event.round);
          participant.answers.push({
            questionId: body.questionId,
            optionIndex: body.optionIndex,
            points: null,
          });
          participant.completed = participant.answers.length === 10;
          distribution = {
            round: event.round,
            questionId: body.questionId,
            counts: [],
            total: 1,
            percentages: [],
            points: [],
            revealed: false,
            selectedIndex: 0,
            final: false,
            updatedAt: new Date().toISOString(),
          };
        }
        return Response.json({ distribution, participant });
      }
      throw new Error(`Unexpected request: ${url}`);
    },
  );
  const { default: Participation } =
    await import("../app/components/participation.tsx");
  let view = render(<Participation />);
  async function openQuestion(questionId: number) {
    event.progressStep = questionId * 2 - 1;
    fireEvent(dom.window.document, new dom.window.Event("visibilitychange"));
    await view.findByRole("heading", { name: questions[questionId - 1].prompt });
    await view.findByRole("button", { name: /이 선택으로 결정하기/ });
  }
  async function revealQuestion(questionId: number) {
    await view.findByLabelText("결과 공개 대기");
    if (questionId === 1 || questionId === 10) {
      view.unmount();
      view = render(<Participation />);
      await view.findByLabelText("결과 공개 대기");
    }
    assert.equal(view.container.querySelector(".earned-points strong") === null, true);
    assert.equal(view.container.querySelector(".option-percentage, .option-fill, .chosen-ratio"), null);
    assert.equal(view.queryByLabelText("선택 비율 결과"), null);
    assert.equal(view.queryByRole("button", { name: /다음 상황으로/ }), null);
    assert.equal(view.queryByRole("button", { name: /이 선택으로 결정하기/ }) === null, true);
    event.revealedQuestions.push(questionId);
    event.progressStep = questionId * 2;
    distribution!.revealed = true;
    distribution!.counts = [1, 0, 0, 0];
    distribution!.percentages = [100, 0, 0, 0];
    distribution!.points = [0, 5, 5, 5];
    participant.answers[questionId - 1].points = 0;
    if (questionId === 10) participant.score = 0;
    fireEvent(dom.window.document, new dom.window.Event("visibilitychange"));
    if (questionId < 10) {
      await view.findByLabelText("선택 비율 결과");
      assert.equal(view.container.querySelectorAll(".option-percentage").length, 4);
      assert.ok(view.getByRole("heading", { name: questions[questionId - 1].prompt }));
      assert.equal(view.queryByRole("button", { name: /다음 상황으로/ }), null);
    } else {
      await view.findByRole("heading", { name: "선택을 모두 기록했습니다." });
      assert.ok(view.getByLabelText("선택 비율 결과"));
      assert.equal(view.container.querySelectorAll(".option-percentage").length, 4);
    }
  }
  fireEvent.change(await view.findByLabelText("닉네임"), {
    target: { value: "테스트" },
  });
  assert.equal(view.getAllByRole("textbox").length, 1);
  assert.equal(view.queryByLabelText("학번"), null);
  assert.equal(view.queryByRole("checkbox"), null);
  fireEvent.click(view.getByRole("button", { name: /실험 시작하기/ }));
  await view.findByRole("heading", { name: "첫 번째 문제 공개를 기다리고 있습니다." });
  assert.equal(view.queryByRole("radio"), null);
  assert.equal(view.queryByText(questions[0].prompt), null);
  view.unmount();
  view = render(<Participation />);
  await view.findByRole("heading", { name: "첫 번째 문제 공개를 기다리고 있습니다." });
  assert.equal(view.queryByRole("radio"), null);
  await openQuestion(1);
  const first = await view.findByRole("radio", { name: /바로 따라간다/ });
  assert.equal(view.queryByLabelText("선택 비율 결과"), null);
  fireEvent.click(first);
  fireEvent.click(view.getByRole("button", { name: /이 선택으로 결정하기/ }));
  await view.findByText("연결을 확인해 주세요.");
  assert.equal((first as HTMLInputElement).checked, true);
  fireEvent.click(view.getByRole("button", { name: /이 선택으로 결정하기/ }));
  await revealQuestion(1);
  for (let question = 2; question <= 10; question++) {
    await openQuestion(question);
    await waitFor(() => assert.equal(view.getAllByRole("radio").length, 4));
    assert.equal(view.queryByLabelText("선택 비율 결과"), null);
    fireEvent.click(view.getAllByRole("radio")[0]);
    fireEvent.click(view.getByRole("button", { name: /이 선택으로 결정하기/ }));
    await revealQuestion(question);
  }
  await view.findByRole("heading", { name: "선택을 모두 기록했습니다." });
  assert.ok(view.getByText("TEST0001"));
  assert.ok(view.getByText(/행사 마감 후 최종 점수가 확정됩니다/));
  event.status = "drawn";
  participant.final = true;
  fireEvent(dom.window.document, new dom.window.Event("visibilitychange"));
  await view.findByText("행사가 마감되어 최종 점수가 확정되었습니다.");
  for (const round of [2, 3]) {
    Object.assign(event, { status: "open", round, progressStep: 0, revealedQuestions: [] });
    registered = false;
    Object.assign(participant, { round, answers: [], completed: false, final: false, score: null });
    fireEvent(dom.window.document, new dom.window.Event("visibilitychange"));
    fireEvent.change(await view.findByLabelText("닉네임"), {
      target: { value: "테스트" },
    });
    assert.equal(view.container.textContent?.includes("TEST0001"), false);
    fireEvent.click(view.getByRole("button", { name: /실험 시작하기/ }));
    await view.findByRole("heading", { name: "첫 번째 문제 공개를 기다리고 있습니다." });
    assert.equal(view.queryByRole("radio"), null);
    assert.equal(view.queryByLabelText("선택 비율 결과"), null);
  }
  // Another tab has already rejoined and answered when this tab notices the reset.
  Object.assign(event, { status: "open", round: 4, progressStep: 1 });
  participant.round = 4;
  participant.answers = [{ questionId: 1, optionIndex: 1, points: null }];
  distribution = {
    round: 4,
    questionId: 1,
    counts: [],
    total: 1,
    percentages: [],
    points: [],
    revealed: false,
    selectedIndex: 1,
    final: false,
    updatedAt: new Date().toISOString(),
  };
  holdSavedDistribution = true;
  fireEvent(dom.window.document, new dom.window.Event("visibilitychange"));
  await waitFor(() => assert.equal(typeof releaseSavedDistribution, "function"));
  await act(async () => {
    holdSavedDistribution = false;
    releaseSavedDistribution!();
  });
  await view.findByLabelText("결과 공개 대기");
  assert.equal(view.queryByRole("button", { name: /다음 상황으로/ }), null);
  assert.equal(view.queryByLabelText("선택 비율 결과"), null);
  assert.equal(
    (view.getByRole("radio", { name: /일단 거리를 둔다/ }) as HTMLInputElement).checked,
    true,
  );
  // A migrated round may contain a result published out of order by the old UI.
  event.progressStep = 3;
  event.revealedQuestions = [2];
  fireEvent(dom.window.document, new dom.window.Event("visibilitychange"));
  await view.findByRole("heading", { name: "2번 문제의 응답이 마감되었습니다." });
  assert.equal(view.queryByRole("radio"), null);
  await openQuestion(3);
});
