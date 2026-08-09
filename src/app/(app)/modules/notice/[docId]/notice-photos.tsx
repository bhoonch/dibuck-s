"use client";

import { useRef, useState, useTransition } from "react";
import { Camera, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MAX_NOTICE_PHOTOS, NOTICE_CAPTION_MAX } from "@/lib/notice-catalog";
import { tryShrinkImage } from "@/lib/shrink-image";
import {
  deleteNoticePhoto,
  saveNoticePhotoCaption,
  uploadNoticePhoto,
} from "../actions";

export type PhotoRow = { id: string; caption: string };

/**
 * 사진 패널 — 올리면 용지의 사진대지 칸에 바로 실린다. 캡션은 칸 하단 문구.
 * 생성 폼이 아니라 여기(문서 화면)에 두는 이유: 초안을 본 뒤에야 어떤 사진을
 * 어디에 실을지 판단이 서고, AI 실패 경로에 업로드가 얽히지 않는다.
 */
export function NoticePhotos({
  docId,
  photos,
  editable,
}: {
  docId: string;
  photos: PhotoRow[];
  editable: boolean;
}) {
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = (file: File) => {
    setError(undefined);
    startTransition(async () => {
      // 견적서와 달리 원본 통과가 없다 — A4에 못 찍는 형식(HEIC 등)은 빈 박스로 인쇄된다
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
      const r = await uploadNoticePhoto(undefined, fd);
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
              disabled={pending || photos.length >= MAX_NOTICE_PHOTOS}
              onClick={() => inputRef.current?.click()}
            >
              {pending ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Camera className="size-3" />
              )}
              올리기 {photos.length}/{MAX_NOTICE_PHOTOS}
            </Button>
          </>
        )}
      </div>
      {photos.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          현장 사진을 올리면 용지 하단에 실립니다 — 설명 문구도 붙일 수
          있습니다.
        </p>
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
                    maxLength={NOTICE_CAPTION_MAX}
                    placeholder="사진 설명 (예: 놀이터 그네 보수 전)"
                    className="h-8 text-xs"
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v === p.caption) return;
                      setError(undefined);
                      startTransition(async () => {
                        const r = await saveNoticePhotoCaption(p.id, v);
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
                      const r = await deleteNoticePhoto(p.id);
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
