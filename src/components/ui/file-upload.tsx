"use client";

import { useState } from "react";
import { Upload } from "lucide-react";
import { cn } from "@/lib/utils";

/* ponytail: 네이티브 input[type=file] 래퍼 — 드래그앤드롭·진행률은 실제 업로드 모듈이 생기면 추가 */
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
  const [fileNames, setFileNames] = useState<string[]>([]);

  return (
    <label
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-card px-4 py-8 text-center transition-colors hover:border-primary hover:bg-accent/50",
        className,
      )}
    >
      <Upload className="size-6 text-muted-foreground" />
      {fileNames.length > 0 ? (
        <p className="text-sm font-medium">{fileNames.join(", ")}</p>
      ) : (
        <p className="text-sm text-muted-foreground">
          클릭해서 파일을 선택하세요
          {accept && (
            <span className="block text-xs">({accept.replaceAll(",", ", ")})</span>
          )}
        </p>
      )}
      <input
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
