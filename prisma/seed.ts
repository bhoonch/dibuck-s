import "dotenv/config";
import { hashSync } from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const MODULES = [
  { id: "dunning", name: "미납 독촉장", description: "관리비 미납 세대 독촉장을 한 번에 만들어요", icon: "FileWarning", route: "/modules/dunning", price: 30000, sortOrder: 1 },
  { id: "notice", name: "공지문 자동완성", description: "상황만 고르면 공지문 초안이 완성돼요", icon: "Megaphone", route: "/modules/notice", price: 20000, sortOrder: 2 },
  { id: "contracts", name: "계약서 관리", description: "계약 만료 전에 미리 알려드려요", icon: "FileText", route: "/modules/contracts", price: 20000, sortOrder: 3 },
  { id: "complaints", name: "민원·하자 이력", description: "민원 접수부터 처리까지 한눈에", icon: "MessageSquareWarning", route: "/modules/complaints", price: 20000, sortOrder: 4 },
  { id: "facilities", name: "설비 이력관리", description: "점검 주기 관리와 수리 이력", icon: "Wrench", route: "/modules/facilities", price: 20000, sortOrder: 5 },
  { id: "minutes", name: "회의록 자동완성", description: "메모만 넘기면 회의록이 정리돼요", icon: "ClipboardList", route: "/modules/minutes", price: 20000, sortOrder: 6 },
  { id: "approvals", name: "전자결재", description: "품의서 작성과 결재선 승인", icon: "Stamp", route: "/modules/approvals", price: 30000, sortOrder: 7 },
  { id: "safety-training", name: "산업보건 교육일지", description: "법정 교육 기록과 기한 알림", icon: "HardHat", route: "/modules/safety-training", price: 10000, sortOrder: 8 },
];

async function main() {
  for (const m of MODULES) {
    await db.module.upsert({ where: { id: m.id }, update: m, create: m });
  }

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

  // dunning·notice는 정식 구독, contracts는 무료 체험 중(데모용)
  const trialEndsAt = new Date();
  trialEndsAt.setDate(trialEndsAt.getDate() + 14);
  for (const moduleId of ["dunning", "notice", "contracts"]) {
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

  console.log("seed 완료: 모듈 8개, 데모 단지 1개, 계정 4개, 문의 3건");
}

main().finally(() => db.$disconnect());
