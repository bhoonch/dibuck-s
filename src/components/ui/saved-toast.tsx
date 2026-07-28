"use client";

import { Suspense, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

/**
 * 서버 액션이 `?saved=1`로 돌아오면 토스트 한 번 띄우고 주소를 되돌린다.
 *
 * 폼을 통째로 클라이언트 컴포넌트로 바꾸지 않으려고 이 방식을 쓴다 — 저장 결과를
 * 보여주자고 서버 렌더 폼(입력값·권한 분기)을 옮기면 다시 그릴 게 너무 많다.
 * 주소를 되돌리지 않으면 새로고침할 때마다 "저장했습니다"가 다시 뜬다.
 */
function Inner({ message }: { message: string }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const saved = params.get("saved");

  useEffect(() => {
    if (!saved) return;
    toast.success(message);
    router.replace(pathname, { scroll: false });
  }, [saved, message, pathname, router]);

  return null;
}

export function SavedToast({ message = "저장했습니다." }: { message?: string }) {
  return (
    <Suspense>
      <Inner message={message} />
    </Suspense>
  );
}
