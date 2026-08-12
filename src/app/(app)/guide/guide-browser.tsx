"use client";

import { createElement, useCallback, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  Lightbulb,
  Rocket,
  type LucideIcon,
} from "lucide-react";
import type { GuideSection } from "@/lib/guide";
import { getModuleIcon } from "@/lib/module-icons";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

// 시작·공통 섹션의 아이콘은 모듈 레지스트리 밖이라 여기서 직접 잇는다
// (moduleIcons 맵에 넣으면 관리자 모듈 등록 화면의 선택지에도 나와 버린다)
const extraIcons: Record<string, LucideIcon> = { Rocket, FolderOpen };
const iconFor = (name?: string): LucideIcon =>
  (name && extraIcons[name]) || getModuleIcon(name ?? "");

/**
 * 사용법 본문 — 왼쪽 목록은 고정, 오른쪽에 고른 항목 하나만 그린다.
 *
 * 세로로 전부 이어 붙이면 목차를 눌렀을 때 먼 거리를 스크롤해야 하고, 앱 헤더가
 * sticky(h-14)라 착지한 카드 제목이 헤더 뒤로 들어가 잘려 보였다. 한 번에 하나만
 * 그리면 그 이동 자체가 없어진다.
 *
 * 바깥에서 항목을 지정해 들어오는 입구가 있다 — 모듈 홈의 [사용법] 버튼
 * (`/guide?m=repairs`). 어느 항목을 펼칠지는 서버가 정해 initialId로 넘긴다.
 */
export function GuideBrowser({
  sections,
  initialId,
}: {
  sections: GuideSection[];
  /** 첫 화면에 펼칠 항목 — 쿼리(?m=)를 서버가 읽어 넘긴다 */
  initialId: string;
}) {
  const [currentId, setCurrentId] = useState(initialId);
  const topRef = useRef<HTMLDivElement>(null);

  /** 목록 선택 — 주소도 맞춰 두어 지금 보는 항목의 링크를 복사해 쓸 수 있게 한다.
   *  history를 쌓지 않는 이유: 뒤로가기가 항목 사이를 되짚으면 사용법을 빠져나갈 수 없다 */
  const select = useCallback((id: string) => {
    setCurrentId(id);
    history.replaceState(null, "", `?m=${id}`);
    // 아래로 내려가 있던 상태에서 다른 항목을 고르면 본문 위가 화면 밖이다.
    // 헤더(h-14 = 56px)에 가리지 않게 그만큼 띄워 되돌린다
    requestAnimationFrame(() => {
      const el = topRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      if (top < 0) window.scrollTo({ top: top + window.scrollY - 72 });
    });
  }, []);

  const current = sections.find((s) => s.id === currentId) ?? sections[0];
  if (!current) return null;
  const idx = sections.indexOf(current);
  const prev = sections[idx - 1];
  const next = sections[idx + 1];

  return (
    <div
      ref={topRef}
      className="scroll-mt-20 items-start gap-6 lg:grid lg:grid-cols-[13rem_minmax(0,1fr)]"
    >
      {/* 목록 — 데스크톱은 왼쪽 고정, 폰은 가로로 넘기는 칩 줄 */}
      <nav
        aria-label="사용법 항목"
        className="mb-4 flex gap-2 overflow-x-auto pb-1 lg:sticky lg:top-20 lg:mb-0 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:pb-0"
      >
        {sections.map((s) => {
          const on = s.id === current.id;
          const Icon = iconFor(s.icon);
          return (
            <button
              key={s.id}
              type="button"
              aria-current={on ? "true" : undefined}
              onClick={() => select(s.id)}
              className={`flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-left text-sm whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none lg:w-full ${
                on
                  ? "bg-accent font-semibold text-accent-foreground"
                  : "border text-gray-700 hover:bg-gray-100 lg:border-0"
              }`}
            >
              <Icon
                className={`size-4 shrink-0 ${on ? "" : "text-gray-400"}`}
              />
              {s.title}
            </button>
          );
        })}
      </nav>

      <Card className="p-6">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
            {/* PascalCase 변수로 만들면 render 중 컴포넌트 생성으로 잡힌다 — 기존 컴포넌트 참조라 createElement로 그린다 */}
            {createElement(iconFor(current.icon), { className: "size-4" })}
          </span>
          <div>
            <h2 className="text-lg font-semibold tracking-tight">
              {current.title}
            </h2>
            <p className="text-sm text-muted-foreground">{current.tagline}</p>
          </div>
        </div>

        <div className="mt-4 rounded-md bg-muted/50 px-4 py-3">
          <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            이럴 때 씁니다
          </p>
          <ul className="mt-1.5 space-y-1">
            {current.when.map((w) => (
              <li key={w} className="flex gap-1.5 text-sm">
                <span className="text-muted-foreground">·</span>
                {w}
              </li>
            ))}
          </ul>
        </div>

        {/* 흐름 요약 — 단계 이름만 한 줄로 */}
        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          {current.flow.map((f, i) => (
            <span key={f} className="flex items-center gap-1.5">
              {i > 0 && (
                <ChevronRight className="size-3.5 text-muted-foreground" />
              )}
              <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-800">
                {f}
              </span>
            </span>
          ))}
        </div>

        <ol className="mt-5 space-y-4">
          {current.steps.map((step, i) => (
            <li key={step.title} className="flex gap-3">
              <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                {i + 1}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold">{step.title}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {step.desc}
                </p>
                {step.href && (
                  <Link
                    href={step.href}
                    className="mt-1 inline-flex items-center gap-0.5 text-sm font-medium text-blue-700 hover:underline"
                  >
                    {step.hrefLabel ?? "바로 가기"}
                    <ArrowUpRight className="size-3.5" />
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ol>

        {current.tips && current.tips.length > 0 && (
          <div className="mt-5 rounded-md border border-amber-200 bg-amber-50/60 px-4 py-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-amber-800 uppercase">
              <Lightbulb className="size-3.5" />
              알아 두면 좋아요
            </p>
            <ul className="mt-1.5 space-y-1">
              {current.tips.map((t) => (
                <li key={t} className="flex gap-1.5 text-sm text-amber-900">
                  <span>·</span>
                  {t}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 이전/다음 — 목차로 시선을 되돌리지 않고 순서대로 읽어 내려갈 수 있게 */}
        <div className="mt-6 flex items-center justify-between gap-3 border-t border-gray-100 pt-4">
          {prev ? (
            <Button type="button" variant="outline" onClick={() => select(prev.id)}>
              <ChevronLeft className="size-4" />
              {prev.title}
            </Button>
          ) : (
            <span />
          )}
          {next ? (
            <Button type="button" variant="outline" onClick={() => select(next.id)}>
              {next.title}
              <ChevronRight className="size-4" />
            </Button>
          ) : (
            <span />
          )}
        </div>
      </Card>
    </div>
  );
}
