"use client";

import { useActionState, useEffect, useRef } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FileUpload } from "@/components/ui/file-upload";
import { uploadUnits } from "../actions";

export function UnitsUpload() {
  const [state, action, pending] = useActionState(uploadUnits, undefined);
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
        엑셀 형식: A열 = 동(예: 101), B열 = 호(예: 502), C열 = 이름(선택), D열
        = 연락처(선택). 첫 행이 제목이면 자동으로 건너뜁니다.
      </p>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="replace" className="size-4 accent-primary" />
        기존 세대 목록을 지우고 새로 등록
      </label>
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      <div className="flex items-center gap-2">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "등록 중..." : "엑셀 업로드"}
        </Button>
        <Button asChild variant="outline" size="lg">
          <a href="/unit-upload-sample.xlsx" download="세대목록_샘플.xlsx">
            <Download className="size-4" /> 샘플 파일 받기
          </a>
        </Button>
      </div>
    </form>
  );
}
