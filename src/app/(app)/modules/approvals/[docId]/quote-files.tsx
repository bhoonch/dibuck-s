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
  buttonLabel = "올리기",
  emptyText = "견적서 사진·PDF를 올려 주세요",
}: {
  docId: string;
  label: string;
  quoteIndex: number | null;
  files: FileRow[];
  editable: boolean;
  onError: (msg?: string) => void;
  buttonLabel?: string;
  emptyText?: string;
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
              size="xs"
              disabled={pending}
              onClick={() => inputRef.current?.click()}
            >
              {pending ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Paperclip className="size-3" />
              )}
              {buttonLabel}
            </Button>
          </>
        )}
      </div>
      {files.length === 0 ? (
        <p className="mt-0.5 text-xs text-[var(--gian-ink-soft)]">
          {editable ? emptyText : "첨부 없음"}
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

/**
 * 첨부파일 패널 — 업체마다 견적서 슬롯 하나, 맨 아래는 그 밖의 서류
 * (사업자등록증·시방서·산출근거 등) 자유 슬롯. 그 밖의 서류는 붙임 목록에
 * 파일명으로 실린다(attachmentLines).
 */
export function QuoteFiles({
  docId,
  vendors,
  files,
  editable,
  suggested = [],
}: {
  docId: string;
  vendors: string[];
  files: FileRow[];
  editable: boolean;
  /** AI가 권한 서류 목록 — 무엇을 올릴지 알려주는 참고일 뿐, 인쇄물엔 실리지 않는다 */
  suggested?: string[];
}) {
  const [error, setError] = useState<string>();
  return (
    <div className={panel}>
      <h4 className={panelTitle}>첨부파일</h4>
      <ul className="space-y-2.5">
        {vendors.map((v, i) => (
          <Slot
            key={i}
            docId={docId}
            label={`견적서 · ${v}`}
            quoteIndex={i}
            files={files.filter((f) => f.quoteIndex === i)}
            editable={editable}
            onError={setError}
          />
        ))}
        <Slot
          docId={docId}
          label="그 밖의 서류"
          quoteIndex={null}
          files={files.filter((f) => f.quoteIndex === null)}
          editable={editable}
          onError={setError}
          buttonLabel="추가"
          emptyText="사업자등록증·시방서 등이 필요하면 여기에 올려 주세요"
        />
      </ul>
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
      {editable && suggested.length > 0 && (
        <p className="mt-2 text-xs text-[var(--gian-ink-soft)]">
          이런 서류를 보통 붙입니다: {suggested.join(" ")} — 올린 파일이
          인쇄물의 붙임 목록이 됩니다.
        </p>
      )}
    </div>
  );
}
