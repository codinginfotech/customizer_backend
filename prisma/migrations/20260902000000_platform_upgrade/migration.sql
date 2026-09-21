-- AlterTable
ALTER TABLE `designs` ADD COLUMN `shareToken` VARCHAR(64) NULL;

-- AlterTable
ALTER TABLE `product_models` ADD COLUMN `qualityScore` INTEGER NULL,
    ADD COLUMN `validation` JSON NULL;

-- AlterTable
ALTER TABLE `products` ADD COLUMN `metadata` JSON NULL,
    ADD COLUMN `printMethods` JSON NULL,
    ADD COLUMN `productionRules` JSON NULL,
    ADD COLUMN `tags` JSON NULL,
    ADD COLUMN `version` INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE `audit_logs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NULL,
    `action` VARCHAR(80) NOT NULL,
    `entityType` VARCHAR(60) NOT NULL,
    `entityId` VARCHAR(60) NULL,
    `detail` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `audit_logs_entityType_entityId_idx`(`entityType`, `entityId`),
    INDEX `audit_logs_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `designs_shareToken_key` ON `designs`(`shareToken`);

-- CreateIndex
CREATE INDEX `designs_userId_updatedAt_idx` ON `designs`(`userId`, `updatedAt`);

-- CreateIndex
CREATE INDEX `orders_status_createdAt_idx` ON `orders`(`status`, `createdAt`);

