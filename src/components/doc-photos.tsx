"use client";

import { useRef, useState, useTransition } from "react";
import { Camera, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MAX_DOC_PHOTOS, PHOTO_CAPTION_MAX } from "@/lib/photo-sheet";
import { tryShrinkImage } from "@/lib/shrink-image";

export type PhotoRow = { id: string; caption: string };
type ActionResult = { error?: string } | undefined;

/**
 * 사진 패널 — 올리면 용지의 사진대지 칸에 바로 실린다. 캡션은 칸 하단 문구.
 * 공지문·교육일지가 각자의 서버 액션(소유권 경계 포함)을 넘겨서 같이 쓴다.
 * 생성 폼이 아니라 문서 화면에 두는 이유: 초안을 본 뒤에야 어떤 사진을
 * 어디에 실을지 판단이 서고, AI 실패 경로에 업로드가 얽히지 않는다.
 */
export function DocPhotos({
  docId,
  photos,
  editable,
  emptyText,
  captionPlaceholder,
  uploadAction,
  deleteAction,
  captionAction,
}: {
  docId: string;
  photos: PhotoRow[];
  editable: boolean;
  emptyText: React.ReactNode;
  captionPlaceholder: string;
  uploadAction: (prev: ActionResult, fd: FormData) => Promise<ActionResult>;
  deleteAction: (attachmentId: string) => Promise<ActionResult>;
  captionAction: (
    attachmentId: string,
    caption: string,
  ) => Promise<ActionResult>;
}) {
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = (file: File) => {
    setError(undefined);
    startTransition(async () => {
      // 다운로드형 첨부와 달리 원본 통과가 없다 — A4에 못 찍는 형식(HEIC 등)은 빈 박스로 인쇄된다
      const shrunk = await tryShrinkImage(file, 1200);
      if (!shrunk) {
        setError(
          "이 형식은 사진으로 실을 수 없습니다. 갤러리에서 JPEG로 내보내 다시 올려 주세요.",
        );
        return;
      }
      const fd = new FormData();
      fd.set("docId", docId);
      fd.set("file", shrunk);
      const r = await uploadAction(undefined, fd);
      if (r?.error) setError(r.error);
    });
  };

  if (!editable && photos.length === 0) return null;

  return (
    <Card className="p-4">
      <div className="mb-1.5 flex items-center justify-between">
        <h4 className="text-sm font-semibold">사진</h4>
        {editable && (
          <>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
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
              disabled={pending || photos.length >= MAX_DOC_PHOTOS}
              onClick={() => inputRef.current?.click()}
            >
              {pending ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Camera className="size-3" />
              )}
              올리기 {photos.length}/{MAX_DOC_PHOTOS}
            </Button>
          </>
        )}
      </div>
      {photos.length === 0 ? (
        // 다른 패널의 빈 상태·힌트 문구와 같은 xs — 카드 제목 sm + 본문 xs 문법
        <p className="text-xs text-muted-foreground">{emptyText}</p>
      ) : (
        <ul className="space-y-2.5">
          {photos.map((p) => (
            <li key={p.id} className="flex items-start gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element -- 첨부 라우트라 next/image 대상이 아니다 */}
              <img
                src={`/api/attachments/${p.id}`}
                alt=""
                className="h-14 w-20 shrink-0 rounded border object-cover"
              />
              <div className="min-w-0 flex-1">
                {editable ? (
                  <Input
                    defaultValue={p.caption}
                    maxLength={PHOTO_CAPTION_MAX}
                    placeholder={captionPlaceholder}
                    className="h-8 text-xs"
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v === p.caption) return;
                      setError(undefined);
                      startTransition(async () => {
                        const r = await captionAction(p.id, v);
                        if (r?.error) setError(r.error);
                      });
                    }}
                  />
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {p.caption || "설명 없음"}
                  </p>
                )}
              </div>
              {editable && (
                <button
                  type="button"
                  aria-label="사진 삭제"
                  className="mt-1 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => {
                    setError(undefined);
                    startTransition(async () => {
                      const r = await deleteAction(p.id);
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
