// 수집함·승인함 점검: CSV·엑셀 실제 읽기, AI 추출 예시, 담당자 확인 → 대표 일괄 승인, 접속·역할 전환 승인 창, 엑셀 도구 불러오기 실패
// 사용법: node tests/inbox.js /절대/경로/index.html [--shots=캡처폴더] [--xlsx=xlsx.full.min.js 로컬 사본]
//   --xlsx를 주면 CDN 요청을 그 파일로 돌려 네트워크 없이 엑셀 읽기를 점검한다 (없으면 실제 CDN에서 불러옴)
const { chromium } = require('playwright');
const fs = require('fs'), os = require('os'), path = require('path');
const FILE = 'file://' + process.argv[2];
const arg = k => (process.argv.find(a => a.startsWith('--' + k + '=')) || '').split('=').slice(1).join('=') || null;
const SHOT = arg('shots'), XLSX_LOCAL = arg('xlsx');
const KEY = 'flowpoint-test-v6', CDN = /cdn\.jsdelivr\.net\/npm\/xlsx@0\.18\.5/;
const fails = [];
const check = (ok, msg) => { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) fails.push(msg); };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fp-inbox-'));
const write = (name, data) => { const f = path.join(tmp, name); fs.writeFileSync(f, data); return f; };
const iso = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

// 1) 쉼표 CSV: BOM, 따옴표 안 쉼표("22,000"), 2026.11.30 형식 날짜, 구분 열
const csv1 = write('발주_쉼표.csv', '﻿구분,거래처,품목,수량,단가(원),결제일\r\n' +
  '매입,대성원료,면 원단,300,"22,000",' + iso(20).replace(/-/g, '.') + '\r\n' +
  '매출,"누리상회, 본점",완제품 C,120,30000,' + iso(35) + '\r\n' +
  '\r\n');
// 2) 탭 CSV: 영어+한국어 열 이름, 구분 열 없음 → 매입처 열 이름으로 매입 추정, 읽을 수 없는 수량·빈 날짜는 확인 필요
const csv2 = write('vendor_orders.csv', '매입처\titem\tqty\tunit price\tdue\n' +
  '미래라벨\t라벨 인쇄\t8000\t200\t' + iso(25).replace(/-/g, '') + '\n' +
  '한빛패키지\t포장 박스\t많이\t1300\t\n');

(async () => {
  // 한글 파일 이름(내려받기·올리기)이 깨지지 않도록 브라우저를 UTF-8 로캘로 띄운다 (LANG이 비어 있는 환경 대비)
  const b = await chromium.launch({ env: Object.assign({}, process.env, { LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' }) });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2, acceptDownloads: true });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  if (XLSX_LOCAL) await ctx.route(CDN, r => r.fulfill({ status: 200, contentType: 'application/javascript', headers: { 'Access-Control-Allow-Origin': '*' }, body: fs.readFileSync(XLSX_LOCAL) }));
  await p.goto(FILE); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(200);
  const st = () => p.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
  const go = async h => { await p.evaluate(x => location.hash = x, h); await p.waitForTimeout(150); };
  const dlgOpen = () => p.evaluate(() => document.getElementById('dlg').open);
  const shot = async n => { if (!SHOT) return; await p.evaluate(() => document.getElementById('toast').classList.remove('show')); await p.waitForTimeout(250); await p.screenshot({ path: path.join(SHOT, n + '.png') }); };
  // 파일은 이름·내용으로 넘긴다 (한글 경로를 그대로 넘기면 로캘에 따라 파일이 빠질 수 있음). 안내 문구가 새로 채워질 때까지 기다림
  const asPayload = f => ({ name: path.basename(f), mimeType: 'application/octet-stream', buffer: fs.readFileSync(f) });
  const upload = async files => {
    await p.evaluate(() => { document.getElementById('ibMsg').textContent = ''; });
    await p.setInputFiles('#ibFile', files.map(asPayload));
    await p.waitForFunction(() => document.getElementById('ibMsg').textContent.length > 0); await p.waitForTimeout(150);
  };

  // 접속 시 승인 창 (시나리오: 이메일 발주 파일 1개에서 읽은 2건, 그중 1건은 날짜 확인 필요)
  check(await dlgOpen(), '접속 시 승인 창: ' + await p.textContent('#dlgTitle'));
  check((await p.textContent('#dlgTitle')).includes('2건'), '승인 창에 대기 2건');
  await shot('v3s3-prompt-1280');
  await p.click('#dlgFoot [data-act="ibOpen"]'); await p.waitForTimeout(200);
  check(await p.evaluate(() => location.hash) === '#inbox', '승인함 열기 → #inbox');
  check((await p.textContent('.side .ib-badge')).includes('2'), '사이드바 수집함 배지 2');
  await p.reload(); await p.waitForTimeout(200);
  check(!(await dlgOpen()), '같은 날 다시 접속하면 승인 창이 다시 뜨지 않음');

  // CSV 읽기
  const before = await st();
  await upload([csv1, csv2]);
  let s = await st();
  const added = s.inbox.filter(c => c.source === 'csv');
  check(added.length === 4, 'CSV 2개에서 거래 후보 4건 (빈 줄 무시): ' + added.length);
  const dae = added.find(c => c.party === '대성원료'), nuri = added.find(c => c.party === '누리상회, 본점');
  check(dae && dae.type === 'buy' && dae.price === 22000 && dae.due === iso(20) && !Object.keys(dae.flags).length, '쉼표 CSV: 따옴표 안 "22,000" → 22000, 2026.11.30 형식 날짜, 매입');
  check(nuri && nuri.type === 'sale' && nuri.qty === 120, '쉼표 CSV: 따옴표 안 쉼표가 든 거래처, 매출');
  const mirae = added.find(c => c.party === '미래라벨'), hanbit = added.find(c => c.party === '한빛패키지');
  check(mirae && mirae.type === 'buy' && mirae.flags.type === 'inferred' && mirae.due === iso(25), '탭 CSV: 구분 열 없음 → 매입처 열 이름으로 매입 추정, 20261130 형식 날짜');
  check(hanbit && hanbit.flags.qty === 'invalid' && hanbit.raw.qty === '많이' && hanbit.flags.due === 'missing', '탭 CSV: 읽을 수 없는 수량·빈 날짜 → 확인 필요');
  check(await p.locator('#ibList .tag.warn', { hasText: '확인 필요' }).count() >= 2, '확인 필요 배지 표시');
  console.log('     ibMsg:', (await p.textContent('#ibMsg')).replace(/\s+/g, ' '));

  // 샘플 발주 파일 받기 → 그대로 올리기
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('[data-act="ibSample"]')]);
  const sample = path.join(tmp, dl.suggestedFilename()); await dl.saveAs(sample);
  const sampleText = fs.readFileSync(sample, 'utf8');
  check(dl.suggestedFilename().endsWith('.csv') && sampleText.startsWith('﻿구분,거래처'), '샘플 CSV 내려받기: ' + dl.suggestedFilename());
  await upload([sample]);
  s = await st();
  const smp = s.inbox.filter(c => c.fileName === dl.suggestedFilename());
  check(smp.length === 4 && smp.every(c => !Object.keys(c.flags).length) && smp.filter(c => c.type === 'buy').length === 2, '샘플 CSV 4건 (매입 2·매출 2) 모두 읽음');

  // PDF → AI 추출 예시 1건 (모든 칸 예시, 수정 전에는 승인 불가)
  await upload([write('거래명세서_동아물류.pdf', '%PDF-1.4 test')]);
  s = await st();
  const ai = s.inbox.find(c => c.source === 'ai');
  check(ai && ai.party === '동아물류' && Object.values(ai.flags).every(v => v === 'sample') && Object.keys(ai.flags).length === 6, 'PDF → AI 추출 예시 1건 (6칸 모두 예시)');
  check(await p.locator('#ibList .ib-orig', { hasText: '거래명세서_동아물류.pdf' }).count() === 1, 'AI 예시: 원본 파일 이름 미리보기와 "다음 단계" 안내');
  await p.evaluate(() => window.scrollTo(0, 0)); await shot('v3s3-inbox-1280');

  // 담당자: 모두 확인 완료 → 확인 필요 건은 그대로
  await p.click('#staffBtn'); await p.waitForTimeout(200);
  // 승인 창은 역할마다 하루 한 번: 같은 날이라도 담당자는 처음이면 뜬다
  check(await dlgOpen(), '같은 날 담당자 첫 전환: 담당자 승인 창 (역할별 하루 한 번)');
  if (await dlgOpen()){ await p.click('#dlgLeft [data-act="close"]'); await p.waitForTimeout(100); }
  await p.click('#staffBtn'); await p.waitForTimeout(200); await p.click('#staffBtn'); await p.waitForTimeout(200);
  check(!(await dlgOpen()), '같은 날 담당자 다시 전환: 승인 창 다시 안 뜸');
  await go('inbox');
  check(await p.locator('#ibBar [data-act="ibApproveAll"]').count() === 0 && await p.locator('#ibBar .ceo-req').count() === 1, '담당자: 일괄 승인 대신 대표 승인 요청');
  await p.click('#ibBar [data-act="ibCheckAll"]'); await p.waitForTimeout(150);
  s = await st();
  const openC = s.inbox.filter(c => c.status === 'new' || c.status === 'checked');
  const blocked = c => Object.values(c.flags).some(v => ['missing', 'invalid', 'sample'].includes(v));
  check(openC.filter(c => !blocked(c)).every(c => c.status === 'checked') && openC.filter(blocked).every(c => c.status === 'new'), '담당자 모두 확인 완료: 확인 필요 없는 ' + openC.filter(c => !blocked(c)).length + '건만 확인 완료');
  // 담당자가 한빛패키지 건을 수정 → 확인 필요 사라짐 → 확인 완료
  await p.locator('#ibList .ib-row', { hasText: '한빛패키지' }).locator('[data-act="ibEdit"]').click(); await p.waitForTimeout(150);
  check(await dlgOpen() && (await p.textContent('#dlgTitle')) === '거래 후보 수정', '수정 시트 열림');
  check((await p.textContent('#dlgBody')).includes('원본 값: 많이'), '수정 시트: 읽지 못한 원본 값 표시');
  await shot('v3s3-edit-1280');
  await p.fill('#ibe_qty', '3000');
  await p.click('#dlgFoot [data-act="ibSave"]'); await p.waitForTimeout(150);
  check(await dlgOpen(), '날짜가 비어 있으면 저장되지 않음');
  await p.fill('#ibe_due', iso(12)); await p.press('#ibe_due', 'Enter'); await p.waitForTimeout(150);
  check(!(await dlgOpen()), 'Enter로 저장');
  s = await st(); const hb = s.inbox.find(c => c.party === '한빛패키지');
  check(hb.qty === 3000 && hb.due === iso(12) && !Object.keys(hb.flags).length, '수정 저장: 값 반영, 확인 필요 표시 지움');
  await p.locator('#ibList .ib-row', { hasText: '한빛패키지' }).locator('[data-act="ibCheck"]').click(); await p.waitForTimeout(150);
  check((await st()).inbox.find(c => c.party === '한빛패키지').status === 'checked', '담당자 개별 확인 완료');

  // 대표: 일괄 승인 → 매입·매출 등록, 점수 기록. AI 예시·오렌지유통(날짜 없음)은 남음
  await p.click('#staffBtn'); await p.waitForTimeout(200);
  await go('inbox');
  s = await st();
  const ready = s.inbox.filter(c => (c.status === 'new' || c.status === 'checked') && !blocked(c));
  const nBuy = ready.filter(c => c.type === 'buy').length, nSale = ready.length - nBuy;
  const p0 = s.purchases.length, s0 = s.sales.length;
  await p.click('#ibBar [data-act="ibApproveAll"]'); await p.waitForTimeout(200);
  s = await st();
  check(s.purchases.length === p0 + nBuy && s.sales.length === s0 + nSale, '대표 일괄 승인: 매입 +' + nBuy + ' (' + p0 + '→' + s.purchases.length + '), 매출 +' + nSale + ' (' + s0 + '→' + s.sales.length + ')');
  const np = s.purchases.find(x => x.party === '대성원료' && x.qty === 300 && x.ordered === iso(0) && x.status === 'ordered');
  const ns = s.sales.find(x => x.party === '누리상회, 본점' && x.status === 'open' && x.tax === 'none' && x.confirm === 'none' && x.reminded === 0 && x.issued === iso(0));
  check(!!np && !!ns, '등록 형식: 매입(ordered, 발주일 오늘)·매출(open, 세금계산서 미발행, 발행일 오늘)');
  check(s.scoreLog.some(l => l.why.startsWith('수집함 승인 (')), '점수 변동 기록: ' + (s.scoreLog.find(l => l.why.startsWith('수집함 승인')) || {}).why);
  const left = s.inbox.filter(c => c.status === 'new' || c.status === 'checked');
  check(left.length === 2 && left.every(blocked), '확인 필요 2건(AI 예시·날짜 없는 오렌지유통)은 승인되지 않고 남음');
  check(await p.locator('#orderRows li', { hasText: '미래라벨' }).count() >= 2 && await p.locator('#saleRows li', { hasText: '누리상회, 본점' }).count() === 1, '매입·매출 목록에 등록된 거래 표시');
  // 반려
  await p.locator('#ibList .ib-row', { hasText: '오렌지유통' }).locator('[data-act="ibReject"]').click(); await p.waitForTimeout(150);
  check((await st()).inbox.find(c => c.party === '오렌지유통').status === 'rejected', '대표 반려');
  check(await p.locator('#ibDone .tag.ok', { hasText: '매입에 등록' }).count() >= 1, '처리한 거래 목록');

  // 다음 날 역할 전환 → 승인 창 다시 (담당자: 새 거래 = AI 예시 1건)
  await p.click('[data-shift="1"]'); await p.waitForTimeout(150);
  await p.click('#staffBtn'); await p.waitForTimeout(250);
  check(await dlgOpen() && (await p.textContent('#dlgTitle')).includes('1건'), '+1일 뒤 담당자 전환 → 승인 창: ' + (await dlgOpen() ? await p.textContent('#dlgTitle') : '(없음)'));
  await p.click('#dlgLeft [data-act="close"]'); await p.waitForTimeout(100);
  await p.click('#staffBtn'); await p.waitForTimeout(250);
  check(await dlgOpen(), '+1일 뒤 대표 전환 → 대표 승인 창도 하루 한 번');
  if (await dlgOpen()){ await p.click('#dlgLeft [data-act="close"]'); await p.waitForTimeout(100); }

  // 엑셀(xlsx) 읽기: 브라우저 안에서 SheetJS로 날짜 셀(엑셀 날짜 숫자)이 든 파일을 만들어 올린다
  await go('inbox');
  const xlsxB64 = await p.evaluate(async () => {
    // 페이지와 같은 방식(동적 script)으로 불러온 뒤 파일을 만든다
    if (!window.XLSX){ await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); }
    const ws = XLSX.utils.aoa_to_sheet([['발주 목록 (11월)'], ['고객사', '상품', '수량', '단가', '입금 예정일'], ['그린마켓', '완제품 A', 150, 24000, new Date(2026, 11, 20)], ['브라이트몰', '완제품 A', 90, 25000, '12월 5일']], { cellDates: false });
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, '발주');
    return XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
  }).catch(e => null);
  if (!xlsxB64) check(false, '엑셀 점검용 SheetJS를 불러오지 못함 (--xlsx=로컬 사본을 주면 네트워크 없이 점검)');
  else {
    await upload([write('고객 발주_11월.xlsx', Buffer.from(xlsxB64, 'base64'))]);
    s = await st();
    const xs = s.inbox.filter(c => c.source === 'excel' && c.fileName === '고객 발주_11월.xlsx');
    const gm = xs.find(c => c.party === '그린마켓'), bm = xs.find(c => c.party === '브라이트몰');
    check(xs.length === 2, '엑셀: 제목 줄을 건너뛰고 열 이름 줄을 찾아 2건');
    check(gm && gm.type === 'sale' && gm.flags.type === 'inferred' && gm.due === '2026-12-20' && gm.qty === 150, '엑셀: 고객사 열 → 매출 추정, 엑셀 날짜 숫자 → ' + (gm && gm.due));
    check(bm && /^\d{4}-12-05$/.test(bm.due || '') && bm.flags.due === 'inferred', '엑셀: 연도 없는 "12월 5일" → 연도 추정');
  }

  // 휴대폰 390 캡처: 수집함 (거래 탭 세그먼트 3칸)
  await p.setViewportSize({ width: 390, height: 844 }); await go('inbox'); await p.evaluate(() => window.scrollTo(0, 0));
  check(await p.isVisible('#v-inbox .seg-trade a[data-v="inbox"]') && await p.evaluate(() => document.querySelector('.tabbar [data-tab="trade"]').classList.contains('on')), '휴대폰: 거래 탭 + 매입·매출·수집함 세그먼트');
  await shot('v3s3-inbox-390');
  await p.evaluate(() => window.scrollTo(0, document.getElementById('ibBox').offsetTop - 60)); await shot('v3s3-inbox-390-list');
  check(errs.length === 0, '오류 없음' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await ctx.close();

  // 엑셀 읽기 도구를 못 불러올 때: 오류 없이 CSV 안내
  {
    const c2 = await b.newContext({ viewport: { width: 390, height: 844 } }); const q = await c2.newPage();
    const e2 = []; q.on('pageerror', e => e2.push(e.message)); q.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) e2.push(m.text()); });
    await c2.route(CDN, r => r.abort());
    await q.goto(FILE); await q.evaluate(() => localStorage.clear()); await q.reload(); await q.waitForTimeout(150);
    if (await q.evaluate(() => document.getElementById('dlg').open)) await q.click('#dlgLeft [data-act="close"]');
    await q.evaluate(() => location.hash = 'inbox'); await q.waitForTimeout(120);
    const n0 = (await q.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY)).inbox.length;
    await q.setInputFiles('#ibFile', [{ name: '발주.xlsx', mimeType: 'application/octet-stream', buffer: Buffer.from('PK fake') }]);
    await q.waitForFunction(() => document.getElementById('ibMsg').textContent.length > 0);
    const msg = await q.textContent('#ibMsg'), tst = await q.textContent('#toast');
    check(/CSV/.test(msg) && /CSV/.test(tst), '엑셀 도구 불러오기 실패 → CSV로 저장해 올리라는 안내: ' + tst);
    check((await q.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY)).inbox.length === n0, '실패 시 후보를 만들지 않음');
    await q.setInputFiles('#ibFile', [{ name: path.basename(csv1), mimeType: 'text/csv', buffer: fs.readFileSync(csv1) }]); await q.waitForTimeout(300);
    check((await q.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY)).inbox.length === n0 + 2, '실패 뒤에도 CSV는 그대로 읽음');
    check(e2.length === 0, '실패 경로 오류 없음' + (e2.length ? ': ' + e2.join(' | ') : ''));
    await c2.close();
  }

  // 페이지가 엑셀을 처음 올릴 때 직접 SheetJS를 불러오는 경로 (무결성 해시·CORS 포함)
  if (xlsxB64){
    const c3 = await b.newContext({ viewport: { width: 1280, height: 900 } }); const q = await c3.newPage();
    const e3 = []; q.on('pageerror', e => e3.push(e.message)); q.on('console', m => { if (m.type() === 'error') e3.push(m.text()); });
    if (XLSX_LOCAL) await c3.route(CDN, r => r.fulfill({ status: 200, contentType: 'application/javascript', headers: { 'Access-Control-Allow-Origin': '*' }, body: fs.readFileSync(XLSX_LOCAL) }));
    await q.goto(FILE); await q.evaluate(() => localStorage.clear()); await q.reload(); await q.waitForTimeout(150);
    if (await q.evaluate(() => document.getElementById('dlg').open)) await q.click('#dlgLeft [data-act="close"]');
    await q.evaluate(() => location.hash = 'inbox'); await q.waitForTimeout(120);
    check(!(await q.evaluate(() => !!window.XLSX)), '처음에는 SheetJS를 불러오지 않음');
    await q.setInputFiles('#ibFile', [{ name: '고객 발주_11월.xlsx', mimeType: 'application/octet-stream', buffer: Buffer.from(xlsxB64, 'base64') }]);
    await q.waitForFunction(() => document.getElementById('ibMsg').textContent.length > 0, null, { timeout: 20000 });
    const xs = (await q.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY)).inbox.filter(c => c.source === 'excel' && c.fileName === '고객 발주_11월.xlsx');
    check(xs.length === 2 && await q.evaluate(() => !!document.querySelector('script[src*="xlsx@0.18.5"][integrity]')), '엑셀을 올리면 그때 SheetJS를 불러와(무결성 해시 확인) 2건 읽음');
    check(e3.length === 0, '엑셀 지연 불러오기 오류 없음' + (e3.length ? ': ' + e3.join(' | ') : ''));
    await c3.close();
  }
  await b.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(fails.length ? '\n실패 ' + fails.length + '건' : '\n모두 통과');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
