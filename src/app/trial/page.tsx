import { redirect } from "next/navigation";

/** 예전 무료 체험 신청 링크 호환 — 셀프 가입으로 대체됨 */
export default function TrialPage() {
  redirect("/signup");
}
