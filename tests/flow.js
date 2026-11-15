// 전체 시나리오 한 바퀴: 수집함 승인 → 브라이트몰 입금 → 한결푸드 세금계산서 → 플로우페이 신청 → 거래 상대 확인 → 심사(AI 보고서) 승인
// → 전자서명(거래 문서) → 매입처 링크 → 대금 지급·판매 세금계산서 → 납품 확인 → 묶은 매출 입금 확인 → 276에 넘기기(나중에 → 줄의 넘기기)
// → 날짜 이동(리마인드) → 나머지 묶은 매출 입금 확인·넘기기 → 자동 상환 완료(점수·감사 메일) → 유동화(채무자 통지·연체) → 이의 제기 → 이슈 피드 조치
// → (부록: 48시간 재알림 · 다음 날 넘김 지연 · 넘기지 않고 입금 예정일 + 7일 지나 자동 연체 · 늦게 납품 확인 후 넘겨 연체 후 완납) → 초기화
// 사용법: node tests/flow.js /절대/경로/index.html [캡처 저장 폴더]  (캡처: 1280×900, 2배 해상도, 안내서 docs/img 번호)
// 숫자·상태 확인은 expect()로 점검하고, 하나라도 틀리거나 페이지 오류가 있으면 종료 코드 1
const { chromium } = require('playwright');
const SHOT = process.argv[3];
const NET_ERR = /^(Failed to load resource|Failed to decode downloaded font|OTS parsing error|Access to font at)/;  // 글꼴·네트워크 요청 실패는 페이지 오류가 아님 (pageerror·스크립트 오류만 셈)
// BLOCK_FONTS=1: 글꼴 배포처(jsDelivr) 요청을 모두 막고 실행 → 인터넷 없이도 대체 글꼴(맑은 고딕·애플 고딕·시스템 글꼴)로 화면·점검이 그대로인지 확인
const BLOCK_FONTS = !!process.env.BLOCK_FONTS;
(async () => {
  const b = await chromium.launch();
  const newCtx = async o => { const c = await b.newContext(o); if (BLOCK_FONTS) await c.route(/cdn\.jsdelivr\.net/, r => r.abort()); return c; };
  const ctx = await newCtx({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 }); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type()==='error' && !NET_ERR.test(m.text())) errs.push(m.text()); });
  await p.goto('file://' + process.argv[2] + '#home'); await p.evaluate(() => localStorage.clear()); await p.reload();
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
  const manT0 = x => Math.round(x.qty * x.price * 1.1 / 10000).toLocaleString('ko-KR') + '만원';
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

  // 00. 첫 화면(고객 소개 페이지): 새 기록 + 주소에 화면 표시 없음 → #intro. 숫자는 앱과 같음, 무료로 시작하기 → 앱 홈, 다시 열어도 앱
  for (const W of [1280, 390]) {
    const c0 = await newCtx({ viewport: { width: W, height: W === 390 ? 844 : 900 }, deviceScaleFactor: W === 1280 ? 2 : 1 }), q = await c0.newPage();
    q.on('pageerror', e => errs.push(e.message)); q.on('console', m => { if (m.type() === 'error' && !NET_ERR.test(m.text())) errs.push(m.text()); });
    const qgo = async h => { await q.evaluate(x => location.hash = x, h); await q.waitForTimeout(120); };
    // 캡처(1280만): 안내서 0장 소개 페이지 · 심사역 소개 · 심사 대기 빈 상태
    const qshot = async n => { if (!SHOT || W !== 1280) return; await q.mouse.move(0, 899); await q.evaluate(() => { const t = document.getElementById('toast'); if (t) t.classList.remove('show'); }); await q.waitForTimeout(250); await q.screenshot({ path: SHOT + '/' + n + '.png', fullPage: false }); };
    const qClose = async () => { if (await q.evaluate(() => document.getElementById('dlg').open)) { await q.click('#dlgLeft [data-act="close"]'); await q.waitForTimeout(100); } };
    const S0 = () => q.evaluate(() => JSON.parse(localStorage.getItem('flowpoint-test-v6')));
    await q.goto('file://' + process.argv[2]); await q.evaluate(() => localStorage.clear()); await q.reload(); await q.waitForTimeout(200);
    const i0 = await q.evaluate(() => ({ view: document.querySelector('.view.on').id, hash: location.hash, side: getComputedStyle(document.getElementById('side')).display, tab: getComputedStyle(document.getElementById('tabbar')).display,
      foot: getComputedStyle(document.querySelector('body > footer')).display, h1: [...document.querySelectorAll('.view.on h1')].map(h => h.textContent.replace(/\s+/g, ' ').trim()), nh1: document.querySelectorAll('.view.on h1').length,
      h2: [...document.querySelectorAll('#v-intro h2')].map(h => h.textContent.replace(/\s+/g, ' ').trim()), prompt: document.getElementById('dlg').open, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth,
      note: document.querySelector('#v-intro .it-foot').textContent.includes('테스트 페이지') }));
    console.log('intro ' + W + ':', JSON.stringify(i0));
    expect('첫 화면 ' + W + ': 새 기록 · 해시 없음 → #intro, 사이드바·탭 바·테스트 막대 없음, 승인 창 없음', i0.view === 'v-intro' && i0.hash === '' && i0.side === 'none' && i0.tab === 'none' && i0.foot === 'none' && !i0.prompt && i0.note, i0);
    expect('첫 화면 ' + W + ': h1 1개 "매입과 매출이 자금이 되는 곳." + 구역마다 h2', i0.nh1 === 1 && i0.h1[0] === '매입과 매출이 자금이 되는 곳.' && i0.h2.length === 5, i0);
    expect('첫 화면 ' + W + ': 가로 스크롤 없음', i0.sw <= i0.cw, i0);
    // 로고 = 시안 14a 별자리 마크(64×64 · 선 46 · 점 37 · 가운데 점 브랜드 파랑) + "Flowpoint" 글자, 탭 아이콘도 같은 마크
    const lg0 = await q.evaluate(() => { const m = document.querySelector('#v-intro .it-brand .mark.logo'), svg = m.querySelector('svg'), fav = document.querySelector('link[rel="icon"]').getAttribute('href');
      return { vb: svg.getAttribute('viewBox'), lines: svg.querySelectorAll('line').length, dots: svg.querySelectorAll('circle').length, blue: svg.querySelectorAll('circle[fill="#2D54D6"]').length, word: m.querySelector('.lg-word').textContent, label: m.getAttribute('aria-label'),
        favVb: decodeURIComponent(fav).includes('viewBox="0 0 64 64"'), favDots: (decodeURIComponent(fav).match(/<circle/g) || []).length }; });
    console.log('logo ' + W + ':', JSON.stringify(lg0));
    expect('로고 ' + W + ' = 14a 별자리 마크 (viewBox 0 0 64 64 · 선 46 · 점 37 · "Flowpoint") · 탭 아이콘도 14a', lg0.vb === '0 0 64 64' && lg0.lines === 46 && lg0.dots === 37 && lg0.blue >= 1 && lg0.word === 'Flowpoint' && lg0.label === 'Flowpoint 플로우포인트' && lg0.favVb && lg0.favDots === 37, lg0);
    // 글꼴: Pretendard(jsDelivr) → 받지 못하면 대체 글꼴. 글꼴을 막은 실행에서는 Pretendard 0개 · 글꼴 순서는 그대로 · 화면은 같은 점검을 통과
    const ft = await q.evaluate(async () => { await document.fonts.ready; const pf = [...document.fonts].filter(f => /Pretendard/.test(f.family));
      return { faces: pf.length, loaded: pf.filter(f => f.status === 'loaded').length,
        body: getComputedStyle(document.body).fontFamily, h1w: Math.round(document.querySelector('#v-intro h1').getBoundingClientRect().width) }; });
    console.log('font ' + W + (BLOCK_FONTS ? ' (글꼴 막음)' : '') + ':', JSON.stringify(ft));
    expect('글꼴 순서 ' + W + ': Pretendard Variable → 맑은 고딕 → 애플 고딕 → 시스템', /^"Pretendard Variable", Pretendard, "Malgun Gothic", "맑은 고딕", "Apple SD Gothic Neo", system-ui, sans-serif$/.test(ft.body) && ft.h1w > 100, ft);
    if (BLOCK_FONTS) expect('글꼴 막음 ' + W + ': Pretendard 못 받음(글꼴 0개) → 대체 글꼴로 표시 · 제목 보임', ft.faces === 0 && ft.loaded === 0 && ft.h1w > 100, ft);
    if (W === 1280) { await q.evaluate(() => window.scrollTo(0, 0)); await qshot('00-intro-top');
      await q.locator('#v-intro .it-score').evaluate(e => e.scrollIntoView({ block: 'start' })); await q.waitForTimeout(150); await qshot('00a-intro-score'); await q.evaluate(() => window.scrollTo(0, 0)); }
    const iv = await q.evaluate(() => ['itBal', 'itIn7', 'itScore', 'itScoreBig', 'itFp', 'itAr'].map(id => document.getElementById(id).textContent.trim()));
    const nRows = await q.locator('#itRows li').count();
    await q.click('#v-intro .it-acts [data-act="itConsult"]'); await q.waitForTimeout(80);
    const cTxt = await q.textContent('#toast');
    // 앱 숫자: 홈(잔고 · 플로우페이 가능 · 먼저 받기 가능) · 서비스 진행(점수) · 자금일보(7일 들어올 돈)
    await qgo('home'); await qClose();
    const hv = await q.evaluate(() => [document.querySelector('#hmCards .hm-bal .hm-val').textContent.trim(), document.getElementById('hmFp').textContent.trim(), document.getElementById('hmAr').textContent.trim()]);
    await qgo('flowpay'); const sc = (await q.textContent('#score')).trim();
    await qgo('report'); const in7 = await q.evaluate(() => [...document.querySelectorAll('#rpCards .rp-card')].find(c => c.textContent.includes('7일 들어올 돈')).querySelector('.rp-val').textContent.trim());
    console.log('intro numbers:', iv.join(' / '), '| app', [hv[0], in7, sc, hv[1], hv[2]].join(' / '), '| rows', nRows, '| 상담', cTxt);
    expect('소개 숫자 = 앱 숫자 ' + W + ' (잔고 · 7일 들어올 돈 · 점수 · 플로우페이 가능 · 먼저 받기 가능)', iv[0] === hv[0] && iv[1] === in7 && iv[2] === sc && iv[3] === sc && iv[4] === hv[1] && iv[5] === hv[2] && nRows >= 2 && nRows <= 3, { iv, hv, sc, in7, nRows });
    expect('도입 상담 신청 → 테스트 안내', cTxt === '테스트 페이지 · 상담 신청 연동 예정', cTxt);
    // 다른 화면을 보고 와도 아직 들어가지 않음 → 해시 없이 다시 열면 소개 페이지. 무료로 시작하기 → #home, entered 저장, 다시 열면 앱 홈
    await q.goto('file://' + process.argv[2]); await q.waitForTimeout(200);
    const back0 = await q.evaluate(() => document.querySelector('.view.on').id);
    await q.click('#v-intro .it-nav [data-act="itStart"]'); await q.waitForTimeout(200);
    const st1 = await q.evaluate(() => [location.hash, document.querySelector('.view.on').id, getComputedStyle(document.getElementById(innerWidth < 768 ? 'tabbar' : 'side')).display]), ent = (await S0()).entered;
    await qClose();
    await q.goto('file://' + process.argv[2]); await q.waitForTimeout(200);
    const re = await q.evaluate(() => [location.hash, document.querySelector('.view.on').id]); await qClose();
    console.log('start:', back0, '→', st1.join(' '), '| entered', ent, '| reload', re.join(' '));
    expect('무료로 시작하기 ' + W + ' → #home(앱 탐색 보임), 다시 열어도 앱 홈', back0 === 'v-intro' && st1[0] === '#home' && st1[1] === 'v-home' && st1[2] !== 'none' && ent === true && re[1] === 'v-home', { back0, st1, ent, re });
    // 소개 페이지로 돌아가기: 넓은 화면은 사이드바 로고, 휴대폰은 더보기의 "소개 페이지"
    if (W === 1280) await q.click('#side .side-brand a.mark');
    else { await q.click('#moreBtn'); await q.waitForTimeout(120); await q.click('#moreDlg a[href="#intro"]'); }
    await q.waitForTimeout(200);
    const lg = await q.evaluate(() => [location.hash, document.querySelector('.view.on').id, getComputedStyle(document.getElementById('side')).display, document.getElementById('moreDlg').open]);
    expect((W === 1280 ? '사이드바 로고' : '더보기 소개 페이지') + ' → #intro', lg[0] === '#intro' && lg[1] === 'v-intro' && lg[2] === 'none' && !lg[3], lg);
    // 심사역 메뉴 → #intro-review(심사역 소개, 시안 1b): h1 "판단은 사람이. 근거는 거래가." · 앱 탐색 없음 · 승인 창 없음 · 가로 스크롤 없음
    await q.click('#v-intro .it-menu a[href="#intro-review"]'); await q.waitForTimeout(150);
    const rvw = await q.evaluate(() => ({ hash: location.hash, view: document.querySelector('.view.on').id, h1: [...document.querySelectorAll('.view.on h1')].map(h => h.textContent.replace(/\s+/g, ' ').trim()),
      h2: [...document.querySelectorAll('#v-intro-review h2')].map(h => h.textContent.trim()), side: getComputedStyle(document.getElementById('side')).display, tab: getComputedStyle(document.getElementById('tabbar')).display,
      foot: getComputedStyle(document.querySelector('body > footer')).display, prompt: document.getElementById('dlg').open, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth,
      fill: [...document.querySelectorAll('#v-intro-review button.primary')].map(x => x.textContent.trim()) }));
    console.log('intro-review ' + W + ':', JSON.stringify(rvw));
    expect('심사역 메뉴 ' + W + ' → #intro-review, h1 1개 "판단은 사람이. 근거는 거래가." + h2 4개, 앱 탐색·승인 창 없음', rvw.hash === '#intro-review' && rvw.view === 'v-intro-review' && rvw.h1.length === 1 && rvw.h1[0] === '판단은 사람이. 근거는 거래가.' &&
      rvw.h2.length === 4 && rvw.side === 'none' && rvw.tab === 'none' && rvw.foot === 'none' && !rvw.prompt, rvw);
    expect('심사역 소개 ' + W + ': 채움 버튼 1개 "관리자 로그인 (테스트)" · 가로 스크롤 없음', rvw.fill.length === 1 && rvw.fill[0] === '관리자 로그인 (테스트)' && rvw.sw <= rvw.cw, rvw);
    // 미리보기 카드: 심사 대기 0건(새 기록) → 심사 화면의 고객사 포트폴리오 줄(이름 · 상태 · 사용 중 · 점수)과 같음
    const irRows = () => q.evaluate(() => ({ h: document.getElementById('irQH').textContent, meta: document.getElementById('irQMeta').textContent,
      head: [...document.querySelectorAll('#irQHead th')].map(t => t.textContent), rows: [...document.querySelectorAll('#irQRows tr')].map(r => [...r.cells].map(c => c.childNodes[0].textContent.trim()).join(' / ')) }));
    const ir0 = await irRows();
    await q.evaluate(() => window.scrollTo(0, 0)); await qshot('00b-intro-review');
    // 관리자 로그인 (테스트) → 심사역 역할 · entered 저장 · #review(심사 대기)
    await q.click('#v-intro-review [data-act="irLogin"]'); await q.waitForTimeout(250);
    await q.evaluate(() => window.scrollTo(0, 0)); await qshot('00c-review-empty');
    const lgn = await q.evaluate(() => [location.hash, document.querySelector('.view.on').id, document.body.classList.contains('lp'), document.getElementById('roleName').textContent, document.getElementById('dlg').open]), lgS = await S0();
    const rv0 = await q.evaluate(() => ({ title: document.getElementById('rvTitle').textContent, empty: (document.querySelector('#rvQueue .rv-empty-t') || {}).textContent, pf: [...document.querySelectorAll('.pf-tbl tbody tr')].map(r => [r.cells[0].querySelector('button').textContent, r.cells[6].textContent, r.cells[3].textContent, r.cells[1].querySelector('b').textContent].join(' / ')) }));
    console.log('intro-review preview:', JSON.stringify(ir0), '| #review', JSON.stringify(rv0), '| login', lgn.join(' '), lgS.role, lgS.entered);
    expect('심사역 소개 미리보기 ' + W + ' = 심사 화면 (심사 대기 0건 → 고객사 포트폴리오 줄 그대로)', ir0.h === '고객사 포트폴리오' && ir0.meta === '심사 대기 0건' && rv0.title === '심사 대기' && rv0.empty === '심사 대기 0건' && ir0.head.join() === '고객사,상태,서비스 이용,스코어' &&
      ir0.rows.length === rv0.pf.length && ir0.rows.join('|') === rv0.pf.join('|'), { ir0, rv0 });
    // 심사 대기 화면(시안 1c) 빈 상태: 새 시나리오는 대기 0건 → "심사 대기 0건" + 도움말 한 줄 + 포트폴리오 링크(누르면 포트폴리오 제목으로 포커스), 목록 표 없음(가짜 신청 없음)
    const e0 = await q.evaluate(() => ({ t: document.querySelector('#rvQueue .rv-empty-t').textContent, s: document.querySelector('#rvQueue .rv-empty-s').textContent, tbl: document.querySelectorAll('#rvQueue table').length,
      apps: JSON.parse(localStorage.getItem('flowpoint-test-v6')).apps.length, k: ['Amt', 'Avg', 'Mon'].map(x => document.getElementById('rvK' + x).textContent), seg: [...document.querySelectorAll('#rvSvc button')].map(b => b.textContent).join(','),
      kpis: document.querySelectorAll('#rvKpis .rv-kpi').length, tips: document.querySelectorAll('#rvKpis .itip').length, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth,
      side: (r => r ? Math.round(r.left) : null)(document.getElementById('rvFeedSec').getBoundingClientRect()), main: Math.round(document.querySelector('.rv-main').getBoundingClientRect().left) }));
    await q.click('#rvQueue [data-act="rvJump"]'); await q.waitForTimeout(150);
    const e0f = await q.evaluate(() => document.activeElement.id);
    console.log('review empty ' + W + ':', JSON.stringify(e0), '| link → focus', e0f);
    expect('심사 대기 빈 상태 ' + W + ': "심사 대기 0건" + 도움말 + 포트폴리오 링크(포커스 이동) · 표 없음 · 신청 0건 그대로', e0.t === '심사 대기 0건' && e0.s.length > 10 && !e0.tbl && e0.apps === 0 && e0f === 'pfH' && e0.seg === '전체 0,플로우페이 0,유동화 0', { e0, e0f });
    expect('심사 대기 숫자 ' + W + ' (새 시나리오): 카드 4개 · ⓘ 4개 · 대기 금액 0만원 · 평균 처리 시간 기록 없음 · 이번 달 처리 0건', e0.kpis === 4 && e0.tips === 4 && e0.k.join('|') === '0만원|기록 없음|0건', e0);
    expect('심사 대기 ' + W + ': 가로 스크롤 없음 · 이슈 피드는 ' + (W >= 1024 ? '오른쪽 칸' : '목록 아래'), e0.sw <= e0.cw && (W >= 1024 ? e0.side > e0.main + 300 : e0.side === e0.main), e0);
    expect('관리자 로그인 ' + W + ' → 심사역 · #review · 앱 탐색 보임 · entered=true · 승인 창 없음', lgn[0] === '#review' && lgn[1] === 'v-review' && !lgn[2] && lgn[3] === '심사역' && !lgn[4] && lgS.role === 'reviewer' && lgS.entered === true, { lgn, role: lgS.role, entered: lgS.entered });
    await qgo('sales'); await q.evaluate(() => document.getElementById('resetBtn').click()); await q.waitForTimeout(250);
    const rs = await q.evaluate(() => [location.hash, document.querySelector('.view.on').id]), rsS = await S0();
    await q.goto('file://' + process.argv[2]); await q.waitForTimeout(200);
    const rs2 = await q.evaluate(() => document.querySelector('.view.on').id);
    console.log('reset:', rs.join(' '), '| entered', rsS.entered, 'apps', rsS.apps.length, '| reopen', rs2);
    expect('처음부터 다시 → #home, entered=true, 다시 열어도 앱 홈', rs[0] === '#home' && rs[1] === 'v-home' && rsS.entered === true && rs2 === 'v-home', { rs, entered: rsS.entered, rs2 });
    // 예전 기록(entered 칸 없음) → 이미 쓰던 사람: 바로 앱 홈
    await q.evaluate(() => { const k = 'flowpoint-test-v6', s = JSON.parse(localStorage.getItem(k)); delete s.entered; localStorage.setItem(k, JSON.stringify(s)); });
    await q.goto('file://' + process.argv[2]); await q.waitForTimeout(200);
    const old = await q.evaluate(() => document.querySelector('.view.on').id);
    expect('예전 기록(entered 없음) → 앱 홈', old === 'v-home', old);
    // 새 기록으로 #intro-review를 바로 열어도 승인 창 없음 · 가로 스크롤 없음 · 아직 들어가지 않은 상태 유지
    await q.evaluate(() => localStorage.clear()); await q.goto('file://' + process.argv[2] + '#intro-review'); await q.reload(); await q.waitForTimeout(200);
    const dr = await q.evaluate(() => [document.querySelector('.view.on').id, document.getElementById('dlg').open, document.documentElement.scrollWidth <= document.documentElement.clientWidth]), drS = await S0();
    expect('새 기록 #intro-review 바로 열기 ' + W + ': 승인 창 없음 · 가로 스크롤 없음 · entered=false', dr[0] === 'v-intro-review' && !dr[1] && dr[2] && drS.entered === false, { dr, entered: drS.entered });
    await c0.close();
  }

  // 0. 시작: 접속 시 승인 창(이메일 발주 파일에서 읽은 2건) → 나중에
  console.log('approval prompt:', await p.evaluate(() => document.getElementById('dlg').open ? document.getElementById('dlgTitle').textContent : '(없음)'), '|', await day());
  await closePrompt();
  await go('home');
  console.log('signals:', await p.textContent('#sigH'), '|', await sigRows());
  await top(); await shot('01-home-signals');
  await go('flowpay');
  console.log('my score:', await p.textContent('#score'), '|', (await p.textContent('#limitNote')).replace(/\s+/g, ' '));

  // 0-0. 세금계산서 자동 수집·짝짓기 (시작 시나리오, 점검 뒤 원래 기록으로 되돌림)
  //   같은 거래처 + 같은 구분 + 합계 금액 같음 → 가장 오래된 열린 거래에 자동 연결(승인 항목 아님), 맞는 거래 없으면 새 거래 후보.
  //   계산서가 들어오기 전과 뒤의 한결푸드 352만원 줄, 다시 돌려도 두 번 붙지 않음, 매입 계산서 → 미래라벨 줄이 직접 결제로
  { const snap0 = await p.evaluate(() => localStorage.getItem('flowpoint-test-v6')), S0 = await st();
    const inv = S0.inbox.find(c => c.doc === 'tax' && c.party === '한결푸드'), ml = S0.inbox.find(c => c.doc === 'tax' && c.party === '미래라벨'), og = S0.inbox.find(c => c.doc === 'tax' && c.party === '오렌지유통');
    const hs = S0.sales.find(x => x.id === inv.refId), mp = S0.purchases.find(x => x.id === ml.refId);
    console.log('tax invoices:', S0.inbox.filter(c => c.doc).map(c => c.party + ' ' + c.amt + ' ' + c.status + (c.refId ? ' → ' + c.dealOn : '')).join(' / '), '| log', S0.scoreLog.map(l => l.target + ' ' + l.before + '→' + l.after + ' (' + l.why + ')').join(', '));
    expect('불러올 때 짝짓기: 한결푸드 352만원 → 기한 지난 미발행 매출(발행, 오늘), 미래라벨 198만원 → 납품 전 매입(계산서 받음), 오렌지유통 678만원 → 새 거래 후보',
      inv.status === 'linked' && hs && hs.party === '한결푸드' && hs.qty === 160 && hs.tax === 'issued' && hs.taxOn === isoAt(0) && hs.taxRef === inv.id && inv.wasLate === true &&
      ml.status === 'linked' && mp && mp.status === 'ordered' && mp.taxIn === 'received' && mp.delivery === 'before' && og.status === 'new' && !og.refId && og.flags.due === 'missing', { inv, og: og.status, mp });
    await go('inbox');
    const ibTxt = (await p.locator('#ibList').innerText()).replace(/\s+/g, ' ');
    expect('수집함: "자동 연결 · 한결푸드 352만원 계산서 · 연결됨" (승인 줄 아님) · 오렌지유통 "새 거래 후보"', /자동 연결 한결푸드 352만원 계산서 연결됨/.test(ibTxt) && (await p.locator('#ibList .ib-link').count()) === 2 &&
      (await p.locator('#ibList .ib-row', { hasText: '한결푸드' }).count()) === 0 && (await p.locator('#ibList .ib-row', { hasText: '새 거래 후보' }).filter({ hasText: '오렌지유통' }).count()) === 1, ibTxt.slice(0, 200));
    if (SHOT) { await top(); await shot('01e-inbox-link'); }
    // 한결푸드 352만원 줄: 계산서가 들어오기 전(기한 지남 · 계산서 발행 버튼) → 들어온 뒤(발행 · 버튼 없음, 입금 완료라 완료로 접힘)
    const row352 = () => p.evaluate(id => { const l = [...document.querySelectorAll('#saleRows li.tr-row')].find(x => x.querySelector('.tr-open').dataset.id === id); const b = l.querySelector('button.small');
      return l.querySelector('.tr-st').innerText.replace(/\s+/g, ' ') + ' [' + (b ? b.dataset.act + ' ' + b.textContent : '없음') + ']' + (l.hidden ? ' 접힘' : ''); }, hs.id);
    const fresh = Object.assign({}, inv, { status: 'arrived' }); ['refId', 'dealOn', 'doneOn', 'wasLate'].forEach(k => delete fresh[k]);
    await p.evaluate(([id, sid]) => { const k = 'flowpoint-test-v6', s = JSON.parse(localStorage.getItem(k)); s.inbox = s.inbox.filter(x => x.id !== id); const x = s.sales.find(y => y.id === sid); x.tax = 'none'; delete x.taxOn; delete x.taxRef; s.scoreLog = []; localStorage.setItem(k, JSON.stringify(s)); }, [inv.id, hs.id]);
    await p.reload(); await p.waitForTimeout(150); await closePrompt(); await go('sales');
    const r0 = await row352();
    await p.evaluate(c => { const k = 'flowpoint-test-v6', s = JSON.parse(localStorage.getItem(k)); s.inbox.push(c); localStorage.setItem(k, JSON.stringify(s)); }, fresh);
    await p.reload(); await p.waitForTimeout(150); await closePrompt(); await go('sales');
    const r1 = await row352(), S1 = await st(), h1 = S1.sales.find(x => x.id === hs.id);
    await p.evaluate(id => { const l = [...document.querySelectorAll('#saleRows .tr-open')].find(b => b.dataset.id === id); l.click(); }, hs.id); await p.waitForTimeout(150);
    const dTax = (await p.locator('#dlgBody .dt-kv').innerText()).replace(/\s+/g, ' '); await p.click('#dlgLeft [data-act="close"]'); await p.waitForTimeout(100);
    console.log('한결푸드 352만원 줄: 계산서 전', r0, '→ 들어온 뒤', r1, '| 상세', dTax.match(/세금계산서 \S+ \S+/)[0], '| log', S1.scoreLog.map(l => l.target + ' ' + l.before + '→' + l.after + ' (' + l.why + ')').join(', '));
    expect('자동 연결이 한결푸드 352만원 줄을 바꿈: 계산서 기한 지남 [계산서 발행] → 계산서 발행(입금 완료) · 버튼 없음', r0 === '계산서 기한 지남 [tax 계산서 발행]' && r1 === '입금 완료 [없음] 접힘' && h1.tax === 'issued' && h1.taxOn === isoAt(0) && dTax.includes('세금계산서 발행 완료'), { r0, r1, dTax });
    // 다시 돌려도(다시 불러오기 2번 · 같은 계산서를 새로 들어온 것처럼 되돌려도) 두 번 붙지 않음
    const linkLog = s => s.scoreLog.filter(l => l.why.includes('자동 연결')).length;
    await p.reload(); await p.waitForTimeout(120); await p.reload(); await p.waitForTimeout(120); await closePrompt();
    await p.evaluate(id => { const k = 'flowpoint-test-v6', s = JSON.parse(localStorage.getItem(k)); s.inbox.find(x => x.id === id).status = 'arrived'; localStorage.setItem(k, JSON.stringify(s)); }, inv.id);
    await p.reload(); await p.waitForTimeout(150); await closePrompt();
    const S2 = await st(), i2 = S2.inbox.find(c => c.id === inv.id), linked2 = S2.sales.filter(x => x.taxRef === inv.id);
    console.log('re-run:', i2.status, '| 연결된 거래', linked2.length, '| 자동 연결 기록', linkLog(S1), '→', linkLog(S2), '| 한결 발행', S2.sales.filter(x => x.party === '한결푸드' && x.tax === 'issued').length, '| 후보', S2.inbox.filter(c => c.status === 'new').length);
    expect('다시 짝짓기를 돌려도 같은 계산서는 한 번만 연결 (같은 거래 · 기록 1건 · 새 후보 없음)', i2.status === 'linked' && i2.refId === hs.id && linked2.length === 1 && linkLog(S1) >= 1 && linkLog(S2) === linkLog(S1) &&
      S2.sales.filter(x => x.party === '한결푸드' && x.tax === 'issued').length === S1.sales.filter(x => x.party === '한결푸드' && x.tax === 'issued').length && S2.inbox.filter(c => c.status === 'new').length === S1.inbox.filter(c => c.status === 'new').length, { i2: i2.status, linked2: linked2.length, l1: linkLog(S1), l2: linkLog(S2) });
    // 매입 계산서(미래라벨 198만원 · 납품 전) → 계산서 받음 → 줄 버튼 직접 결제 (부족일 12월 1일 뒤 결제라 부족 해결 비교에는 원래 없음)
    await go('orders');
    const rMl = await p.evaluate(id => { const l = [...document.querySelectorAll('#orderRows li.tr-row')].find(x => x.querySelector('.tr-open').dataset.id === id); const b = l.querySelector('button.small'); return l.querySelector('.tr-st').innerText.replace(/\s+/g, ' ') + ' [' + (b ? b.dataset.act + ' ' + b.textContent : '없음') + ']'; }, mp.id);
    console.log('미래라벨 198만원(매입 계산서 받음):', rMl, '| 결제일', mp.due);
    expect('매입 계산서 자동 연결: 미래라벨 198만원 줄 납품 전 · 계산서 받음 → 직접 결제', rMl === '납품 전 · 계산서 받음 [pay 직접 결제]', rMl);
    await p.evaluate(v => localStorage.setItem('flowpoint-test-v6', v), snap0); await p.reload(); await p.waitForTimeout(150); await closePrompt(); }

  // 0-1. 부족 해결 비교 (시작 시나리오, 점검 뒤 원래 기록으로 되돌림)
  //   부족 날짜 하나(시작일 · D-n)가 홈·자금일보·알림에서 같고, 각 후보의 "해결"이 이 점검에서 따로 다시 계산한 30일 예측과 같으며,
  //   부족일 전 입금 채권은 해결 안 됨, 주의 거래처(브라이트몰)는 추천 안 됨, 추천은 해결하는 것 중 가장 싼 하나, 추천 버튼은 맞는 신청 시트·대상으로
  { const snap0 = await p.evaluate(() => localStorage.getItem('flowpoint-test-v6'));
    const dOf = s => { const [y, m, d] = s.split('-').map(Number); return Math.round((new Date(y, m - 1, d) - dAt(0)) / 864e5); };
    const tot = x => Math.round(x.qty * x.price * 1.1), manT = v => Math.round(v / 10000).toLocaleString('ko-KR') + '만원';
    // 독립 다시 계산: 결제 예정 매입(결제일, 지난 건 오늘) · 입금 전 매출(입금 예정일, 연체 제외)만 있는 시작 시나리오
    const sim = (S0, drop, add) => { const ev = [];
      S0.purchases.forEach(x => { if (x.status === 'ordered' && x.id !== drop) ev.push([Math.max(0, dOf(x.due)), -tot(x)]); });
      S0.sales.forEach(x => { if (x.status === 'open' && dOf(x.due) >= 0 && x.id !== drop) ev.push([dOf(x.due), tot(x)]); });
      ev.push(...add); const bal = []; let b = S0.cash; for (let d = 0; d <= 30; d++){ b += ev.filter(e => e[0] === d).reduce((t, e) => t + e[1], 0); bal.push(b); } return bal; };
    const S0 = await st(), base = sim(S0, null, []), start = base.findIndex(v => v < 0), want = mdAt(start) + '부터 · D-' + start;
    const sheetRows = () => p.locator('#dlgBody .sf-opt').evaluateAll(ds => ds.map(d => ({ k: d.dataset.k, id: d.dataset.id, res: d.dataset.resolves === '1', cost: +d.dataset.cost, low: d.dataset.low === '' ? null : +d.dataset.low,
      sel: d.dataset.sel ? d.dataset.sel.split(',') : null, tier: d.dataset.tier ? +d.dataset.tier : null, rec: d.dataset.rec === '1', st: d.querySelector('.sf-t .tag:last-child').textContent, txt: d.innerText.replace(/\s+/g, ' ') })));
    const fpRate = { 30: 0.033, 60: 0.066, 90: 0.1 }, mile = S0.mileage.reduce((a, m) => a + m.amt, 0);
    // 행마다 독립 다시 계산: 플로우페이 = 매입 결제 빼고 묶은 매출 넘김(입금 예정일 순) 더함 / 먼저 받기 = 그 입금을 오늘(금액 − 비용)으로
    const check = (S1, rows) => rows.map(r => {
      if (r.k === 'fp'){
        const x = S1.purchases.find(y => y.id === r.id); if (r.low == null) return { r, low: null, ok: !r.res };
        const bs = x.qty * x.price, sup = Math.round(bs * (1 + fpRate[r.tier])), totF = sup + Math.round(sup * 0.1), repay = totF - Math.min(mile, totF);
        let rest = repay; const add = r.sel.map(i => S1.sales.find(y => y.id === i)).sort((a, b) => a.due < b.due ? -1 : 1).map(s => { const f = Math.max(0, Math.min(tot(s), rest)); rest -= f; return [dOf(s.due), -f]; }).filter(e => e[1] < 0 && e[0] >= 0);
        const low = Math.min(...sim(S1, x.id, add));
        return { r, low, ok: r.res === (low >= 0) && Math.round(low) === r.low && r.cost === sup - bs };
      }
      const s = S1.sales.find(y => y.id === r.id), cost = Math.round(tot(s) * 0.012 * dOf(s.due) / 30), low = Math.min(...sim(S1, s.id, [[0, tot(s) - cost]]));
      return { r, low, ok: r.res === (low >= 0) && Math.round(low) === r.low && r.cost === cost };
    });
    // 홈: 부족 카드 · 오늘 할 일 첫 줄 · 플로우페이 가능 · 먼저 받기 가능
    await go('home');
    const hmDate = (await p.textContent('#hmShort .sf-date')).trim(), sig0 = (await sigRows()).split(' / ')[0];
    const hmFp = (await p.textContent('#hmFp')).trim(), hmAr = (await p.textContent('#hmAr')).trim();
    const fpSales = S0.sales.filter(x => x.status === 'open' && x.tax !== 'issued').reduce((a, x) => a + tot(x), 0);
    const arSum = S0.sales.filter(x => x.status === 'open' && x.tax === 'issued' && x.delivery === 'done' && dOf(x.due) >= 0 && x.party !== '브라이트몰').reduce((a, x) => a + tot(x), 0);
    console.log('shortfall: start', start, mdAt(start), '| low', Math.min(...base), '| home', hmDate, '|', await p.textContent('#hmShort .hm-val'), '| todo', sig0, '| 플로우페이 가능', hmFp, '| 먼저 받기 가능', hmAr);
    expect('홈 오늘 할 일 첫 줄: N만원 부족 · 시작일 [부족 해결*] (매입을 바로 겨누지 않음)', sig0 === manT(-Math.min(...base)) + ' 부족 · ' + want + ' [부족 해결*]' && !(await p.locator('#sigBox [data-act="finance"]').count()), sig0);
    expect('홈 플로우페이 가능 = min(한도 남은, 묶을 수 있는 미발행 매출) · 먼저 받기 가능 = 발행 채권(주의 제외)', hmFp === manT(fpSales) && hmAr === manT(arSum), { hmFp, fpSales, hmAr, arSum });
    // 시트(홈에서 열기)
    await p.click('#sigBox [data-act="shortSheet"]'); await p.waitForTimeout(150);
    const hero = (await p.locator('#sfHero').innerText()).replace(/\s+/g, ' ');
    let R = await sheetRows(); const C1 = check(S0, R);
    console.log('sheet(home):', await p.textContent('#dlgTitle'), '|', hero, '| focus', await p.evaluate(() => document.activeElement.dataset.act || document.activeElement.className));
    R.forEach(r => console.log('   ', r.rec ? '*' : ' ', r.k, r.txt, '| resolves', r.res, 'low', r.low));
    // 계산서 수집(한결푸드 352만원 발행 · 미래라벨 198만원 계산서 받음) 뒤에도 부족 해결 비교는 단계 4와 같음 (후보 · 해결 여부 · 비용 · 최저 잔고 · 추천)
    const sig = R.map(r => [r.k, r.txt.replace(/^추천 /, '').split(' ').slice(0, 2).join(' '), r.res, r.cost, r.low, r.rec ? '*' : ''].join('|'));
    const SIG4 = ['fp|세진화학 550만원|true|165000|1860000|*', 'fp|대성원료 1,573만원|true|471900|6920000|', 'ar|그린마켓 660만원|false|7920|-2327920|', 'ar|오렌지유통 726만원|false|29040|-2349040|',
      'ar|누리상회 330만원|false|19800|-2339800|', 'ar|브라이트몰 303만원|true|30250|674750|', 'ar|그린마켓 1,241만원|true|124080|9963920|'];
    expect('계산서 자동 연결 뒤에도 부족 해결 비교 그대로 (7개 후보 · 추천 세진화학 550만원 · 미래라벨 없음)', sig.join() === SIG4.join() && !R.some(r => r.txt.includes('미래라벨')), sig);
    expect('부족 해결 시트: 홈 오늘 할 일에서 열림 · 부족 날짜 하나', await dlgOpen() && (await p.textContent('#dlgTitle')) === '부족 해결' && hero.startsWith(want) && hero.includes(manT(-Math.min(...base)) + ' 부족'), hero);
    expect('후보마다 "해결"이 독립 다시 계산(30일 최저 ≥ 0)과 같음 · 비용 같음', C1.length >= 5 && C1.every(c => c.ok), C1.filter(c => !c.ok).map(c => [c.r.txt, c.r.low, c.low]));
    const early = R.filter(r => r.k === 'ar' && dOf(S0.sales.find(y => y.id === r.id).due) <= start);
    expect('부족일 전 입금 채권은 해결 안 됨 · 부족일 전 입금', early.length === 3 && early.every(r => !r.res && r.st === '해결 안 됨' && r.txt.includes('부족일 전 입금')), early.map(r => r.txt));
    const bm = R.find(r => r.txt.startsWith('브라이트몰'));
    expect('브라이트몰: 주의 거래처 · 심사 필요, 추천 아님', bm && bm.st === '주의 거래처 · 심사 필요' && !bm.rec, bm);
    const elig = rs => rs.filter(r => r.res && r.st === '해결'), rec = R.find(r => r.rec);
    expect('추천 = 해결하는 것 중 가장 싼 하나 (채움 버튼 1개)', rec && rec.cost === Math.min(...elig(R).map(r => r.cost)) && (await p.locator('#dlg button.primary').count()) === 1 && rec.txt.startsWith('추천 세진화학'), rec);
    if (SHOT) await shot('01a-shortfall-sheet');
    // 추천 버튼 → 플로우페이 신청(세진화학) · 2단계에 부족 시작일 뒤 매출(그린마켓)이 미리 묶여 있음
    await p.click('#dlgBody [data-act="shortGo"]'); await p.waitForTimeout(150);
    const apT = await p.textContent('#dlgTitle'), apKv = (await p.locator('#dlgBody .kv').innerText()).replace(/\s+/g, ' ');
    await next(); const pre = await p.locator('#dlgBody input[id^="lk_"]:checked').evaluateAll(xs => xs.map(x => x.id.slice(3)));
    console.log('rec → apply:', apT, '|', apKv.slice(0, 30), '| preselected', pre.map(i => S0.sales.find(y => y.id === i).party + ' ' + manT(tot(S0.sales.find(y => y.id === i)))).join(', '), '|', (await p.locator('#fpCover').innerText()).replace(/\s+/g, ' '));
    expect('추천 버튼 → 플로우페이 신청 · 대상 세진화학 · 묶음 = 추천 계산의 묶음', apT === '플로우페이 신청' && apKv.includes('세진화학') && pre.join() === rec.sel.join() && (await p.locator('#dlgBody .sum', { hasText: '충분' }).count()) === 1, { apT, pre, sel: rec.sel });
    await p.keyboard.press('Escape'); await p.waitForTimeout(150);
    const back = await p.evaluate(() => !document.getElementById('dlg').open && document.activeElement.dataset.act);
    expect('Esc로 닫으면 연 버튼(부족 해결)으로 포커스', back === 'shortSheet', back);
    // 자금일보 알림에서 열기 · 같은 날짜
    await go('report');
    const rpDate = (await p.textContent('#sfCallout .sf-date')).trim();
    await p.click('#sfCallout [data-act="shortSheet"]'); await p.waitForTimeout(150);
    const fromRp = await dlgOpen() && (await p.textContent('#dlgTitle')) === '부족 해결';
    await p.keyboard.press('Escape'); await p.waitForTimeout(120);
    await p.evaluate(() => document.querySelector('[data-act="ntOpen"]').click()); await p.waitForTimeout(150);
    const ntDate = (await p.textContent('#ntShort .sf-date')).trim();
    console.log('dates: home', hmDate, '| report', rpDate, '| notif', ntDate, '| want', want);
    expect('부족 해결 시트: 자금일보 알림에서 열림', fromRp, fromRp);
    expect('홈·자금일보·알림의 부족 날짜가 같음', hmDate === want && rpDate === want && ntDate === want && sig0.includes(want), { hmDate, rpDate, ntDate });
    // 알림의 "부족 해결" → 시트, 그린마켓 1,241만원 계산서 발행 → 먼저 받기 후보, 가장 싸면 추천이 바뀜
    await p.click('#ntShort [data-act="shortSheet"]'); await p.waitForTimeout(150);
    const gm = S0.sales.find(x => x.party === '그린마켓' && x.tax !== 'issued');
    await p.click('#dlgBody .sf-opt[data-id="' + gm.id + '"] [data-act="tax"]'); await p.waitForTimeout(150);
    const S2 = await st(); R = await sheetRows(); const C2 = check(S2, R), rec2 = R.find(r => r.rec), g2 = R.find(r => r.id === gm.id);
    console.log('after 그린마켓 1,241 발행:', S2.sales.find(x => x.id === gm.id).tax, '| still open', await dlgOpen());
    R.forEach(r => console.log('   ', r.rec ? '*' : ' ', r.k, r.txt, '| resolves', r.res, 'low', r.low));
    expect('그린마켓 1,241만원 발행 후: 먼저 받기 후보(해결) · 해결 여부 독립 계산과 같음', g2 && g2.st === '해결' && g2.res && C2.every(c => c.ok), { g2, bad: C2.filter(c => !c.ok).map(c => [c.r.txt, c.r.low, c.low]) });
    expect('추천이 가장 싼 해결 방법(그린마켓 1,241만원 먼저 받기)으로 바뀜', rec2 && rec2.cost === Math.min(...elig(R).map(r => r.cost)) && rec2.id === gm.id && rec2.k === 'ar', rec2);
    expect('발행 전 추천(플로우페이)은 발행 후 해결 안 됨 · 채움 버튼은 여전히 1개', R.some(r => r.id === rec.id && !r.res && !r.rec) && (await p.locator('#dlg button.primary').count()) === 1, R.find(r => r.id === rec.id));
    if (SHOT) await shot('01b-shortfall-after-tax');
    await p.click('#dlgBody [data-act="shortGo"]'); await p.waitForTimeout(150);
    const arT = await p.textContent('#dlgTitle'), arSum0 = (await p.locator('#dlgBody .sum').first().innerText()).replace(/\s+/g, ' ');
    console.log('rec → apply:', arT, '|', arSum0);
    expect('추천 버튼 → 유동화 신청 · 대상 그린마켓 1,241만원', arT === '유동화 신청' && arSum0.includes('그린마켓') && arSum0.includes('1,241만원'), arSum0);
    await p.keyboard.press('Escape'); await p.waitForTimeout(120);
    await p.evaluate(v => localStorage.setItem('flowpoint-test-v6', v), snap0); await p.reload(); await p.waitForTimeout(150); await closePrompt();

    // 0-1b. 부족 해결 4단계(v7): 이유 폭포 합계 = 예측 최저 · 건수 · 영향(독립 시뮬레이션: 지급 불가 매입 · 점수 −40×건수 · 한도 식) · 바꿀 수 있는 구간 · 보류 사유 필수 · 승인·보류 기록
    //   날짜는 고정값이 아니라 관계(결제일 − 3일, 같은 날 합침, 최저일까지의 건수)로 확인
    { await go('home'); await p.click('#sigBox [data-act="shortSheet"]'); await p.waitForTimeout(150);
      const SB = await st(), minV = Math.min(...base), minD = base.indexOf(minV), manX = v => (v < 0 ? '−' : '') + manT(Math.abs(v));
      // 독립 이벤트 목록 (시작 시나리오: 결제 예정 매입 · 입금 전 매출만): [날, 금액, 거래]
      const evs = []; SB.purchases.forEach(x => { if (x.status === 'ordered') evs.push([Math.max(0, dOf(x.due)), -tot(x), x]); });
      SB.sales.forEach(x => { if (x.status === 'open' && dOf(x.due) >= 0) evs.push([dOf(x.due), tot(x), x]); });
      const upTo = evs.filter(e => e[0] <= minD).sort((x, y) => x[0] - y[0]), inY = upTo.filter(e => e[1] > 0).reduce((a, e) => a + e[1], 0), outZ = -upTo.filter(e => e[1] < 0).reduce((a, e) => a + e[1], 0);
      const wf = await p.evaluate(() => ({ rows: [...document.querySelectorAll('#sfWf li')].map(l => ({ amt: +l.dataset.amt, n: +(l.dataset.n || 0), day: l.dataset.day == null ? null : +l.dataset.day, txt: l.innerText.replace(/\s+/g, ' ') })),
        chk: Object.assign({}, document.getElementById('sfWfChk').dataset), chkTxt: document.getElementById('sfWfChk').innerText.replace(/\s+/g, ' '), n: +document.getElementById('sfWfN').textContent, eq: document.getElementById('sfWfEq').textContent }));
      const mid = wf.rows.filter(r => r.day != null), wfSum = wf.rows[0].amt + mid.reduce((a, r) => a + r.amt, 0);
      console.log('waterfall:', wf.rows.map(r => r.txt).join(' / '), '|', wf.chkTxt);
      expect('이유 폭포: 오늘 잔고 + 건별 ± = 예측 최저 잔고(원 단위) · "합계 일치 ✓"', wf.rows[0].amt === SB.cash && wfSum === minV && +wf.chk.sum === minV && +wf.chk.want === minV && wf.chk.gap === '0' &&
        wf.chkTxt.includes('합계 일치 ✓') && !wf.chkTxt.includes('차이') && wf.rows[wf.rows.length - 1].amt === minV, { wfSum, minV, chk: wf.chk });
      expect('폭포 건수 = 최저일까지의 입출금 건수 (12줄 이하 · 모두 최저일 이전 · 같은 날 묶음 포함 합계 그대로)', wf.n === upTo.length && mid.reduce((a, r) => a + r.n, 0) === upTo.length && mid.length <= 12 && mid.every(r => r.day <= minD) &&
        mid.every((r, i) => !i || r.day >= mid[i - 1].day), { n: wf.n, want: upTo.length, rows: mid.length });
      const lbl = e => (d => (d.getMonth() + 1) + '/' + d.getDate())(dAt(e[0])) + ' ' + e[2].party + ' ' + (e[1] > 0 ? '+' : '−') + Math.round(Math.abs(e[1]) / 10000).toLocaleString('ko-KR') + '만';
      expect('폭포 줄 = 날짜 · 거래처 · ±금액 (최저일까지 이벤트 순서대로)', mid.length !== upTo.length || mid.every((r, i) => r.txt === lbl(upTo[i])), { got: mid.map(r => r.txt), want: upTo.map(lbl) });
      expect('글 대안: "오늘 X + 들어올 돈 Y − 나갈 돈 Z = 최저 W"', wf.eq === '오늘 ' + manT(SB.cash) + ' + 들어올 돈 ' + manT(inY) + ' − 나갈 돈 ' + manT(outZ) + ' = 최저 ' + manX(minV) && SB.cash + inY - outZ === minV, wf.eq);
      // 영향: 결제 예정 매입을 결제일 순서로 그날 잔고(같은 날 들어올 돈 먼저)로 낸다고 보고 못 내는 매입 · 늦은 지급일
      let bb = SB.cash; const unpaid = [], wait = [];
      for (let d = 0; d <= 30; d++){
        const dd = evs.filter(e => e[0] === d);
        dd.filter(e => e[1] > 0).forEach(e => { bb += e[1]; });
        wait.slice().forEach(u => { if (bb >= u.amt){ bb -= u.amt; u.paid = d; wait.splice(wait.indexOf(u), 1); } });
        dd.filter(e => e[1] < 0).forEach(e => { if (bb >= -e[1]) bb += e[1]; else { const u = { party: e[2].party, amt: -e[1], day: d, before: bb, paid: null }; unpaid.push(u); wait.push(u); } });
      }
      const imp = await p.evaluate(() => [...document.querySelectorAll('#sfImpact tbody tr')].map(r => Object.assign({ txt: r.innerText.replace(/\s+/g, ' ') }, r.dataset)));
      console.log('impact:', imp.map(r => r.txt).join(' / '), '| sim', unpaid.map(u => u.party + ' ' + manT(u.amt) + ' +' + u.day + ' (잔고 ' + manT(u.before) + ') → +' + u.paid).join(', '));
      const iu = imp.filter(r => r.k === 'unpaid'), isc = imp.find(r => r.k === 'score'), ili = imp.find(r => r.k === 'limit');
      expect('영향: 지급 불가 매입 = 독립 시뮬레이션 (거래처 · 금액 · 결제일, 그날 잔고 < 금액)', unpaid.length >= 1 && iu.length === unpaid.length && iu.every((r, i) => r.party === unpaid[i].party && +r.amt === unpaid[i].amt && +r.day === unpaid[i].day && r.txt.includes('지급 불가') && r.txt.startsWith(unpaid[i].party + ' 결제')) &&
        unpaid.every(u => u.before < u.amt), { iu, unpaid });
      // 점수 = 플로우스코어 화면의 내 점수, 한도 = (점수 − 500) × 40만원 × (계산서 기한 지난 매출 있으면 0.7)
      const tdue = x => { const [y, m] = x.issued.split('-').map(Number); return (d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'))(new Date(y, m, 10)); };
      const lateTax = SB.sales.some(x => !(x.tax === 'issued' && (x.taxOn || x.issued) <= isoAt(0)) && tdue(x) < isoAt(0)), limF = v => Math.round(Math.max(0, v - 500) * 400000 * (lateTax ? 0.7 : 1));
      const v0 = +isc.v, N = 40 * unpaid.length, v2 = Math.max(300, v0 - N), M = limF(v0) - limF(v2);
      expect('영향: 플로우스코어 약 −N점 (N = 40 × 지급 불가 건수) · 가정값', +isc.pen === N && +isc.v2 === v2 && isc.txt.includes('약 −' + N + '점') && isc.txt.includes('가정값'), { isc, N });
      expect('영향: 이용 한도 −M원 (M = limitInfo 식으로 줄어든 점수에서 다시 계산, 계산서 기한 지남 × 0.7 유지) · 가정값', +ili.lim === limF(v0) && +ili.m === M && +ili.lim2 === limF(v2) && ili.txt.includes('−' + manT(M)) && ili.txt.includes('가정값'), { ili, M, lateTax });
      // 바꿀 수 있는 구간: 오늘 · 플로우페이 신청 마감(추천 매입 결제일 − 3) · 지급 불가 결제일 · 부족 시작 · 계산서 기한(묶은 미발행 매출 중 가장 이른). 같은 날은 한 줄
      const recP = SB.purchases.find(x => x.id === rec.id), want4 = [[0, 'today'], [dOf(recP.due) - 3, 'fpApply'], ...unpaid.map(u => [u.day, 'pay']), [start, 'start']];
      const tx = rec.sel.map(i => SB.sales.find(x => x.id === i)).filter(x => x.tax !== 'issued' && dOf(tdue(x)) >= 0).map(x => dOf(tdue(x)));
      if (tx.length) want4.push([Math.min(...tx), 'tax']);
      const wantDays = [...new Set(want4.map(w => w[0]))].sort((a, b) => a - b);
      const marks = await p.evaluate(() => [...document.querySelectorAll('#sfMarks li')].map(l => ({ day: +l.dataset.day, k: l.dataset.k.split(','), txt: l.innerText.replace(/\s+/g, ' '), tip: !!l.querySelector('.itip') })));
      console.log('timeline:', marks.map(m => m.txt).join(' / '));
      expect('바꿀 수 있는 구간: 표시 = 계산한 날짜 (같은 날은 한 줄로) · 신청 마감 = 결제일 − 3일 · 계산서 기한 ⓘ', marks.map(m => m.day).join() === wantDays.join() && want4.every(w => marks.find(m => m.day === w[0]).k.includes(w[1])) &&
        marks.every(m => m.txt.startsWith(m.day === 0 ? '오늘' : m.day > 0 ? 'D-' + m.day : (-m.day) + '일 지남')) && (!tx.length || marks.find(m => m.k.includes('tax')).tip) && marks.find(m => m.k.includes('fpApply')).day === dOf(recP.due) - 3, { marks, want4 });
      if (SHOT) { await p.click('#sfSteps button >> nth=2'); await p.waitForTimeout(150); await shot('01j-shortfall-impact'); }
      // 단계 표시줄: 4개 · "판단"을 누르면 그 단계가 지금 단계(aria-current)
      await p.click('#sfSteps button >> nth=3'); await p.waitForTimeout(150);
      const stepNow = await p.evaluate(() => [[...document.querySelectorAll('#sfSteps button')].map(b => b.textContent.trim()).join(','), document.querySelector('#sfSteps [aria-current="step"]').textContent.trim(), document.activeElement.id]);
      expect('단계 표시줄 이상·이유·영향·판단 → "판단" 누르면 지금 단계 · 판단 제목에 포커스', stepNow[0] === '1 이상,2 이유,3 영향,4 판단' && stepNow[1] === '4 판단' && stepNow[2] === 'sfH4', stepNow);
      // 보류: 사유 없이는 기록 불가, 기타는 메모 필수
      const own = S => S.decisions.filter(d => !d.seeded), nDec = async () => own(await st()).length;  // 시나리오용 지난 판단(seeded)은 빼고 셈
      await p.click('#dlgBody [data-act="shortHold"]'); await p.waitForTimeout(150);
      const h0 = await p.evaluate(() => [document.getElementById('holdDlg').open, document.getElementById('holdOk').disabled, document.activeElement.name]);
      await p.evaluate(() => document.getElementById('holdOk').click()); await p.waitForTimeout(80);
      const n0 = await nDec();
      await p.check('#holdBody input[value="기타"]'); await p.waitForTimeout(60);
      const h1 = await p.evaluate(() => [document.getElementById('holdOk').disabled, document.getElementById('holdOk').textContent]);
      await p.fill('#holdMemo', '   '); await p.waitForTimeout(60);
      const h2 = await p.isDisabled('#holdOk');
      await p.fill('#holdMemo', '다음 주 투자금 입금 예정'); await p.waitForTimeout(60);
      const h3 = await p.isDisabled('#holdOk');
      if (SHOT) await shot('01k-hold-picker');
      console.log('hold picker: open', h0, '| 기타', h1, '| 공백 메모 disabled', h2, '| 메모 disabled', h3);
      expect('보류: 사유를 고르기 전에는 "보류 기록" 비활성 · 눌러도 기록 없음', h0[0] && h0[1] && h0[2] === 'holdR' && n0 === 0, { h0, n0 });
      expect('보류: 기타는 메모가 있어야 기록 가능(공백만은 안 됨)', h1[0] && h1[1] === '메모를 적어 주세요' && h2 && !h3, { h1, h2, h3 });
      await p.click('#holdOk'); await p.waitForTimeout(150);
      const SH = await st(), d1 = own(SH)[0], back1 = await p.evaluate(() => [document.getElementById('holdDlg').open, document.getElementById('dlg').open, document.activeElement.dataset.act]);
      console.log('hold record:', JSON.stringify(d1), '| after', back1);
      const pickOk = d => d.pick.kind === 'fp' && d.pick.id === rec.id && d.pick.party === recP.party && d.pick.amt === tot(recP) && d.pick.cost === rec.cost && d.sf.start === isoAt(start) && d.sf.need === -minV && d.date === isoAt(0) && d.result === null && typeof d.id === 'string';
      expect('보류 → S.decisions 기록 { sf, pick, choice hold, reason, memo, by } · 사유 시트 닫히고 부족 해결 시트는 그대로(보류 버튼에 포커스)', own(SH).length === 1 && pickOk(d1) && d1.choice === 'hold' && d1.reason === '기타' && d1.memo === '다음 주 투자금 입금 예정' && d1.by === 'ceo' &&
        !back1[0] && back1[1] && back1[2] === 'shortHold', { d1, back1 });
      // Esc: 사유 시트부터 닫힘
      await p.click('#dlgBody [data-act="shortHold"]'); await p.waitForTimeout(150);
      await p.keyboard.press('Escape'); await p.waitForTimeout(120);
      const esc1 = await p.evaluate(() => [document.getElementById('holdDlg').open, document.getElementById('dlg').open]);
      expect('Esc는 사유 시트부터 닫음 (부족 해결 시트는 열린 채)', !esc1[0] && esc1[1], esc1);
      // 승인 → 기록(approve) · 신청 시트(대상 = 추천) → 신청하면 그 신청 id가 기록에 붙음
      await p.click('#dlgBody [data-act="shortGo"]'); await p.waitForTimeout(150);
      const SA = await st(), da = SA.decisions[SA.decisions.length - 1], apT2 = await p.textContent('#dlgTitle'), apKv2 = (await p.locator('#dlgBody .kv').innerText()).replace(/\s+/g, ' ');
      expect('승인 → S.decisions에 approve 기록 · 신청 시트(플로우페이 · 대상 = 추천 매입)', own(SA).length === 2 && da.choice === 'approve' && pickOk(da) && da.by === 'ceo' && apT2 === '플로우페이 신청' && apKv2.includes(recP.party), { da, apT2 });
      await next(); await next();
      while (await p.locator('dialog [data-act="upload"][data-ctx="apply"]:not(:has-text("미리"))').count()) { await p.locator('dialog [data-act="upload"][data-ctx="apply"]:not(:has-text("미리"))').first().click(); await p.waitForTimeout(120); }
      await next(); await p.click('dialog [data-act="submitApply"]'); await p.waitForTimeout(150);
      const SL = await st(), ap1 = SL.apps.find(a => a.refId === rec.id), dl = SL.decisions.find(d => d.id === da.id);
      console.log('approve → app', ap1 && ap1.id, ap1 && ap1.status, '| decision appId', dl.appId, '| decisions', own(SL).length);
      expect('승인 후 신청하면 그 신청 id가 판단 기록에 연결 · 기록은 하나', ap1 && dl.appId === ap1.id && own(SL).length === 2, { ap1, dl });
      // 담당자: 승인 자리에 "대표 승인 요청"(채움 아님), 보류는 할 수 있음(by staff)
      await p.evaluate(v => { const s = JSON.parse(v); s.role = 'staff'; localStorage.setItem('flowpoint-test-v6', JSON.stringify(s)); }, snap0); await p.reload(); await p.waitForTimeout(150); await closePrompt();
      await go('home'); await p.click('#sigBox [data-act="shortSheet"]'); await p.waitForTimeout(150);
      const sf0 = await p.evaluate(() => { const r = document.querySelector('#dlgBody .sf-opt[data-rec="1"]'); return [!!r.querySelector('[data-act="shortGo"]'), r.querySelector('[data-act="ceoReq"]') && r.querySelector('[data-act="ceoReq"]').textContent, !!r.querySelector('[data-act="shortHold"]'), document.querySelectorAll('#dlg button.primary').length]; });
      await p.click('#dlgBody [data-act="shortHold"]'); await p.waitForTimeout(150);
      await p.check('#holdBody input[value="비용 부담"]'); await p.click('#holdOk'); await p.waitForTimeout(150);
      const ds = own(await st());
      expect('담당자: "대표 승인 요청"(채움 버튼 없음) · 보류 기록 가능(by staff · 사유 비용 부담)', !sf0[0] && sf0[1] === '대표 승인 요청' && sf0[2] && sf0[3] === 0 && ds.length === 1 && ds[0].by === 'staff' && ds[0].choice === 'hold' && ds[0].reason === '비용 부담' && ds[0].memo === '', { sf0, ds });
      await p.keyboard.press('Escape'); await p.waitForTimeout(120);
      await p.evaluate(v => localStorage.setItem('flowpoint-test-v6', v), snap0); await p.reload(); await p.waitForTimeout(150); await closePrompt(); }

    // 0-2. 자금일보 보고서형: 기준 줄(전일 대비) · 탭 전환(누르기·화살표·기억) · 두 줄 예측 · 받을 돈 나이 막대 · 거래처 쏠림 (시작 시나리오, 독립 계산과 비교)
    await go('report');
    const selTab = () => p.evaluate(() => [...document.querySelectorAll('#reportBody [role="tab"]')].filter(t => t.getAttribute('aria-selected') === 'true').map(t => t.dataset.tab + (document.getElementById(t.getAttribute('aria-controls')).hidden ? '(hidden)' : '')).join());
    const shown = () => p.evaluate(() => [...document.querySelectorAll('#reportBody [role="tabpanel"]')].filter(x => !x.hidden).map(x => x.id).join());
    const net = S0.log.filter(l => l.date === isoAt(-1)).reduce((a, l) => a + l.amt, 0), netT = (net > 0 ? '+' : net < 0 ? '−' : '') + manT(Math.abs(net));
    const src = (await p.textContent('#rpSrc')).replace(/\s+/g, ' ').trim();
    console.log('report top line:', src, '| cards', (await p.locator('#rpCards .rp-card').allInnerTexts()).map(t => t.replace(/\s+/g, ' ')).join(' / '));
    const dayLine = await p.evaluate(() => { const d = document.querySelector('#rpSrc .rp-day'); return d && getComputedStyle(d).display === 'block' && getComputedStyle(d).whiteSpace === 'nowrap'; });
    expect('자금일보 기준 줄: 오늘 08:00 기준 · 은행 잔고(연동 예정) / 전일 대비(어제 입출금 합계)는 한 덩어리로 다음 줄', src === mdAt(0) + ' 08:00 기준 · 은행 잔고(연동 예정) 전일 대비 ' + netT && dayLine, { src, netT, dayLine });
    const rpSf = (await p.textContent('#sfCallout .sf-date')).trim(), rpSum = (await p.textContent('#rpSum')).replace(/\s+/g, ' ');
    const svg = await p.locator('#chart2').evaluate(s => ({ sure: s.dataset.sure.split(',').map(Number), cons: s.dataset.cons.split(',').map(Number), sfDay: +s.dataset.sfDay, label: s.getAttribute('aria-label') }));
    console.log('report summary:', rpSum, '| chart sf day', svg.sfDay, '|', (await p.textContent('#rpCons')).trim());
    expect('자금일보 부족 날짜 = 홈 부족 날짜 (알림·요약 문장·차트 세로선)', rpSf === hmDate && rpSum.includes('부족 ' + want) && svg.sfDay === start && !/\d+일 뒤 잔고가/.test(rpSum), { rpSf, hmDate, rpSum, sfDay: svg.sfDay });
    // 보수 줄: 확실(독립 다시 계산) − 브라이트몰(주의) 들어올 돈 → 입금 예정일 전에는 같고, 그날부터 그 금액만큼 낮음
    const bmS = S0.sales.find(x => x.party === '브라이트몰' && x.status === 'open' && dOf(x.due) >= 0), bmDay = dOf(bmS.due), bmAmt = tot(bmS);
    const sureOk = svg.sure.every((v, d) => v === Math.round(base[d]));
    const consOk = svg.cons.every((v, d) => d < bmDay ? v === svg.sure[d] : v === svg.sure[d] - bmAmt);
    console.log('two lines: 확실 min', manT(Math.min(...svg.sure)), '| 보수 min', manT(Math.min(...svg.cons)), '| 브라이트몰', manT(bmAmt), '+' + bmDay);
    expect('확실 줄 = 독립 다시 계산한 30일 예측', sureOk, svg.sure);
    expect('보수 줄 최저 ≤ 확실 줄 최저 · 브라이트몰 입금일(+' + bmDay + ') 전 같고 그날부터 다름(−' + manT(bmAmt) + ')', Math.min(...svg.cons) <= Math.min(...svg.sure) && consOk && svg.cons[bmDay] !== svg.sure[bmDay] && svg.cons[bmDay - 1] === svg.sure[bmDay - 1], { cons: svg.cons });
    expect('차트 설명(aria-label)에 두 줄 수치', svg.label.includes('확실') && svg.label.includes('보수') && /\d/.test(svg.label), svg.label);
    expect('요약: 오늘 챙길 일 줄마다 버튼 1개 · 최대 3줄 · "7일 안의 결제 예정" 없음 · 채움 버튼 1개', await p.locator('#rpTodo li').evaluateAll(ls => ls.length <= 3 && ls.every(l => l.querySelectorAll('button').length === 1)) &&
      !(await p.locator('#reportBody', { hasText: '7일 안의 결제 예정' }).count()) && (await p.locator('#rpPanel-sum button.primary, #rpPanel-sum button.hot').count()) === 1, await p.locator('#rpTodo li').allInnerTexts());
    // 탭: 누르기 → 받을 돈, 오른쪽 화살표 → 줄 돈(포커스 따라감), 다시 불러와도 줄 돈(보는 사람별 기억), Home → 요약
    await p.click('#rpTab-ar'); await p.waitForTimeout(120);
    const t1 = await selTab(), s1 = await shown();
    const arTot = await p.locator('#rpArTot').evaluate(e => +e.dataset.amt), ageAmts = await p.locator('#rpAge i').evaluateAll(is => is.map(i => +i.dataset.amt));
    const open = S0.sales.filter(x => x.status === 'open'), openTot = open.reduce((a, x) => a + tot(x), 0);
    const bucket = x => dOf(x.due) < 0 ? 2 : -dOf(x.issued) <= 30 ? 0 : 1, want3 = [0, 1, 2].map(k => open.filter(x => bucket(x) === k).reduce((a, x) => a + tot(x), 0)).filter(v => v);
    const byP = {}; open.forEach(x => { byP[x.party] = (byP[x.party] || 0) + tot(x); });
    const top3 = Object.entries(byP).sort((a, b) => b[1] - a[1]).slice(0, 3), topPct = Math.round(top3.reduce((a, x) => a + x[1], 0) / openTot * 100);
    const conc = await p.locator('#rpConc .rp-conc').evaluateAll(rs => rs.map(r => r.dataset.party + ' ' + r.querySelector('b').textContent));
    const topTxt = (await p.textContent('#rpTop3')).trim();
    console.log('tabs: click', t1, s1, '| 받을 돈', manT(arTot), '| age', ageAmts.map(manT).join(' / '), '| top3', conc.join(', '), '| 상위 3곳', topTxt);
    expect('탭 누르기: 받을 돈 탭과 패널만 보임', t1 === 'ar' && s1 === 'rpPanel-ar', { t1, s1 });
    expect('받을 돈 나이 막대 합 = 받을 돈 합계(입금 전 매출) · 구간 = 거래일 기준 30일 이내 / 31~60일 / 연체', arTot === openTot && ageAmts.reduce((a, v) => a + v, 0) === openTot && ageAmts.join() === want3.join(), { arTot, openTot, ageAmts, want3 });
    expect('거래처 쏠림 상위 3곳 · 비중', conc.join() === top3.map(x => x[0] + ' ' + Math.round(x[1] / openTot * 100) + '%').join() && topTxt === topPct + '%', { conc, top3, topTxt, topPct });
    expect('받을 돈 목록: 줄마다 계산서 상태 · 버튼 최대 1개', await p.locator('#inList li.tr-row').evaluateAll(ls => ls.length > 0 && ls.every(l => /계산서/.test(l.querySelector('.tr-st').textContent) && l.querySelectorAll('button[data-act]:not(.tr-open)').length <= 1)), await p.locator('#inList li.tr-row').count());
    if (SHOT) { await top(); await shot('01d-report-ar'); }
    await p.keyboard.press('ArrowRight'); await p.waitForTimeout(120);
    const t2 = await selTab(), f2 = await p.evaluate(() => document.activeElement.id);
    const apTxt = (await p.locator('#outList h3').allInnerTexts()).map(t => t.replace(/\s+/g, ' ')).join(' / ');
    console.log('tabs: ArrowRight', t2, 'focus', f2, '| 줄 돈', (await p.textContent('#rpApTot')).trim(), '|', apTxt);
    expect('오른쪽 화살표: 줄 돈 탭(포커스 이동) · 플로우페이 대상 / 직접 결제 묶음', t2 === 'ap' && f2 === 'rpTab-ap' && apTxt.includes('플로우페이 대상') && apTxt.includes('직접 결제'), { t2, f2, apTxt });
    await p.reload(); await p.waitForTimeout(150); await closePrompt(); await go('report');
    const t3 = await selTab();
    await p.focus('#rpTab-ap'); await p.keyboard.press('Home'); await p.waitForTimeout(120);
    const t4 = await selTab();
    expect('다시 불러와도 마지막 탭(줄 돈) · Home → 요약', t3 === 'ap' && t4 === 'sum', { t3, t4 });
    if (SHOT) { await p.evaluate(() => document.activeElement.blur()); await top(); await shot('01c-report-summary'); } }

  // 0-3. 자금일보 신뢰 장치(v7): 합계 일치(미확인 입금 → 매출 연결) · 평소 범위 타일 (시작 시나리오, 점검 뒤 원래 기록으로 되돌림)
  //   날짜는 고정값이 아니라 관계(오늘 · 7일씩 앞선 12번의 기준일)로 다시 계산해 비교
  { const snap0 = await p.evaluate(() => localStorage.getItem('flowpoint-test-v6')), S0 = await st();
    const dOf = s => { const [y, m, d] = s.split('-').map(Number); return Math.round((new Date(y, m - 1, d) - dAt(0)) / 864e5); };
    const btw = (a, z) => dOf(z) - dOf(a), tot = x => Math.round(x.qty * x.price * 1.1), manT = v => Math.round(v / 10000).toLocaleString('ko-KR') + '만원';
    const manS = v => (v < 0 ? '−' : '') + Math.abs(Math.round(v / 10000)).toLocaleString('ko-KR') + '만원', sgn = v => (v > 0 ? '+' : '') + manS(v);
    const sim = S => { const ev = []; S.purchases.forEach(x => { if (x.status === 'ordered') ev.push([Math.max(0, dOf(x.due)), -tot(x)]); });
      S.sales.forEach(x => { if (x.status === 'open' && dOf(x.due) >= 0) ev.push([dOf(x.due), tot(x)]); });
      const bal = []; let b = S.cash; for (let d = 0; d <= 30; d++){ b += ev.filter(e => e[0] === d).reduce((t, e) => t + e[1], 0); bal.push(b); } return bal; };
    const sfOf = bal => { const s = bal.findIndex(v => v < 0), lo = Math.min(...bal); return s < 0 ? null : { start: s, min: bal.indexOf(lo), amt: lo }; };
    await go('report'); await p.click('#rpTab-sum'); await p.waitForTimeout(120);
    // (1) 연결 전: 차이 = 미확인 입금 합계 · 예측은 장부 잔고(미확인 입금 제외)에서 시작하고 누리상회 매출은 입금 예정일에 그대로 → 두 번 잡히지 않음
    const um = S0.bank.unmatched, gap = um.reduce((a, u) => a + u.amt, 0), u0 = um[0];
    const pill0 = (await p.textContent('#rpRecon')).trim(), sure0 = await p.locator('#chart2').evaluate(s => s.dataset.sure.split(',').map(Number)), base0 = sim(S0), sf0 = sfOf(base0);
    const amtSales = S0.sales.filter(x => x.status === 'open' && tot(x) === u0.amt), nuri = amtSales.find(x => x.party === '누리상회');
    console.log('recon before:', pill0, '| unmatched', um.map(u => u.sender + ' ' + u.amt + ' ' + u.date).join(', '), '| book', S0.cash, '| bank', S0.cash + gap, '| 금액 같은 매출', amtSales.map(x => x.party + (dOf(x.due) < 0 ? '(연체)' : '+' + dOf(x.due))).join(', '));
    expect('연결 전: 맨 위 "차이 330만원 · 확인 필요" (은행 = 장부 + 미확인 입금 ㈜누리 330만원, 오늘)', um.length === 1 && u0.amt === 3300000 && u0.sender === '㈜누리' && u0.date === isoAt(0) && pill0 === '차이 ' + manT(gap) + ' · 확인 필요 ›' &&
      (await p.locator('#rpRecon .tag.warn').count()) === 1, { pill0, um });
    expect('연결 전 예측에 미확인 입금 없음: 0일 잔고 = 장부 잔고 · 누리상회 330만원은 입금 예정일에 한 번 (독립 계산과 같음)', sure0.every((v, d) => v === base0[d]) && sure0[0] !== base0[0] + gap && nuri && dOf(nuri.due) > 0 && base0[dOf(nuri.due)] - base0[dOf(nuri.due) - 1] >= 0, { s0: sure0[0], cash: S0.cash });
    // (2) 평소 범위 타일: 오늘 값과 직전 12주(오늘 − 7k일, k = 1..12) 값을 그날 기준(있던 거래 · 그날 상태)으로 따로 계산
    const tdue = x => { const [y, m] = x.issued.split('-').map(Number); return (d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'))(new Date(y, m, 10)); };
    const at = (S, a) => { const ex = x => (x.issued || x.ordered || x.due) <= a, paid = x => x.paidOn && x.paidOn <= a, a7 = isoAt(dOf(a) + 7), sm = L => L.reduce((t, x) => t + tot(x), 0);
      const ls = S.sales.filter(ex), lp = S.purchases.filter(ex), ar = ls.filter(x => !paid(x) && x.status !== 'factored' && x.status !== 'bundled'), ap = lp.filter(x => !paid(x) && x.status !== 'financed' && x.status !== 'repaid'), arT = sm(ar);
      const pd = ls.filter(x => paid(x) && btw(x.paidOn, a) < 90).map(x => btw(x.issued, x.paidOn)), td = ls.filter(x => tdue(x) < a), by = {};
      ar.forEach(x => { by[x.party] = (by[x.party] || 0) + tot(x); });
      return { coll: pd.length ? pd.reduce((t, v) => t + v, 0) / pd.length : null, od: arT ? sm(ar.filter(x => x.due < a)) / arT : null,
        tax: td.length ? td.filter(x => x.tax === 'issued' && (x.taxOn || x.issued) <= tdue(x)).length / td.length : null,
        top3: arT ? Object.values(by).sort((u, v) => v - u).slice(0, 3).reduce((t, v) => t + v, 0) / arT : null,
        ap: ls.length + lp.length ? sm(ap) : null, net7: ls.length + lp.length ? sm(ar.filter(x => x.due >= a && x.due <= a7)) - sm(ap.filter(x => x.due <= a7)) : null }; };
    const FMT = { coll: v => Math.round(v) + '일', od: v => Math.round(v * 1000) / 10 + '%', tax: v => Math.round(v * 100) + '%', top3: v => Math.round(v * 100) + '%', ap: manS, net7: sgn };
    const now0 = at(S0, isoAt(0)), past = [...Array(12)].map((_, i) => at(S0, isoAt(-7 * (i + 1))));
    const want = Object.keys(FMT).map(k => { const vs = past.map(w => w[k]).filter(v => v != null), lo = vs.length ? Math.min(...vs) : null, hi = vs.length ? Math.max(...vs) : null, v = now0[k];
      return { k, v, lo, hi, n: vs.length, st: vs.length < 8 || v == null ? 'few' : v > hi ? 'high' : v < lo ? 'low' : 'in' }; });
    const tiles = await p.locator('#rpTiles .rp-tile').evaluateAll(ts => ts.map(t => ({ k: t.dataset.k, st: t.dataset.st, n: +t.dataset.n, v: t.dataset.v == null ? null : +t.dataset.v, lo: t.dataset.lo == null ? null : +t.dataset.lo, hi: t.dataset.hi == null ? null : +t.dataset.hi,
      val: t.querySelector('.rp-tv').textContent, rg: t.querySelector('.rp-rg').innerText.replace(/\s+/g, ' ').trim(), out: t.classList.contains('out'), bold: getComputedStyle(t.querySelector('.rp-tv')).fontWeight, aria: t.getAttribute('aria-label'), role: t.getAttribute('role') })));
    tiles.forEach(t => { const w = want.find(x => x.k === t.k); console.log('   tile', t.k, '|', t.val, '|', t.rg, '| n', t.n, '| 독립', w && [w.v == null ? '-' : FMT[t.k](w.v), w.lo == null ? '-' : FMT[t.k](w.lo) + '~' + FMT[t.k](w.hi), w.st].join(' ')); });
    const near = (x, y) => x == null || y == null ? x === y : Math.abs(x - y) < 1e-9;
    expect('평소 범위 타일 6개(2열) · 순서 회수 일수 · 연체율 · 계산서 · 쏠림 · 결제 전 매입 · 7일 순유입 · 잔고 타일 없음', tiles.map(t => t.k).join() === 'coll,od,tax,top3,ap,net7' &&
      await p.locator('#rpTiles').evaluate(g => getComputedStyle(g).gridTemplateColumns.split(' ').length === 2) && !(await p.locator('#rpTiles', { hasText: '잔고' }).count()) && (await p.locator('#rpPanel-sum #rpTiles').count()) === 1 && !(await p.locator('#v-home #rpTiles, #v-home .rp-tile').count()), tiles.map(t => t.k));
    expect('타일 값 · 범위 · 주 수 · 상태 = 독립 계산 (오늘 기준과 7일씩 앞선 12번의 기준일)', tiles.every(t => { const w = want.find(x => x.k === t.k); return w && near(t.v, w.v) && near(t.lo, w.lo) && near(t.hi, w.hi) && t.n === w.n && t.st === w.st && t.val === (w.v == null ? '—' : FMT[t.k](w.v)); }),
      tiles.map(t => [t, want.find(x => x.k === t.k)]).filter(([t, w]) => !w || !near(t.v, w.v) || !near(t.lo, w.lo) || !near(t.hi, w.hi) || t.n !== w.n || t.st !== w.st));
    const apT = tiles.find(t => t.k === 'ap'), apW = want.find(w => w.k === 'ap');
    expect('결제 전 매입: 평소 범위 밖(높음) · 굵은 주황 숫자 + "높음 평소 a~b"', apT.st === 'high' && apW.v > apW.hi && apT.out && +apT.bold >= 700 && /^높음 ?평소 [\d,]+~[\d,]+만원$/.test(apT.rg) && apT.rg.endsWith(manT(apW.hi)), apT);
    const inT = tiles.filter(t => t.st === 'in'), fewT = tiles.filter(t => t.st === 'few');
    expect('범위 안 타일은 "평소 범위"(회색 · 굵지 않음 · 강조 없음)', inT.length >= 1 && inT.every(t => t.rg === '평소 범위' && !t.out && +t.bold < 700), inT);
    expect('기록이 8주 미만인 타일은 "기록 부족" (회수 일수: 입금 기록이 있는 주 < 8)', fewT.length >= 1 && fewT.some(t => t.k === 'coll') && fewT.every(t => t.rg === '기록 부족' && !t.out && t.n < 8), fewT);
    expect('타일마다 이름 있는 묶음(role=group) · aria-label에 이름 · 값 · 상태 · 범위 숫자', tiles.every(t => t.role === 'group' && t.aria.includes(t.val) && (t.st === 'few' ? t.aria.includes('기록 부족') : /직전 12주 .*\d/.test(t.aria) && t.aria.includes(t.st === 'in' ? '평소 범위' : t.st === 'high' ? '높음' : '낮음'))), tiles.map(t => t.aria));
    await p.click('#rpNormH .itip'); await p.waitForTimeout(80);
    const normTip = (await p.textContent('#tip-rpNorm')).replace(/\s+/g, ' ');
    expect('ⓘ에 직전 12주 정의 · 타일별 식', normTip.includes('직전 12주 = 오늘에서 7일씩 앞선 날 12번') && normTip.includes(mdAt(-7)) && normTip.includes(mdAt(-84)) && ['받을 돈 회수 일수 =', '연체율 =', '계산서 기한 내 발행 =', '결제 전 매입 =', '7일 순유입 ='].every(s => normTip.includes(s)), normTip);
    await p.click('#rpNormH .itip'); await p.waitForTimeout(60);
    if (SHOT) { await into('#rpNormH', 24); await shot('01l-report-tiles'); }
    if (SHOT) { await into('#rpRecon', 200); await shot('01f-report-recon'); }
    // (3) 연결 시트: 금액 같은 입금 전 매출 = 후보, 이름 일치(㈜누리 ↔ 누리상회) 1건 추천 · 고른 상태, 나머지는 "다른 매출"
    await p.click('#rpRecon'); await p.waitForTimeout(150);
    const sh = await p.evaluate(() => ({ title: document.getElementById('dlgTitle').textContent, amt: document.getElementById('rcAmt').textContent, kv: document.getElementById('rcKv').innerText.replace(/\s+/g, ' '),
      rec: [...document.querySelectorAll('#rcRec input')].map(i => [i.value, i.checked, i.closest('label').innerText.replace(/\s+/g, ' ')]), other: [...document.querySelectorAll('#rcOther input')].map(i => [i.value, i.checked, i.closest('label').innerText.replace(/\s+/g, ' ')]),
      otherH: (document.getElementById('rcOtherH') || {}).textContent, primary: document.querySelectorAll('#dlg button.primary').length, focus: document.activeElement.name + ':' + document.activeElement.value }));
    console.log('recon sheet:', sh.title, sh.amt, '|', sh.kv, '| 추천', sh.rec.map(r => r[2]).join(), '| 다른', sh.other.map(r => r[2]).join(' / '), '| focus', sh.focus);
    const byDue = amtSales.filter(x => x !== nuri).sort((a, z) => a.due < z.due ? -1 : 1).map(x => x.id);
    expect('연결 시트: 은행 = 장부 + 차이 · 후보 = 금액 같은 입금 전 매출 전부(3건)', sh.title === '미확인 입금' && sh.amt === manT(u0.amt) && sh.kv === '은행 잔고 ' + (S0.cash + gap).toLocaleString('ko-KR') + '원 장부 잔고 ' + S0.cash.toLocaleString('ko-KR') + '원 차이 ' + gap.toLocaleString('ko-KR') + '원' &&
      amtSales.length === 3 && sh.rec.length + sh.other.length === amtSales.length && [...sh.rec, ...sh.other].every(r => amtSales.some(x => x.id === r[0])), sh);
    expect('추천 = 누리상회(이름 · 금액 일치, 고른 상태 · 포커스) · 다른 매출 = 나머지(입금 예정일 순, 금액만 일치)', sh.rec.length === 1 && sh.rec[0][0] === nuri.id && sh.rec[0][1] && sh.rec[0][2].includes('추천') && sh.rec[0][2].includes('이름 · 금액 일치') &&
      sh.otherH === '다른 매출' && sh.other.map(r => r[0]).join() === byDue.join() && sh.other.every(r => !r[1] && r[2].includes('금액만 일치')) && sh.focus === 'rcPick:' + nuri.id && sh.primary === 1, sh);
    if (SHOT) await shot('01g-recon-sheet');
    // (4) 연결 → 누리상회 입금 확인(오늘 · 장부 잔고 + 330만원) · 미확인 입금 없음 → "합계 일치 ✓" · 은행 = 장부 · 부족 날짜와 금액 그대로
    await p.click('#dlgFoot [data-act="reconLink"]'); await p.waitForTimeout(150);
    const S1 = await st(), n1 = S1.sales.find(x => x.id === nuri.id), base1 = sim(S1), sf1 = sfOf(base1), pill1 = (await p.textContent('#rpRecon')).trim();
    const back = await p.evaluate(() => [document.getElementById('dlg').open, document.activeElement.id]);
    const rpSf1 = (await p.textContent('#sfCallout .sf-date')).trim(), rpAmt1 = (await p.textContent('#sfCallout .sf-amt')).trim();
    console.log('recon after:', pill1, '| toast', await p.textContent('#toast'), '| book', S0.cash, '→', S1.cash, '| bank', S1.cash + S1.bank.unmatched.reduce((a, u) => a + u.amt, 0), '| 누리상회', n1.status, n1.paidOn, '| 부족', JSON.stringify(sf0), '→', JSON.stringify(sf1), '|', rpSf1, rpAmt1);
    expect('연결 후 "합계 일치 ✓" · 시트 닫히고 합계 알약에 포커스', pill1 === '합계 일치 ✓' && (await p.locator('#rpRecon .tag.ok').count()) === 1 && !back[0] && back[1] === 'rpRecon', { pill1, back });
    expect('연결 = 입금 확인: 누리상회 입금 완료(오늘) · 장부 + 330만원 · 미확인 입금 0건 · 연결 기록 1건 · 은행 = 장부', n1.status === 'paid' && n1.paidOn === isoAt(0) && S1.cash === S0.cash + u0.amt && S1.bank.unmatched.length === 0 &&
      S1.bank.matched.length === 1 && S1.bank.matched[0].saleId === nuri.id && S1.cash + 0 === S0.cash + gap && S1.log.some(l => l.date === isoAt(0) && l.amt === u0.amt && l.label === '누리상회 입금'), { cash: S1.cash, bank: S1.bank });
    expect('부족 날짜 · 최저일 · 금액 그대로 (입금 예정일 전 잔고만 +330만원, 그날부터 같음)', sf0 && sf1 && sf1.start === sf0.start && sf1.min === sf0.min && sf1.amt === sf0.amt && rpSf1 === mdAt(sf0.start) + '부터 · D-' + sf0.start && rpAmt1 === manT(-sf0.amt) + ' 부족' &&
      base1.every((v, d) => d < dOf(nuri.due) ? v === base0[d] + u0.amt : v === base0[d]), { sf0, sf1, rpSf1, rpAmt1 });
    // 연결 뒤 부족 해결 이유 폭포: 오늘 잔고 = 장부 + 330만원(한 번) · 누리상회 입금은 폭포에서 빠짐 · 여전히 합계 일치 ✓ (두 번 잡히지 않음)
    await p.click('#sfCallout [data-act="shortSheet"]'); await p.waitForTimeout(150);
    const wf1 = await p.evaluate(() => ({ first: +document.querySelector('#sfWf li').dataset.amt, sum: [...document.querySelectorAll('#sfWf li')].filter(l => l.dataset.day != null).reduce((a, l) => a + +l.dataset.amt, 0),
      chk: Object.assign({}, document.getElementById('sfWfChk').dataset), txt: document.getElementById('sfWfChk').innerText.replace(/\s+/g, ' '), nuri: [...document.querySelectorAll('#sfWf li')].some(l => l.innerText.includes('누리상회')) }));
    console.log('waterfall after link:', JSON.stringify(wf1));
    expect('연결 뒤 이유 폭포: 오늘 잔고 = 장부 + 330만원 · 누리상회 입금 줄 없음 · 합계 = 예측 최저 · "합계 일치 ✓"', wf1.first === S1.cash && wf1.first + wf1.sum === sf1.amt && +wf1.chk.want === sf1.amt && wf1.chk.gap === '0' && wf1.txt.includes('합계 일치 ✓') && !wf1.nuri, wf1);
    await p.keyboard.press('Escape'); await p.waitForTimeout(120);
    await p.click('#rpRecon'); await p.waitForTimeout(150);
    const kv1 = await p.evaluate(() => [document.getElementById('dlgTitle').textContent, document.getElementById('rcKv').innerText.replace(/\s+/g, ' '), (document.getElementById('rcLast') || {}).textContent]);
    console.log('recon sheet after:', kv1.join(' | '));
    expect('연결 후 시트: 은행 잔고 = 장부 잔고 · 차이 0원 · 연결 기록', kv1[0] === '합계 일치' && kv1[1] === '은행 잔고 ' + S1.cash.toLocaleString('ko-KR') + '원 장부 잔고 ' + S1.cash.toLocaleString('ko-KR') + '원 차이 0원' && kv1[2].startsWith('누리상회 330만원 입금 확인'), kv1);
    if (SHOT) { await p.keyboard.press('Escape'); await p.waitForTimeout(120); await into('#rpRecon', 200); await shot('01h-report-recon-ok'); }
    expect('자금일보 요약 채움 버튼은 여전히 1개(부족 해결)', (await p.locator('#rpPanel-sum button.primary, #rpPanel-sum button.hot').count()) === 1 && (await p.locator('#reportBody > header button.primary, #reportBody > header button.hot').count()) === 0, null);
    // 담당자도 연결할 수 있음(장부 정리)
    await p.evaluate(v => { const s = JSON.parse(v); s.role = 'staff'; localStorage.setItem('flowpoint-test-v6', JSON.stringify(s)); }, snap0); await p.reload(); await p.waitForTimeout(150); await closePrompt(); await go('report');
    await p.click('#rpRecon'); await p.waitForTimeout(150); await p.click('#dlgFoot [data-act="reconLink"]'); await p.waitForTimeout(150);
    const S2 = await st();
    expect('담당자도 미확인 입금 연결 가능 → 합계 일치', S2.role === 'staff' && S2.bank.unmatched.length === 0 && S2.sales.find(x => x.id === nuri.id).status === 'paid' && (await p.textContent('#rpRecon')).trim() === '합계 일치 ✓', S2.bank);
    // 예전 저장 기록(은행 칸 없음) 이전: 입금 전 누리상회 330만원이 있으면 미확인 입금 1건, 이미 입금 확인했으면 0건
    //   (불러올 때 이전만 하고 저장은 하지 않으므로 화면의 합계 알약으로 확인)
    const pillNow = async () => { await go('report'); return [(await p.textContent('#rpRecon')).trim(), +(await p.getAttribute('#rpRecon', 'data-gap'))]; };
    await p.evaluate(v => { const s = JSON.parse(v); delete s.bank; localStorage.setItem('flowpoint-test-v6', JSON.stringify(s)); }, snap0); await p.reload(); await p.waitForTimeout(150); await closePrompt();
    const M1 = await pillNow();
    await p.evaluate(([v, id]) => { const s = JSON.parse(v); delete s.bank; const x = s.sales.find(y => y.id === id); x.status = 'paid'; x.paidOn = s.log[0].date; localStorage.setItem('flowpoint-test-v6', JSON.stringify(s)); }, [snap0, nuri.id]); await p.reload(); await p.waitForTimeout(150); await closePrompt();
    const M2 = await pillNow();
    console.log('migration: 누리상회 입금 전', M1.join(' '), '| 입금 확인 뒤', M2.join(' '));
    expect('예전 기록 이전: 누리상회 입금 전 → 미확인 입금 330만원("차이 330만원") / 입금 확인 뒤 → 없음("합계 일치 ✓")', M1[0] === '차이 330만원 · 확인 필요 ›' && M1[1] === 3300000 && M2[0] === '합계 일치 ✓' && M2[1] === 0, { M1, M2 });
    await p.evaluate(v => localStorage.setItem('flowpoint-test-v6', v), snap0); await p.reload(); await p.waitForTimeout(150); await closePrompt(); }

  // 0-4. 입금 확인이 미확인 입금을 소진(v7 단계 4 버그 수정): 이름 · 금액이 맞는 매출을 어느 경로로든 입금 확인하면 그 입금을 연결 → 은행에 두 번 잡히지 않음 (점검 뒤 되돌림)
  { const snap0 = await p.evaluate(() => localStorage.getItem('flowpoint-test-v6')), S0 = await st();
    const dOf = s => { const [y, m, d] = s.split('-').map(Number); return Math.round((new Date(y, m - 1, d) - dAt(0)) / 864e5); };
    const nuri = S0.sales.find(x => x.status === 'open' && x.party === '누리상회'), pill = async () => { await go('report'); await p.click('#rpTab-sum'); await p.waitForTimeout(80); return (await p.textContent('#rpRecon')).trim(); };
    // (a) 줄의 "입금 확인": 입금 예정일 당일로 날짜를 옮기면 누리상회 줄 버튼이 입금 확인
    await p.evaluate(([v, n]) => { const s = JSON.parse(v); s.dayOffset = n; localStorage.setItem('flowpoint-test-v6', JSON.stringify(s)); }, [snap0, dOf(nuri.due)]); await p.reload(); await p.waitForTimeout(150); await closePrompt();
    await go('sales'); const rb = p.locator('#saleRows li.tr-row:visible', { hasText: '누리상회' }).locator('[data-act="paid"]'), nRb = await rb.count();
    const c0 = (await st()).cash; await rb.first().click(); await p.waitForTimeout(150);
    const A1 = await st(), pa = await pill();
    console.log('bugfix row 입금 확인:', '누리상회 줄 버튼', nRb, '| pill', pa, '| unmatched', A1.bank.unmatched.length, '| matched', A1.bank.matched.map(m => m.sender + '→' + m.saleId).join(), '| cash +', A1.cash - c0);
    expect('줄 "입금 확인"(누리상회) → 미확인 입금 ㈜누리 소진 · "합계 일치 ✓" · 장부 +330만원 한 번', nRb === 1 && pa === '합계 일치 ✓' && A1.bank.unmatched.length === 0 && A1.bank.matched.length === 1 && A1.bank.matched[0].saleId === nuri.id &&
      A1.sales.find(x => x.id === nuri.id).status === 'paid' && A1.cash - c0 === 3300000, { nRb, pa, bank: A1.bank });
    // (b) 상세 시트의 "입금 확인"(오늘 날짜) → 같음
    await p.evaluate(v => localStorage.setItem('flowpoint-test-v6', v), snap0); await p.reload(); await p.waitForTimeout(150); await closePrompt();
    await go('sales'); await clickRow('saleRows', '누리상회', 'paid');
    const A2 = await st(), pb = await pill();
    expect('상세 시트 "입금 확인"(누리상회) → "합계 일치 ✓"', pb === '합계 일치 ✓' && A2.bank.unmatched.length === 0 && A2.bank.matched[0].saleId === nuri.id, { pb, bank: A2.bank });
    // (c) 금액만 같고 이름이 다른 매출(한결푸드 330만원) 입금 확인은 미확인 입금을 건드리지 않음
    await p.evaluate(v => localStorage.setItem('flowpoint-test-v6', v), snap0); await p.reload(); await p.waitForTimeout(150); await closePrompt();
    await go('sales'); await p.locator('#saleRows li.tr-row:visible', { hasText: '한결푸드' }).filter({ hasText: '330만원' }).locator('.tr-open').click(); await p.waitForTimeout(120);
    await p.click('#dlgBody [data-act="paid"]'); await p.waitForTimeout(150);
    const A3 = await st(), pc = await pill();
    console.log('bugfix detail:', pb, '| 한결푸드 330만원(이름 다름):', pc, A3.bank.unmatched.length);
    expect('이름이 다른 같은 금액 매출(한결푸드 330만원) 입금 확인 → 미확인 입금 그대로("차이 330만원")', pc === '차이 330만원 · 확인 필요 ›' && A3.bank.unmatched.length === 1 && A3.bank.matched.length === 0, { pc, bank: A3.bank });
    await p.evaluate(v => localStorage.setItem('flowpoint-test-v6', v), snap0); await p.reload(); await p.waitForTimeout(150); await closePrompt(); }

  // 0-5. 근거 원장(v7 단계 4): 시나리오용 지난 판단 2건 · 학습 데이터 N건 = 결과가 붙은 기록 · 지난 같은 상황(부족 해결 판단) · 새 보류 → 진행 중 → 부족 시작일 지나면 규칙대로 결과 (점검 뒤 되돌림)
  const ledGo = async () => { await go('score'); await p.click('#scSeg [data-sc="me"]'); await p.waitForTimeout(100); };
  const ledRows = () => p.evaluate(() => [...document.querySelectorAll('#scLedger .led-rec')].map(l => ({ id: l.dataset.id, res: l.dataset.res, seeded: l.dataset.seeded === '1', tag: l.querySelector('.led-tag .tag').textContent,
    tagCls: l.querySelector('.led-tag .tag').className, sc: (l.querySelector('.led-h > .tag.mute') || {}).textContent || '', txt: l.innerText.replace(/\s+/g, ' ') })));
  const ledN = async () => +(await p.textContent('#scLedN'));
  { const snap0 = await p.evaluate(() => localStorage.getItem('flowpoint-test-v6')), S0 = await st();
    const dOf = s => { const [y, m, d] = s.split('-').map(Number); return Math.round((new Date(y, m - 1, d) - dAt(0)) / 864e5); };
    const tot = x => Math.round(x.qty * x.price * 1.1), manT = v => Math.round(v / 10000).toLocaleString('ko-KR') + '만원', mdI = s => mdAt(dOf(s)), mdS = s => (([, m, d]) => +m + '/' + +d)(s.split('-'));
    // 시나리오용 2건: 늦게 지급한 매입(한빛패키지 1일 · 미래라벨) 결제일 2일 전 판단, 부족 시작 = 결제일
    const hb = S0.purchases.find(x => x.party === '한빛패키지' && x.paidOn && dOf(x.paidOn) - dOf(x.due) === 1), ml = S0.purchases.find(x => x.party === '미래라벨' && x.paidOn && x.paidOn > x.due);
    const sd = S0.decisions.filter(d => d.seeded), W = [[ml, 600000, '다른 자금으로 해결', 'unresolved', '부족 미해소'], [hb, 400000, '매입처와 결제일 조정', 'resolved', '부족 해소']];
    console.log('seeded:', sd.map(d => [d.date, d.sf.start, d.sf.need, d.reason, d.result.k, d.result.note].join(' · ')).join(' / '));
    expect('시나리오용 지난 판단 2건 = 보류 · 날짜는 늦게 지급한 매입에 맞춤(결제일 − 2일 판단 · 부족 시작 = 결제일)', sd.length === 2 && W.every(([x, need, reason, k]) => x && sd.some(d => d.choice === 'hold' && d.pick.id === x.id && d.date === isoAt(dOf(x.due) - 2) && d.sf.start === x.due && d.sf.need === need && d.reason === reason && d.result.k === k)) &&
      sd.find(d => d.pick.id === ml.id).result.note === '미래라벨 ' + manT(tot(ml)) + ' ' + (dOf(ml.paidOn) - dOf(ml.due)) + '일 늦게 지급 (' + mdS(ml.paidOn) + ')', sd);
    await ledGo(); let R = await ledRows();
    console.log('ledger:', 'N', await ledN(), '|', R.map(r => r.txt).join(' / '));
    expect('플로우스코어 근거 원장: 시나리오용 2건(최신 순) · "시나리오용" 태그 · 결과 색 + 단어 · 학습 데이터 2건', R.length === 2 && (await ledN()) === 2 && R.every(r => r.seeded && r.sc === '시나리오용') &&
      R.every((r, i) => { const [x, need, reason, k, word] = W[i]; return r.res === k && r.tag === word && r.tagCls.includes(k === 'resolved' ? 'ok' : 'bad') && r.txt.startsWith(mdAt(dOf(x.due) - 2)) &&
        r.txt.includes('상황 ' + manT(need) + ' 부족 · ' + mdI(x.due) + '부터') && r.txt.includes('결정 보류 · ' + reason) && r.txt.includes('결정자 대표'); }), R);
    await p.click('#scLedH .itip'); await p.waitForTimeout(60);
    const ledTip = (await p.textContent('#tip-scLed')).trim(); await p.click('#scLedH .itip'); await p.waitForTimeout(60);
    expect('근거 원장 ⓘ: 기록·표시만(점수 산식 반영 안 함) · 학습 데이터 안내 · 결과 규칙은 따로 ⓘ', ledTip === '기록·표시만 하며 점수 산식에는 반영하지 않아요. 결정과 결과가 쌓이면 다음 추천의 근거와 플로우스코어 학습 데이터가 됩니다.' && (await p.locator('#tip-scLedRule').count()) === 1, ledTip);
    // 부족 해결 시트 판단 구간: 지난 같은 상황(결과 붙은 최근 3건까지)
    await go('home'); await p.click('#sigBox [data-act="shortSheet"]'); await p.waitForTimeout(150);
    const past = () => p.evaluate(() => [...document.querySelectorAll('#sfPast tbody tr')].map(r => ({ id: r.dataset.id, res: r.dataset.res, txt: r.innerText.replace(/\s+/g, ' ') })));
    const P0 = await past(), inS4 = await p.evaluate(() => !!document.querySelector('#sfS4 #sfPast') && document.getElementById('sfPastH').textContent);
    console.log('지난 같은 상황:', inS4, '|', P0.map(r => r.txt).join(' / '));
    expect('부족 해결 판단 구간 "지난 같은 상황": 결과 붙은 기록 최신 순(미래라벨 부족 미해소 → 한빛패키지 부족 해소) · 시점 · 결정(사유) · 결과', inS4 === '지난 같은 상황' && P0.length === 2 &&
      P0[0].res === 'unresolved' && P0[0].txt.startsWith(mdS(isoAt(dOf(ml.due) - 2))) && P0[0].txt.includes('보류 다른 자금으로 해결') && P0[0].txt.includes('부족 미해소') &&
      P0[1].res === 'resolved' && P0[1].txt.includes('보류 매입처와 결제일 조정') && P0[1].txt.includes('부족 해소'), P0);
    if (SHOT) { await p.click('#sfSteps button >> nth=3'); await p.waitForTimeout(150); await into('#sfPastH', 0); await shot('01i-shortfall-past'); }
    // 새 보류 → 진행 중(학습 데이터에 안 셈) · 지난 같은 상황에도 안 나옴
    await p.click('#dlgBody [data-act="shortHold"]'); await p.waitForTimeout(150);
    await p.check('#holdBody input[value="다른 자금으로 해결"]'); await p.click('#holdOk'); await p.waitForTimeout(150);
    const P1 = await past(); await p.keyboard.press('Escape'); await p.waitForTimeout(120);
    const S1 = await st(), nd = S1.decisions.find(d => !d.seeded);
    await ledGo(); R = await ledRows();
    console.log('new hold:', JSON.stringify({ date: nd.date, sf: nd.sf, reason: nd.reason, result: nd.result }), '| ledger', R[0].txt, '| N', await ledN());
    expect('새 보류 → 근거 원장 맨 위 "진행 중"(회색) · 시나리오용 아님 · 학습 데이터는 그대로 2건', nd && nd.result === null && R.length === 3 && R[0].id === nd.id && R[0].res === 'wait' && R[0].tag === '진행 중' && R[0].tagCls.includes('mute') && !R[0].seeded && R[0].sc === '' &&
      R[0].txt.includes('결과 ' + mdI(nd.sf.start) + '이 지나면 붙어요') && (await ledN()) === 2 && P1.length === 2 && !P1.some(r => r.id === nd.id), { nd, R0: R[0] });
    // 부족 시작일 당일까지는 진행 중, 지나면 규칙대로: 시작일부터 장부 잔고 < 0 → 미해소 / 판단일~시작일 결제 매입을 못 냈거나 늦게 냄 → 미해소 / 아니면 해소
    const st0 = dOf(nd.sf.start);
    await p.evaluate(([v, n]) => { const s = JSON.parse(v); s.dayOffset = n; localStorage.setItem('flowpoint-test-v6', JSON.stringify(s)); }, [JSON.stringify(await st()), st0]); await p.reload(); await p.waitForTimeout(150); await closePrompt();
    const onStart = (await st()).decisions.find(d => d.id === nd.id).result;
    await p.click('footer [data-shift="1"]'); await p.waitForTimeout(150); await closePrompt();
    const S2 = await st(), d2 = S2.decisions.find(d => d.id === nd.id), t2 = isoAt(st0 + 1);
    const book = x => S2.cash - S2.log.filter(l => l.date > x).reduce((a, l) => a + l.amt, 0);
    const negDay = [nd.sf.start, ...S2.log.filter(l => l.date > nd.sf.start && l.date <= t2).map(l => l.date)].sort().find(x => book(x) < 0);
    const win = S2.purchases.filter(x => x.due >= nd.date && x.due <= nd.sf.start).sort((a, z) => a.due < z.due ? -1 : 1), openP = win.find(x => x.status === 'ordered'), lateP = win.find(x => x.status === 'paid' && x.paidOn > x.due);
    const wantK = negDay || openP || lateP ? 'unresolved' : 'resolved', wantNote = negDay ? null : openP ? openP.party + ' ' + manT(tot(openP)) + ' 미지급 (결제일 ' + mdS(openP.due) + ')' : lateP ? null : '잔고 0원 아래로 안 감';
    await ledGo(); R = await ledRows(); const r2 = R.find(r => r.id === nd.id);
    console.log('after start:', 'on start', onStart, '| +1', JSON.stringify(d2.result), '| want', wantK, wantNote, '| ledger', r2.txt, '| N', await ledN());
    expect('부족 시작일 당일까지는 결과 없음(진행 중)', onStart === null, onStart);
    expect('부족 시작일 다음 날 → 규칙대로 결과(독립 계산) · 학습 데이터 3건 · 태그 색 + 단어', d2.result && d2.result.k === wantK && (!wantNote || d2.result.note === wantNote) && d2.result.date === t2 && (await ledN()) === 3 &&
      r2.res === wantK && r2.tag === (wantK === 'resolved' ? '부족 해소' : '부족 미해소') && r2.tagCls.includes(wantK === 'resolved' ? 'ok' : 'bad') && r2.txt.includes('결과 ' + d2.result.note), { result: d2.result, wantK, wantNote });
    if (SHOT) { await into('#scLedH', 24); await shot('04a-score-ledger'); }
    // 다시 불러오거나 날짜를 더 옮겨도 붙은 결과는 그대로 (시나리오용도 그대로)
    await p.reload(); await p.waitForTimeout(150); await closePrompt();
    await p.click('footer [data-shift="7"]'); await p.waitForTimeout(150); await closePrompt();
    const S3 = await st();
    expect('결과는 한 번만: 다시 불러오기 · +7일 뒤에도 같은 결과 · 시나리오용 결과 그대로', JSON.stringify(S3.decisions.find(d => d.id === nd.id).result) === JSON.stringify(d2.result) &&
      JSON.stringify(S3.decisions.filter(d => d.seeded)) === JSON.stringify(sd), S3.decisions.map(d => d.result));
    // 예전 저장 기록(시나리오용 없음) 이전: 불러올 때 시나리오용 2건을 넣고 기존 기록은 그대로
    await p.evaluate(v => { const s = JSON.parse(v); s.decisions = s.decisions.filter(d => !d.seeded); localStorage.setItem('flowpoint-test-v6', JSON.stringify(s)); }, JSON.stringify(S3)); await p.reload(); await p.waitForTimeout(150); await closePrompt();
    await ledGo(); R = await ledRows();
    expect('예전 기록 이전: 시나리오용 2건 다시 들어감 · 기존 판단 그대로 · 학습 데이터 3건', R.length === 3 && R.filter(r => r.seeded && r.sc === '시나리오용').length === 2 && R.some(r => r.id === nd.id && r.res === wantK) && (await ledN()) === 3, R.map(r => r.txt));
    // 5건 넘으면 5건만 보이고 나머지는 "더 보기"
    await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('flowpoint-test-v6')), d = s.decisions.find(x => !x.seeded); for (let i = 0; i < 3; i++) s.decisions.push(Object.assign({}, d, { id: 'more' + i, result: null })); localStorage.setItem('flowpoint-test-v6', JSON.stringify(s)); });
    await p.reload(); await p.waitForTimeout(150); await closePrompt(); await ledGo();
    const more = await p.evaluate(() => [document.querySelectorAll('#scLedger > .led-list > .led-rec').length, (document.querySelector('#scLedger details.led-more > summary') || {}).textContent, document.querySelectorAll('#scLedger details.led-more .led-rec').length, document.querySelector('#scLedger details.led-more').open]);
    expect('6건 → 5건 보이고 1건은 "더 보기 (1건)" 아래(닫힘)', more[0] === 5 && more[1] === '더 보기 (1건)' && more[2] === 1 && !more[3], more);
    await p.evaluate(v => localStorage.setItem('flowpoint-test-v6', v), snap0); await p.reload(); await p.waitForTimeout(150); await closePrompt(); }

  // 1. 수집함: 담당자가 확인(줄을 눌러 상세 → 수정: 오렌지유통 계산서 후보의 입금 예정일, 세진화학 발주의 납품 예정일·요구사항) → 대표가 모두 승인 → 매입·매출에 등록
  const ibAct = async (party, act) => { await p.locator('#ibList .ib-row', { hasText: party }).locator('.ib-open').click(); await p.waitForTimeout(150); await p.click(`#dlgBody [data-act="${act}"]`); await p.waitForTimeout(150); };
  await p.click('#staffBtn'); await p.waitForTimeout(150);
  console.log('staff:', await p.textContent('#roleName'), '| prompt', await dlgOpen() ? await p.textContent('#dlgTitle') : '(없음)');
  await closePrompt(); await go('inbox');
  console.log('inbox staff:', await p.textContent('#ibHead'), '| rows', (await p.locator('#ibList .ib-row').evaluateAll(rs => rs.map(r => r.querySelector('b').textContent + ' ' + [...r.querySelectorAll('.flags .tag')].map(t => t.textContent).join(','))).catch(() => [])).join(' / '));
  await ibAct('오렌지유통', 'ibEdit');
  const due40 = isoAt(40);
  await p.fill('#ibe_due', due40); await p.click('#dlgFoot [data-act="ibSave"]'); await p.waitForTimeout(150);
  await ibAct('세진화학', 'ibEdit');
  await p.fill('#ibe_deliveryDue', isoAt(14)); await p.fill('#ibe_note', '오전 납품 · 드럼 포장'); await p.click('#dlgFoot [data-act="ibSave"]'); await p.waitForTimeout(150);
  await p.click('#ibBar [data-act="ibCheckAll"]'); await p.waitForTimeout(150);
  await go('orders');
  console.log('staff checked:', (await st()).inbox.map(c => c.party + ' ' + c.status).join(' / '), '| orders as staff:', await p.locator('#orderRows [data-act="ceoReq"], #orderRows [data-act="finance"]').first().textContent());
  await p.click('#staffBtn'); await p.waitForTimeout(150); await closePrompt(); await go('inbox');
  await top(); await shot('02-inbox-approve');
  console.log('inbox ceo:', await p.textContent('#ibHead'), '|', await p.textContent('#ibBar [data-act="ibApproveAll"]'), '| checked tags', await p.locator('#ibList .tag.ok', { hasText: '담당자 확인 완료' }).count());
  const rowB = await p.locator('#ibList .ib-row').evaluateAll(ls => ls.map(l => [...l.querySelectorAll('button')].filter(b => !b.classList.contains('ib-open')).map(b => b.textContent)));
  expect('승인함 줄마다 버튼 하나 "승인" (수정·반려는 줄을 눌러 상세 시트)', rowB.length === 2 && rowB.every(b => b.length === 1 && b[0] === '승인') && (await p.locator('#ibList [data-act="ibEdit"], #ibList [data-act="ibReject"]').count()) === 0, rowB);
  const nP = (await st()).purchases.length, nS = (await st()).sales.length;
  await p.click('#ibBar [data-act="ibApproveAll"]'); await p.waitForTimeout(150);
  let s = await st();
  console.log('approved:', s.inbox.map(c => c.party + ' ' + c.status).join(' / '), '| purchases +' + (s.purchases.length - nP), '| sales +' + (s.sales.length - nS), '|', await p.textContent('#ibHead'));
  { const oc = s.inbox.find(c => c.doc === 'tax' && c.party === '오렌지유통'), os = s.sales.find(x => x.id === oc.refId), sc = s.inbox.find(c => c.party === '세진화학' && !c.doc), sp = s.purchases.find(x => x.id === sc.refId);
    console.log('new deal from 계산서 후보:', os && [os.party, os.qty * os.price * 1.1, os.due, os.tax, os.taxOn, os.delivery].join(' '), '| 세진화학 발주 칸:', sp && [sp.deliveryDue, sp.terms, sp.note].join(' / '));
    expect('새 거래 후보(오렌지유통 678만원 계산서) 승인 → 매출 거래 생성 · 계산서 발행(오늘) · 입금 예정일 = 수정한 날짜', oc.status === 'approved' && os && os.party === '오렌지유통' && Math.round(os.qty * os.price * 1.1) === oc.amt && os.status === 'open' && os.tax === 'issued' && os.taxOn === isoAt(0) && os.taxRef === oc.id && os.due === due40 && os.delivery === 'before', os);
    expect('발주 칸이 거래에 저장: 납품 예정일 · 결제 조건(엑셀) · 요구사항', sp && sp.deliveryDue === isoAt(14) && sp.terms === '발주 후 30일' && sp.note === '오전 납품 · 드럼 포장', sp);
    await go('orders');
    await p.evaluate(id => [...document.querySelectorAll('#orderRows .tr-open')].find(b => b.dataset.id === id).click(), sp.id); await p.waitForTimeout(150);
    const kvT = (await p.locator('#dlgBody .dt-kv').innerText()).replace(/\s+/g, ' ');
    console.log('세진화학 상세:', kvT);
    expect('거래 상세 시트에 납품 예정일 · 요구사항', kvT.includes('납품 예정일 ' + mdAt(14)) && kvT.includes('요구사항 오전 납품 · 드럼 포장'), kvT);
    await p.click('#dlgLeft [data-act="close"]'); await p.waitForTimeout(100); }

  // 1-1. 줄 버튼 규칙 (납품·계산서 상태별 버튼 하나): 매입 납품 전·계산서 전 → 플로우페이로 결제, 납품 완료/계산서 받음 → 직접 결제
  //      매출 납품 완료·계산서 발행·입금 전 → 먼저 받기, 납품 완료·계산서 전 → 계산서 발행
  const rowBtn = async (list, amt) => { const r = p.locator(`#${list} li.tr-row:visible`, { hasText: amt }).first(); return (await r.locator('.tr-st').innerText()).replace(/\s+/g, ' ') + ' [' + ((await r.locator('button.small').count()) ? await r.locator('button.small').getAttribute('data-act') + ' ' + await r.locator('button.small').textContent() : '없음') + ']'; };
  await go('orders'); if (SHOT) { await top(); await shot('02a-orders-state'); }
  { const r1 = await rowBtn('orderRows', '1,573만원'), r2 = await rowBtn('orderRows', '968만원');
    console.log('row rule 매입:', r1, '/', r2);
    expect('대성원료 1,573만원: 납품 전 · 계산서 전 → 플로우페이로 결제', r1 === '납품 전 · 계산서 전 [finance 플로우페이로 결제]', r1);
    expect('대성원료 968만원: 납품 완료 · 계산서 받음 → 직접 결제', r2 === '납품 완료 · 계산서 받음 [pay 직접 결제]', r2); }
  await go('sales'); if (SHOT) { await top(); await shot('02b-sales-state'); }
  { const r3 = await rowBtn('saleRows', '660만원'), r4 = await rowBtn('saleRows', '1,241만원'), r5 = await rowBtn('saleRows', '303만원');
    console.log('row rule 매출:', r3, '/', r4, '/', r5);
    expect('그린마켓 660만원: 납품 완료 · 계산서 발행 → 먼저 받기', r3 === '납품 완료 · 계산서 발행 [factor 먼저 받기]', r3);
    expect('그린마켓 1,241만원: 납품 완료 · 계산서 전 → 계산서 발행', r4 === '납품 완료 · 계산서 전 [tax 계산서 발행]', r4);
    expect('브라이트몰 303만원(새 시나리오 매출): 먼저 받기', r5 === '납품 완료 · 계산서 발행 [factor 먼저 받기]', r5); }
  // 유동화 목록: 계산서 발행 + 납품 완료 채권만 (수집함에서 등록한 납품 전 매출은 빠짐)
  await go('factoring');
  console.log('factoring list:', (await p.locator('#arRows li').allInnerTexts()).map(t => t.replace(/\s+/g, ' ')).join(' / '));
  // 직접 결제: 대성원료 968만원 → 결제 완료(오늘) · 자금 예측에서 빠짐 (점검 뒤 원래 기록으로 되돌림)
  { const snap0 = await p.evaluate(() => localStorage.getItem('flowpoint-test-v6'));
    const out968 = async () => { await go('report'); return (await p.locator('#outList li').allInnerTexts()).map(t => t.replace(/\s+/g, ' ')).filter(t => t.includes('대성원료') && t.includes('968만원')).length; };
    const o0 = await out968(), c0 = (await st()).cash;
    await go('orders'); await p.locator('#orderRows li.tr-row:visible', { hasText: '968만원' }).locator('[data-act="pay"]').click(); await p.waitForTimeout(150);
    const x = (await st()).purchases.find(y => y.qty === 400 && y.party === '대성원료'), o1 = await out968();
    console.log('direct pay:', x.status, x.paidOn, '| 나갈 돈(14일) 대성원료 968만원', o0, '→', o1, '| cash', (await st()).cash - c0, '| toast', await p.textContent('#toast'));
    expect('직접 결제: 지급 완료(오늘) · 자금 예측에서 빠짐', x.status === 'paid' && x.paidOn === isoAt(0) && o0 === 1 && o1 === 0, { status: x.status, paidOn: x.paidOn, o0, o1 });
    await p.evaluate(v => localStorage.setItem('flowpoint-test-v6', v), snap0); await p.reload(); await p.waitForTimeout(150); await closePrompt(); }

  // 2. 브라이트몰 연체 입금 확인 · 3. 수집함에서 등록한 오렌지유통 매출(계산서 발행) 납품 완료 → 먼저 받기 (한결푸드 계산서 기한 지남 352만원은 계산서 자동 연결로 이미 발행)
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
  // 한결푸드 기한 지난 352만원은 수집된 세금계산서로 이미 발행(자동 연결) → 남은 미발행(440만원·330만원)은 뒤 플로우페이 묶음에 씀
  console.log('한결 미발행', (await st()).sales.filter(x => x.party === '한결푸드' && x.tax !== 'issued').map(x => manT0(x)).join(', '), '(352만원은 계산서 자동 연결로 발행)');
  // 수집함에서 방금 등록한 오렌지유통 매출(계산서로 들어와 발행됨 · 납품 전이라 줄 버튼 없음): 상세 시트에서 납품 완료 → 먼저 받기 (뒤에서 유동화 대상)
  const o0 = await rowBtn('saleRows', '678만원');
  await clickRow('saleRows', '678만원', 'dlvDone');
  const o1 = await rowBtn('saleRows', '678만원');
  console.log('오렌지유통(수집함) row:', o0, '→ 납품 완료', o1, '| tax:', (await st()).sales.filter(x => x.party === '오렌지유통').map(x => x.due.slice(5) + ' ' + x.tax).join(' / '));
  expect('계산서로 등록한 오렌지유통 678만원: 납품 전 · 계산서 발행 [없음] → 납품 완료 후 먼저 받기', o0 === '납품 전 · 계산서 발행 [없음]' && o1 === '납품 완료 · 계산서 발행 [factor 먼저 받기]', { o0, o1 });
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
  // 330만원 대신 440만원(한결푸드 200개, 계산서 기한 지남) 매출을 묶으면 충분 → 다음 단계로
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
  expect('플로우페이 신청 → 거래 상대 확인 대기 (미발행 매출 연결)', s.apps.length === 1 && s.apps[0].status === 'confirm', s.apps.map(a => a.status));
  // 근거 원장: 이 신청을 부족 해결에서 승인한 판단으로 기록(승인 → 신청 id 연결은 0-1b에서 화면으로 점검) → 결과는 상환 흐름에서 자동으로 붙음
  await p.evaluate(() => { const S = JSON.parse(localStorage.getItem('flowpoint-test-v6')), ap = S.apps[0], x = S.purchases.find(y => y.id === ap.refId);
    S.decisions.push({ id: 'led-app', date: ap.date, sf: { start: x.due, need: 2320000 }, pick: { kind: 'fp', id: x.id, party: x.party, amt: Math.round(x.qty * x.price * 1.1), cost: ap.saleSupply - x.qty * x.price }, choice: 'approve', reason: '추천안', memo: '', by: 'ceo', result: null, appId: ap.id });
    localStorage.setItem('flowpoint-test-v6', JSON.stringify(S)); });
  await p.reload(); await p.waitForTimeout(150); await closePrompt();
  const ledApp = async () => { await ledGo(); const r = (await ledRows()).find(x => x.id === 'led-app'), d = (await st()).decisions.find(x => x.id === 'led-app'); return { r, d, n: await ledN() }; };
  { const L0 = await ledApp(); console.log('ledger approve(신청 중):', L0.r.txt, '| N', L0.n);
    expect('승인 + 신청 → 근거 원장 "진행 중" · 신청 결과를 기다림 · 학습 데이터에 안 셈', L0.d.result === null && L0.r.res === 'wait' && L0.r.tag === '진행 중' && L0.r.txt.includes('결정 승인 플로우페이 대성원료 1,573만원 · 비용') && L0.r.txt.includes('신청 결과(완납·연체)가 나면 붙어요') && L0.n === 2, L0); }
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
  expect('거래 상대 확인 → 심사 대기', s.apps[0].status === 'review', s.apps[0].status);

  // 6. 심사역 전환 → 심사 대기(시안 1c: 숫자 4개 · 목록 · 이슈 피드) → 줄 → 상세(AI 검토 보고서) → 줄의 승인 → 사유 창(추천 사유 미리 체크) → 승인
  await role();
  console.log('hash after role:', await p.evaluate(() => location.hash), '| review tab visible:', await p.isVisible('header nav a[data-v="review"]'));
  console.log('portfolio:', (await p.locator('.pf-tbl tbody tr').evaluateAll(rs => rs.map(r => r.cells[0].querySelector('button').textContent + (r.querySelector('.tag.mute') ? '(예시)' : '') + ' ' + r.cells[6].textContent))).join(' / '));
  console.log('feed:', (await p.locator('#rvFeed [data-act="rvFilter"]').allTextContents()).join(' / '), '|', (await feedTags()).join(' / '));
  const rvRows = () => p.locator('#rvQueue tbody tr').count();
  const kpiTxt = () => p.evaluate(() => ['Amt', 'Avg', 'Mon', 'Iss'].map(x => document.getElementById('rvK' + x).textContent));
  // 숫자 4개를 기록(S.apps)과 이슈 피드에서 따로 계산해 비교: 대기 금액 = 심사 중 신청 금액 합 · 평균 처리 시간 = 판단한 신청의 (판단일 − 신청일) 평균 · 이번 달 처리 = 판단일이 이번 달 · 이슈 = 피드 "미확인" 줄 수
  const kpiCalc = async () => {
    const S1 = await st(), today = isoAt(S1.dayOffset || 0), dd = (a, b) => Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);
    const pend = S1.apps.filter(a => a.status === 'review'), dec = S1.apps.filter(a => a.decision && a.date), avg = dec.length ? dec.reduce((t, a) => t + Math.max(0, dd(a.date, a.decision.date)), 0) / dec.length : null;
    await p.click('#rvFeed [data-act="rvFilter"][data-f="open"]'); await p.waitForTimeout(100);
    if (await p.locator('#rvFeed [data-act="rvMore"]').count()) { await p.click('#rvFeed [data-act="rvMore"]'); await p.waitForTimeout(100); }
    const open = await p.locator('#rvFeed .rv-feed li:not(.empty)').count();
    await p.click('#rvFeed [data-act="rvFilter"][data-f="all"]'); await p.waitForTimeout(100);
    return [manT0({ qty: 1, price: pend.reduce((t, a) => t + a.amount, 0) / 1.1 }), avg == null ? '기록 없음' : avg < 0.05 ? '당일' : (Math.round(avg * 10) / 10) + '일',
      S1.apps.filter(a => a.decision && a.decision.date.slice(0, 7) === today.slice(0, 7)).length + '건', open + '건'];
  };
  { const k1 = await kpiTxt(), c1 = await kpiCalc();
    console.log('review kpi (1건 대기):', k1.join(' / '), '| 따로 계산', c1.join(' / '));
    expect('심사 대기 숫자 4개 = 따로 계산한 값 (대기 금액 1,573만원 · 평균 처리 시간 기록 없음 · 이번 달 처리 0건 · 미확인 이슈)', k1.join('|') === c1.join('|') && k1[0] === '1,573만원' && k1[1] === '기록 없음' && k1[2] === '0건', { k1, c1 }); }
  // 서비스 필터 · 고객사 검색: 유동화 → 0줄(조건 없음 안내) · 플로우페이 → 1줄 · 없는 이름 검색 → 0줄 → 필터 지우기 → 1줄 · 이름 일부 → 1줄
  { const f = [];
    await p.click('#rvSvc [data-f="ar"]'); await p.waitForTimeout(100); f.push(['ar', await rvRows(), await p.textContent('#rvQueue .rv-empty-t').catch(() => ''), await p.getAttribute('#rvSvc [data-f="ar"]', 'aria-pressed'), await p.evaluate(() => document.activeElement.dataset.f)]);
    await p.click('#rvSvc [data-f="buy"]'); await p.waitForTimeout(100); f.push(['buy', await rvRows()]);
    await p.click('#rvSvc [data-f="all"]'); await p.waitForTimeout(100);
    await p.fill('#rvSearch', '없는회사'); await p.waitForTimeout(100); f.push(['q-none', await rvRows(), await p.textContent('#rvQueue .rv-empty-t').catch(() => '')]);
    await p.click('#rvQueue [data-act="rvClear"]'); await p.waitForTimeout(100); f.push(['clear', await rvRows(), await p.inputValue('#rvSearch'), await p.evaluate(() => document.activeElement.id)]);
    await p.fill('#rvSearch', s.company.slice(0, 2)); await p.waitForTimeout(100); f.push(['q-part', await rvRows()]);
    await p.fill('#rvSearch', ''); await p.waitForTimeout(100);
    console.log('review filter/search:', JSON.stringify(f), '| seg', (await p.locator('#rvSvc button').allTextContents()).join(' / '));
    expect('서비스 필터 · 고객사 검색 (유동화 0줄 · 플로우페이 1줄 · 없는 이름 0줄 · 필터 지우기 1줄 · 이름 일부 1줄)', f[0][1] === 0 && f[0][2] === '조건에 맞는 신청이 없어요' && f[0][3] === 'true' && f[0][4] === 'ar' && f[1][1] === 1 &&
      f[2][1] === 0 && f[2][2] === '조건에 맞는 신청이 없어요' && f[3][1] === 1 && f[3][2] === '' && f[3][3] === 'rvSearch' && f[4][1] === 1, f); }
  // 목록 줄: 고객사 · 서비스 · 신청 금액 · 스코어 · 상태 + 반려(회색)·승인(색조, 채움 아님). 화면의 채움 버튼 0개
  { const r0 = await p.evaluate(() => { const tr = document.querySelector('#rvQueue tbody tr'); return { head: [...document.querySelectorAll('#rvQueue thead th')].map(t => t.textContent), cells: [...tr.cells].map(c => c.innerText.replace(/\s+/g, ' ').trim()),
      btn: [...tr.querySelectorAll('[data-act="rvReason"]')].map(b => b.textContent + ':' + b.className), fill: [...document.querySelectorAll('#v-review button.primary')].filter(b => b.offsetParent).length }; });
    console.log('review row:', JSON.stringify(r0));
    expect('목록 줄: 머리 6칸 · 고객사(신청일 줄) · 플로우페이 · 1,573만원 · 대기 · 반려 회색 · 승인 색조(채움 아님) · 채움 버튼 0개', r0.head.slice(0, 5).join() === '고객사,서비스,신청 금액,스코어,상태' && r0.cells[0].startsWith(s.company) && r0.cells[0].includes('신청 · 대성원료') &&
      r0.cells[1] === '플로우페이' && r0.cells[2] === '1,573만원' && r0.cells[4] === '대기' && r0.btn.join('|') === '반려:small|승인:small tinted' && r0.fill === 0, r0); }
  // 줄 안 고객사 버튼도 누르는 영역 44px 이상 (줄 전체가 상세를 열지만 키보드 초점은 이 버튼) · 줄 높이는 한 줄 표 그대로(100px 미만)
  { const nm = await p.evaluate(() => { const b = document.querySelector('#rvQueue .rv-name'), r = b.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), row: Math.round(b.closest('tr').getBoundingClientRect().height), sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }; });
    console.log('review name button:', JSON.stringify(nm));
    expect('심사 목록 고객사 버튼 44px 이상 · 줄 높이 100px 미만 · 가로 스크롤 없음', nm.h >= 44 && nm.w >= 44 && nm.row < 100 && nm.sw <= nm.cw, nm); }
  // 심사역 소개 미리보기: 심사 대기 1건 → 심사 화면과 같은 건수 · 신청 금액 · 신청 기업 점수
  { const rq = await p.evaluate(() => ({ n: document.querySelectorAll('#rvQueue tbody tr').length, qh: document.getElementById('rvQH').textContent, amt: [...document.querySelectorAll('#rvQueue .rv-am')].map(x => x.textContent),
      sc: [...document.querySelectorAll('#rvQueue .rv-sc')].map(x => (x.textContent.match(/(\d+)/) || [])[1]) }));
    await go('intro-review');
    const iq = await p.evaluate(() => ({ h: document.getElementById('irQH').textContent, meta: document.getElementById('irQMeta').textContent, head: [...document.querySelectorAll('#irQHead th')].map(t => t.textContent),
      rows: [...document.querySelectorAll('#irQRows tr')].map(r => [...r.cells].map(c => c.textContent)) }));
    await go('review');
    console.log('intro-review queue:', JSON.stringify(iq), '| #review', JSON.stringify(rq));
    expect('심사역 소개 미리보기 = 심사 대기 (건수 · 고객사 · 서비스 · 신청 금액 · 스코어)', iq.h === '심사 대기' && iq.meta === rq.n + '건' && rq.qh === '심사할 신청 ' + rq.n + '건' && rq.n === 1 && iq.head.join() === '고객사,서비스,신청 금액,스코어' &&
      iq.rows.length === rq.n && iq.rows.every((r, i) => r[0] === s.company && r[1] === '플로우페이' && r[2] === rq.amt[i] && r[3] === rq.sc[i]), { iq, rq }); }
  if (SHOT) { await top(); await shot('08a-review-queue'); }
  // 줄(버튼 아닌 곳)을 누르면 상세 시트: 위험 신호 · AI 검토 보고서 · 점수 근거. 닫으면 그 줄로 포커스. 키보드: 고객사 버튼 Enter → 열림, Esc → 줄로
  await p.click('#rvQueue tbody tr td.rv-sv'); await p.waitForTimeout(150);
  { const d0 = await p.evaluate(() => ({ open: document.getElementById('dlg').open, t: document.getElementById('dlgTitle').textContent, ai: document.querySelectorAll('#dlgBody .ai-rep').length, cols: document.querySelectorAll('#dlgBody .rv-col').length, foot: [...document.querySelectorAll('#dlgFoot button')].map(b => b.textContent).join(',') }));
    console.log('row click → detail:', JSON.stringify(d0));
    expect('줄 누름 → 상세 시트(심사 상세 · AI 검토 보고서 · 점수 근거 2칸 · 반려·승인)', d0.open && d0.t === '심사 상세' && d0.ai === 1 && d0.cols === 2 && d0.foot === '반려,승인', d0); }
  console.log('flags:', (await p.locator('#dlgBody .flags .tag').allTextContents()).join(' / '));
  const ai = p.locator('#dlgBody .ai-rep').first(), aiTxt = await ai.innerText();
  console.log('ai report: open', await ai.evaluate(d => d.open), '|', (await ai.locator('summary').innerText()).replace(/\s+/g, ' '), '|', (await ai.locator('h4').allTextContents()).join(' / '));
  console.log('ai phrases:', ['상환 매출', '최근 30일', '최근 90일', '규칙 기반 요약(AI 연동 예정)'].map(k => k + ' ' + aiTxt.includes(k)).join(' | '), '| risks', await ai.locator('.ai-risk li').count(), '| links', await ai.locator('.ai-risk li button').count(), '| checks', await ai.locator('.ai-ul').last().locator('li').count());
  console.log('ai summary:', await ai.locator('.ai-sum').textContent());
  await shot('08-review-ai');
  await p.click('#dlgLeft [data-act="close"]'); await p.waitForTimeout(150);
  const fc1 = await p.evaluate(() => document.activeElement.classList.contains('rv-name'));
  await p.focus('#rvQueue .rv-name'); await p.keyboard.press('Enter'); await p.waitForTimeout(150);
  const kd = await p.evaluate(() => document.getElementById('dlg').open && document.getElementById('dlgTitle').textContent);
  await p.keyboard.press('Escape'); await p.waitForTimeout(150);
  const fc2 = await p.evaluate(() => !document.getElementById('dlg').open && document.activeElement.classList.contains('rv-name'));
  expect('상세 시트 닫기 → 그 줄 고객사 버튼으로 포커스 · 키보드 Enter로 열고 Esc로 닫기', fc1 && kd === '심사 상세' && fc2, { fc1, kd, fc2 });
  // 반려도 사유 필수: 줄의 반려 → 반려 사유 창(주의 근거 미리 체크) → 모두 풀면 확정 비활성, 비활성을 풀어 눌러도(규칙) 반려 안 됨
  await p.click('#rvQueue tbody tr [data-act="rvReason"][data-r="reject"]'); await p.waitForTimeout(150);
  { const rj = await p.evaluate(() => ({ t: document.getElementById('dlgTitle').textContent, pre: [...document.querySelectorAll('#dlgBody .reasons input:checked')].map(x => x.value), n: document.querySelectorAll('#dlgBody .reasons input').length, ok: document.getElementById('rrOk').textContent }));
    await p.locator('#dlgBody .reasons input:checked').evaluateAll(xs => xs.forEach(x => x.click())); await p.waitForTimeout(80);
    const off = await p.isDisabled('#rrOk'), hint = await p.textContent('#rrHint');
    await p.evaluate(() => { const b = document.getElementById('rrOk'); b.disabled = false; b.click(); }); await p.waitForTimeout(120);
    const after = { status: (await st()).apps[0].status, toast: await p.textContent('#toast'), open: await dlgOpen() };
    console.log('reject sheet:', JSON.stringify(rj), '| 0개 → disabled', off, hint, '| 강제 누름', JSON.stringify(after));
    expect('줄의 반려 → 반려 사유 창(사유 8개 · 주의 근거 미리 체크) · 0개면 확정 비활성 · 규칙상 반려 안 됨', rj.t === '반려 사유' && rj.n === 8 && rj.pre.join() === '세금계산서 미발행' && rj.ok === '반려하기' && off && hint.includes('하나 이상') &&
      after.status === 'review' && after.toast === '판단 사유를 하나 이상 골라 주세요' && after.open, { rj, off, hint, after }); }
  await p.click('#dlgLeft [data-act="close"]'); await p.waitForTimeout(150);
  // 줄의 승인 → 승인 사유 창: AI 보고서 근거로 미리 체크(입금 이력 양호 · 세금계산서 미발행) · 0개면 비활성 → 두 사유로 승인(이전과 같은 사유 · 같은 하류 숫자)
  await p.click('#rvQueue tbody tr [data-act="rvReason"][data-r="approve"]'); await p.waitForTimeout(150);
  { const ap0 = await p.evaluate(() => ({ t: document.getElementById('dlgTitle').textContent, pre: [...document.querySelectorAll('#dlgBody .reasons input:checked')].map(x => x.value), off: document.getElementById('rrOk').disabled, ok: document.getElementById('rrOk').className, tip: !!document.querySelector('#dlgBody .itip') }));
    await shot('08b-review-reason');
    await p.locator('#dlgBody .reasons input:checked').evaluateAll(xs => xs.forEach(x => x.click())); await p.waitForTimeout(80);
    const off = await p.isDisabled('#rrOk');
    await p.locator('#dlgBody .reasons label', { hasText: '입금 이력 양호' }).locator('input').check();
    await p.locator('#dlgBody .reasons label', { hasText: '세금계산서 미발행' }).locator('input').check();
    const on = !(await p.isDisabled('#rrOk'));
    await p.click('#rrOk'); await p.waitForTimeout(200);
    const a0 = (await st()).apps[0], fq = await p.evaluate(() => [document.getElementById('dlg').open, document.activeElement.id]);
    console.log('approve sheet:', JSON.stringify(ap0), '| 0개 → disabled', off, '| 2개 → enabled', on, '| after approve:', (await st()).apps.map(a => a.status), a0.decision.reasons.join(','), '| focus', fq.join(' '));
    expect('줄의 승인 → 승인 사유 창(추천 사유 미리 체크 · 확정 가능 · 채움 버튼 · ⓘ 규칙)', ap0.t === '승인 사유' && ap0.pre.join() === '입금 이력 양호,세금계산서 미발행' && !ap0.off && ap0.ok === 'primary' && ap0.tip, ap0);
    expect('사유 0개면 확정 비활성 · 사유 고르면 승인 → 서명 대기 · 판단 사유 기록 · 창 닫히고 목록 제목으로 포커스', off && on && a0.status === 'sign' && a0.decision.result === '승인' && a0.decision.reasons.join() === '입금 이력 양호,세금계산서 미발행' && !fq[0] && fq[1] === 'rvQH', { off, on, status: a0.status, d: a0.decision, fq }); }
  { const k2 = await kpiTxt(), c2 = await kpiCalc(), e2 = await p.textContent('#rvQueue .rv-empty-t');
    console.log('review kpi (승인 후):', k2.join(' / '), '| 따로 계산', c2.join(' / '), '|', e2);
    expect('승인 후 숫자 4개 = 따로 계산 (대기 금액 0만원 · 평균 처리 시간 당일 · 이번 달 처리 1건) · 빈 상태', k2.join('|') === c2.join('|') && k2[0] === '0만원' && k2[1] === '당일' && k2[2] === '1건' && e2 === '심사 대기 0건', { k2, c2, e2 }); }

  // 7. 고객(대표) 전자서명 → 집행, 거래 문서 7종 생성 (① 고객 발주서 완료 · ② 매입처 발주서 보냄)
  await role();
  await p.click('[data-act="sign"]'); await p.waitForTimeout(120);
  s = await st(); console.log('after sign:', s.apps.map(a => a.status), '| 대성 650:', (x => `${x.status} repay ${x.repayAmount} on ${x.repayDate}`)(s.purchases.find(x => x.qty === 650)), '| 그린마켓 470:', s.sales.find(x => x.qty === 470).status);
  console.log('deal docs after sign:', await docSt());
  expect('전자서명 → 집행 · 매입 플로우페이 결제 · 상환일 = 마지막 묶은 매출 입금일 · 문서 1 완료 · 2 보냄', s.apps[0].status === 'done' && (x => x.status === 'financed' && x.repayAmount === s.apps[0].repayTotal && x.repayDate === s.apps[0].payDate)(s.purchases.find(x => x.qty === 650)) && (await docSt()) === 'done sent wait wait wait wait wait',
    { status: s.apps[0].status, docs: await docSt() });
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
  expect('매입처 링크 서명·세금계산서 → 대금 지급 · 고객사 세금계산서 발행 (문서 1~4 완료)', (await docSt()) === 'done done done done sent sent wait', await docSt());

  // 10. 고객(대표): 납품 확인 (거래명세서 서명 · 입고 사진 · 입금일 확인)
  await role(); await go('deals');
  await deliver(true);
  s = await st(); console.log('after delivery:', await docSt(), '| photo saved', s.deals[0].photo.length <= 150 * 1024);
  expect('납품 확인 → 문서 1~6 완료 · 7(넘김) 진행 · 사진 150KB 이하', (await docSt()) === 'done done done done done done due' && s.deals[0].photo.length <= 150 * 1024, await docSt());

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
  { const r = await rem(), payDay = (await st()).apps[0].payDate.slice(5);
    expect('+30일: 그린마켓 입금일 기준 D-7 · 당일 · D+1 안내 보냄, 넘긴 금액은 그대로', (await day()).includes(mdAt(30) + ' (+30일)') && r.includes('D-day@' + payDay) && /D-7@/.test(r) && /D\+1@/.test(r) && (await fw()) === 'fwd 4400000 = 4400000 / 15965090 · outcome -', { r, payDay }); }
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
  { const L1 = await ledApp(), lg = s.scoreLog.find(l => l.target === '우리 회사' && l.why.startsWith('플로우페이 상환 완료')); console.log('ledger approve(완납):', JSON.stringify(L1.d.result), '|', L1.r.txt, '| N', L1.n);
    expect('묶음 상환 완납 → 근거 원장 결과 "완납"(초록) · 점수 변화 = 점수 변동 기록(+25점) · 학습 데이터 3건', L1.d.result && L1.d.result.k === 'repaid' && L1.d.result.delta === lg.after - lg.before && L1.d.result.delta === 25 &&
      L1.r.tag === '완납' && L1.r.tagCls.includes('ok') && L1.r.txt.includes('점수 +25점') && L1.n === 3, L1); }
  await role();
  console.log('reviewer after-care done:', await rvRow());
  await go('deals'); await p.click('#dlDetail [data-act="thanksOpen"]'); await p.waitForTimeout(150);
  const thPrev = (await p.locator('dialog .mail-fig > div').allInnerTexts()).map(t => t.replace(/\s+/g, ' ')).join(' / ');
  console.log('thanks preview:', await p.textContent('#dlgTitle'), '|', await p.textContent('dialog .mail-h .subj'), '|', thPrev);
  { const a = s.apps[0], pu = s.purchases.find(x => x.qty === 650);
    expect('완납: 넘긴 합계 15,965,090 = 넘길 금액, outcome repaid(자동), 매입 상환 완료, 문서 7종 완료', a.outcome === 'repaid' && a.auto && (a.fwd || []).reduce((t, f) => t + f.amt, 0) === 15965090 && pu.status === 'repaid' && s.deals[0].status === 'done' && s.deals[0].docs.every(x => x.status === 'done'), { outcome: a.outcome, fwd: a.fwd, pu: pu.status, deal: s.deals[0].status });
    // 점수·한도는 실행 날짜에 따라 절대값이 달라지므로 변화량으로 본다 (완납 +25점 → 한도 +1,000만 × 0.7(기한 지난 계산서) = +700만)
    const manT = v => Math.round(v / 10000).toLocaleString('ko-KR') + '만원';
    expect('완납 점수 +25', s.scoreLog.some(l => l.target === '우리 회사' && l.after - l.before === 25 && l.why.startsWith('플로우페이 상환 완료')), s.scoreLog.slice(-3));
    expect('감사 메일: 점수 +25 · 한도 +700만', th && th.scoreAfter - th.scoreBefore === 25 && th.limAfter - th.limBefore === 7000000 && thPrev.includes(th.scoreBefore + '점 → ' + th.scoreAfter + '점') && thPrev.includes(manT(th.limBefore) + ' → ' + manT(th.limAfter)), thPrev); }
  await shot('13-thanks-mail');
  await p.click('#dlgLeft [data-act="close"]'); await p.waitForTimeout(100);
  await p.click('footer [data-shift="7"]'); await p.waitForTimeout(150);
  console.log('+37일:', await day(), '| reminders:', await rem(), '| outcome stays', (await st()).apps[0].outcome);

  // 13. 유동화: 수집함에서 등록한 오렌지유통 매출(12월 18일 입금 예정, 세금계산서 발행함) → 신청 → 승인 → 서명 → 채무자 통지 → 연체
  await role();
  await go('sales');
  await clickRow('saleRows', '오렌지유통', 'factor');
  { const fT = await p.textContent('#dlgTitle'), fSum = (await p.locator('#dlgBody .sum').first().innerText()).replace(/\s+/g, ' ');
    console.log('먼저 받기 → ', fT, '|', fSum);
    expect('매출 줄 먼저 받기 → 유동화 신청 · 그 채권(오렌지유통 678만원)이 미리 선택', fT === '유동화 신청' && fSum.includes('오렌지유통') && fSum.includes('678만원'), fSum); }
  await p.check('#arc1'); await p.check('#arc2'); await p.click('#arNext'); await p.waitForTimeout(150);
  await next(); // ② 채권 정보 → ③ 서류 확인 (날짜를 옮기는 동안 유효기간이 지난 서류는 다시 올림)
  const arNeed = await p.locator('dialog [data-act="upload"][data-ctx="apply"]:not(:has-text("미리"))').evaluateAll(bs => bs.map(x => x.closest('.docrow').firstChild.firstChild.textContent.trim()));
  while (await p.locator('dialog [data-act="upload"][data-ctx="apply"]:not(:has-text("미리"))').count()) { await p.locator('dialog [data-act="upload"][data-ctx="apply"]:not(:has-text("미리"))').first().click(); await p.waitForTimeout(120); }
  console.log('ar step3 re-upload:', arNeed.join(' / ') || '(없음)');
  await next(); // ③ → ④ 확인하고 신청
  await p.click('dialog [data-act="submitApply"]'); await p.waitForTimeout(150);
  console.log('ar app:', (x => x ? x.status + ' ' + x.amount : 'none')((await st()).apps[1]));
  await role();
  // 줄의 승인 → 사유 창: 미리 체크를 풀고 '관련 거래처 우량'만 골라 승인 (이전과 같은 사유)
  await p.click('#rvSvc [data-f="ar"]'); await p.waitForTimeout(100);
  { const arRow = await p.evaluate(() => [...document.querySelectorAll('#rvQueue tbody tr')].map(r => r.cells[1].textContent + ' ' + r.cells[2].textContent).join(' / '));
    await p.click('#rvQueue tbody tr [data-act="rvReason"][data-r="approve"]'); await p.waitForTimeout(150);
    const pre = await p.locator('#dlgBody .reasons input:checked').evaluateAll(xs => xs.map(x => x.value));
    await p.locator('#dlgBody .reasons input:checked').evaluateAll(xs => xs.forEach(x => x.click())); await p.waitForTimeout(80);
    await p.locator('#dlgBody .reasons label', { hasText: '관련 거래처 우량' }).locator('input').check();
    await p.click('#rrOk'); await p.waitForTimeout(150);
    const a1 = (await st()).apps[1];
    console.log('ar review row:', arRow, '| pre-checked', pre.join(',') || '(없음)', '| after', a1.status, a1.decision.reasons.join(','));
    expect('유동화 필터 줄 → 승인 사유 창 → 관련 거래처 우량으로 승인 → 서명 대기', arRow === '유동화 678만원' && a1.status === 'sign' && a1.decision.reasons.join() === '관련 거래처 우량', { arRow, a1: a1.status }); }
  await p.click('#rvSvc [data-f="all"]'); await p.waitForTimeout(100);
  await role();
  await go('factoring'); await p.click('#appsAr [data-act="sign"]'); await p.waitForTimeout(120);
  const cashBefore = (await st()).cash;
  console.log('ar after sign:', (await st()).apps[1].status);
  await into('#appsAr'); await shot('14-notice-wait');
  await p.click('#appsAr [data-act="notice"]'); await p.waitForTimeout(120);
  console.log('ar after notice:', (await st()).apps[1].status, '| cash +', (await st()).cash - cashBefore);
  { const a1 = (await st()).apps[1], got = (await st()).cash - cashBefore;
    expect('유동화: 심사 승인 · 서명 · 채무자 통지 → 완료 · 채권액보다 적은 금액(비용 차감)이 먼저 들어옴', a1.type === 'ar' && a1.status === 'done' && got > 0 && got < 6776000, { status: a1.status, got }); }
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
  expect('D+8 자동 연체: outcome late · 매입 연체일 기록 · 점수 −120', s.apps[0].outcome === 'late' && s.apps[0].outDate === isoAt(13) && s.purchases.find(x => x.qty === 650).repayLate === isoAt(13) &&
    s.scoreLog.slice(scLate).some(l => l.target === '우리 회사' && l.before - l.after === 120 && l.why.startsWith('플로우페이 연체')), s.scoreLog.slice(scLate));
  { const L2 = await ledApp(); console.log('[부록] ledger approve(연체):', JSON.stringify(L2.d.result), '|', L2.r.txt);
    expect('[부록] 넘김 기한 지나 자동 연체 → 근거 원장 결과 "연체"(빨강) · 점수 −120점', L2.d.result && L2.d.result.k === 'late' && L2.d.result.delta === -120 && L2.r.tag === '연체' && L2.r.tagCls.includes('bad') && L2.r.txt.includes('점수 −120점') && L2.n === 3, L2); }
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
  { const L3 = await ledApp(), lg = s.scoreLog.slice(scL).find(l => l.target === '우리 회사' && l.why.startsWith('플로우페이 연체 후 완납')); console.log('[부록] ledger approve(연체 후 완납):', JSON.stringify(L3.d.result), '|', L3.r.txt);
    expect('[부록] 연체 뒤 다 넘김 → 근거 원장 결과 "연체 후 완납"(주황) · 점수 변화 = 점수 변동 기록', L3.d.result && L3.d.result.k === 'lateRepaid' && lg && L3.d.result.delta === lg.after - lg.before && L3.r.tag === '연체 후 완납' && L3.r.tagCls.includes('warn') && L3.n === 3, { L3, lg }); }
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
  expect('처음부터 다시 → 앱 홈(#home) · entered=true', (await p.evaluate(() => location.hash)) === '#home' && s.entered === true, s.entered);
  // 고객(대표) 역할에서 #review 직접 접근 차단
  await go('review'); console.log('ceo #review →', await p.evaluate(() => location.hash));
  console.log('errors:', errs.length ? errs : 'none');
  expect('페이지 오류 없음', !errs.length, errs);
  await b.close();
  console.log(fails.length ? `checks: ${fails.length} failed — ${fails.join(' / ')}` : 'checks: all passed');
  if (fails.length) process.exit(1);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
