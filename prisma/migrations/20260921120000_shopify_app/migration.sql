-- CreateTable
CREATE TABLE `shopify_shops` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shopDomain` VARCHAR(255) NOT NULL,
    `accessToken` VARCHAR(1024) NULL,
    `scope` VARCHAR(1000) NULL,
    `name` VARCHAR(255) NULL,
    `email` VARCHAR(255) NULL,
    `currency` VARCHAR(10) NULL,
    `primaryDomain` VARCHAR(255) NULL,
    `settings` JSON NULL,
    `installedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `uninstalledAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `shopify_shops_shopDomain_key`(`shopDomain`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `shopify_product_mappings` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shopId` INTEGER NOT NULL,
    `shopifyProductId` VARCHAR(40) NOT NULL,
    `shopifyProductTitle` VARCHAR(255) NOT NULL,
    `shopifyHandle` VARCHAR(255) NULL,
    `productId` INTEGER NOT NULL,
    `variantMap` JSON NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `shopify_product_mappings_productId_idx`(`productId`),
    UNIQUE INDEX `shopify_product_mappings_shopId_shopifyProductId_key`(`shopId`, `shopifyProductId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `shopify_customizations` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shopId` INTEGER NOT NULL,
    `token` VARCHAR(64) NOT NULL,
    `editKeyHash` VARCHAR(128) NOT NULL,
    `productId` INTEGER NOT NULL,
    `variantId` INTEGER NULL,
    `shopifyProductId` VARCHAR(40) NULL,
    `shopifyVariantId` VARCHAR(40) NULL,
    `designJson` JSON NOT NULL,
    `previewImage` VARCHAR(500) NULL,
    `status` ENUM('DRAFT', 'ORDERED') NOT NULL DEFAULT 'DRAFT',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `shopify_customizations_token_key`(`token`),
    INDEX `shopify_customizations_shopId_status_updatedAt_idx`(`shopId`, `status`, `updatedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `shopify_orders` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shopId` INTEGER NOT NULL,
    `shopifyOrderId` VARCHAR(40) NOT NULL,
    `orderName` VARCHAR(40) NOT NULL,
    `financialStatus` VARCHAR(40) NULL,
    `fulfillmentStatus` VARCHAR(40) NULL,
    `currency` VARCHAR(10) NULL,
    `totalPrice` DECIMAL(12, 2) NULL,
    `customerEmail` VARCHAR(255) NULL,
    `cancelledAt` DATETIME(3) NULL,
    `shopifyCreatedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `shopify_orders_shopId_createdAt_idx`(`shopId`, `createdAt`),
    UNIQUE INDEX `shopify_orders_shopId_shopifyOrderId_key`(`shopId`, `shopifyOrderId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `shopify_order_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `orderId` INTEGER NOT NULL,
    `lineItemId` VARCHAR(40) NOT NULL,
    `customizationId` INTEGER NULL,
    `productId` INTEGER NULL,
    `title` VARCHAR(255) NOT NULL,
    `variantTitle` VARCHAR(255) NULL,
    `sku` VARCHAR(120) NULL,
    `quantity` INTEGER NOT NULL,
    `price` DECIMAL(12, 2) NULL,
    `designSnapshot` JSON NULL,
    `previewImage` VARCHAR(500) NULL,

    INDEX `shopify_order_items_orderId_idx`(`orderId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `shopify_product_mappings` ADD CONSTRAINT `shopify_product_mappings_shopId_fkey` FOREIGN KEY (`shopId`) REFERENCES `shopify_shops`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `shopify_product_mappings` ADD CONSTRAINT `shopify_product_mappings_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `shopify_customizations` ADD CONSTRAINT `shopify_customizations_shopId_fkey` FOREIGN KEY (`shopId`) REFERENCES `shopify_shops`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `shopify_customizations` ADD CONSTRAINT `shopify_customizations_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `shopify_orders` ADD CONSTRAINT `shopify_orders_shopId_fkey` FOREIGN KEY (`shopId`) REFERENCES `shopify_shops`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `shopify_order_items` ADD CONSTRAINT `shopify_order_items_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `shopify_orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `shopify_order_items` ADD CONSTRAINT `shopify_order_items_customizationId_fkey` FOREIGN KEY (`customizationId`) REFERENCES `shopify_customizations`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `shopify_order_items` ADD CONSTRAINT `shopify_order_items_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

