"use client";

import Link from "next/link";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  announcementTargets,
  targetNeedsModule,
  targetNeedsTenants,
} from "@/lib/announcements";
import { postAnnouncement } from "../actions";
import { btnOutline, btnSubmit } from "../ui";

const select =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
const hint = "text-xs text-muted-foreground";

export function AnnouncementForm({
  modules,
  tenants,
  today,
}: {
  modules: { id: string; name: string }[];
  tenants: { id: string; name: string }[];
  today: string;
}) {
  const [target, setTarget] = useState("ALL");
  const [picked, setPicked] = useState<string[]>([]);

  const toggleTenant = (id: string) =>
    setPicked((prev) =>
      prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id],
    );

  return (
    <form action={postAnnouncement} className="max-w-2xl space-y-4">
      <div className="space-y-4 rounded-lg border bg-card p-4">
        <div className="space-y-2">
          <Label htmlFor="message">공지 내용</Label>
          <Textarea
            id="message"
            name="message"
            rows={3}
            required
            placeholder="예: 8/10(월) 02:00~04:00 서버 점검이 예정되어 있습니다."
          />
          <p className={hint}>
            단지 화면 상단에 한 줄 배너로 뜹니다. 길면 잘리니 한 문장으로 쓰세요.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="target">발송 대상</Label>
            <select
              id="target"
              name="target"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className={select}
            >
              {Object.entries(announcementTargets).map(([value, name]) => (
                <option key={value} value={value}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          {targetNeedsModule(target) && (
            <div className="space-y-2">
              <Label htmlFor="moduleId">대상 모듈</Label>
              <select id="moduleId" name="moduleId" className={select} required>
                {modules.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <p className={`${hint} sm:col-span-2`}>
            {target === "MODULE"
              ? "이 모듈을 구독 중인 단지에만 보입니다. 기능 업데이트·점검 안내용."
              : target === "MODULE_NOT"
                ? "이 모듈을 아직 안 쓰는 단지에만 보입니다. 크로스셀용."
                : target === "TRIAL"
                  ? "무료 체험 중인 모듈이 하나라도 있는 단지에 보입니다. 전환 유도용."
                  : "대상이 좁은 공지가 넓은 공지를 이깁니다 — 전체 공지와 겹쳐도 개별 안내가 먼저 보입니다."}
          </p>
        </div>

        {targetNeedsTenants(target) && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label>대상 단지</Label>
              <span className="font-mono text-xs text-gray-500">
                {picked.length}곳 선택
              </span>
              {picked.length > 0 && (
                <button
                  type="button"
                  onClick={() => setPicked([])}
                  className="ml-auto text-xs font-semibold text-blue-700 hover:underline"
                >
                  선택 해제
                </button>
              )}
            </div>
            <div className="max-h-56 overflow-y-auto rounded-lg border p-1">
              <div className="grid sm:grid-cols-2">
                {tenants.map((t) => (
                  <label
                    key={t.id}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-gray-50"
                  >
                    <input
                      type="checkbox"
                      name="tenantIds"
                      value={t.id}
                      checked={picked.includes(t.id)}
                      onChange={() => toggleTenant(t.id)}
                      className="size-4 shrink-0 accent-blue-600"
                    />
                    <span className="truncate">{t.name}</span>
                  </label>
                ))}
              </div>
            </div>
            {picked.length === 0 && (
              <p className={hint}>한 곳 이상 골라야 등록됩니다.</p>
            )}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="startsAt">게시 시작</Label>
            <Input
              id="startsAt"
              name="startsAt"
              type="date"
              defaultValue={today}
            />
            <p className={hint}>미래 날짜면 예약 상태로 저장됩니다.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="endsAt">게시 종료 (선택)</Label>
            <Input id="endsAt" name="endsAt" type="date" />
            <p className={hint}>비워 두면 내릴 때까지 계속 게시됩니다.</p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="linkUrl">링크 (선택)</Label>
            <Input
              id="linkUrl"
              name="linkUrl"
              placeholder="/billing"
              pattern="/[^/].*"
            />
            <p className={hint}>
              배너에 버튼이 붙습니다. 앱 안 주소만 됩니다(예: /subscriptions).
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="linkLabel">링크 문구 (선택)</Label>
            <Input id="linkLabel" name="linkLabel" placeholder="자세히 보기" />
            <p className={hint}>비워 두면 &quot;자세히 보기&quot;로 표시됩니다.</p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button type="submit" className={btnSubmit}>
          공지 등록
        </button>
        <Link href="/admin/announcements" className={btnOutline}>
          취소
        </Link>
      </div>
    </form>
  );
}
