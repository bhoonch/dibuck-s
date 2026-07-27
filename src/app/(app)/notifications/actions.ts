"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";

export async function markAllRead() {
  const session = await requireSession();
  await db.notification.updateMany({
    where: { userId: session.userId, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath("/notifications");
}

/**
 * 알림 하나를 읽음 처리하고 연결된 화면으로 보낸다.
 * 이게 없으면 알림을 다 눌러 봐도 헤더 미읽음 배지가 그대로 남는다.
 */
export async function openNotification(formData: FormData) {
  const session = await requireSession();
  const id = String(formData.get("id"));
  const link = String(formData.get("link") ?? "");
  // userId 조건이 소유권 검사 — 남의 알림 id를 넣어도 아무것도 안 바뀐다
  await db.notification.updateMany({
    where: { id, userId: session.userId, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath("/", "layout"); // 헤더 배지
  redirect(link || "/notifications");
}
