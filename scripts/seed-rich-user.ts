import bcrypt from 'bcrypt';
import prisma from '../src/infrastructure/database/prisma-client';

async function main() {
  const DOC = '1025887093';
  const PIN = '1234';

  console.log('Seed: buscando perfil con docNumber', DOC);
  const profile = await prisma.customerProfile.findUnique({ where: { docNumber: DOC } });

  if (!profile) {
    console.error('No se encontró customerProfile con docNumber', DOC);
    process.exit(1);
  }

  const userId = profile.userId;

  // 1. Set PIN to 1234
  const pinHash = await bcrypt.hash(PIN, 12);
  await prisma.user.update({ where: { id: userId }, data: { pinHash } });

  // 2. Ensure COP and USD currencies exist
  let cop = await prisma.currency.findUnique({ where: { code: 'COP' } });
  if (!cop) cop = await prisma.currency.create({ data: { code: 'COP', symbol: '$', name: 'Pesos Colombianos' } });
  let usd = await prisma.currency.findUnique({ where: { code: 'USD' } });
  if (!usd) usd = await prisma.currency.create({ data: { code: 'USD', symbol: '$', name: 'Dólares Americanos' } });

  // 3. Create or update accounts with large balances
  const copAccount = await prisma.account.upsert({
    where: { accountNumber: `seed-COP-${userId}` },
    update: { balance: 100000000.00, currencyId: cop.id },
    create: {
      userId,
      accountNumber: `seed-COP-${userId}`,
      type: 'SAVINGS',
      plan: 'STANDARD',
      balance: 100000000.00,
      currencyId: cop.id,
    },
  });

  const usdAccount = await prisma.account.upsert({
    where: { accountNumber: `seed-USD-${userId}` },
    update: { balance: 10000.00, currencyId: usd.id },
    create: {
      userId,
      accountNumber: `seed-USD-${userId}`,
      type: 'DIGITAL',
      plan: 'STANDARD',
      balance: 10000.00,
      currencyId: usd.id,
    },
  });

  console.log('Seed completado. UserId:', userId);
  console.log('PIN (plain):', PIN);
  console.log('COP account:', copAccount.accountNumber, 'balance:', copAccount.balance.toString());
  console.log('USD account:', usdAccount.accountNumber, 'balance:', usdAccount.balance.toString());
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
