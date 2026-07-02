-- AlterTable
ALTER TABLE `Transaction` ADD COLUMN `recurringRuleId` VARCHAR(191) NULL;

-- AddForeignKey
ALTER TABLE `Transaction` ADD CONSTRAINT `Transaction_recurringRuleId_fkey` FOREIGN KEY (`recurringRuleId`) REFERENCES `RecurringRule`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
