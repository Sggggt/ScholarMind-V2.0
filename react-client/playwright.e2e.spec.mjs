import { test, expect } from '@playwright/test';

test('conversation creates and binds a real task from the main workspace', async ({ page }) => {
  await page.goto('http://127.0.0.1:5173/login');

  await page.locator('input[type="email"]').fill('researcher@university.edu');
  await page.locator('input[type="password"]').fill('local-pass');
  await page.locator('button[type="submit"]').click();

  await page.waitForURL('**/workspace');
  await expect(page.locator('h1')).toContainText('用对话推进研究');

  const composer = page.locator('textarea');
  await composer.fill(
    'Create task: benchmark hallucination mitigation methods for biomedical RAG under citation-grounded evaluation. Deliver literature review, gap analysis, experiment plan, runnable code scaffold, and a draft paper.',
  );
  await page.locator('button[type="submit"]').filter({ hasText: '发送' }).click();

  await expect(page.locator('.claude-message').last()).toContainText('Task');
  await expect(page.locator('.workspace-task-line strong').first()).not.toContainText('尚未创建研究任务');
  await expect(page.locator('.workspace-conversation-badge')).toContainText('控制面已接管执行面');

  await page.screenshot({ path: 'playwright-workspace-flow.png', fullPage: true });
});
