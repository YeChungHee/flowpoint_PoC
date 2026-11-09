const { chromium } = require('playwright');
(async () => {
  const file = 'file://' + process.argv[2];
  const b = await chromium.launch(); const p = await b.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type()==='error') errs.push(m.text()); });
  await p.goto(file); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(150);
  // 접속 시 승인 창(시나리오 수집 후보 2건): 제목 확인 후 '나중에'로 닫는다
  console.log('prompt   ', await p.evaluate(() => document.getElementById('dlg').open ? document.getElementById('dlgTitle').textContent : '(없음)'));
  if (await p.evaluate(() => document.getElementById('dlg').open)) await p.click('#dlgLeft [data-act="close"]');
  for (const v of ['home','inbox','report','orders','sales','score','fund','flowpay','factoring','deals','calendar']) {
    await p.evaluate(h => location.hash = h, v); await p.waitForTimeout(150);
    const txt = await p.evaluate(() => document.querySelector('.view.on')?.innerText.length || 0);
    console.log(v.padEnd(10), 'visible text chars:', txt);
  }
  // open company report via score row
  await p.evaluate(() => location.hash = 'score'); await p.waitForTimeout(100);
  await p.click('#scSeg [data-sc="sale"]'); await p.click('#scSales [data-act="scOpen"]'); await p.waitForTimeout(150);
  console.log('company  ', await p.evaluate(() => location.hash));
  // 매입처 링크 화면: 없는 링크는 안내, 사이드바·탭 바·아래 테스트 막대는 숨김
  await p.evaluate(() => location.hash = 'link/없는링크'); await p.waitForTimeout(150);
  console.log('link     ', await p.evaluate(() => [document.querySelector('.view.on').id, document.querySelector('#lkBody h1').textContent, getComputedStyle(document.querySelector('footer')).display, getComputedStyle(document.getElementById('side')).display].join(' | ')));
  await p.evaluate(() => location.hash = 'deals'); await p.waitForTimeout(150);
  console.log('back     ', await p.evaluate(() => location.hash + ' ext=' + document.body.classList.contains('ext')));
  // 결제 캘린더 · 알림함 · 감사 메일 미리보기: 상환 완료된 플로우페이 1건과 감사 메일 기록을 넣은 상태로 확인
  await p.evaluate(() => {
    const k = 'flowpoint-test-v6', s = JSON.parse(localStorage.getItem(k)), x = s.purchases.find(y => y.status === 'ordered');
    x.status = 'repaid'; x.repayDate = x.due; x.repayAmount = Math.round(x.qty * x.price * 1.1 * 1.033);
    s.notifications.push({ id: 'smoke-thanks', date: x.due, type: 'thanks', purchaseId: x.id, channel: '이메일 (연동 예정)', to: '대표·재무', amount: x.repayAmount, payDate: x.due, scoreBefore: 620, scoreAfter: 645, limBefore: 33600000, limAfter: 36000000, text: '[결제 완료 감사] 스모크 점검', read: false });
    localStorage.setItem(k, JSON.stringify(s));
  });
  await p.reload(); await p.waitForTimeout(150);
  if (await p.evaluate(() => document.getElementById('dlg').open)) await p.click('#dlgLeft [data-act="close"]');
  await p.evaluate(() => location.hash = 'calendar'); await p.waitForTimeout(150);
  console.log('calendar ', await p.evaluate(() => [document.getElementById('calMonth').textContent, document.querySelectorAll('#calBox .cal-day').length + '일', document.querySelectorAll('#calBox .mk-fp').length + ' 결제', document.querySelectorAll('#calUp .rm-card').length + ' 카드'].join(' | ')));
  await p.evaluate(() => document.querySelector('[data-act="ntOpen"]').click()); await p.waitForTimeout(150);
  console.log('notif    ', await p.evaluate(() => document.getElementById('dlgTitle').textContent + ' | ' + document.querySelectorAll('dialog .nt-list li').length + '건'));
  await p.click('dialog [data-act="thanksOpen"]'); await p.waitForTimeout(150);
  console.log('thanks   ', await p.evaluate(() => document.getElementById('dlgTitle').textContent + ' | ' + document.querySelector('dialog .mail-h .subj').textContent));
  // 심사역 화면: 포트폴리오(실제 고객사 + 예시) · 이슈 피드 · 조치 기록 시트
  await p.click('#dlgLeft [data-act="close"]');
  await p.evaluate(() => { const k = 'flowpoint-test-v6', s = JSON.parse(localStorage.getItem(k)); s.role = 'reviewer'; localStorage.setItem(k, JSON.stringify(s)); });
  await p.reload(); await p.waitForTimeout(150);
  await p.evaluate(() => location.hash = 'review'); await p.waitForTimeout(150);
  console.log('review   ', await p.evaluate(() => [location.hash, document.querySelectorAll('.pf-tbl tbody tr').length + ' 고객사 (예시 ' + document.querySelectorAll('.pf-tbl tr.pf-ex').length + ')', document.querySelectorAll('#rvFeed .rv-feed li:not(.empty)').length + ' 이슈', document.querySelectorAll('#rvQueue .ai-rep').length + ' AI 보고서'].join(' | ')));
  await p.evaluate(() => document.querySelector('#rvFeed [data-act="rvActOpen"]').click()); await p.waitForTimeout(150);
  console.log('actsheet ', await p.evaluate(() => document.getElementById('dlgTitle').textContent + ' | ' + document.querySelectorAll('dialog .reasons input').length + ' 유형 | 메모 ' + !!document.getElementById('iaMemo')));
  console.log('errors:', errs.length ? errs : 'none');
  await b.close();
})();
