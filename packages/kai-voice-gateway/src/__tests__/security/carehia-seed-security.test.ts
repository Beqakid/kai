/// <reference types="node" />
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { resolve, dirname } from 'path';
import { VALID_APP_IDS } from '../../types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const seedPath = resolve(__dirname, '../../../seeds/carehia-ai-os-tasks.json');
const seedData = JSON.parse(readFileSync(seedPath, 'utf-8'));
const tasks: Array<Record<string, unknown>> = seedData.tasks;

const scriptPath = resolve(__dirname, '../../../scripts/seed-carehia-ai-os.ts');
const scriptSrc = readFileSync(scriptPath, 'utf-8');

describe('Carehia Seed Pack Security Retest', () => {
  it('seed JSON validates', () => {
    expect(seedData).toHaveProperty('seedPack');
    expect(seedData).toHaveProperty('version');
    expect(seedData).toHaveProperty('tasks');
    expect(Array.isArray(tasks)).toBe(true);
  });

  it('all tasks have required fields', () => {
    const requiredFields = [
      'title',
      'appId',
      'project',
      'source',
      'priority',
      'severity',
      'riskLevel',
      'suggestedAction',
    ];

    // Note: appId and project live at the seed-pack level and are shared across tasks.
    // The seed script injects them per-task at insert time. Verify the pack-level fields exist.
    expect(typeof seedData.appId).toBe('string');
    expect(seedData.appId.length).toBeGreaterThan(0);
    expect(typeof seedData.project).toBe('string');
    expect(seedData.project.length).toBeGreaterThan(0);

    const taskLevelFields = ['title', 'source', 'priority', 'severity', 'riskLevel', 'suggestedAction'];
    for (const task of tasks) {
      for (const field of taskLevelFields) {
        expect(typeof task[field], `task "${task.title}" missing or invalid field "${field}"`).toBe('string');
        expect((task[field] as string).length, `task "${task.title}" has empty field "${field}"`).toBeGreaterThan(0);
      }
    }
  });

  it('all appIds are allowed', () => {
    // The seed pack uses a single appId at the top level
    const appId = seedData.appId as string;
    expect(
      (VALID_APP_IDS as readonly string[]).includes(appId),
      `appId "${appId}" is not in VALID_APP_IDS`,
    ).toBe(true);
  });

  it('all risk levels are valid', () => {
    const validRiskLevels = ['low', 'medium', 'high', 'blocked'];
    for (const task of tasks) {
      expect(
        validRiskLevels.includes(task.riskLevel as string),
        `task "${task.title}" has invalid riskLevel "${task.riskLevel}"`,
      ).toBe(true);
    }
  });

  it('no duplicate task titles', () => {
    const titles = tasks.map((t) => t.title as string);
    const uniqueTitles = new Set(titles);
    expect(uniqueTitles.size).toBe(tasks.length);
  });

  it('medium-risk audit task requires confirmation', () => {
    const mediumRiskTasks = tasks.filter((t) => t.riskLevel === 'medium');
    expect(mediumRiskTasks.length).toBeGreaterThan(0);
    for (const task of mediumRiskTasks) {
      expect(
        task.requiresConfirmation,
        `medium-risk task "${task.title}" should require confirmation`,
      ).toBe(true);
    }
  });

  it('seed script skips duplicates', () => {
    const hasDuplicateGuard =
      scriptSrc.includes('WHERE NOT EXISTS') || scriptSrc.includes('NOT EXISTS');
    expect(hasDuplicateGuard, 'seed script should contain duplicate-skip logic (WHERE NOT EXISTS)').toBe(true);
  });

  it('seed script does not modify Carehia production', () => {
    expect(scriptSrc).not.toContain('carehia.com');
    expect(scriptSrc).not.toMatch(/carehia[\-_.]prod/i);
    expect(scriptSrc).not.toContain('carehia-prod');
  });

  it('seed script does not call external app repositories', () => {
    expect(scriptSrc).not.toContain('github.com/Carehia');
    expect(scriptSrc).not.toContain('github.com/Viliniu');
    expect(scriptSrc).not.toContain('github.com/Volau');
    expect(scriptSrc).not.toContain('git clone');
    expect(scriptSrc).not.toContain('git push');
  });

  it('seeded tasks are planning tasks only', () => {
    const allowedActions = ['generate_tasklet_prompt', 'summarize_blockers'];
    for (const task of tasks) {
      expect(
        allowedActions.includes(task.suggestedAction as string),
        `task "${task.title}" has non-planning suggestedAction "${task.suggestedAction}"`,
      ).toBe(true);
    }
  });
});
