-- AlterTable
ALTER TABLE `Transaction` ADD COLUMN `status` VARCHAR(191) NOT NULL DEFAULT 'POSTED';

-- CreateIndex
CREATE INDEX `Transaction_status_date_idx` ON `Transaction`(`status`, `date`);
