import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { createDocument } from "@/lib/documents";
import { notifyTenant } from "@/lib/notifications";
import { sendInspectionOverdue, trySend } from "@/lib/mailer";
import { Role } from "@/generated/prisma/enums";
import {
  daysUntil,
  dueMilestone,
  nextDue,
  roundKey,
} from "@/lib/inspection/schedule";
import { kstDayStart } from "@/lib/utils";

/**
 * 법정점검 도래 안내 배치 — 하루 한 번.
 *
 * 도래일은 저장값이 아니라 계산값이라 "저장될 때 알린다"가 성립하지 않는다.
 * 현황판에서 이미 보이지만, 몇 주 앱을 안 여는 소장에게는 닿지 않아 밀어서
 * 알린다 — 기한을 넘기면 과태료가 소장 개인 책임이 된다.
 *
 *   0 4 * * *  curl -H "Authorization: Bearer $CRON_SECRET" https://.../api/cron/inspection
 *
 * 세 가지를 본다 (전부 "임계를 처음 넘긴 때" — 크론이 하루 빠져도 다음 실행에서 잡힌다):
 *  ① D-{leadDays} — 작업지시 문서(scheduled, dueDate=도래일) 생성 + 인앱 알림.
 *    작업지시는 홈 할 일 위젯 "점검 예정"에 뜨고, 기록이 완성되면 자동으로 닫힌다.
 *  ② D-7 — 인앱 알림 1회 더 (leadDays가 7이면 회차가 하나로 합쳐진다).
 *  ③ 기한 경과 — 인앱 알림 + 소장 메일(trySend). 도래일마다 1회.
 *
 * GET·POST 둘 다 받는다 — Vercel Cron과 curl 기본값은 GET이고, POST만 열어 두면
 * 매일 405만 나며 안내가 조용히 멈춘다(training 크론과 같은 이유).
 *
 * 구독 단지만 돈다 — 미구독 단지에 작업지시·알림이 가면 거짓 약속이다.
 * 중복은 회차 키(inspection_{itemId}_{dueYmd}_{회차})가 막는다. 기록이 저장되면
 * lastDoneAt이 굴러 도래일이 바뀌고, 키가 달라져 다음 주기의 안내가 새로 열린다.
 */

/**
 * ponytail: 회차 확인이 읽고-검사-쓰기라 동시 실행이면 안내가 두 번 나갈 수 있다 —
 * 하루 한 번 배치라 실害는 메일 한 통 중복. training 크론과 같은 판단.
 */
async function alreadySent(tenantId: string, type: string) {
  const row = await db.notification.findFirst({
    where: { tenantId, type },
    select: { id: true },
  });
  return !!row;
}

/** 메일은 마스터에게만 — 법정 책임자가 관리소장이다 */
function directorsOf(tenantId: string) {
  return db.user.findMany({
    where: { tenantId, role: Role.DIRECTOR },
    select: { email: true, name: true },
  });
}

/** 이 항목·도래일의 작업지시가 없으면 만든다 — 재실행이 중복을 만들면 안 된다 */
async function ensureWorkOrder(
  tenantId: string,
  item: { id: string; name: string; vendor: string | null },
  dueYmd: string,
) {
  const open = await db.document.findFirst({
    where: {
      tenantId,
      type: "inspection",
      status: "scheduled",
      meta: { path: ["itemId"], equals: item.id },
    },
    select: { id: true },
  });
  if (open) return false;
  await createDocument({
    tenantId,
    moduleId: "facilities",
    type: "inspection",
    title: `${item.name} 점검 예정 (${dueYmd})`,
    content: [item.name, item.vendor && `업체: ${item.vendor}`]
      .filter(Boolean)
      .join("\n"),
    status: "scheduled",
    // 작업지시는 증빙이 아니라 할 일이다 — 번호를 주면 점검 대장에 결번이 남는다
    numberOnSubmit: true,
    dueDate: kstDayStart(dueYmd),
    meta: { itemId: item.id, itemName: item.name, dueYmd, kind: "workorder" },
  });
  return true;
}

async function run(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const now = new Date();
  const result = { tenants: 0, notified: 0, workOrders: 0, overdue: 0, mails: 0 };

  // 구독 중인 단지만 — 안 쓰는 모듈로 알림을 보내지 않는다
  const subs = await db.tenantModule.findMany({
    where: { moduleId: "facilities", status: "ACTIVE" },
    select: { tenantId: true },
  });

  for (const { tenantId } of subs) {
    result.tenants++;
    const items = await db.inspectionItem.findMany({
      where: { tenantId, active: true },
    });

    for (const item of items) {
      // 앵커가 없으면 주기를 셀 수 없다 — 현황판 "기준일 필요"가 알리는 몫
      const due = nextDue(item);
      if (!due) continue;
      const left = daysUntil(due, now);

      if (left < 0) {
        // ③ 기한 경과 — 도래일마다 1회. 메일은 과태료 위험이라 접속 안 해도 닿아야 한다
        const type = roundKey(item.id, due, "overdue");
        if (await alreadySent(tenantId, type)) continue;
        if (await ensureWorkOrder(tenantId, item, due)) result.workOrders++;
        await notifyTenant({
          tenantId,
          roles: [Role.DIRECTOR, Role.ACCOUNTANT],
          type,
          title: `${item.name} 기한 경과 — ${-left}일 지났습니다`,
          body: `법정 기한 ${due}. 이미 점검했다면 기록만 남기면 됩니다.`,
          link: "/modules/facilities",
        });
        result.overdue++;
        for (const d of await directorsOf(tenantId)) {
          // trySend — 메일 한 통이 실패해도 나머지 단지의 안내가 멈추면 안 된다
          await trySend(() =>
            sendInspectionOverdue(d.email, d.name, item.name, due, -left),
          );
          result.mails++;
        }
        continue;
      }

      // ①② 도래 전 안내 회차 — D-{leadDays}와 D-7
      const milestone = dueMilestone(left, item.leadDays);
      if (milestone === null) continue;
      const type = roundKey(item.id, due, milestone);
      if (await alreadySent(tenantId, type)) continue;
      if (await ensureWorkOrder(tenantId, item, due)) result.workOrders++;
      await notifyTenant({
        tenantId,
        roles: [Role.DIRECTOR, Role.ACCOUNTANT],
        type,
        title: `${item.name} 점검 D-${left}`,
        body: [
          `도래일 ${due}`,
          item.vendor && `업체: ${item.vendor}`,
          "점검 후 기록을 남기면 다음 도래일이 자동으로 계산됩니다.",
        ]
          .filter(Boolean)
          .join(" · "),
        link: "/modules/facilities",
      });
      result.notified++;
    }
  }

  return NextResponse.json({ ok: true, ...result });
}

export const GET = run;
export const POST = run;
