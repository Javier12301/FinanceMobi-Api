import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com';
const adminName = process.env.SEED_ADMIN_NAME ?? 'Admin';
const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'changeme';
const googleUserEmail = process.env.SEED_GOOGLE_USER_EMAIL ?? 'google_user@example.com';
const googleUserName = process.env.SEED_GOOGLE_USER_NAME ?? 'Google User';

async function main() {
  // ── Lookup data ──────────────────────────────────────────────────────────
  await prisma.walletType.createMany({
    data: [
      { name: 'CASH' },
      { name: 'BANK_ACCOUNT' },
      { name: 'CREDIT_CARD' },
      { name: 'SAVINGS' },
    ],
    skipDuplicates: true,
  });

  // ── Usuario admin — login con contraseña ─────────────────────────────────
  const adminHash = bcrypt.hashSync(adminPassword, 12);
  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      name: adminName,
      passwordHash: adminHash,
    },
  });

  // ── Usuario Google SSO ────────────────────────────────────────────────────
  // El googleId se vincula en el primer login real con Google.
  await prisma.user.upsert({
    where: { email: googleUserEmail },
    update: {},
    create: {
      email: googleUserEmail,
      name: googleUserName,
    },
  });

  console.log(`Seed completo: admin=${adminEmail}, google=${googleUserEmail}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
