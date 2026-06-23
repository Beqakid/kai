#!/usr/bin/env node
/**
 * Carehia AI OS Task Seed Script
 *
 * Reads carehia-ai-os-tasks.json and inserts tasks into the kai_tasks D1 table.
 * Skips duplicates by title + project. Reports a summary of inserted, skipped, and errors.
 *
 * Usage:
 *   Local D1:  npx wrangler d1 execute KAI_DB --local --file=- < <(npx tsx scripts/seed-carehia-ai-os.ts --sql)
 *   Direct:    npx tsx scripts/seed-carehia-ai-os.ts --sql > seed.sql && npx wrangler d1 execute KAI_DB --file=seed.sql
 *   Dry-run:   npx tsx scripts/seed-carehia-ai-os.ts --dry-run
 *   JSON out:  npx tsx scripts/seed-carehia-ai-os.ts --json
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// ── Types ──

interface SeedTaskWeights {
  userBlocking: number;
  launchBlocking: number;
  securityRisk: number;
  revenueImpact: number;
  affectedUsers: number;
  dependencyImportance: number;
  founderUrgency: number;
  estimatedEffort: number;
}

interface SeedTask {
  title: string;
  description: string;
  source: string;
  priority: string;
  severity: string;
  suggestedAction: string;
  riskLevel: string;
  requiresConfirmation: boolean;
  weights: SeedTaskWeights;
  metadataJson: string;
}

interface SeedPack {
  seedPack: string;
  version: string;
  appId: string;
  project: string;
  description: string;
  createdAt: string;
  tasks: SeedTask[];
}

interface SeedResult {
  title: string;
  status: 'inserted' | 'skipped' | 'error';
  reason?: string;
  id?: string;
}

// ── Score calculator (mirrors priority-scorer.ts) ──

function calculateScore(w: SeedTaskWeights): number {
  const weighted =
    w.userBlocking * 15 +
    w.launchBlocking * 20 +
    w.securityRisk * 15 +
    w.revenueImpact * 10 +
    w.affectedUsers * 10 +
    w.dependencyImportance * 10 +
    w.founderUrgency * 10 +
    w.estimatedEffort * 10;
  return Math.min(100, Math.max(0, Math.round(weighted / 10)));
}

// ── ID generator ──

function generateId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `task_${ts}_${rand}`;
}

// ── SQL escaping ──

function escSql(value: string | null): string {
  if (value === null) return 'NULL';
  return `'${value.replace(/'/g, "''")}'`;
}

// ── Main ──

function loadSeedPack(): SeedPack {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const seedPath = join(__dirname, '..', 'seeds', 'carehia-ai-os-tasks.json');
  const raw = readFileSync(seedPath, 'utf-8');
  return JSON.parse(raw) as SeedPack;
}

function generateSql(pack: SeedPack): { sql: string; results: SeedResult[] } {
  const results: SeedResult[] = [];
  const statements: string[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  statements.push('-- Carehia AI OS Task Seed Pack');
  statements.push(`-- Generated: ${now}`);
  statements.push(`-- Pack: ${pack.seedPack} v${pack.version}`);
  statements.push('');

  for (const task of pack.tasks) {
    const key = `${task.title}::${pack.project}`;

    // Skip in-file duplicates
    if (seen.has(key)) {
      results.push({ title: task.title, status: 'skipped', reason: 'duplicate in seed file' });
      continue;
    }
    seen.add(key);

    const id = generateId();
    const score = calculateScore(task.weights);

    // Use INSERT OR IGNORE to skip DB-level duplicates (requires unique index on title+project)
    // Fallback: wrap in a conditional check
    statements.push(`-- Task: ${task.title}`);
    statements.push(
      `INSERT INTO kai_tasks (id, app_id, project, title, description, source, priority, severity, status, suggested_action, risk_level, requires_confirmation, score, metadata_json, created_at, updated_at)` +
      ` SELECT ${escSql(id)}, ${escSql(pack.appId)}, ${escSql(pack.project)}, ${escSql(task.title)}, ${escSql(task.description)}, ${escSql(task.source)}, ${escSql(task.priority)}, ${escSql(task.severity)}, 'open', ${escSql(task.suggestedAction)}, ${escSql(task.riskLevel)}, ${task.requiresConfirmation ? 1 : 0}, ${score}, ${escSql(task.metadataJson)}, ${escSql(now)}, ${escSql(now)}` +
      ` WHERE NOT EXISTS (SELECT 1 FROM kai_tasks WHERE title = ${escSql(task.title)} AND project = ${escSql(pack.project)});`
    );
    statements.push('');

    results.push({ title: task.title, status: 'inserted', id });
  }

  return { sql: statements.join('\n'), results };
}

function printSummary(results: SeedResult[], mode: string): void {
  const inserted = results.filter(r => r.status === 'inserted');
  const skipped = results.filter(r => r.status === 'skipped');
  const errors = results.filter(r => r.status === 'error');

  if (mode === 'json') {
    console.log(JSON.stringify({ inserted: inserted.length, skipped: skipped.length, errors: errors.length, results }, null, 2));
    return;
  }

  if (mode !== 'sql') {
    console.log('\n═══ Carehia AI OS Task Seed — Summary ═══\n');
    console.log(`  📦 Pack:     Carehia AI OS Transformation`);
    console.log(`  ✅ Inserted: ${inserted.length}`);
    console.log(`  ⏭️  Skipped:  ${skipped.length}`);
    console.log(`  ❌ Errors:   ${errors.length}`);
    console.log('');

    for (const r of results) {
      const icon = r.status === 'inserted' ? '✅' : r.status === 'skipped' ? '⏭️' : '❌';
      console.log(`  ${icon} ${r.title}${r.reason ? ` (${r.reason})` : ''}`);
    }
    console.log('');
  }
}

// ── CLI ──

const args = process.argv.slice(2);
const mode = args.includes('--sql') ? 'sql' : args.includes('--json') ? 'json' : args.includes('--dry-run') ? 'dry-run' : 'summary';

const pack = loadSeedPack();
const { sql, results } = generateSql(pack);

if (mode === 'sql') {
  console.log(sql);
} else if (mode === 'dry-run') {
  console.log('═══ DRY RUN — No database changes ═══\n');
  console.log(sql);
  printSummary(results, mode);
} else {
  printSummary(results, mode);
}

process.exit(0);
