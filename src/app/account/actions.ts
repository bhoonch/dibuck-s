"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { compareSync, hashSync } from "bcryptjs";
import {
  createSession,
  destroySession,
  requireRole,
  requireSession,
} from "@/lib/auth";
import { db } from "@/lib/db";
import { rateLimit, rateLimitReset } from "@/lib/rate-limit";
import { Role } from "@/generated/prisma/enums";

type State = { error?: string; success?: boolean } | undefined;

/** 내 이름·직책 수정 — 사이드바에 바로 반영되도록 세션의 이름도 갱신한다 */
export async function updateMyProfile(_prev: State, formData: FormData) {
  const session = await requireSession();
  const name = String(formData.get("name") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim() || null;
  if (!name) return { error: "이름을 입력해 주세요." };

  await db.user.update({
    where: { id: session.userId },
    data: { name, title },
  });
  await createSession({ ...session, name });
  revalidatePath("/", "layout");
  return { success: true };
}

export async function changeMyPassword(_prev: State, formData: FormData) {
  const session = await requireSession();
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (next.length < 8) return { error: "새 비밀번호는 8자 이상이어야 합니다." };
  if (next !== confirm) return { error: "새 비밀번호가 서로 다릅니다." };

  // 세션을 훔친 쪽이 현재 비밀번호를 대입으로 알아내지 못하게
  if (rateLimit(`pw:${session.userId}`, 10, 10 * 60_000) === 0)
    return { error: "시도가 너무 많습니다. 10분 후에 다시 시도해 주세요." };

  const user = await db.user.findUniqueOrThrow({
    where: { id: session.userId },
  });
  if (!compareSync(current, user.passwordHash))
    return { error: "현재 비밀번호가 올바르지 않습니다." };
  rateLimitReset(`pw:${session.userId}`);

  await db.user.update({
    where: { id: session.userId },
    data: { passwordHash: hashSync(next, 10), passwordChangedAt: new Date() },
  });
  // 다른 기기의 옛 세션은 끊고, 방금 바꾼 본인은 로그인 상태를 유지한다
  await createSession(session);
  return { success: true };
}

/**
 * 셀프 탈퇴 신청 — 30일 뒤에 지운다(DELETE_GRACE_DAYS).
 * 구독 주체가 단지라 "내 계정만" 지우는 건 마스터에게 의미가 없다(나머지 계정은 마스터가 삭제).
 * 개인정보보호법상 삭제 요구 대응은 선택이 아니므로 운영자 문의 없이 여기서 끝나야 한다 —
 * 다만 즉시 삭제는 홧김에 누른 한 번으로 법정 보존 문서까지 없앤다. 유예 동안은
 * 평소처럼 쓸 수 있고 상단 배너에서 취소할 수 있다.
 *
 * 결제는 여기서 따로 멈추지 않는다 — chargeTenant가 입구에서 deleteRequestedAt을
 * 읽고 결제 대신 해지를 실행한다(원본 하나, 복제 플래그 없음). 그래서 탈퇴를
 * 취소하면 청구일이 지나지 않은 한 결제도 원래대로 이어진다.
 */
export async function deleteMyTenant(_prev: State, formData: FormData) {
  const session = await requireRole(Role.DIRECTOR);
  const tenantId = session.tenantId!;
  const password = String(formData.get("password") ?? "");
  const confirmName = String(formData.get("confirmName") ?? "").trim();

  // 훔친 세션이 이 폼으로 비밀번호를 대입하지 못하게 — 비밀번호 변경과 같은 한도
  if (rateLimit(`del:${session.userId}`, 10, 10 * 60_000) === 0)
    return { error: "시도가 너무 많습니다. 10분 후에 다시 시도해 주세요." };

  const [user, tenant] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: session.userId } }),
    db.tenant.findUniqueOrThrow({ where: { id: tenantId } }),
  ]);
  if (!compareSync(password, user.passwordHash))
    return { error: "비밀번호가 올바르지 않습니다." };
  rateLimitReset(`del:${session.userId}`);
  // 실수로 지우는 사고를 막는다 — 단지명을 정확히 입력해야 진행
  if (confirmName !== tenant.name)
    return { error: `확인을 위해 단지명 "${tenant.name}"을(를) 정확히 입력해 주세요.` };

  await db.tenant.update({
    where: { id: tenantId },
    data: { deleteRequestedAt: new Date() },
  });

  await destroySession();
  redirect("/?left=1");
}

/** 탈퇴 취소 — 유예 안이면 언제든. 지운 게 없으니 되돌릴 것도 없다 */
export async function cancelTenantDeletion() {
  const session = await requireRole(Role.DIRECTOR);
  await db.tenant.update({
    where: { id: session.tenantId! },
    data: { deleteRequestedAt: null },
  });
  revalidatePath("/", "layout");
}
