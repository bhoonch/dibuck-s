import type { TempPasswordResult } from "@/lib/temp-password";

/** 임시 비밀번호 발급 결과 — 해시만 저장되므로 이 화면에서만 볼 수 있다 */
export function TempPasswordNotice({ state }: { state: TempPasswordResult }) {
  if (!state) return null;
  if ("error" in state)
    return <p className="text-sm text-destructive">{state.error}</p>;
  return (
    <div className="rounded-lg border border-amber-100 bg-amber-50 p-3 text-sm">
      <p>
        <b>{state.name}</b>
        <span className="text-gray-500"> ({state.email})</span> 임시 비밀번호:
      </p>
      <p className="my-1.5 font-mono text-2xl font-semibold tracking-wide">
        {state.tempPassword}
      </p>
      <p className="text-xs text-gray-600">
        이 화면을 벗어나면 다시 볼 수 없습니다. 직원에게 전달하고 로그인 후
        설정 &gt; 내 계정에서 변경하도록 안내하세요.
      </p>
    </div>
  );
}
