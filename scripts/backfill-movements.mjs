import 'dotenv/config';
import pg from 'pg';

const { Client } = pg;
const c = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  await c.connect();
  await c.query('BEGIN');

  try {
    // Ensure categories exist
    const cats = [
      { name: 'Transferencia', icon: 'transfer' },
      { name: 'Depósito', icon: 'deposit' },
      { name: 'Retiro', icon: 'withdraw' },
    ];

    for (const cat of cats) {
      await c.query(
        `INSERT INTO movement_categories (name, icon_type)
         VALUES ($1, $2)
         ON CONFLICT (name) DO NOTHING`,
        [cat.name, cat.icon]
      );
    }

    const transferCat = await c.query(
      `SELECT id FROM movement_categories WHERE name = 'Transferencia'`
    );
    const categoryId = transferCat.rows[0].id;

    // Backfill from transaction_legs that have no matching movement
    // (same account + amount + roughly same timestamp)
    const legs = await c.query(
      `SELECT tl.id, tl.account_id, tl.amount::float8 AS amount, tl.description, tl.created_at,
              t.id AS transaction_id, t.type
       FROM transaction_legs tl
       JOIN transactions t ON t.id = tl.transaction_id
       WHERE t.status = 'COMPLETED'
       ORDER BY tl.created_at ASC`
    );

    let inserted = 0;
    for (const leg of legs.rows) {
      const exists = await c.query(
        `SELECT 1 FROM movements
         WHERE account_id = $1
           AND amount = $2
           AND ABS(EXTRACT(EPOCH FROM (created_at - $3::timestamptz))) < 5
         LIMIT 1`,
        [leg.account_id, leg.amount, leg.created_at]
      );
      if (exists.rowCount > 0) continue;

      const isCredit = Number(leg.amount) > 0;
      const description = isCredit ? 'Transferencia recibida' : 'Transferencia enviada';

      await c.query(
        `INSERT INTO movements (account_id, movement_category_id, amount, description, reference, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          leg.account_id,
          categoryId,
          leg.amount,
          description,
          leg.transaction_id,
          leg.created_at,
        ]
      );
      inserted += 1;
    }

    await c.query('COMMIT');

    const counts = await c.query('SELECT count(*)::int AS n FROM movements');
    const sample = await c.query(
      `SELECT m.amount::float8 AS amount, m.description, m.created_at, a.account_number
       FROM movements m
       JOIN accounts a ON a.id = m.account_id
       ORDER BY m.created_at DESC`
    );

    console.log(JSON.stringify({ inserted, totalMovements: counts.rows[0].n, sample: sample.rows }, null, 2));
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    await c.end();
  }
}

main().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});
