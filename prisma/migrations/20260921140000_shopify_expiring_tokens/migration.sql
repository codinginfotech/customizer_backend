-- AlterTable
ALTER TABLE `shopify_shops` ADD COLUMN `accessTokenExpiresAt` DATETIME(3) NULL,
    ADD COLUMN `refreshToken` VARCHAR(1024) NULL,
    ADD COLUMN `refreshTokenExpiresAt` DATETIME(3) NULL;

