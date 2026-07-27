"use client";

import { useActionState, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fieldInput, fieldLabel } from "@/components/gian-ui";
import { classify } from "@/lib/gian/rules";
import { generateGian } from "../actions";

const docTypeLabel = {
  gian: "기안서 · 3단 결재",
  pumui: "품의서 · 4단 결재 (+회장)",
  ltp_work: "공사 추진 기안서 · 5단 결재 (+감사·회장)",
};

/**
 * 기안·품의 입력 폼 — 올림 목업의 `.form-card` 양식(620px 단일 카드, ①~⑤).
 * 판정 배지·장충금 경고는 목업 `.verdict` / `.ltp-warn` 그대로.
 */
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
    <form action={formAction} className="mx-auto mt-2 max-w-[620px]">
      <div className="rounded-lg border border-[var(--gian-line)] bg-[var(--gian-card)] px-8 pt-7 pb-6 text-[var(--gian-ink)] shadow-[var(--gian-shadow)]">
        <h2 className="mb-6 text-lg font-bold tracking-tight text-balance">
          어떤 문서를 올릴까요?
        </h2>

        <div className="mb-4">
          <label htmlFor="work" className={fieldLabel}>
            ① 무슨 일인가요?
          </label>
          <input
            id="work"
            name="work"
            className={fieldInput}
            placeholder="예: 지하주차장 노후 등기구 LED 교체 공사"
            value={work}
            onChange={(e) => setWork(e.target.value)}
            autoComplete="off"
            required
          />
        </div>

        <div className="mb-4">
          <label htmlFor="location" className={fieldLabel}>
            ② 어디인가요?
          </label>
          <input
            id="location"
            name="location"
            className={fieldInput}
            placeholder="예: 지하주차장 1~2층 전구역"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            autoComplete="off"
          />
        </div>

        <div className="mb-4">
          <label htmlFor="amount" className={fieldLabel}>
            ③ 예산
            <span className="text-xs font-normal text-[var(--gian-ink-soft)]">
              금액이 없으면 기안서로 작성됩니다
            </span>
          </label>
          <div className="flex items-center gap-3">
            <input
              id="amount"
              name="amount"
              inputMode="numeric"
              className={`${fieldInput} flex-1 font-mono`}
              placeholder="4,500,000"
              value={amount}
              onChange={(e) => {
                const n = e.target.value.replace(/[^0-9]/g, "");
                setAmount(n ? Number(n).toLocaleString("ko-KR") : "");
              }}
              autoComplete="off"
            />
            <span className="text-sm text-[var(--gian-ink-soft)]">원</span>
            <label className="flex shrink-0 items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                name="vat"
                checked={vat}
                onChange={(e) => setVat(e.target.checked)}
                className="size-4 accent-[var(--gian-navy)]"
              />
              VAT 포함
            </label>
          </div>

          {/* 판정 배지 (목업 .verdict) — 전부 코드 판정, 결과 화면과 같은 규칙 */}
          <div className="mt-2.5 space-y-2.5">
            <div className="flex items-start gap-2.5 rounded-md bg-[var(--gian-paper)] px-3.5 py-2.5 text-sm leading-relaxed text-[var(--gian-ink-soft)]">
              <span className="mt-[7px] size-2 shrink-0 rounded-full bg-current" />
              <span>
                <b className="block text-sm text-[var(--gian-ink)]">
                  {docTypeLabel[cls.docType]}
                </b>
                예산을 비우면 기안서, 입력하면 품의서로 자동 판별됩니다.
              </span>
            </div>
            {cls.context === "direct" && (
              <div className="flex items-start gap-2.5 rounded-md bg-[var(--gian-ok-soft)] px-3.5 py-2.5 text-sm leading-relaxed text-[var(--gian-ok)]">
                <span className="mt-[7px] size-2 shrink-0 rounded-full bg-current" />
                <span>
                  <b className="block text-sm">수의계약 대상</b>
                  VAT 제외 {cls.vatExcluded.toLocaleString("ko-KR")}원 ≤ 500만
                  원 — 2개사 이상 견적이 필요합니다.
                </span>
              </div>
            )}
            {cls.context === "bid" && (
              <div className="flex items-start gap-2.5 rounded-md bg-[var(--gian-stamp-soft)] px-3.5 py-2.5 text-sm leading-relaxed text-[var(--gian-stamp)]">
                <span className="mt-[7px] size-2 shrink-0 rounded-full bg-current" />
                <span>
                  <b className="block text-sm">경쟁입찰 대상</b>
                  VAT 제외 {cls.vatExcluded.toLocaleString("ko-KR")}원 &gt; 500만
                  원 — 입주자대표회의 의결 후 K-apt 전자입찰로 선정해야 합니다.
                </span>
              </div>
            )}
            {cls.docType === "ltp_work" && (
              <div className="rounded-md bg-[var(--gian-warn-soft)] px-3.5 py-2.5 text-sm leading-relaxed text-[var(--gian-warn)]">
                <b className="block">장기수선계획 대상일 수 있습니다.</b>
                수선유지비가 아닌 장기수선충당금 사용 대상인지 검토가 필요합니다
                (공동주택관리법 제29·30조).
              </div>
            )}
          </div>
        </div>

        <div className="mb-4">
          <label htmlFor="schedule" className={fieldLabel}>
            ④ 언제 하나요?
            <span className="text-xs font-normal text-[var(--gian-ink-soft)]">
              선택
            </span>
          </label>
          <input
            id="schedule"
            name="schedule"
            className={fieldInput}
            placeholder="예: 8월 중 계약, 9월 초 공사"
            autoComplete="off"
          />
        </div>

        <div className="mb-4">
          <label htmlFor="why" className={fieldLabel}>
            ⑤ 왜 필요한가요?
            <span className="text-xs font-normal text-[var(--gian-ink-soft)]">
              키워드만 적어도 됩니다 (예: 누수, 민원, 노후)
            </span>
          </label>
          <textarea
            id="why"
            name="why"
            rows={3}
            className={`${fieldInput} min-h-[84px] resize-y`}
            placeholder="예: 형광등이 자주 고장 나고 어두워서 민원이 계속 들어옵니다"
            value={why}
            onChange={(e) => setWhy(e.target.value)}
          />
        </div>

        {/* 수의계약이면 견적 2개사 이상 — 법적 요건이라 서버에서도 검증한다 */}
        {cls.context === "direct" && (
          <div className="mb-4 rounded-md border border-[var(--gian-line)] bg-[var(--gian-paper)] p-3.5">
            <p className="mb-2 text-sm font-bold">
              견적 비교 <span className="text-[var(--gian-stamp)]">*</span>
              <span className="ml-2 text-xs font-normal text-[var(--gian-ink-soft)]">
                2개사 이상 — 최저가가 선정 업체가 됩니다
              </span>
            </p>
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="grid grid-cols-2 gap-2">
                  <input
                    name={`vendor${i}`}
                    className={`${fieldInput} bg-[var(--gian-card)]`}
                    placeholder={`업체 ${i}${i === 3 ? " (선택)" : ""}`}
                  />
                  <input
                    name={`quote${i}`}
                    inputMode="numeric"
                    className={`${fieldInput} bg-[var(--gian-card)] font-mono`}
                    placeholder="견적 금액 (원)"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {state?.error && (
          <p className="mb-2 text-sm text-destructive">{state.error}</p>
        )}

        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? (
            <>
              <Loader2 className="size-4 animate-spin" /> 초안 생성 중… (10~30초)
            </>
          ) : (
            "초안 생성"
          )}
        </Button>
        <p className="mt-3 text-center text-xs text-[var(--gian-ink-soft)]">
          생성된 문서는 초안이며, 최종 검토 책임은 관리주체에 있습니다.
        </p>
      </div>
    </form>
  );
}
