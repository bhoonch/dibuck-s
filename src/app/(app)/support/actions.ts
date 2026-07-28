"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";

// 스키마 주석의 유형 목록과 동일 — "체험 신청"은 가입 전 경로라 제외 (inquiry-form.tsx와 짝)
const CATEGORIES = ["기능 문의", "구독", "계정", "결제"];

export async function createInquiry(
  _prev: { error?: string; success?: string } | undefined,
  formData: FormData,
) {
  const session = await requireSession();
  const category = String(formData.get("category") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  // 사용자가 채우는 값이 아니라 링크가 실어 보내는 값 — 앱 내부 경로만 받는다
  const fromRaw = String(formData.get("fromPath") ?? "").trim();
  const fromPath = /^\/[\w\-/[\]]*$/.test(fromRaw) ? fromRaw.slice(0, 100) : null;

  if (!CATEGORIES.includes(category))
    return { error: "문의 유형을 선택해 주세요." };
  if (!title) return { error: "문의 내용을 입력해 주세요." };

  // contact는 더 이상 받지 않는다 — 전화 응대를 없애고 앱 안에서만 주고받는다.
  // 컬럼은 옛 "체험 신청" 접수분이 들고 있어서 지우지 않았다.
  await db.inquiry.create({
    data: {
      tenantId: session.tenantId,
      category,
      title: title.slice(0, 500),
      fromPath,
    },
  });
  revalidatePath("/support");
  revalidatePath("/admin/support"); // 운영자 사이드바 답변 대기 배지
  return {
    success:
      "문의가 접수되었습니다. 답변이 등록되면 알림으로 알려드리고, 아래 문의 내역에서 펼쳐 읽으실 수 있습니다.",
  };
}
