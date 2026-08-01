"use client";

import { ArrowUp } from "lucide-react";

/** 세대당 1장씩 쌓이는 긴 문서라 아래로 내려가면 돌아올 길이 멀다 — 화면을 따라다니는 맨 위로 */
export function BackToTop() {
  return (
    <button
      type="button"
      aria-label="맨 위로"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      className="fixed right-6 bottom-6 z-40 flex size-10 items-center justify-center rounded-full border bg-card text-gray-600 shadow-md transition-colors hover:bg-background hover:text-foreground print:hidden"
    >
      <ArrowUp className="size-5" />
    </button>
  );
}
