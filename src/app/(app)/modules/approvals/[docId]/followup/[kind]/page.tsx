import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { isSubscribed } from "@/lib/modules";
import { formatMoney, type Classification } from "@/lib/gian/rules";
import {
  findFollowupFor,
  followupMeta,
  type FollowupKind,
} from "@/lib/gian/followup";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { fieldInput, fieldLabel } from "@/components/gian-ui";
import { createFollowup } from "../../../approval-actions";

/**
 * 후속 문서 입력 폼 — 원 품의에서 상속되지 않는 값만 받는다.
 * 공사명·계약금액·업체는 이미 결재된 사실이라 여기서 다시 묻지 않고 요약으로만 보여준다.
 */

function Field({
  name,
  label,
  hint,
  placeholder,
  defaultValue,
  required = true,
}: {
  name: string;
  label: string;
  hint?: string;
  placeholder?: string;
  defaultValue?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label htmlFor={name} className={fieldLabel}>
        {label}
        {!required && (
          <span className="text-xs font-normal text-[var(--gian-ink-soft)]">
            선택
          </span>
        )}
      </label>
      <input
        id={name}
        name={name}
        className={fieldInput}
        placeholder={placeholder}
        defaultValue={defaultValue}
        required={required}
      />
      {hint && (
        <p className="mt-1 text-xs text-[var(--gian-ink-soft)]">{hint}</p>
      )}
    </div>
  );
}

export default async function FollowupFormPage({
  params,
}: {
  params: Promise<{ docId: string; kind: string }>;
}) {
  const session = await requireSession();
  if (!(await isSubscribed(session.tenantId!, "approvals")))
    redirect("/settings/subscriptions");

  const { docId, kind: rawKind } = await params;
  if (rawKind !== "report" && rawKind !== "expense") notFound();
  const kind = rawKind as FollowupKind;

  const doc = await db.document.findUnique({ where: { id: docId } });
  if (!doc || doc.tenantId !== session.tenantId || doc.moduleId !== "approvals")
    notFound();
  // 결재가 끝난 문서에서만 후속이 나온다 — 승인 안 된 지출을 결의할 수는 없다
  if (doc.status !== "final") redirect(`/modules/approvals/${doc.id}`);

  const meta = doc.meta as {
    cls?: Classification;
    form?: { work: string };
    quotes?: { vendor: string; amount: number }[];
  } | null;
  if (!meta?.cls || !meta.form) notFound();

  // 이미 만들었으면 그 문서로 보낸다(폼을 다시 그리면 중복 생성으로 오해한다)
  const existing = await findFollowupFor(doc.id, kind);
  if (existing) redirect(`/modules/approvals/${existing.id}`);

  const info = followupMeta[kind];
  const vendor = meta.quotes?.[0]?.vendor ?? "";

  return (
    <form
      action={createFollowup}
      className="mx-auto max-w-[794px] xl:max-w-[1138px]"
    >
      <input type="hidden" name="docId" value={doc.id} />
      <input type="hidden" name="kind" value={kind} />
      <Link
        href={`/modules/approvals/${doc.id}`}
        className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        원본 문서로 돌아가기
      </Link>
      <PageHeader
        title={info.label}
        description="원본 품의의 내용을 그대로 이어받습니다. 새로 알아야 하는 것만 입력해 주세요."
      />

      <div className="max-w-[794px] space-y-4 rounded-lg border border-[var(--gian-line)] bg-[var(--gian-card)] p-6 shadow-[var(--gian-shadow)]">
        {/* 상속되는 값 — 입력칸이 아니라 사실 확인용 요약이다 */}
        <div className="rounded-md border border-[var(--gian-line)] bg-[var(--gian-paper)] px-4 py-3 text-sm">
          <p className="font-semibold">{meta.form.work}</p>
          <p className="mt-1 text-[var(--gian-ink-soft)]">
            {doc.docNo} · {formatMoney(meta.cls.amountRaw, meta.cls.vatIncluded)}
            {vendor && ` · ${vendor}`}
          </p>
        </div>

        {kind === "report" ? (
          <>
            <Field
              name="period"
              label="공사기간"
              placeholder="예: 2026년 8월 3일 ~ 8월 7일"
              hint="계획이 아니라 실제로 공사한 기간을 적습니다."
            />
            <Field
              name="condition"
              label="시공상태 검수 결과"
              placeholder="예: 지하주차장 1~2층 전 구역 교체 완료 및 점등 상태 양호함."
            />
            <Field
              name="inspector"
              label="검수자"
              placeholder="예: 관리과장 ○○○, 관리소장 ○○○ (합동 검수)"
            />
            <Field
              name="waste"
              label="철거폐기물 처리"
              placeholder="예: 기존 노후 등기구 전량 회수 및 적법 처리 확인함."
              required={false}
            />
            <Field
              name="followup"
              label="후속조치"
              placeholder="비워 두면 기본 문구가 들어갑니다"
              hint="공사완료확인서 교부 및 세금계산서 수령 후 대금 지급 절차 진행"
              required={false}
            />
          </>
        ) : (
          <>
            <Field
              name="payDate"
              label="지출일자"
              placeholder="예: 2026년 8월 20일"
            />
            <Field
              name="account"
              label="계정과목"
              placeholder="예: [관] 수선비 / [항] 수선유지비 / [목] 공용시설수선비"
              hint="관리비 회계의 관·항·목 3단으로 적습니다."
            />
            <Field
              name="vendor"
              label="채권자 상호"
              defaultValue={vendor}
              placeholder="예: A 이엔지(주)"
            />
            <Field name="ceo" label="대표자" placeholder="예: 홍길동" />
            <Field
              name="bizNo"
              label="사업자등록번호"
              placeholder="예: 000-00-00000"
            />
            <Field
              name="bank"
              label="입금계좌"
              placeholder="예: ○○은행 000-000000-00000 (예금주: A 이엔지)"
            />
          </>
        )}

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Button type="submit" size="lg">
            {info.label} 만들기
          </Button>
          <p className="text-sm text-muted-foreground">
            초안으로 저장됩니다 — 내용을 확인한 뒤 상신하세요.
          </p>
        </div>
      </div>
    </form>
  );
}
