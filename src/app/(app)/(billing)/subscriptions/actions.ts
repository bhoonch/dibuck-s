"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { Role } from "@/generated/prisma/enums";

export async function setSubscription(moduleId: string, subscribe: boolean) {
  const session = await requireRole(Role.DIRECTOR);
  const tenantId = session.tenantId!;
  const where = { tenantId_moduleId: { tenantId, moduleId } };

  if (!subscribe) {
    // 없는 구독을 해지해도 P2025 500이 나지 않게 — 중복 제출·오래된 탭에서 들어온다
    await db.tenantModule.updateMany({
      where: { tenantId, moduleId },
      data: { status: "CANCELED" },
    });
  } else {
    const existing = await db.tenantModule.findUnique({ where });
    if (existing) {
      // 체험이 끝난 모듈은 카드가 있어야 다시 켤 수 있다. 이 가드가 없으면
      // 만료 잠금을 구독 토글 한 번으로 우회해 무료로 계속 쓰게 된다.
      const billing = await db.billing.findUnique({ where: { tenantId } });
      if (
        existing.trialEndsAt &&
        existing.trialEndsAt <= new Date() &&
        !billing?.billingKey
      )
        throw new Error(
          "무료 체험이 종료된 모듈입니다. 구독·결제 > 결제에서 카드를 등록해 주세요.",
        );
      // 재구독 — 체험은 모듈당 최초 1회뿐, 남은 체험 기간이 있으면 그대로 이어진다
      await db.tenantModule.update({ where, data: { status: "ACTIVE" } });
    } else {
      // 체험 표준 기간은 모듈 관리에서 설정 — 전 단지 동일 적용, 0이면 체험 없이 시작.
      // isActive 검사는 목록 필터가 아니라 여기 있어야 한다 — 서버 액션은 직접 호출 가능이라
      // 판매 중단한 모듈 id를 넣으면 새 체험까지 받아 갈 수 있다
      const mod = await db.module.findUnique({
        where: { id: moduleId, isActive: true },
      });
      if (!mod) throw new Error("구독할 수 없는 모듈입니다.");
      let trialEndsAt: Date | null = null;
      if (mod.trialDays > 0) {
        trialEndsAt = new Date();
        trialEndsAt.setDate(trialEndsAt.getDate() + mod.trialDays);
      }
      await db.tenantModule.create({ data: { tenantId, moduleId, trialEndsAt } });
    }
  }
  revalidatePath("/", "layout"); // 사이드바·홈·구독 화면 모두 갱신
}
