import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

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

  // ── Usuario de prueba — login con credenciales ────────────────────────────
  const adminHash = bcrypt.hashSync('admin', 12);
  await prisma.user.upsert({
    where: { email: 'admin@gmail.com' },
    update: {},
    create: {
      email: 'admin@gmail.com',
      name: 'Admin',
      passwordHash: adminHash,
    },
  });

  // ── Usuario de prueba — Google SSO ────────────────────────────────────────
  // El flow de loginWithGoogle lo encuentra por email y emite sesión.
  // El googleId se vincula en el primer login real con Google.
  await prisma.user.upsert({
    where: { email: 'javierramirez1230123@gmail.com' },
    update: {},
    create: {
      email: 'javierramirez1230123@gmail.com',
      name: 'Javier',
    },
  });

  console.log('Seed completo.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
