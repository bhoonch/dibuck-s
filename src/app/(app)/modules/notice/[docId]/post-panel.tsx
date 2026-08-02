"use client";

import { useState, useTransition } from "react";
import { Loader2, Pencil, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { saveNoticePost, voidNoticePost } from "../actions";

type Draft = {
  title: string;
  intro: string;
  itemsText: string;
  bodyText: string;
  closing: string;
};

/**
 * 오른쪽 판단 칸 — 인쇄·내용 수정·폐기.
 * 수정은 LLM 재호출 없이 저장값을 고친다. 개요는 "라벨: 값" 한 줄이 항목 하나,
 * 협조 사항·본문은 한 줄이 한 항목이다.
 */
export function PostPanel({
  docId,
  voided,
  canEdit,
  initial,
}: {
  docId: string;
  voided: boolean;
  canEdit: boolean;
  initial: Draft;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(initial);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const set = (k: keyof Draft) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex flex-wrap gap-2">
        {!voided && (
          <Button onClick={() => window.print()}>
            <Printer className="size-4" /> 인쇄
          </Button>
        )}
        {!voided && canEdit && !editing && (
          <Button variant="outline" onClick={() => setEditing(true)}>
            <Pencil className="size-4" /> 내용 수정
          </Button>
        )}
      </div>
      {voided && (
        <p className="text-sm text-muted-foreground">
          폐기된 게시물입니다 — 열람만 됩니다. 필요하면 새 공지문을 만들어 주세요.
        </p>
      )}

      {editing && (
        <div className="space-y-3">
          <div>
            <Label htmlFor="pp-title">제목</Label>
            <Input
              id="pp-title"
              className="mt-1.5"
              value={form.title}
              onChange={(e) => set("title")(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="pp-intro">도입 문장</Label>
            <Textarea
              id="pp-intro"
              rows={3}
              className="mt-1.5"
              value={form.intro}
              onChange={(e) => set("intro")(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="pp-items">개요 표</Label>
            <Textarea
              id="pp-items"
              rows={4}
              className="mt-1.5"
              value={form.itemsText}
              onChange={(e) => set("itemsText")(e.target.value)}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              한 줄이 한 칸 — &quot;라벨: 값&quot; 형식입니다.
            </p>
          </div>
          <div>
            <Label htmlFor="pp-body">협조 사항·본문</Label>
            <Textarea
              id="pp-body"
              rows={5}
              className="mt-1.5"
              value={form.bodyText}
              onChange={(e) => set("bodyText")(e.target.value)}
            />
            <p className="mt-1 text-xs text-muted-foreground">한 줄이 한 항목입니다.</p>
          </div>
          <div>
            <Label htmlFor="pp-closing">맺음 문구</Label>
            <Input
              id="pp-closing"
              className="mt-1.5"
              value={form.closing}
              onChange={(e) => set("closing")(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <Button
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  setError(undefined);
                  const r = await saveNoticePost(docId, form);
                  if (r && "error" in r && r.error) setError(r.error);
                  else setEditing(false);
                })
              }
            >
              {pending && <Loader2 className="size-4 animate-spin" />} 저장
            </Button>
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => {
                setForm(initial);
                setEditing(false);
              }}
            >
              취소
            </Button>
          </div>
        </div>
      )}

      {error && <p className="text-sm font-medium text-destructive">{error}</p>}

      {!voided && canEdit && (
        <>
          {/* 되돌릴 수 없는 일은 오른쪽 첫 카드 하단, 구분선 뒤 — 인쇄 버튼 무리에 섞지 않는다 */}
          <Separator />
          <ConfirmDialog
            trigger={
              <Button
                variant="outline"
                size="sm"
                className="self-start text-destructive hover:text-destructive"
                disabled={pending}
              >
                게시물 폐기
              </Button>
            }
            title="이 게시물을 폐기할까요?"
            description="목록에는 '폐기'로 남고 열람만 됩니다. 같은 내용이 필요하면 새로 만들어 주세요."
            confirmLabel="폐기"
            destructive
            onConfirm={() =>
              startTransition(async () => {
                const r = await voidNoticePost(docId);
                if (r && "error" in r && r.error) setError(r.error);
              })
            }
          />
        </>
      )}
    </Card>
  );
}
