"use client";

import { useRef, useState, useTransition } from "react";
import { FileText, Loader2, Paperclip, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { shrinkImage } from "@/lib/shrink-image";
import { deleteRepairFile, uploadRepairFile } from "../actions";

type FileRow = { id: string; name: string; size: number };

const kb = (n: number) => `${Math.max(1, Math.round(n / 1024))}KB`;

/** 사진·영수증 첨부 패널 — 영수증은 수선 뒤에 도착하므로 완성본에도 올린다 */
export function RepairFiles({
  docId,
  files,
  readOnly,
}: {
  docId: string;
  files: FileRow[];
  readOnly: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = (file: File) => {
    setError(undefined);
    startTransition(async () => {
      const shrunk = await shrinkImage(file, 1200);
      const fd = new FormData();
      fd.set("docId", docId);
      fd.set("file", shrunk);
      const r = await uploadRepairFile(undefined, fd);
      if (r?.error) setError(r.error);
    });
  };

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-semibold">사진·영수증</h4>
        {!readOnly && (
          <>
            <input
              ref={inputRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = ""; // 같은 파일 재선택도 change가 나게
                if (f) upload(f);
              }}
            />
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => inputRef.current?.click()}
            >
              {pending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Paperclip className="size-4" />
              )}
              올리기
            </Button>
          </>
        )}
      </div>
      {files.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          현장 사진이나 영수증을 올려 두세요.
          <br />
          나중에 비용 근거를 찾을 때 여기서 꺼내면 됩니다.
        </p>
      ) : (
        <ul className="mt-2 space-y-1">
          {files.map((f) => (
            <li key={f.id} className="flex items-center gap-1.5 text-xs">
              <FileText className="size-3.5 shrink-0 text-muted-foreground" />
              <a
                href={`/api/attachments/${f.id}`}
                target="_blank"
                rel="noreferrer"
                className="truncate underline underline-offset-2"
              >
                {f.name}
              </a>
              <span className="shrink-0 font-mono text-muted-foreground">
                {kb(f.size)}
              </span>
              {!readOnly && (
                <button
                  type="button"
                  aria-label="첨부 삭제"
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => {
                    setError(undefined);
                    startTransition(async () => {
                      const r = await deleteRepairFile(f.id);
                      if (r?.error) setError(r.error);
                    });
                  }}
                >
                  <X className="size-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </Card>
  );
}
