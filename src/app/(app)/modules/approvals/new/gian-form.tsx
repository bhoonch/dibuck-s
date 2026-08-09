"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  fieldInput,
  fieldLabel,
  panel,
  panelTitle,
} from "@/components/gian-ui";
import {
  buildApprovalSteps,
  classify,
  externalRoleLabels,
  fundLabels,
  type ExternalApprover,
  type FundSource,
} from "@/lib/gian/rules";
import { generateGian } from "../actions";

const docTypeLabel = {
  gian: "기안서 · 3단 결재",
  pumui: "품의서 · 4단 결재 (+회장)",
  ltp_work: "공사 추진 기안서 · 5단 결재 (+감사·회장)",
};

/**
 * 초안 생성 대기 — 폼 위를 덮는 반투명 막.
 * 경과 초를 세는 이유: 10~30초짜리 대기에서 "멈춘 건지 도는 건지"를 가르는 건
 * 스피너가 아니라 숫자가 올라가는 것이다.
 */
function GeneratingOverlay() {
  const [sec, setSec] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSec((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="absolute inset-0 z-10 rounded-lg bg-[var(--gian-card)]/85 backdrop-blur-[1px]">
      {/* sticky — 폼이 길어서 세로 중앙 정렬이면 안내가 화면 밖에 놓인다. 스크롤 위치와 무관하게 보이는 자리 */}
      <div className="sticky top-[35vh] flex flex-col items-center gap-3">
        <Loader2 className="size-8 animate-spin text-[var(--gian-ink-soft)]" />
        <p className="text-base font-bold">초안을 만들고 있습니다</p>
        <p className="text-sm text-[var(--gian-ink-soft)]">
          보통 10~30초 걸립니다 · <span className="font-mono">{sec}초</span>{" "}
          경과
        </p>
        <p className="text-xs text-[var(--gian-ink-soft)]">
          이 창을 닫지 마세요.
        </p>
      </div>
    </div>
  );
}

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
  directorLimit,
  defaults,
}: {
  /** 설정 > 결재선의 내부 결재자 (순서대로) */
  internal: { userId: string; name: string }[];
  external: ExternalApprover[];
  /** 관리규약의 소장 전결 한도 — 이하 지출은 회장 결재를 뺀다 */
  directorLimit: number | null;
  /** 다른 모듈에서 넘어온 초기값 — 설비 교체 품의(repairs)가 쓴다 */
  defaults?: { work?: string; why?: string };
}) {
  const [state, formAction, pending] = useActionState(generateGian, undefined);
  // [초안 만들기]는 화면 맨 아래 — 생성이 시작되면 맨 위로 올려 로딩 중임을 보여준다
  useEffect(() => {
    if (pending) window.scrollTo({ top: 0, behavior: "smooth" });
  }, [pending]);
  const [work, setWork] = useState(defaults?.work ?? "");
  const [location, setLocation] = useState("");
  const [why, setWhy] = useState(defaults?.why ?? "");
  const [amount, setAmount] = useState("");
  const [vat, setVat] = useState(true);
  const [quotes, setQuotes] = useState(["", "", ""]);
  const [fund, setFund] = useState<FundSource>("maintenance");
  const [budgeted, setBudgeted] = useState(true);
  const hasBudget = Number(amount.replace(/[^0-9]/g, "")) > 0;

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
        fund,
        budgeted,
        directorLimit: directorLimit ?? undefined,
      }),
    [work, location, why, amount, vat, fund, budgeted, directorLimit],
  );
  // 상신 때 뜰 스냅샷을 미리 보여준다 — 등록이 빠진 외부 결재자도 지금 알려준다
  const line = useMemo(
    () => buildApprovalSteps(cls, internal, external),
    [cls, internal, external],
  );

  return (
    <form
      action={formAction}
      className="grid items-start gap-6 xl:grid-cols-[minmax(0,794px)_320px]"
    >
      <div className="relative rounded-lg border border-[var(--gian-line)] bg-[var(--gian-card)] px-8 pt-7 pb-6 text-[var(--gian-ink)] shadow-[var(--gian-shadow)]">
        {/*
          10~30초는 버튼 안 스피너만으로 버티기엔 길다 — 그동안 화면이 죽은 것처럼 보였다.
          입력칸 위를 덮어 "지금 이 폼은 건드릴 수 없다"까지 같이 말한다.
        */}
        {pending && <GeneratingOverlay />}
        <h2 className="text-lg font-bold tracking-tight text-balance">
          어떤 문서를 올릴까요?
        </h2>
        <p className="mt-1 mb-6 text-sm text-[var(--gian-ink-soft)]">
          짧게 적으셔도 됩니다. 문장은 AI가 공문서 투로 완성하고, 법적 근거·계약
          방식·결재선은 규칙이 자동으로 붙입니다.
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

        {/*
          재원과 예산 반영 여부 — 입대의 의결이 필요한지를 가르는 실제 변수다.
          예전엔 본문에서 "승강기·배관" 같은 키워드로 장충금을 추측해서,
          "소방 점검 안내"에도 장충금 딱지가 붙는 오탐이 났다.
        */}
        {hasBudget && (
          <div className="mb-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="fund" className={fieldLabel}>
                ③-1 어느 돈으로 쓰나요?
              </label>
              <select
                id="fund"
                name="fund"
                value={fund}
                onChange={(e) => setFund(e.target.value as FundSource)}
                className={fieldInput}
              >
                {(Object.keys(fundLabels) as FundSource[]).map((f) => (
                  <option key={f} value={f}>
                    {fundLabels[f]}
                  </option>
                ))}
              </select>
              <Hint>
                장기수선충당금이면 감사·회장 결재와 장충금 경고가 붙습니다.
              </Hint>
            </div>
            <div>
              <label htmlFor="budgeted" className={fieldLabel}>
                ③-2 예산 반영
              </label>
              <select
                id="budgeted"
                name="budgeted"
                value={budgeted ? "yes" : "no"}
                onChange={(e) => setBudgeted(e.target.value === "yes")}
                className={fieldInput}
              >
                <option value="yes">연간 예산에 반영된 집행</option>
                <option value="no">예산 외 집행</option>
              </select>
              <Hint>
                예산 외 집행은 금액이 작아도 의결 대상인 단지가 많아 전결 한도를
                적용하지 않습니다.
              </Hint>
            </div>
          </div>
        )}

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
            몇 월인지라도 알면 &ldquo;8월 중&rdquo;처럼 대략만 적어 주세요. 비워
            두면 문서에 &ldquo;결재 후 확정&rdquo;으로 적힙니다. 계약일까지
            잡혔다면 &ldquo;8월 5일 계약, 9월 초 공사&rdquo;처럼 함께 적으면
            그대로 실립니다.
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
                    className={`${fieldInput}`}
                    placeholder={`업체 ${i}${i === 3 ? " (선택)" : ""}`}
                  />
                  <input
                    name={`quote${i}`}
                    inputMode="numeric"
                    className={`${fieldInput} font-mono`}
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
              <Loader2 className="size-4 animate-spin" /> 초안 생성 중…
              (10~30초)
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
          {/* "예산"은 이 화면에서 두 뜻이다(③ 이 건의 금액 / ③-2 연간 예산 반영) —
              번호로 못 박지 않으면 "예산 외 집행인데 왜 품의서?"로 읽힌다 */}
          <p className="mt-1 text-sm text-[var(--gian-ink-soft)]">
            ③ 예산(이 건의 금액)을 비우면 기안서, 입력하면 품의서로 자동
            판별됩니다.
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
            <p className="text-sm font-bold">장기수선계획 대상일 수 있습니다</p>
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
          {cls.withinDirectorLimit && (
            <p className="mt-2 text-sm text-[var(--gian-ink-soft)]">
              소장 전결 한도({directorLimit?.toLocaleString("ko-KR")}원, VAT
              제외) 이하이고 예산에 반영된 집행이라 회장 결재를 뺐습니다.
            </p>
          )}
          {/*
            회장이 붙은 이유도 말해 준다 — 전결됐을 때만 설명하고 붙었을 때 침묵하면
            "한도 이하인데 왜 회장이 있지?"를 사용자가 알 길이 없다.
          */}
          {!cls.withinDirectorLimit &&
            cls.externalApprovers.includes("CHAIR") && (
              <p className="mt-2 text-sm text-[var(--gian-ink-soft)]">
                {cls.docType === "ltp_work"
                  ? "장기수선충당금 집행은 한도와 무관하게 감사·회장 결재를 받습니다."
                  : budgeted === false
                    ? `연간 예산에 없는 집행(③-2 예산 외)이라 전결 한도(${directorLimit ? directorLimit.toLocaleString("ko-KR") + "원" : "미설정"})를 적용하지 않아 회장 결재가 붙습니다.`
                    : !directorLimit
                      ? "전결 한도가 설정되지 않아 지출 문서에는 회장 결재가 붙습니다 — 설정 > 전결 규정에서 관리규약의 한도를 등록하면 이하 금액은 소장 전결로 처리됩니다."
                      : `전결 한도(${directorLimit.toLocaleString("ko-KR")}원, VAT 제외)를 넘어 회장 결재가 붙습니다.`}
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
