"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCheck,
  Download,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  Ticket,
  Users,
} from "lucide-react";
import type { AdminSnapshot, EventStatus } from "../lib/contracts";
import { apiJson, friendlyError } from "../lib/client";
import { optionMarkers, questions } from "../lib/questions";
import AdminConfirmation, {
  actionCopy,
  type AdminAction,
} from "./admin-confirmation";
import EventQr from "./event-qr";

const statusCopy: Record<EventStatus, string> = {
  draft: "시작 대기",
  open: "참여 진행 중",
  closed: "응답 마감",
  drawn: "추첨 완료",
};

export default function AdminDashboard({
  initial,
  email,
  participationUrl,
}: {
  initial: AdminSnapshot;
  email?: string;
  participationUrl?: string;
}) {
  const [data, setData] = useState(initial);
  const [pending, setPending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [action, setAction] = useState<AdminAction | null>(null);
  const [error, setError] = useState("");
  const [syncError, setSyncError] = useState("");
  const [message, setMessage] = useState("");
  const [updated, setUpdated] = useState("");
  const busy = useRef(false);
  const reading = useRef(false);
  const generation = useRef(0);
  const page = useRef(initial.page);
  const event = data.event;
  const isFinal = event.status === "closed" || event.status === "drawn";

  const accept = useCallback((snapshot: AdminSnapshot) => {
    setData(snapshot);
    page.current = snapshot.page;
    setUpdated(
      new Intl.DateTimeFormat("ko-KR", {
        timeZone: "Asia/Seoul",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }).format(new Date()),
    );
    setSyncError("");
  }, []);

  const refresh = useCallback(
    async (nextPage?: number, signal?: AbortSignal) => {
      if (busy.current || reading.current) return;
      reading.current = true;
      setRefreshing(true);
      const currentGeneration = generation.current;
      try {
        const snapshot = await apiJson<AdminSnapshot>(
          `/api/admin?page=${nextPage ?? page.current}`,
          undefined,
          signal,
        );
        if (!signal?.aborted && currentGeneration === generation.current)
          accept(snapshot);
      } catch (caught) {
        if (!signal?.aborted) setSyncError(friendlyError(caught));
      } finally {
        reading.current = false;
        if (!signal?.aborted) setRefreshing(false);
      }
    },
    [accept],
  );

  useEffect(() => {
    const controller = new AbortController();
    const timer = setInterval(() => {
      if (!document.hidden) void refresh(undefined, controller.signal);
    }, 5000);
    const visible = () => {
      if (!document.hidden) void refresh(undefined, controller.signal);
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      clearInterval(timer);
      controller.abort();
      document.removeEventListener("visibilitychange", visible);
    };
  }, [refresh]);

  async function mutate(body: { action: AdminAction }) {
    if (busy.current) return;
    busy.current = true;
    generation.current += 1;
    setPending(true);
    setError("");
    setMessage("");
    try {
      accept(await apiJson<AdminSnapshot>("/api/admin", body));
      setMessage(actionCopy[body.action].success);
      setAction(null);
    } catch (caught) {
      setError(friendlyError(caught));
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  function choose(next: AdminAction) {
    setError("");
    setMessage("");
    setAction(next);
  }

  return (
    <div className="admin-page">
      <div inert={action !== null}>
        <header className="site-header shell">
          <Link prefetch={false} href="/" className="brand">
            <span className="brand-mark" aria-hidden="true" />
            군체<span className="brand-caption">EVENT CONTROL</span>
          </Link>
          <Link prefetch={false} className="back-link" href="/participate">
            참여 화면 <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </header>
        <main className="shell admin-main">
          <div className="admin-heading">
            <div>
              <p className="eyebrow">
                {event.publicAdmin ? (
                  <Users size={14} aria-hidden="true" />
                ) : (
                  <ShieldCheck size={14} aria-hidden="true" />
                )}
                {event.publicAdmin
                  ? "PUBLIC EVENT CONTROL"
                  : "AUTHORIZED PERSONNEL ONLY"}
              </p>
              <h1>
                이벤트 운영실<span className="title-dot">.</span>
              </h1>
              <p className="admin-account">
                {event.publicAdmin
                  ? "로그인 없이 누구나 이용할 수 있습니다."
                  : email}
              </p>
            </div>
            <span className={`badge status-badge status-${event.status}`}>
              <span className="status-dot" />
              {statusCopy[event.status]}
            </span>
          </div>
          {message && (
            <div className="alert alert-success" role="status">
              {message}
            </div>
          )}
          {error && !action && (
            <div className="alert alert-error" role="alert">
              {error}
            </div>
          )}
          {syncError && (
            <div className="alert alert-warning" role="status">
              집계를 갱신하지 못했습니다. 마지막으로 확인한 결과를 표시합니다.{" "}
              {syncError}
            </div>
          )}
          <section className="admin-stats" aria-label="이벤트 현황">
            <div>
              <span>
                <Users size={15} aria-hidden="true" /> 전체 참가자
              </span>
              <strong>
                {event.participantCount.toLocaleString("ko-KR")}
                <small>명</small>
              </strong>
            </div>
            <div>
              <span>
                <CheckCheck size={15} aria-hidden="true" /> 10문항 완료
              </span>
              <strong>
                {event.completedCount.toLocaleString("ko-KR")}
                <small>명</small>
              </strong>
            </div>
            <div>
              <span>
                <Ticket size={15} aria-hidden="true" /> 선정된 당첨자
              </span>
              <strong>
                {data.draw?.winners.length ?? 0}
                <small>/ 2명</small>
              </strong>
            </div>
          </section>
          <section className="event-controls" aria-label="진행 제어">
            <div>
              <strong>
                {isFinal
                  ? "최종 점수가 확정되었습니다."
                  : event.status === "draft"
                    ? "준비가 됐다면 바로 시작해 주세요."
                    : "각 참가자의 선택을 실시간으로 집계합니다."}
              </strong>
              <p>
                {isFinal
                  ? `마감 시각: ${event.closedAt ? new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium", timeStyle: "short" }).format(new Date(event.closedAt)) : "확인 중"}`
                  : "진행 중 표시되는 점수는 잠정값이며, 응답 마감 시 확정됩니다."}
              </p>
            </div>
            {event.status === "draft" && (
              <button
                className="button button-primary"
                disabled={pending}
                onClick={() => void mutate({ action: "start" })}
              >
                이벤트 시작하기 <ArrowRight size={16} aria-hidden="true" />
              </button>
            )}
            {event.status === "open" && (
              <button
                className="button button-danger"
                disabled={pending}
                onClick={() => choose("close")}
              >
                응답 마감하기 <LockKeyhole size={16} aria-hidden="true" />
              </button>
            )}
            {event.status === "closed" && (
              <button
                className="button button-primary"
                disabled={pending || event.completedCount === 0}
                onClick={() => choose("draw")}
              >
                당첨자 2명 선정 <Ticket size={16} aria-hidden="true" />
              </button>
            )}
            {event.status === "drawn" && (
              <span className="completed-seal">
                <ShieldCheck size={19} aria-hidden="true" /> 추첨 결과 저장됨
              </span>
            )}
          </section>
          {event.status === "closed" && event.completedCount === 0 && (
            <p className="small-note">
              10문항 완료자가 없어 추첨할 수 없습니다.
            </p>
          )}
          {data.draw && (
            <section
              className="panel winners-panel"
              aria-labelledby="winners-title"
            >
              <div className="section-heading">
                <h2 id="winners-title">
                  <Ticket size={19} aria-hidden="true" /> CGV 관람권 당첨자
                </h2>
                <span className="badge">
                  추첨 대상 {data.draw.eligibleCount}명
                </span>
              </div>
              <div className="winner-list">
                {data.draw.winners.map((winner, index) => (
                  <article key={winner.id}>
                    <span className="winner-number">0{index + 1}</span>
                    <div>
                      <h3>{winner.name}</h3>
                      <p>참가 코드 {winner.code}</p>
                    </div>
                    <strong>
                      {winner.score}
                      <small> / 50</small>
                    </strong>
                  </article>
                ))}
              </div>
              <p className="small-note">
                닉네임과 참가 코드로 당첨자를 확인하세요. 새로고침해도 추첨
                결과는 유지됩니다.
              </p>
            </section>
          )}
          <div className="admin-grid">
            <div className="admin-primary">
              <section
                className="panel participants-panel"
                aria-labelledby="participants-title"
              >
                <div className="section-heading">
                  <h2 id="participants-title">참가 현황</h2>
                  <a href="/api/admin/export" className="small-link">
                    <Download size={14} aria-hidden="true" /> CSV 내려받기
                  </a>
                </div>
                <div className="table-wrap">
                  <table>
                    <caption className="sr-only">
                      참가자별 완료 문항과 {isFinal ? "최종" : "잠정"} 점수.
                      최근 등록순.
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">닉네임</th>
                        <th scope="col">참가 코드</th>
                        <th scope="col">진행</th>
                        <th scope="col">
                          {isFinal ? "최종 점수" : "잠정 점수"}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.participants.map((person) => (
                        <tr key={person.id}>
                          <td>
                            <strong>{person.name}</strong>
                          </td>
                          <td className="mono">{person.code}</td>
                          <td>
                            <span
                              className={`badge ${person.completed ? "badge-green" : ""}`}
                            >
                              {person.completed
                                ? "완료"
                                : `${person.answeredCount} / 10`}
                            </span>
                          </td>
                          <td className="table-score">
                            {person.score}
                            <small> / 50</small>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {data.participants.length === 0 && (
                    <p className="empty-table">
                      아직 등록된 참가자가 없습니다.
                    </p>
                  )}
                </div>
                <div className="table-footer">
                  <span>
                    최근 등록순 · {data.page} / {data.totalPages} 페이지
                  </span>
                  <div>
                    <button
                      type="button"
                      aria-label="이전 페이지"
                      disabled={refreshing || pending || data.page <= 1}
                      onClick={() => void refresh(data.page - 1)}
                    >
                      <ArrowLeft size={15} />
                    </button>
                    <button
                      type="button"
                      aria-label="다음 페이지"
                      disabled={
                        refreshing || pending || data.page >= data.totalPages
                      }
                      onClick={() => void refresh(data.page + 1)}
                    >
                      <ArrowRight size={15} />
                    </button>
                  </div>
                </div>
                <p className="small-note">
                  같은 닉네임은 참가 코드로 구분할 수 있습니다.
                </p>
              </section>
              <section
                className="panel aggregates-panel"
                aria-labelledby="aggregates-title"
              >
                <div className="section-heading">
                  <h2 id="aggregates-title">문항별 선택 분포</h2>
                  <span className="badge">
                    {isFinal ? "최종 확정" : "실시간 집계"}
                  </span>
                </div>
                <p className="small-note">
                  중도 이탈자의 제출 응답도 분포에 포함됩니다. 동률 선택지는
                  같은 점수이며 다음 순위를 건너뜁니다. 예: 1위·1위·3위·4위 →
                  5·5·1·0점.
                </p>
                {data.distributions.map((result) => {
                  const question = questions[result.questionId - 1];
                  return (
                    <details
                      key={result.questionId}
                      className="aggregate-question"
                    >
                      <summary>
                        <span className="mono">
                          {String(result.questionId).padStart(2, "0")}
                        </span>
                        <strong>{question.title}</strong>
                        <small>{result.total}명 응답</small>
                      </summary>
                      <p>{question.prompt}</p>
                      <div className="aggregate-options">
                        {question.options.map((option, index) => {
                          const percentage = result.total
                            ? Math.round(
                                (result.counts[index] / result.total) * 1000,
                              ) / 10
                            : 0;
                          return (
                            <div key={index}>
                              <div className="aggregate-label">
                                <span>
                                  {optionMarkers[index]} {option}
                                </span>
                                <b>
                                  {result.counts[index]}명 · {percentage}%
                                </b>
                              </div>
                              <div className="aggregate-bar">
                                <span style={{ width: `${percentage}%` }} />
                              </div>
                              <small>
                                {result.total
                                  ? `현재 배점 ${result.points[index]}점`
                                  : "응답 대기"}
                              </small>
                            </div>
                          );
                        })}
                      </div>
                    </details>
                  );
                })}
              </section>
            </div>
            <aside className="admin-aside">
              <EventQr participationUrl={participationUrl} />
              <section className="admin-rules">
                <p className="eyebrow">DRAW RULES</p>
                <h2>선정 기준</h2>
                <p>
                  10문항 완료자만 대상입니다. 최고 득점자가 2명 이상이면 그중
                  2명을 무작위로 선정합니다. 1명이라면 해당 참가자와 차순위
                  득점자 중 1명을 선정합니다.
                </p>
                <p>
                  완료자가 1명뿐이면 1명만 선정하며, 재추첨은 지원하지 않습니다.
                </p>
              </section>
            </aside>
          </div>
          <footer className="admin-footer">
            <span>
              {updated ? `최근 갱신 ${updated} KST` : "5초마다 자동 갱신"} ·
              {event.publicAdmin ? "전체 공개" : "운영자에게만 표시"}
            </span>
            <button
              className="small-link"
              disabled={pending || refreshing}
              onClick={() => void refresh()}
            >
              <RefreshCw size={13} aria-hidden="true" />
              {refreshing ? "갱신 중…" : "지금 새로고침"}
            </button>
          </footer>
        </main>
      </div>
      {action && (
        <AdminConfirmation
          action={action}
          pending={pending}
          error={error}
          onCancel={() => {
            if (!pending) {
              setAction(null);
              setError("");
            }
          }}
          onConfirm={() => void mutate({ action })}
        />
      )}
    </div>
  );
}
