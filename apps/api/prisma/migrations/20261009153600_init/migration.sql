-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DELETED');

-- CreateEnum
CREATE TYPE "ProviderStatus" AS ENUM ('ACTIVE', 'DISABLED', 'DEGRADED');

-- CreateEnum
CREATE TYPE "ComputeAssetStatus" AS ENUM ('DISCOVERED', 'AVAILABLE', 'RESERVED', 'RUNNING', 'UNAVAILABLE', 'RETIRED');

-- CreateEnum
CREATE TYPE "InstanceStatus" AS ENUM ('PENDING', 'RUNNING', 'STOPPED', 'FAILED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "RevenueStatus" AS ENUM ('PENDING', 'VERIFIED', 'RECONCILED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ReconciliationStatus" AS ENUM ('PENDING', 'MATCHED', 'MISMATCHED', 'FAILED');

-- CreateEnum
CREATE TYPE "DistributionStatus" AS ENUM ('PENDING', 'CONFIRMED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ClaimStatus" AS ENUM ('PENDING', 'CONFIRMED', 'FAILED');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'CONFIRMED', 'FAILED');

-- CreateEnum
CREATE TYPE "SyncJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" VARCHAR(320),
    "displayName" VARCHAR(120),
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Wallet" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "address" VARCHAR(42) NOT NULL,
    "chainId" INTEGER NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Provider" (
    "id" UUID NOT NULL,
    "key" VARCHAR(80) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "baseUrl" VARCHAR(500),
    "status" "ProviderStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Provider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComputeAsset" (
    "id" UUID NOT NULL,
    "providerId" UUID NOT NULL,
    "externalAssetId" VARCHAR(255) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "region" VARCHAR(120),
    "status" "ComputeAssetStatus" NOT NULL DEFAULT 'DISCOVERED',
    "metadataUri" VARCHAR(1000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ComputeAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComputeResource" (
    "id" UUID NOT NULL,
    "computeAssetId" UUID NOT NULL,
    "resourceType" VARCHAR(100) NOT NULL,
    "quantity" DECIMAL(30,8) NOT NULL,
    "unit" VARCHAR(40) NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComputeResource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GpuDevice" (
    "id" UUID NOT NULL,
    "computeAssetId" UUID NOT NULL,
    "model" VARCHAR(160) NOT NULL,
    "memoryGb" INTEGER,
    "count" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GpuDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComputeInstance" (
    "id" UUID NOT NULL,
    "providerId" UUID NOT NULL,
    "computeAssetId" UUID,
    "providerInstanceId" VARCHAR(255) NOT NULL,
    "status" "InstanceStatus" NOT NULL DEFAULT 'PENDING',
    "startedAt" TIMESTAMP(3),
    "stoppedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComputeInstance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComputeUsage" (
    "id" UUID NOT NULL,
    "instanceId" UUID NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "gpuSeconds" BIGINT,
    "utilizationPercent" DECIMAL(7,4),
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceReference" VARCHAR(255),

    CONSTRAINT "ComputeUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderBilling" (
    "id" UUID NOT NULL,
    "providerId" UUID NOT NULL,
    "instanceId" UUID,
    "externalInvoiceId" VARCHAR(255),
    "amount" DECIMAL(36,18) NOT NULL,
    "currency" VARCHAR(20) NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "rawPayload" JSONB,
    "billedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderBilling_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TokenizedAsset" (
    "id" UUID NOT NULL,
    "computeAssetId" UUID NOT NULL,
    "chainId" INTEGER NOT NULL,
    "registryAssetId" DECIMAL(78,0),
    "tokenAddress" VARCHAR(42) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "symbol" VARCHAR(40) NOT NULL,
    "decimals" INTEGER NOT NULL DEFAULT 18,
    "status" VARCHAR(40) NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TokenizedAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RevenueRecord" (
    "id" UUID NOT NULL,
    "computeAssetId" UUID NOT NULL,
    "billingRecordId" UUID,
    "source" VARCHAR(80) NOT NULL,
    "sourceReference" VARCHAR(255),
    "amount" DECIMAL(36,18) NOT NULL,
    "currency" VARCHAR(20) NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" "RevenueStatus" NOT NULL DEFAULT 'PENDING',
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RevenueRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RevenueReconciliation" (
    "id" UUID NOT NULL,
    "revenueRecordId" UUID NOT NULL,
    "status" "ReconciliationStatus" NOT NULL DEFAULT 'PENDING',
    "expectedAmount" DECIMAL(36,18) NOT NULL,
    "actualAmount" DECIMAL(36,18),
    "variance" DECIMAL(36,18),
    "details" JSONB,
    "reconciledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RevenueReconciliation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Distribution" (
    "id" UUID NOT NULL,
    "tokenizedAssetId" UUID NOT NULL,
    "chainId" INTEGER NOT NULL,
    "contractAddress" VARCHAR(42) NOT NULL,
    "onChainDistributionId" DECIMAL(78,0) NOT NULL,
    "revenueTokenAddress" VARCHAR(42) NOT NULL,
    "amount" DECIMAL(78,0) NOT NULL,
    "snapshotBlock" BIGINT NOT NULL,
    "transactionHash" VARCHAR(66),
    "status" "DistributionStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Distribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Claim" (
    "id" UUID NOT NULL,
    "distributionId" UUID NOT NULL,
    "walletAddress" VARCHAR(42) NOT NULL,
    "amount" DECIMAL(78,0) NOT NULL,
    "transactionHash" VARCHAR(66),
    "blockNumber" BIGINT,
    "status" "ClaimStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Claim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlockchainTransaction" (
    "id" UUID NOT NULL,
    "chainId" INTEGER NOT NULL,
    "hash" VARCHAR(66) NOT NULL,
    "fromAddress" VARCHAR(42) NOT NULL,
    "toAddress" VARCHAR(42),
    "nonce" BIGINT,
    "blockNumber" BIGINT,
    "status" "TransactionStatus" NOT NULL DEFAULT 'PENDING',
    "gasUsed" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),

    CONSTRAINT "BlockchainTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlockchainEvent" (
    "id" UUID NOT NULL,
    "chainId" INTEGER NOT NULL,
    "transactionHash" VARCHAR(66) NOT NULL,
    "logIndex" INTEGER NOT NULL,
    "blockNumber" BIGINT NOT NULL,
    "blockHash" VARCHAR(66) NOT NULL,
    "contractAddress" VARCHAR(42) NOT NULL,
    "eventName" VARCHAR(120) NOT NULL,
    "args" JSONB NOT NULL,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BlockchainEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OwnershipSnapshot" (
    "id" UUID NOT NULL,
    "tokenizedAssetId" UUID NOT NULL,
    "walletAddress" VARCHAR(42) NOT NULL,
    "blockNumber" BIGINT NOT NULL,
    "balance" DECIMAL(78,0) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OwnershipSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetMetric" (
    "id" UUID NOT NULL,
    "computeAssetId" UUID NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "utilization" DECIMAL(7,4),
    "capacity" DECIMAL(30,8),
    "capacityUnit" VARCHAR(40),
    "source" VARCHAR(80) NOT NULL,
    "details" JSONB,

    CONSTRAINT "AssetMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderMetric" (
    "id" UUID NOT NULL,
    "providerId" UUID NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metricName" VARCHAR(120) NOT NULL,
    "value" DECIMAL(36,12),
    "unit" VARCHAR(40),
    "details" JSONB,

    CONSTRAINT "ProviderMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "actorUserId" UUID,
    "action" VARCHAR(120) NOT NULL,
    "resourceType" VARCHAR(120) NOT NULL,
    "resourceId" VARCHAR(255),
    "metadata" JSONB,
    "ipAddress" VARCHAR(45),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" VARCHAR(80) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "body" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncJob" (
    "id" UUID NOT NULL,
    "jobType" VARCHAR(120) NOT NULL,
    "status" "SyncJobStatus" NOT NULL DEFAULT 'QUEUED',
    "cursor" VARCHAR(500),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SyncJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_status_createdAt_idx" ON "User"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Wallet_userId_idx" ON "Wallet"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_chainId_address_key" ON "Wallet"("chainId", "address");

-- CreateIndex
CREATE UNIQUE INDEX "Provider_key_key" ON "Provider"("key");

-- CreateIndex
CREATE INDEX "ComputeAsset_providerId_status_idx" ON "ComputeAsset"("providerId", "status");

-- CreateIndex
CREATE INDEX "ComputeAsset_status_createdAt_idx" ON "ComputeAsset"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ComputeAsset_providerId_externalAssetId_key" ON "ComputeAsset"("providerId", "externalAssetId");

-- CreateIndex
CREATE INDEX "ComputeResource_computeAssetId_resourceType_idx" ON "ComputeResource"("computeAssetId", "resourceType");

-- CreateIndex
CREATE INDEX "GpuDevice_computeAssetId_idx" ON "GpuDevice"("computeAssetId");

-- CreateIndex
CREATE INDEX "GpuDevice_model_idx" ON "GpuDevice"("model");

-- CreateIndex
CREATE INDEX "ComputeInstance_providerId_status_idx" ON "ComputeInstance"("providerId", "status");

-- CreateIndex
CREATE INDEX "ComputeInstance_computeAssetId_idx" ON "ComputeInstance"("computeAssetId");

-- CreateIndex
CREATE UNIQUE INDEX "ComputeInstance_providerId_providerInstanceId_key" ON "ComputeInstance"("providerId", "providerInstanceId");

-- CreateIndex
CREATE INDEX "ComputeUsage_periodStart_periodEnd_idx" ON "ComputeUsage"("periodStart", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "ComputeUsage_instanceId_periodStart_periodEnd_key" ON "ComputeUsage"("instanceId", "periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "ProviderBilling_providerId_periodStart_idx" ON "ProviderBilling"("providerId", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderBilling_providerId_externalInvoiceId_key" ON "ProviderBilling"("providerId", "externalInvoiceId");

-- CreateIndex
CREATE INDEX "TokenizedAsset_computeAssetId_idx" ON "TokenizedAsset"("computeAssetId");

-- CreateIndex
CREATE UNIQUE INDEX "TokenizedAsset_chainId_tokenAddress_key" ON "TokenizedAsset"("chainId", "tokenAddress");

-- CreateIndex
CREATE UNIQUE INDEX "TokenizedAsset_chainId_registryAssetId_key" ON "TokenizedAsset"("chainId", "registryAssetId");

-- CreateIndex
CREATE INDEX "RevenueRecord_computeAssetId_periodStart_idx" ON "RevenueRecord"("computeAssetId", "periodStart");

-- CreateIndex
CREATE INDEX "RevenueRecord_status_createdAt_idx" ON "RevenueRecord"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RevenueRecord_source_sourceReference_key" ON "RevenueRecord"("source", "sourceReference");

-- CreateIndex
CREATE INDEX "RevenueReconciliation_revenueRecordId_status_idx" ON "RevenueReconciliation"("revenueRecordId", "status");

-- CreateIndex
CREATE INDEX "Distribution_tokenizedAssetId_status_idx" ON "Distribution"("tokenizedAssetId", "status");

-- CreateIndex
CREATE INDEX "Distribution_chainId_snapshotBlock_idx" ON "Distribution"("chainId", "snapshotBlock");

-- CreateIndex
CREATE UNIQUE INDEX "Distribution_chainId_contractAddress_onChainDistributionId_key" ON "Distribution"("chainId", "contractAddress", "onChainDistributionId");

-- CreateIndex
CREATE INDEX "Claim_walletAddress_status_idx" ON "Claim"("walletAddress", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Claim_distributionId_walletAddress_key" ON "Claim"("distributionId", "walletAddress");

-- CreateIndex
CREATE INDEX "BlockchainTransaction_chainId_blockNumber_idx" ON "BlockchainTransaction"("chainId", "blockNumber");

-- CreateIndex
CREATE INDEX "BlockchainTransaction_fromAddress_createdAt_idx" ON "BlockchainTransaction"("fromAddress", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BlockchainTransaction_chainId_hash_key" ON "BlockchainTransaction"("chainId", "hash");

-- CreateIndex
CREATE INDEX "BlockchainEvent_chainId_blockNumber_idx" ON "BlockchainEvent"("chainId", "blockNumber");

-- CreateIndex
CREATE INDEX "BlockchainEvent_contractAddress_eventName_idx" ON "BlockchainEvent"("contractAddress", "eventName");

-- CreateIndex
CREATE UNIQUE INDEX "BlockchainEvent_chainId_transactionHash_logIndex_key" ON "BlockchainEvent"("chainId", "transactionHash", "logIndex");

-- CreateIndex
CREATE INDEX "OwnershipSnapshot_walletAddress_blockNumber_idx" ON "OwnershipSnapshot"("walletAddress", "blockNumber");

-- CreateIndex
CREATE UNIQUE INDEX "OwnershipSnapshot_tokenizedAssetId_walletAddress_blockNumbe_key" ON "OwnershipSnapshot"("tokenizedAssetId", "walletAddress", "blockNumber");

-- CreateIndex
CREATE INDEX "AssetMetric_computeAssetId_recordedAt_idx" ON "AssetMetric"("computeAssetId", "recordedAt");

-- CreateIndex
CREATE INDEX "ProviderMetric_providerId_metricName_recordedAt_idx" ON "ProviderMetric"("providerId", "metricName", "recordedAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorUserId_createdAt_idx" ON "AuditLog"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_resourceType_resourceId_idx" ON "AuditLog"("resourceType", "resourceId");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_createdAt_idx" ON "Notification"("userId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "SyncJob_status_createdAt_idx" ON "SyncJob"("status", "createdAt");

-- CreateIndex
CREATE INDEX "SyncJob_jobType_status_idx" ON "SyncJob"("jobType", "status");

-- AddForeignKey
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComputeAsset" ADD CONSTRAINT "ComputeAsset_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComputeResource" ADD CONSTRAINT "ComputeResource_computeAssetId_fkey" FOREIGN KEY ("computeAssetId") REFERENCES "ComputeAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GpuDevice" ADD CONSTRAINT "GpuDevice_computeAssetId_fkey" FOREIGN KEY ("computeAssetId") REFERENCES "ComputeAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComputeInstance" ADD CONSTRAINT "ComputeInstance_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComputeInstance" ADD CONSTRAINT "ComputeInstance_computeAssetId_fkey" FOREIGN KEY ("computeAssetId") REFERENCES "ComputeAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComputeUsage" ADD CONSTRAINT "ComputeUsage_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "ComputeInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderBilling" ADD CONSTRAINT "ProviderBilling_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderBilling" ADD CONSTRAINT "ProviderBilling_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "ComputeInstance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TokenizedAsset" ADD CONSTRAINT "TokenizedAsset_computeAssetId_fkey" FOREIGN KEY ("computeAssetId") REFERENCES "ComputeAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevenueRecord" ADD CONSTRAINT "RevenueRecord_computeAssetId_fkey" FOREIGN KEY ("computeAssetId") REFERENCES "ComputeAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevenueRecord" ADD CONSTRAINT "RevenueRecord_billingRecordId_fkey" FOREIGN KEY ("billingRecordId") REFERENCES "ProviderBilling"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevenueReconciliation" ADD CONSTRAINT "RevenueReconciliation_revenueRecordId_fkey" FOREIGN KEY ("revenueRecordId") REFERENCES "RevenueRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Distribution" ADD CONSTRAINT "Distribution_tokenizedAssetId_fkey" FOREIGN KEY ("tokenizedAssetId") REFERENCES "TokenizedAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_distributionId_fkey" FOREIGN KEY ("distributionId") REFERENCES "Distribution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlockchainEvent" ADD CONSTRAINT "BlockchainEvent_chainId_transactionHash_fkey" FOREIGN KEY ("chainId", "transactionHash") REFERENCES "BlockchainTransaction"("chainId", "hash") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnershipSnapshot" ADD CONSTRAINT "OwnershipSnapshot_tokenizedAssetId_fkey" FOREIGN KEY ("tokenizedAssetId") REFERENCES "TokenizedAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetMetric" ADD CONSTRAINT "AssetMetric_computeAssetId_fkey" FOREIGN KEY ("computeAssetId") REFERENCES "ComputeAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderMetric" ADD CONSTRAINT "ProviderMetric_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
