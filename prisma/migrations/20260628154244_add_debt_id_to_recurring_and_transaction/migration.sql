-- AlterTable
ALTER TABLE `RecurringRule` ADD COLUMN `debtId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `Transaction` ADD COLUMN `debtId` VARCHAR(191) NULL;

-- AddForeignKey
ALTER TABLE `Transaction` ADD CONSTRAINT `Transaction_debtId_fkey` FOREIGN KEY (`debtId`) REFERENCES `Debt`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RecurringRule` ADD CONSTRAINT `RecurringRule_debtId_fkey` FOREIGN KEY (`debtId`) REFERENCES `Debt`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
