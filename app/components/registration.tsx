"use client";
import { useState } from "react";
import { ArrowUpRight, Fingerprint, LockKeyhole } from "lucide-react";
import type { PublicEvent } from "../lib/contracts";

export function Registration({
  event,
  pending,
  onRegister,
}: {
  event: PublicEvent;
  pending: boolean;
  onRegister: (
    name: string,
    studentId: string,
    consent: boolean,
  ) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [studentId, setStudentId] = useState("");
  const [consent, setConsent] = useState(false);
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
        당첨자 확인을 위한 정보를 입력해 주세요.
        <br />
        {event.publicAdmin
          ? "입력한 정보는 공개 운영실에서 누구나 조회할 수 있습니다."
          : "다른 참가자에게는 공개되지 않습니다."}
      </p>
      {event.publicAdmin && (
        <div
          className="alert alert-warning"
          role="note"
          aria-label="공개 운영실 안내"
        >
          이름·학번·완료 문항 수·점수·당첨 결과는 인터넷 이용자 누구나 조회하고
          다운로드할 수 있습니다. 운영실의 전체 응답 통계도 공개됩니다.
          누구나 행사 시작·마감·추첨을 실행할 수 있으므로 이를 확인하고 참여해 주세요.
        </div>
      )}
      <form
        onSubmit={(submit) => {
          submit.preventDefault();
          if (!pending && consent && name.trim() && studentId.trim())
            void onRegister(name, studentId, consent);
        }}
      >
        <div className="field">
          <label htmlFor="participant-name">이름</label>
          <input
            id="participant-name"
            autoComplete="name"
            maxLength={40}
            required
            placeholder="이름을 입력하세요"
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={pending}
          />
        </div>
        <div className="field">
          <label htmlFor="participant-student-id">학번</label>
          <input
            id="participant-student-id"
            autoComplete="off"
            minLength={4}
            maxLength={24}
            required
            placeholder="학번을 입력하세요"
            value={studentId}
            onChange={(event) => setStudentId(event.target.value)}
            disabled={pending}
          />
          <small>학번당 한 번 참여할 수 있습니다.</small>
        </div>
        <details className="privacy-details">
          <summary>개인정보 수집·이용 안내</summary>
          <dl>
            <dt>수집 항목</dt>
            <dd>이름, 학번, 응답 기록</dd>
            <dt>이용 목적</dt>
            <dd>중복 참여 방지, 점수 산정 및 당첨자 확인</dd>
            <dt>열람 범위</dt>
            <dd>
              {event.publicAdmin
                ? "공개 운영실과 명단 파일을 통해 누구나 열람·다운로드 가능"
                : "허용된 운영자만 열람 가능"}
            </dd>
            <dt>운영 주체</dt>
            <dd>{event.settings.organizer}</dd>
            <dt>문의처</dt>
            <dd>{event.settings.privacyContact}</dd>
            <dt>보관 기간</dt>
            <dd>
              행사 종료 후 {event.settings.retentionDays}일. 기간 종료 후
              운영자가 개인정보를 삭제합니다.
            </dd>
          </dl>
          <p>
            동의를 거부할 수 있으나 이벤트 참여 및 추첨 대상 등록은 제한됩니다.
          </p>
        </details>
        <label className="consent">
          <input
            type="checkbox"
            checked={consent}
            onChange={(event) => setConsent(event.target.checked)}
            required
            disabled={pending}
          />
          <span>
            {event.publicAdmin
              ? "개인정보 수집·이용 및 이름·학번·참여 현황·점수·당첨 결과의 공개에 동의합니다."
              : "개인정보 수집 및 이용에 동의합니다."}
          </span>
        </label>
        <button
          className="button button-primary full-width"
          type="submit"
          disabled={pending || !consent || !name.trim() || !studentId.trim()}
        >
          {pending ? "참여 정보를 저장하는 중" : "실험 시작하기"}
          <ArrowUpRight size={19} aria-hidden="true" />
        </button>
        <p className="form-note">
          <LockKeyhole size={12} aria-hidden="true" />
          같은 브라우저에서 이어서 참여할 수 있습니다.
        </p>
      </form>
    </section>
  );
}
