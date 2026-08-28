"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  Distribution,
  ParticipantSnapshot,
  PublicEvent,
} from "../lib/contracts";
import { apiJson, friendlyError } from "../lib/client";

export function useParticipation() {
  const [event, setEvent] = useState<PublicEvent | null>(null);
  const [participant, setParticipant] = useState<ParticipantSnapshot | null>(
    null,
  );
  const [phase, setPhase] = useState<
    "loading" | "registration" | "question" | "result" | "complete" | "closed"
  >("loading");
  const [questionId, setQuestionId] = useState(1);
  const [selection, setSelection] = useState<number | null>(null);
  const [distribution, setDistribution] = useState<Distribution | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [syncError, setSyncError] = useState("");
  const busy = useRef(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const [eventData, me] = await Promise.all([
        apiJson<{ event: PublicEvent }>("/api/event", undefined, signal),
        apiJson<{ participant: ParticipantSnapshot | null }>(
          "/api/participant",
          undefined,
          signal,
        ),
      ]);
      if (signal?.aborted) return;
      setError("");
      setEvent(eventData.event);
      setParticipant(me.participant);
      if (!me.participant) {
        setPhase("registration");
        return;
      }
      if (me.participant.completed) {
        setPhase("complete");
        return;
      }
      if (
        eventData.event.status === "closed" ||
        eventData.event.status === "drawn"
      ) {
        setPhase("closed");
        return;
      }
      const last = me.participant.answers.at(-1);
      if (last) {
        const result = await apiJson<{ distribution: Distribution }>(
          `/api/answer?questionId=${last.questionId}`,
          undefined,
          signal,
        );
        if (signal?.aborted) return;
        setQuestionId(last.questionId);
        setSelection(last.optionIndex);
        setDistribution(result.distribution);
        setPhase("result");
      } else {
        setQuestionId(1);
        setSelection(null);
        setDistribution(null);
        setPhase("question");
      }
    } catch (caught) {
      if (!signal?.aborted) setError(friendlyError(caught));
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    // The loader updates state only after network completion or rejection.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  useEffect(() => {
    if (!["registration", "result", "complete"].includes(phase)) return;
    if (
      phase === "registration" &&
      event?.status !== "draft" &&
      event?.status !== "open"
    )
      return;
    if (
      (phase === "result" && distribution?.final) ||
      (phase === "complete" && participant?.final)
    )
      return;
    const controller = new AbortController();
    let active = false;
    const refresh = async () => {
      if (document.hidden || active) return;
      active = true;
      try {
        if (phase === "registration") {
          const data = await apiJson<{ event: PublicEvent }>(
            "/api/event",
            undefined,
            controller.signal,
          );
          if (!controller.signal.aborted) setEvent(data.event);
        } else {
          const [me, result] = await Promise.all([
            apiJson<{ participant: ParticipantSnapshot | null }>(
              "/api/participant",
              undefined,
              controller.signal,
            ),
            phase === "result"
              ? apiJson<{ distribution: Distribution }>(
                  `/api/answer?questionId=${questionId}`,
                  undefined,
                  controller.signal,
                )
              : Promise.resolve(null),
          ]);
          if (!controller.signal.aborted) {
            if (me.participant) setParticipant(me.participant);
            if (result) setDistribution(result.distribution);
          }
        }
        if (!controller.signal.aborted) setSyncError("");
      } catch {
        if (!controller.signal.aborted)
          setSyncError(
            "집계 연결이 잠시 끊겼습니다. 마지막 결과를 표시하고 있으며 자동으로 다시 연결합니다.",
          );
      } finally {
        active = false;
      }
    };
    const timer = setInterval(
      () => void refresh(),
      phase === "result" ? 3000 : 5000,
    );
    const visible = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      clearInterval(timer);
      controller.abort();
      document.removeEventListener("visibilitychange", visible);
    };
  }, [
    phase,
    questionId,
    event?.status,
    distribution?.final,
    participant?.final,
  ]);

  async function register(nickname: string) {
    if (busy.current || !event) return;
    busy.current = true;
    setPending(true);
    setError("");
    try {
      const data = await apiJson<{ participant: ParticipantSnapshot }>(
        "/api/participant",
        { nickname },
      );
      setParticipant(data.participant);
      setQuestionId(1);
      setSelection(null);
      setDistribution(null);
      setPhase("question");
    } catch (caught) {
      setError(friendlyError(caught));
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  async function submit() {
    if (busy.current || phase !== "question" || selection === null) return;
    busy.current = true;
    setPending(true);
    setError("");
    try {
      const data = await apiJson<{
        participant: ParticipantSnapshot;
        distribution: Distribution;
      }>("/api/answer", { questionId, optionIndex: selection });
      setParticipant(data.participant);
      setDistribution(data.distribution);
      setSelection(data.distribution.selectedIndex);
      setPhase("result");
    } catch (caught) {
      setError(friendlyError(caught));
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  function next() {
    if (phase !== "result") return;
    setError("");
    setSyncError("");
    if (questionId === 10) {
      setPhase("complete");
      return;
    }
    if (distribution?.final) {
      setPhase("closed");
      return;
    }
    setQuestionId((id) => id + 1);
    setSelection(null);
    setDistribution(null);
    setPhase("question");
  }

  return {
    event,
    participant,
    phase,
    questionId,
    selection,
    distribution,
    pending,
    error,
    syncError,
    select: setSelection,
    register,
    submit,
    next,
    reload: () => void load(),
  };
}
