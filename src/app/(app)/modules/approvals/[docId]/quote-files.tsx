"use client";

import { useRef, useState, useTransition } from "react";
import { FileText, Loader2, Paperclip, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { panel, panelTitle } from "@/components/gian-ui";
import { deleteQuoteFile, uploadQuoteFile } from "../approval-actions";

export type FileRow = {
  id: string;
  name: string;
  size: number;
  quoteIndex: number | null;
};

/**
 * 폰으로 찍은 견적서(5MB급)를 올리기 전에 줄인다 — 장변 2000px WebP.
 * 2000px ≈ A4 171DPI라 표의 작은 글씨까지 읽힌다. 라이브러리 없이 canvas만.
 * 디코딩 실패(HEIC 등)면 원본 그대로 — 서버 3MB 상한이 최종선이다.
 */
async function shrinkImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return file;
  const scale = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
  if (scale === 1 && file.size < 500 * 1024) return file; // 이미 작으면 그대로
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

function Slot({
  docId,
  label,
  quoteIndex,
  files,
  editable,
  onError,
}: {
  docId: string;
  label: string;
  quoteIndex: number | null;
  files: FileRow[];
  editable: boolean;
  onError: (msg?: string) => void;
}) {
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = (file: File) => {
    onError(undefined);
    startTransition(async () => {
      const shrunk = await shrinkImage(file);
      const fd = new FormData();
      fd.set("docId", docId);
      fd.set("quoteIndex", quoteIndex === null ? "" : String(quoteIndex));
      fd.set("file", shrunk);
      const r = await uploadQuoteFile(undefined, fd);
      if (r?.error) onError(r.error);
    });
  };

  return (
    <li className="text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold">{label}</span>
        {editable && (
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
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Paperclip className="size-3.5" />
              )}
              올리기
            </Button>
          </>
        )}
      </div>
      {files.length === 0 ? (
        <p className="mt-0.5 text-xs text-[var(--gian-ink-soft)]">
          {editable ? "견적서 사진·PDF를 올려 주세요" : "첨부 없음"}
        </p>
      ) : (
        <ul className="mt-1 space-y-1">
          {files.map((f) => (
            <li key={f.id} className="flex items-center gap-1.5 text-xs">
              <FileText className="size-3.5 shrink-0 text-[var(--gian-ink-soft)]" />
              <a
                href={`/api/attachments/${f.id}`}
                target="_blank"
                rel="noreferrer"
                className="truncate underline underline-offset-2"
              >
                {f.name}
              </a>
              <span className="shrink-0 font-mono text-[var(--gian-ink-soft)]">
                {kb(f.size)}
              </span>
              {editable && (
                <button
                  type="button"
                  aria-label="첨부 삭제"
                  className="shrink-0 text-[var(--gian-ink-soft)] hover:text-destructive"
                  onClick={() => {
                    onError(undefined);
                    startTransition(async () => {
                      const r = await deleteQuoteFile(f.id);
                      if (r?.error) onError(r.error);
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
    </li>
  );
}

/** 견적서 첨부 패널 — 업체마다 한 슬롯, 입찰이면 문서 단위 슬롯 하나 */
export function QuoteFiles({
  docId,
  vendors,
  files,
  showDocSlot,
  editable,
}: {
  docId: string;
  vendors: string[];
  files: FileRow[];
  showDocSlot: boolean;
  editable: boolean;
}) {
  const [error, setError] = useState<string>();
  return (
    <div className={panel}>
      <h4 className={panelTitle}>견적서 첨부</h4>
      <ul className="space-y-2.5">
        {vendors.map((v, i) => (
          <Slot
            key={i}
            docId={docId}
            label={v}
            quoteIndex={i}
            files={files.filter((f) => f.quoteIndex === i)}
            editable={editable}
            onError={setError}
          />
        ))}
        {showDocSlot && (
          <Slot
            docId={docId}
            label="증빙 서류 (산출근거 등)"
            quoteIndex={null}
            files={files.filter((f) => f.quoteIndex === null)}
            editable={editable}
            onError={setError}
          />
        )}
      </ul>
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </div>
  );
}
