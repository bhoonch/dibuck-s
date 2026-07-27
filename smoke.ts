import "dotenv/config";
import { SignJWT } from "jose";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./src/generated/prisma/client";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function token(email: string) {
  const user = await db.user.findUniqueOrThrow({ where: { email } });
  return new SignJWT({
    userId: user.id,
    tenantId: user.tenantId,
    role: user.role,
    name: user.name,
  })
    .setProtectedHeader({ alg: "HS256" })
    // createSession과 동일하게 iat를 넣는다 — 없는 토큰은 비밀번호 변경 검사에서
    // 안전한 쪽(거부)으로 처리된다 (src/lib/auth.ts)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(process.env.AUTH_SECRET!));
}

async function check(pages: string[], cookie: string) {
  let failed = 0;
  for (const p of pages) {
    const res = await fetch(`http://localhost:3000${p}`, {
      headers: { cookie },
      redirect: "manual",
    });
    const ok = res.status === 200;
    if (!ok) failed++;
    console.log(`${ok ? "OK " : "FAIL"} ${res.status} ${p}`);
  }
  return failed;
}

async function main() {
  const director = await token("test1@test.com");
  const admin = await token("admin@test.com");
  const tenant = await db.tenant.findFirstOrThrow();

  // 공개 페이지 (쿠키 없음). /reset-password는 없는 토큰이어도 안내 화면(200)이어야 한다
  let failed = await check(
    ["/", "/login", "/signup", "/forgot-password", "/reset-password/nope"],
    "",
  );
  failed += await check(
    [
      "/home",
      "/modules",
      "/modules/dunning",
      "/documents",
      "/documents?type=approval",
      "/notifications",
      "/settings",
      "/settings/units",
      "/settings/staff",
      "/settings/approval-line",
      "/settings/subscriptions",
      "/settings/account",
      "/support",
    ],
    `session=${director}`,
  );
  failed += await check(
    [
      "/admin",
      "/admin/tenants",
      "/admin/tenants/new",
      `/admin/tenants/${tenant.id}`,
      "/admin/revenue",
      "/admin/modules",
      "/admin/modules/new",
      "/admin/modules/dunning",
      "/admin/announcements",
      "/admin/announcements/new",
      "/admin/support",
      "/admin/account",
    ],
    `session=${admin}`,
  );
  if (failed) throw new Error(`${failed} pages failed`);
  console.log("smoke OK");
}

main().finally(() => db.$disconnect());
