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
  const contact = String(formData.get("contact") ?? "").trim();

  if (!CATEGORIES.includes(category))
    return { error: "문의 유형을 선택해 주세요." };
  if (!title) return { error: "문의 내용을 입력해 주세요." };

  await db.inquiry.create({
    data: {
      tenantId: session.tenantId,
      category,
      title: title.slice(0, 500),
      contact: contact.slice(0, 100) || null,
    },
  });
  revalidatePath("/support");
  revalidatePath("/admin/support"); // 운영자 사이드바 답변 대기 배지
  return { success: "문의가 접수되었습니다. 답변이 등록되면 상태가 바뀝니다." };
}
