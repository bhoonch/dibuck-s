"use server";

import { db } from "@/lib/db";
import { actOnStep, tokenState } from "@/lib/gian/approval";

export type SignState =
  | { error?: string; done?: "approve" | "reject" }
  | undefined;

/**
 * 외부 결재자(회장·감사) 서명 — 로그인 없이 토큰이 곧 권한이다.
 * 토큰 검증은 fail-closed: 만료·사용됨·문서 상태 불일치면 전부 거부.
 */
export async function signByToken(
  _prev: SignState,
  formData: FormData,
): Promise<SignState> {
  const token = String(formData.get("token") ?? "");
  const action = formData.get("action") === "reject" ? "reject" : "approve";
  const comment = String(formData.get("comment") ?? "");

  const step = await db.approvalStep.findUnique({
    where: { token },
    include: { document: { select: { status: true } } },
  });
  if (tokenState(step, step?.document.status) !== "valid")
    return { error: "유효하지 않거나 만료된 링크입니다. 관리사무소에 재발급을 요청해 주세요." };
  if (action === "reject" && !comment.trim())
    return { error: "반려 사유를 입력해 주세요." };

  const result = await actOnStep(step!.id, action, comment);
  if (result.error) return { error: result.error };
  return { done: action };
}
