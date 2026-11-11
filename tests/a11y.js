// 접근성 자동 점검: 글자 대비 · 누르는 영역(44px) · 가로 스크롤 · 확대 200% · 키보드 · 차트 설명 · 움직임 줄이기 · 고대비
// 사용법: node tests/a11y.js /절대/경로/index.html   (실패가 있으면 종료 코드 1)
const { chromium } = require('playwright');
const FILE = 'file://' + process.argv[2];
const KEY = 'flowpoint-test-v6';
// 'prompt'(접속 시 승인 창)·'ibdetail'(수집함 승인 줄을 눌러 연 상세 시트: 발주 칸 확인 필요 · 승인·수정·반려)·'ibedit'(상세 → 수정 시트, 새 거래 후보 계산서)·'docprev'(거래 문서 미리보기)·'delivery'(납품 확인 시트)는 해시가 아니라 시트를 연 상태
// 'notif'(알림함 시트)·'thanks'(감사 메일 미리보기, 결제 캘린더의 결제 완료 카드에서)도 시트를 연 상태. 'calendar'는 집행 후 결제 1건이 있는 결제 캘린더
// 'saledetail'은 #sales에서 연체 줄을 눌러 연 거래 상세 시트, 'newtrade'는 "+ 새 거래" 입력 시트
// 'fwdsheet'는 집행 후 묶은 매출(한결푸드) 입금 확인 → "오늘 276에 넘길 금액" 시트. #sales는 입금 확인 후 "나중에"(줄에 넘기기), #flowpay는 1건 넘긴 진행률 상태
// 'actsheet'는 심사 화면(포트폴리오 · 이슈 피드 · AI 검토 보고서)에서 이슈 하나의 '조치 기록' 시트를 연 상태
// 'shortsheet'는 #home 오늘 할 일의 "부족 해결"로 연 부족 해결 비교 시트(플로우페이·먼저 받기 후보, 추천 1개)
// 'report-ar'·'report-ap'는 #report(자금일보)에서 받을 돈 · 줄 돈 탭을 고른 상태 (해시는 #report 그대로)
// 'dealdetail'은 #deals에서 거래 하나를 연 상태(좁은 화면은 상세만), 'link'는 매입처 외부용 화면(#link/<token>, 1단계 발주서 열람)
const HASHES = ['home', 'inbox', 'report', 'report-ar', 'report-ap', 'orders', 'sales', 'score', 'fund', 'flowpay', 'factoring', 'review', 'company', 'deals', 'dealdetail', 'link', 'prompt', 'ibdetail', 'ibedit', 'docprev', 'delivery', 'calendar', 'notif', 'thanks', 'actsheet', 'saledetail', 'newtrade', 'fwdsheet', 'shortsheet'];
const SHEETS = ['prompt', 'ibdetail', 'ibedit', 'docprev', 'delivery', 'notif', 'thanks', 'actsheet', 'saledetail', 'newtrade', 'fwdsheet', 'shortsheet'];
const SIZES = { 1280: 800, 820: 1180, 390: 844 };

// 알고 있는 예외 (실패로 세지 않고 이유와 함께 따로 보여 준다). key는 "점검|선택자" 앞부분과 비교
const EXCEPTIONS = [
  // 예: { check: 'contrast', match: '.something', why: '...' }
];

const fails = {};      // check -> Map(key -> {msg, ctx:Set})
const notes = [];      // 참고 사항
let checked = {};      // check -> 측정 개수
function fail(check, key, msg, ctx){
  const ex = EXCEPTIONS.find(e => e.check === check && key.includes(e.match));
  const bucket = ex ? 'exception:' + check : check;
  fails[bucket] = fails[bucket] || new Map();
  const m = fails[bucket]; if (!m.has(key)) m.set(key, { msg: msg + (ex ? '  [예외: ' + ex.why + ']' : ''), ctx: new Set() });
  m.get(key).ctx.add(ctx);
}
function count(check, n){ checked[check] = (checked[check] || 0) + n; }

/* ---------- 페이지 안에서 실행하는 측정 함수 ---------- */
const AUDIT = () => {
  const parse = c => {
    if (!c) return null;
    let m = c.match(/^rgba?\(([^)]+)\)/);
    if (m){ const p = m[1].split(/[\s,\/]+/).filter(Boolean).map(parseFloat); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; }
    m = c.match(/^color\(srgb ([^)]+)\)/);
    if (m){ const p = m[1].split(/[\s\/]+/).filter(Boolean).map(parseFloat); return [p[0] * 255, p[1] * 255, p[2] * 255, p.length > 3 ? p[3] : 1]; }
    return null;
  };
  const over = (top, bot) => { const a = top[3]; return [top[0] * a + bot[0] * (1 - a), top[1] * a + bot[1] * (1 - a), top[2] * a + bot[2] * (1 - a), 1]; };
  const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const sel = el => {
    const parts = []; let n = el;
    for (let i = 0; i < 4 && n && n !== document.body; i++, n = n.parentElement){
      let s = n.tagName.toLowerCase();
      if (n.id){ parts.unshift(s + '#' + n.id); break; }
      if (n.classList.length) s += '.' + [...n.classList].slice(0, 2).join('.');
      if (n.dataset && n.dataset.act) s += '[data-act=' + n.dataset.act + ']';
      parts.unshift(s);
    }
    return parts.join('>');
  };
  const txt = el => (el.innerText || el.textContent || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 40);
  const visible = el => {
    if (el.closest('svg') && el.tagName.toLowerCase() !== 'svg') return false;
    const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return false;
    const cs = getComputedStyle(el); if (cs.visibility !== 'visible') return false;
    let op = 1; for (let n = el; n; n = n.parentElement){ op *= parseFloat(getComputedStyle(n).opacity); }
    if (op < 0.1) return false;
    if (el.closest('dialog') && !el.closest('dialog').open) return false;
    if (el.closest('.locked .blur')) return false;  // 잠긴 내용(흐림 처리, 누를 수 없음)
    return true;
  };
  const bgOf = el => {
    const layers = [];
    for (let n = el; n; n = n.parentElement){
      const b = getComputedStyle(n, '::before');
      if (b.content !== 'none' && b.position === 'absolute'){ const c = parse(b.backgroundColor); if (c && c[3] > 0) layers.push(c); }
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c && c[3] > 0){ layers.push(c); if (c[3] >= 1) break; }
    }
    let base = [255, 255, 255, 1];
    for (let i = layers.length - 1; i >= 0; i--) base = over(layers[i], base);
    return base;
  };
  const opacityOf = el => { let op = 1; for (let n = el; n; n = n.parentElement) op *= parseFloat(getComputedStyle(n).opacity); return op; };

  // 1) 글자 대비
  const contrast = [];
  let nText = 0;
  for (const el of document.body.querySelectorAll('*')){
    if (['SCRIPT', 'STYLE', 'svg'].includes(el.tagName) || el.closest('svg')) continue;
    if (![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue;
    if (el.closest(':disabled,[aria-disabled="true"]')) continue;
    if (!visible(el)) continue;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect(); if (cs.clip && cs.clip !== 'auto' && r.width <= 2) continue;
    let fg = parse(cs.color); if (!fg) continue;
    const bg = bgOf(el);
    fg = [fg[0], fg[1], fg[2], fg[3] * opacityOf(el)];
    const fgc = over(fg, bg);
    const size = parseFloat(cs.fontSize), bold = parseInt(cs.fontWeight, 10) >= 700;
    const large = size >= 24 || (size >= 18.66 && bold);
    const need = large ? 3 : 4.5, got = ratio(fgc, bg);
    nText++;
    if (got < need - 0.005) contrast.push({ key: sel(el) + ' "' + txt(el) + '"', msg: got.toFixed(2) + ':1 (기준 ' + need + ', ' + size + 'px' + (bold ? ' 굵게' : '') + ') 글자 rgb(' + fgc.slice(0, 3).map(Math.round) + ') 배경 rgb(' + bg.slice(0, 3).map(Math.round) + ')' });
  }

  // 2) 누르는 영역 44×44
  const target = [];
  let nTarget = 0;
  const INTER = 'a[href],button,[data-act],input,select,textarea,summary,[role="button"],[tabindex]:not([tabindex="-1"])';
  for (const el of document.querySelectorAll(INTER)){
    if (!visible(el)) continue;
    if (getComputedStyle(el).pointerEvents === 'none') continue;
    if (el.matches('[data-act]') && el.parentElement.closest(INTER)) continue; // 바깥 컨트롤이 영역을 가짐
    let box = el;
    if (el.matches('input[type="checkbox"],input[type="radio"]') && el.closest('label')) box = el.closest('label');
    // 문단 안의 글자 링크는 예외 (WCAG 2.5.8 inline 예외)
    if (el.tagName === 'A' && getComputedStyle(el).display === 'inline' && el.parentElement && el.parentElement.textContent.trim().length > el.textContent.trim().length) continue;
    const r = box.getBoundingClientRect();
    nTarget++;
    if (r.height < 43.5 || r.width < 43.5) target.push({ key: sel(el) + ' "' + txt(el) + '"', msg: Math.round(r.width) + '×' + Math.round(r.height) + 'px' });
  }

  // 3) 가로 스크롤
  const de = document.documentElement;
  const overflow = [];
  if (de.scrollWidth > de.clientWidth + 1){
    const culprits = [];
    for (const el of document.body.querySelectorAll('*')){
      if (!visible(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.right > de.clientWidth + 1){
        // 가로 스크롤 상자 안은 제외
        let inScroll = false; for (let n = el.parentElement; n && n !== document.body; n = n.parentElement){ const o = getComputedStyle(n).overflowX; if (o === 'auto' || o === 'scroll' || o === 'hidden'){ inScroll = true; break; } }
        if (!inScroll) culprits.push(sel(el) + ' (right ' + Math.round(r.right) + ')');
      }
    }
    overflow.push({ key: 'scrollWidth ' + de.scrollWidth + ' > ' + de.clientWidth, msg: culprits.slice(0, 4).join(', ') });
  }

  // 4) 차트: role=img + 숫자가 든 설명 + 위쪽에 보이는 한 줄 요약
  const charts = [];
  let nChart = 0;
  for (const svg of document.querySelectorAll('svg#chart, svg#chart2, svg.spark')){
    if (!visible(svg)) continue;
    nChart++;
    const lb = svg.getAttribute('aria-label') || '';
    const id = sel(svg);
    if (svg.getAttribute('role') !== 'img') charts.push({ key: id + ' role', msg: 'role=img 없음' });
    if (!/\d/.test(lb)) charts.push({ key: id + ' label', msg: '설명에 수치 요약이 없음: "' + lb + '"' });
    const host = svg.closest('.chart-box') || svg;
    const prev = host.previousElementSibling;
    if (!prev || !visible(prev) || !/\d/.test(prev.textContent)) charts.push({ key: id + ' sum', msg: '차트 바로 위에 수치가 든 한 줄 요약이 없음' });
  }
  // HTML로 그린 막대 차트(자금일보 받을 돈 나이 · 거래처 쏠림): role=img + 수치가 든 설명
  for (const el of document.querySelectorAll('#rpAge, #rpConc')){
    if (!visible(el)) continue;
    nChart++;
    const lb = el.getAttribute('aria-label') || '';
    if (el.getAttribute('role') !== 'img') charts.push({ key: sel(el) + ' role', msg: 'role=img 없음' });
    if (!/\d/.test(lb)) charts.push({ key: sel(el) + ' label', msg: '설명에 수치 요약이 없음: "' + lb + '"' });
  }
  return { contrast, target, overflow, charts, n: { contrast: nText, target: nTarget, charts: nChart } };
};

// 화면 안의 누를 수 있는 요소가 고정 막대(탭 바·하단 버튼) 등에 가려지지 않는지
const OBSCURED = () => {
  const out = []; let n = 0;
  const INTER = 'a[href],button,[data-act],input,select,textarea,summary';
  const fixedAnc = el => { for (let x = el; x; x = x.parentElement){ const p = getComputedStyle(x).position; if (p === 'fixed' || p === 'sticky') return true; } return false; };
  for (const el of document.querySelectorAll('.view.on ' + INTER.split(',').join(', .view.on ') + ', footer button')){
    const r0 = el.getBoundingClientRect(); if (r0.width < 2 || r0.height < 2) continue;
    if (getComputedStyle(el).visibility !== 'visible' || el.closest('.locked .blur') || fixedAnc(el)) continue;
    if (el.closest('details:not([open])') && !el.matches('summary')) continue;
    const box = el.matches('input[type="checkbox"],input[type="radio"]') && el.closest('label') ? el.closest('label') : el;
    box.scrollIntoView({ block: 'center', inline: 'nearest' });
    const r = box.getBoundingClientRect();
    const x = Math.min(Math.max(r.left + r.width / 2, 1), innerWidth - 1), y = Math.min(Math.max(r.top + r.height / 2, 1), innerHeight - 1);
    const hit = document.elementFromPoint(x, y); n++;
    if (!hit) continue;
    if (box.contains(hit) || hit.contains(box) || (hit.tagName === 'LABEL' && hit.contains(el))) continue;
    out.push({ key: el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).split(' ')[0] : '') + ' "' + (el.innerText || '').trim().slice(0, 30) + '"', msg: '가려짐: ' + hit.tagName.toLowerCase() + (hit.id ? '#' + hit.id : '') + (hit.className ? '.' + String(hit.className).split(' ')[0] : '') });
  }
  scrollTo(0, 0);
  return { out, n };
};

// 큰 덩어리끼리 겹치지 않는지 (확대 시)
const OVERLAP = () => {
  const els = [...document.querySelectorAll('.view.on .panel, .view.on .glist, .view.on .ph, .view.on .metric, .view.on .callout, .view.on .gh, .view.on .app, .view.on .seg, .view.on .subtabs a, .view.on h1, .view.on h2')]
    .filter(el => { const r = el.getBoundingClientRect(); return r.width > 2 && r.height > 2 && getComputedStyle(el).position !== 'fixed'; });
  const out = [];
  for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++){
    const a = els[i], b = els[j]; if (a.contains(b) || b.contains(a)) continue;
    const r = a.getBoundingClientRect(), s = b.getBoundingClientRect();
    const w = Math.min(r.right, s.right) - Math.max(r.left, s.left), h = Math.min(r.bottom, s.bottom) - Math.max(r.top, s.top);
    if (w > 2 && h > 2) out.push({ key: a.className + ' × ' + b.className, msg: Math.round(w) + '×' + Math.round(h) + 'px 겹침' });
  }
  return out;
};

// 글자가 자기 상자 밖으로 넘치거나 잘리는 곳 (말줄임표 처리는 제외)
const SPILL = () => {
  const out = [];
  for (const el of document.querySelectorAll('.view.on *, .tabbar *, footer *, dialog[open] *')){
    if (el.closest('svg') || !el.getClientRects().length) continue;
    if (![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && el.tagName !== 'LABEL') continue;
    const cs = getComputedStyle(el);
    if (cs.overflowX === 'auto' || cs.overflowX === 'scroll' || cs.textOverflow === 'ellipsis') continue;
    if (el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 1) out.push({ key: el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).split(' ')[0] : '') + ' "' + el.textContent.trim().replace(/\s+/g, ' ').slice(0, 24) + '"', msg: '내용 ' + el.scrollWidth + 'px > 상자 ' + el.clientWidth + 'px' });
  }
  return out;
};

// 휴대폰 글자 크기 200%: 모든 요소의 글자 크기·줄 간격(px)을 두 배로 (페이지가 px 단위라 브라우저 글자 확대와 같은 효과)
const TEXT200 = () => {
  const all = [...document.querySelectorAll('body *')].filter(el => !el.closest('svg'));
  const v = all.map(el => { const cs = getComputedStyle(el); return [parseFloat(cs.fontSize), cs.lineHeight]; });
  all.forEach((el, i) => {
    el.style.fontSize = (v[i][0] * 2) + 'px';
    if (v[i][1].endsWith('px')) el.style.lineHeight = (parseFloat(v[i][1]) * 2) + 'px';
  });
};

async function openHash(p, h){
  if (h === 'prompt'){
    // 승인 창은 하루 한 번: 표시 날짜를 지우고 다시 불러온다
    await p.evaluate(k => { const s = JSON.parse(localStorage.getItem(k)); s.lastApprovalPrompt = null; localStorage.setItem(k, JSON.stringify(s)); }, KEY);
    await p.reload(); await p.waitForTimeout(150);
    return;
  }
  if (h === 'saledetail' || h === 'newtrade'){
    await p.evaluate(() => location.hash = 'sales'); await p.waitForTimeout(150);
    await p.evaluate(x => (x === 'newtrade' ? [...document.querySelectorAll('[data-act="newTrade"]')].find(b => b.offsetParent) : [...document.querySelectorAll('#saleRows li')].find(l => l.textContent.includes('연체')).querySelector('.tr-open')).click(), h);
    await p.waitForTimeout(150);
    return;
  }
  if (h === 'fwdsheet'){
    await p.evaluate(() => location.hash = 'sales'); await p.waitForTimeout(150);
    await p.evaluate(() => [...document.querySelectorAll('#saleRows li.tr-row')].find(l => l.textContent.includes('한결푸드') && l.textContent.includes('상환 매출')).querySelector('.tr-open').click()); await p.waitForTimeout(150);
    await p.evaluate(() => document.querySelector('#dlgBody [data-act="paid"]').click()); await p.waitForTimeout(150);
    return;
  }
  if (h === 'shortsheet'){
    await p.evaluate(() => location.hash = 'home'); await p.waitForTimeout(150);
    await p.evaluate(() => document.querySelector('#sigBox [data-act="shortSheet"]').click()); await p.waitForTimeout(150);
    return;
  }
  if (h === 'report-ar' || h === 'report-ap'){
    await p.evaluate(() => location.hash = 'report'); await p.waitForTimeout(150);
    await p.evaluate(x => document.getElementById('rpTab-' + x).click(), h.slice(7)); await p.waitForTimeout(150);
    return;
  }
  if (h === 'ibdetail' || h === 'ibedit'){
    await p.evaluate(() => location.hash = 'inbox'); await p.waitForTimeout(120);
    // 상세: 마지막 줄(세진화학 발주 · 납품 예정일·요구사항 확인 필요) / 수정: 첫 줄(오렌지유통 계산서 후보)의 상세 → 수정
    await p.evaluate(x => { const os = document.querySelectorAll('#ibList .ib-open'); os[x === 'ibdetail' ? os.length - 1 : 0].click(); }, h); await p.waitForTimeout(150);
    if (h === 'ibedit'){ await p.evaluate(() => document.querySelector('#dlgBody [data-act="ibEdit"]').click()); await p.waitForTimeout(150); }
    return;
  }
  if (h === 'link'){
    await p.evaluate(k => location.hash = 'link/' + JSON.parse(localStorage.getItem(k)).deals[0].token, KEY); await p.waitForTimeout(150);
    return;
  }
  if (h === 'dealdetail'){
    await p.evaluate(() => location.hash = 'deals'); await p.waitForTimeout(150);
    await p.click('#dlList [data-act="dlOpen"]'); await p.waitForTimeout(150);
    return;
  }
  if (h === 'docprev' || h === 'delivery'){
    await p.evaluate(() => location.hash = 'deals'); await p.waitForTimeout(150);
    if (!(await p.locator('#dlDetail .dl-docs').count())){ await p.click('#dlList [data-act="dlOpen"]'); await p.waitForTimeout(150); }
    await p.locator(h === 'docprev' ? '#dlDetail [data-act="dlPrev"][data-k="invC"]' : '#dlDetail [data-act="dlDeliver"]').click(); await p.waitForTimeout(150);
    return;
  }
  if (h === 'notif'){
    await p.evaluate(() => document.querySelector('[data-act="ntOpen"]').click()); await p.waitForTimeout(150);
    return;
  }
  if (h === 'thanks'){
    await p.evaluate(() => location.hash = 'calendar'); await p.waitForTimeout(150);
    await p.evaluate(() => document.querySelector('#calUp [data-act="thanksOpen"]').click()); await p.waitForTimeout(150);
    return;
  }
  if (h === 'actsheet'){
    await p.evaluate(() => location.hash = 'review'); await p.waitForTimeout(150);
    await p.evaluate(() => document.querySelector('#rvFeed [data-act="rvActOpen"]').click()); await p.waitForTimeout(150);
    return;
  }
  if (h === 'company'){
    await p.evaluate(() => location.hash = 'score'); await p.waitForTimeout(120);
    await p.click('#scSeg [data-sc="sale"]'); await p.waitForTimeout(80);
    await p.click('#scSales [data-act="scOpen"]'); await p.waitForTimeout(150);
    return;
  }
  await p.evaluate(x => location.hash = x, h); await p.waitForTimeout(150);
}

// 심사 대기 1건이 있는 상태를 만든다 (flow.js 3단계와 같은 순서)
async function makeReviewState(b){
  const ctx = await b.newContext({ viewport: { width: 1200, height: 900 } }); const p = await ctx.newPage();
  await p.goto(FILE); await p.evaluate(() => localStorage.clear()); await p.reload();
  if (await p.evaluate(() => document.getElementById('dlg').open)) await p.click('#dlgLeft [data-act="close"]');  // 접속 시 승인 창 닫기
  const next = async () => { await p.click('#dlgFoot [data-act="stepNext"]'); await p.waitForTimeout(120); };
  await p.evaluate(() => location.hash = 'orders'); await p.waitForTimeout(120);
  await p.locator('#orderRows li', { hasText: '1,573만원' }).locator('[data-act="finance"]').click(); await p.waitForTimeout(150);
  await next();
  await p.locator('dialog label.check', { hasText: '그린마켓' }).locator('input').check(); await p.waitForTimeout(150);
  await p.locator('#dlg .docrow', { hasText: '440만원' }).locator('input').check(); await p.waitForTimeout(150);  // 묶은 매출 합계 ≥ 납품액
  await next();
  while (await p.locator('dialog [data-act="upload"][data-ctx="apply"]:not(:has-text("미리"))').count()){ await p.locator('dialog [data-act="upload"][data-ctx="apply"]:not(:has-text("미리"))').first().click(); await p.waitForTimeout(120); }
  await next();
  await p.click('dialog [data-act="submitApply"]'); await p.waitForTimeout(150);
  await p.evaluate(() => location.hash = 'flowpay'); await p.waitForTimeout(120);
  while (await p.locator('#apps [data-act="cfm"]').count()){ await p.locator('#apps [data-act="cfm"]').first().click(); await p.waitForTimeout(120); }
  const st = JSON.parse(await p.evaluate(k => localStorage.getItem(k), KEY));
  // 거래 문서 상태: 심사 승인 → 전자서명(매입처 링크 1단계) → 링크 서명·역발행 승인 → 276 지급·발행(납품 확인 대기)
  await p.click('#roleBtn'); await p.waitForTimeout(150);
  await p.locator('#rvQueue .reasons label', { hasText: '입금 이력 양호' }).locator('input').check();
  await p.click('#rvQueue [data-act="rvApprove"]'); await p.waitForTimeout(120);
  await p.click('#roleBtn'); await p.waitForTimeout(150);
  await p.click('[data-act="sign"]'); await p.waitForTimeout(150);
  const signSt = await p.evaluate(k => localStorage.getItem(k), KEY);
  await p.evaluate(k => location.hash = 'link/' + JSON.parse(localStorage.getItem(k)).deals[0].token, KEY); await p.waitForTimeout(150);
  await p.click('#lkBody [data-act="lkNext"]'); await p.check('#lkAgree'); await p.click('#lkSignBtn'); await p.waitForTimeout(100);
  await p.check('#lkBody input[name="lkTax"][value="reverse"]'); await p.click('#lkBody [data-act="lkTaxDo"]'); await p.waitForTimeout(100);
  await p.evaluate(() => location.hash = 'deals'); await p.waitForTimeout(120);
  await p.click('#roleBtn'); await p.waitForTimeout(150); await p.evaluate(() => location.hash = 'deals'); await p.waitForTimeout(150);
  await p.click('#dlDetail [data-act="dlPay"]'); await p.waitForTimeout(100);
  await p.click('#dlDetail [data-act="dlIssue"]'); await p.waitForTimeout(100);
  const ready = JSON.parse(await p.evaluate(k => localStorage.getItem(k), KEY)); ready.role = 'ceo';
  // 묶은 매출 입금 확인 → 나중에(줄에 넘기기) → 줄의 넘기기로 1건 넘김 (고객 대표)
  const closeP = async () => { if (await p.evaluate(() => document.getElementById('dlg').open)) await p.click('#dlgLeft [data-act="close"]'); await p.waitForTimeout(80); };
  await p.evaluate(([k, s]) => localStorage.setItem(k, s), [KEY, JSON.stringify(ready)]); await p.reload(); await p.waitForTimeout(150); await closeP();
  await p.evaluate(() => location.hash = 'sales'); await p.waitForTimeout(150);
  await p.locator('#saleRows li.tr-row', { hasText: '한결푸드' }).filter({ hasText: '상환 매출' }).locator('.tr-open').click(); await p.waitForTimeout(120);
  await p.click('#dlgBody [data-act="paid"]'); await p.waitForTimeout(150); await closeP();
  const later = await p.evaluate(k => localStorage.getItem(k), KEY);
  await p.click('#saleRows [data-act="fwd"]'); await p.waitForTimeout(150); await p.click('#dlgFoot [data-act="fwdDo"]'); await p.waitForTimeout(150);
  const fwd1 = await p.evaluate(k => localStorage.getItem(k), KEY);
  // 결제 완료 상태(감사 메일): 납품 확인을 마치고 묶은 매출을 모두 입금 확인·넘긴 것으로 바꾸면 다시 그릴 때 자동 상환 완료
  const paid = JSON.parse(JSON.stringify(ready)), dd = paid.deals[0], t0 = dd.createdAt, ap0 = paid.apps[0];
  dd.docs.forEach(x => { if (x.k === 'invC' || x.k === 'dlv'){ x.status = 'done'; x.at = { sent: t0, viewed: t0, signed: t0, done: t0 }; } if (x.k === 'payC'){ x.status = 'due'; x.at = { sent: t0 }; } });
  ap0.fwd = ap0.alloc.map(r => ({ saleId: r.saleId, amt: r.forward, date: t0 }));
  paid.sales.forEach(x => { if (ap0.links.includes(x.id)){ x.status = 'paid'; x.paidOn = t0; } });
  await p.evaluate(([k, s]) => localStorage.setItem(k, s), [KEY, JSON.stringify(paid)]); await p.reload(); await p.waitForTimeout(150);
  const thanksSt = JSON.parse(await p.evaluate(k => localStorage.getItem(k), KEY)); thanksSt.role = 'ceo';
  if (thanksSt.apps[0].outcome !== 'repaid' || !thanksSt.notifications.some(n => n.type === 'thanks')) throw new Error('자동 상환 완료 상태를 만들지 못함');
  await ctx.close();
  st.role = 'reviewer';
  return { review: JSON.stringify(st), link: signSt, deals: JSON.stringify(ready), dealdetail: JSON.stringify(ready), docprev: JSON.stringify(ready), delivery: JSON.stringify(ready),
    actsheet: JSON.stringify(st), calendar: JSON.stringify(ready), notif: JSON.stringify(thanksSt), thanks: JSON.stringify(thanksSt),
    fwdsheet: JSON.stringify(ready), sales: later, flowpay: fwd1 };
}

async function newPage(b, opt, state){
  const ctx = await b.newContext({ viewport: { width: opt.w, height: opt.h }, deviceScaleFactor: opt.dsf || 1, colorScheme: opt.scheme || 'light', reducedMotion: opt.motion || 'no-preference', forcedColors: opt.forced || 'none', contrast: opt.contrast || 'no-preference' });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(FILE);
  await p.evaluate(([k, s]) => { localStorage.clear(); if (s) localStorage.setItem(k, s); }, [KEY, state || null]);
  await p.reload(); await p.waitForTimeout(100);
  // 접속 시 승인 창(시나리오 수집 후보)은 '나중에'로 닫고 화면을 점검한다 (창 자체는 'prompt' 항목에서 점검)
  // (마우스로 누르면 포인터가 그 자리에 남아 아래 버튼이 hover 상태로 측정되므로 스크립트로 누른다)
  if (await p.evaluate(() => { const d = document.getElementById('dlg'); if (d.open) document.querySelector('#dlgLeft [data-act="close"]').click(); return d.open; }) === false) await p.waitForTimeout(80);
  return { ctx, p, errs };
}

async function auditPass(b, opt, reviewState, label){
  for (const h of HASHES){
    const state = reviewState[h] || null;
    const { ctx, p, errs } = await newPage(b, opt, state);
    await openHash(p, h);
    const ctxName = label + ' #' + h;
    const now = await p.evaluate(() => location.hash);
    if (h !== 'company' && h !== 'link' && h !== 'dealdetail' && !SHEETS.includes(h) && now !== '#' + h.replace(/-a[rp]$/, '')) fail('route', h, '해시가 ' + now + '로 바뀜', ctxName);
    if (SHEETS.includes(h) && !(await p.evaluate(() => document.getElementById('dlg').open))) fail('route', h, '시트가 열리지 않음', ctxName);
    const r = await p.evaluate(AUDIT);
    count('contrast', r.n.contrast); count('target', r.n.target); count('overflow', 1); count('charts', r.n.charts);
    r.contrast.forEach(x => fail('contrast', x.key, x.msg, ctxName));
    r.target.forEach(x => fail('target', x.key, x.msg, ctxName));
    r.overflow.forEach(x => fail('overflow', x.key + ' ' + h, x.msg, ctxName));
    r.charts.forEach(x => fail('charts', x.key, x.msg, ctxName));
    if (opt.w < 768 && !SHEETS.includes(h)){
      const o = await p.evaluate(OBSCURED); count('obscured', o.n);
      o.out.forEach(x => fail('obscured', x.key, x.msg, ctxName));
    }
    errs.forEach(e => fail('errors', e, e, ctxName));
    await ctx.close();
  }
}

async function zoomPass(b, reviewState){
  // (1) 넓은 화면 1280×800에서 브라우저 확대 200% = CSS 화면 640×400, 픽셀 비율 2
  //     (html에 CSS zoom:2를 거는 방식은 미디어 쿼리가 바뀌지 않아 실제 브라우저 확대와 달라 쓰지 않는다)
  // (2) 휴대폰 390에서 글자 크기 200%
  for (const mode of ['page-zoom 1280@200%', 'text 390@200%']){
    for (const h of HASHES){
      const opt = mode.startsWith('page') ? { w: 640, h: 400, dsf: 2 } : { w: 390, h: 844 };
      const { ctx, p, errs } = await newPage(b, opt, reviewState[h] || null);
      await openHash(p, h);
      if (mode.startsWith('text')){ await p.evaluate(TEXT200); await p.waitForTimeout(50); }
      const ctxName = mode + ' #' + h;
      const r = await p.evaluate(AUDIT);
      count('zoom-overflow', 1);
      r.overflow.forEach(x => fail('zoom-overflow', x.key + ' ' + h, x.msg, ctxName));
      const sp = await p.evaluate(SPILL); count('zoom-spill', 1);
      sp.forEach(x => fail('zoom-spill', x.key, x.msg, ctxName));
      const ov = await p.evaluate(OVERLAP); count('zoom-overlap', 1);
      ov.forEach(x => fail('zoom-overlap', x.key, x.msg, ctxName));
      if (!SHEETS.includes(h)){
        const o = await p.evaluate(OBSCURED); count('zoom-obscured', o.n);
        o.out.forEach(x => fail('zoom-obscured', x.key, x.msg, ctxName));
      }
      errs.forEach(e => fail('errors', e, e, ctxName));
      await ctx.close();
    }
  }
}

async function keyboardPass(b, reviewState){
  const C = '키보드 1280 라이트';
  // (1) #home에서 Tab 40번: 포커스 표시가 보이는지, 테두리 대비 3:1 이상인지
  {
    const { ctx, p } = await newPage(b, { w: 1280, h: 800 });
    await p.evaluate(() => { location.hash = 'home'; window.__foc = []; }); await p.waitForTimeout(150);
    await p.evaluate(() => document.activeElement && document.activeElement.blur());
    for (let i = 0; i < 40; i++){
      await p.keyboard.press('Tab');
      const done = await p.evaluate(() => {
        const el = document.activeElement; if (!el || el === document.body) return true;
        if (window.__foc.some(f => f.el === el)) return true;
        const cs = getComputedStyle(el);
        window.__foc.push({ el, on: [cs.outlineStyle, cs.outlineWidth, cs.outlineColor, cs.boxShadow, cs.borderColor, cs.backgroundColor].join('|'), oc: cs.outlineColor, ow: parseFloat(cs.outlineWidth), os: cs.outlineStyle });
        return false;
      });
      if (done) break;
    }
    const res = await p.evaluate(AUDIT_FOCUS);
    count('focus', res.n);
    res.out.forEach(x => fail('focus', x.key, x.msg, C + ' #home Tab'));
    if (res.n < 10) notes.push('Tab으로 이동한 요소가 ' + res.n + '개뿐입니다');
    await ctx.close();
  }
  // (2) 신청 시트: Enter = 다음(비활성이면 무시), Esc = 닫기
  {
    const { ctx, p } = await newPage(b, { w: 1280, h: 800 });
    await p.evaluate(() => location.hash = 'orders'); await p.waitForTimeout(150);
    await p.locator('#orderRows li', { hasText: '1,573만원' }).locator('[data-act="finance"]').click(); await p.waitForTimeout(150);
    const step = () => p.evaluate(() => { const s = document.querySelector('#dlg .stepbar'); return s ? +s.getAttribute('aria-valuenow') : 0; });
    count('keys', 5);
    if (!(await p.evaluate(() => document.getElementById("dlg").open))) fail('keys', 'sheet-open', '신청 시트가 열리지 않음', C);
    const inDlg = await p.evaluate(() => !!document.activeElement.closest('dialog'));
    if (!inDlg) fail('keys', 'sheet-focus', '시트를 열어도 포커스가 시트 안으로 가지 않음', C);
    await p.keyboard.press('Enter'); await p.waitForTimeout(150);
    if (await step() !== 2) fail('keys', 'sheet-enter', 'Enter로 1→2단계가 넘어가지 않음 (현재 ' + await step() + ')', C);
    const dis = await p.evaluate(() => { const b = document.querySelector('#dlgFoot .step-btn.primary'); return b ? b.disabled : null; });
    await p.keyboard.press('Enter'); await p.waitForTimeout(150);
    if (dis && await step() !== 2) fail('keys', 'sheet-enter-disabled', '다음 버튼이 비활성인데 Enter로 넘어감', C);
    if (!dis) notes.push('2단계 다음 버튼이 처음부터 활성이라 "비활성일 때 Enter 무시"는 확인하지 못함');
    await p.keyboard.press('Escape'); await p.waitForTimeout(150);
    if (await p.evaluate(() => document.getElementById('dlg').open)) fail('keys', 'sheet-esc', 'Esc로 시트가 닫히지 않음', C);
    // 점수 근거 시트(차트 포함) 열고 Esc
    await p.evaluate(() => location.hash = 'flowpay'); await p.waitForTimeout(150);
    await p.click('#sub-flowpay [data-act="myScore"]'); await p.waitForTimeout(150);
    const r = await p.evaluate(AUDIT); count('charts', r.n.charts);
    r.charts.forEach(x => fail('charts', x.key, x.msg, C + ' 점수 근거 시트'));
    r.contrast.forEach(x => fail('contrast', x.key, x.msg, C + ' 점수 근거 시트'));
    r.target.forEach(x => fail('target', x.key, x.msg, C + ' 점수 근거 시트'));
    await p.keyboard.press('Escape'); await p.waitForTimeout(120);
    if (await p.evaluate(() => document.getElementById('dlg').open)) fail('keys', 'score-esc', 'Esc로 점수 근거 시트가 닫히지 않음', C);
    // 플로우스코어 세그먼트: 좌우 화살표
    await p.evaluate(() => location.hash = 'score'); await p.waitForTimeout(150);
    await p.focus('#scSeg [data-sc="me"]'); await p.keyboard.press('ArrowRight'); await p.waitForTimeout(120);
    const seg = await p.evaluate(() => [document.querySelector('#scSeg [aria-pressed="true"]').dataset.sc, document.activeElement.dataset.sc]);
    if (seg[0] !== 'sale' || seg[1] !== 'sale') fail('keys', 'seg-right', '오른쪽 화살표로 매출처로 가지 않음 (' + seg + ')', C);
    await p.keyboard.press('ArrowLeft'); await p.waitForTimeout(120);
    const seg2 = await p.evaluate(() => document.querySelector('#scSeg [aria-pressed="true"]').dataset.sc);
    if (seg2 !== 'me') fail('keys', 'seg-left', '왼쪽 화살표로 우리 회사로 돌아가지 않음 (' + seg2 + ')', C);
    // 매출 목록: 줄(업체)에서 Enter → 상세 시트(포커스는 시트 안), Esc → 닫히고 그 줄로 포커스가 돌아옴
    await p.evaluate(() => location.hash = 'sales'); await p.waitForTimeout(150);
    count('keys', 2);
    const row = p.locator('#saleRows li', { hasText: '연체' }).first().locator('.tr-open');
    const rid = await row.getAttribute('data-id');
    await row.focus(); await p.keyboard.press('Enter'); await p.waitForTimeout(150);
    const dOpen = await p.evaluate(() => document.getElementById('dlg').open && !!document.activeElement.closest('dialog'));
    await p.keyboard.press('Escape'); await p.waitForTimeout(150);
    const dBack = await p.evaluate(() => !document.getElementById('dlg').open && document.activeElement.dataset.act === 'saleOpen' ? document.activeElement.dataset.id : null);
    if (!dOpen || dBack !== rid) fail('keys', 'detail-esc', '거래 상세 시트가 Enter로 열리고 Esc로 닫힌 뒤 그 줄로 포커스가 돌아오지 않음', C);
    // "+ 새 거래"(툴바): Enter → 입력 시트(첫 칸에 포커스), Esc → 닫히고 버튼으로 포커스가 돌아옴
    await p.focus('#tbAct'); await p.keyboard.press('Enter'); await p.waitForTimeout(150);
    const nOpen = await p.evaluate(() => document.getElementById('dlg').open && document.activeElement.name === 'party');
    await p.keyboard.press('Escape'); await p.waitForTimeout(150);
    const nBack = await p.evaluate(() => !document.getElementById('dlg').open && document.activeElement.id === 'tbAct');
    if (!nOpen || !nBack) fail('keys', 'newtrade-esc', '새 거래 시트가 Enter로 열리고(첫 칸 포커스) Esc로 닫힌 뒤 버튼으로 포커스가 돌아오지 않음', C);
    // 수집함 승인 줄: Enter → 상세 시트(포커스는 시트 안), Esc → 닫히고 그 줄로 포커스가 돌아옴
    await p.evaluate(() => location.hash = 'inbox'); await p.waitForTimeout(150);
    count('keys', 2);
    const ib = p.locator('#ibList .ib-open').last(), iid = await ib.getAttribute('data-id');
    await ib.focus(); await p.keyboard.press('Enter'); await p.waitForTimeout(150);
    const iOpen = await p.evaluate(() => document.getElementById('dlg').open && !!document.activeElement.closest('dialog') && !!document.querySelector('#dlgBody [data-act="ibApprove"]'));
    await p.keyboard.press('Escape'); await p.waitForTimeout(150);
    const iBack = await p.evaluate(() => !document.getElementById('dlg').open && document.activeElement.dataset.act === 'ibView' ? document.activeElement.dataset.id : null);
    if (!iOpen || iBack !== iid) fail('keys', 'ibdetail-esc', '수집함 상세 시트가 Enter로 열리고 Esc로 닫힌 뒤 그 줄로 포커스가 돌아오지 않음', C);
    await ctx.close();
  }
  // (2-1) 넘길 금액 시트: 열리면 "276에 넘기기"에 포커스, Esc(나중에)로 닫히면 그 매출 줄로 포커스가 돌아옴. "완료 N건" 펼침은 Enter로 열고 닫음
  {
    const { ctx, p } = await newPage(b, { w: 1280, h: 800 }, reviewState.fwdsheet);
    await openHash(p, 'fwdsheet'); count('keys', 2);
    const foc = await p.evaluate(() => document.getElementById('dlg').open && document.activeElement.dataset.act);
    await p.keyboard.press('Escape'); await p.waitForTimeout(150);
    const back = await p.evaluate(() => !document.getElementById('dlg').open && document.activeElement.dataset.act);
    if (foc !== 'fwdDo' || back !== 'saleOpen') fail('keys', 'fwd-esc', '넘길 금액 시트 포커스(' + foc + ')·Esc 후 줄 포커스(' + back + ')가 맞지 않음', C);
    await p.focus('#saleRows .tr-fold'); await p.keyboard.press('Enter'); await p.waitForTimeout(150);
    const fo = await p.evaluate(() => [document.activeElement.classList.contains('tr-fold'), document.activeElement.getAttribute('aria-expanded'), document.querySelectorAll('#saleRows li.tr-done[hidden]').length]);
    if (!fo[0] || fo[1] !== 'true' || fo[2] !== 0) fail('keys', 'fold-enter', '"완료 N건" 펼침이 Enter로 열리지 않거나 포커스를 잃음 (' + fo + ')', C);
    await ctx.close();
  }
  // (2-2) 부족 해결 시트: 홈 오늘 할 일의 "부족 해결"에서 Enter → 시트(추천 버튼에 포커스), Esc → 닫히고 연 버튼으로 포커스.
  //       자금일보 알림의 "부족 해결"도 같은 방식. 추천 버튼 Enter → 신청 시트(단계 제목에 포커스), Esc → 처음 연 버튼으로
  {
    const { ctx, p } = await newPage(b, { w: 1280, h: 800 });
    count('keys', 3);
    for (const [h, sel] of [['home', '#sigBox [data-act="shortSheet"]'], ['report', '#sfCallout [data-act="shortSheet"]']]){
      await p.evaluate(x => location.hash = x, h); await p.waitForTimeout(150);
      await p.focus(sel); await p.keyboard.press('Enter'); await p.waitForTimeout(150);
      const foc = await p.evaluate(() => document.getElementById('dlg').open && document.getElementById('dlgTitle').textContent === '부족 해결' && document.activeElement.dataset.act);
      await p.keyboard.press('Escape'); await p.waitForTimeout(150);
      const back = await p.evaluate(s => !document.getElementById('dlg').open && document.activeElement === document.querySelector(s), sel);
      if (foc !== 'shortGo' || !back) fail('keys', 'short-esc-' + h, '부족 해결 시트 포커스(' + foc + ')·Esc 후 연 버튼 포커스(' + back + ')가 맞지 않음', C + ' #' + h);
    }
    await p.focus('#sfCallout [data-act="shortSheet"]'); await p.keyboard.press('Enter'); await p.waitForTimeout(150);
    await p.keyboard.press('Enter'); await p.waitForTimeout(150);
    const ap = await p.evaluate(() => document.getElementById('dlg').open && !!document.querySelector('#dlg .stepbar') && document.activeElement.classList.contains('step-t'));
    await p.keyboard.press('Escape'); await p.waitForTimeout(150);
    const back2 = await p.evaluate(() => !document.getElementById('dlg').open && document.activeElement.dataset.act);
    if (!ap || back2 !== 'shortSheet') fail('keys', 'short-go', '추천 버튼 Enter로 신청 시트가 열리고(단계 제목 포커스) Esc 후 연 버튼으로 돌아오지 않음 (' + ap + ', ' + back2 + ')', C);
    await ctx.close();
  }
  // (2-3) 자금일보 탭: 고른 탭만 Tab 순서(tabindex 0) · 오른쪽/왼쪽 화살표 · End로 탭과 패널이 바뀌고 포커스가 따라감
  {
    const { ctx, p } = await newPage(b, { w: 1280, h: 800 });
    await p.evaluate(() => location.hash = 'report'); await p.waitForTimeout(150);
    count('keys', 4);
    const now = () => p.evaluate(() => { const t = document.activeElement; const sel = [...document.querySelectorAll('#reportBody [role="tab"]')]; return [t.dataset.tab, sel.filter(x => x.getAttribute('aria-selected') === 'true').map(x => x.dataset.tab).join(), sel.filter(x => x.tabIndex === 0).length, [...document.querySelectorAll('#reportBody [role="tabpanel"]')].filter(x => !x.hidden).map(x => x.id).join()].join('|'); });
    const roles = await p.evaluate(() => !!document.querySelector('#reportBody [role="tablist"]') && [...document.querySelectorAll('#reportBody [role="tab"]')].every(t => document.getElementById(t.getAttribute('aria-controls')).getAttribute('aria-labelledby') === t.id));
    if (!roles) fail('keys', 'rp-roles', '자금일보 탭에 tablist/tab/tabpanel 연결(aria-controls·aria-labelledby)이 없음', C + ' #report');
    await p.focus('#rpTab-sum');
    for (const [k, want] of [['ArrowRight', 'ar|ar|1|rpPanel-ar'], ['End', 'ap|ap|1|rpPanel-ap'], ['ArrowRight', 'sum|sum|1|rpPanel-sum']]){
      await p.keyboard.press(k); await p.waitForTimeout(150);
      const got = await now();
      if (got !== want) fail('keys', 'rp-tab-' + k + '-' + want.split('|')[0], '자금일보 탭에서 ' + k + ' 후 ' + got + ' (기대 ' + want + ')', C + ' #report');
    }
    await ctx.close();
  }
  // (3) 휴대폰: 거래 세그먼트 화살표, 더보기 시트 Esc
  {
    const C2 = '키보드 390 라이트';
    const { ctx, p } = await newPage(b, { w: 390, h: 844 });
    await p.evaluate(() => location.hash = 'orders'); await p.waitForTimeout(150);
    count('keys', 2);
    await p.focus('#v-orders .seg-trade a[data-v="orders"]'); await p.keyboard.press('ArrowRight'); await p.waitForTimeout(150);
    if (await p.evaluate(() => location.hash) !== '#sales') fail('keys', 'seg-trade', '거래 세그먼트에서 오른쪽 화살표로 매출로 가지 않음', C2);
    await p.click('#moreBtn'); await p.waitForTimeout(120);
    await p.keyboard.press('Escape'); await p.waitForTimeout(120);
    if (await p.evaluate(() => document.getElementById('moreDlg').open)) fail('keys', 'more-esc', 'Esc로 더보기 시트가 닫히지 않음', C2);
    await ctx.close();
  }
}

// Tab으로 지나간 요소: 포커스 때와 아닐 때 모양이 달라야 하고, 포커스 테두리는 배경과 3:1 이상
const AUDIT_FOCUS = () => {
  const parse = c => { let m = c.match(/^rgba?\(([^)]+)\)/); if (m){ const p = m[1].split(/[\s,\/]+/).filter(Boolean).map(parseFloat); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; } m = c.match(/^color\(srgb ([^)]+)\)/); if (m){ const p = m[1].split(/[\s\/]+/).filter(Boolean).map(parseFloat); return [p[0] * 255, p[1] * 255, p[2] * 255, p.length > 3 ? p[3] : 1]; } return null; };
  const over = (t, b) => { const a = t[3]; return [t[0] * a + b[0] * (1 - a), t[1] * a + b[1] * (1 - a), t[2] * a + b[2] * (1 - a), 1]; };
  const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const bgOf = el => { const L = []; for (let n = el; n; n = n.parentElement){ const c = parse(getComputedStyle(n).backgroundColor); if (c && c[3] > 0){ L.push(c); if (c[3] >= 1) break; } } let base = [255, 255, 255, 1]; for (let i = L.length - 1; i >= 0; i--) base = over(L[i], base); return base; };
  document.activeElement && document.activeElement.blur();
  const out = [];
  for (const f of window.__foc){
    const el = f.el, cs = getComputedStyle(el);
    const off = [cs.outlineStyle, cs.outlineWidth, cs.outlineColor, cs.boxShadow, cs.borderColor, cs.backgroundColor].join('|');
    const name = el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + ' "' + (el.innerText || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 24) + '"';
    if (off === f.on){ out.push({ key: name, msg: '포커스 표시가 보이지 않음' }); continue; }
    if (f.os !== 'none' && f.ow > 0){
      const bg = bgOf(el.parentElement || el), oc = parse(f.oc);
      if (oc){ const r = ratio(over(oc, bg), bg); if (r < 3) out.push({ key: name, msg: '포커스 테두리 대비 ' + r.toFixed(2) + ':1 (기준 3)' }); }
    }
  }
  return { out, n: window.__foc.length };
};

// 움직임 줄이기: 모든 전환·애니메이션이 꺼져야 함 / 고대비: 보조 글자색·구분선이 진해져야 함
async function mediaPass(b){
  {
    const { ctx, p } = await newPage(b, { w: 1280, h: 800, motion: 'reduce' });
    for (const h of ['home', 'orders', 'flowpay', 'score']){
      await openHash(p, h);
      const moving = await p.evaluate(() => {
        const out = [];
        for (const el of document.querySelectorAll('*')){
          for (const ps of [null, '::before']){
            const cs = getComputedStyle(el, ps);
            const t = cs.transitionDuration.split(',').some(v => parseFloat(v) > 0), a = cs.animationName !== 'none';
            if (t || a) out.push(el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : '') + (ps || '') + (t ? ' transition' : '') + (a ? ' animation' : ''));
          }
        }
        return [...new Set(out)];
      });
      count('reduced-motion', 1);
      moving.forEach(m => fail('reduced-motion', m, '움직임 줄이기 설정에서도 전환/애니메이션이 남아 있음', '1280 reduce #' + h));
    }
    await ctx.close();
  }
  for (const scheme of ['light', 'dark']){
    const a = await newPage(b, { w: 1280, h: 800, scheme });
    const base = await a.p.evaluate(() => { const cs = getComputedStyle(document.documentElement); return ['--text2', '--text3', '--line'].map(v => cs.getPropertyValue(v).trim()); });
    await a.ctx.close();
    const m = await newPage(b, { w: 1280, h: 800, scheme, contrast: 'more' });
    const more = await m.p.evaluate(() => { const cs = getComputedStyle(document.documentElement); return ['--text2', '--text3', '--line'].map(v => cs.getPropertyValue(v).trim()); });
    await m.ctx.close();
    count('contrast-more', 1);
    if (more.join() === base.join()) fail('contrast-more', 'vars ' + scheme, '고대비 설정에서 보조 글자색·구분선이 바뀌지 않음', '1280 ' + scheme);
    else notes.push('고대비(' + scheme + '): ' + base.join(' ') + ' → ' + more.join(' '));
  }
}

(async () => {
  if (!process.argv[2]){ console.error('사용법: node tests/a11y.js /절대/경로/index.html'); process.exit(2); }
  const b = await chromium.launch();
  const reviewState = await makeReviewState(b);
  for (const w of [1280, 820, 390]) for (const scheme of ['light', 'dark']) await auditPass(b, { w, h: SIZES[w], scheme }, reviewState, w + ' ' + scheme);
  await auditPass(b, { w: 1280, h: 800, scheme: 'light', contrast: 'more' }, reviewState, '1280 light 고대비');
  await auditPass(b, { w: 1280, h: 800, scheme: 'dark', contrast: 'more' }, reviewState, '1280 dark 고대비');
  await auditPass(b, { w: 1280, h: 800, scheme: 'light', forced: 'active' }, reviewState, '1280 forced-colors');
  await zoomPass(b, reviewState);
  await keyboardPass(b, reviewState);
  await mediaPass(b);
  await b.close();

  const NAMES = {
    contrast: '글자 대비 (본문 4.5:1, 큰 글자 3:1)', target: '누르는 영역 44×44px', overflow: '가로 스크롤 없음', charts: '차트 설명·한 줄 요약',
    obscured: '휴대폰: 고정 막대에 가려지는 버튼 없음', 'zoom-overflow': '확대 200%: 가로 스크롤 없음', 'zoom-overlap': '확대 200%: 큰 덩어리 겹침 없음', 'zoom-spill': '확대 200%: 글자 넘침·잘림 없음',
    'zoom-obscured': '확대 200%: 가려지는 버튼 없음', focus: '키보드 포커스 표시', keys: '키보드 동작 (Enter·Esc·화살표)', 'reduced-motion': '움직임 줄이기',
    'contrast-more': '고대비 설정', route: '해시 주소', errors: '페이지 오류'
  };
  let total = 0;
  console.log('접근성 점검: ' + process.argv[2]);
  console.log('범위: 화면 ' + HASHES.length + '개 × 1280·820·390 × 라이트·다크, 고대비(라이트·다크), 강제 색상, 확대 200%(1280 페이지 확대, 390 글자 확대), 키보드, 움직임 줄이기\n');
  for (const k of Object.keys(NAMES)){
    const m = fails[k];
    const n = m ? m.size : 0; total += n;
    console.log((n ? '실패 ' : '통과 ') + NAMES[k] + (checked[k] ? '  (측정 ' + checked[k] + ')' : '') + (n ? ' — ' + n + '건' : ''));
    if (m) for (const [key, v] of m){ const cx = [...v.ctx]; console.log('   - ' + key + ': ' + v.msg + '\n       @ ' + cx.slice(0, 4).join(', ') + (cx.length > 4 ? ' 외 ' + (cx.length - 4) + '곳' : '')); }
  }
  for (const k of Object.keys(fails).filter(k => k.startsWith('exception:'))){
    console.log('\n예외 ' + (NAMES[k.slice(10)] || k) + ' — ' + fails[k].size + '건 (실패로 세지 않음)');
    for (const [key, v] of fails[k]) console.log('   - ' + key + ': ' + v.msg);
  }
  if (notes.length) console.log('\n참고:\n   - ' + notes.join('\n   - '));
  console.log('\n결과: ' + (total ? '실패 ' + total + '건' : '모두 통과'));
  process.exit(total ? 1 : 0);
})().catch(e => { console.error('FAIL', e.stack || e.message); process.exit(1); });
