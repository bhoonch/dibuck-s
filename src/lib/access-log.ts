import { headers } from "next/headers";
import { db } from "@/lib/db";

/**
 * 접속기록 — 개인정보보호법 안전성 확보조치 기준(개인정보처리시스템 접속기록,
 * 1년 이상 보관). 남기는 기준: **인증 시도와 개인정보의 대량 반출입.**
 * 일반 화면 조회는 남기지 않는다 — 전 요청 로깅은 이 기준의 요구가 아니고
 * 테이블만 불린다. 파기는 billing 크론이 2년 경과분을 지운다.
 */
export const accessActions = {
  login: "로그인 성공",
  login_fail: "로그인 실패",
  password_reset: "비밀번호 재설정 실행",
  postal_export: "내용증명 수신인 엑셀 다운로드",
  units_upload: "세대 명부 업로드",
  impersonate: "운영자 사용자 화면 진입",
} as const;

export type AccessAction = keyof typeof accessActions;

/** 실패해도 원 작업을 막지 않는다 — 로그 한 줄 때문에 로그인이 안 되면 그게 더 큰 사고다 (admin-log와 동일) */
export async function logAccess(
  action: AccessAction,
  info: {
    tenantId?: string | null;
    userId?: string;
    email?: string;
    detail?: string;
  } = {},
) {
  try {
    const h = await headers();
    const ip = (h.get("x-forwarded-for") ?? h.get("x-real-ip") ?? "")
      .split(",")[0]
      .trim();
    await db.accessLog.create({
      data: {
        tenantId: info.tenantId ?? null,
        userId: info.userId ?? null,
        email: info.email ?? null,
        action,
        detail: info.detail ?? null,
        ip: ip || null,
      },
    });
  } catch (err) {
    console.error("[access-log] 기록 실패", action, err);
  }
}
