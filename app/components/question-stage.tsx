"use client";
import { useEffect, useRef } from "react";
import { ArrowRight, Check, Radio } from "lucide-react";
import { optionMarkers, type Question } from "../lib/questions";
import type { Distribution } from "../lib/contracts";
import { Scene } from "./scene";

export function QuestionStage({
  question,
  selection,
  distribution,
  pending,
  onSelect,
  onSubmit,
  onNext,
}: {
  question: Question;
  selection: number | null;
  distribution: Distribution | null;
  pending: boolean;
  onSelect: (choice: number) => void;
  onSubmit: () => Promise<void>;
  onNext: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, [question.id]);
  return (
    <section className="question-stage">
      <Scene question={question} />
      <div className="question-heading">
        <p className="eyebrow">
          상황 {String(question.id).padStart(2, "0")}{" "}
          <span className="muted">/ 10</span>
        </p>
        <h1 ref={heading} tabIndex={-1}>
          {question.prompt}
        </h1>
        <p className="question-instruction">
          {distribution
            ? "당신의 선택이 기록되었습니다."
            : "당신의 판단에 가장 가까운 행동을 하나 선택하세요."}
        </p>
      </div>
      <fieldset className="options" disabled={pending || !!distribution}>
        <legend className="sr-only">행동 선택</legend>
        {question.options.map((option, index) => (
          <label
            className={`option ${selection === index ? "selected" : ""} ${distribution ? "has-result" : ""}`}
            key={option}
          >
            {distribution && (
              <span
                className="option-fill"
                style={{ width: `${distribution.percentages[index]}%` }}
              />
            )}
            <input
              className="sr-only"
              type="radio"
              name="survival-choice"
              value={index}
              checked={selection === index}
              onChange={() => onSelect(index)}
            />
            <span className="option-marker">{optionMarkers[index]}</span>
            <span className="option-copy">{option}</span>
            {distribution ? (
              <span className="option-percentage">
                {distribution.percentages[index]}
                <small>%</small>
              </span>
            ) : (
              <span className="option-radio" aria-hidden="true">
                {selection === index && <Check size={12} />}
              </span>
            )}
          </label>
        ))}
      </fieldset>
      {distribution ? (
        <>
          <section className="distribution-summary" aria-label="선택 비율 결과">
            <div>
              <p className="live-label">
                <Radio size={12} aria-hidden="true" />
                {distribution.final ? "최종 집계" : "실시간 집계"}{" "}
                <span>· {distribution.total}명 응답</span>
              </p>
              <p className="chosen-ratio">
                당신과 같은 선택은{" "}
                <strong>
                  {distribution.percentages[distribution.selectedIndex]}%
                </strong>
              </p>
            </div>
            <div className="earned-points">
              {distribution.revealed ? (
                <>
                  <span>{distribution.final ? "확정 점수" : "잠정 점수"}</span>
                  <strong>
                    +{distribution.points[distribution.selectedIndex]}
                    <small>점</small>
                  </strong>
                </>
              ) : (
                <span className="score-pending" role="status">운영자 공개 대기</span>
              )}
            </div>
          </section>
          <p className="result-disclaimer">
            {!distribution.revealed
              ? "운영자가 이 문항의 점수를 공개하면 다음 단계로 진행할 수 있습니다."
              : distribution.final
                ? "행사가 마감되어 선택 비율과 점수가 확정되었습니다."
                : "선택 비율과 점수는 참가자들의 응답에 따라 달라집니다."}
          </p>
          <button className="button button-primary full-width" disabled={!distribution.revealed} onClick={onNext}>
            {!distribution.revealed
              ? "점수 공개 대기 중"
              : question.id === 10
                ? "나의 저항도 확인"
                : distribution.final
                  ? "마감 안내 확인"
                  : "다음 상황으로"}
            <ArrowRight size={18} aria-hidden="true" />
          </button>
        </>
      ) : (
        <>
          <button
            className="button button-primary full-width"
            disabled={selection === null || pending}
            onClick={() => void onSubmit()}
          >
            {pending ? "선택을 기록하는 중" : "이 선택으로 결정하기"}
            <ArrowRight size={18} aria-hidden="true" />
          </button>
          <p className="form-note">제출 후에는 선택을 변경할 수 없습니다.</p>
        </>
      )}
    </section>
  );
}
