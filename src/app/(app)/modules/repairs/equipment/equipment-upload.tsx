"use client";

import { useActionState, useEffect, useRef } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FileUpload } from "@/components/ui/file-upload";
import { uploadEquipmentExcel } from "../actions";

export function EquipmentUpload() {
  const [state, action, pending] = useActionState(
    uploadEquipmentExcel,
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
        엑셀 형식: A열 = 분류, B열 = 설비명, C열 = 위치, D열 = 설치연도, E열 =
        업체, F열 = 비고. 첫 행이 제목이면 자동으로 건너뜁니다.
      </p>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="replace"
          className="size-4 accent-primary"
        />
        기존 설비 목록을 지우고 새로 등록 (수선 기록이 생기면 쓸 수 없습니다)
      </label>
      {state?.error && (
        <p className="text-sm whitespace-pre-line text-destructive">
          {state.error}
        </p>
      )}
      <div className="flex items-center gap-2">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "등록 중..." : "엑셀 업로드"}
        </Button>
        <Button asChild variant="outline" size="lg">
          <a href="/equipment-upload-sample.xlsx" download="설비대장_샘플.xlsx">
            <Download className="size-4" /> 샘플 파일 받기
          </a>
        </Button>
      </div>
    </form>
  );
}
