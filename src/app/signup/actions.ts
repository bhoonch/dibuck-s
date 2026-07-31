"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { hashSync } from "bcryptjs";
import { createSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { normalizeEmail } from "@/lib/utils";

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
  const email = normalizeEmail(formData.get("email"));
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  // "이미 사용 중인 이메일" 응답은 계정 존재를 알려 준다 — 문구를 흐리면 정상
  // 가입자가 헤매므로 그대로 두고, 대신 시도 횟수를 IP로 묶는다(이메일 키는
  // 열거에 무력하다 — 이메일마다 1회면 충분하니까). 진짜 관리사무소가 10분에
  // 20번 가입을 누를 일은 없다.
  const h = await headers();
  const ip =
    (h.get("x-forwarded-for") ?? h.get("x-real-ip") ?? "").split(",")[0].trim() ||
    "unknown";
  if (rateLimit(`signup:${ip}`, 20, 10 * 60_000) === 0)
    return { error: "시도가 너무 많습니다. 잠시 후 다시 시도해 주세요." };

  if (!tenantName || !name || !email || !password)
    return { error: "모든 항목을 입력해 주세요." };
  if (tenantName.length > 50) return { error: "단지명이 너무 깁니다." };
  if (password.length < 8)
    return { error: "비밀번호는 8자 이상이어야 합니다." };
  if (password !== confirm) return { error: "비밀번호가 서로 다릅니다." };
  // 사전 조회만으로는 동시 가입을 막지 못한다 — 유니크 제약(P2002)까지 받아서 처리한다
  if (await db.user.findUnique({ where: { email } }))
    return { error: "이미 사용 중인 이메일입니다. 로그인해 주세요." };

  let user;
  try {
    user = await db.user.create({
      data: {
        email,
        name,
        role: "DIRECTOR",
        passwordHash: hashSync(password, 10),
        tenant: { create: { name: tenantName } },
      },
    });
  } catch (e) {
    if (typeof e === "object" && e !== null && "code" in e && e.code === "P2002")
      return { error: "이미 사용 중인 이메일입니다. 로그인해 주세요." };
    throw e;
  }

  await createSession({
    userId: user.id,
    tenantId: user.tenantId,
    role: "DIRECTOR",
    name: user.name,
  });
  redirect("/home");
}
