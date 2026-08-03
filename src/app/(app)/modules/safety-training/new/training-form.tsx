"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import {
  COURSE_TYPES,
  STAFF_POSITIONS,
  halfOfKst,
  topicsForHalf,
  type CourseType,
  type TrainingTopic,
} from "@/lib/safety-training";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addStaff, generateTrainingAction } from "../actions";

/**
 * 생성 대기 — 10~30초짜리 대기에서 "멈춘 건지 도는 건지"를 가르는 건
 * 스피너가 아니라 숫자가 올라가는 것이다 (공지문 폼과 같은 장치).
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
        <p className="text-base font-bold">교육 내용을 만들고 있습니다</p>
        <p className="text-sm text-muted-foreground">
          보통 10~30초 걸립니다 · <span className="font-mono">{sec}초</span> 경과
        </p>
      </div>
    </div>
  );
}

/** 명부가 빈 단지의 첫 등록 — 페이지를 떠나지 않고 이 자리에서 채운다 */
function QuickAddStaff() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [position, setPosition] = useState<string>("기전");
  const [error, setError] = useState<string>();
  const add = () => {
    if (!name.trim() || pending) return;
    startTransition(async () => {
      const r = await addStaff({ name, position, office: position === "사무" });
      if (r && "error" in r && r.error) setError(r.error);
      else {
        setName("");
        router.refresh();
      }
    });
  };
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {/* form="…" — 존재하지 않는 폼에 묶어 바깥 폼 제출(Enter 포함)에서 뗀다 */}
        <Input
          form="__staff-quick-add"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())}
          placeholder="이름"
          className="w-32"
        />
        <select
          form="__staff-quick-add"
          value={position}
          onChange={(e) => setPosition(e.target.value)}
          className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
        >
          {STAFF_POSITIONS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <Button type="button" variant="outline" onClick={add} disabled={pending || !name.trim()}>
          {pending && <Loader2 className="size-4 animate-spin" />} 추가
        </Button>
      </div>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
  );
}

export function TrainingForm({
  roster,
  defaultDate,
  defaultInstructor,
  canManageStaff,
  aiReady,
}: {
  roster: { id: string; name: string; position: string }[];
  defaultDate: string;
  defaultInstructor: string;
  canManageStaff: boolean;
  aiReady: boolean;
}) {
  const [state, formAction, pending] = useActionState(generateTrainingAction, undefined);
  const [courseType, setCourseType] = useState("");
  // [초안 만들기]는 화면 맨 아래 — 생성이 시작되면 맨 위로 올려 로딩 중임을 보여준다
  useEffect(() => {
    if (pending) window.scrollTo({ top: 0, behavior: "smooth" });
  }, [pending]);
  const [topics, setTopics] = useState<Set<string>>(new Set());
  const [customTopic, setCustomTopic] = useState("");
  const toggleTopic = (key: string) =>
    setTopics((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // 현재 반기 계절 주제가 앞에 온다 — 7월에 폭염이 첫 화면에 보여야 한다
  const half = halfOfKst(new Date());
  const sorted = topicsForHalf(half.half);
  const seasonNow = half.half === 1 ? "h1" : "h2";
  const seasonGroups = (list: TrainingTopic[]): [string, TrainingTopic[]][] => [
    [`이번 반기 계절 주제`, list.filter((t) => t.season === seasonNow)],
    ["연중 · 직무", list.filter((t) => t.season === "all")],
    ["다른 반기 계절 주제", list.filter((t) => t.season !== seasonNow && t.season !== "all")],
  ];
  // 주제 선택은 B안 — 목록 배치는 고정, 선택한 교육에 해당하는 주제(별표 5 기준)만
  // 활성(사용자 결정 2026-08-03, A안 앞배치+전체 선택 가능과 비교 후).
  // 교육 종류를 바꾸면 해당 없는 선택은 자동 해제된다(잘못 담기는 사고 차단).
  const enabled = (t: TrainingTopic) =>
    !courseType || t.courses.includes(courseType as CourseType);
  const pickCourse = (key: CourseType) => {
    setCourseType(key);
    setTopics(
      (prev) =>
        new Set(
          [...prev].filter((k) =>
            sorted.find((t) => t.key === k)?.courses.includes(key),
          ),
        ),
    );
  };
  const onlyFor = (c: CourseType) =>
    sorted.filter((t) => t.courses.length === 1 && t.courses[0] === c);
  const groups: [string, TrainingTopic[]][] = (
    [
      ["채용 시 전용", onlyFor("new_hire")] as [string, TrainingTopic[]],
      ["관리감독자 전용", onlyFor("supervisor")] as [string, TrainingTopic[]],
      ...seasonGroups(sorted.filter((t) => t.courses.includes("regular"))),
    ]
  ).filter(([, l]) => l.length > 0);
  const ready = courseType && (topics.size > 0 || customTopic.trim()) && roster.length > 0;

  return (
    <form action={formAction} className="relative space-y-5">
      {pending && <GeneratingOverlay />}
      <input type="hidden" name="courseType" value={courseType} />
      {[...topics].map((k) => (
        <input key={k} type="hidden" name="topics" value={k} />
      ))}

      <Card className="p-6">
        <h2 className="mb-4 text-sm font-semibold">1. 어떤 교육인가요?</h2>
        {/* 카드에 법정 시간이 힌트로 보인다 — 몇 시간을 채워야 하는지 찾아보게 하지 않는다 */}
        <div className="grid gap-2 sm:grid-cols-3">
          {COURSE_TYPES.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => pickCourse(c.key)}
              className={
                "rounded-md border px-3 py-2.5 text-left " +
                (courseType === c.key
                  ? "border-primary bg-accent shadow-[inset_0_0_0_1px_var(--primary)]"
                  : "hover:border-primary/60")
              }
            >
              <span className="block text-sm font-semibold">{c.label}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{c.desc}</span>
              <span className="mt-1 block text-xs font-medium text-primary">{c.hours}</span>
            </button>
          ))}
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="mb-4 text-sm font-semibold">2. 기본 정보</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="date">교육일자</Label>
            <Input id="date" name="date" type="date" defaultValue={defaultDate} className="mt-1.5" required />
          </div>
          <div>
            <Label htmlFor="hours">교육시간</Label>
            <Input id="hours" name="hours" defaultValue="1시간" className="mt-1.5" />
          </div>
          <div>
            <Label htmlFor="place">교육장소</Label>
            <Input id="place" name="place" defaultValue="관리사무소" className="mt-1.5" />
          </div>
          <div>
            <Label htmlFor="instructor">강사</Label>
            <Input
              id="instructor"
              name="instructor"
              defaultValue={defaultInstructor}
              placeholder="예: 관리소장 김소장"
              className="mt-1.5"
              required
            />
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="mb-1 text-sm font-semibold">3. 무엇을 교육하나요?</h2>
        <p className="mb-4 text-xs text-muted-foreground">
          여러 개를 골라도 됩니다 — 한 회차에 2~3개 주제가 관행입니다. 선택한
          교육 종류에 해당하는 주제만 고를 수 있습니다.
        </p>
        <div className="space-y-4">
          {groups.map(([label, list]) => (
            <div key={label}>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">{label}</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {list.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    disabled={!enabled(t)}
                    onClick={() => toggleTopic(t.key)}
                    className={
                      "rounded-md border px-3 py-2 text-left " +
                      (!enabled(t)
                        ? "cursor-not-allowed opacity-40"
                        : topics.has(t.key)
                          ? "border-primary bg-accent shadow-[inset_0_0_0_1px_var(--primary)]"
                          : "hover:border-primary/60")
                    }
                  >
                    <span className="block text-sm font-semibold">
                      {t.label}
                      {t.audience && (
                        <span className="ml-1 text-xs font-normal text-muted-foreground">
                          {t.audience}
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {t.hint}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
          <div>
            <Label htmlFor="customTopic">직접 입력</Label>
            <Input
              id="customTopic"
              name="customTopic"
              value={customTopic}
              onChange={(e) => setCustomTopic(e.target.value)}
              placeholder="목록에 없는 주제 (예: 옥상 방수 공사 중 안전 수칙)"
              className="mt-1.5"
            />
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="mb-1 text-sm font-semibold">4. 누가 참석하나요?</h2>
        <p className="mb-4 text-xs text-muted-foreground">
          기본으로 전원 체크되어 있습니다 — 불참자만 해제하세요. 채용 시 교육은
          신입 한 명만 남기면 됩니다.
        </p>
        {roster.length > 0 ? (
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
            {roster.map((s) => (
              <label key={s.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="attendees" value={s.id} defaultChecked />
                <span>
                  {s.name}
                  <span className="ml-1 text-xs text-muted-foreground">{s.position}</span>
                </span>
              </label>
            ))}
          </div>
        ) : canManageStaff ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              아직 명부가 비어 있습니다. 이 자리에서 바로 추가하세요 — 한 번
              등록하면 다음부터는 체크만 하면 됩니다.
            </p>
            <QuickAddStaff />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            아직 직원 명부가 비어 있습니다 — 명부 등록은 마스터·매니저가 할 수
            있습니다.
          </p>
        )}
      </Card>

      {state?.error && (
        <p className="text-sm font-medium text-destructive">{state.error}</p>
      )}
      <div className="flex items-center gap-3">
        <Button type="submit" size="lg" disabled={pending || !ready || !aiReady}>
          초안 만들기
        </Button>
        <p className="text-sm text-muted-foreground">
          {ready
            ? "초안이 만들어집니다 — 내용을 확인하고 [일지 완성]을 누르면 문서번호가 부여됩니다."
            : "교육 종류와 주제를 골라 주세요."}
        </p>
      </div>
    </form>
  );
}
