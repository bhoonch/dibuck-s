"use server";

import { redirect } from "next/navigation";
import { hashSync } from "bcryptjs";
import { db } from "@/lib/db";
import { RESET_STATE_MESSAGE, resetTokenState } from "@/lib/password-reset";

/** 조건부 UPDATE가 아무 행도 못 잡았을 때(이미 사용·만료된 토큰) */
class TokenUnavailable extends Error {}

export async function resetPassword(
  _prev: { error?: string } | undefined,
  formData: FormData,
) {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password.length < 8)
    return { error: "비밀번호는 8자 이상이어야 합니다." };
  if (password !== confirm)
    return { error: "비밀번호 확인이 일치하지 않습니다." };

  const now = new Date();
  const record = await db.passwordReset.findUnique({ where: { token } });
  const state = resetTokenState(record, now);
  if (state !== "valid") return { error: RESET_STATE_MESSAGE[state] };

  // 해시는 트랜잭션 밖에서 — bcrypt는 CPU를 100ms쯤 붙잡는다
  const passwordHash = hashSync(password, 10);

  try {
    await db.$transaction(async (tx) => {
      // 미사용·미만료를 UPDATE 조건으로 걸어 1회용을 보장한다 —
      // 링크를 두 번 눌러도(동시에 눌러도) 비밀번호가 두 번 바뀌지 않는다
      const { count } = await tx.passwordReset.updateMany({
        where: { token, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (count === 0) throw new TokenUnavailable();

      // passwordChangedAt 갱신 = 이 시각 이전에 발급된 세션 토큰이 전부 무효화된다.
      // 비밀번호를 잊은 이유가 계정 탈취일 수 있어, 남의 세션을 끊는 게 핵심이다.
      await tx.user.update({
        where: { id: record!.userId },
        data: { passwordHash, passwordChangedAt: now },
      });
    });
  } catch (err) {
    if (err instanceof TokenUnavailable)
      return { error: RESET_STATE_MESSAGE.used };
    throw err;
  }

  redirect("/login?reset=1");
}
