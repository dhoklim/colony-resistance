import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Home from "../app/page.tsx";
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
    displayName: "테스트",
    code: "TEST0001",
    answers: [],
    completed: false,
    score: 0,
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
            points: 0,
          });
          participant.completed = participant.answers.length === 10;
          distribution = {
            questionId: body.questionId,
            counts: [1, 0, 0, 0],
            total: 1,
            percentages: [100, 0, 0, 0],
            points: [0, 5, 5, 5],
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
  const view = render(<Participation />);
  fireEvent.change(await view.findByLabelText("닉네임"), {
    target: { value: "테스트" },
  });
  assert.equal(view.getAllByRole("textbox").length, 1);
  assert.equal(view.queryByLabelText("학번"), null);
  assert.equal(view.queryByRole("checkbox"), null);
  fireEvent.click(view.getByRole("button", { name: /실험 시작하기/ }));
  const first = await view.findByRole("radio", { name: /바로 따라간다/ });
  assert.equal(view.queryByLabelText("선택 비율 결과"), null);
  fireEvent.click(first);
  fireEvent.click(view.getByRole("button", { name: /이 선택으로 결정하기/ }));
  await view.findByText("연결을 확인해 주세요.");
  assert.equal((first as HTMLInputElement).checked, true);
  fireEvent.click(view.getByRole("button", { name: /이 선택으로 결정하기/ }));
  await view.findByLabelText("선택 비율 결과");
  fireEvent.click(view.getByRole("button", { name: /다음 상황으로/ }));
  for (let question = 2; question <= 10; question++) {
    await waitFor(() => assert.equal(view.getAllByRole("radio").length, 4));
    assert.equal(view.queryByLabelText("선택 비율 결과"), null);
    fireEvent.click(view.getAllByRole("radio")[0]);
    fireEvent.click(view.getByRole("button", { name: /이 선택으로 결정하기/ }));
    await view.findByLabelText("선택 비율 결과");
    fireEvent.click(
      view.getByRole("button", {
        name: question === 10 ? /나의 저항도 확인/ : /다음 상황으로/,
      }),
    );
  }
  await view.findByRole("heading", { name: "선택을 모두 기록했습니다." });
  assert.ok(view.getByText("TEST0001"));
  assert.ok(view.getByText(/행사 마감 후 최종 점수가 확정됩니다/));
  event.status = "drawn";
  participant.final = true;
  fireEvent(dom.window.document, new dom.window.Event("visibilitychange"));
  await view.findByText("행사가 마감되어 최종 점수가 확정되었습니다.");
  for (const round of [2, 3]) {
    Object.assign(event, { status: "open", round });
    registered = false;
    Object.assign(participant, { answers: [], completed: false, final: false, score: 0 });
    fireEvent(dom.window.document, new dom.window.Event("visibilitychange"));
    fireEvent.change(await view.findByLabelText("닉네임"), {
      target: { value: "테스트" },
    });
    assert.equal(view.container.textContent?.includes("TEST0001"), false);
    fireEvent.click(view.getByRole("button", { name: /실험 시작하기/ }));
    await view.findByRole("radio", { name: /바로 따라간다/ });
    assert.equal(view.queryByLabelText("선택 비율 결과"), null);
  }
  // Another tab has already rejoined and answered when this tab notices the reset.
  Object.assign(event, { status: "open", round: 4 });
  participant.answers = [{ questionId: 1, optionIndex: 1, points: 0 }];
  distribution = {
    questionId: 1,
    counts: [0, 1, 0, 0],
    total: 1,
    percentages: [0, 100, 0, 0],
    points: [5, 0, 5, 5],
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
  await view.findByLabelText("선택 비율 결과");
  assert.equal(
    (view.getByRole("radio", { name: /일단 거리를 둔다/ }) as HTMLInputElement).checked,
    true,
  );
});
