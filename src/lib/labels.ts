import type { Role } from "@/generated/prisma/enums";

/**
 * 권한 이름은 직책(User.title: 관리소장·경리주임…)과 헷갈리지 않게 짓는다.
 * 예전 이름(소장·경리·직원)은 직책과 글자가 겹쳐서 "직책을 또 고르라는 건가"가 됐다.
 * enum 값(DIRECTOR·ACCOUNTANT·STAFF)은 그대로 — 화면에 보이는 이름만 바꾼 것이다.
 */
export const roleLabels: Record<Role, string> = {
  SUPER_ADMIN: "운영자",
  DIRECTOR: "마스터",
  ACCOUNTANT: "매니저",
  STAFF: "멤버",
};

/** 단지가 직접 부여할 수 있는 권한 — 운영자(SUPER_ADMIN)는 디벅 쪽 계정이라 뺀다 */
export const assignableRoles = [
  "DIRECTOR",
  "ACCOUNTANT",
  "STAFF",
] as const satisfies Role[];

/**
 * 권한별 안내. 실제 게이트가 바뀔 때마다 이 문구도 같이 고친다 —
 * "매니저로 바꿨는데 아무것도 안 달라진다"는 오해가 코드보다 비싸다.
 */
export const roleGuide: Record<(typeof assignableRoles)[number], string> = {
  DIRECTOR:
    "단지 정보·직원·구독·결제·결재선을 바꿉니다. 서비스 탈퇴도 마스터만 할 수 있습니다.",
  ACCOUNTANT:
    "문서를 만들고, 남이 쓴 문서도 결재에 올릴 수 있습니다. 세대 명부(엑셀)도 올립니다 — 부과·수납 실무자 자리입니다. 단지 정보·직원·구독·결제 설정은 볼 수만 있습니다.",
  STAFF:
    "문서를 열람하고 작성합니다. 자기가 쓴 문서만 결재에 올릴 수 있고, 설정은 볼 수만 있습니다.",
};

export const docTypeLabels: Record<string, string> = {
  dunning_letter: "독촉장",
  notice: "공지문",
  contract: "계약서",
  minutes: "회의록",
  approval: "품의서",
  gian: "기안서",
  complaint: "민원",
  inspection: "점검",
};

export const docStatusLabels: Record<string, string> = {
  draft: "작성 중",
  final: "완료",
  pending: "결재 대기",
  rejected: "반려",
  open: "처리 중",
  done: "처리 완료",
  /** 폐기 — 하드 삭제 대신 상태로 남긴다. 결재 기록이 사라지면 감사 추적이 끊긴다 */
  void: "폐기",
};

/* 상태 pill 색 (클로드디자인 팔레트 기준) */
export const docStatusStyles: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  final: "bg-green-50 text-green-700",
  pending: "bg-blue-50 text-blue-800",
  rejected: "bg-red-50 text-red-700",
  open: "bg-red-50 text-red-700",
  done: "bg-green-50 text-green-700",
  void: "bg-gray-100 text-gray-400",
};
