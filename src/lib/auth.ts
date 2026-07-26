import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import type { Role } from "@/generated/prisma/enums";

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

export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify<Session>(token, secret());
    return {
      userId: payload.userId,
      tenantId: payload.tenantId,
      role: payload.role,
      name: payload.name,
      impersonating: payload.impersonating,
    };
  } catch {
    return null;
  }
}

export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

/** 역할 검사 — 권한 없으면 홈으로 돌려보냄 */
export async function requireRole(...roles: Role[]): Promise<Session> {
  const session = await requireSession();
  if (!roles.includes(session.role)) redirect("/home");
  return session;
}
