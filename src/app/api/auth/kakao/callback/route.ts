import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { normalizeEmail } from "@/lib/utils";

const fail = (req: NextRequest, error: string) =>
  NextResponse.redirect(new URL(`/login?error=${error}`, req.url));

/**
 * 카카오 콜백 — 코드 교환 → 카카오 계정 조회 → 디벅 계정 매칭.
 * B2B라 자가 가입은 없다: kakaoId로 연결된 계정 → 없으면 이메일이 같은 기존 계정에
 * 최초 1회 연결 → 그것도 없으면 "등록된 계정 없음"으로 돌려보낸다.
 */
export async function GET(req: NextRequest) {
  const clientId = process.env.KAKAO_REST_API_KEY;
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const cookieStore = await cookies();
  const savedState = cookieStore.get("kakao_state")?.value;
  cookieStore.delete("kakao_state");

  if (!clientId || !code || !state || state !== savedState)
    return fail(req, "kakao_failed");

  try {
    const tokenRes = await fetch("https://kauth.kakao.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: clientId,
        ...(process.env.KAKAO_CLIENT_SECRET && {
          client_secret: process.env.KAKAO_CLIENT_SECRET,
        }),
        redirect_uri: new URL("/api/auth/kakao/callback", req.url).toString(),
        code,
      }),
    });
    if (!tokenRes.ok) return fail(req, "kakao_failed");
    const { access_token } = (await tokenRes.json()) as { access_token: string };

    const meRes = await fetch("https://kapi.kakao.com/v2/user/me", {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    if (!meRes.ok) return fail(req, "kakao_failed");
    const me = (await meRes.json()) as {
      id: number;
      kakao_account?: {
        email?: string;
        is_email_valid?: boolean;
        is_email_verified?: boolean;
      };
    };
    const kakaoId = String(me.id);
    const acc = me.kakao_account;
    // 인증된 이메일만 기존 계정 연결에 쓴다 — 미인증 이메일을 믿으면
    // 남의 이메일을 등록한 카카오 계정으로 그 계정을 통째로 가져갈 수 있다
    const email =
      acc?.is_email_valid && acc?.is_email_verified && acc.email
        ? normalizeEmail(acc.email)
        : undefined;

    let user = await db.user.findUnique({
      where: { kakaoId },
      include: { tenant: { select: { status: true } } },
    });
    if (!user && email) {
      const byEmail = await db.user.findUnique({
        where: { email },
        include: { tenant: { select: { status: true } } },
      });
      if (byEmail) {
        await db.user.update({ where: { id: byEmail.id }, data: { kakaoId } });
        user = byEmail;
      }
    }
    if (!user) return fail(req, "kakao_no_account");
    if (user.tenant?.status === "SUSPENDED") return fail(req, "kakao_suspended");

    await createSession({
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role,
      name: user.name,
    });
    return NextResponse.redirect(new URL("/home", req.url));
  } catch {
    return fail(req, "kakao_failed");
  }
}
