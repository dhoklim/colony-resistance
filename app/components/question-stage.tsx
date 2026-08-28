"use client";
import { useEffect, useRef } from "react";
import { ArrowRight, Check, Clock3, Radio } from "lucide-react";
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
}: {
  question: Question;
  selection: number | null;
  distribution: Distribution | null;
  pending: boolean;
  onSelect: (choice: number) => void;
  onSubmit: () => Promise<void>;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const revealed = distribution?.revealed === true;
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
            className={`option ${selection === index ? "selected" : ""} ${revealed ? "has-result" : ""}`}
            key={option}
          >
            {revealed && distribution && (
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
            {revealed && distribution ? (
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
          {revealed ? <section className="distribution-summary" aria-label="선택 비율 결과">
            <div>
              <p className="live-label">
                <Radio size={12} aria-hidden="true" />
                문항 집계{" "}
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
              <span>획득 점수</span>
              <strong>
                +{distribution.points[distribution.selectedIndex]}
                <small>점</small>
              </strong>
            </div>
          </section> : (
            <section className="distribution-summary result-waiting" aria-label="결과 공개 대기" role="status">
              <Clock3 size={25} aria-hidden="true" />
              <div>
                <strong>답변이 저장되었습니다.</strong>
                <p>선택 비율과 점수는 운영자가 공개하면 표시됩니다.</p>
              </div>
            </section>
          )}
          <p className="result-disclaimer">
            {!revealed
              ? "운영자가 결과를 공개하면 비율과 점수가 자동으로 표시됩니다."
              : distribution.final
                ? "행사가 마감되어 선택 비율과 점수가 확정되었습니다."
                : "이 문항의 응답이 마감되었습니다."}
          </p>
          {revealed && !distribution.final && question.id < 10 && (
            <p className="next-question-waiting" role="status">
              <Clock3 size={17} aria-hidden="true" />
              운영자가 {question.id + 1}번 문제를 공개하면 자동으로 넘어갑니다.
            </p>
          )}
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
