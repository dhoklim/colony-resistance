import { Clock3, Radio, Smartphone } from "lucide-react";
import type { AdminSnapshot } from "../lib/contracts";
import { optionMarkers, questions } from "../lib/questions";

export default function AdminQuestionScreen({ event, distributions }: Pick<AdminSnapshot, "event" | "distributions">) {
  const step = event.progressStep ?? 0;
  const question = questions[Math.ceil(step / 2) - 1];
  const result = distributions.find((item) => item.questionId === question?.id);
  const revealed = !!question && step >= question.id * 2 && event.revealedQuestions.includes(question.id);
  const showResults = revealed && result?.counts.length === 4 && result.points.length === 4;

  return (
    <section className="screen-question" aria-label="스크린 문제" aria-live="polite">
      {question ? <>
        <div className="screen-question-meta">
          <p>상황 <strong>{String(question.id).padStart(2, "0")}</strong><span> / 10</span></p>
          <span className={`screen-phase${revealed ? " is-revealed" : ""}`}>
            {revealed ? <Radio size={16} aria-hidden="true" /> : <Smartphone size={16} aria-hidden="true" />}
            {revealed ? "선택 결과" : event.status === "open" ? "휴대폰으로 답변해 주세요" : "응답 마감 · 결과 공개 대기"}
          </span>
        </div>
        <h2>{question.prompt}</h2>
        <ol className="screen-options">
          {question.options.map((option, index) => {
            const percentage = showResults && result.total > 0
              ? Math.round(result.counts[index] / result.total * 1000) / 10 : 0;
            return (
              <li className={`screen-option${showResults ? " has-result" : ""}`} key={option}>
                {showResults && <span className="screen-option-fill" style={{ width: `${percentage}%` }} aria-hidden="true" />}
                <span className="screen-option-number" aria-hidden="true">{optionMarkers[index]}</span>
                <span className="screen-option-text">{option}</span>
                {showResults && <div className="screen-option-result">
                  <strong className="screen-option-percentage">{percentage}<small>%</small></strong>
                  {result.total > 0 && <span className="screen-option-points">배점 <b>{result.points[index]}</b>점</span>}
                </div>}
              </li>
            );
          })}
        </ol>
        <p className="screen-question-note">
          {showResults ? result.total === 0 ? "이 문항에 제출된 응답이 없습니다."
            : question.id === 10 ? "마지막 문항의 선택 결과입니다."
              : "다음 문제는 운영자가 공개하면 표시됩니다."
            : revealed ? "선택 결과를 불러오고 있습니다."
              : "선택 비율과 점수는 결과 공개 후 표시됩니다."}
        </p>
      </> : <div className="screen-lobby">
        <Clock3 size={42} strokeWidth={1.3} aria-hidden="true" />
        <p className="eyebrow">문제 공개 대기</p>
        <h2>첫 번째 문제를 기다려 주세요.</h2>
        <p>휴대폰으로 입장한 뒤, 공개되는 상황에 따라 선택해 주세요.</p>
      </div>}
    </section>
  );
}
