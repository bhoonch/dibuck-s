"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { compareSync } from "bcryptjs";
import { db } from "@/lib/db";
import { logAccess } from "@/lib/access-log";
import { createSession, destroySession } from "@/lib/auth";
import { normalizeEmail } from "@/lib/utils";
import { rateLimit, rateLimitReset } from "@/lib/rate-limit";

export async function login(
  _prev: { error?: string } | undefined,
  formData: FormData,
) {
  const email = normalizeEmail(formData.get("email"));
  const password = String(formData.get("password") ?? "");
  if (!email || !password)
    return { error: "이메일과 비밀번호를 입력해 주세요." };

  // 계정당 10분에 10회 — 인터넷에 열린 셀프서비스라 무제한 대입을 막는다
  if (rateLimit(`login:${email}`, 10, 10 * 60_000) === 0)
    return {
      error: "로그인 시도가 너무 많습니다. 10분 후에 다시 시도해 주세요.",
    };
  // IP당 한도도 함께 — 계정 키만으로는 "수만 계정 × 1회"(크리덴셜 스터핑)를
  // 전혀 막지 못한다 (signup이 IP로 묶는 것과 같은 이유)
  const h = await headers();
  const ip =
    (h.get("x-forwarded-for") ?? h.get("x-real-ip") ?? "").split(",")[0].trim() ||
    "unknown";
  if (rateLimit(`login-ip:${ip}`, 30, 10 * 60_000) === 0)
    return {
      error: "로그인 시도가 너무 많습니다. 10분 후에 다시 시도해 주세요.",
    };

  const user = await db.user.findUnique({
    where: { email },
    include: { tenant: { select: { status: true } } },
  });
  if (!user || !compareSync(password, user.passwordHash)) {
    await logAccess("login_fail", { email });
    return { error: "이메일 또는 비밀번호가 올바르지 않습니다." };
  }
  rateLimitReset(`login:${email}`);
  if (user.tenant?.status === "SUSPENDED")
    return {
      error:
        "이용이 중지된 단지입니다. 디벅 운영팀(support@dibuck.kr)으로 문의해 주세요.",
    };

  await logAccess("login", { userId: user.id, tenantId: user.tenantId, email });
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
