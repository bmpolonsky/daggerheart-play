import { expect, test } from '@playwright/test';

// Run only against a separate local build with the fake Supabase URL below and
// a nonempty fixture-only publishable key. The normal offline artifact has no
// auth configuration and cannot exercise this dialog.
test.skip(process.env.DAGGERHEART_AUTH_FIXTURE !== '1', 'Requires the isolated auth fixture build, not the production-free preview.');
test.use({ serviceWorkers: 'block' });

test('email login failure remains visible after toast expiry and clears on a successful retry', async ({ page, baseURL }) => {
  const localOrigin = new URL(baseURL!).origin;
  // No external request is allowed to escape this synthetic test, even if the
  // wrong build was accidentally served.
  await page.route('**/*', async (route) => {
    if (new URL(route.request().url()).origin === localOrigin) await route.continue();
    else await route.abort();
  });
  let attempts = 0;
  await page.route('https://auth-fixture.invalid/**', async (route) => {
    const headers = {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'apikey,authorization,content-type,x-client-info,x-supabase-api-version',
      'access-control-allow-methods': 'GET,POST,OPTIONS'
    };
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers });
      return;
    }
    if (!new URL(route.request().url()).pathname.endsWith('/otp')) {
      await route.fulfill({ status: 401, contentType: 'application/json', headers, body: JSON.stringify({ message: 'Fixture signed out' }) });
      return;
    }
    attempts += 1;
    await route.fulfill({
      status: attempts === 1 ? 400 : 200,
      contentType: 'application/json',
      headers,
      body: JSON.stringify(attempts === 1 ? { code: 'over_email_send_rate_limit', msg: 'Fixture OTP rejection' } : {})
    });
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Аккаунт мастера', exact: true });
  await dialog.getByLabel('Почта мастера', { exact: true }).fill('qa@example.test');
  await dialog.getByRole('button', { name: 'Отправить ссылку', exact: true }).click();
  const error = dialog.getByRole('alert');
  await expect(error).toContainText('Не удалось отправить ссылку для входа.');
  await expect(error).toContainText('Слишком много запросов на письмо.');
  await expect(error).toContainText('over_email_send_rate_limit');
  await expect(error).toContainText('HTTP 400');
  await expect(dialog).not.toContainText('Fixture OTP rejection');
  await page.clock.install();
  await page.clock.fastForward(4_000);
  await expect(error).toBeVisible();
  await dialog.getByLabel('Почта мастера', { exact: true }).fill('qa-retry@example.test');
  await expect(error).toBeVisible();
  await dialog.getByRole('button', { name: 'Отправить ссылку', exact: true }).click();
  await expect(dialog.getByText('Запрос принят сервисом входа. Проверьте почту и спам; доставка письма может занять несколько минут.', { exact: true })).toBeVisible();
  await expect(error).toHaveCount(0);
  expect(attempts).toBe(2);
});
