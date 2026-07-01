// One-off: create performance indexes on the Turso database.
// Safe to re-run — every statement is CREATE INDEX IF NOT EXISTS (additive, idempotent).
// Run with:  node scripts/apply-indexes.mjs
import { createClient } from '@libsql/client';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const c = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });

const indexes = [
  ['WorkoutSet_workoutId_idx',        'WorkoutSet',      'workoutId'],
  ['WorkoutSet_exerciseId_idx',       'WorkoutSet',      'exerciseId'],
  ['Workout_date_idx',                'Workout',         'date'],
  ['Workout_finishedAt_idx',          'Workout',         'finishedAt'],
  ['Workout_programDayId_idx',        'Workout',         'programDayId'],
  ['ProgramExercise_programDayId_idx','ProgramExercise', 'programDayId'],
  ['ProgramExercise_exerciseId_idx',  'ProgramExercise', 'exerciseId'],
  ['ProgramDay_programId_idx',        'ProgramDay',      'programId'],
];

async function run(sql, tries = 6, ms = 25000) {
  for (let i = 1; i <= tries; i++) {
    try {
      return await Promise.race([c.execute(sql), new Promise((_, r) => setTimeout(() => r(new Error('timeout')), ms))]);
    } catch (e) { console.error(`  retry ${i}/${tries}: ${e.message}`); }
  }
  throw new Error('failed after retries: ' + sql);
}

for (const [name, table, col] of indexes) {
  await run(`CREATE INDEX IF NOT EXISTS "${name}" ON "${table}" ("${col}")`);
  console.log('✓', name);
}

const list = await run(`SELECT name FROM sqlite_master WHERE type='index' AND name LIKE '%_idx' ORDER BY name`);
console.log('\nIndexes on DB now:');
for (const r of list.rows) console.log('  -', r.name);
try { c.close(); } catch {}
console.log('\nDone.');
