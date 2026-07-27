"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { cn } from "@/lib/utils";

/* ponytail: 진행률 표시는 실제 대용량 업로드 모듈이 생기면 추가 */
export function FileUpload({
  name,
  accept,
  multiple = false,
  className,
}: {
  name: string;
  accept?: string;
  multiple?: boolean;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileNames, setFileNames] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);

  return (
    <label
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-card px-4 py-6 text-center transition-colors hover:border-primary hover:bg-accent/50",
        dragging && "border-primary bg-accent/50",
        className,
      )}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        // 드롭한 파일을 폼의 input[type=file]에 그대로 싣는다 — 서버 액션은 구분하지 못한다
        if (inputRef.current && e.dataTransfer.files.length > 0) {
          inputRef.current.files = e.dataTransfer.files;
          setFileNames(Array.from(e.dataTransfer.files).map((f) => f.name));
        }
      }}
    >
      <Upload className="size-6 text-muted-foreground" />
      {fileNames.length > 0 ? (
        <p className="text-sm font-medium">{fileNames.join(", ")}</p>
      ) : (
        <p className="text-sm text-muted-foreground">
          여기에 파일을 끌어다 놓으세요
          {accept && (
            <span className="block text-xs">({accept.replaceAll(",", ", ")})</span>
          )}
        </p>
      )}
      <span className="inline-flex h-8 items-center rounded-md border bg-background px-3 text-sm font-medium shadow-xs transition-colors hover:bg-accent">
        파일 선택
      </span>
      <input
        ref={inputRef}
        type="file"
        name={name}
        accept={accept}
        multiple={multiple}
        className="sr-only"
        onChange={(e) =>
          setFileNames(Array.from(e.target.files ?? []).map((f) => f.name))
        }
      />
    </label>
  );
}
