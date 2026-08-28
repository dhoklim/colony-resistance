"use client";
import { useEffect, useRef } from "react";
import { CircleHelp } from "lucide-react";

export type AdminAction = "start" | "close" | "draw" | "reset";
export const actionCopy = {
  start: {
    title: "이벤트를 시작할까요?",
    button: "행사 시작 확정",
    description: "참가 등록과 답변 제출을 시작합니다.",
    success: "이벤트를 시작했습니다. 참가 링크를 공유해 주세요.",
  },
  close: {
    title: "응답을 마감할까요?",
    button: "마감 확정",
    description:
      "응답 접수를 끝내고 최종 점수를 확정합니다. 마감 후에는 답변을 추가할 수 없습니다.",
    success: "응답을 마감하고 최종 점수를 확정했습니다.",
  },
  draw: {
    title: "당첨자를 추첨할까요?",
    button: "추첨 확정",
    description:
      "10문항 완료자 중 점수순으로 최대 2명을 선정하고, 동점자는 추첨합니다. 결과는 한 번만 확정됩니다.",
    success: "당첨자를 선정하고 결과를 저장했습니다.",
  },
  reset: {
    title: "행사를 처음부터 다시 시작할까요?",
    button: "지우고 다시 시작",
    description:
      "참가 명단·답변·점수·추첨 결과를 모두 지우고 새로 시작합니다. 지운 기록은 되돌릴 수 없습니다.",
    success: "기록을 초기화하고 행사를 다시 시작했습니다.",
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
  onConfirm: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
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
    cancelButton.current?.focus();
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
        <CircleHelp size={32} className="state-icon" aria-hidden="true" />
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
            if (!pending) onConfirm();
          }}
        >
          <div className="button-row">
            <button
              ref={cancelButton}
              type="button"
              className="button button-secondary"
              disabled={pending}
              onClick={onCancel}
            >
              취소
            </button>
            <button
              type="submit"
              className={`button ${action === "close" || action === "reset" ? "button-danger" : "button-primary"}`}
              disabled={pending}
            >
              {pending ? "처리 중…" : copy.button}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
