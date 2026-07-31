"use client";

import { Suspense, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

/**
 * 카드 등록 결제창에서 돌아온 결과(콜백이 붙인 쿼리)를 알려 주는 자리.
 * 이게 없으면 등록에 실패해도 화면이 조용해서 "왜 안 되지"의 출구가 없다.
 * SavedToast와 같은 문법 — 한 번 띄우고 주소를 되돌린다(새로고침 중복 방지).
 */
const errors: Record<string, string> = {
  canceled: "카드 등록이 완료되지 않았습니다. 다시 시도해 주세요.",
  mismatch: "요청을 확인할 수 없습니다. 처음부터 다시 시도해 주세요.",
  no_tenant: "단지 정보를 찾을 수 없습니다. 다시 로그인해 주세요.",
  // 카드는 붙었는데 즉시 결제가 실패한 경우 — 화면의 연체 배너가 이어서 안내한다
  charge: "카드는 등록되었지만 결제에 실패했습니다. 카드 한도·잔액을 확인해 주세요.",
};

function Inner() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const registered = params.get("registered");
  const error = params.get("error");
  const message = params.get("message");

  useEffect(() => {
    if (registered) {
      toast.success("카드가 등록되었습니다.");
    } else if (error) {
      // issue(빌링키 발급 실패)는 토스가 준 사유를 그대로 보여준다
      toast.error(errors[error] ?? message ?? "카드 등록에 실패했습니다.");
    } else {
      return;
    }
    router.replace(pathname, { scroll: false });
  }, [registered, error, message, pathname, router]);

  return null;
}

export function RegistrationToast() {
  return (
    <Suspense>
      <Inner />
    </Suspense>
  );
}
