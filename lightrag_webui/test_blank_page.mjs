import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();

  const consoleMessages = [];
  const pageErrors = [];

  page.on('console', msg => {
    consoleMessages.push({ type: msg.type(), text: msg.text() });
  });

  page.on('pageerror', err => {
    pageErrors.push(err.message);
  });

  page.on('requestfailed', req => {
    console.log(`Request failed: ${req.url()} - ${req.failure()?.errorText}`);
  });

  // First, register a user via the API
  const registerResp = await page.evaluate(async () => {
    const resp = await fetch('/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'username=testuser&password=test1234'
    });
    return { status: resp.status, data: await resp.json() };
  });
  console.log('Register:', JSON.stringify(registerResp, null, 2));

  // Now navigate to the login page
  await page.goto('http://localhost:5173/#/login', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 2000));

  // Check if login page rendered
  const loginPageContent = await page.evaluate(() => document.body.innerHTML.length);
  console.log('Login page HTML length:', loginPageContent);

  // Fill in login form and submit
  const loginResult = await page.evaluate(async () => {
    const resp = await fetch('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'username=testuser&password=test1234'
    });
    return { status: resp.status, data: await resp.json() };
  });
  console.log('Login:', JSON.stringify(loginResult, null, 2));

  if (loginResult.data?.access_token) {
    // Set the token in localStorage and navigate
    await page.evaluate((token) => {
      localStorage.setItem('LIGHTRAG-API-TOKEN', token);
      sessionStorage.setItem('VERSION_CHECKED_FROM_LOGIN', 'true');
    }, loginResult.data.access_token);

    // Navigate to home
    await page.goto('http://localhost:5173/#/', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await new Promise(r => setTimeout(r, 5000));

    // Check what's rendered
    const homePageContent = await page.evaluate(() => {
      return {
        bodyHTML: document.body.innerHTML.substring(0, 500),
        rootChildren: document.getElementById('root')?.children.length || 0,
        rootHTML: document.getElementById('root')?.innerHTML.substring(0, 500) || '',
      };
    });
    console.log('Home page root children:', homePageContent.rootChildren);
    console.log('Home page root HTML (first 500):', homePageContent.rootHTML);
  }

  console.log('\n=== Console Messages ===');
  for (const msg of consoleMessages) {
    console.log(`[${msg.type}] ${msg.text}`);
  }

  console.log('\n=== Page Errors ===');
  for (const err of pageErrors) {
    console.log(err);
  }

  await browser.close();
})();
