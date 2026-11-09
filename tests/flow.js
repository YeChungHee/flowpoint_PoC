// 전체 시나리오 한 바퀴: 수집함 승인 → 브라이트몰 입금 → 한결푸드 세금계산서 → 플로우페이 신청 → 거래 상대 확인 → 심사(AI 보고서) 승인
// → 전자서명(거래 문서) → 매입처 링크 → 대금 지급·판매 세금계산서 → 납품 확인 → 날짜 이동(리마인드) → 결제 완료(감사 메일)
// → 유동화(채무자 통지·연체) → 이의 제기 → 이슈 피드 조치 → (부록: 48시간 재알림·D+1 미입금) → 초기화
// 사용법: node tests/flow.js /절대/경로/index.html [캡처 저장 폴더]  (캡처: 1280×900, 2배 해상도, 안내서 docs/img 번호)
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
  const clickRow = async (tbody, text, act) => { const row = p.locator(`#${tbody} tr`, { hasText: text }); await row.locator(`[data-act="${act}"]`).first().click(); await p.waitForTimeout(120); };
  const sigRows = async () => (await p.locator('#sigBox .sig-list li').evaluateAll(ls => ls.map(l => l.querySelector('.tag') ? l.querySelector('.tag').textContent + ' ' + l.querySelector('.sig-d').textContent + ' [' + l.querySelector('.gl-acts button').textContent + ']' : l.textContent))).join(' / ');
  const docSt = async () => (await st()).deals[0].docs.map(x => x.status).join(' ');
  const tl = async () => (await p.locator('#calUp .rm-card').first().locator('.rm-tl li').evaluateAll(ls => ls.map(l => l.querySelector('b').textContent + ' ' + l.querySelector('.tag').textContent))).join(' / ');
  const rem = async () => (await st()).notifications.filter(n => n.type === 'remind').map(n => n.step + '@' + n.date.slice(5)).join(', ');
  const feedTags = async () => (await p.locator('#rvFeed .rv-feed .flags .tag:first-child').allTextContents());
  const day = async () => (await p.textContent('#dayLabel')).trim();

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
  await go('sales'); await p.locator('#saleRows tr', { hasText: '연체' }).first().evaluate(e => e.scrollIntoView({ block: 'center' })); await shot('03-sales-overdue');
  await clickRow('saleRows', '브라이트몰', 'paid');
  const before = (await st()).sales.filter(x => x.party === '한결푸드' && x.tax !== 'issued').length;
  await p.locator('#saleRows tr', { hasText: '발행 기한 경과' }).first().locator('[data-act="tax"]').click(); await p.waitForTimeout(120);
  console.log('한결 미발행', before, '→', (await st()).sales.filter(x => x.party === '한결푸드' && x.tax !== 'issued').length);
  // 수집함에서 방금 등록한 오렌지유통 매출도 세금계산서 발행 (뒤에서 유동화 대상)
  await p.locator('#saleRows tr', { hasText: '오렌지유통' }).locator('[data-act="tax"]').first().evaluate(e => e.click()); await p.waitForTimeout(120);
  console.log('오렌지유통(수집함) tax:', (await st()).sales.filter(x => x.party === '오렌지유통').map(x => x.due.slice(5) + ' ' + x.tax).join(' / '));
  console.log('LOG after 1-3:\n  ' + (await log()).join('\n  '));
  await go('score'); await p.click('#scSeg [data-sc="me"]'); await p.waitForTimeout(120); await into('#scLog', 112); await shot('04-score-log');

  // 4. 플로우페이(구매 대행형) 신청: 대성원료 650개 매입, 결제 재원으로 그린마켓 미발행 매출 연결
  await go('orders');
  await p.locator('#orderRows tr', { hasText: '650개' }).locator('[data-act="finance"]').click(); await p.waitForTimeout(150);
  await next(); // ① 매입 확인 → ② 결제 재원(매출) 연결
  await p.locator('dialog label.check', { hasText: '그린마켓' }).locator('input').check(); await p.waitForTimeout(150);
  await next(); // ② → ③ 서류 확인
  console.log('step3 button:', await p.textContent('#dlgFoot [data-act="stepNext"]'), '| need:', (await p.locator('dialog [data-act="upload"][data-ctx="apply"]:not(:has-text("미리"))').evaluateAll(bs => bs.map(x => x.closest('.docrow').firstChild.firstChild.textContent.trim()))).join(' / '));
  await shot('05-apply-docs');
  while (await p.locator('dialog [data-act="upload"][data-ctx="apply"]:not(:has-text("미리"))').count()) { await p.locator('dialog [data-act="upload"][data-ctx="apply"]:not(:has-text("미리"))').first().click(); await p.waitForTimeout(120); }
  await next(); // ③ → ④ 납품액·결제일 확인 후 신청
  console.log('step4 tier:', (await p.locator('#tierSeg [aria-pressed="true"]').textContent()), '| table:', (await p.locator('dialog .stmt tbody tr').allTextContents()).join(' / '));
  console.log('step4 kv:', (await p.locator('dialog dl.kv').last().textContent()).replace(/\s+/g, ' '));
  await shot('06-apply-price');
  await p.click('dialog [data-act="submitApply"]'); await p.waitForTimeout(150);
  s = await st(); console.log('app status after submit:', s.apps.map(a => a.status));
  console.log('app price:', s.apps.map(a => `tier ${a.tier} rate ${a.rate} sale ${a.saleSupply}+${a.saleVat}=${a.saleTotal} pay ${a.payDate} mileage ${a.mileage}`).join(''));
  // 5. 거래 상대 확인 (미발행 매출을 연결했기 때문)
  await go('flowpay'); await into('#apps'); await shot('07-confirm-wait');
  await p.click('[data-act="cfm"]'); await p.waitForTimeout(120);
  s = await st(); console.log('after confirm:', s.apps.map(a => a.status));

  // 6. 심사역 전환 → 심사 대기(AI 검토 보고서 예시) → 사유 고르고 승인
  await role();
  console.log('hash after role:', await p.evaluate(() => location.hash), '| review tab visible:', await p.isVisible('header nav a[data-v="review"]'));
  console.log('flags:', (await p.locator('#rvQueue .flags .tag').allTextContents()).join(' / '));
  console.log('portfolio:', (await p.locator('.pf-tbl tbody tr').evaluateAll(rs => rs.map(r => r.cells[0].querySelector('button').textContent + (r.querySelector('.tag.mute') ? '(예시)' : '') + ' ' + r.cells[6].textContent))).join(' / '));
  console.log('feed:', (await p.locator('#rvFeed [data-act="rvFilter"]').allTextContents()).join(' / '), '|', (await feedTags()).join(' / '));
  const ai = p.locator('#rvQueue .ai-rep').first(), aiTxt = await ai.innerText();
  console.log('ai report: open', await ai.evaluate(d => d.open), '|', (await ai.locator('summary').innerText()).replace(/\s+/g, ' '), '|', (await ai.locator('h4').allTextContents()).join(' / '));
  console.log('ai phrases:', ['결제 재원', '최근 30일', '최근 90일', '규칙 기반 요약(AI 연동 예정)'].map(k => k + ' ' + aiTxt.includes(k)).join(' | '), '| risks', await ai.locator('.ai-risk li').count(), '| links', await ai.locator('.ai-risk li button').count(), '| checks', await ai.locator('.ai-ul').last().locator('li').count());
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
  await p.click('#dlDetail [data-act="dlLink"]'); await p.waitForTimeout(150);
  console.log('link view:', (await p.evaluate(() => location.hash)).replace(/\/.*/, '/…'), '| sidebar', await p.isVisible('#side'), '| footer', await p.isVisible('footer'), '|', await p.textContent('#lkBody h1'), '| doc2', (await st()).deals[0].docs[1].status);
  await p.click('#lkBody [data-act="lkNext"]'); await p.waitForTimeout(100);
  console.log('link sign disabled before agree:', await p.isDisabled('#lkSignBtn'));
  await p.check('#lkAgree'); await p.waitForTimeout(80); await top(); await shot('10-supplier-link');
  await p.click('#lkSignBtn'); await p.waitForTimeout(120);
  await p.check('#lkBody input[name="lkTax"][value="reverse"]'); await p.waitForTimeout(80);
  await p.click('#lkBody [data-act="lkTaxDo"]'); await p.waitForTimeout(120);
  console.log('link done:', await p.textContent('#lkBody .lk-done h2'), '| docs', await docSt(), '| method', (await st()).deals[0].docs[2].method);
  await p.click('#lkBody .lk-back a'); await p.waitForTimeout(150);

  // 9. 심사역(276 운영): 납품 확인 전에는 상환 완료 막힘 → 대금 지급 · 고객사 세금계산서 발행
  await role();
  console.log('repaid before delivery: disabled', await p.isDisabled('#rvAfter [data-act="rvOut"][data-r="repaid"]'), '|', await p.textContent('#rvAfter small.alert'));
  await go('deals');
  await p.click('#dlDetail [data-act="dlPay"]'); await p.waitForTimeout(120);
  await p.click('#dlDetail [data-act="dlIssue"]'); await p.waitForTimeout(120);
  console.log('after pay + issue:', await docSt());

  // 10. 고객(대표): 납품 확인 (거래명세서 서명 · 입고 사진 · 입금일 확인)
  await role(); await go('deals');
  await p.click('#dlDetail [data-act="dlDeliver"]'); await p.waitForTimeout(150);
  console.log('delivery submit before:', await p.textContent('#dlgFoot [data-act="dlvSubmit"]'));
  await p.check('#dlvAgree'); await p.waitForTimeout(80); await p.click('#dlvSignBtn'); await p.waitForTimeout(80);
  // 큰 사진(2400×1800: 창고 바닥과 상자 그림 + 잡음)을 만들어 올리면 800px 이하·150KB 이하로 줄여 저장
  const png = await p.evaluate(() => { const c = document.createElement('canvas'); c.width = 2400; c.height = 1800; const g = c.getContext('2d');
    const bg = g.createLinearGradient(0, 0, 0, 1800); bg.addColorStop(0, '#d9dde2'); bg.addColorStop(1, '#8f969e'); g.fillStyle = bg; g.fillRect(0, 0, 2400, 1800);
    [[300, 700, 700, 600], [1050, 800, 650, 500], [1300, 380, 560, 420], [500, 300, 520, 400], [1750, 900, 450, 400]].forEach(([x, y, w, h], i) => { g.fillStyle = i % 2 ? '#b98a55' : '#c99b62'; g.fillRect(x, y, w, h); g.fillStyle = '#e8d3a8'; g.fillRect(x + w / 2 - 40, y, 80, h); });
    const im = g.getImageData(0, 0, 2400, 1800); let r = 7; for (let i = 0; i < im.data.length; i += 4){ r = (r * 1103515245 + 12345) & 0x7fffffff; const n = (r & 63) - 32; im.data[i] += n; im.data[i + 1] += n; im.data[i + 2] += n; } g.putImageData(im, 0, 0);
    return c.toDataURL('image/png').split(',')[1]; });
  await p.setInputFiles('#dlvPhoto', { name: '입고.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await p.waitForSelector('dialog .dlv-thumb'); await p.waitForTimeout(100);
  const thumb = await p.evaluate(() => { const i = document.querySelector('dialog .dlv-thumb'); return { w: i.naturalWidth, h: i.naturalHeight, kb: Math.round(i.src.length / 1024) }; });
  await p.check('#dlvPay'); await p.waitForTimeout(80);
  console.log('photo:', Math.round(png.length * 0.75 / 1024) + 'KB →', thumb.w + '×' + thumb.h, thumb.kb + 'KB dataURL | submit:', await p.textContent('#dlgFoot [data-act="dlvSubmit"]'));
  await shot('11-delivery');
  await p.click('#dlgFoot [data-act="dlvSubmit"]'); await p.waitForTimeout(150);
  s = await st(); console.log('after delivery:', await docSt(), '| photo saved', s.deals[0].photo.length <= 150 * 1024);

  // 11. 날짜 이동(테스트): +30일 → D-30 안내 보냄, +7일 → 아직 D-7 전 (결제일 12월 26일)
  console.log('reminders before:', await rem());
  await p.click('footer [data-shift="30"]'); await p.waitForTimeout(150);
  console.log('+30일:', await day(), '| toast:', await p.textContent('#toast'), '| reminders:', await rem());
  await p.click('footer [data-shift="7"]'); await p.waitForTimeout(150);
  console.log('+37일:', await day(), '| reminders:', await rem());
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

  // 11-1. 그 사이 입금 예정일이 지난 매출은 연체로 바뀜 → 입금 확인으로 정리 (테스트: 그동안 입금됐다고 가정)
  await go('flowpay'); const scMove = (await p.textContent('#score')).trim(), limMove = (await p.textContent('#limitNote')).replace(/\s+/g, ' ').slice(0, 24);
  await go('sales');
  const odParties = await p.locator('#saleRows tr', { hasText: '연체' }).evaluateAll(rs => rs.map(r => r.querySelector('b, td').textContent.trim()));
  while (await p.locator('#saleRows tr', { hasText: '연체' }).count()) { await p.locator('#saleRows tr', { hasText: '연체' }).first().locator('[data-act="paid"]').evaluate(e => e.click()); await p.waitForTimeout(100); }
  await go('flowpay');
  console.log('overdue after move:', odParties.length + '건', '| score', scMove, '(' + limMove + ') →', (await p.textContent('#score')).trim(), '|', (await p.textContent('#limitNote')).replace(/\s+/g, ' ').slice(0, 24));

  // 12. 심사역 → 결제 완료 (고객사가 결제일에 납품액을 276에 입금) → 감사 메일
  await role();
  const cashRepay = (await st()).cash;
  await p.click('#rvAfter [data-act="rvOut"][data-r="repaid"]'); await p.waitForTimeout(120);
  s = await st(); console.log('outcome:', s.apps.map(a => a.outcome), '| 대성 650 status:', s.purchases.find(x => x.qty === 650).status, '| cash', s.cash - cashRepay);
  console.log('deal after repaid:', await docSt(), '|', s.deals[0].status);
  const th = s.notifications.find(n => n.type === 'thanks');
  console.log('thanks:', th ? th.channel + ' · ' + th.to + ' · score ' + th.scoreBefore + '→' + th.scoreAfter + ' · limit ' + th.limBefore + '→' + th.limAfter : 'none');
  await go('deals'); await p.click('#dlDetail [data-act="thanksOpen"]'); await p.waitForTimeout(150);
  console.log('thanks preview:', await p.textContent('#dlgTitle'), '|', await p.textContent('dialog .mail-h .subj'), '|', (await p.locator('dialog .mail-fig > div').allInnerTexts()).map(t => t.replace(/\s+/g, ' ')).join(' / '));
  await shot('13-thanks-mail');
  await p.click('#dlgLeft [data-act="close"]'); await p.waitForTimeout(100);

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
  await p.click('footer [data-shift="1"]'); await p.waitForTimeout(120);
  console.log('[부록] +1일 doc2 reminded:', !!(await st()).deals[0].docs[1].reminded, '| resign notifications', (await st()).notifications.filter(n => n.type === 'resign').length);
  await p.click('footer [data-shift="1"]'); await p.waitForTimeout(120); await closePrompt();
  await go('deals');
  s = await st(); console.log('[부록] +2일 doc2 reminded:', !!s.deals[0].docs[1].reminded, '| resign', s.notifications.filter(n => n.type === 'resign').map(n => n.channel + ' ' + n.text).join(' / '), '| shown', await p.locator('#dlDetail .tag.warn', { hasText: '재알림 발송됨' }).count());
  await p.click('footer [data-shift="30"]'); await p.waitForTimeout(150); await closePrompt();
  await p.click('footer [data-shift="30"]'); await p.waitForTimeout(150); await closePrompt();
  s = await st();
  console.log('[부록] +62일 toast:', await p.textContent('#toast'), '| reminders:', await rem(), '| issues:', s.notifications.filter(n => n.type === 'issue').map(n => n.step + ' → ' + n.to + ' (' + n.channel + ')').join(', '));
  await go('calendar'); console.log('[부록] +62일 timeline:', await tl());
  await go('home'); console.log('[부록] +62일 signals:', await p.textContent('#sigH'), '|', await sigRows());
  // 같은 날짜에서 다시 그려도 알림이 늘지 않음 (한 번만 기록)
  const nBefore = (await st()).notifications.length; await p.reload(); await p.waitForTimeout(150); await closePrompt();
  console.log('[부록] idempotent after reload:', (await st()).notifications.length === nBefore);

  // 16. 처음부터 다시 → 날짜·역할·기록 초기화
  await p.click('#resetBtn'); await p.waitForTimeout(150); await closePrompt();
  s = await st(); console.log('after reset: role', s.role, 'dayOffset', s.dayOffset, 'apps', s.apps.length, 'log', s.scoreLog.length, 'deals', s.deals.length, 'hash', await p.evaluate(() => location.hash), '|', await day());
  // 고객(대표) 역할에서 #review 직접 접근 차단
  await go('review'); console.log('ceo #review →', await p.evaluate(() => location.hash));
  console.log('errors:', errs.length ? errs : 'none');
  await b.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
