"use client";

import { useActionState, useMemo, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { classify } from "@/lib/gian/rules";
import { generateGian } from "../actions";

const docTypeLabel = {
  gian: "기안서 · 3단 결재",
  pumui: "품의서 · 4단 결재 (+회장)",
  ltp_work: "공사 추진 기안서 · 5단 결재 (+감사·회장)",
};

export function GianForm() {
  const [state, formAction, pending] = useActionState(generateGian, undefined);
  const [work, setWork] = useState("");
  const [location, setLocation] = useState("");
  const [why, setWhy] = useState("");
  const [amount, setAmount] = useState("");
  const [vat, setVat] = useState(true);

  // 입력 즉시 코드 판정 — LLM 호출 전에 수의계약/입찰·결재선·장충금이 확정된다
  const cls = useMemo(
    () =>
      classify({
        amountRaw: Number(amount.replace(/[^0-9]/g, "")) || 0,
        vatIncluded: vat,
        texts: [work, location, why],
      }),
    [work, location, why, amount, vat],
  );

  return (
    <form action={formAction}>
      <Card className="max-w-2xl gap-0 py-0">
        <CardHeader className="gap-0.5 border-b border-gray-100 px-4 py-3">
          <CardTitle className="text-lg tracking-tight">새 기안·품의</CardTitle>
          <CardDescription>
            다섯 항목만 입력하면 법적 검토를 마친 초안이 완성됩니다. 예산이
            없으면 기안서, 있으면 품의서로 자동 판별됩니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 p-4">
          <div className="space-y-2">
            <Label htmlFor="work">공사·사업명 (안건)</Label>
            <Input
              id="work"
              name="work"
              placeholder="예: 지하주차장 노후 등기구 LED 교체 공사"
              value={work}
              onChange={(e) => setWork(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="location">위치·대상</Label>
            <Input
              id="location"
              name="location"
              placeholder="예: 지하주차장 1~2층 전구역"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="amount">예산 (원)</Label>
            <div className="flex items-center gap-3">
              <Input
                id="amount"
                name="amount"
                inputMode="numeric"
                placeholder="없으면 비워두세요 → 기안서"
                value={amount}
                onChange={(e) => {
                  const n = e.target.value.replace(/[^0-9]/g, "");
                  setAmount(n ? Number(n).toLocaleString("ko-KR") : "");
                }}
              />
              <label className="flex shrink-0 items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  name="vat"
                  checked={vat}
                  onChange={(e) => setVat(e.target.checked)}
                  className="size-4"
                />
                VAT 포함
              </label>
            </div>
            <p className="text-xs text-muted-foreground">
              예산을 비우면 <b>기안서</b>, 입력하면 <b>품의서</b>가 자동
              적용됩니다. 장기수선 대상 공사(옥상 방수·승강기 등)는{" "}
              <b>공사 추진 기안서</b>로 바뀝니다.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="why">왜 필요한가요?</Label>
            <textarea
              id="why"
              name="why"
              rows={3}
              placeholder="예: 형광등이 자주 고장 나고 어두워서 민원이 계속 들어옵니다"
              value={why}
              onChange={(e) => setWhy(e.target.value)}
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="schedule">일정 (선택)</Label>
            <Input
              id="schedule"
              name="schedule"
              placeholder="예: 8월 중 계약, 9월 초 공사"
            />
          </div>

          {/* 판정 배지 — 전부 코드 판정, 결과 화면과 동일 규칙 */}
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-gray-100 px-2.5 py-1 font-medium text-gray-700">
              {docTypeLabel[cls.docType]}
            </span>
            {cls.context === "direct" && (
              <span className="rounded-full bg-green-50 px-2.5 py-1 font-medium text-green-700">
                수의계약 가능 — VAT 제외{" "}
                {cls.vatExcluded.toLocaleString("ko-KR")}원 ≤ 500만 원
              </span>
            )}
            {cls.context === "bid" && (
              <span className="rounded-full bg-red-50 px-2.5 py-1 font-medium text-red-700">
                500만 원 초과 — 입대의 의결 + K-apt 전자입찰
              </span>
            )}
          </div>
          {cls.docType === "ltp_work" && (
            <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <p>
                <b>장기수선계획 대상일 수 있습니다.</b> 수선유지비가 아닌
                장기수선충당금 사용 대상인지 검토가 필요합니다 (공동주택관리법
                제29·30조).
              </p>
            </div>
          )}

          {/* 수의계약이면 견적 2개사 이상 — 법적 요건이라 서버에서도 검증한다 */}
          {cls.context === "direct" && (
            <div className="space-y-2 rounded-lg border bg-background p-3">
              <p className="text-sm font-medium">
                견적 비교 <span className="text-destructive">*</span>
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  수의계약은 2개사 이상 견적이 필요합니다 — 최저가가 선정
                  업체가 됩니다
                </span>
              </p>
              {[1, 2, 3].map((i) => (
                <div key={i} className="grid grid-cols-2 gap-2">
                  <Input
                    name={`vendor${i}`}
                    placeholder={`업체 ${i}${i === 3 ? " (선택)" : ""}`}
                  />
                  <Input
                    name={`quote${i}`}
                    inputMode="numeric"
                    placeholder="견적 금액 (원)"
                  />
                </div>
              ))}
            </div>
          )}

          {state?.error && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}
        </CardContent>
        <CardFooter className="justify-end border-t border-gray-100 px-4 py-3">
          <Button type="submit" size="lg" disabled={pending}>
            {pending ? (
              <>
                <Loader2 className="size-4 animate-spin" /> 초안 생성 중… (10~30초)
              </>
            ) : (
              "초안 생성"
            )}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
