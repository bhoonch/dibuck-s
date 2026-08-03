import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { db } from "@/lib/db";
import { Role } from "@/generated/prisma/enums";

export type Session = {
  userId: string;
  tenantId: string | null;
  role: Role;
  name: string;
  impersonating?: boolean; // 관리자가 단지 화면을 보는 중
};

const COOKIE = "session";
const MAX_AGE = 60 * 60 * 24 * 7; // 7일
const secret = () => new TextEncoder().encode(process.env.AUTH_SECRET!);

export async function createSession(session: Session) {
  const token = await new SignJWT(session)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt() // 비밀번호 변경 시각과 비교해 옛 세션을 끊는다
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: MAX_AGE,
    path: "/",
  });
}

export async function destroySession() {
  (await cookies()).delete(COOKIE);
}

/**
 * 쿠키의 JWT를 검증한 뒤 **DB로 한 번 더 확인**한다. 토큰만 믿으면 7일 동안
 * 계정 삭제·권한 강등·단지 이용 중지가 전부 무시된다(토큰은 무효화할 방법이 없다).
 * `cache()`로 감싸 한 요청 안에서는 조회가 1회뿐이다.
 */
export const getSession = cache(async (): Promise<Session | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;

  let claims: Session;
  let issuedAt = 0;
  try {
    const { payload } = await jwtVerify<Session>(token, secret());
    claims = {
      userId: payload.userId,
      tenantId: payload.tenantId,
      role: payload.role,
      name: payload.name,
      impersonating: payload.impersonating,
    };
    issuedAt = (payload.iat ?? 0) * 1000;
  } catch {
    return null;
  }

  // 임퍼서네이션 중에는 토큰의 권한(단지 DIRECTOR)이 DB의 실제 권한(SUPER_ADMIN)과
  // 다른 게 정상이다. 발급자가 아직 운영자인지 확인하고 토큰 값을 그대로 쓰되,
  // 비밀번호 변경 전 발급 토큰 무효화는 일반 세션과 같은 규칙 — 운영자 계정이
  // 탈취돼 비밀번호를 재설정했는데 대리 세션만 7일을 더 살면 안 된다.
  if (claims.impersonating) {
    const admin = await db.user.findUnique({
      where: { id: claims.userId },
      select: { role: true, passwordChangedAt: true },
    });
    if (admin?.role !== Role.SUPER_ADMIN) return null;
    if (issuedAt + 1000 < admin.passwordChangedAt.getTime()) return null;
    return claims;
  }

  const user = await db.user.findUnique({
    where: { id: claims.userId },
    select: {
      role: true,
      tenantId: true,
      name: true,
      passwordChangedAt: true,
      tenant: { select: { status: true } },
    },
  });
  if (!user) return null; // 삭제된 계정
  if (user.tenant?.status === "SUSPENDED") return null; // 이용 중지된 단지
  // 비밀번호 변경 전에 발급된 토큰은 무효 — 재설정이 탈취 세션을 실제로 끊는다.
  // iat는 초 단위라 같은 초에 재발급된 토큰이 잘리지 않도록 1초 여유를 둔다.
  if (issuedAt + 1000 < user.passwordChangedAt.getTime()) return null;

  // 권한·소속은 항상 DB가 정답 — 강등이나 단지 이동이 즉시 반영된다
  return {
    ...claims,
    role: user.role,
    tenantId: user.tenantId,
    name: user.name,
  };
});

export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

/**
 * 단지 화면·액션의 입구. tenantId 없는 세션(SUPER_ADMIN)은 관리자 화면으로.
 * (app)/layout.tsx의 검사만 믿으면 안 된다 — 레이아웃은 인증 경계가 아니라
 * 소프트 내비게이션에서 다시 실행되지 않고, /home이 null tenantId로
 * Prisma 쿼리를 던져 터진 적이 있다(2026-08-03).
 */
export async function requireTenantSession(): Promise<
  Session & { tenantId: string }
> {
  const session = await requireSession();
  if (!session.tenantId) redirect("/admin");
  return session as Session & { tenantId: string };
}

/** 역할 검사 — 권한 없으면 홈으로 돌려보냄 */
export async function requireRole(...roles: Role[]): Promise<Session> {
  const session = await requireSession();
  if (!roles.includes(session.role)) redirect("/home");
  return session;
}

/**
 * 관리자 콘솔 가드. 레이아웃은 인증 경계가 아니다 — 소프트 내비게이션에서 다시 실행되지
 * 않으므로(Next.js 인증 가이드 "Layouts and auth checks") /admin 페이지마다 직접 호출한다.
 */
export const requireAdmin = () => requireRole(Role.SUPER_ADMIN);
