"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Distribution, ParticipantSnapshot, PublicEvent } from "../lib/contracts";
import { apiJson, friendlyError } from "../lib/client";

type Phase = "loading" | "registration" | "waiting" | "question" | "result" | "missed" | "complete" | "closed";

export function useParticipation() {
  const [event, setEvent] = useState<PublicEvent | null>(null);
  const [participant, setParticipant] = useState<ParticipantSnapshot | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [questionId, setQuestionId] = useState(1);
  const [selection, setSelection] = useState<number | null>(null);
  const [distribution, setDistribution] = useState<Distribution | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [syncError, setSyncError] = useState("");
  const busy = useRef(false);
  const mounted = useRef(false);
  const generation = useRef(0);
  const position = useRef({ round: 0, questionId: 0 });

  const load = useCallback(async (signal?: AbortSignal, quiet = false) => {
    const requestGeneration = ++generation.current;
    const isCurrent = () => mounted.current && !signal?.aborted && requestGeneration === generation.current;
    try {
      const [eventData, me] = await Promise.all([
        apiJson<{ event: PublicEvent }>("/api/event", undefined, signal),
        apiJson<{ participant: ParticipantSnapshot | null }>("/api/participant", undefined, signal),
      ]);
      if (!isCurrent()) return;
      const currentEvent = eventData.event;
      const currentParticipant = me.participant;
      if (currentParticipant && currentParticipant.round !== currentEvent.round)
        throw new Error("행사 상태가 바뀌었습니다. 다시 연결하고 있습니다.");
      // Missing progress from an older server is treated as waiting, never question one.
      const step = currentEvent.progressStep ?? 0;
      const currentQuestion = Math.max(1, Math.ceil(step / 2));
      const answer = currentParticipant?.answers.find((saved) => saved.questionId === currentQuestion);
      const closed = currentEvent.status === "closed" || currentEvent.status === "drawn";
      let nextPhase: Phase;
      if (!currentParticipant) nextPhase = "registration";
      else if (step >= 20 || closed) nextPhase = currentParticipant.completed ? "complete" : "closed";
      else if (step === 0 || currentEvent.status === "draft") nextPhase = "waiting";
      else if (answer) nextPhase = "result";
      else nextPhase = step % 2 === 1 && !currentEvent.revealedQuestions.includes(currentQuestion) ? "question" : "missed";

      let result: Distribution | null = null;
      if (nextPhase === "result" || (step >= 20 && answer && currentEvent.revealedQuestions.includes(currentQuestion))) {
        const data = await apiJson<{ distribution: Distribution }>(
          `/api/answer?questionId=${currentQuestion}&round=${currentEvent.round}`, undefined, signal,
        );
        if (data.distribution.round !== currentEvent.round)
          throw new Error("행사 상태가 바뀌었습니다. 다시 연결하고 있습니다.");
        result = currentEvent.revealedQuestions.includes(currentQuestion)
          ? data.distribution
          : { ...data.distribution, revealed: false, counts: [], percentages: [], points: [] };
      }
      if (!isCurrent()) return;
      const sameQuestion = position.current.round === currentEvent.round && position.current.questionId === currentQuestion;
      position.current = { round: currentEvent.round, questionId: currentQuestion };
      // Apply a coherent snapshot together; an older poll cannot overwrite a submission.
      setEvent(currentEvent);
      setParticipant(currentParticipant);
      setQuestionId(currentQuestion);
      setSelection((previous) => answer?.optionIndex ?? (sameQuestion && nextPhase === "question" ? previous : null));
      setDistribution(result);
      setPhase(nextPhase);
      setError("");
      setSyncError("");
    } catch (caught) {
      if (!isCurrent()) return;
      if (quiet) setSyncError("진행 상태 연결이 잠시 끊겼습니다. 자동으로 다시 연결합니다.");
      else setError(friendlyError(caught));
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    let active = false;
    const refresh = async (quiet = true) => {
      if (active || busy.current || (quiet && document.hidden)) return;
      active = true;
      try { await load(controller.signal, quiet); }
      finally { active = false; }
    };
    // All state updates happen after a completed server read.
    void refresh(false);
    const timer = setInterval(() => void refresh(), 2000);
    const visible = () => { if (!document.hidden) void refresh(); };
    document.addEventListener("visibilitychange", visible);
    return () => {
      mounted.current = false;
      controller.abort();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [load]);

  async function register(nickname: string) {
    if (busy.current || !event) return;
    busy.current = true;
    generation.current += 1;
    setPending(true);
    setError("");
    try {
      await apiJson<{ participant: ParticipantSnapshot }>("/api/participant", { nickname, round: event.round });
      await load();
    } catch (caught) {
      setError(friendlyError(caught));
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  async function submit() {
    if (busy.current || !event || phase !== "question" || selection === null) return;
    busy.current = true;
    generation.current += 1;
    setPending(true);
    setError("");
    try {
      await apiJson<{ participant: ParticipantSnapshot; distribution: Distribution }>(
        "/api/answer", { questionId, optionIndex: selection, round: event.round },
      );
      await load();
    } catch (caught) {
      await load(undefined, true);
      setError(friendlyError(caught));
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  return { event, participant, phase, questionId, selection, distribution, pending, error, syncError,
    select: setSelection, register, submit, reload: () => void load() };
}
