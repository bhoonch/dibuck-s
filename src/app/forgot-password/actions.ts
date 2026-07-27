"use server";

import { db } from "@/lib/db";
import { mailerEnabled, sendPasswordReset } from "@/lib/mailer";
import { RESET_TTL_MS, resetToken } from "@/lib/password-reset";
import { rateLimit } from "@/lib/rate-limit";
import { normalizeEmail } from "@/lib/utils";

export async function requestPasswordReset(
  _prev: { error?: string; sent?: boolean } | undefined,
  formData: FormData,
) {
  const email = normalizeEmail(formData.get("email"));
  if (!email) return { error: "이메일을 입력해 주세요." };
  if (!mailerEnabled())
    return { error: "메일 발송이 설정되지 않았습니다. 운영팀으로 문의해 주세요." };

  // 이메일당 10분 3회 — 남의 주소로 재설정 메일을 계속 쏘는 괴롭힘과 발송량 낭비를 막는다.
  // ponytail: 프로세스 메모리(rate-limit.ts와 같은 천장). 인스턴스를 늘리면 Redis로.
  if (rateLimit(`reset:${email}`, 3, 10 * 60_000) === 0)
    return { error: "요청이 너무 많습니다. 10분 후에 다시 시도해 주세요." };

  const user = await db.user.findUnique({ where: { email } });

  // 계정이 있을 때만 실제로 발송하고, 응답은 항상 같다 —
  // 응답이 갈리면 이 화면이 "가입된 이메일 확인기"가 된다(계정 열거).
  if (user) {
    const token = resetToken();
    await db.$transaction([
      // 이전에 보낸 미사용 링크는 무효화 — 유효한 링크가 동시에 여러 개 살아있지 않게
      db.passwordReset.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      }),
      db.passwordReset.create({
        data: {
          token,
          userId: user.id,
          expiresAt: new Date(Date.now() + RESET_TTL_MS),
        },
      }),
    ]);
    try {
      await sendPasswordReset(user.email, user.name, token);
    } catch (err) {
      // 발송 실패도 같은 화면을 보여준다(위와 같은 이유). 원인은 서버 로그로 추적.
      console.error("[forgot-password] 재설정 메일 발송 실패", err);
    }
  }

  return { sent: true };
}
