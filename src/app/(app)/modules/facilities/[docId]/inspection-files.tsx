"use client";

import { useRef, useState, useTransition } from "react";
import { FileText, Loader2, Paperclip, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { deleteInspectionFile, uploadInspectionFile } from "../actions";

type FileRow = { id: string; name: string; size: number };

/**
 * 폰으로 찍은 성적서(5MB급)를 올리기 전에 줄인다 — 장변 2000px WebP.
 * quote-files.tsx와 같은 방식. 디코딩 실패(HEIC 등)면 원본 그대로 —
 * 서버 3MB 상한이 최종선이다.
 */
async function shrinkImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return file;
  const scale = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
  if (scale === 1 && file.size < 500 * 1024) return file;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((res) =>
    canvas.toBlob(res, "image/webp", 0.8),
  );
  if (!blob) return file;
  return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".webp", {
    type: "image/webp",
  });
}

const kb = (n: number) => `${Math.max(1, Math.round(n / 1024))}KB`;

/** 성적서·검사필증 첨부 패널 — 올린 파일이 A4 일지의 첨부 목록이 된다 */
export function InspectionFiles({
  docId,
  files,
}: {
  docId: string;
  files: FileRow[];
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = (file: File) => {
    setError(undefined);
    startTransition(async () => {
      const shrunk = await shrinkImage(file);
      const fd = new FormData();
      fd.set("docId", docId);
      fd.set("file", shrunk);
      const r = await uploadInspectionFile(undefined, fd);
      if (r?.error) setError(r.error);
    });
  };

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-semibold">첨부파일</h4>
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
      </div>
      {files.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          성적서·검사필증 사진이나 PDF를 올려 주세요 — 일지의 첨부 목록에
          실립니다.
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
              <button
                type="button"
                aria-label="첨부 삭제"
                className="shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => {
                  setError(undefined);
                  startTransition(async () => {
                    const r = await deleteInspectionFile(f.id);
                    if (r?.error) setError(r.error);
                  });
                }}
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </Card>
  );
}
