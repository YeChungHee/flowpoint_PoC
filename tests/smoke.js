const { chromium } = require('playwright');
(async () => {
  const file = 'file://' + process.argv[2];
  const b = await chromium.launch(); const p = await b.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type()==='error') errs.push(m.text()); });
  await p.goto(file);
  for (const v of ['home','report','orders','sales','score','fund','flowpay','factoring']) {
    await p.evaluate(h => location.hash = h, v); await p.waitForTimeout(150);
    const txt = await p.evaluate(() => document.querySelector('.view.on')?.innerText.length || 0);
    console.log(v.padEnd(10), 'visible text chars:', txt);
  }
  // open company report via score row
  await p.evaluate(() => location.hash = 'score'); await p.waitForTimeout(100);
  await p.click('tr.click'); await p.waitForTimeout(150);
  console.log('company  ', await p.evaluate(() => location.hash));
  console.log('errors:', errs.length ? errs : 'none');
  await b.close();
})();
