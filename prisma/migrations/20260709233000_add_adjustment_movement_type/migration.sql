-- AlterTable
ALTER TABLE `Transaction` MODIFY `movementType` ENUM('INCOME', 'EXPENSE', 'TRANSFER', 'ADJUSTMENT') NOT NULL;
