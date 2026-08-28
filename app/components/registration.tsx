"use client";
import { useState } from "react";
import { ArrowUpRight, Fingerprint } from "lucide-react";
import type { PublicEvent } from "../lib/contracts";

export function Registration({
  event,
  pending,
  onRegister,
}: {
  event: PublicEvent;
  pending: boolean;
  onRegister: (nickname: string) => Promise<void>;
}) {
  const [nickname, setNickname] = useState("");
  return (
    <section className="registration panel">
      <div className="registration-emblem" aria-hidden="true">
        <Fingerprint size={52} strokeWidth={1} />
      </div>
      <p className="eyebrow">PARTICIPANT REGISTRATION</p>
      <h1>
        당신의 선택을
        <br />
        기록할 준비가 되었나요?
      </h1>
      <p className="section-description">
        닉네임을 정하고 입장해 주세요.
        <br />운영자가 공개하는 문제에 차례로 답합니다.
      </p>
      {event.progressStep >= 2 && <p className="small-note">이미 진행 중인 행사입니다. 지난 문항에는 답할 수 없으며, 추첨은 10문항 완료자 대상입니다.</p>}
      <form
        onSubmit={(submit) => {
          submit.preventDefault();
          if (!pending && nickname.trim()) void onRegister(nickname);
        }}
      >
        <div className="field">
          <label htmlFor="participant-nickname">닉네임</label>
          <input
            id="participant-nickname"
            autoComplete="off"
            maxLength={40}
            required
            placeholder="사용할 닉네임을 입력하세요"
            value={nickname}
            onChange={(event) => setNickname(event.target.value)}
            disabled={pending}
            aria-describedby="nickname-note"
          />
          <small id="nickname-note">
            {event.publicAdmin && "닉네임과 결과는 공개됩니다. "}
            실명·연락처는 입력하지 마세요.
          </small>
        </div>
        <button
          className="button button-primary full-width"
          type="submit"
          disabled={pending || !nickname.trim()}
        >
          {pending ? "참여 정보를 저장하는 중" : "실험 시작하기"}
          <ArrowUpRight size={19} aria-hidden="true" />
        </button>
        <p className="form-note">
          같은 브라우저에서 이어서 참여할 수 있습니다.
        </p>
      </form>
    </section>
  );
}
