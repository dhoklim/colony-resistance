import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, LockKeyhole } from "lucide-react";
import {
  chatGPTSignInPath,
  chatGPTSignOutPath,
  getChatGPTUser,
} from "../chatgpt-auth";
import { adminEmails, createApi, participationUrl } from "../server/context";
import { isAllowedAdmin } from "../server/auth";
import AdminDashboard from "../components/admin-dashboard";

export const metadata: Metadata = {
  title: "이벤트 운영실",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await getChatGPTUser();
  const allowed = adminEmails();
  if (!isAllowedAdmin(user, allowed)) {
    return (
      <main className="shell access-page">
        <Link prefetch={false} href="/" className="back-link">
          <ArrowLeft size={15} aria-hidden="true" /> 이벤트 소개
        </Link>
        <section className="panel state-panel">
          <LockKeyhole size={40} className="state-icon" aria-hidden="true" />
          <p className="eyebrow">AUTHORIZED PERSONNEL ONLY</p>
          <h1>
            {user ? "운영자 권한이 필요합니다." : "운영자로 로그인해 주세요."}
          </h1>
          <p>
            참가자 명단과 행사 제어는 허용된 운영자 계정에서만 열 수 있습니다.
          </p>
          {user && (
            <p className="access-email">
              현재 계정: {user.email}
              <br />
              {allowed.length
                ? "등록된 운영자 계정으로 로그인하거나 사이트 관리자에게 문의해 주세요."
                : "사이트 설정의 ADMIN_EMAILS에 운영자 이메일을 등록해 주세요."}
            </p>
          )}
          <a
            href={
              user ? chatGPTSignOutPath("/admin") : chatGPTSignInPath("/admin")
            }
            className="button button-primary"
          >
            {user ? "다른 계정으로 로그인" : "ChatGPT 계정으로 로그인"}
          </a>
        </section>
      </main>
    );
  }
  const snapshot = await createApi().service.getAdminSnapshot();
  return (
    <AdminDashboard
      initial={snapshot}
      email={user!.email}
      participationUrl={participationUrl()}
    />
  );
}
