// 전체 시나리오 한 바퀴: 수집함 승인 → 브라이트몰 입금 → 한결푸드 세금계산서 → 플로우페이 신청 → 거래 상대 확인 → 심사(AI 보고서) 승인
// → 전자서명(거래 문서) → 매입처 링크 → 대금 지급·판매 세금계산서 → 납품 확인 → 묶은 매출 입금 확인 → 276에 넘기기(나중에 → 줄의 넘기기)
// → 날짜 이동(리마인드) → 나머지 묶은 매출 입금 확인·넘기기 → 자동 상환 완료(점수·감사 메일) → 유동화(채무자 통지·연체) → 이의 제기 → 이슈 피드 조치
// → (부록: 48시간 재알림 · 다음 날 넘김 지연 · 넘기지 않고 입금 예정일 + 7일 지나 자동 연체 · 늦게 납품 확인 후 넘겨 연체 후 완납) → 초기화
// 사용법: node tests/flow.js /절대/경로/index.html [캡처 저장 폴더]  (캡처: 1280×900, 2배 해상도, 안내서 docs/img 번호)
// 숫자·상태 확인은 expect()로 점검하고, 하나라도 틀리거나 페이지 오류가 있으면 종료 코드 1
const { chromium } = require('playwright');
const SHOT = process.argv[3];
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 }); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type()==='error') errs.push(m.text()); });
  await p.goto('file://' + process.argv[2]); await p.evaluate(() => localStorage.clear()); await p.reload();
  const go = async h => { await p.evaluate(x => location.hash = x, h); await p.waitForTimeout(120); };
  // 캡처 전에 해당 부분을 화면 안으로 스크롤 (전체 페이지 캡처는 쓰지 않음)
  const into = async (sel, gap = 72) => { await p.locator(sel).first().evaluate(e => e.scrollIntoView({ block: 'start' })); await p.evaluate(g => window.scrollBy(0, -g), gap); await p.waitForTimeout(120); };
  const top = async () => { await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(80); };
  const shot = async n => { await p.mouse.move(0, 899); await p.evaluate(() => { const t = document.getElementById('toast'); if (t) t.classList.remove('show'); }); await p.waitForTimeout(250); if (SHOT) await p.screenshot({ path: SHOT + '/' + n + '.png', fullPage: false }); };
  const log = async () => p.evaluate(() => JSON.parse(localStorage.getItem('flowpoint-test-v6')).scoreLog.map(l => `${l.target}: ${l.before}→${l.after} (${l.why})`));
  const st = () => p.evaluate(() => JSON.parse(localStorage.getItem('flowpoint-test-v6')));
  // 단계별 신청 시트: 아래 '다음' 버튼으로 한 단계씩 이동
  const next = async () => { await p.click('#dlgFoot [data-act="stepNext"]'); await p.waitForTimeout(120); };
  const dlgOpen = () => p.evaluate(() => document.getElementById('dlg').open);
  const closePrompt = async () => { if (await dlgOpen()) { await p.click('#dlgLeft [data-act="close"]'); await p.waitForTimeout(100); } };
  const role = async () => { await p.click('#roleBtn'); await p.waitForTimeout(150); await closePrompt(); };
  // 목록 줄의 동작 누르기: 줄 버튼(지금 할 일)에 있으면 바로, 없으면 줄을 눌러 상세 시트를 열고 그 안에서 누른다 (상세 시트는 닫고 끝냄)
  // (끝난 줄은 "완료 N건" 아래 접혀 있으므로 보이는 줄만 찾는다. 상세 시트는 동작이 끝나면 스스로 닫힘)
  const clickRow = async (list, text, act) => {
    const rows = p.locator(`#${list} li.tr-row:visible`, { hasText: text }), direct = rows.locator(`[data-act="${act}"]`);
    if (await direct.count()) { await direct.first().click(); await p.waitForTimeout(120); return; }
    for (let i = 0, n = await rows.count(); i < n; i++) {
      await rows.nth(i).locator('.tr-open').click(); await p.waitForTimeout(120);
      const b = p.locator(`#dlgBody [data-act="${act}"]`);
      if (await b.count()) {
        await b.first().click(); await p.waitForTimeout(120);
        if (await dlgOpen() && await p.locator('#dlgBody .dt-kv').count()) { await p.click('#dlgLeft [data-act="close"]'); await p.waitForTimeout(100); }
        return;
      }
      await p.click('#dlgLeft [data-act="close"]'); await p.waitForTimeout(80);
    }
    throw new Error(`목록에서 ${text}의 ${act} 동작을 찾지 못함`);
  };
  // 홈 오늘 할 일(최대 3개): 한 줄 · 둘째 줄 [버튼(채움이면 *)]
  const sigRows = async () => (await p.locator('#sigBox .hm-todo li').evaluateAll(ls => ls.map(l => l.querySelector('.hm-t') ? l.querySelector('.hm-t').textContent + ' · ' + l.querySelector('small').textContent + ' [' + l.querySelector('.gl-acts button').textContent + (l.querySelector('.gl-acts button.primary') ? '*' : '') + ']' : l.textContent))).join(' / ');
  const docSt = async () => (await st()).deals[0].docs.map(x => x.status).join(' ');
  const tl = async () => (await p.locator('#calUp .rm-card').first().locator('.rm-tl li').evaluateAll(ls => ls.map(l => l.querySelector('b').textContent + ' ' + l.querySelector('.tag').textContent))).join(' / ');
  const rem = async () => (await st()).notifications.filter(n => n.type === 'remind').map(n => n.step + '@' + n.date.slice(5)).join(', ');
  const feedTags = async () => (await p.locator('#rvFeed .rv-feed .flags .tag:first-child').allTextContents());
  const day = async () => (await p.textContent('#dayLabel')).trim();
  // 점검: 조건이 틀리면 NG를 찍고 끝에서 종료 코드 1 (기록만 하던 단계 5 확인을 실제 점검으로)
  const fails = [];
  const expect = (name, cond, got) => { if (cond) console.log('  ok', name); else { fails.push(name); console.log('  NG', name, '| got:', typeof got === 'string' ? got : JSON.stringify(got)); } };
  // 테스트 날짜 표시: 처음 날짜 + n일 → "11월 9일" / "2026-11-09" (앱과 같은 로컬 날짜)
  const dAt = n => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + n); return d; };
  const mdAt = n => (d => (d.getMonth() + 1) + '월 ' + d.getDate() + '일')(dAt(n));
  const isoAt = n => (d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'))(dAt(n));
  // 매입처 링크(외부용 화면): 열람 → 동의·서명 → 세금계산서(역발행 승인) → 돌아가기. 거래 문서 화면에서 부름
  const supplierLink = async (log) => {
    await p.click('#dlDetail [data-act="dlLink"]'); await p.waitForTimeout(150);
    if (log) console.log('link view:', (await p.evaluate(() => location.hash)).replace(/\/.*/, '/…'), '| sidebar', await p.isVisible('#side'), '| footer', await p.isVisible('footer'), '|', await p.textContent('#lkBody h1'), '| doc2', (await st()).deals[0].docs[1].status);
    await p.click('#lkBody [data-act="lkNext"]'); await p.waitForTimeout(100);
    if (log) console.log('link sign disabled before agree:', await p.isDisabled('#lkSignBtn'));
    await p.check('#lkAgree'); await p.waitForTimeout(80); if (log) { await top(); await shot('10-supplier-link'); }
    await p.click('#lkSignBtn'); await p.waitForTimeout(120);
    await p.check('#lkBody input[name="lkTax"][value="reverse"]'); await p.waitForTimeout(80);
    await p.click('#lkBody [data-act="lkTaxDo"]'); await p.waitForTimeout(120);
    if (log) console.log('link done:', await p.textContent('#lkBody .lk-done h2'), '| docs', await docSt(), '| method', (await st()).deals[0].docs[2].method);
    await p.click('#lkBody .lk-back a'); await p.waitForTimeout(150);
  };
  // 납품 확인 시트: 거래명세서 서명 · 입고 사진(큰 사진을 줄여 저장) · 넘김 일정 확인 → 납품 확인 완료. 거래 문서 화면에서 고객(대표)이 부름
  let png = null;
  const deliver = async (log) => {
    await p.click('#dlDetail [data-act="dlDeliver"]'); await p.waitForTimeout(150);
    if (log) console.log('delivery submit before:', await p.textContent('#dlgFoot [data-act="dlvSubmit"]'));
    await p.check('#dlvAgree'); await p.waitForTimeout(80); await p.click('#dlvSignBtn'); await p.waitForTimeout(80);
    // 큰 사진(2400×1800: 창고 바닥과 상자 그림 + 잡음)을 만들어 올리면 800px 이하·150KB 이하로 줄여 저장
    if (!png) png = await p.evaluate(() => { const c = document.createElement('canvas'); c.width = 2400; c.height = 1800; const g = c.getContext('2d');
      const bg = g.createLinearGradient(0, 0, 0, 1800); bg.addColorStop(0, '#d9dde2'); bg.addColorStop(1, '#8f969e'); g.fillStyle = bg; g.fillRect(0, 0, 2400, 1800);
      [[300, 700, 700, 600], [1050, 800, 650, 500], [1300, 380, 560, 420], [500, 300, 520, 400], [1750, 900, 450, 400]].forEach(([x, y, w, h], i) => { g.fillStyle = i % 2 ? '#b98a55' : '#c99b62'; g.fillRect(x, y, w, h); g.fillStyle = '#e8d3a8'; g.fillRect(x + w / 2 - 40, y, 80, h); });
      const im = g.getImageData(0, 0, 2400, 1800); let r = 7; for (let i = 0; i < im.data.length; i += 4){ r = (r * 1103515245 + 12345) & 0x7fffffff; const n = (r & 63) - 32; im.data[i] += n; im.data[i + 1] += n; im.data[i + 2] += n; } g.putImageData(im, 0, 0);
      return c.toDataURL('image/png').split(',')[1]; });
    await p.setInputFiles('#dlvPhoto', { name: '입고.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
    await p.waitForSelector('dialog .dlv-thumb'); await p.waitForTimeout(100);
    const thumb = await p.evaluate(() => { const i = document.querySelector('dialog .dlv-thumb'); return { w: i.naturalWidth, h: i.naturalHeight, kb: Math.round(i.src.length / 1024) }; });
    await p.check('#dlvPay'); await p.waitForTimeout(80);
    if (log) { console.log('photo:', Math.round(png.length * 0.75 / 1024) + 'KB →', thumb.w + '×' + thumb.h, thumb.kb + 'KB dataURL | submit:', await p.textContent('#dlgFoot [data-act="dlvSubmit"]')); await shot('11-delivery'); }
    await p.click('#dlgFoot [data-act="dlvSubmit"]'); await p.waitForTimeout(150);
  };

  // 0. 시작: 접속 시 승인 창(이메일 발주 파일에서 읽은 2건) → 나중에
  console.log('approval prompt:', await p.evaluate(() => document.getElementById('dlg').open ? document.getElementById('dlgTitle').textContent : '(없음)'), '|', await day());
  await closePrompt();
  await go('home');
  console.log('signals:', await p.textContent('#sigH'), '|', await sigRows());
  await top(); await shot('01-home-signals');
  await go('flowpay');
  console.log('my score:', await p.textContent('#score'), '|', (await p.textContent('#limitNote')).replace(/\s+/g, ' '));

  // 1. 수집함: 담당자가 확인(날짜 빠진 건은 수정) → 대표가 일괄 승인 → 매입·매출에 등록
  await p.click('#staffBtn'); await p.waitForTimeout(150);
  console.log('staff:', await p.textContent('#roleName'), '| prompt', await dlgOpen() ? await p.textContent('#dlgTitle') : '(없음)');
  await closePrompt(); await go('inbox');
  console.log('inbox staff:', await p.textContent('#ibHead'), '| rows', (await p.locator('#ibList .ib-row').evaluateAll(rs => rs.map(r => r.querySelector('b').textContent + ' ' + [...r.querySelectorAll('.flags .tag')].map(t => t.textContent).join(','))).catch(() => [])).join(' / '));
  await p.locator('#ibList .ib-row', { hasText: '오렌지유통' }).locator('[data-act="ibEdit"]').click(); await p.waitForTimeout(150);
  const due40 = await p.evaluate(() => { const d = new Date(); d.setDate(d.getDate() + 40); return d.toISOString().slice(0, 10); });
  await p.fill('#ibe_due', due40); await p.click('#dlgFoot [data-act="ibSave"]'); await p.waitForTimeout(150);
  await p.click('#ibBar [data-act="ibCheckAll"]'); await p.waitForTimeout(150);
  await go('orders');
  console.log('staff checked:', (await st()).inbox.map(c => c.party + ' ' + c.status).join(' / '), '| orders as staff:', await p.locator('#orderRows [data-act="ceoReq"], #orderRows [data-act="finance"]').first().textContent());
  await p.click('#staffBtn'); await p.waitForTimeout(150); await closePrompt(); await go('inbox');
  await top(); await shot('02-inbox-approve');
  console.log('inbox ceo:', await p.textContent('#ibHead'), '|', await p.textContent('#ibBar [data-act="ibApproveAll"]'), '| checked tags', await p.locator('#ibList .tag.ok', { hasText: '담당자 확인 완료' }).count());
  const nP = (await st()).purchases.length, nS = (await st()).sales.length;
  await p.click('#ibBar [data-act="ibApproveAll"]'); await p.waitForTimeout(150);
  let s = await st();
  console.log('approved:', s.inbox.map(c => c.party + ' ' + c.status).join(' / '), '| purchases +' + (s.purchases.length - nP), '| sales +' + (s.sales.length - nS), '|', await p.textContent('#ibHead'));

  // 2. 브라이트몰 연체 입금 확인 · 3. 한결푸드 기한 경과 세금계산서 발행 (+ 수집함에서 등록한 오렌지유통 매출 세금계산서)
  await go('sales'); await p.locator('#saleRows li', { hasText: '연체' }).first().evaluate(e => e.scrollIntoView({ block: 'center' })); await shot('03-sales-overdue');
  // 목록 한 줄에 버튼 하나 · 줄을 누르면 상세 시트(나머지 동작)
  const rowBtns = await p.locator('#saleRows li.tr-row:visible').evaluateAll(ls => ls.map(l => l.querySelectorAll('button[data-act]:not(.tr-open)').length));
  expect('매출 줄마다 버튼 최대 1개', rowBtns.length > 0 && rowBtns.every(n => n <= 1), rowBtns);
  await p.locator('#saleRows li.tr-row:visible', { hasText: '브라이트몰' }).first().locator('.tr-open').click(); await p.waitForTimeout(150);
  const dtActs = await p.locator('#dlgBody button[data-act]').evaluateAll(bs => bs.map(b => b.dataset.act));
  expect('브라이트몰 상세 시트: 독촉 · 입금 확인 · 명세서 보기', ['remind', 'paid', 'stmt'].every(a => dtActs.includes(a)), dtActs);
  await shot('03a-sales-detail');
  await p.click('#dlgLeft [data-act="close"]'); await p.waitForTimeout(100);
  await clickRow('saleRows', '브라이트몰', 'paid');
  const before = (await st()).sales.filter(x => x.party === '한결푸드' && x.tax !== 'issued').length;
  await p.locator('#saleRows li', { hasText: '계산서 기한 경과' }).first().locator('[data-act="tax"]').click(); await p.waitForTimeout(120);
  console.log('한결 미발행', before, '→', (await st()).sales.filter(x => x.party === '한결푸드' && x.tax !== 'issued').length);
  // 수집함에서 방금 등록한 오렌지유통 매출도 세금계산서 발행 (뒤에서 유동화 대상)
  await p.locator('#saleRows li', { hasText: '오렌지유통' }).locator('[data-act="tax"]').first().evaluate(e => e.click()); await p.waitForTimeout(120);
  console.log('오렌지유통(수집함) tax:', (await st()).sales.filter(x => x.party === '오렌지유통').map(x => x.due.slice(5) + ' ' + x.tax).join(' / '));
  console.log('LOG after 1-3:\n  ' + (await log()).join('\n  '));
  await go('score'); await p.click('#scSeg [data-sc="me"]'); await p.waitForTimeout(120); await into('#scLog', 112); await shot('04-score-log');

  // 4. 플로우페이(구매 대행형) 신청: 대성원료 650개 매입, 상환 매출로 미발행 매출 묶기 (묶은 매출 대금으로 상환)
  await go('orders');
  await p.locator('#orderRows li', { hasText: '1,573만원' }).locator('[data-act="finance"]').click(); await p.waitForTimeout(150);  // 대성원료 650개
  await next(); // ① 매입 확인 → ② 상환할 매출 묶기
  const step2 = async () => (await p.locator('#fpCover').innerText()).replace(/\s+/g, ' ') + ' | ' + await p.textContent('#dlgFoot .step-btn.primary') + ' disabled ' + await p.isDisabled('#dlgFoot .step-btn.primary');
  console.log('step2 title:', await p.textContent('#dlg .step-t'), '| none:', await step2());
  await p.locator('dialog label.check', { hasText: '그린마켓' }).locator('input').check(); await p.waitForTimeout(150);
  console.log('step2 그린마켓만:', await step2());
  await p.locator('#dlg .docrow', { hasText: '330만원' }).locator('input').check(); await p.waitForTimeout(150);
  console.log('step2 +한결푸드 330만원:', await step2());
  // 330만원 대신 440만원(한결푸드 200개, 세금계산서 기한 경과) 매출을 묶으면 충분 → 다음 단계로
  await p.locator('#dlg .docrow', { hasText: '330만원' }).locator('input').uncheck(); await p.waitForTimeout(150);
  await p.locator('#dlg .docrow', { hasText: '440만원' }).locator('input').check(); await p.waitForTimeout(150);
  console.log('step2 그린마켓+한결푸드 440만원:', await step2(), '|', await p.textContent('#fpCover + .sum'));
  await next(); // ② → ③ 서류 확인
  console.log('step3 button:', await p.textContent('#dlgFoot [data-act="stepNext"]'), '| need:', (await p.locator('dialog [data-act="upload"][data-ctx="apply"]:not(:has-text("미리"))').evaluateAll(bs => bs.map(x => x.closest('.docrow').firstChild.firstChild.textContent.trim()))).join(' / '));
  await shot('05-apply-docs');
  while (await p.locator('dialog [data-act="upload"][data-ctx="apply"]:not(:has-text("미리"))').count()) { await p.locator('dialog [data-act="upload"][data-ctx="apply"]:not(:has-text("미리"))').first().click(); await p.waitForTimeout(120); }
  await next(); // ③ → ④ 납품액·상환 일정 확인 후 신청
  console.log('step4 tier:', (await p.locator('#tierSeg [aria-pressed="true"]').textContent()), '| table:', (await p.locator('#dlg .stmt:not(.fp-alloc) tbody tr').allTextContents()).join(' / '));
  console.log('step4 kv:', (await p.locator('#dlg dl.kv').last().textContent()).replace(/\s+/g, ' '));
  console.log('step4 alloc:', (await p.locator('#dlg .fp-alloc tbody tr').evaluateAll(rs => rs.map(r => [...r.cells].map(c => c.textContent).join(' ')))).join(' / '), '|', (await p.locator('#fpCover').innerText()).replace(/\s+/g, ' '));
  // 결제 기간을 90일로 바꾸면 납품액이 묶은 매출보다 커져 신청 막힘 → 제안값으로 되돌림
  await p.click('#tier90'); await p.waitForTimeout(120);
  console.log('step4 90일:', await p.textContent('#dlgFoot [data-act="submitApply"]'), 'disabled', await p.isDisabled('#dlgFoot [data-act="submitApply"]'), '|', (await p.locator('#fpCover').innerText()).replace(/\s+/g, ' '));
  await p.click('#tier30'); await p.waitForTimeout(120);
  await shot('06-apply-price');
  await p.click('dialog [data-act="submitApply"]'); await p.waitForTimeout(150);
  s = await st(); console.log('app status after submit:', s.apps.map(a => a.status));
  console.log('app price:', s.apps.map(a => `tier ${a.tier} rate ${a.rate} sale ${a.saleSupply}+${a.saleVat}=${a.saleTotal} pay ${a.payDate} mileage ${a.mileage} repay ${a.repayTotal} grace ${a.graceDays}`).join(''));
  console.log('app alloc:', s.apps[0].alloc.map(r => `${s.sales.find(x => x.id === r.saleId).party} ${r.due.slice(5)} ${r.saleTotal}→${r.forward}`).join(' / '), '| links', s.apps[0].links.length);
  { const a = s.apps[0];
    expect('납품액 16,249,090 · 마일리지 284,000 · 넘길 금액 15,965,090 · 30일 3.3%', a.saleTotal === 16249090 && a.mileage === 284000 && a.repayTotal === 15965090 && a.tier === 30 && a.rate === 0.033 && a.graceDays === 7, a);
    expect('넘길 금액 배분: 한결푸드 4,400,000 → 그린마켓 11,565,090', a.alloc.map(r => s.sales.find(x => x.id === r.saleId).party + ' ' + r.forward).join(' / ') === '한결푸드 4400000 / 그린마켓 11565090', a.alloc); }
  // 5. 거래 상대 확인 (미발행 매출을 연결했기 때문)
  await go('flowpay'); await into('#apps'); await shot('07-confirm-wait');
  console.log('confirm buttons:', (await p.locator('#apps [data-act="cfm"]').allTextContents()).join(' / '));
  while (await p.locator('#apps [data-act="cfm"]').count()) { await p.locator('#apps [data-act="cfm"]').first().click(); await p.waitForTimeout(120); }
  s = await st(); console.log('after confirm:', s.apps.map(a => a.status));

  // 6. 심사역 전환 → 심사 대기(AI 검토 보고서 예시) → 사유 고르고 승인
  await role();
  console.log('hash after role:', await p.evaluate(() => location.hash), '| review tab visible:', await p.isVisible('header nav a[data-v="review"]'));
  console.log('flags:', (await p.locator('#rvQueue .flags .tag').allTextContents()).join(' / '));
  console.log('portfolio:', (await p.locator('.pf-tbl tbody tr').evaluateAll(rs => rs.map(r => r.cells[0].querySelector('button').textContent + (r.querySelector('.tag.mute') ? '(예시)' : '') + ' ' + r.cells[6].textContent))).join(' / '));
  console.log('feed:', (await p.locator('#rvFeed [data-act="rvFilter"]').allTextContents()).join(' / '), '|', (await feedTags()).join(' / '));
  const ai = p.locator('#rvQueue .ai-rep').first(), aiTxt = await ai.innerText();
  console.log('ai report: open', await ai.evaluate(d => d.open), '|', (await ai.locator('summary').innerText()).replace(/\s+/g, ' '), '|', (await ai.locator('h4').allTextContents()).join(' / '));
  console.log('ai phrases:', ['상환 매출', '최근 30일', '최근 90일', '규칙 기반 요약(AI 연동 예정)'].map(k => k + ' ' + aiTxt.includes(k)).join(' | '), '| risks', await ai.locator('.ai-risk li').count(), '| links', await ai.locator('.ai-risk li button').count(), '| checks', await ai.locator('.ai-ul').last().locator('li').count());
  console.log('ai summary:', await ai.locator('.ai-sum').textContent());
  await into('#rvQueue .ai-rep', 140); await shot('08-review-ai');
  await p.click('#rvQueue [data-act="rvApprove"]'); await p.waitForTimeout(120);
  console.log('approve w/o reason status:', (await st()).apps.map(a => a.status));
  await p.locator('#rvQueue .reasons label', { hasText: '입금 이력 양호' }).locator('input').check();
  await p.locator('#rvQueue .reasons label', { hasText: '세금계산서 미발행' }).locator('input').check();
  await p.click('#rvQueue [data-act="rvApprove"]'); await p.waitForTimeout(120);
  console.log('after approve:', (await st()).apps.map(a => a.status));

  // 7. 고객(대표) 전자서명 → 집행, 거래 문서 7종 생성 (① 고객 발주서 완료 · ② 매입처 발주서 보냄)
  await role();
  await p.click('[data-act="sign"]'); await p.waitForTimeout(120);
  s = await st(); console.log('after sign:', s.apps.map(a => a.status), '| 대성 650:', (x => `${x.status} repay ${x.repayAmount} on ${x.repayDate}`)(s.purchases.find(x => x.qty === 650)), '| 그린마켓 470:', s.sales.find(x => x.qty === 470).status);
  console.log('deal docs after sign:', await docSt());
  const snap = await p.evaluate(() => localStorage.getItem('flowpoint-test-v6'));  // 부록(48시간 재알림·D+1 미입금) 점검용
  await go('deals'); await top();
  console.log('deals list:', await p.locator('#dlList .dl-row').count(), '| progress:', (await p.locator('#dlList .dl-prog li').allTextContents()).join(' / '));
  await shot('09-deal-docs');

  // 8. 매입처 링크 (외부용 화면): 열람 → 동의·서명 → 세금계산서(역발행 승인) → 완료
  await supplierLink(true);

  // 9. 심사역(276 운영): 묶음 상환은 자동 정산(상환 완료·연체 버튼 없음, 결과만 표시), 납품 확인 전 결제 완료 막힘 → 대금 지급 · 고객사 세금계산서 발행
  await role();
  const rvRow = async () => (await p.locator('#rvAfter li', { hasText: '대성원료' }).innerText()).replace(/\s+/g, ' ');
  console.log('reviewer after-care:', await rvRow(), '| rvOut buttons', await p.locator('#rvAfter li', { hasText: '대성원료' }).locator('[data-act="rvOut"]').count());
  await go('deals');
  await p.click('#dlDetail [data-act="dlPay"]'); await p.waitForTimeout(120);
  await p.click('#dlDetail [data-act="dlIssue"]'); await p.waitForTimeout(120);
  console.log('after pay + issue:', await docSt());

  // 10. 고객(대표): 납품 확인 (거래명세서 서명 · 입고 사진 · 입금일 확인)
  await role(); await go('deals');
  await deliver(true);
  s = await st(); console.log('after delivery:', await docSt(), '| photo saved', s.deals[0].photo.length <= 150 * 1024);

  // 11. 묶은 매출 입금 확인 → "오늘 276에 넘길 금액" 시트. 첫 번째(한결푸드 440만원)는 나중에 → 줄의 "넘기기"로 넘김
  const fwdSheet = async () => (await p.textContent('#dlgTitle')) + ' ' + (await p.textContent('#fwdAmt')) + ' [' + (await p.locator('#dlgFoot button').allTextContents()).join(', ') + ' | ' + (await p.textContent('#dlgLeft button')) + ']';
  const saleRow = async name => (await p.locator('#saleRows li.tr-row', { hasText: name }).filter({ hasText: '상환 매출' }).first().innerText()).replace(/\s+/g, ' ');
  const fw = async () => { const a = (await st()).apps[0]; return 'fwd ' + (a.fwd || []).map(f => f.amt).join('+') + ' = ' + (a.fwd || []).reduce((t, f) => t + f.amt, 0) + ' / ' + a.repayTotal + ' · outcome ' + (a.outcome || '-'); };
  await go('sales');
  console.log('bundled rows:', await saleRow('한결푸드'), '/', await saleRow('그린마켓'));
  console.log('sales order (first 5):', (await p.locator('#saleRows li:visible').evaluateAll(ls => ls.slice(0, 5).map(l => l.innerText.replace(/\s+/g, ' ')))).join(' / '), '|', await p.textContent('#saleRows .tr-fold'), 'hidden', await p.locator('#saleRows li.tr-done[hidden]').count());
  // 자금 예측: 묶은 매출 입금(들어옴)과 같은 날 276에 넘김(나감)
  const fc = async () => { await go('report'); const r = (await p.locator('#inList li, #outList li').evaluateAll(ls => ls.map(l => l.innerText.replace(/\s+/g, ' ')).filter(t => /한결푸드|276에 넘김/.test(t)))).join(' / '); await go('sales'); return r; };
  console.log('forecast (14d) before:', await fc());
  const cash0 = (await st()).cash;
  await p.locator('#saleRows li.tr-row', { hasText: '한결푸드' }).filter({ hasText: '상환 매출' }).locator('.tr-open').click(); await p.waitForTimeout(120);
  await p.click('#dlgBody [data-act="paid"]'); await p.waitForTimeout(150);
  const fs1 = await fwdSheet(); console.log('fwd sheet:', fs1);
  expect('넘기기 시트: 오늘 276에 넘길 금액 4,400,000원', fs1.startsWith('오늘 276에 넘길 금액 4,400,000원') && fs1.includes('276에 넘기기'), fs1);
  await shot('11a-forward-sheet');
  await p.click('#dlgLeft [data-act="close"]'); await p.waitForTimeout(150);  // 나중에
  console.log('later → row:', await p.locator('#saleRows li.tr-row', { hasText: '넘김 대기' }).first().innerText().then(t => t.replace(/\s+/g, ' ')), '| focus', await p.evaluate(() => document.activeElement.dataset.act), '| cash +', (await st()).cash - cash0);
  console.log('forecast (14d) after later:', await fc());
  await p.click('#saleRows [data-act="fwd"]'); await p.waitForTimeout(150);
  await p.click('#dlgFoot [data-act="fwdDo"]'); await p.waitForTimeout(150);
  s = await st(); console.log('forwarded 1:', await fw(), '| cash', s.cash - cash0, '| toast', await p.textContent('#toast'), '| row', await p.evaluate(() => document.querySelector('#saleRows .tr-fold').textContent));
  expect('첫 넘김: 4,400,000 / 15,965,090, 아직 완납 아님', (await fw()) === 'fwd 4400000 = 4400000 / 15965090 · outcome -', await fw());
  await go('flowpay'); await into('#apps');
  const sp1 = (await p.locator('#apps .fw').innerText()).replace(/\s+/g, ' ');
  console.log('service progress:', sp1, '| bar', await p.getAttribute('#apps .fw-bar', 'aria-valuetext'));
  expect('서비스 진행: 넘긴 금액 440만원 + 마일리지 28만원 / 납품액 1,625만원 · 상환 중 28%', sp1.includes('넘긴 금액 440만원 + 마일리지 28만원 / 납품액 1,625만원') && sp1.includes('상환 중 28%'), sp1);
  await shot('11b-service-progress');
  console.log('app header:', (await p.locator('#apps .app-t').first().innerText()).replace(/\s+/g, ' '), '| 납품액 같은 값', (await p.locator('#apps .app-t').first().innerText()).includes('1,625만원') && (await p.locator('#apps .fw-h').innerText()).includes('/ 납품액 1,625만원'));
  // 거래 문서 7 "묶은 매출 대금 넘김(건별)" 미리보기: 넘긴 건(매출처 · 날짜 · 금액)과 합계 대 납품액
  const doc7 = async (shotName) => { await go('deals'); await p.click('#dlDetail [data-act="dlPrev"][data-k="payC"]'); await p.waitForTimeout(150);
    const r = (await p.textContent('#dlgTitle')) + ' | rows ' + (await p.locator('#dlgBody .fw-items tbody tr').evaluateAll(rs => rs.map(r => [...r.cells].map(c => c.textContent).join(' ')))).join(' / ') +
      ' | ' + (await p.locator('#dlgBody .docf-sum').innerText()).replace(/\s+/g, ' ') + ' | ' + (await p.locator('#dlgBody .docf-kv').last().innerText()).replace(/\s+/g, ' ');
    if (shotName) await shot(shotName);
    await p.click('#dlgLeft [data-act="close"]'); await p.waitForTimeout(100); return r; };
  const d7 = await doc7('11c-doc7-preview');
  console.log('doc7 preview:', d7, '| doc7 title', await p.locator('#dlDetail .dl-docs li').nth(6).locator('b').first().textContent());
  expect('문서 7 미리보기: 한결푸드 넘김 4,400,000 · 그린마켓 예정 11,565,090 · 남은 11,565,090원', d7.includes('한결푸드 ' + mdAt(0) + ' 넘김 4,400,000') && d7.includes('그린마켓 ') && d7.includes('11,565,090 (예정)') &&
    d7.includes('넘긴 합계 4,400,000원') && d7.includes('마일리지 차감 284,000원') && d7.includes('납품액 16,249,090원') && d7.includes('남은 금액 11,565,090원') && d7.includes('상환 중'), d7);

  // 12. 날짜 이동(테스트): +30일 (그린마켓 입금 예정일 12월 4일 + 5일, 유예 7일 안) → 리마인드 · 결제 캘린더
  console.log('reminders before:', await rem());
  await p.click('footer [data-shift="30"]'); await p.waitForTimeout(150);
  console.log('+30일:', await day(), '| toast:', await p.textContent('#toast'), '| reminders:', await rem(), '|', await fw());
  await closePrompt(); await go('calendar'); await top();
  console.log('calendar:', await p.textContent('#calHead'), '| marks', await p.locator('#calBox .mk-fp').count(), '| timeline:', await tl());
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#calUp [data-act="icsGet"]')]);
  const ics = require('fs').readFileSync(await dl.path(), 'utf8');
  console.log('ics:', dl.suggestedFilename(), '|', (ics.match(/^(DTSTART[^\r\n]*)/m) || [])[1], '| VEVENT', /BEGIN:VEVENT/.test(ics), '| alarms', (ics.match(/BEGIN:VALARM/g) || []).length, '| CRLF', ics.includes('\r\n'));
  await shot('12-calendar');
  console.log('bell badge:', (await p.textContent('#tbBell .nt-badge')).trim());
  await p.click('#tbBell'); await p.waitForTimeout(150);
  console.log('notif sheet:', await p.textContent('#dlgTitle'), '| rows', await p.locator('dialog .nt-list li').count(), '| first', (await p.locator('dialog .nt-list li .flags').first().innerText()).replace(/\s+/g, ' '));
  await p.click('#dlgFoot [data-act="ntRead"]'); await p.waitForTimeout(120);
  console.log('after read: unread', (await st()).notifications.filter(n => !n.read).length, '| badge hidden', await p.locator('#tbBell .nt-badge').isHidden());
  await p.click('#dlgLeft [data-act="close"]'); await p.waitForTimeout(100);

  // 12-1. 그 사이 입금 예정일이 지난 매출은 연체로 바뀜 → 입금 확인으로 정리 (테스트: 그동안 입금됐다고 가정, 상세 시트는 동작 후 닫힘)
  await go('flowpay'); const scMove = (await p.textContent('#score')).trim(), limMove = (await p.textContent('#limitNote')).replace(/\s+/g, ' ').slice(0, 24);
  await go('sales');
  const odParties = await p.locator('#saleRows li.tr-row:visible', { hasText: '연체' }).evaluateAll(rs => rs.map(r => r.querySelector('b').textContent.trim()));
  while (await p.locator('#saleRows li.tr-row:visible', { hasText: '연체' }).count()) { await p.locator('#saleRows li.tr-row:visible', { hasText: '연체' }).first().locator('.tr-open').evaluate(e => e.click()); await p.waitForTimeout(100); await p.locator('#dlgBody [data-act="paid"]').evaluate(e => e.click()); await p.waitForTimeout(120); }
  console.log('detail closes after action:', !(await dlgOpen()), '| focus', await p.evaluate(() => document.activeElement.className + ' ' + document.activeElement.textContent.replace(/\s+/g, ' ').slice(0, 30)));
  await go('flowpay');
  console.log('overdue after move:', odParties.length + '건', '| score', scMove, '(' + limMove + ') →', (await p.textContent('#score')).trim(), '|', (await p.textContent('#limitNote')).replace(/\s+/g, ' ').slice(0, 24));

  // 12-2. 그린마켓(상환 매출) 입금 확인 → 276에 넘기기(남은 납품액까지만, 넘는 금액은 고객사에 남음) → 자동 상환 완료 · 점수 · 감사 메일
  await go('sales');
  console.log('그린마켓 row:', await saleRow('그린마켓'));
  const cashRepay = (await st()).cash, scRepay = (await st()).scoreLog.length;
  await clickRow('saleRows', '상환 매출', 'paid');
  console.log('fwd sheet 2:', await fwdSheet());
  await p.click('#dlgFoot [data-act="fwdDo"]'); await p.waitForTimeout(150);
  s = await st(); console.log('forwarded 2:', await fw(), '| cash', s.cash - cashRepay, '(입금 12,408,000 − 넘김) | toast', await p.textContent('#toast'));
  console.log('outcome:', s.apps.map(a => a.outcome + (a.auto ? '(자동)' : '')), '| 대성 650 status:', s.purchases.find(x => x.qty === 650).status, '| score log +', s.scoreLog.slice(scRepay).map(l => l.target + ' ' + l.before + '→' + l.after + ' (' + l.why + ')').join(' / '));
  console.log('deal after repaid:', await docSt(), '|', s.deals[0].status);
  console.log('bundled rows after:', (await p.locator('#saleRows li.tr-row', { hasText: '넘김 완료' }).evaluateAll(ls => ls.map(l => l.innerText.replace(/\s+/g, ' ') + (l.hidden ? ' (접힘)' : '')))).join(' / '), '|', await p.textContent('#saleRows .tr-fold'));
  await p.click('#saleRows .tr-fold'); await p.waitForTimeout(100);
  console.log('fold open:', await p.getAttribute('#saleRows .tr-fold', 'aria-expanded'), '| visible done', await p.locator('#saleRows li.tr-done:visible').count(), '| focus', await p.evaluate(() => document.activeElement.className));
  await p.click('#saleRows .tr-fold'); await p.waitForTimeout(100);
  await go('flowpay'); await into('#apps');
  console.log('service progress done:', (await p.locator('#apps .fw').innerText()).replace(/\s+/g, ' '));
  const th = s.notifications.find(n => n.type === 'thanks');
  console.log('thanks:', th ? th.channel + ' · ' + th.to + ' · score ' + th.scoreBefore + '→' + th.scoreAfter + ' · limit ' + th.limBefore + '→' + th.limAfter : 'none');
  await role();
  console.log('reviewer after-care done:', await rvRow());
  await go('deals'); await p.click('#dlDetail [data-act="thanksOpen"]'); await p.waitForTimeout(150);
  const thPrev = (await p.locator('dialog .mail-fig > div').allInnerTexts()).map(t => t.replace(/\s+/g, ' ')).join(' / ');
  console.log('thanks preview:', await p.textContent('#dlgTitle'), '|', await p.textContent('dialog .mail-h .subj'), '|', thPrev);
  { const a = s.apps[0], pu = s.purchases.find(x => x.qty === 650);
    expect('완납: 넘긴 합계 15,965,090 = 넘길 금액, outcome repaid(자동), 매입 상환 완료, 문서 7종 완료', a.outcome === 'repaid' && a.auto && (a.fwd || []).reduce((t, f) => t + f.amt, 0) === 15965090 && pu.status === 'repaid' && s.deals[0].status === 'done' && s.deals[0].docs.every(x => x.status === 'done'), { outcome: a.outcome, fwd: a.fwd, pu: pu.status, deal: s.deals[0].status });
    expect('완납 점수 654→679', s.scoreLog.some(l => l.target === '우리 회사' && l.before === 654 && l.after === 679 && l.why.startsWith('플로우페이 상환 완료')), s.scoreLog.slice(-3));
    expect('감사 메일: 654→679 · 한도 4,312만→5,012만', th && th.scoreBefore === 654 && th.scoreAfter === 679 && th.limBefore === 43120000 && th.limAfter === 50120000 && thPrev.includes('654점 → 679점') && thPrev.includes('4,312만원 → 5,012만원'), thPrev); }
  await shot('13-thanks-mail');
  await p.click('#dlgLeft [data-act="close"]'); await p.waitForTimeout(100);
  await p.click('footer [data-shift="7"]'); await p.waitForTimeout(150);
  console.log('+37일:', await day(), '| reminders:', await rem(), '| outcome stays', (await st()).apps[0].outcome);

  // 13. 유동화: 수집함에서 등록한 오렌지유통 매출(12월 18일 입금 예정, 세금계산서 발행함) → 신청 → 승인 → 서명 → 채무자 통지 → 연체
  await role();
  await go('sales');
  await clickRow('saleRows', '오렌지유통', 'factor');
  await p.check('#arc1'); await p.check('#arc2'); await p.click('#arNext'); await p.waitForTimeout(150);
  await next(); // ② 채권 정보 → ③ 서류 확인 (날짜를 옮기는 동안 유효기간이 지난 서류는 다시 올림)
  const arNeed = await p.locator('dialog [data-act="upload"][data-ctx="apply"]:not(:has-text("미리"))').evaluateAll(bs => bs.map(x => x.closest('.docrow').firstChild.firstChild.textContent.trim()));
  while (await p.locator('dialog [data-act="upload"][data-ctx="apply"]:not(:has-text("미리"))').count()) { await p.locator('dialog [data-act="upload"][data-ctx="apply"]:not(:has-text("미리"))').first().click(); await p.waitForTimeout(120); }
  console.log('ar step3 re-upload:', arNeed.join(' / ') || '(없음)');
  await next(); // ③ → ④ 확인하고 신청
  await p.click('dialog [data-act="submitApply"]'); await p.waitForTimeout(150);
  console.log('ar app:', (x => x ? x.status + ' ' + x.amount : 'none')((await st()).apps[1]));
  await role();
  await p.locator('#rvQueue .reasons label', { hasText: '관련 거래처 우량' }).locator('input').check();
  await p.click('#rvQueue [data-act="rvApprove"]'); await p.waitForTimeout(120);
  await role();
  await go('factoring'); await p.click('#appsAr [data-act="sign"]'); await p.waitForTimeout(120);
  const cashBefore = (await st()).cash;
  console.log('ar after sign:', (await st()).apps[1].status);
  await into('#appsAr'); await shot('14-notice-wait');
  await p.click('#appsAr [data-act="notice"]'); await p.waitForTimeout(120);
  console.log('ar after notice:', (await st()).apps[1].status, '| cash +', (await st()).cash - cashBefore);
  await role();
  await p.click('#rvAfter [data-act="rvOut"][data-r="late"]'); await p.waitForTimeout(120);
  console.log('LOG final:\n  ' + (await log()).join('\n  '));

  // 14. 이의 제기 (고객) → 심사역 이의 제기 목록
  await role();
  await go('flowpay'); await p.click('#sub-flowpay [data-act="dispute"]'); await p.fill('#dpText', '브라이트몰 대금은 실제로 기한 내 입금됐습니다'); await p.click('[data-act="disputeSubmit"]'); await p.waitForTimeout(120);
  await role();
  console.log('disputes in review:', await p.locator('#rvDisputes li').count(), '| decisions rows:', await p.locator('#rvLog tbody tr').count());

  // 15. 심사 이슈 피드: 확인 · 조치 기록 (빈 조치는 저장 안 됨)
  await go('review');
  console.log('feed:', (await p.locator('#rvFeed [data-act="rvFilter"]').allTextContents()).join(' / '), '|', (await feedTags()).join(' / '));
  console.log('portfolio real:', await p.locator('.pf-tbl tr.pf-real').evaluate(r => [...r.cells].map(c => c.innerText.replace(/\s+/g, ' ')).join(' | ')));
  await p.click('#rvFeed [data-act="rvFilter"][data-f="bad"]'); await p.waitForTimeout(100);
  console.log('filter 위험:', (await feedTags()).every(t => t.startsWith('위험')), (await feedTags()).length + '건');
  await p.click('#rvFeed [data-act="rvFilter"][data-f="all"]'); await p.waitForTimeout(100);
  await p.locator('#rvFeed [data-act="rvCheck"]').first().click(); await p.waitForTimeout(120);
  await p.locator('#rvFeed [data-act="rvActOpen"]').nth(1).click(); await p.waitForTimeout(150);
  console.log('act sheet:', await p.textContent('#dlgTitle'), '|', (await p.locator('dialog .reasons label').allTextContents()).join(' / '));
  await p.click('#dlgFoot [data-act="rvActSave"]'); await p.waitForTimeout(100);
  console.log('act empty save blocked:', await dlgOpen(), '|', await p.textContent('#toast'));
  await p.locator('dialog .reasons label', { hasText: '고객 연락' }).locator('input').check();
  await p.locator('dialog .reasons label', { hasText: '모니터링' }).locator('input').check();
  await p.fill('#iaMemo', '대표와 통화, 금요일까지 입금 약속');
  await p.click('#dlgFoot [data-act="rvActSave"]'); await p.waitForTimeout(150);
  console.log('issueLog:', Object.entries((await st()).issueLog).map(([k, v]) => k.split(':')[0] + ' ' + v.status + (v.types ? ' [' + v.types.join(',') + '] ' + v.memo : '')).join(' / '), '| shown', (await p.locator('#rvFeed .tag.ok', { hasText: '조치 기록' }).count()) + ' 조치 · ' + (await p.locator('#rvFeed .tag.mute', { hasText: '확인함' }).count()) + ' 확인', '|', (await p.locator('#rvFeed [data-act="rvFilter"]').allTextContents()).join(' / '));
  await into('#fdH', 80); await shot('15-issue-feed');
  await p.locator('.pf-tbl tr.pf-ex').first().click(); await p.waitForTimeout(80); console.log('example row toast:', await p.textContent('#toast'));
  await p.click('.pf-tbl tr.pf-real .pf-name'); await p.waitForTimeout(150);
  console.log('real row → focus', await p.evaluate(() => document.activeElement.id), '|', (await p.textContent('#rvFeed .rv-co')).replace(/\s+/g, ' '));
  await into('#rvLog', 120); await shot('16-review-log');

  // 부록. 서명 직후 기록으로 되돌려 점검: 매입처 서명 48시간 재알림, 결제일 지나 미입금이면 D+1 안내와 심사 피드 전달
  await p.evaluate(x => localStorage.setItem('flowpoint-test-v6', x), snap); await p.reload(); await p.waitForTimeout(150); await closePrompt();
  // 한결푸드(상환 매출) 입금 확인 → 나중에(넘기지 않음) → 다음 날 "넘김 지연" 알림과 심사 이슈. 납품 확인 전이라 문서 7은 완료 불가
  await go('sales'); await p.locator('#saleRows li.tr-row', { hasText: '한결푸드' }).filter({ hasText: '상환 매출' }).locator('.tr-open').click(); await p.waitForTimeout(120);
  await p.click('#dlgBody [data-act="paid"]'); await p.waitForTimeout(150); await p.click('#dlgLeft [data-act="close"]'); await p.waitForTimeout(100);
  const fl = async () => { const x = await st(); return 'remind ' + (x.notifications.filter(n => n.type === 'remind' && n.step === 'fwdLate').map(n => n.date.slice(5) + ' ' + n.text).join(' / ') || '없음') + ' | issue ' + x.notifications.filter(n => n.type === 'issue' && n.kind === 'fwdLate').map(n => n.date.slice(5) + ' → ' + n.to).join(' / ') || '없음'; };
  const fl0 = await fl(); console.log('[부록] 입금 확인 당일:', fl0);
  expect('입금 확인 당일에는 넘김 지연 알림·이슈 없음', fl0.startsWith('remind 없음') && !fl0.includes('→'), fl0);
  const d7b = await doc7(); console.log('[부록] doc7 before delivery:', d7b);
  expect('납품 확인 전 문서 7: 넘긴 합계 0원 · 납품 확인 후 완료', d7b.includes('넘긴 합계 0원') && d7b.includes('남은 금액 15,965,090원') && d7b.includes('납품 확인 후 완료'), d7b);
  await p.click('footer [data-shift="1"]'); await p.waitForTimeout(120);
  console.log('[부록] +1일 doc2 reminded:', !!(await st()).deals[0].docs[1].reminded, '| resign notifications', (await st()).notifications.filter(n => n.type === 'resign').length);
  { const x = await st(), rm = x.notifications.filter(n => n.type === 'remind' && n.step === 'fwdLate'), is = x.notifications.filter(n => n.type === 'issue' && n.kind === 'fwdLate'), t = await p.textContent('#toast');
    console.log('[부록] +1일 넘김 지연:', await fl(), '| toast', t);
    expect('다음 날 넘김 지연 리마인드 1건 (한결푸드 4,400,000원)', rm.length === 1 && rm[0].date === isoAt(1) && rm[0].text.startsWith('[넘김 지연] 한결푸드') && rm[0].text.includes('4,400,000원'), rm);
    expect('다음 날 넘김 지연 심사 이슈 → 276 심사역', is.length === 1 && is[0].date === isoAt(1) && is[0].to === '276 심사역' && t.includes('넘김 지연'), is); }
  await go('home'); const sg1 = await sigRows(); console.log('[부록] +1일 signals:', sg1);
  expect('홈 오늘 할 일 첫 줄: 한결푸드 매출 넘김 대기 [넘기기]', sg1.startsWith('한결푸드 매출 넘김 대기 · 1일째 · 440만원 [넘기기'), sg1);
  await role(); await go('review'); const fd1 = (await p.locator('#rvFeed .rv-feed li', { hasText: '넘김 지연' }).evaluateAll(ls => ls.map(l => l.innerText.replace(/\s+/g, ' ')))).join(' / ');
  console.log('[부록] +1일 feed:', fd1); await role();
  expect('심사 이슈 피드에 넘김 지연 1줄', /^주의 · 넘김 지연 .*276에 4,400,000원 아직 안 넘김/.test(fd1) && !fd1.includes(' / '), fd1);
  await p.click('footer [data-shift="1"]'); await p.waitForTimeout(120); await closePrompt();
  await go('deals');
  s = await st(); console.log('[부록] +2일 doc2 reminded:', !!s.deals[0].docs[1].reminded, '| resign', s.notifications.filter(n => n.type === 'resign').map(n => n.channel + ' ' + n.text).join(' / '), '| shown', await p.locator('#dlDetail .tag.warn', { hasText: '재알림 발송됨' }).count());
  // 넘기지 않음: 한결푸드 입금 예정일 11월 14일 + 7일 = 11월 21일(+12일)까지는 대기, 하루 더 지나면(+13일) 자동 연체 · 점수 반영
  const late = async () => { const x = await st(); return x.apps[0].outcome || '대기'; };
  await p.click('footer [data-shift="7"]'); await p.waitForTimeout(120); await closePrompt();
  console.log('[부록] +9일 (D+4):', await late());
  for (let k = 0; k < 3; k++){ await p.click('footer [data-shift="1"]'); await p.waitForTimeout(120); await closePrompt(); }
  await go('sales'); console.log('[부록] +12일 (D+7):', await late(), '| row', await saleRow('한결푸드'));
  expect('D+7(유예 마지막 날)까지는 연체 아님', (await late()) === '대기', await late());
  const scLate = (await st()).scoreLog.length;
  await p.click('footer [data-shift="1"]'); await p.waitForTimeout(150); await closePrompt();
  s = await st(); console.log('[부록] +13일 (D+8):', await late(), '| toast', await p.textContent('#toast'), '| 대성 650', s.purchases.find(x => x.qty === 650).status + ' late ' + s.purchases.find(x => x.qty === 650).repayLate, '| score', s.scoreLog.slice(scLate).map(l => l.target + ' ' + l.before + '→' + l.after + ' (' + l.why + ')').join(' / '));
  expect('D+8 자동 연체: outcome late · 매입 연체일 기록 · 점수 601→481', s.apps[0].outcome === 'late' && s.apps[0].outDate === isoAt(13) && s.purchases.find(x => x.qty === 650).repayLate === isoAt(13) &&
    s.scoreLog.slice(scLate).some(l => l.target === '우리 회사' && l.before === 601 && l.after === 481 && l.why.startsWith('플로우페이 연체')), s.scoreLog.slice(scLate));
  await go('sales'); console.log('[부록] late row:', (await p.locator('#saleRows li.tr-row', { hasText: '상환 매출' }).evaluateAll(ls => ls.map(l => l.innerText.replace(/\s+/g, ' ')))).join(' / '));
  await go('flowpay'); console.log('[부록] service progress late:', (await p.locator('#apps .fw').innerText()).replace(/\s+/g, ' '));
  await role(); console.log('[부록] reviewer:', await rvRow(), '| rvOut', await p.locator('#rvAfter li', { hasText: '대성원료' }).locator('[data-act="rvOut"]').count()); await role();
  await p.click('footer [data-shift="30"]'); await p.waitForTimeout(150); await closePrompt();
  await p.click('footer [data-shift="30"]'); await p.waitForTimeout(150); await closePrompt();
  s = await st();
  console.log('[부록] +73일 toast:', await p.textContent('#toast'), '| reminders:', await rem(), '| issues:', s.notifications.filter(n => n.type === 'issue').map(n => n.step + ' → ' + n.to + ' (' + n.channel + ')').join(', '));
  await go('calendar'); console.log('[부록] +73일 timeline:', await tl());
  await go('home'); console.log('[부록] +73일 signals:', await p.textContent('#sigH'), '|', await sigRows());
  // 같은 날짜에서 다시 그려도 알림이 늘지 않음 (한 번만 기록)
  const nBefore = (await st()).notifications.length; await p.reload(); await p.waitForTimeout(150); await closePrompt();
  console.log('[부록] idempotent after reload:', (await st()).notifications.length === nBefore);
  // 연체 뒤에도 넘길 수 있음: 늦게라도 거래 문서를 화면에서 차례로 마치고(매입처 링크 서명·세금계산서 → 심사역 대금 지급·고객사 세금계산서 → 대표 납품 확인)
  // 한결푸드·그린마켓을 넘기면 "연체 후 완납"
  expect('연체 후 넘김 전: 납품 확인 전이라 문서 7은 완료 불가', (await docSt()) === 'done sent wait wait wait wait wait', await docSt());
  await go('deals'); await supplierLink(false);
  await role(); await go('deals');
  await p.click('#dlDetail [data-act="dlPay"]'); await p.waitForTimeout(120);
  await p.click('#dlDetail [data-act="dlIssue"]'); await p.waitForTimeout(120);
  await role(); await go('deals'); await deliver(false);
  console.log('[부록] 연체 뒤 납품 확인(화면에서):', await docSt(), '| outcome', await late());
  expect('연체 뒤 납품 확인까지 화면에서 마침 (문서 1~6 완료, 7 진행)', (await docSt()) === 'done done done done done done due' && (await late()) === 'late', await docSt());
  const used = async () => (await st()).purchases.filter(x => x.status === 'financed').reduce((t, x) => t + Math.round(x.qty * x.price * 1.1), 0); const usedLate = await used();
  const scL = (await st()).scoreLog.length;
  await go('sales'); await p.click('#saleRows [data-act="fwd"]'); await p.waitForTimeout(150); await p.click('#dlgFoot [data-act="fwdDo"]'); await p.waitForTimeout(150);
  console.log('[부록] 연체 뒤 넘김 1:', await fw(), '| toast', await p.textContent('#toast'));
  await clickRow('saleRows', '1,241만원', 'paid'); await p.waitForTimeout(100);
  if (await dlgOpen()) { await p.click('#dlgFoot [data-act="fwdDo"]'); await p.waitForTimeout(150); }
  s = await st(); const a0 = s.apps[0];
  console.log('[부록] 연체 뒤 넘김 2:', await fw(), '| lateRepaid', a0.lateRepaid, '| toast', await p.textContent('#toast'));
  console.log('[부록] 연체 후 완납: 대성 650', s.purchases.find(x => x.qty === 650).status, '| deal', s.deals[0].status, '| score', s.scoreLog.slice(scL).filter(l => l.target === '우리 회사').map(l => l.before + '→' + l.after + ' (' + l.why + ')').join(' / '), '| thanks', s.notifications.filter(n => n.type === 'thanks').map(n => n.text).join(' / '));
  console.log('[부록] 연체 후 완납 한도 사용 중(상환 전 매입 합계):', usedLate, '→', await used());
  expect('연체 후 완납: outcome late 유지 · lateRepaid 기록 · 매입 상환 완료 · 거래 완료 · 한도 사용분 풀림', a0.outcome === 'late' && a0.lateRepaid === isoAt(73) && (a0.fwd || []).reduce((t, f) => t + f.amt, 0) === 15965090 &&
    s.purchases.find(x => x.qty === 650).status === 'repaid' && s.deals[0].status === 'done' && usedLate > 0 && (await used()) === 0, { outcome: a0.outcome, lateRepaid: a0.lateRepaid, deal: s.deals[0].status });
  expect('연체 후 완납 점수 기록과 감사 메일', s.scoreLog.slice(scL).some(l => l.target === '우리 회사' && l.why.startsWith('플로우페이 연체 후 완납') && l.after > l.before) && s.notifications.some(n => n.type === 'thanks' && n.text.includes('연체 후 완납')), s.scoreLog.slice(scL));
  await go('flowpay'); const spL = (await p.locator('#apps .fw').innerText()).replace(/\s+/g, ' ');
  console.log('[부록] service progress 연체 후 완납:', spL);
  expect('서비스 진행: 연체 후 완납 100%', spL.includes('연체 후 완납 100%'), spL);
  await go('score'); await p.click('#scSeg [data-sc="me"]'); await p.waitForTimeout(100);
  console.log('[부록] 점수 상환 이력:', await p.evaluate(() => { const r = [...document.querySelectorAll('#scMe .why li, #scMe li')].map(l => l.textContent).find(t => t.includes('상환 이력')); return r || '(상위 3개 밖)'; }), '|', await p.evaluate(() => { const S = JSON.parse(localStorage.getItem('flowpoint-test-v6')); return S.apps[0].outcome + ' + lateRepaid ' + S.apps[0].lateRepaid; }));
  await role(); console.log('[부록] reviewer 연체 후 완납:', await rvRow()); await role();
  const d7L = await doc7(); console.log('[부록] doc7 연체 후 완납:', d7L);
  expect('문서 7 미리보기(연체 후 완납): 두 건 모두 넘김 · 남은 0원', d7L.includes('한결푸드 ' + mdAt(73) + ' 넘김 4,400,000') && d7L.includes('그린마켓 ' + mdAt(73) + ' 넘김 11,565,090') && d7L.includes('넘긴 합계 15,965,090원') && d7L.includes('남은 금액 0원') && d7L.includes('연체 후 완납'), d7L);

  // 16. 처음부터 다시 → 날짜·역할·기록 초기화
  await p.click('#resetBtn'); await p.waitForTimeout(150); await closePrompt();
  s = await st(); console.log('after reset: role', s.role, 'dayOffset', s.dayOffset, 'apps', s.apps.length, 'log', s.scoreLog.length, 'deals', s.deals.length, 'hash', await p.evaluate(() => location.hash), '|', await day());
  // 고객(대표) 역할에서 #review 직접 접근 차단
  await go('review'); console.log('ceo #review →', await p.evaluate(() => location.hash));
  console.log('errors:', errs.length ? errs : 'none');
  expect('페이지 오류 없음', !errs.length, errs);
  await b.close();
  console.log(fails.length ? `checks: ${fails.length} failed — ${fails.join(' / ')}` : 'checks: all passed');
  if (fails.length) process.exit(1);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
