"use client";

import { useActionState, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  NOTICE_CATEGORIES,
  NOTICE_TYPES,
  noticeTypeOf,
} from "@/lib/notice-catalog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { generateNoticeAction } from "../actions";

/**
 * 생성 대기 — 10~30초짜리 대기에서 "멈춘 건지 도는 건지"를 가르는 건
 * 스피너가 아니라 숫자가 올라가는 것이다 (기안 폼과 같은 장치).
 */
function GeneratingOverlay() {
  const [sec, setSec] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSec((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="absolute inset-0 z-10 rounded-lg bg-white/85 backdrop-blur-[1px]">
      {/* sticky — 폼이 길어서 세로 중앙 정렬이면 안내가 화면 밖에 놓인다. 스크롤 위치와 무관하게 보이는 자리 */}
      <div className="sticky top-[35vh] flex flex-col items-center gap-3">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
        <p className="text-base font-bold">공지문을 만들고 있습니다</p>
        <p className="text-sm text-muted-foreground">
          보통 10~30초 걸립니다 · <span className="font-mono">{sec}초</span> 경과
        </p>
      </div>
    </div>
  );
}

export function NoticeForm({
  defaultContact,
  aiReady,
}: {
  /** 문의처 기본값 — 설정 > 단지 정보의 전화번호 */
  defaultContact: string;
  aiReady: boolean;
}) {
  const [state, formAction, pending] = useActionState(generateNoticeAction, undefined);
  // [초안 만들기]는 화면 맨 아래 — 생성이 시작되면 맨 위로 올려 로딩 중임을 보여준다
  useEffect(() => {
    if (pending) window.scrollTo({ top: 0, behavior: "smooth" });
  }, [pending]);
  const [typeKey, setTypeKey] = useState("");
  const [freeKind, setFreeKind] = useState<"guide" | "official">("guide");
  const type = noticeTypeOf(typeKey);

  return (
    <form action={formAction} className="relative space-y-5">
      {pending && <GeneratingOverlay />}
      <input type="hidden" name="typeKey" value={typeKey} />
      <input type="hidden" name="kind" value={freeKind} />

      <Card className="p-6">
        <h2 className="mb-4 text-sm font-semibold">1. 어떤 게시물인가요?</h2>
        <div className="space-y-4">
          {NOTICE_CATEGORIES.map((cat) => (
            <div key={cat}>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">{cat}</p>
              {/* 카드 그리드(시안 A) — 고르기 전에 "무엇을 적게 될지"가 힌트로 보인다 */}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {NOTICE_TYPES.filter((t) => t.category === cat).map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setTypeKey(t.key)}
                    className={
                      "rounded-md border px-3 py-2 text-left " +
                      (typeKey === t.key
                        ? "border-primary bg-accent shadow-[inset_0_0_0_1px_var(--primary)]"
                        : "hover:border-primary/60")
                    }
                  >
                    <span className="block text-sm font-semibold">
                      {t.label}
                      {t.kind === "official" && t.key !== "free" && (
                        <span className="ml-1 text-xs font-normal text-muted-foreground">
                          공고
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {t.hint.detail}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        {type?.key === "free" && (
          <div className="mt-4 flex items-center gap-3">
            <p className="text-xs font-medium text-muted-foreground">문서 격</p>
            {(
              [
                ["guide", "안내문 (협조 요청)"],
                ["official", "공고문 (격식·공고번호)"],
              ] as const
            ).map(([k, label]) => (
              <label key={k} className="flex items-center gap-1.5 text-sm">
                <input
                  type="radio"
                  name="freeKind"
                  checked={freeKind === k}
                  onChange={() => setFreeKind(k)}
                />
                {label}
              </label>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-6">
        <h2 className="mb-4 text-sm font-semibold">2. 아는 것만 적어 주세요</h2>
        <div className="space-y-4">
          <div>
            <Label htmlFor="when">일시·기간</Label>
            <Input
              id="when"
              name="when"
              className="mt-1.5"
              placeholder={type?.hint.when || "예: 8월 10일(월) 10:00~16:00"}
            />
            <p className="mt-1.5 text-xs text-muted-foreground">
              &quot;8월 둘째 주&quot; 같은 대략 표기도 그대로 실립니다. 비우면 일시 없이 만들고
              게시 전 확인 항목으로 알려드립니다.
            </p>
          </div>
          <div>
            <Label htmlFor="where">대상·구역</Label>
            <Input
              id="where"
              name="where"
              className="mt-1.5"
              placeholder={type?.hint.where || "예: 전 세대, 101동, 지하주차장 1층"}
            />
          </div>
          <div>
            <Label htmlFor="detail">내용·사유</Label>
            <Textarea
              id="detail"
              name="detail"
              rows={3}
              className="mt-1.5"
              placeholder={type?.hint.detail || "사유, 협조를 구할 내용, 강조할 것"}
            />
            <p className="mt-1.5 text-xs text-muted-foreground">
              키워드만 적어도 됩니다 — 문장은 완성문이 만듭니다.
            </p>
          </div>
          <div>
            <Label htmlFor="contact">문의처</Label>
            <Input
              id="contact"
              name="contact"
              className="mt-1.5"
              defaultValue={defaultContact}
              placeholder="예: 관리사무소 02-1234-5678"
            />
          </div>
        </div>
      </Card>

      {state?.error && (
        <p className="text-sm font-medium text-destructive">{state.error}</p>
      )}
      <div className="flex items-center gap-3">
        <Button type="submit" size="lg" disabled={pending || !typeKey || !aiReady}>
          초안 만들기
        </Button>
        <p className="text-sm text-muted-foreground">
          {typeKey
            ? "초안이 만들어집니다 — 내용을 확인하고 [공지문 완성]을 누르면 문서번호가 부여됩니다."
            : "먼저 유형을 골라 주세요."}
        </p>
      </div>
    </form>
  );
}
