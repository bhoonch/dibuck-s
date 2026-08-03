import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { notifyTenant } from "@/lib/notifications";
import { sendTrainingDue, trySend } from "@/lib/mailer";
import { Role } from "@/generated/prisma/enums";
import {
  complianceOf,
  daysToHalfEnd,
  dueMilestone,
  halfLabel,
  halfOfKst,
  personProgress,
  type AttendeeSnap,
  type CourseType,
} from "@/lib/safety-training";
import { ymdKst } from "@/lib/utils";

/**
 * 안전보건교육 미이수 안내 배치 — 하루 한 번.
 *
 * 미이수는 문서가 아니라 계산값이라 "저장될 때 알린다"가 성립하지 않는다.
 * 모듈 홈·대시보드에서 이미 보이지만, 몇 주 앱을 안 여는 소장에게는 닿지
 * 않아 반기 마감 전에 밀어서 알린다. 마감을 넘기면 과태료 대상이 된다.
 *
 *   0 4 * * *  curl -H "Authorization: Bearer $CRON_SECRET" https://.../api/cron/training
 *
 * GET·POST 둘 다 받는다 — Vercel Cron과 curl 기본값은 GET이고, POST만 열어 두면
 * 매일 405만 나며 안내가 조용히 멈춘다(billing 크론과 같은 이유).
 *
 * 하루에 두 번 돌아도 안전하다: 이미 보낸 회차는 Notification.type의 기간 키로
 * 걸러진다. 시점을 "D-30 당일"이 아니라 "30일 이하에서 처음"으로 잡은 이유는
 * 크론이 하루 빠지면 그 회차가 영영 안 나가기 때문이다.
 */

type LogMeta = {
  courseType?: CourseType;
  date?: string;
  hours?: unknown;
  attendees?: AttendeeSnap[];
};

async function run(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const now = new Date();
  const left = daysToHalfEnd(now);
  const milestone = dueMilestone(left); // 회차별로 단지당 한 번만 나간다
  const result = { tenants: 0, notified: 0, mails: 0, milestone: milestone ?? null };
  if (!milestone) return NextResponse.json({ ok: true, ...result });

  const half = halfOfKst(now);
  const type = `training_due_${half.year}H${half.half}_D${milestone}`;

  // 구독 중인 단지만 — 안 쓰는 모듈로 메일을 보내지 않는다
  const subs = await db.tenantModule.findMany({
    where: { moduleId: "safety-training", status: "ACTIVE" },
    select: { tenantId: true },
  });

  for (const { tenantId } of subs) {
    result.tenants++;

    // ponytail: 읽고-검사-쓰기라 두 요청이 동시에 들어오면 안내가 두 번 나갈 수 있다.
    // 하루 한 번 도는 배치라 실害는 메일 한 통 중복이고, 막으려면 Notification에
    // (tenantId, type) unique가 필요한데 그 제약은 결재 요청처럼 정당하게 반복되는
    // 알림을 막는다. 중복이 실제로 문제가 되면 전용 발송 이력 테이블로 올릴 것.
    const already = await db.notification.findFirst({
      where: { tenantId, type },
      select: { id: true },
    });
    if (already) continue;

    const [docs, roster] = await Promise.all([
      db.document.findMany({
        where: { tenantId, type: "safety_training", status: "final" },
        select: { meta: true, createdAt: true },
      }),
      db.trainingStaff.findMany({
        where: { tenantId, active: true },
        select: { id: true, name: true, position: true, office: true },
      }),
    ]);
    if (roster.length === 0) continue; // 명부가 없으면 판정 자체가 성립하지 않는다

    const logs = docs.map((d) => {
      const m = (d.meta ?? {}) as LogMeta;
      return {
        courseType: m.courseType ?? ("regular" as CourseType),
        date: m.date ?? ymdKst(d.createdAt),
        hours: m.hours,
        attendees: m.attendees ?? [],
      };
    });
    const unfinished = personProgress(now, logs, roster).filter((p) => !p.done);
    // 관리감독자 교육은 연 1회라 하반기에만 남은 기한이 의미가 있다
    const supervisorDue =
      half.half === 2 && !complianceOf(now, logs, roster).supervisor;
    if (unfinished.length === 0 && !supervisorDue) continue;

    const names = unfinished.map((p) => p.name);
    const halfText = halfLabel(half);
    const title =
      unfinished.length > 0
        ? `${halfText} 안전보건교육 마감 D-${left} — 미이수 ${unfinished.length}명`
        : `${halfText} 관리감독자 교육 마감 D-${left} — 아직 실시하지 않았습니다`;
    const body = [
      names.length > 0 && `미이수: ${names.join(", ")}`,
      supervisorDue && "관리감독자 교육(연 16시간)도 아직 실시하지 않았습니다.",
    ]
      .filter(Boolean)
      .join(" · ");

    await notifyTenant({
      tenantId,
      roles: [Role.DIRECTOR, Role.ACCOUNTANT],
      type,
      title,
      body,
      link: "/modules/safety-training",
    });
    result.notified++;

    // 메일은 마스터에게만 — 법정 책임자가 관리소장이다
    const directors = await db.user.findMany({
      where: { tenantId, role: Role.DIRECTOR },
      select: { email: true, name: true },
    });
    for (const d of directors) {
      // trySend — 메일 한 통이 실패해도 나머지 단지의 안내가 멈추면 안 된다
      await trySend(() =>
        sendTrainingDue(
          d.email,
          d.name,
          halfText,
          left,
          names.length > 0 ? names : ["관리감독자 교육 미실시"],
        ),
      );
      result.mails++;
    }
  }

  return NextResponse.json({ ok: true, ...result });
}

export const GET = run;
export const POST = run;
