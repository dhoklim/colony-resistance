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
      const last =
        me.participant &&
        !me.participant.completed &&
        eventData.event.status !== "closed" &&
        eventData.event.status !== "drawn"
          ? me.participant.answers.at(-1)
          : undefined;
      const result = last
        ? await apiJson<{ distribution: Distribution }>(
            `/api/answer?questionId=${last.questionId}`,
            undefined,
            signal,
          )
        : null;
      if (signal?.aborted) return;
      // Finish the reads before changing round, which restarts the polling effect.
      setError("");
      setSyncError("");
      setEvent(eventData.event);
      setParticipant(me.participant);
      if (!me.participant) {
        setQuestionId(1);
        setSelection(null);
        setDistribution(null);
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
      if (last && result) {
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
    if (phase === "loading") return;
    const controller = new AbortController();
    let active = false;
    const refresh = async () => {
      if (document.hidden || active || busy.current) return;
      active = true;
      try {
        const [eventData, me] = await Promise.all([
          apiJson<{ event: PublicEvent }>("/api/event", undefined, controller.signal),
          phase === "registration"
            ? Promise.resolve(null)
            : apiJson<{ participant: ParticipantSnapshot | null }>(
                "/api/participant",
                undefined,
                controller.signal,
              ),
        ]);
        if (controller.signal.aborted) return;
        if (eventData.event.round !== event?.round || (me && !me.participant)) {
          await load(controller.signal);
          return;
        }
        setEvent(eventData.event);
        if (
          phase === "question" &&
          (eventData.event.status === "closed" || eventData.event.status === "drawn")
        ) {
          await load(controller.signal);
          return;
        }
        if (me?.participant) setParticipant(me.participant);
        if (phase === "result") {
          const result = await apiJson<{ distribution: Distribution }>(
            `/api/answer?questionId=${questionId}`,
            undefined,
            controller.signal,
          );
          if (controller.signal.aborted) return;
          setDistribution(result.distribution);
        }
        setSyncError("");
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
  }, [phase, questionId, event?.round, load]);

  async function register(nickname: string) {
    if (busy.current || !event) return;
    busy.current = true;
    setPending(true);
    setError("");
    try {
      const data = await apiJson<{ participant: ParticipantSnapshot }>(
        "/api/participant",
        { nickname, round: event.round },
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
    if (busy.current || !event || phase !== "question" || selection === null) return;
    busy.current = true;
    setPending(true);
    setError("");
    try {
      const data = await apiJson<{
        participant: ParticipantSnapshot;
        distribution: Distribution;
      }>("/api/answer", { questionId, optionIndex: selection, round: event.round });
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
    if (phase !== "result" || !distribution?.revealed) return;
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
