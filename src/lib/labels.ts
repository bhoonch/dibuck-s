import type { Role } from "@/generated/prisma/enums";

export const roleLabels: Record<Role, string> = {
  SUPER_ADMIN: "운영자",
  DIRECTOR: "소장",
  ACCOUNTANT: "경리",
  STAFF: "직원",
};

export const docTypeLabels: Record<string, string> = {
  dunning_letter: "독촉장",
  notice: "공지문",
  contract: "계약서",
  minutes: "회의록",
  approval: "품의서",
  complaint: "민원",
  inspection: "점검",
};

export const docStatusLabels: Record<string, string> = {
  draft: "작성 중",
  final: "완료",
  pending: "결재 대기",
  open: "처리 중",
  done: "처리 완료",
};

/* 상태 pill 색 (클로드디자인 팔레트 기준) */
export const docStatusStyles: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  final: "bg-green-50 text-green-700",
  pending: "bg-blue-50 text-blue-800",
  open: "bg-red-50 text-red-700",
  done: "bg-green-50 text-green-700",
};
