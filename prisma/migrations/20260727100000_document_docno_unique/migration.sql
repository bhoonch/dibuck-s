-- 문서번호는 단지 안에서 유일해야 한다 (동시 채번 충돌을 DB가 막는다)
CREATE UNIQUE INDEX "Document_tenantId_docNo_key" ON "Document"("tenantId", "docNo");
