"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createInquiry } from "./actions";

const CATEGORIES = ["기능 문의", "구독", "계정", "결제"];

export function InquiryForm({ defaultCategory }: { defaultCategory?: string }) {
  const [state, action, pending] = useActionState(createInquiry, undefined);

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-2">
        <Label>문의 유형</Label>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <label key={c} className="cursor-pointer">
              <input
                type="radio"
                name="category"
                value={c}
                defaultChecked={
                  c === (CATEGORIES.includes(defaultCategory ?? "") ? defaultCategory : "기능 문의")
                }
                className="peer sr-only"
              />
              <span className="inline-block rounded-full border px-3 py-1.5 text-sm text-gray-600 transition-colors peer-checked:border-primary peer-checked:bg-blue-50 peer-checked:font-semibold peer-checked:text-primary">
                {c}
              </span>
            </label>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="title">문의 내용</Label>
        <Textarea
          id="title"
          name="title"
          rows={4}
          maxLength={500}
          placeholder="궁금한 점이나 요청 사항을 적어 주세요."
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="contact">연락처 (선택)</Label>
        <Input
          id="contact"
          name="contact"
          placeholder="답변받을 전화번호 — 비우면 가입 이메일로 안내"
        />
      </div>
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state?.success && <p className="text-sm text-green-700">{state.success}</p>}
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "접수 중..." : "문의 접수"}
      </Button>
    </form>
  );
}
