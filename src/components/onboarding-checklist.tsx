"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, ChevronRight, Rocket, X } from "lucide-react";

export type OnboardingStep = {
  label: string;
  desc: string;
  href: string;
  done: boolean;
};

/**
 * 가입 직후 시작 가이드. 완료 판정은 전부 실데이터라 "했다고 표시"가 없다 —
 * 체크박스를 따로 저장하면 실제 상태와 어긋난 채로 남는다.
 *
 * 전부 끝나면 스스로 사라지고, 그 전에도 닫을 수 있다(모듈 구독을 미루는 단지도 있다).
 */
export function OnboardingChecklist({ steps }: { steps: OnboardingStep[] }) {
  const [dismissed, setDismissed] = useState(false);
  const done = steps.filter((s) => s.done).length;

  if (dismissed || done === steps.length) return null;

  return (
    <section className="mb-4 overflow-hidden rounded-lg border bg-card">
      <div className="flex items-center gap-2.5 border-b border-gray-100 bg-blue-50/60 px-4 py-3">
        <span className="flex size-8 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
          <Rocket className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold">시작 가이드</p>
          <p className="text-xs text-muted-foreground">
            {steps.length}단계만 마치면 디벅을 제대로 쓸 수 있어요 · {done}/
            {steps.length} 완료
          </p>
        </div>
        <button
          onClick={() => setDismissed(true)}
          title="닫기"
          className="ml-auto rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-blue-100 hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="grid divide-y sm:grid-cols-2 sm:divide-y-0 xl:grid-cols-4">
        {steps.map((s, i) => (
          <Link
            key={s.href}
            href={s.href}
            className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50 sm:border-r sm:last:border-r-0"
          >
            {s.done ? (
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-green-600 text-white">
                <Check className="size-3" />
              </span>
            ) : (
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold text-muted-foreground">
                {i + 1}
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span
                className={`block text-sm font-medium ${
                  s.done ? "text-muted-foreground line-through" : ""
                }`}
              >
                {s.label}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {s.desc}
              </span>
            </span>
            {!s.done && (
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            )}
          </Link>
        ))}
      </div>
    </section>
  );
}
