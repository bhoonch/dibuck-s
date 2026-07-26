import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

/** 카카오 로그인 시작 — CSRF 방지용 state를 쿠키에 심고 카카오 인가 페이지로 보낸다 */
export async function GET(req: NextRequest) {
  const clientId = process.env.KAKAO_REST_API_KEY;
  if (!clientId)
    return NextResponse.redirect(new URL("/login?error=kakao_failed", req.url));

  const state = randomUUID();
  (await cookies()).set("kakao_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
    path: "/",
  });

  const authorize = new URL("https://kauth.kakao.com/oauth/authorize");
  authorize.searchParams.set("client_id", clientId);
  authorize.searchParams.set(
    "redirect_uri",
    new URL("/api/auth/kakao/callback", req.url).toString(),
  );
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("scope", "account_email");
  return NextResponse.redirect(authorize);
}
