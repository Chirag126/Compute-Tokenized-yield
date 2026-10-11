/*
  Warnings:

  - A unique constraint covering the columns `[computeAssetId,resourceType]` on the table `ComputeResource` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[computeAssetId,model]` on the table `GpuDevice` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "ComputeResource_computeAssetId_resourceType_key" ON "ComputeResource"("computeAssetId", "resourceType");

-- CreateIndex
CREATE UNIQUE INDEX "GpuDevice_computeAssetId_model_key" ON "GpuDevice"("computeAssetId", "model");
