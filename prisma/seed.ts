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
const MODULES = [
  { id: "dunning", name: "미납 독촉장", description: "관리비 미납 세대 독촉장을 한 번에 만들어요", icon: "FileWarning", route: "/modules/dunning", price: 30000, sortOrder: 1, isActive: false },
  { id: "notice", name: "공지문 자동완성", description: "상황만 고르면 공지문 초안이 완성돼요", icon: "Megaphone", route: "/modules/notice", price: 20000, sortOrder: 2, isActive: false },
  { id: "contracts", name: "계약서 관리", description: "계약 만료 전에 미리 알려드려요", icon: "FileText", route: "/modules/contracts", price: 20000, sortOrder: 3, isActive: false },
  { id: "complaints", name: "민원·하자 이력", description: "민원 접수부터 처리까지 한눈에", icon: "MessageSquareWarning", route: "/modules/complaints", price: 20000, sortOrder: 4, isActive: false },
  { id: "facilities", name: "설비 이력관리", description: "점검 주기 관리와 수리 이력", icon: "Wrench", route: "/modules/facilities", price: 20000, sortOrder: 5, isActive: false },
  { id: "minutes", name: "회의록 자동완성", description: "메모만 넘기면 회의록이 정리돼요", icon: "ClipboardList", route: "/modules/minutes", price: 20000, sortOrder: 6, isActive: false },
  // 기안·품의 = 로드맵 5번(전자결재)+6번(AI 파이프라인) 선행 구현 — 별도 모듈을 만들지 않고 이 id를 재정의했다.
  // 가격 33,000 단일가(사용자 확정 2026-07-27). Phase 2 결재까지 끝나면 isActive: true로.
  { id: "approvals", name: "기안·품의", description: "다섯 항목만 입력하면 법적 검토를 마친 기안서·품의서 초안과 결재까지", icon: "Stamp", route: "/modules/approvals", price: 33000, sortOrder: 7, isActive: false },
  { id: "safety-training", name: "산업보건 교육일지", description: "법정 교육 기록과 기한 알림", icon: "HardHat", route: "/modules/safety-training", price: 10000, sortOrder: 8, isActive: false },
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

  // dunning·notice·approvals는 정식 구독, contracts는 무료 체험 중(데모용).
  // 이들은 개발 화면을 채우려고 여기서만 판매 상태로 켠다 — 운영에서는 꺼진 채로
  // 남아야 하므로 MODULES 쪽 isActive는 건드리지 않는다.
  await db.module.updateMany({
    where: { id: { in: ["dunning", "notice", "contracts", "approvals"] } },
    data: { isActive: true },
  });
  const trialEndsAt = new Date();
  trialEndsAt.setDate(trialEndsAt.getDate() + 14);
  for (const moduleId of ["dunning", "notice", "contracts", "approvals"]) {
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
  await db.document.deleteMany({ where: { tenantId: tenant.id } }); // 데모 문서는 매번 새로
  const year = new Date().getFullYear();
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
