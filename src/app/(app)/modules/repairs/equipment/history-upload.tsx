"use client";

import { useActionState, useEffect, useRef } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FileUpload } from "@/components/ui/file-upload";
import { uploadRepairHistory } from "../actions";

export function HistoryUpload() {
  const [state, action, pending] = useActionState(
    uploadRepairHistory,
    undefined,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.success) {
      formRef.current?.reset();
      toast.success(state.success);
    }
  }, [state]);

  return (
    <form ref={formRef} action={action} className="space-y-3">
      <FileUpload name="file" accept=".xlsx,.xls,.csv" />
      <p className="text-xs text-muted-foreground">
        엑셀 형식: A열 = 일자(YYYY-MM-DD), B열 = 설비명, C열 = 증상, D열 = 조치,
        E열 = 업체, F열 = 비용.
        <br />
        추가만 되므로 같은 파일을 두 번 올리면 두 벌이 생깁니다.
        <br />
        설비명이 대장과 같으면 자동으로 연결됩니다. 띄어쓰기 차이는 무시합니다.
      </p>
      {state?.error && (
        <p className="text-sm whitespace-pre-line text-destructive">
          {state.error}
        </p>
      )}
      {/* 토스트는 사라진다 — 못 붙은 이름은 화면에 남겨야 사용자가 고칠 수 있다.
          같은 파일을 다시 올리라고 안내하지 않는다: 이관은 추가만이라 두 벌이 된다. */}
      {state?.unmatched && state.unmatched.length > 0 && (
        <div className="rounded-md border bg-muted/40 p-3 text-sm">
          <p className="font-medium">
            대장에서 찾지 못한 설비명 {state.unmatched.length}종
          </p>
          <p className="mt-1 text-muted-foreground">
            {state.unmatched.slice(0, 20).join(", ")}
            {state.unmatched.length > 20 &&
              ` 외 ${state.unmatched.length - 20}종`}
          </p>
          <p className="mt-2 text-muted-foreground">
            이 이름의 기록은 설비 미지정으로 들어갔습니다.
            <br />
            대장에 같은 이름으로 설비를 등록한 뒤, 각 기록에서 [설비에 연결]을
            누르면 이력에 실립니다. 띄어쓰기 차이는 자동으로 맞춥니다.
          </p>
        </div>
      )}
      <div className="flex items-center gap-2">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "가져오는 중..." : "이력 가져오기"}
        </Button>
        <Button asChild variant="outline" size="lg">
          <a href="/repair-history-sample.xlsx" download="수선이력_샘플.xlsx">
            <Download className="size-4" /> 샘플 파일 받기
          </a>
        </Button>
      </div>
    </form>
  );
}
