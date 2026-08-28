import Link from "next/link";
import { ArrowUpRight, Check, Clock3, Ticket } from "lucide-react";
import type { CSSProperties } from "react";
import type { ParticipantSnapshot, PublicEvent } from "../lib/contracts";
import { optionMarkers, questions } from "../lib/questions";

export function Completion({
  participant,
  event,
}: {
  participant: ParticipantSnapshot;
  event: PublicEvent;
}) {
  const score = participant.score;
  const revealedCount = participant.answers.filter((answer) => answer.points !== null).length;
  return (
    <section className="completion panel">
      <p className="eyebrow">
        <Check size={12} aria-hidden="true" /> EXPERIMENT COMPLETE
      </p>
      <h1>선택을 모두 기록했습니다.</h1>
      <p className="section-description">
        {participant.displayName}님의 열 번의 판단,
        <br />
        군체와 얼마나 달랐을까요?
      </p>
      {score === null ? (
        <div className="score-waiting" role="status">
          <Clock3 size={32} strokeWidth={1.3} aria-hidden="true" />
          <h2>총점 공개 대기 중</h2>
          <p>{revealedCount} / 10 문항 점수 공개</p>
          <p>모든 문항의 점수가 공개되면 총점이 자동으로 표시됩니다.</p>
        </div>
      ) : (
        <>
          <div
            className="score-ring"
            role="group"
            aria-label="군체 저항도"
            style={{ "--score-angle": `${(score / 50) * 360}deg` } as CSSProperties}
          >
            <div>
              <span>군체 저항도</span>
              <strong>{score}<small>/ 50</small></strong>
              <span className="score-status">
                {participant.final ? "최종 확정" : "현재 기준 · 잠정"}
              </span>
            </div>
          </div>
          <div className="completion-note">
            <p>
              {participant.final
                ? "행사가 마감되어 최종 점수가 확정되었습니다."
                : "행사 마감 후 최종 점수가 확정됩니다."}
            </p>
            <p>
              {participant.final
                ? "결과 발표는 학과 공식 인스타그램에서 확인해 주세요."
                : "다른 참가자들의 선택에 따라 점수가 달라질 수 있습니다."}
            </p>
          </div>
        </>
      )}
      <div className="participant-code">
        <span>나의 참가 코드</span>
        <strong>{participant.code}</strong>
      </div>
      <p className="small-note">
        당첨자 확인을 위해 닉네임과 참가 코드를 캡처해 두세요.
      </p>
      <div className="reward-note">
        <Ticket size={22} strokeWidth={1.3} aria-hidden="true" />
        <div>
          <strong>CGV 관람권 · 2명</strong>
          <p>최고점 참가자 중 추첨 · 공식 인스타그램 발표</p>
        </div>
      </div>
      {event.settings.instagramUrl && (
        <a
          className="button button-primary full-width"
          href={event.settings.instagramUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          공식 인스타그램
          <ArrowUpRight size={18} aria-hidden="true" />
        </a>
      )}
      <details className="answer-review">
        <summary>내 선택 돌아보기</summary>
        {participant.answers.map((answer) => (
          <div className="review-row" key={answer.questionId}>
            <span>{String(answer.questionId).padStart(2, "0")}</span>
            <div>
              <strong>{questions[answer.questionId - 1].title}</strong>
              <p>
                {optionMarkers[answer.optionIndex]}{" "}
                {questions[answer.questionId - 1].options[answer.optionIndex]}
              </p>
            </div>
            {answer.points === null
              ? <span className="review-pending">공개 대기</span>
              : <b>+{answer.points}</b>}
          </div>
        ))}
      </details>
      <Link prefetch={false} className="text-link" href="/">
        처음 화면으로 <span aria-hidden="true">↗</span>
      </Link>
    </section>
  );
}
