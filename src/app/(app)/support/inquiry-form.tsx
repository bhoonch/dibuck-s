"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createInquiry } from "./actions";

/**
 * 유형마다 한 줄 설명을 붙인다 — "구독"과 "결제"의 경계가 사용자에게 모호해서
 * 엉뚱하게 분류된 문의가 들어오면 운영팀이 다시 나눠야 한다.
 * `value`는 이미 접수된 문의의 분류와 맞춰야 하므로 바꾸지 않는다.
 */
const CATEGORIES = [
  { value: "기능 문의", desc: "사용법이 궁금하거나 오류가 있을 때" },
  { value: "구독", desc: "모듈 추가·해지" },
  { value: "계정", desc: "직원 계정·비밀번호" },
  { value: "결제", desc: "카드·영수증·환불" },
];

const MAX = 500;

export function InquiryForm({
  defaultCategory,
  fromPath,
}: {
  defaultCategory?: string;
  /** 어느 화면에서 문의를 눌렀는지 — 운영자가 "어디서요?"를 되묻지 않게 */
  fromPath?: string;
}) {
  const [state, action, pending] = useActionState(createInquiry, undefined);
  const [len, setLen] = useState(0);
  const initial = CATEGORIES.some((c) => c.value === defaultCategory)
    ? defaultCategory
    : "기능 문의";

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="fromPath" value={fromPath ?? ""} />
      <fieldset>
        <legend className="mb-2 text-sm font-semibold">문의 유형</legend>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {CATEGORIES.map((c) => (
            <label
              key={c.value}
              className="flex cursor-pointer flex-col gap-1 rounded-lg border p-3 transition-colors hover:bg-gray-100 has-checked:border-primary has-checked:bg-accent"
            >
              <span className="flex items-center gap-2">
                <input
                  type="radio"
                  name="category"
                  value={c.value}
                  defaultChecked={c.value === initial}
                  className="size-4 shrink-0 accent-primary"
                />
                <span className="text-sm font-semibold">{c.value}</span>
              </span>
              <span className="text-sm text-muted-foreground">{c.desc}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="space-y-2">
        <Label htmlFor="title">문의 내용</Label>
        <Textarea
          id="title"
          name="title"
          rows={12}
          maxLength={MAX}
          placeholder="궁금한 점이나 요청 사항을 적어 주세요. 화면 이름이나 하신 동작을 같이 적어 주시면 더 빨리 확인할 수 있습니다."
          onChange={(e) => setLen(e.target.value.length)}
          required
        />
        <p className="text-right text-xs text-muted-foreground tabular-nums">
          {len} / {MAX}자
        </p>
      </div>

      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state?.success && (
        <p className="text-sm text-green-700">{state.success}</p>
      )}
      {/* 화면만 봐서는 알 수 없는 유일한 사실 — 연락처 없이도 답을 받는다는 근거 */}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "접수 중..." : "문의 접수"}
        </Button>
        <p className="text-sm text-muted-foreground">
          답변이 등록되면 알림으로 알려드립니다.
        </p>
      </div>
    </form>
  );
}
