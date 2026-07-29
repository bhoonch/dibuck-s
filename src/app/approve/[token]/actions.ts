"use server";

import { headers } from "next/headers";
import { db } from "@/lib/db";
import { actOnStep, tokenState } from "@/lib/gian/approval";

export type SignState =
  | { error?: string; done?: "approve" | "reject" }
  | undefined;

/** 공백·중점을 지운 이름 비교 — "이 대표"와 "이대표"를 같게 본다 */
const normalizeName = (s: string) => s.replace(/[\s·]/g, "");

/**
 * 외부 결재자(회장·감사) 서명 — 로그인 없이 토큰이 곧 권한이다.
 * 토큰 검증은 fail-closed: 만료·사용됨·문서 상태 불일치면 전부 거부.
 *
 * 토큰 링크는 카카오톡으로 전달되므로 "누가 눌렀는가"를 토큰만으로는 증명할 수 없다.
 * 그래서 서명 시 성명을 직접 입력받고 IP·기기 정보와 함께 남긴다 — 본인인증이 아니라
 * 감사 대응용 증적이다(SMS 본인확인은 발송 인프라를 들인 뒤 별건으로 다룬다).
 */
export async function signByToken(
  _prev: SignState,
  formData: FormData,
): Promise<SignState> {
  const token = String(formData.get("token") ?? "");
  const action = formData.get("action") === "reject" ? "reject" : "approve";
  const comment = String(formData.get("comment") ?? "");
  const typedName = String(formData.get("typedName") ?? "").trim();

  const step = await db.approvalStep.findUnique({
    where: { token },
    include: { document: { select: { status: true } } },
  });
  if (tokenState(step, step?.document.status) !== "valid")
    return {
      error:
        "유효하지 않거나 만료된 링크입니다. 관리사무소에 재발급을 요청해 주세요.",
    };
  if (!typedName) return { error: "성명을 입력해 주세요." };
  if (normalizeName(typedName) !== normalizeName(step!.name))
    return { error: `등록된 결재자 성명(${step!.name})과 다릅니다.` };
  if (action === "reject" && !comment.trim())
    return { error: "반려 사유를 입력해 주세요." };

  const h = await headers();
  const result = await actOnStep(step!.id, action, comment, {
    // 프록시 뒤에서는 x-forwarded-for의 첫 값이 실제 클라이언트다
    ip: (h.get("x-forwarded-for") ?? h.get("x-real-ip") ?? "").split(",")[0].trim(),
    ua: h.get("user-agent") ?? "",
    typedName,
  });
  if (result.error) return { error: result.error };
  return { done: action };
}
