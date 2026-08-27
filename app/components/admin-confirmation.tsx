"use client";
import { useEffect, useRef, useState } from "react";
import { ShieldAlert } from "lucide-react";

export type AdminAction = "start" | "close" | "draw";
export const actionCopy = {
  start: {
    title: "이벤트를 시작할까요?",
    phrase: "행사 시작",
    button: "행사 시작 확정",
    description:
      "참가 등록과 답변 제출이 열립니다. 시작 후에는 개인정보 수집 안내를 바꾸거나 행사를 초기화할 수 없습니다.",
    success: "이벤트를 시작했습니다. 참가 링크를 공유해 주세요.",
  },
  close: {
    title: "응답을 마감할까요?",
    phrase: "응답 마감",
    button: "마감 확정",
    description:
      "현재까지 제출된 응답으로 최종 점수를 확정합니다. 이후에는 새 답변을 받거나 행사를 다시 열 수 없습니다.",
    success: "응답을 마감하고 최종 점수를 확정했습니다.",
  },
  draw: {
    title: "당첨자를 추첨할까요?",
    phrase: "당첨자 추첨",
    button: "추첨 확정",
    description:
      "10문항 완료자를 대상으로 2명을 선정합니다. 최고 득점자가 2명 이상이면 그중에서 추첨하고, 1명이면 그 참가자와 차순위 득점자 중 1명을 선정합니다. 완료자가 1명뿐이면 1명만 선정합니다. 저장된 결과는 다시 추첨할 수 없습니다.",
    success: "당첨자를 선정하고 결과를 저장했습니다.",
  },
} as const;

export default function AdminConfirmation({
  action,
  pending,
  error,
  onCancel,
  onConfirm,
}: {
  action: AdminAction;
  pending: boolean;
  error: string;
  onCancel: () => void;
  onConfirm: (phrase: string) => void;
}) {
  const [phrase, setPhrase] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const cancel = useRef(onCancel);
  const blocked = useRef(pending);
  const copy = actionCopy[action];
  useEffect(() => {
    cancel.current = onCancel;
    blocked.current = pending;
  }, [onCancel, pending]);
  useEffect(() => {
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    input.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !blocked.current) cancel.current();
      if (event.key !== "Tab") return;
      const elements = root.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), [tabindex="0"]',
      );
      if (!elements?.length) {
        event.preventDefault();
        return;
      }
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("keydown", keydown);
      document.body.style.overflow = overflow;
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
    };
  }, []);

  return (
    <div className="modal-backdrop">
      <div
        ref={root}
        className="confirmation panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirmation-title"
        aria-describedby="confirmation-description"
      >
        <ShieldAlert size={32} className="state-icon" aria-hidden="true" />
        <h2 id="confirmation-title">{copy.title}</h2>
        <p id="confirmation-description">{copy.description}</p>
        {error && (
          <div className="alert alert-error" role="alert">
            {error}
          </div>
        )}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (phrase === copy.phrase && !pending) onConfirm(phrase);
          }}
        >
          <div className="field">
            <label htmlFor="confirmation-phrase">확인 문구</label>
            <input
              ref={input}
              id="confirmation-phrase"
              value={phrase}
              onChange={(event) => setPhrase(event.target.value)}
              placeholder={copy.phrase}
              autoComplete="off"
              disabled={pending}
              aria-describedby="confirmation-hint"
            />
            <small id="confirmation-hint">
              위 작업을 실행하려면 ‘{copy.phrase}’을 입력해 주세요.
            </small>
          </div>
          <div className="button-row">
            <button
              type="button"
              className="button button-secondary"
              disabled={pending}
              onClick={onCancel}
            >
              취소
            </button>
            <button
              type="submit"
              className={`button ${action === "close" ? "button-danger" : "button-primary"}`}
              disabled={pending || phrase !== copy.phrase}
            >
              {pending ? "처리 중…" : copy.button}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
