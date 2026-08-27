"use client";
import { useEffect, useState } from "react";
import { Copy, Download, QrCode } from "lucide-react";
import QRCode from "qrcode";

export default function EventQr() {
  const [url, setUrl] = useState("");
  const [image, setImage] = useState("");
  const [local, setLocal] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    const link = new URL("/participate", window.location.origin).toString();
    const isLocal = ["localhost", "127.0.0.1", "[::1]"].includes(
      window.location.hostname,
    );
    void QRCode.toDataURL(link, {
      width: 800,
      margin: 4,
      errorCorrectionLevel: "M",
      color: { dark: "#07110b", light: "#ffffff" },
    })
      .then((result) => {
        if (active) {
          setUrl(link);
          setLocal(isLocal);
          setImage(result);
        }
      })
      .catch(() => {
        if (active) {
          setUrl(link);
          setLocal(isLocal);
          setMessage("QR 생성에 실패했습니다. 참여 주소를 복사해 주세요.");
        }
      });
    return () => {
      active = false;
    };
  }, []);
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setMessage("참여 주소를 복사했습니다.");
    } catch {
      setMessage(
        "주소 복사가 차단되었습니다. 아래 주소를 직접 선택해 복사해 주세요.",
      );
    }
  }
  return (
    <section className="panel qr-panel" aria-labelledby="qr-title">
      <div className="section-heading">
        <h2 id="qr-title">
          <QrCode size={19} aria-hidden="true" /> 참여 QR
        </h2>
        <span className="badge">{local ? "로컬 테스트용" : "참여 링크"}</span>
      </div>
      <div className="qr-preview">
        {/* A generated data URL must stay local; there is no image optimizer request. */}
        {image ? (
          // Generated QR data URLs are not external images and need no image proxy.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            width={200}
            height={200}
            alt="군체 저항도 이벤트 참여 QR 코드"
          />
        ) : (
          <p>QR 생성 중…</p>
        )}
      </div>
      <div className="field">
        <label htmlFor="participation-url">참여 주소</label>
        <input
          id="participation-url"
          value={url}
          readOnly
          onFocus={(event) => event.target.select()}
        />
      </div>
      <div className="button-row">
        <button
          className="button button-secondary button-small"
          disabled={!url}
          onClick={() => void copy()}
        >
          <Copy size={14} aria-hidden="true" /> 주소 복사
        </button>
        {image && (
          <a
            className="button button-secondary button-small"
            href={image}
            download="colony-participation-qr.png"
          >
            <Download size={14} aria-hidden="true" /> QR 저장
          </a>
        )}
      </div>
      {message && (
        <p className="small-note" role="status">
          {message}
        </p>
      )}
      <p className="small-note">
        {local
          ? "이 주소는 현재 컴퓨터에서만 열립니다. 행사장에는 배포된 사이트에서 만든 QR을 사용해 주세요."
          : "행사장에 게시하기 전 사이트 공개 범위를 확인하고, 로그아웃한 휴대폰에서 직접 접속해 주세요."}
      </p>
    </section>
  );
}
