/// <reference types="node" />
// ── Carehia AI OS Task Seed Pack — Tests (Phase 8) ──

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

// ── Types matching seed JSON structure ──

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

// ── Valid values from orchestrator types ──

const VALID_PRIORITIES = ['critical', 'high', 'medium', 'low'];
const VALID_SEVERITIES = ['critical', 'urgent', 'normal', 'minor'];
const VALID_RISK_LEVELS = ['low', 'medium', 'high', 'blocked'];
const VALID_SOURCES = ['phase_data', 'admin_note', 'kai_recommendation', 'error_summary', 'user_feedback', 'manual', 'github', 'tasklet'];
const VALID_ACTIONS = [
  'generate_tasklet_prompt', 'draft_github_issue', 'create_task',
  'update_status', 'mark_reviewed', 'summarize_blockers',
  'draft_admin_note', 'draft_user_message',
];
const ALLOWED_APP_IDS = ['jon-command-center'];
const WEIGHT_KEYS: (keyof SeedTaskWeights)[] = [
  'userBlocking', 'launchBlocking', 'securityRisk', 'revenueImpact',
  'affectedUsers', 'dependencyImportance', 'founderUrgency', 'estimatedEffort',
];

// ── Helpers ──

const __filename = fileURLToPath(import.meta.url);
const __test_dir = dirname(__filename);
const PKG_ROOT = join(__test_dir, '..', '..');
const SEED_PATH = join(PKG_ROOT, 'seeds', 'carehia-ai-os-tasks.json');
const SCRIPT_PATH = join(PKG_ROOT, 'scripts', 'seed-carehia-ai-os.ts');

function runSeedScript(flag: string): string {
  return execSync(`npx tsx ${SCRIPT_PATH} ${flag}`, { encoding: 'utf-8', cwd: PKG_ROOT });
}

// ── Load seed data ──

let seedPack: SeedPack;

beforeAll(() => {
  const raw = readFileSync(SEED_PATH, 'utf-8');
  seedPack = JSON.parse(raw);
});

// ── 1. Seed JSON validates ──

describe('Seed JSON structure', () => {
  it('parses as valid JSON with required top-level fields', () => {
    expect(seedPack.seedPack).toBe('Carehia AI OS Transformation');
    expect(seedPack.version).toBeTruthy();
    expect(seedPack.appId).toBeTruthy();
    expect(seedPack.project).toBeTruthy();
    expect(seedPack.description).toBeTruthy();
    expect(Array.isArray(seedPack.tasks)).toBe(true);
  });

  it('has a valid ISO date in createdAt', () => {
    const parsed = new Date(seedPack.createdAt);
    expect(parsed.getTime()).not.toBeNaN();
    // Verify it round-trips (allow .000Z vs Z difference)
    expect(parsed.toISOString().replace('.000Z', 'Z')).toBe(seedPack.createdAt);
  });

  it('contains at least 15 tasks', () => {
    expect(seedPack.tasks.length).toBeGreaterThanOrEqual(15);
  });
});

// ── 2. Required fields exist on every task ──

describe('Required fields', () => {
  it('every task has all required fields', () => {
    for (const task of seedPack.tasks) {
      expect(task.title, `missing title`).toBeTruthy();
      expect(task.description, `missing description on "${task.title}"`).toBeTruthy();
      expect(task.source, `missing source on "${task.title}"`).toBeTruthy();
      expect(task.priority, `missing priority on "${task.title}"`).toBeTruthy();
      expect(task.severity, `missing severity on "${task.title}"`).toBeTruthy();
      expect(task.suggestedAction, `missing suggestedAction on "${task.title}"`).toBeTruthy();
      expect(task.riskLevel, `missing riskLevel on "${task.title}"`).toBeTruthy();
      expect(typeof task.requiresConfirmation, `bad requiresConfirmation on "${task.title}"`).toBe('boolean');
      expect(task.weights, `missing weights on "${task.title}"`).toBeTruthy();
      expect(task.metadataJson, `missing metadataJson on "${task.title}"`).toBeTruthy();
    }
  });

  it('every task has valid metadataJson (parseable JSON string)', () => {
    for (const task of seedPack.tasks) {
      expect(() => JSON.parse(task.metadataJson), `bad metadataJson on "${task.title}"`).not.toThrow();
    }
  });

  it('every task has complete weight fields (0-10 range)', () => {
    for (const task of seedPack.tasks) {
      for (const key of WEIGHT_KEYS) {
        const val = task.weights[key];
        expect(typeof val, `missing weight ${key} on "${task.title}"`).toBe('number');
        expect(val, `weight ${key} out of range on "${task.title}"`).toBeGreaterThanOrEqual(0);
        expect(val, `weight ${key} out of range on "${task.title}"`).toBeLessThanOrEqual(10);
      }
    }
  });
});

// ── 3. No duplicate task titles ──

describe('No duplicate titles', () => {
  it('all task titles are unique', () => {
    const titles = seedPack.tasks.map(t => t.title);
    const unique = new Set(titles);
    expect(unique.size).toBe(titles.length);
  });
});

// ── 4. All tasks use allowed appId ──

describe('Allowed appId', () => {
  it('pack-level appId is in allowed list', () => {
    expect(ALLOWED_APP_IDS).toContain(seedPack.appId);
  });
});

// ── 5. All risk levels are valid ──

describe('Valid enum values', () => {
  it('all risk levels are valid', () => {
    for (const task of seedPack.tasks) {
      expect(VALID_RISK_LEVELS, `invalid riskLevel "${task.riskLevel}" on "${task.title}"`).toContain(task.riskLevel);
    }
  });

  it('all priorities are valid', () => {
    for (const task of seedPack.tasks) {
      expect(VALID_PRIORITIES, `invalid priority on "${task.title}"`).toContain(task.priority);
    }
  });

  it('all severities are valid', () => {
    for (const task of seedPack.tasks) {
      expect(VALID_SEVERITIES, `invalid severity on "${task.title}"`).toContain(task.severity);
    }
  });

  it('all sources are valid', () => {
    for (const task of seedPack.tasks) {
      expect(VALID_SOURCES, `invalid source on "${task.title}"`).toContain(task.source);
    }
  });

  it('all suggested actions are valid', () => {
    for (const task of seedPack.tasks) {
      expect(VALID_ACTIONS, `invalid suggestedAction on "${task.title}"`).toContain(task.suggestedAction);
    }
  });
});

// ── 6. Medium-risk audit task requires confirmation ──

describe('Risk-confirmation consistency', () => {
  it('the medium-risk audit task requires confirmation', () => {
    const auditTask = seedPack.tasks.find(t => t.title === 'Audit Current Carehia App Structure');
    expect(auditTask).toBeTruthy();
    expect(auditTask!.riskLevel).toBe('medium');
    expect(auditTask!.requiresConfirmation).toBe(true);
  });

  it('all medium or higher risk tasks require confirmation', () => {
    const riskyTasks = seedPack.tasks.filter(t =>
      t.riskLevel === 'medium' || t.riskLevel === 'high' || t.riskLevel === 'blocked'
    );
    for (const task of riskyTasks) {
      expect(task.requiresConfirmation, `"${task.title}" (${task.riskLevel} risk) should require confirmation`).toBe(true);
    }
  });
});

// ── 7. Seed script skips duplicates ──
// ── 8. Seed script reports inserted/skipped counts ──

describe('Seed script', () => {
  it('reports correct inserted count via --json', () => {
    const output = runSeedScript('--json');
    const result = JSON.parse(output);
    expect(result.inserted).toBeGreaterThanOrEqual(15);
    expect(result.skipped).toBe(0);
    expect(result.errors).toBe(0);
    expect(result.results).toHaveLength(seedPack.tasks.length);
  });

  it('produces valid SQL with INSERT per task via --sql', () => {
    const output = runSeedScript('--sql');
    expect(output).toContain('INSERT INTO kai_tasks');
    expect(output).toContain('Carehia AI OS Transformation');
    const insertCount = (output.match(/INSERT INTO kai_tasks/g) || []).length;
    expect(insertCount).toBe(seedPack.tasks.length);
  });

  it('SQL uses WHERE NOT EXISTS for duplicate prevention', () => {
    const output = runSeedScript('--sql');
    expect(output).toContain('WHERE NOT EXISTS');
    const notExistsCount = (output.match(/WHERE NOT EXISTS/g) || []).length;
    expect(notExistsCount).toBe(seedPack.tasks.length);
  });

  it('total of inserted + skipped + errors equals task count', () => {
    const output = runSeedScript('--json');
    const result = JSON.parse(output);
    expect(result.inserted + result.skipped + result.errors).toBe(seedPack.tasks.length);
  });
});

// ── KaiTask schema compatibility ──

describe('KaiTask schema compatibility', () => {
  it('all tasks can map to CreateTaskRequest shape', () => {
    for (const task of seedPack.tasks) {
      const req = {
        appId: seedPack.appId,
        project: seedPack.project,
        title: task.title,
        description: task.description,
        source: task.source,
        priority: task.priority,
        severity: task.severity,
        suggestedAction: task.suggestedAction,
        riskLevel: task.riskLevel,
        requiresConfirmation: task.requiresConfirmation,
        weights: task.weights,
        metadataJson: task.metadataJson,
      };

      expect(typeof req.appId).toBe('string');
      expect(typeof req.project).toBe('string');
      expect(typeof req.title).toBe('string');
      expect(req.title.length).toBeGreaterThan(0);
      expect(req.title.length).toBeLessThan(200);
    }
  });
});
