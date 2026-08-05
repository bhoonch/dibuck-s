"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import {
  WIZARD_QUESTIONS,
  catalogItemOf,
  cycleLabel,
} from "@/lib/inspection/catalog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { applyWizard } from "../actions";

/**
 * 설정 마법사 — 이 화면이 온보딩의 전부다.
 * 1단계: 시설 질문 체크 → 2단계: 켜질 항목의 마지막 실시일 한 번에 입력.
 * 실시일은 모르면 비워 두기 허용 — 현황판이 "기준일 필요"로 알려 준다.
 */
export function SetupWizard({ existingKeys }: { existingKeys: string[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const [checked, setChecked] = useState<Set<string>>(
    () => new Set(WIZARD_QUESTIONS.filter((q) => q.defaultOn).map((q) => q.key)),
  );
  const [anchors, setAnchors] = useState<Record<string, string>>({});

  const have = useMemo(() => new Set(existingKeys), [existingKeys]);
  // 체크된 질문이 켤 항목(중복 제거) — 이미 있는 항목은 표시만 하고 건너뛴다
  const targets = useMemo(() => {
    const keys = [
      ...new Set(
        WIZARD_QUESTIONS.filter((q) => checked.has(q.key)).flatMap(
          (q) => q.itemKeys,
        ),
      ),
    ];
    return keys.map((k) => ({ key: k, item: catalogItemOf(k)!, exists: have.has(k) }));
  }, [checked, have]);
  const fresh = targets.filter((t) => !t.exists);

  const toggle = (key: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const submit = () =>
    startTransition(async () => {
      const r = await applyWizard({
        questions: [...checked],
        anchors,
      });
      if (r && "error" in r && r.error) setError(r.error);
      else router.push("/modules/facilities");
    });

  return (
    <div className="space-y-4">
      <Card className="p-6">
        <h2 className="mb-1 text-sm font-semibold">1. 단지에 있는 시설을 체크하세요</h2>
        <p className="mb-4 text-xs text-muted-foreground">
          대상 여부가 애매하면 켜 두는 쪽이 안전합니다 — 나중에 [항목 관리]에서
          언제든 끌 수 있습니다.
        </p>
        <ul className="divide-y">
          {WIZARD_QUESTIONS.map((q) => (
            <li key={q.key} className="py-3">
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={checked.has(q.key)}
                  onChange={() => toggle(q.key)}
                  className="mt-0.5 size-4 accent-blue-700"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{q.question}</span>
                  <span className="block text-xs text-muted-foreground">{q.hint}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </Card>

      {targets.length > 0 && (
        <Card className="p-6">
          <h2 className="mb-1 text-sm font-semibold">
            2. 마지막으로 실시한 날짜를 아는 만큼만 넣어 주세요
          </h2>
          <p className="mb-4 text-xs text-muted-foreground">
            다음 도래일 = 마지막 실시일 + 법정 주기입니다. 모르면 비워 두세요 —
            이번 점검을 마치고 기록을 남기면 자동으로 채워집니다.
          </p>
          <ul className="divide-y">
            {targets.map(({ key, item, exists }) => (
              <li key={key} className="flex flex-wrap items-center gap-3 py-2.5">
                <span className="w-56 shrink-0 text-sm font-medium">{item.label}</span>
                <span className="w-24 shrink-0 text-xs text-muted-foreground">
                  {cycleLabel(item.cycle)}
                </span>
                {exists ? (
                  <span className="text-xs text-muted-foreground">
                    이미 켜져 있음 — 그대로 둡니다
                  </span>
                ) : (
                  <Input
                    type="date"
                    value={anchors[key] ?? ""}
                    onChange={(e) =>
                      setAnchors((prev) => ({ ...prev, [key]: e.target.value }))
                    }
                    className="w-40"
                    aria-label={`${item.label} 마지막 실시일 (선택)`}
                  />
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex items-center gap-3">
        <Button size="lg" onClick={submit} disabled={pending || fresh.length === 0}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          항목 {fresh.length}개 켜고 시작하기
        </Button>
        <span className="text-xs text-muted-foreground">
          카탈로그에 없는 단지 고유 점검은 [항목 관리]에서 직접 추가할 수 있습니다.
        </span>
      </div>
    </div>
  );
}
