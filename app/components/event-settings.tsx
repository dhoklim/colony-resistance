"use client";
import { useState } from "react";
import { Save, Settings2 } from "lucide-react";
import type { PublicEvent, Settings } from "../lib/contracts";

export default function EventSettings({
  event,
  pending,
  onSave,
}: {
  event: PublicEvent;
  pending: boolean;
  onSave: (settings: Settings) => void;
}) {
  const [settings, setSettings] = useState<Settings>({
    ...event.settings,
    retentionDays: event.settings.retentionDays || 30,
  });
  const editable = event.status === "draft";
  function field(key: keyof Settings, value: string | number) {
    setSettings((current) => ({ ...current, [key]: value }));
  }
  return (
    <section className="panel settings-panel" aria-labelledby="settings-title">
      <div className="section-heading">
        <h2 id="settings-title">
          <Settings2 size={19} aria-hidden="true" /> 행사 운영 안내
        </h2>
        <span className="badge">{editable ? "시작 전 설정" : "확정됨"}</span>
      </div>
      <p className="small-note">
        참가자의 동의 화면에 표시되는 정보입니다. 실제 운영 주체와 연락 가능한
        문의처를 입력해 주세요.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (editable && !pending) onSave(settings);
        }}
      >
        <div className="field">
          <label htmlFor="organizer">운영 주체</label>
          <input
            id="organizer"
            value={settings.organizer}
            onChange={(event) => field("organizer", event.target.value)}
            required
            maxLength={80}
            disabled={!editable || pending}
            placeholder="학과명 / 학생회명"
          />
        </div>
        <div className="field">
          <label htmlFor="privacy-contact">개인정보 문의처</label>
          <input
            id="privacy-contact"
            value={settings.privacyContact}
            onChange={(event) => field("privacyContact", event.target.value)}
            required
            maxLength={160}
            disabled={!editable || pending}
            placeholder="운영자 이메일 또는 공식 연락처"
          />
        </div>
        <div className="field">
          <label htmlFor="retention-days">
            행사 종료 후 개인정보 보관 기간 (일)
          </label>
          <input
            id="retention-days"
            type="number"
            min={1}
            max={365}
            value={settings.retentionDays}
            onChange={(event) =>
              field("retentionDays", Number(event.target.value))
            }
            required
            disabled={!editable || pending}
          />
          <small>
            약속한 기간이 지나면 운영자가 수집 정보와 내려받은 파일을 삭제해야
            합니다.
          </small>
        </div>
        <div className="field">
          <label htmlFor="instagram-url">학과 공식 인스타그램</label>
          <input
            id="instagram-url"
            type="url"
            value={settings.instagramUrl}
            onChange={(event) => field("instagramUrl", event.target.value)}
            disabled={!editable || pending}
            placeholder="https://www.instagram.com/학과계정/"
          />
          <small>입력하면 완료 화면에 결과 발표 링크가 표시됩니다.</small>
        </div>
        {editable ? (
          <button
            type="submit"
            className="button button-secondary full-width"
            disabled={pending}
          >
            <span>{pending ? "저장 중…" : "운영 안내 저장"}</span>
            <Save size={16} aria-hidden="true" />
          </button>
        ) : (
          <p className="small-note">
            개인정보 동의 내용 보존을 위해 행사 시작 후에는 수정할 수 없습니다.
          </p>
        )}
      </form>
    </section>
  );
}
