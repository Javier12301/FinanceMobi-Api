import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  await prisma.walletType.createMany({
    data: [
      { name: 'CASH' },
      { name: 'BANK_ACCOUNT' },
      { name: 'CREDIT_CARD' },
      { name: 'SAVINGS' },
    ],
    skipDuplicates: true,
  });
  console.log('Seed complete');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
