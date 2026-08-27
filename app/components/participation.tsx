"use client";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpRight,
  Clock3,
  ShieldCheck,
  Ticket,
} from "lucide-react";
import { questions } from "../lib/questions";
import { useParticipation } from "./use-participation";
import { Registration } from "./registration";
import { QuestionStage } from "./question-stage";
import { Completion } from "./completion";

export default function Participation() {
  const flow = useParticipation();
  const answered = flow.participant?.answers.length ?? 0;
  const waiting =
    flow.event && !flow.participant && flow.event.status !== "open";
  return (
    <div className="experiment-page">
      <header className="site-header shell">
        <Link prefetch={false} className="brand" href="/">
          <span className="brand-mark" aria-hidden="true" />
          군체<span className="brand-caption">RESISTANCE PROJECT</span>
        </Link>
        <Link prefetch={false} className="back-link" href="/">
          <ArrowLeft size={13} aria-hidden="true" />
          이벤트 소개
        </Link>
      </header>
      <main className="experiment-layout shell">
        <div className="experiment-main">
          {flow.phase === "loading" ? (
            <section className="state-panel panel">
              {flow.error ? (
                <>
                  <h1>연결을 확인해 주세요.</h1>
                  <p role="alert">{flow.error}</p>
                  <button
                    className="button button-primary"
                    onClick={flow.reload}
                  >
                    다시 연결하기
                  </button>
                </>
              ) : (
                <>
                  <span className="loader" aria-hidden="true" />
                  <p role="status">참여 정보를 확인하고 있습니다.</p>
                </>
              )}
            </section>
          ) : (
            <>
              {flow.error && (
                <div className="alert alert-error" role="alert">
                  {flow.error}
                </div>
              )}
              {flow.syncError && (
                <div className="alert alert-warning" role="status">
                  {flow.syncError}
                </div>
              )}
              {waiting ? (
                <section className="state-panel panel">
                  <Clock3 className="state-icon" size={42} strokeWidth={1} />
                  <p className="eyebrow">
                    {flow.event?.status === "draft"
                      ? "COMING SOON"
                      : "EXPERIMENT CLOSED"}
                  </p>
                  <h1>
                    {flow.event?.status === "draft"
                      ? "곧 실험이 시작됩니다."
                      : "이벤트 참여가 마감되었습니다."}
                  </h1>
                  <p>
                    {flow.event?.status === "draft"
                      ? "운영자가 행사를 시작하면 이 화면에서 참여할 수 있습니다."
                      : "결과는 학과 공식 인스타그램에서 확인해 주세요."}
                  </p>
                  <button className="button" onClick={flow.reload}>
                    참여 상태 새로고침
                  </button>
                </section>
              ) : flow.phase === "registration" && flow.event ? (
                <Registration
                  key={`${flow.event.privacyVersion}:${flow.event.publicAdmin}`}
                  event={flow.event}
                  pending={flow.pending}
                  onRegister={flow.register}
                />
              ) : flow.phase === "complete" &&
                flow.participant &&
                flow.event ? (
                <Completion participant={flow.participant} event={flow.event} />
              ) : flow.phase === "closed" ? (
                <section className="state-panel panel">
                  <p className="eyebrow">EXPERIMENT CLOSED</p>
                  <h1>응답 접수가 마감되었습니다.</h1>
                  <p>
                    {answered}개의 선택이 저장되었습니다.
                    <br />
                    10문항 완료자만 추첨 대상에 포함됩니다.
                  </p>
                  <Link prefetch={false} className="button" href="/">
                    처음 화면으로
                    <ArrowUpRight size={16} aria-hidden="true" />
                  </Link>
                </section>
              ) : (
                <>
                  <div className="progress-heading">
                    <span>당신만의 선택을 기록하는 중</span>
                    <strong>
                      {String(answered).padStart(2, "0")} <span>/ 10</span>
                    </strong>
                  </div>
                  <progress
                    className="question-progress"
                    value={answered}
                    max={10}
                    aria-label="저장한 답변 수"
                  />
                  <QuestionStage
                    question={questions[flow.questionId - 1]}
                    selection={flow.selection}
                    distribution={
                      flow.phase === "result" ? flow.distribution : null
                    }
                    pending={flow.pending}
                    onSelect={flow.select}
                    onSubmit={flow.submit}
                    onNext={flow.next}
                  />
                </>
              )}
            </>
          )}
        </div>
        <aside className="experiment-aside">
          <div className="aside-heading">
            <ShieldCheck size={18} strokeWidth={1.5} aria-hidden="true" />
            <span>군체 저항도 안내</span>
          </div>
          <h2>
            정답 대신,
            <br />
            <span>당신의 판단.</span>
          </h2>
          <p>
            덜 선택된 행동일수록 더 높은 점수를 얻습니다. 군체를 의식하기보다
            당신의 판단에 집중하세요.
          </p>
          <div className="scoring-list">
            <div>
              <span>가장 적은 선택</span>
              <strong>5점</strong>
            </div>
            <div>
              <span>두 번째로 적은 선택</span>
              <strong>3점</strong>
            </div>
            <div>
              <span>세 번째로 적은 선택</span>
              <strong>1점</strong>
            </div>
            <div>
              <span>그 외 선택</span>
              <strong>0점</strong>
            </div>
          </div>
          <details className="tie-note">
            <summary>선택 인원이 같다면?</summary>
            <p>
              같은 인원은 공동순위로 같은 점수를 받습니다. 다음 순위는 공동순위
              인원만큼 건너뜁니다. 0표 선택지도 순위에 포함됩니다.
            </p>
          </details>
          <div className="aside-reward">
            <Ticket size={22} strokeWidth={1.2} aria-hidden="true" />
            <p>
              <strong>CGV 관람권 2명</strong>
              <br />
              최종 최고점 참가자 중 추첨
            </p>
          </div>
          <p className="aside-small">
            최고점자가 1명이면 자동 당첨 후 차점자 중 1명을 추첨합니다. 완료자가
            부족하면 해당 인원만 선정합니다.
          </p>
        </aside>
      </main>
      <footer className="site-footer shell">
        <span>모두가 연결되어도, 선택은 당신의 것.</span>
        <span>COLONY / RESISTANCE</span>
      </footer>
    </div>
  );
}
