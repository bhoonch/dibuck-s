-- AlterTable
ALTER TABLE "Document" ADD COLUMN "sourceDocId" TEXT;

-- 백필: 살아 있는 파생본만 옮긴다 — 폐기본은 비워 두어야 재생성이 열린다
-- (meta.sourceDocId는 이력·역링크 표시용으로 그대로 남는다)
UPDATE "Document" SET "sourceDocId" = meta->>'sourceDocId'
WHERE meta ? 'sourceDocId' AND status <> 'void';

-- CreateIndex
CREATE UNIQUE INDEX "Document_type_sourceDocId_key" ON "Document"("type", "sourceDocId");
