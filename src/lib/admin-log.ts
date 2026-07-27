import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

/**
 * 운영자 감사 로그.
 *
 * 남기는 기준: **남의 단지에 영향을 주는 일.** 조회는 남기지 않는다(임퍼서네이션 진입은
 * 조회 이상의 권한이라 예외). 운영자 자기 계정 변경 같은 건 대상이 아니다.
 */
export const adminActions = {
  impersonate: "사용자 화면 진입",
  impersonate_stop: "사용자 화면 종료",
  tenant_status: "단지 상태 변경",
  module_toggle: "모듈 구독 변경",
  module_trial: "체험 기간 변경",
  password_reset: "비밀번호 재설정",
  staff_add: "직원 계정 발급",
} as const;

export type AdminAction = keyof typeof adminActions;

/**
 * 실패해도 원래 작업을 막지 않는다 — 로그 한 줄 때문에 단지 이용 중지가 안 되면
 * 그게 더 큰 사고다. 대신 서버 로그에는 반드시 남긴다.
 */
export async function logAdmin(
  action: AdminAction,
  info: { tenantId?: string; tenantName?: string; detail?: string } = {},
) {
  try {
    const session = await getSession();
    if (!session) return;
    // 임퍼서네이션 중에도 세션의 userId는 관리자 본인이라 신원이 흐려지지 않는다
    await db.adminLog.create({
      data: {
        adminId: session.userId,
        adminName: session.name,
        action,
        tenantId: info.tenantId ?? null,
        tenantName: info.tenantName ?? null,
        detail: info.detail ?? null,
      },
    });
  } catch (err) {
    console.error("[admin-log] 기록 실패", action, info, err);
  }
}
