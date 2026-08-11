"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTenantSession } from "@/lib/auth";
import { db } from "@/lib/db";

export async function markAllRead() {
  const session = await requireTenantSession();
  await db.notification.updateMany({
    where: { userId: session.userId, readAt: null },
    data: { readAt: new Date() },
  });
  // 페이지만이 아니라 레이아웃까지 — 헤더 배지·슬라이드 창 목록이 레이아웃 데이터다
  revalidatePath("/", "layout");
}

/**
 * 알림 하나를 읽음 처리하고 연결된 화면으로 보낸다.
 * 이게 없으면 알림을 다 눌러 봐도 헤더 미읽음 배지가 그대로 남는다.
 */
export async function openNotification(formData: FormData) {
  const session = await requireTenantSession();
  const id = String(formData.get("id"));
  const link = String(formData.get("link") ?? "");
  // userId 조건이 소유권 검사 — 남의 알림 id를 넣어도 아무것도 안 바뀐다
  await db.notification.updateMany({
    where: { id, userId: session.userId, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath("/", "layout"); // 헤더 배지
  // 앱 내부 경로만 — 폼 값이라 외부 URL을 넣으면 오픈 리다이렉트가 된다
  // ("//host"는 프로토콜 상대 URL이라 같이 막는다 — postAnnouncement와 동일 검증)
  const safe = link.startsWith("/") && !link.startsWith("//");
  redirect(safe ? link : "/notifications");
}
