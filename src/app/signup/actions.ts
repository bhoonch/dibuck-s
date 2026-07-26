"use server";

import { redirect } from "next/navigation";
import { hashSync } from "bcryptjs";
import { createSession } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * 셀프 회원가입 — 단지 + 소장 계정을 한 번에 만들고 바로 로그인.
 * 모듈은 구독 시점에 자동으로 30일 무료 체험이 시작된다(setSubscription).
 * ponytail: 이메일 인증 없음 — 가짜 가입이 실제로 생기면 그때 인증 추가
 */
export async function signup(
  _prev: { error?: string } | undefined,
  formData: FormData,
) {
  const tenantName = String(formData.get("tenantName") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (!tenantName || !name || !email || !password)
    return { error: "모든 항목을 입력해 주세요." };
  if (tenantName.length > 50) return { error: "단지명이 너무 깁니다." };
  if (password.length < 8)
    return { error: "비밀번호는 8자 이상이어야 합니다." };
  if (password !== confirm) return { error: "비밀번호가 서로 다릅니다." };
  if (await db.user.findUnique({ where: { email } }))
    return { error: "이미 사용 중인 이메일입니다. 로그인해 주세요." };

  const user = await db.user.create({
    data: {
      email,
      name,
      role: "DIRECTOR",
      passwordHash: hashSync(password, 10),
      tenant: { create: { name: tenantName } },
    },
  });

  await createSession({
    userId: user.id,
    tenantId: user.tenantId,
    role: "DIRECTOR",
    name: user.name,
  });
  redirect("/");
}
