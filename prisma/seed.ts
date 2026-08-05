import "dotenv/config";
import { hashSync } from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

/**
 * 모듈 레지스트리.
 * isActive=false = 아직 안 만든 모듈 — 요금표(`/`)·구독 관리·사이드바가 모두 이 플래그를
 * 읽으므로, 켜는 순간 팔린다. 자리표시 페이지뿐인 모듈을 켜 두면 무료 체험 30일이
 * 없는 소프트웨어를 상대로 소진되고 가입자는 "체험 종료 → 잠김"으로 끝난다.
 * 모듈 라우트를 실제로 구현할 때 해당 줄의 isActive를 true로 바꿀 것.
 */
// sortOrder는 AI 모듈(1~4)이 먼저, 기록·관리 모듈(5~8)이 뒤 — 요금표·구독 화면·
// 사이드바가 전부 이 순서를 읽는다(사용자 결정 2026-08-03). AI가 이 제품의
// 차별점이자 가격 근거라 라인업이 한 덩어리로 읽혀야 한다. 섹션 제목은 아직
// 없다 — 켜진 모듈이 3개뿐이라 2개·1개짜리 그룹에 제목을 붙이면 어색하다.
const MODULES = [
  { id: "notice", name: "AI 공지문 완성", description: "상황만 고르면 공지문 초안이 완성돼요", icon: "Megaphone", route: "/modules/notice", price: 20000, sortOrder: 1, isActive: true },
  // 기안·품의 = 로드맵 5번(전자결재)+6번(AI 파이프라인) 선행 구현 — 별도 모듈을 만들지 않고 이 id를 재정의했다.
  // 가격 33,000 단일가(사용자 확정 2026-07-27). 결재까지 구현이 끝나 판매 중이다.
  { id: "approvals", name: "AI 기안·결재", description: "다섯 항목만 입력하면 법적 검토를 마친 기안서·품의서 초안과 결재까지", icon: "Stamp", route: "/modules/approvals", price: 33000, sortOrder: 2, isActive: true },
  { id: "safety-training", name: "AI 안전교육일지", description: "종류·주제만 고르면 법정 교육일지가 완성되고, 놓친 반기 교육을 알려드려요", icon: "HardHat", route: "/modules/safety-training", price: 10000, sortOrder: 3, isActive: true },
  { id: "minutes", name: "AI 회의록 완성", description: "메모만 넘기면 회의록이 정리돼요", icon: "ClipboardList", route: "/modules/minutes", price: 20000, sortOrder: 4, isActive: false },
  { id: "dunning", name: "미납 독촉장", description: "관리비 미납 세대 독촉장을 한 번에 만들어요", icon: "FileWarning", route: "/modules/dunning", price: 30000, sortOrder: 5, isActive: true },
  { id: "contracts", name: "계약 만료 알리미", description: "계약 만료 전에 미리 알려드려요", icon: "FileText", route: "/modules/contracts", price: 20000, sortOrder: 6, isActive: false },
  { id: "complaints", name: "민원·하자 이력", description: "민원 접수부터 처리까지 한눈에", icon: "MessageSquareWarning", route: "/modules/complaints", price: 20000, sortOrder: 7, isActive: false },
  // facilities = 법정점검 대장으로 재정의 (2026-08-05, 사용자 확정) — 모듈 id는 라우트·아이콘
  // 매핑이 물려 있어 바꾸지 않는다. 설명은 크론이 실제로 하는 범위만 서술(과장 금지).
  { id: "facilities", name: "법정점검 대장", description: "소방·승강기·저수조 등 법정 주기를 앱이 세고, 기록 한 번으로 일지와 감사 서류철까지 쌓여요", icon: "ClipboardCheck", route: "/modules/facilities", price: 20000, sortOrder: 8, isActive: true },
];

/** 모듈 레지스트리 — 운영에도 필요한 기준 데이터 */
async function seedModules() {
  for (const m of MODULES) {
    await db.module.upsert({ where: { id: m.id }, update: m, create: m });
  }
}

/**
 * 최초 운영자 계정. 셀프 가입(/signup)은 소장만 만들 수 있어서 SUPER_ADMIN을
 * 만들 다른 경로가 없다 — 데모 시드에 끼워 두면 운영 DB에 test1234 계정이 생긴다.
 * 자격증명은 환경변수로 받고, 없으면 그냥 건너뛴다.
 */
async function bootstrapAdmin() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) return;
  if (password.length < 12)
    throw new Error("ADMIN_PASSWORD는 12자 이상이어야 합니다.");

  await db.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      name: process.env.ADMIN_NAME?.trim() || "운영자",
      role: "SUPER_ADMIN",
      tenantId: null,
      passwordHash: hashSync(password, 10),
    },
  });
  console.log(`운영자 계정 준비 완료: ${email}`);
}

/** 개발용 데모 데이터 — 운영 DB에 들어가면 가짜 MRR로 지표가 오염된다 */
async function seedDemo() {
  const tenant = await db.tenant.upsert({
    where: { id: "demo-tenant" },
    update: {},
    create: {
      id: "demo-tenant",
      name: "행복아파트",
      address: "서울시 행복구 행복로 123",
      households: 480,
    },
  });

  const passwordHash = hashSync("test1234", 10);
  const users = [
    // 데모 운영자 — seedDemo는 운영에서 실행되지 않으므로 여기 있어야 안전하다.
    // 운영 최초 관리자는 bootstrapAdmin(ADMIN_EMAIL/ADMIN_PASSWORD)이 만든다.
    { email: "admin@test.com", name: "운영자", title: null, role: "SUPER_ADMIN", tenantId: null },
    { email: "test1@test.com", name: "김소장", title: "관리소장", role: "DIRECTOR", tenantId: tenant.id },
    { email: "test2@test.com", name: "이경리", title: "경리주임", role: "ACCOUNTANT", tenantId: tenant.id },
    { email: "test3@test.com", name: "박직원", title: "시설주임", role: "STAFF", tenantId: tenant.id },
  ] as const;
  for (const u of users) {
    await db.user.upsert({
      where: { email: u.email },
      update: { title: u.title },
      create: { ...u, passwordHash },
    });
  }

  // 판매 상태(isActive)는 MODULES가 유일한 원본이다 — 예전엔 여기서 updateMany로
  // 덮어써서 화면이 안 만들어진 contracts까지 켰다(요금표에 자리표시 모듈이 노출).
  // 데모 단지는 구독 행만 만든다: 구독 중이면 판매 중단 모듈도 계속 보인다(retired).
  const trialEndsAt = new Date();
  trialEndsAt.setDate(trialEndsAt.getDate() + 14);
  for (const moduleId of ["dunning", "notice", "contracts", "approvals", "safety-training", "facilities"]) {
    const trial = moduleId === "contracts" ? trialEndsAt : null;
    await db.tenantModule.upsert({
      where: { tenantId_moduleId: { tenantId: tenant.id, moduleId } },
      update: { status: "ACTIVE", trialEndsAt: trial },
      create: { tenantId: tenant.id, moduleId, trialEndsAt: trial },
    });
  }

  const director = await db.user.findUniqueOrThrow({
    where: { email: "test1@test.com" },
  });
  const days = (n: number) => new Date(Date.now() + n * 86400000);
  // ⚠️ 문서는 절대 지우지 않는다 — 예전의 deleteMany("데모 문서는 매번 새로")가
  // dev DB에서 실제로 작성한 기안·품의 문서(결재 기록·첨부 포함)를 전부
  // 날렸다(2026-08-01 사고). 데모 문서는 문서가 하나도 없을 때만 한 번 심는다.
  const year = new Date().getFullYear();
  if ((await db.document.count({ where: { tenantId: tenant.id } })) === 0)
  await db.document.createMany({
    data: [
      { tenantId: tenant.id, moduleId: "notice", docNo: `공지-${year}-0001`, type: "notice", title: "단수 안내문 (7/28 오전)", content: "수도 배관 공사로 인한 단수 안내입니다.", status: "final", createdById: director.id },
      { tenantId: tenant.id, moduleId: "contracts", docNo: `계약-${year}-0001`, type: "contract", title: "승강기 유지보수 계약서 (한국엘리베이터)", content: "계약 기간 만료 임박", status: "final", dueDate: days(25), createdById: director.id },
      { tenantId: tenant.id, moduleId: "dunning", docNo: `독촉-${year}-0001`, type: "dunning_letter", title: "103동 502호 관리비 독촉장 (3개월)", content: "미납액 456,000원", status: "draft", createdById: director.id },
      { tenantId: tenant.id, moduleId: "approvals", docNo: `품의-${year}-0001`, type: "approval", title: "지하주차장 LED 교체 품의", content: "교체 비용 1,200,000원", status: "pending", createdById: director.id },
      { tenantId: tenant.id, moduleId: "complaints", docNo: `민원-${year}-0001`, type: "complaint", title: "105동 802호 누수 민원", content: "천장 누수 신고", status: "open", createdById: director.id },
      { tenantId: tenant.id, moduleId: "facilities", docNo: `점검-${year}-0001`, type: "inspection", title: "소방설비 정기점검", content: "지하 1층 스프링클러 점검", status: "final", dueDate: days(5), createdById: director.id },
    ],
  });

  // 교육일지 데모 — 명부 6명 + 완성 일지 1건 (문서와 같은 규칙: 없을 때만 심는다)
  if ((await db.trainingStaff.count({ where: { tenantId: tenant.id } })) === 0) {
    await db.trainingStaff.createMany({
      data: [
        { tenantId: tenant.id, name: "김소장", position: "사무", office: true },
        { tenantId: tenant.id, name: "이경리", position: "사무", office: true },
        { tenantId: tenant.id, name: "박기전", position: "기전" },
        { tenantId: tenant.id, name: "최기전", position: "기전" },
        { tenantId: tenant.id, name: "정경비", position: "경비" },
        { tenantId: tenant.id, name: "한미화", position: "미화" },
      ],
    });
  }
  if ((await db.document.count({ where: { tenantId: tenant.id, type: "safety_training" } })) === 0) {
    const kstToday = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
    await db.document.create({
      data: {
        tenantId: tenant.id,
        moduleId: "safety-training",
        docNo: `교육-${year}-0001`,
        type: "safety_training",
        title: "정기교육 — 화재 대피 요령·소화기 사용법",
        content: "소화기는 바람을 등지고 안전핀을 뽑아 빗자루로 쓸듯 분사한다.",
        status: "final",
        createdById: director.id,
        meta: {
          courseType: "regular",
          date: kstToday,
          place: "관리사무소",
          hours: "1시간",
          instructor: "관리소장 김소장",
          topics: ["화재 대피 요령·소화기 사용법"],
          draft: {
            sections: [
              {
                heading: "화재 대피 요령·소화기 사용법",
                lines: [
                  "가. 화재 발견 즉시 \"불이야\"를 외치고 비상벨을 누른 뒤 119에 신고한다.",
                  "나. 대피 시 승강기를 이용하지 않고 계단으로 이동하며, 젖은 수건으로 코와 입을 막는다.",
                  "다. 소화기는 바람을 등지고 안전핀을 뽑아 손잡이를 움켜쥐고 빗자루로 쓸듯 분사한다.",
                ],
              },
            ],
            closing: "질의응답 및 안전 실천 다짐",
            needsClarification: [],
          },
          attendees: [
            { name: "박기전", position: "기전", office: false },
            { name: "최기전", position: "기전", office: false },
            { name: "정경비", position: "경비", office: false },
            { name: "한미화", position: "미화", office: false },
          ],
        },
      },
    });
  }

  // 법정점검 데모 — 항목 5(상태가 골고루: 정상·임박·지연·기준일 필요) + 완료 기록 2
  // (문서와 같은 규칙: 없을 때만 심는다)
  if ((await db.inspectionItem.count({ where: { tenantId: tenant.id } })) === 0) {
    const kstDay = (daysAgo: number) => {
      const d = new Date(Date.now() + 9 * 3600_000 - daysAgo * 86400000);
      return new Date(`${d.toISOString().slice(0, 10)}T00:00:00+09:00`);
    };
    const ymdOf = (d: Date) =>
      new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 10);

    const mk = (data: {
      presetKey: string;
      name: string;
      legalBasis: string;
      cycleType: string;
      cycleN?: number;
      leadDays: number;
      vendor?: string;
      lastDoneAt?: Date;
    }) => ({ tenantId: tenant.id, cycleN: null, ...data });

    const elevatorLast = kstDay(20); // 월 1회 — 도래 10일 뒤(리드 7일 밖, 정상)
    const tankLast = kstDay(200); // 반기 1회 — 20일 지남(지연)
    await db.inspectionItem.createMany({
      data: [
        mk({ presetKey: "fire_operation", name: "소방시설 작동점검", legalBasis: "소방시설 설치 및 관리에 관한 법률 제22조", cycleType: "ANNUAL", leadDays: 30, vendor: "한국소방점검(주) 02-1234-5678", lastDoneAt: kstDay(340) }), // 25일 뒤 도래 — 임박
        mk({ presetKey: "elevator_self", name: "승강기 자체점검", legalBasis: "승강기 안전관리법 제31조", cycleType: "MONTHLY", leadDays: 7, vendor: "한국엘리베이터", lastDoneAt: elevatorLast }),
        mk({ presetKey: "elevator_regular", name: "승강기 정기검사", legalBasis: "승강기 안전관리법 제32조", cycleType: "ANNUAL", leadDays: 30, vendor: "한국승강기안전공단", lastDoneAt: kstDay(120) }),
        mk({ presetKey: "tank_cleaning", name: "저수조 청소", legalBasis: "수도법 제33조, 같은 법 시행규칙 제22조의3", cycleType: "SEMIANNUAL", leadDays: 30, vendor: "맑은물환경", lastDoneAt: tankLast }),
        mk({ presetKey: "playground_monthly", name: "어린이놀이시설 안전점검", legalBasis: "어린이놀이시설 안전관리법 제15조", cycleType: "MONTHLY", leadDays: 7 }), // 기준일 없음 — needsAnchor
      ],
    });

    // 완료 기록 2건 — 항목과 lastDoneAt이 맞아야 현황판·서류철이 말이 된다
    const items = await db.inspectionItem.findMany({
      where: { tenantId: tenant.id },
      select: { id: true, presetKey: true },
    });
    const idOf = (k: string) => items.find((i) => i.presetKey === k)!.id;
    await db.document.createMany({
      data: [
        {
          tenantId: tenant.id,
          moduleId: "facilities",
          docNo: `점검-${year}-0002`,
          type: "inspection",
          title: `승강기 자체점검 (${ymdOf(elevatorLast)})`,
          content: "승강기 자체점검\n승강기 안전관리법 제31조\n결과: 정상",
          status: "final",
          createdById: director.id,
          meta: { itemId: idOf("elevator_self"), itemName: "승강기 자체점검", legalBasis: "승강기 안전관리법 제31조", doneAt: ymdOf(elevatorLast), performedBy: "한국엘리베이터", result: "정상", findings: "", actions: "", cost: 0, vendor: "한국엘리베이터" },
        },
        {
          tenantId: tenant.id,
          moduleId: "facilities",
          docNo: `점검-${year}-0003`,
          type: "inspection",
          title: `저수조 청소 (${ymdOf(tankLast)})`,
          content: "저수조 청소\n수도법 제33조\n결과: 지적사항",
          status: "final",
          createdById: director.id,
          meta: { itemId: idOf("tank_cleaning"), itemName: "저수조 청소", legalBasis: "수도법 제33조, 같은 법 시행규칙 제22조의3", doneAt: ymdOf(tankLast), performedBy: "맑은물환경", result: "지적사항", findings: "저수조 내부 사다리 부식", actions: "차기 청소 시 사다리 교체 예정", cost: 450000, vendor: "맑은물환경" },
        },
      ],
    });
  }

  if ((await db.unit.count({ where: { tenantId: tenant.id } })) === 0) {
    const units = [];
    for (const dong of ["101", "102", "103"]) {
      for (let floor = 1; floor <= 5; floor++) {
        units.push({ tenantId: tenant.id, dong, ho: `${floor}01` });
      }
    }
    await db.unit.createMany({ data: units });
  }
  if ((await db.notification.count({ where: { tenantId: tenant.id } })) === 0) {
    const staff = await db.user.findMany({ where: { tenantId: tenant.id } });
    await db.notification.createMany({
      data: staff.map((u) => ({
        tenantId: tenant.id,
        userId: u.id,
        type: "contract_expiry",
        title: "승강기 유지보수 계약이 30일 후 만료됩니다",
        link: "/documents?q=승강기",
      })),
    });
  }

  if ((await db.inquiry.count()) === 0) {
    await db.inquiry.createMany({
      data: [
        { tenantId: tenant.id, category: "기능 문의", title: "독촉장 PDF에 단지 로고를 넣을 수 있나요?", status: "open" },
        { tenantId: tenant.id, category: "구독", title: "설비 이력 모듈 체험해 보고 싶습니다", status: "open" },
        { tenantId: tenant.id, category: "계정", title: "직원 계정 추가 방법 문의", status: "answered" },
      ],
    });
  }

  console.log("데모 데이터 완료: 단지 1개, 계정 3개, 문의 3건");
}

async function main() {
  await seedModules();
  await bootstrapAdmin();

  if (process.env.NODE_ENV === "production") {
    console.log("운영 환경 — 데모 데이터는 건너뜁니다.");
    return;
  }
  await seedDemo();
}

main().finally(() => db.$disconnect());
