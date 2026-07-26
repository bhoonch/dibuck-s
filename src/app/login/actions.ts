"use server";

import { redirect } from "next/navigation";
import { compareSync } from "bcryptjs";
import { db } from "@/lib/db";
import { createSession, destroySession } from "@/lib/auth";

export async function login(
  _prev: { error?: string } | undefined,
  formData: FormData,
) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password)
    return { error: "이메일과 비밀번호를 입력해 주세요." };

  const user = await db.user.findUnique({
    where: { email },
    include: { tenant: { select: { status: true } } },
  });
  if (!user || !compareSync(password, user.passwordHash))
    return { error: "이메일 또는 비밀번호가 올바르지 않습니다." };
  if (user.tenant?.status === "SUSPENDED")
    return { error: "이용이 중지된 단지입니다. 관리사무소로 문의해 주세요." };

  await createSession({
    userId: user.id,
    tenantId: user.tenantId,
    role: user.role,
    name: user.name,
  });
  redirect("/home");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}
