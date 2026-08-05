"use client";

import { useState, useTransition } from "react";
import { Loader2, Plus } from "lucide-react";
import { CYCLE_CHOICES, cycleLabel, type Cycle } from "@/lib/inspection/catalog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { addCustomItem, setItemActive, updateItem } from "../actions";

type ItemRow = {
  id: string;
  name: string;
  legalBasis: string;
  cycleType: string;
  cycleN: number | null;
  leadDays: number;
  /** YYYY-MM-DD, 없으면 "" */
  lastDoneAt: string;
  vendor: string;
  active: boolean;
  /** 카탈로그 항목 여부 — 사용자 정의는 근거가 자유 텍스트 */
  preset: boolean;
};

const selectCls = "h-9 rounded-md border border-input bg-transparent px-2 text-sm";

function AddForm() {
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [legalBasis, setLegalBasis] = useState("");
  const [cycleValue, setCycleValue] = useState("ANNUAL");
  const [leadDays, setLeadDays] = useState("7");
  const [vendor, setVendor] = useState("");
  const [lastDoneAt, setLastDoneAt] = useState("");
  const [error, setError] = useState<string>();

  const add = () => {
    if (!name.trim() || pending) return;
    startTransition(async () => {
      const r = await addCustomItem({
        name,
        legalBasis,
        cycleValue,
        leadDays: Number(leadDays) || 7,
        vendor,
        lastDoneAt,
      });
      if (r && "error" in r && r.error) setError(r.error);
      else {
        setName("");
        setLegalBasis("");
        setVendor("");
        setLastDoneAt("");
        setError(undefined);
      }
    });
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="항목 이름 (예: 물놀이시설 수질검사)" className="w-64" />
        <Input value={legalBasis} onChange={(e) => setLegalBasis(e.target.value)} placeholder="근거 (선택)" className="w-48" />
        <select value={cycleValue} onChange={(e) => setCycleValue(e.target.value)} className={selectCls} aria-label="주기">
          {CYCLE_CHOICES.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
        <Input type="number" value={leadDays} onChange={(e) => setLeadDays(e.target.value)} className="w-20" aria-label="리드타임(일)" min={0} max={90} />
        <Input value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="업체 (선택)" className="w-40" />
        <Input type="date" value={lastDoneAt} onChange={(e) => setLastDoneAt(e.target.value)} className="w-40" aria-label="마지막 실시일 (선택)" />
        <Button type="button" onClick={add} disabled={pending || !name.trim()}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} 추가
        </Button>
      </div>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
  );
}

function Row({ row }: { row: ItemRow }) {
  const [pending, startTransition] = useTransition();
  const [vendor, setVendor] = useState(row.vendor);
  const [leadDays, setLeadDays] = useState(String(row.leadDays));
  const [lastDoneAt, setLastDoneAt] = useState(row.lastDoneAt);
  const dirty =
    vendor !== row.vendor ||
    leadDays !== String(row.leadDays) ||
    lastDoneAt !== row.lastDoneAt;

  return (
    <div className={`flex flex-wrap items-center gap-2 py-2 ${row.active ? "" : "opacity-50"}`}>
      <span className="w-56 shrink-0">
        <span className="block text-sm font-medium">{row.name}</span>
        <span className="block text-xs text-muted-foreground">
          {cycleLabel({ type: row.cycleType, n: row.cycleN ?? undefined } as Cycle)}
          {row.legalBasis ? ` · ${row.legalBasis}` : ""}
        </span>
      </span>
      <Input value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="업체명·연락처" className="w-44" disabled={!row.active} aria-label="업체" />
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        준비
        <Input type="number" value={leadDays} onChange={(e) => setLeadDays(e.target.value)} className="w-16" min={0} max={90} disabled={!row.active} aria-label="리드타임(일)" />
        일 전
      </span>
      <Input type="date" value={lastDoneAt} onChange={(e) => setLastDoneAt(e.target.value)} className="w-40" disabled={!row.active} aria-label="마지막 실시일" />
      {!row.active && (
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">비활성</span>
      )}
      <div className="ml-auto flex items-center gap-2">
        {dirty && row.active && (
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await updateItem({ id: row.id, vendor, leadDays: Number(leadDays) || 0, lastDoneAt });
              })
            }
          >
            저장
          </Button>
        )}
        {/* 퇴역은 삭제가 아니라 비활성 — 지난 기록의 항목명이 허공에 뜨면 안 된다 */}
        <Button
          size="sm"
          variant="ghost"
          className="text-muted-foreground"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await setItemActive(row.id, !row.active);
            })
          }
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : row.active ? "끄기" : "켜기"}
        </Button>
      </div>
    </div>
  );
}

export function ItemsManager({ items, canManage }: { items: ItemRow[]; canManage: boolean }) {
  if (!canManage)
    return (
      <Card className="p-6">
        <ul className="divide-y">
          {items.map((it) => (
            <li key={it.id} className={`flex items-center gap-2 py-2 text-sm ${it.active ? "" : "opacity-50"}`}>
              {it.name}
              <span className="text-xs text-muted-foreground">
                {cycleLabel({ type: it.cycleType, n: it.cycleN ?? undefined } as Cycle)}
                {it.vendor ? ` · ${it.vendor}` : ""}
              </span>
              {!it.active && (
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">비활성</span>
              )}
            </li>
          ))}
          {items.length === 0 && (
            <li className="py-2 text-sm text-muted-foreground">
              아직 점검 항목이 없습니다 — 항목 관리는 마스터·매니저가 합니다.
            </li>
          )}
        </ul>
      </Card>
    );

  return (
    <div className="space-y-4">
      <Card className="p-6">
        <h2 className="mb-3 text-sm font-semibold">사용자 정의 항목 추가</h2>
        <AddForm />
        <p className="mt-3 text-xs text-muted-foreground">
          카탈로그에 없는 단지 고유 점검(물놀이시설, 열병합 등)을 담는 자리입니다.
          법정 항목은 [설정 마법사]로 켜는 것이 빠릅니다.
        </p>
      </Card>

      <Card className="p-6">
        <h2 className="mb-1 text-sm font-semibold">
          점검 항목{" "}
          <span className="font-normal text-muted-foreground">
            ({items.filter((i) => i.active).length}개 활성)
          </span>
        </h2>
        <p className="mb-2 text-xs text-muted-foreground">
          기준일(마지막 실시일)을 고치면 다음 도래일이 다시 계산됩니다. 기록을
          완성하면 자동으로 갱신되므로 평소에는 손댈 일이 없습니다.
        </p>
        <div className="divide-y">
          {items.map((it) => (
            <Row key={it.id} row={it} />
          ))}
          {items.length === 0 && (
            <p className="py-2 text-sm text-muted-foreground">
              아직 항목이 없습니다 — [설정 마법사]로 시작하세요.
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}
