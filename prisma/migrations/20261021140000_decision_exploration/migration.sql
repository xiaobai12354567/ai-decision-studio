-- CreateTable
CREATE TABLE "Path" (
    "id" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "benefits" TEXT[],
    "costs" TEXT[],
    "prerequisites" TEXT[],
    "revision" INTEGER NOT NULL DEFAULT 0,
    "basedOnRevision" INTEGER NOT NULL,
    "freshness" TEXT NOT NULL DEFAULT 'fresh',
    "staleReason" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Path_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Scenario" (
    "id" TEXT NOT NULL,
    "pathId" TEXT NOT NULL,
    "parentId" TEXT,
    "depth" INTEGER NOT NULL DEFAULT 0,
    "timeframe" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "changes" TEXT[],
    "difficulties" TEXT[],
    "assumptions" TEXT[],
    "basis" TEXT[],
    "revision" INTEGER NOT NULL DEFAULT 0,
    "basedOnRevision" INTEGER NOT NULL,
    "freshness" TEXT NOT NULL DEFAULT 'fresh',
    "staleReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Scenario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PathDependency" (
    "pathId" TEXT NOT NULL,
    "conditionId" TEXT NOT NULL,
    "conditionRevision" INTEGER NOT NULL,

    CONSTRAINT "PathDependency_pkey" PRIMARY KEY ("pathId","conditionId")
);

-- CreateTable
CREATE TABLE "ScenarioDependency" (
    "scenarioId" TEXT NOT NULL,
    "conditionId" TEXT NOT NULL,
    "conditionRevision" INTEGER NOT NULL,

    CONSTRAINT "ScenarioDependency_pkey" PRIMARY KEY ("scenarioId","conditionId")
);

-- CreateTable
CREATE TABLE "Feedback" (
    "id" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "scenarioRevision" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Summary" (
    "id" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,
    "inclinationPathId" TEXT,
    "reason" TEXT NOT NULL,
    "valuedBenefits" TEXT[],
    "unacceptableCosts" TEXT[],
    "unknowns" TEXT[],
    "basedOnRevision" INTEGER NOT NULL,
    "freshness" TEXT NOT NULL DEFAULT 'fresh',
    "staleReason" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Summary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Action" (
    "id" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,
    "summaryId" TEXT NOT NULL,
    "task" TEXT NOT NULL,
    "verification" TEXT NOT NULL,
    "decisionHelp" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'candidate',
    "selectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Action_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActionResult" (
    "id" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActionResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GenerationRun" (
    "id" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "scopeId" TEXT,
    "baseRevision" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "provider" TEXT NOT NULL DEFAULT 'deepseek',
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "inputSnapshot" JSONB NOT NULL,
    "candidateOutput" JSONB,
    "errorCode" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "GenerationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DecisionChange" (
    "id" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "entityId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DecisionChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Path_decisionId_deletedAt_idx" ON "Path"("decisionId", "deletedAt");

-- CreateIndex
CREATE INDEX "Scenario_pathId_parentId_idx" ON "Scenario"("pathId", "parentId");

-- CreateIndex
CREATE INDEX "Feedback_scenarioId_createdAt_idx" ON "Feedback"("scenarioId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Summary_decisionId_key" ON "Summary"("decisionId");

-- CreateIndex
CREATE INDEX "Action_decisionId_status_idx" ON "Action"("decisionId", "status");

-- CreateIndex
CREATE INDEX "ActionResult_actionId_createdAt_idx" ON "ActionResult"("actionId", "createdAt");

-- CreateIndex
CREATE INDEX "GenerationRun_decisionId_status_startedAt_idx" ON "GenerationRun"("decisionId", "status", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "GenerationRun_decisionId_requestKey_key" ON "GenerationRun"("decisionId", "requestKey");

-- CreateIndex
CREATE INDEX "DecisionChange_decisionId_revision_idx" ON "DecisionChange"("decisionId", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "Condition_decisionId_kind_key" ON "Condition"("decisionId", "kind");

-- AddForeignKey
ALTER TABLE "Path" ADD CONSTRAINT "Path_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "Decision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scenario" ADD CONSTRAINT "Scenario_pathId_fkey" FOREIGN KEY ("pathId") REFERENCES "Path"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scenario" ADD CONSTRAINT "Scenario_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Scenario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PathDependency" ADD CONSTRAINT "PathDependency_pathId_fkey" FOREIGN KEY ("pathId") REFERENCES "Path"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PathDependency" ADD CONSTRAINT "PathDependency_conditionId_fkey" FOREIGN KEY ("conditionId") REFERENCES "Condition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScenarioDependency" ADD CONSTRAINT "ScenarioDependency_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "Scenario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScenarioDependency" ADD CONSTRAINT "ScenarioDependency_conditionId_fkey" FOREIGN KEY ("conditionId") REFERENCES "Condition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "Scenario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Summary" ADD CONSTRAINT "Summary_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "Decision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Summary" ADD CONSTRAINT "Summary_inclinationPathId_fkey" FOREIGN KEY ("inclinationPathId") REFERENCES "Path"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Action" ADD CONSTRAINT "Action_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "Decision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Action" ADD CONSTRAINT "Action_summaryId_fkey" FOREIGN KEY ("summaryId") REFERENCES "Summary"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionResult" ADD CONSTRAINT "ActionResult_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "Action"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenerationRun" ADD CONSTRAINT "GenerationRun_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "Decision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecisionChange" ADD CONSTRAINT "DecisionChange_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "Decision"("id") ON DELETE CASCADE ON UPDATE CASCADE;
