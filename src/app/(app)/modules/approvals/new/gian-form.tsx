"use client";

import { useActionState, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fieldInput, fieldLabel, panel, panelTitle } from "@/components/gian-ui";
import {
  buildApprovalSteps,
  classify,
  externalRoleLabels,
  type ExternalApprover,
} from "@/lib/gian/rules";
import { generateGian } from "../actions";

const docTypeLabel = {
  gian: "기안서 · 3단 결재",
  pumui: "품의서 · 4단 결재 (+회장)",
  ltp_work: "공사 추진 기안서 · 5단 결재 (+감사·회장)",
};

/** 칸 밑 한 줄 — "이 칸은 얼마나 대충이어도 되는지"를 예로 보여준다 */
function Hint({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-1.5 text-xs text-[var(--gian-ink-soft)]">{children}</p>
  );
}

/**
 * 기안·품의 입력 폼 — 문서 화면과 같은 기둥(A4 794 + 패널 288)을 쓴다.
 * 판정은 폼 안이 아니라 오른쪽 패널에 둔다: 세 화면(입력·초안·결재) 내내
 * 오른쪽 칸이 "이 문서에 대한 판단" 자리가 되도록.
 */
export function GianForm({
  internal,
  external,
}: {
  /** 설정 > 결재선의 내부 결재자 (순서대로) */
  internal: { userId: string; name: string }[];
  external: ExternalApprover[];
}) {
  const [state, formAction, pending] = useActionState(generateGian, undefined);
  const [work, setWork] = useState("");
  const [location, setLocation] = useState("");
  const [why, setWhy] = useState("");
  const [amount, setAmount] = useState("");
  const [vat, setVat] = useState(true);
  const [quotes, setQuotes] = useState(["", "", ""]);

  /** 금액 칸은 전부 천 단위 쉼표로 — 서버는 parseWon()이 숫자만 뽑아 쓴다 */
  const won = (v: string) => {
    const n = v.replace(/[^0-9]/g, "");
    return n ? Number(n).toLocaleString("ko-KR") : "";
  };

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
  // 상신 때 뜰 스냅샷을 미리 보여준다 — 등록이 빠진 외부 결재자도 지금 알려준다
  const line = useMemo(
    () => buildApprovalSteps(cls, internal, external),
    [cls, internal, external],
  );

  return (
    <form
      action={formAction}
      className="grid items-start gap-6 xl:grid-cols-[minmax(0,794px)_288px]"
    >
      <div className="rounded-lg border border-[var(--gian-line)] bg-[var(--gian-card)] px-8 pt-7 pb-6 text-[var(--gian-ink)] shadow-[var(--gian-shadow)]">
        <h2 className="text-lg font-bold tracking-tight text-balance">
          어떤 문서를 올릴까요?
        </h2>
        <p className="mt-1 mb-6 text-sm text-[var(--gian-ink-soft)]">
          짧게 적으셔도 됩니다. 문장은 AI가 공문서 투로 완성하고, 법적
          근거·계약 방식·결재선은 규칙이 자동으로 붙입니다.
        </p>

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
          <Hint>
            &ldquo;주차장 등 교체&rdquo;처럼 짧아도 됩니다 — 제목과 개요 문장은
            알아서 만들어집니다.
          </Hint>
        </div>

        <div className="mb-4">
          <label htmlFor="location" className={fieldLabel}>
            ② 어디인가요?
            <span className="text-xs font-normal text-[var(--gian-ink-soft)]">
              선택
            </span>
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
          <Hint>
            동·층·구역만 적으세요. &ldquo;지하 1층 B구역&rdquo;이면 충분합니다.
          </Hint>
        </div>

        <div className="mb-4">
          <label htmlFor="amount" className={fieldLabel}>
            ③ 예산
            <span className="text-xs font-normal text-[var(--gian-ink-soft)]">
              비우면 기안서로 작성됩니다
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
              onChange={(e) => setAmount(won(e.target.value))}
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
          <Hint>
            숫자만. VAT 제외로 환산해 500만 원 기준을 판정하므로 포함 여부만
            정확하면 됩니다.
          </Hint>
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
          <Hint>
            날짜를 확정하지 않았으면 &ldquo;8월 중&rdquo;처럼 대략만 적어도
            됩니다.
          </Hint>
        </div>

        <div className="mb-4">
          <label htmlFor="why" className={fieldLabel}>
            ⑤ 왜 필요한가요?
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
          <Hint>
            키워드만 나열해도 됩니다 — &ldquo;누수, 민원 반복, 노후&rdquo; →
            추진 배경 문장으로 정리됩니다.
          </Hint>
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
                    value={quotes[i - 1]}
                    onChange={(e) =>
                      setQuotes((q) =>
                        q.map((v, idx) =>
                          idx === i - 1 ? won(e.target.value) : v,
                        ),
                      )
                    }
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

      {/* ── 판정 패널 — 결재 화면의 결재선 카드와 같은 자리 ── */}
      <aside className="flex flex-col gap-3 xl:sticky xl:top-5">
        <div className={panel}>
          <h4 className={panelTitle}>지금 판정</h4>
          <p className="text-sm font-bold">{docTypeLabel[cls.docType]}</p>
          <p className="mt-1 text-sm text-[var(--gian-ink-soft)]">
            예산을 비우면 기안서, 입력하면 품의서로 자동 판별됩니다.
          </p>
        </div>

        {cls.context === "direct" && (
          <div className="rounded-lg bg-[var(--gian-ok-soft)] px-4 py-4 text-[var(--gian-ok)]">
            <h4 className={panelTitle}>계약 방식</h4>
            <p className="text-sm font-bold">수의계약 대상</p>
            <p className="mt-1 text-sm">
              VAT 제외 {cls.vatExcluded.toLocaleString("ko-KR")}원 ≤ 500만 원 —
              2개사 이상 견적이 필요합니다.
            </p>
          </div>
        )}
        {cls.context === "bid" && (
          <div className="rounded-lg bg-[var(--gian-stamp-soft)] px-4 py-4 text-[var(--gian-stamp)]">
            <h4 className={panelTitle}>계약 방식</h4>
            <p className="text-sm font-bold">경쟁입찰 대상</p>
            <p className="mt-1 text-sm">
              VAT 제외 {cls.vatExcluded.toLocaleString("ko-KR")}원 &gt; 500만 원
              — 입주자대표회의 의결 후 K-apt 전자입찰로 선정해야 합니다.
            </p>
          </div>
        )}
        {cls.docType === "ltp_work" && (
          <div className="rounded-lg bg-[var(--gian-warn-soft)] px-4 py-4 text-[var(--gian-warn)]">
            <h4 className={panelTitle}>확인 필요</h4>
            <p className="text-sm font-bold">
              장기수선계획 대상일 수 있습니다
            </p>
            <p className="mt-1 text-sm">
              수선유지비가 아닌 장기수선충당금 사용 대상인지 검토가 필요합니다
              (공동주택관리법 제29·30조).
            </p>
          </div>
        )}

        <div className={panel}>
          <h4 className={panelTitle}>결재선</h4>
          {line.steps.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              {line.steps.map((s, i) => (
                <span key={s.order} className="flex items-center gap-1.5">
                  {i > 0 && (
                    <span className="text-xs text-[var(--gian-ink-soft)]">
                      ▸
                    </span>
                  )}
                  <span className="rounded border border-[var(--gian-line-strong)] bg-[var(--gian-paper)] px-2.5 py-1 text-xs font-semibold">
                    {s.name}
                  </span>
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[var(--gian-ink-soft)]">
              설정 &gt; 결재선에서 결재자를 지정해야 상신할 수 있습니다.
            </p>
          )}
          {/* 상신 버튼을 눌러야 알게 되던 것을 여기서 미리 알린다 */}
          {line.missing.length > 0 && (
            <p className="mt-2 text-sm text-[var(--gian-stamp)]">
              {line.missing.map((r) => externalRoleLabels[r]).join("·")}이(가)
              등록되지 않아 지금은 상신할 수 없습니다 — 설정 &gt; 결재선에서
              등록해 주세요.
            </p>
          )}
          {line.steps.length > 0 && line.missing.length === 0 && (
            <p className="mt-2 text-sm text-[var(--gian-ink-soft)]">
              상신하는 순간 이 순서가 스냅샷으로 굳습니다.
            </p>
          )}
        </div>
      </aside>
    </form>
  );
}
