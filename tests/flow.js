const { chromium } = require('playwright');
const SHOT = process.argv[3];
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1200, height: 900 } }); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type()==='error') errs.push(m.text()); });
  await p.goto('file://' + process.argv[2]); await p.evaluate(() => localStorage.clear()); await p.reload();
  const go = async h => { await p.evaluate(x => location.hash = x, h); await p.waitForTimeout(120); };
  const shot = async n => { if (SHOT) await p.screenshot({ path: SHOT + '/' + n + '.png', fullPage: false }); };
  const log = async () => p.evaluate(() => JSON.parse(localStorage.getItem('flowpoint-test-v6')).scoreLog.map(l => `${l.target}: ${l.before}→${l.after} (${l.why})`));
  const st = () => p.evaluate(() => JSON.parse(localStorage.getItem('flowpoint-test-v6')));
  const clickRow = async (tbody, text, act) => { const row = p.locator(`#${tbody} tr`, { hasText: text }); await row.locator(`[data-act="${act}"]`).first().click(); await p.waitForTimeout(120); };

  // 0. 시작 상태
  await go('flowpay'); await shot('01-flowpay-start');
  console.log('my score:', await p.textContent('#score'), '|', (await p.textContent('#limitNote')).replace(/\s+/g,' '));
  await go('score'); await shot('02-score-start');
  console.log('partners:', await p.locator('#scSales tr, #scBuys tr').count(), '| signals:', (await p.locator('#scSales .tag.warn').allTextContents()).join(' / '));

  // 1. 브라이트몰 연체 입금 확인
  await go('sales'); await shot('03-sales-start');
  await clickRow('saleRows', '브라이트몰', 'paid');
  // 2. 한결푸드 기한 경과 세금계산서 발행
  const before = (await st()).sales.filter(s=>s.party==='한결푸드' && s.tax!=='issued').length;
  await p.locator('#saleRows tr', { hasText: '발행 기한 경과' }).first().locator('[data-act="tax"]').click(); await p.waitForTimeout(120);
  console.log('한결 미발행', before, '→', (await st()).sales.filter(s=>s.party==='한결푸드' && s.tax!=='issued').length);
  console.log('LOG after 1-2:\n  ' + (await log()).join('\n  '));
  await go('score'); await shot('04-score-log');

  // 3. 플로우페이 신청: 대성원료 650개 + 그린마켓 미발행 매출
  await go('orders');
  await p.locator('#orderRows tr', { hasText: '650개' }).locator('[data-act="finance"]').click(); await p.waitForTimeout(150);
  await p.locator('dialog label.check', { hasText: '그린마켓' }).locator('input').check(); await p.waitForTimeout(150);
  // 반려된 서류 다시 올리기
  while (await p.locator('dialog [data-act="upload"][data-ctx="apply"]:not(:has-text("미리"))').count()) { await p.locator('dialog [data-act="upload"][data-ctx="apply"]:not(:has-text("미리"))').first().click(); await p.waitForTimeout(120); }
  await shot('05-apply-dialog');
  await p.click('dialog [data-act="submitApply"]'); await p.waitForTimeout(150);
  let s = await st(); console.log('app status after submit:', s.apps.map(a=>a.status));
  await go('flowpay'); await shot('06-confirm-wait');
  await p.click('[data-act="cfm"]'); await p.waitForTimeout(120);
  s = await st(); console.log('after confirm:', s.apps.map(a=>a.status));

  // 4. 심사역 전환 → 승인
  await p.click('#roleBtn'); await p.waitForTimeout(200);
  console.log('hash after role:', await p.evaluate(()=>location.hash), '| review tab visible:', await p.isVisible('header nav a[data-v="review"]'));
  await shot('07-review-queue');
  console.log('flags:', (await p.locator('#rvQueue .flags .tag').allTextContents()).join(' / '));
  await p.click('#rvQueue [data-act="rvApprove"]'); await p.waitForTimeout(120);
  console.log('approve w/o reason status:', (await st()).apps.map(a=>a.status));
  await p.locator('#rvQueue .reasons label', { hasText: '입금 이력 양호' }).locator('input').check();
  await p.locator('#rvQueue .reasons label', { hasText: '세금계산서 미발행' }).locator('input').check();
  await p.click('#rvQueue [data-act="rvApprove"]'); await p.waitForTimeout(120);
  console.log('after approve:', (await st()).apps.map(a=>a.status));
  // 고객으로 → 전자서명
  await p.click('#roleBtn'); await p.waitForTimeout(150);
  await p.click('[data-act="sign"]'); await p.waitForTimeout(120);
  console.log('after sign:', (await st()).apps.map(a=>a.status));
  // 심사역 → 상환 완료
  await p.click('#roleBtn'); await p.waitForTimeout(150);
  await p.click('#rvAfter [data-act="rvOut"][data-r="repaid"]'); await p.waitForTimeout(120);
  s = await st(); console.log('outcome:', s.apps.map(a=>a.outcome), '| 대성 650 status:', s.purchases.find(x=>x.qty===650).status);

  // 5. 유동화: 오렌지유통 → 승인 → 서명 → 통지 → 연체
  await p.click('#roleBtn'); await p.waitForTimeout(150);
  await go('sales');
  await clickRow('saleRows', '오렌지유통', 'factor');
  await p.check('#arc1'); await p.check('#arc2'); await p.click('#arNext'); await p.waitForTimeout(150);
  await p.click('dialog [data-act="submitApply"]'); await p.waitForTimeout(150);
  await p.click('#roleBtn'); await p.waitForTimeout(150);
  await p.locator('#rvQueue .reasons label', { hasText: '관련 거래처 우량' }).locator('input').check();
  await p.click('#rvQueue [data-act="rvApprove"]'); await p.waitForTimeout(120);
  await p.click('#roleBtn'); await p.waitForTimeout(150);
  await go('factoring'); await p.click('#appsAr [data-act="sign"]'); await p.waitForTimeout(120);
  const cashBefore = (await st()).cash;
  console.log('ar after sign:', (await st()).apps[1].status);
  await shot('08-notice-wait');
  await p.click('#appsAr [data-act="notice"]'); await p.waitForTimeout(120);
  console.log('ar after notice:', (await st()).apps[1].status, '| cash +', (await st()).cash - cashBefore);
  await p.click('#roleBtn'); await p.waitForTimeout(150);
  await p.click('#rvAfter [data-act="rvOut"][data-r="late"]'); await p.waitForTimeout(120);
  await shot('09-review-log');
  console.log('LOG final:\n  ' + (await log()).join('\n  '));

  // 6. 이의 제기
  await p.click('#roleBtn'); await p.waitForTimeout(150);
  await go('flowpay'); await p.click('#sub-flowpay [data-act="dispute"]'); await p.fill('#dpText', '브라이트몰 대금은 실제로 기한 내 입금됐습니다'); await p.click('[data-act="disputeSubmit"]'); await p.waitForTimeout(120);
  await p.click('[data-act="myScore"]'); await p.waitForTimeout(150); await shot('10-my-score'); await p.keyboard.press('Escape');
  await p.click('#roleBtn'); await p.waitForTimeout(150);
  console.log('disputes in review:', await p.locator('#rvDisputes li').count(), '| decisions rows:', await p.locator('#rvLog tbody tr').count());
  // 초기화
  await p.click('#resetBtn'); await p.waitForTimeout(150);
  s = await st(); console.log('after reset: role', s.role, 'apps', s.apps.length, 'log', s.scoreLog.length, 'hash', await p.evaluate(()=>location.hash));
  // 고객 역할에서 #review 직접 접근 차단
  await go('review'); console.log('customer #review →', await p.evaluate(()=>location.hash));
  console.log('errors:', errs.length ? errs : 'none');
  await b.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
