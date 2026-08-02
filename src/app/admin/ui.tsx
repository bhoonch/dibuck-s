/**
 * 관리자 콘솔 디자인 프리미티브.
 * 레이아웃·구성은 클로드디자인 "관리사무소 대시보드"(Copy)의 관리자 화면을 따르되,
 * 타이포·버튼은 사용자 대시보드와 같은 공용 체계(rem, 루트 17px)를 그대로 쓴다.
 */
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Tone = "success" | "danger" | "warn" | "info" | "muted";

const pillTones: Record<Tone, string> = {
  success: "bg-green-50 text-green-700",
  danger: "bg-red-50 text-red-700",
  warn: "bg-amber-50 text-amber-700",
  info: "bg-blue-50 text-blue-800",
  muted: "bg-gray-100 text-gray-600",
};

const textTones: Record<Tone, string> = {
  success: "text-green-700",
  danger: "text-red-700",
  warn: "text-amber-700",
  info: "text-blue-800",
  muted: "text-gray-500",
};

/* 버튼 — 공용 Button의 3단계 규칙 그대로 (lg=폼 주요 액션 / default=페이지·카드 액션 / sm=표 행 안) */
export const btnSubmit = buttonVariants({ size: "lg" });
export const btnPrimary = buttonVariants();
export const btnOutline = buttonVariants({ variant: "outline" });
export const btnRow = buttonVariants({ variant: "outline", size: "sm" });
export const btnRowPrimary = buttonVariants({ size: "sm" });

/** 금액 표시 — 기호(₩)·단위(만·억)를 숫자보다 한 단계 작게 그려 숫자가 주인공이 되게 한다.
 *  (원래는 mono 폰트의 ₩ 글리프 폴백 문제로 만들었다 — 글꼴이 Pretendard로 통일되며
 *  글리프 문제는 사라졌고, 크기 위계만 남겼다) */
export function Money({ n, short = false }: { n: number; short?: boolean }) {
  let num = n.toLocaleString();
  let unit = "";
  if (short && n >= 100_000_000) {
    num = (n / 100_000_000).toFixed(1);
    unit = "억";
  } else if (short && n >= 10_000) {
    num = Math.round(n / 10_000).toLocaleString();
    unit = "만";
  }
  return (
    <span className="whitespace-nowrap">
      <span className="mr-0.5 font-sans text-[0.72em]">₩</span>
      {num}
      {unit && <span className="font-sans text-[0.72em]">{unit}</span>}
    </span>
  );
}

/* 표 — 그리드 컬럼은 페이지마다 다르므로 style로 넘긴다 */
export const tableHead =
  "grid gap-3 border-b bg-gray-50 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-gray-500";
export const tableRow =
  "grid items-center gap-3 border-b border-gray-100 px-4 py-3 transition-colors last:border-b-0 hover:bg-gray-50";

export function PageTitle({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end gap-4">
      <div>
        {eyebrow && (
          <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-400">
            {eyebrow}
          </div>
        )}
        <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
        {description && (
          <p className="mt-1 text-sm text-gray-500">{description}</p>
        )}
      </div>
      {children && (
        <div className="ml-auto flex items-center gap-2">{children}</div>
      )}
    </div>
  );
}

export function Section({
  title,
  meta,
  action,
  bodyClassName,
  className,
  children,
}: {
  title: string;
  meta?: string;
  action?: React.ReactNode;
  bodyClassName?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn("overflow-hidden rounded-lg border bg-card", className)}
    >
      <div className="flex items-center gap-2.5 border-b border-gray-100 px-4 py-3">
        <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
        {meta && <span className="font-mono text-xs text-gray-500">{meta}</span>}
        {action && <div className="ml-auto">{action}</div>}
      </div>
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

export function Kpi({
  label,
  value,
  delta,
  tone = "muted",
}: {
  label: string;
  value: React.ReactNode;
  delta?: string;
  tone?: Tone;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">
        {label}
      </div>
      <div className="my-2 font-mono text-3xl font-semibold leading-none tracking-tight">
        {value}
      </div>
      <div className={cn("text-xs", textTones[tone])}>{delta ?? " "}</div>
    </div>
  );
}

export function Pill({
  tone,
  children,
}: {
  tone: Tone;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold",
        pillTones[tone],
      )}
    >
      {children}
    </span>
  );
}

/** 가로 진행 바 (모듈별 구독·전환율 등) */
export function Bar({
  value,
  max,
  tone = "info",
}: {
  value: number;
  max: number;
  tone?: "info" | "success";
}) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
      <div
        className={cn(
          "h-full rounded-full",
          tone === "success" ? "bg-green-600" : "bg-blue-600",
        )}
        style={{ width: `${Math.min(100, (value / max) * 100)}%` }}
      />
    </div>
  );
}

/** 표 안에서 쓰는 단지/모듈 2줄 셀 (이름 + 모노스페이스 보조 식별자) */
export function TwoLine({ title, sub }: { title: string; sub: string }) {
  return (
    <span className="block min-w-0">
      <span className="block truncate text-sm font-medium">{title}</span>
      <span className="block truncate font-mono text-xs text-gray-400">
        {sub}
      </span>
    </span>
  );
}
