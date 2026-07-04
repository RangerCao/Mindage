import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();

  const logs = [];
  page.on('console', msg => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', err => logs.push(`[PAGE_ERROR] ${err.message}`));
  page.on('requestfailed', req => logs.push(`[REQ_FAIL] ${req.url()} ${req.failure()?.errorText}`));

  try {
    // Register and get token
    const resp = await page.evaluate(async () => {
      const r = await fetch('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'username=testuser2&password=test1234'
      });
      return r.json();
    });
    const token = resp.access_token;
    if (!token) {
      console.log('No token received:', JSON.stringify(resp));
      await browser.close();
      return;
    }
    console.log('Got token, setting up auth state...');

    // Set auth state
    await page.evaluate((t) => {
      localStorage.setItem('LIGHTRAG-API-TOKEN', t);
      sessionStorage.setItem('VERSION_CHECKED_FROM_LOGIN', 'true');
    }, token);

    // Navigate to home
    console.log('Navigating to http://localhost:5173/#/ ...');
    await page.goto('http://localhost:5173/#/', { waitUntil: 'domcontentloaded', timeout: 15000 });

    // Wait for React to render
    await new Promise(r => setTimeout(r, 5000));

    // Check what's rendered
    const info = await page.evaluate(() => {
      const root = document.getElementById('root');
      return {
        rootExists: !!root,
        rootChildren: root?.children.length || 0,
        rootHTML: root?.innerHTML?.substring(0, 1000) || '',
        bodyText: document.body?.innerText?.substring(0, 200) || '',
        title: document.title,
      };
    });
    console.log('Page info:', JSON.stringify(info, null, 2));

  } catch (e) {
    console.log('Error:', e.message);
  }

  console.log('\n=== All browser logs ===');
  logs.forEach(l => console.log(l));

  await browser.close();
})();
