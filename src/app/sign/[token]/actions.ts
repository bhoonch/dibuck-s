"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { normalizeName } from "@/lib/gian/approval";
import { signTokenState, minutesHash, type MeetingMeta } from "@/lib/minutes";

export type SignMinutesState = { error?: string; done?: boolean } | undefined;

/**
 * 회의록 전자서명(공개, 병렬) — 로그인 없이 토큰이 곧 권한이다.
 * 결재(actOnStep)와 달리 반려가 없다: 서명하지 않으면 그냥 빈칸(자필란)으로 남는다.
 * fail-closed: signTokenState가 valid가 아니면 전부 거부.
 */
export async function signMinutes(
  _prev: SignMinutesState,
  formData: FormData,
): Promise<SignMinutesState> {
  const token = String(formData.get("token") ?? "");
  const typedName = String(formData.get("typedName") ?? "").trim();

  const step = await db.approvalStep.findUnique({
    where: { token },
    include: { document: true },
  });
  if (signTokenState(step, step?.document.status) !== "valid")
    return { error: "서명할 수 없는 링크입니다." };
  // 회의록 스텝만 — 다른 모듈 토큰이 이 액션으로 들어오면 비회의록 문서에
  // minutesHash가 서명 증적으로 찍힌다 (현재 재현 경로는 없지만 신뢰 경계는 여기다)
  if (step!.document.type !== "minutes")
    return { error: "서명할 수 없는 링크입니다." };
  if (typedName.length < 2) return { error: "성명을 2자 이상 입력해 주세요." };
  if (normalizeName(typedName) !== normalizeName(step!.name))
    return { error: "서명자 성명이 참석자 명단과 다릅니다. 본인 성명을 입력해 주세요." };

  const doc = step!.document;
  const meta = doc.meta as MeetingMeta;
  const h = await headers();

  // 이중 제출 차단 — 조건부 updateMany (링크를 두 번 눌러도 한 번만 처리된다)
  const updated = await db.approvalStep.updateMany({
    where: { id: step!.id, status: "pending" },
    data: {
      status: "approved",
      actedAt: new Date(),
      signature: {
        // 프록시 뒤에서는 x-forwarded-for의 첫 값이 실제 클라이언트다 (approve/[token]과 동일)
        ip: (h.get("x-forwarded-for") ?? h.get("x-real-ip") ?? "").split(",")[0].trim(),
        ua: h.get("user-agent") ?? "",
        typedName,
        docHash: minutesHash(doc.title, meta), // 증거력 ①: 서명 시점 문서 해시
      },
    },
  });
  if (updated.count === 0) return { error: "이미 서명이 처리되었습니다." };

  revalidatePath(`/modules/minutes/${doc.id}`);
  return { done: true };
}
