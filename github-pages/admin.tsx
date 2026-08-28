import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import AdminDashboard from "../app/components/admin-dashboard";
import type { AdminSnapshot } from "../app/lib/contracts";
import { apiJson, apiOrigin, friendlyError } from "../app/lib/client";
import PagesLink from "./link";

export default function PagesAdmin() {
  const [snapshot, setSnapshot] = useState<AdminSnapshot | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void apiJson<AdminSnapshot>("/api/admin", undefined, controller.signal)
      .then((data) => { if (!controller.signal.aborted) setSnapshot(data); })
      .catch((caught) => { if (!controller.signal.aborted) setError(friendlyError(caught)); });
    return () => controller.abort();
  }, [attempt]);

  if (snapshot) {
    const participationUrl = new URL(window.location.pathname, window.location.origin);
    participationUrl.hash = "/participate";
    return <AdminDashboard initial={snapshot} participationUrl={participationUrl.toString()}
      exportUrl={`${apiOrigin}/api/admin/export`} />;
  }
  return (
    <main className="shell access-page">
      <PagesLink href="/" className="back-link"><ArrowLeft size={15} aria-hidden="true" /> 이벤트 소개</PagesLink>
      <section className="panel state-panel">
        <h1>{error ? "운영실 연결을 확인해 주세요." : "운영실을 불러오고 있습니다."}</h1>
        {error ? <>
          <p role="alert">{error}</p>
          <button className="button button-primary" onClick={() => { setError(""); setAttempt((value) => value + 1); }}>
            다시 연결하기
          </button>
        </> : <p role="status">행사 진행 상태와 참가 현황을 확인하고 있습니다.</p>}
      </section>
    </main>
  );
}
