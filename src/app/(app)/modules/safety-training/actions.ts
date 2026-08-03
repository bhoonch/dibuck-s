"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Role } from "@/generated/prisma/enums";
import { requireTenantSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { assignDocNo, createDocument } from "@/lib/documents";
import { isSubscribed } from "@/lib/modules";
import { rateLimit } from "@/lib/rate-limit";
import { aiEnabled, generateTrainingDraft } from "@/lib/safety-training-ai";
import {
  STAFF_POSITIONS,
  courseTypeOf,
  draftPlainText,
  textToAttendees,
  textToSections,
  topicOf,
  type AttendeeSnap,
  type TrainingDraft,
} from "@/lib/safety-training";

const MODULE_ID = "safety-training";
const TYPE = "safety_training";

/** 단지당 일일 생성 한도 — 셀프서비스라 무한 생성 남용을 막는다 (공지문과 동일) */
const DAILY_LIMIT = 30;

/** 일지 작성은 일반 사무라 전 직원 — 수정·폐기만 작성자/마스터로 좁힌다 (공지문 경계) */
async function requireTraining() {
  const session = await requireTenantSession();
  if (!(await isSubscribed(session.tenantId!, MODULE_ID)))
    throw new Error("교육일지 모듈을 구독 중이 아닙니다.");
  return session;
}

async function ownedLog(
  docId: string,
  session: Awaited<ReturnType<typeof requireTraining>>,
) {
  const doc = await db.document.findFirst({
    where: { id: docId, tenantId: session.tenantId!, type: TYPE, moduleId: MODULE_ID },
  });
  if (!doc) return { error: "문서를 찾을 수 없습니다." as const };
  // 문서 수정·폐기의 공통 경계 — 작성자 본인 또는 마스터
  if (doc.createdById !== session.userId && session.role !== Role.DIRECTOR)
    return { error: "수정·폐기는 작성자 또는 마스터만 할 수 있습니다." as const };
  return { doc };
}

export type GenerateState = { error?: string } | undefined;

export async function generateTrainingAction(
  _prev: GenerateState,
  formData: FormData,
): Promise<GenerateState> {
  // 문서를 만드는 입구 — 화면 가드를 믿지 않고 여기서 다시 검사한다
  const session = await requireTraining();
  const tenantId = session.tenantId!;
  if (!aiEnabled())
    return { error: "AI 초안 생성이 아직 활성화되지 않았습니다. 운영팀에 문의해 주세요." };

  const course = courseTypeOf(String(formData.get("courseType") ?? ""));
  if (!course) return { error: "교육 종류를 선택해 주세요." };

  const topicLabels = formData
    .getAll("topics")
    .map((k) => topicOf(String(k))?.label)
    .filter(Boolean) as string[];
  const custom = String(formData.get("customTopic") ?? "").trim();
  if (custom) topicLabels.push(custom);
  if (topicLabels.length === 0) return { error: "교육 주제를 한 가지 이상 골라 주세요." };

  const date = String(formData.get("date") ?? "").trim();
  if (!date) return { error: "교육일자를 입력해 주세요." };
  const place = String(formData.get("place") ?? "").trim() || "관리사무소";
  const hours = String(formData.get("hours") ?? "").trim() || "1시간";
  const instructor = String(formData.get("instructor") ?? "").trim();
  if (!instructor) return { error: "강사를 입력해 주세요." };

  // 참석자 = 명부 행 스냅샷 — 완성 후 명부를 고쳐도 이 일지의 명단은 불변(증빙 원칙)
  const ids = formData.getAll("attendees").map(String);
  const staff = ids.length
    ? await db.trainingStaff.findMany({
        where: { tenantId, id: { in: ids }, active: true },
        orderBy: { createdAt: "asc" },
      })
    : [];
  if (staff.length === 0) return { error: "참석자를 한 명 이상 골라 주세요." };
  const attendees: AttendeeSnap[] = staff.map((s) => ({
    name: s.name,
    position: s.position,
    office: s.office,
  }));

  if (rateLimit(`safety-training:${tenantId}`, DAILY_LIMIT, 24 * 60 * 60 * 1000) <= 0)
    return { error: `오늘 생성 한도(${DAILY_LIMIT}건)에 도달했습니다. 내일 다시 시도해 주세요.` };

  const tenant = await db.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: { name: true },
  });

  // 직종 구성만 넘긴다 — 이름 명단은 LLM이 알 필요가 없다(환각 재료만 는다)
  const byPosition = new Map<string, number>();
  for (const a of attendees)
    byPosition.set(a.position, (byPosition.get(a.position) ?? 0) + 1);
  const attendeeSummary = [...byPosition]
    .map(([p, n]) => `${p} ${n}명`)
    .join(" · ");

  let draft: TrainingDraft;
  try {
    draft = await generateTrainingDraft({
      courseLabel: course.label,
      topics: topicLabels,
      hours,
      attendeeSummary,
      tenantName: tenant.name,
    });
  } catch (e) {
    return {
      error: e instanceof Error && e.message.includes("실패")
        ? e.message
        : "초안 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.",
    };
  }

  const doc = await createDocument({
    tenantId,
    moduleId: MODULE_ID,
    type: TYPE,
    title: `${course.label} — ${topicLabels.join("·")}`,
    content: draftPlainText(draft), // 문서함 검색용 평문
    // 생성 직후는 초안 — 내용을 확인하고 [일지 완성]을 눌러야 채번·확정된다.
    // 번호를 지금 주면 버린 초안이 교육 대장에 영구 결번을 남긴다(공지문과 같은 규칙).
    status: "draft",
    numberOnSubmit: true,
    createdById: session.userId,
    meta: { courseType: course.key, date, place, hours, instructor, topics: topicLabels, draft, attendees },
  });
  revalidatePath("/modules/safety-training");
  redirect(`/modules/safety-training/${doc.id}`);
}

/**
 * 내용 수정 — 수정 화면 폼 액션. LLM 재호출 없이 저장값만 고친다.
 * 교육 내용은 빈 줄로 절을 나누고 절의 첫 줄이 주제, 참석자는 "이름, 직종" 한 줄이 한 명.
 */
export async function saveTrainingBody(formData: FormData) {
  const session = await requireTraining();
  const docId = String(formData.get("docId") ?? "");
  const found = await ownedLog(docId, session);
  if ("error" in found) return; // 화면 밖 직접 호출 — 조용히 무시 (공지문과 동일)
  if (found.doc.status === "void") return;

  const meta = (found.doc.meta ?? {}) as {
    draft?: TrainingDraft;
    attendees?: AttendeeSnap[];
    topics?: string[];
  };
  const sections = textToSections(String(formData.get("sections") ?? ""));
  const draft: TrainingDraft = {
    sections,
    closing: String(formData.get("closing") ?? "").trim(),
    needsClarification: meta.draft?.needsClarification ?? [],
  };
  // 참석자 파서는 office를 직종=사무로 추정한다 — 이름이 그대로면 원래 값을 보존한다
  const oldOffice = new Map((meta.attendees ?? []).map((a) => [a.name, a.office]));
  const attendees = textToAttendees(String(formData.get("attendees") ?? "")).map(
    (a) => ({ ...a, office: oldOffice.get(a.name) ?? a.office }),
  );
  if (attendees.length === 0) return; // 참석자 없는 교육일지는 증빙이 아니다

  const topics = sections.map((s) => s.heading);
  const courseLabel = courseTypeOf(
    (found.doc.meta as { courseType?: string })?.courseType ?? "",
  )?.label;
  await db.document.update({
    where: { id: found.doc.id },
    data: {
      title: courseLabel ? `${courseLabel} — ${topics.join("·")}` : found.doc.title,
      content: draftPlainText(draft),
      meta: {
        ...(found.doc.meta as object),
        date: String(formData.get("date") ?? "").trim() || (meta as { date?: string }).date,
        place: String(formData.get("place") ?? "").trim(),
        hours: String(formData.get("hours") ?? "").trim(),
        instructor: String(formData.get("instructor") ?? "").trim(),
        topics,
        draft,
        attendees,
      },
    },
  });
  revalidatePath(`/modules/safety-training/${docId}`);
  revalidatePath("/modules/safety-training");
  redirect(`/modules/safety-training/${docId}`);
}

/**
 * 완성 — 내용 확인이 끝난 초안에 문서번호를 부여하고 확정한다.
 * 번호 부여(멱등)가 먼저다: 여기서 실패해도 초안으로 남아 다시 누르면 되지만,
 * 확정부터 하면 번호 없는 완성본이 남는다.
 */
export async function finalizeTrainingLog(docId: string) {
  const session = await requireTraining();
  const found = await ownedLog(docId, session);
  if ("error" in found) return found;
  if (found.doc.status !== "draft")
    return { error: "이미 완성됐거나 폐기된 일지입니다." };
  await assignDocNo(found.doc);
  // 한 번만 일어나야 하는 일 — 조건부 updateMany로 자리를 잡는다 (동시 클릭 안전)
  await db.document.updateMany({
    where: { id: found.doc.id, status: "draft" },
    data: { status: "final" },
  });
  revalidatePath(`/modules/safety-training/${docId}`);
  revalidatePath("/modules/safety-training");
  return { ok: true };
}

/**
 * 폐기 — 완성본은 목록에 '폐기'로 남고 열람만 된다.
 * 한 번도 완성되지 않은 초안(docNo 없음)은 하드 삭제 — 교육 대장에 결번을 남기지 않는다.
 */
export async function voidTrainingLog(docId: string) {
  const session = await requireTraining();
  const found = await ownedLog(docId, session);
  if ("error" in found) return found;
  if (!found.doc.docNo) {
    await db.document.delete({ where: { id: found.doc.id } });
  } else {
    await db.document.updateMany({
      where: { id: found.doc.id, status: { not: "void" } },
      data: { status: "void" },
    });
  }
  revalidatePath("/modules/safety-training");
  redirect("/modules/safety-training");
}

// ── 직원 명부 — 세대 명부와 같은 경계: 마스터+매니저 ──

async function requireStaffAdmin() {
  const session = await requireTraining();
  if (session.role !== Role.DIRECTOR && session.role !== Role.ACCOUNTANT)
    return { error: "명부 관리는 마스터·매니저만 할 수 있습니다." as const };
  return { session };
}

const staffPaths = () => {
  revalidatePath("/modules/safety-training/staff");
  revalidatePath("/modules/safety-training/new");
  revalidatePath("/modules/safety-training");
};

export async function addStaff(input: {
  name: string;
  position: string;
  office: boolean;
}) {
  const gate = await requireStaffAdmin();
  if ("error" in gate) return gate;
  const name = input.name.trim();
  if (!name) return { error: "이름을 입력해 주세요." };
  const position = (STAFF_POSITIONS as readonly string[]).includes(input.position)
    ? input.position
    : "기타";
  await db.trainingStaff.create({
    data: { tenantId: gate.session.tenantId!, name, position, office: !!input.office },
  });
  staffPaths();
  return {};
}

export async function updateStaff(input: {
  id: string;
  name: string;
  position: string;
  office: boolean;
}) {
  const gate = await requireStaffAdmin();
  if ("error" in gate) return gate;
  const name = input.name.trim();
  if (!name) return { error: "이름을 입력해 주세요." };
  const position = (STAFF_POSITIONS as readonly string[]).includes(input.position)
    ? input.position
    : "기타";
  // tenantId를 조건에 넣는다 — 남의 단지 명부 id로는 아무 행도 맞지 않는다
  await db.trainingStaff.updateMany({
    where: { id: input.id, tenantId: gate.session.tenantId! },
    data: { name, position, office: !!input.office },
  });
  staffPaths();
  return {};
}

/** 퇴사자는 삭제가 아니라 비활성 — 명부에서 이름이 사라지면 "왜 지웠지"가 된다 */
export async function setStaffActive(id: string, active: boolean) {
  const gate = await requireStaffAdmin();
  if ("error" in gate) return gate;
  await db.trainingStaff.updateMany({
    where: { id, tenantId: gate.session.tenantId! },
    data: { active },
  });
  staffPaths();
  return {};
}

/** 앱 직원 불러오기 — 이름·직책만 복사한다(계정과 연결하지 않는다). 이미 있는 이름은 건너뜀 */
export async function importAppUsers() {
  const gate = await requireStaffAdmin();
  if ("error" in gate) return gate;
  const tenantId = gate.session.tenantId!;
  const [users, existing] = await Promise.all([
    db.user.findMany({ where: { tenantId }, select: { name: true } }),
    db.trainingStaff.findMany({ where: { tenantId }, select: { name: true } }),
  ]);
  const have = new Set(existing.map((s) => s.name));
  const fresh = users.filter((u) => !have.has(u.name));
  if (fresh.length)
    await db.trainingStaff.createMany({
      // 앱 계정은 사무실 근무자다 — 직종·사무직 여부는 명부에서 고칠 수 있다
      data: fresh.map((u) => ({ tenantId, name: u.name, position: "사무", office: true })),
    });
  staffPaths();
  return { added: fresh.length };
}
