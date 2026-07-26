"use server";

import { revalidatePath } from "next/cache";
import { compareSync, hashSync } from "bcryptjs";
import { createSession, requireSession } from "@/lib/auth";
import { db } from "@/lib/db";

type State = { error?: string; success?: boolean } | undefined;

/** 내 이름·직책 수정 — 사이드바에 바로 반영되도록 세션의 이름도 갱신한다 */
export async function updateMyProfile(_prev: State, formData: FormData) {
  const session = await requireSession();
  const name = String(formData.get("name") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim() || null;
  if (!name) return { error: "이름을 입력해 주세요." };

  await db.user.update({
    where: { id: session.userId },
    data: { name, title },
  });
  await createSession({ ...session, name });
  revalidatePath("/", "layout");
  return { success: true };
}

export async function changeMyPassword(_prev: State, formData: FormData) {
  const session = await requireSession();
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (next.length < 8) return { error: "새 비밀번호는 8자 이상이어야 합니다." };
  if (next !== confirm) return { error: "새 비밀번호가 서로 다릅니다." };

  const user = await db.user.findUniqueOrThrow({
    where: { id: session.userId },
  });
  if (!compareSync(current, user.passwordHash))
    return { error: "현재 비밀번호가 올바르지 않습니다." };

  await db.user.update({
    where: { id: session.userId },
    data: { passwordHash: hashSync(next, 10) },
  });
  return { success: true };
}
