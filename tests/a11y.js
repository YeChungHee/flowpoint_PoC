// 접근성 자동 점검: 글자 대비 · 누르는 영역(44px) · 가로 스크롤 · 확대 200% · 키보드 · 차트 설명 · 움직임 줄이기 · 고대비
// 사용법: node tests/a11y.js /절대/경로/index.html   (실패가 있으면 종료 코드 1)
const { chromium } = require('playwright');
const FILE = 'file://' + process.argv[2];
const KEY = 'flowpoint-test-v6';
const NET_ERR = /^(Failed to load resource|Failed to decode downloaded font|OTS parsing error|Access to font at)/;  // 글꼴·네트워크 요청 실패는 페이지 오류가 아님 (pageerror·스크립트 오류만 셈)
// 'prompt'(접속 시 승인 창)·'ibdetail'(수집함 승인 줄을 눌러 연 상세 시트: 발주 칸 확인 필요 · 승인·수정·반려)·'ibedit'(상세 → 수정 시트, 새 거래 후보 계산서)·'docprev'(거래 문서 미리보기)·'delivery'(납품 확인 시트)는 해시가 아니라 시트를 연 상태
// 'notif'(알림함 시트)·'thanks'(감사 메일 미리보기, 결제 캘린더의 결제 완료 카드에서)도 시트를 연 상태. 'calendar'는 집행 후 결제 1건이 있는 결제 캘린더
// 'saledetail'은 #sales에서 연체 줄을 눌러 연 거래 상세 시트, 'newtrade'는 "+ 새 거래" 입력 시트
// 'fwdsheet'는 집행 후 묶은 매출(한결푸드) 입금 확인 → "오늘 276에 넘길 금액" 시트. #sales는 입금 확인 후 "나중에"(줄에 넘기기), #flowpay는 1건 넘긴 진행률 상태
// 'actsheet'는 심사 화면(포트폴리오 · 이슈 피드 · AI 검토 보고서)에서 이슈 하나의 '조치 기록' 시트를 연 상태
// 'shortsheet'는 #home 오늘 할 일의 "부족 해결"로 연 부족 해결 시트(단계 표시줄 · 이상 · 이유 폭포 · 영향 · 판단(추천 승인·보류))
// 'shortsheet-hold'는 그 시트의 추천 줄 "보류"로 겹쳐 연 보류 사유 시트(기타 선택 · 메모 필수 상태)
// 'report-ar'·'report-ap'는 #report(자금일보)에서 받을 돈 · 줄 돈 탭을 고른 상태 (해시는 #report 그대로)
// 'reconsheet'는 자금일보 맨 위 "차이 330만원 · 확인 필요"로 연 미확인 입금 연결 시트(추천 · 다른 매출 라디오), 'report-linked'는 그 시트에서 연결한 뒤의 자금일보("합계 일치 ✓" · 평소 범위 타일)
// 'score-ledger'는 #score(우리 회사)의 근거 원장에 결과 6가지(진행 중 · 완납 · 연체 · 연체 후 완납 · 부족 해소 · 부족 미해소)가 모두 있고 "더 보기"를 펼친 상태.
// 'score'에는 시나리오용 2건, 'shortsheet'의 판단 구간에는 "지난 같은 상황" 표가 있어야 함(없으면 route 실패)
// 'dealdetail'은 #deals에서 거래 하나를 연 상태(좁은 화면은 상세만), 'link'는 매입처 외부용 화면(#link/<token>, 1단계 발주서 열람)
// 'intro'는 고객 소개 페이지(첫 화면 · 사이드바·탭 바 없음, 자금일보 카드 막대 차트 포함)
// 'intro-review'는 심사역 소개 페이지(새 기록: 미리보기는 고객사 포트폴리오 줄), 'intro-review-q'는 심사 대기 1건이 있을 때(미리보기는 심사 대기 줄)
// 'review'는 심사 대기 1건(목록 표 · 이슈 피드), 'review-empty'는 새 시나리오의 심사 대기 0건 빈 상태, 'rvdetail'은 목록 줄을 눌러 연 상세 시트(AI 검토 보고서), 'rvreason'은 줄의 승인으로 연 판단 사유 창
const HASHES = ['intro', 'intro-review', 'intro-review-q', 'home', 'inbox', 'report', 'report-ar', 'report-ap', 'orders', 'sales', 'score', 'fund', 'flowpay', 'factoring', 'review', 'review-empty', 'rvdetail', 'rvreason', 'company', 'deals', 'dealdetail', 'link', 'prompt', 'ibdetail', 'ibedit', 'docprev', 'delivery', 'calendar', 'notif', 'thanks', 'actsheet', 'saledetail', 'newtrade', 'fwdsheet', 'shortsheet', 'shortsheet-hold', 'reconsheet', 'report-linked', 'score-ledger'];
const SHEETS = ['rvdetail', 'rvreason', 'prompt', 'ibdetail', 'ibedit', 'docprev', 'delivery', 'notif', 'thanks', 'actsheet', 'saledetail', 'newtrade', 'fwdsheet', 'shortsheet', 'shortsheet-hold', 'reconsheet'];
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
  // HTML로 그린 막대 차트(자금일보 받을 돈 나이 · 거래처 쏠림 · 소개 페이지 자금일보 카드): role=img + 수치가 든 설명
  for (const el of document.querySelectorAll('#rpAge, #rpConc, #itBars')){
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
  if (h === 'shortsheet' || h === 'shortsheet-hold'){
    await p.evaluate(() => location.hash = 'home'); await p.waitForTimeout(150);
    await p.evaluate(() => document.querySelector('#sigBox [data-act="shortSheet"]').click()); await p.waitForTimeout(150);
    if (h === 'shortsheet-hold'){
      await p.evaluate(() => document.querySelector('#dlgBody [data-act="shortHold"]').click()); await p.waitForTimeout(150);
      await p.evaluate(() => document.querySelector('#holdBody input[value="기타"]').click()); await p.waitForTimeout(80);
    }
    return;
  }
  if (h === 'reconsheet' || h === 'report-linked'){
    await p.evaluate(() => location.hash = 'report'); await p.waitForTimeout(150);
    await p.evaluate(() => document.getElementById('rpRecon').click()); await p.waitForTimeout(150);
    if (h === 'report-linked'){ await p.evaluate(() => document.querySelector('#dlgFoot [data-act="reconLink"]').click()); await p.waitForTimeout(150); }
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
  if (h === 'score-ledger'){
    await p.evaluate(() => location.hash = 'score'); await p.waitForTimeout(150);
    await p.evaluate(() => { const d = document.querySelector('#scLedger details.led-more'); if (d) d.open = true; }); await p.waitForTimeout(80);
    return;
  }
  if (h === 'company'){
    await p.evaluate(() => location.hash = 'score'); await p.waitForTimeout(120);
    await p.click('#scSeg [data-sc="sale"]'); await p.waitForTimeout(80);
    await p.click('#scSales [data-act="scOpen"]'); await p.waitForTimeout(150);
    return;
  }
  if (h === 'review-empty'){
    await p.evaluate(k => { const s = JSON.parse(localStorage.getItem(k)); s.role = 'reviewer'; localStorage.setItem(k, JSON.stringify(s)); }, KEY);
    await p.reload(); await p.waitForTimeout(150);
    await p.evaluate(() => { if (document.getElementById('dlg').open) document.querySelector('#dlgLeft [data-act="close"]').click(); location.hash = 'review'; }); await p.waitForTimeout(150);
    return;
  }
  if (h === 'rvdetail' || h === 'rvreason'){
    await p.evaluate(() => location.hash = 'review'); await p.waitForTimeout(150);
    await p.evaluate(x => document.querySelector(x === 'rvdetail' ? '#rvQueue tbody tr td.rv-sv' : '#rvQueue tbody tr [data-act="rvReason"][data-r="approve"]').click(), h); await p.waitForTimeout(150);
    return;
  }
  if (h === 'intro-review-q'){
    await p.evaluate(() => location.hash = 'intro-review'); await p.waitForTimeout(150);
    return;
  }
  await p.evaluate(x => location.hash = x, h); await p.waitForTimeout(150);
}

// 심사 대기 1건이 있는 상태를 만든다 (flow.js 3단계와 같은 순서)
async function makeReviewState(b){
  const ctx = await b.newContext({ viewport: { width: 1200, height: 900 } }); const p = await ctx.newPage();
  await p.goto(FILE + '#home'); await p.evaluate(() => localStorage.clear()); await p.reload();
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
  // 심사 대기 줄의 승인 → 사유 창: 미리 체크를 풀고 '입금 이력 양호'만 골라 승인
  await p.click('#rvQueue tbody tr [data-act="rvReason"][data-r="approve"]'); await p.waitForTimeout(150);
  await p.locator('#dlgBody .reasons input:checked').evaluateAll(xs => xs.forEach(x => x.click()));
  await p.locator('#dlgBody .reasons label', { hasText: '입금 이력 양호' }).locator('input').check();
  await p.click('#rrOk'); await p.waitForTimeout(150);
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
  // 근거 원장: 자동 상환 완료된 신청에 연결한 승인(완납) + 진행 중 보류 + 연체 · 연체 후 완납(결과가 붙은 기록) → 시나리오용 2건과 합쳐 6건
  const ledSt = JSON.parse(JSON.stringify(thanksSt)), hd = ledSt.decisions.find(d => d.seeded), t1 = ledSt.apps[0].date;
  const mk = (id, o) => Object.assign(JSON.parse(JSON.stringify(hd)), { id, date: t1, seeded: undefined, sf: { start: t1, need: 2320000 } }, o);
  ledSt.decisions.push(mk('a11y-app', { choice: 'approve', reason: '추천안', appId: ledSt.apps[0].id, result: null }), mk('a11y-wait', { reason: '기타', memo: '다음 주 투자금 입금 예정', by: 'staff', result: null, sf: { start: '2999-01-01', need: 2320000 } }),
    mk('a11y-late', { choice: 'approve', reason: '추천안', appId: 'none', result: { k: 'late', date: t1, note: '예시 신청', delta: -120 } }), mk('a11y-lr', { choice: 'approve', reason: '추천안', appId: 'none', result: { k: 'lateRepaid', date: t1, note: '예시 신청', delta: 25 } }));
  st.role = 'reviewer';
  return { 'score-ledger': JSON.stringify(ledSt), review: JSON.stringify(st), rvdetail: JSON.stringify(st), rvreason: JSON.stringify(st), 'intro-review-q': JSON.stringify(st), link: signSt, deals: JSON.stringify(ready), dealdetail: JSON.stringify(ready), docprev: JSON.stringify(ready), delivery: JSON.stringify(ready),
    actsheet: JSON.stringify(st), calendar: JSON.stringify(ready), notif: JSON.stringify(thanksSt), thanks: JSON.stringify(thanksSt),
    fwdsheet: JSON.stringify(ready), sales: later, flowpay: fwd1 };
}

async function newPage(b, opt, state){
  const ctx = await b.newContext({ viewport: { width: opt.w, height: opt.h }, deviceScaleFactor: opt.dsf || 1, colorScheme: opt.scheme || 'light', reducedMotion: opt.motion || 'no-preference', forcedColors: opt.forced || 'none', contrast: opt.contrast || 'no-preference' });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !NET_ERR.test(m.text())) errs.push(m.text()); });
  await p.goto(FILE + '#home');
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
    if (h !== 'company' && h !== 'link' && h !== 'dealdetail' && !SHEETS.includes(h) && now !== '#' + h.replace(/-(a[rp]|linked|ledger|q|empty)$/, '')) fail('route', h, '해시가 ' + now + '로 바뀜', ctxName);
    // 심사 대기: 1건(목록 표) · 빈 상태(심사 대기 0건)가 실제로 점검 대상인지
    if (h === 'review' || h === 'review-empty'){
      const rv = await p.evaluate(() => [document.querySelectorAll('#rvQueue tbody tr').length, (document.querySelector('#rvQueue .rv-empty-t') || {}).textContent || '']);
      if (h === 'review' ? rv[0] !== 1 : rv[0] !== 0 || rv[1] !== '심사 대기 0건') fail('route', h, '심사 대기 화면 상태가 기대와 다름 (' + rv + ')', ctxName);
    }
    if (SHEETS.includes(h) && !(await p.evaluate(() => document.getElementById('dlg').open))) fail('route', h, '시트가 열리지 않음', ctxName);
    // 근거 원장 · 지난 같은 상황이 점검 대상에 실제로 들어 있는지
    const led = await p.evaluate(() => [document.querySelectorAll('#scLedger .led-rec').length, [...new Set([...document.querySelectorAll('#scLedger .led-rec')].map(l => l.dataset.res))].sort().join(), document.querySelectorAll('#sfPast tbody tr').length]);
    if (h === 'score' && led[0] < 2) fail('route', h, '근거 원장 기록이 없음 (' + led + ')', ctxName);
    if (h === 'score-ledger' && (led[0] !== 6 || led[1] !== 'late,lateRepaid,repaid,resolved,unresolved,wait')) fail('route', h, '근거 원장 결과 6가지가 아님 (' + led + ')', ctxName);
    if (h.indexOf('intro-review') === 0){
      const iq = await p.evaluate(() => [document.getElementById('irQH').textContent, document.querySelectorAll('#irQRows tr').length]);
      if (iq[0] !== (h === 'intro-review-q' ? '심사 대기' : '고객사 포트폴리오') || !iq[1]) fail('route', h, '심사역 소개 미리보기가 기대와 다름 (' + iq + ')', ctxName);
    }
    if (h === 'shortsheet' && led[2] < 2) fail('route', h, '지난 같은 상황 표가 없음 (' + led + ')', ctxName);
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
  // (2-1b) 심사 대기 목록: 줄의 승인 Enter → 사유 창(포커스는 시트 안 · 추천 사유 체크 · 확정 활성), 사유를 모두 풀면 확정 비활성, Esc → 그 줄 승인 버튼으로 포커스
  {
    const { ctx, p } = await newPage(b, { w: 1280, h: 800 }, reviewState.review);
    await p.evaluate(() => location.hash = 'review'); await p.waitForTimeout(150);
    count('keys', 2);
    await p.focus('#rvQueue tbody tr [data-act="rvReason"][data-r="approve"]'); await p.keyboard.press('Enter'); await p.waitForTimeout(150);
    const o = await p.evaluate(() => [document.getElementById('dlg').open, !!document.activeElement.closest('dialog'), document.getElementById('dlgTitle').textContent, document.querySelectorAll('#dlgBody .reasons input:checked').length, document.getElementById('rrOk').disabled]);
    await p.evaluate(() => document.querySelectorAll('#dlgBody .reasons input:checked').forEach(x => x.click())); await p.waitForTimeout(80);
    const off = await p.evaluate(() => document.getElementById('rrOk').disabled);
    if (!o[0] || !o[1] || o[2] !== '승인 사유' || !o[3] || o[4] || !off) fail('keys', 'rv-reason-open', '줄의 승인 Enter로 사유 창이 열리고(포커스 시트 안 · 추천 사유 체크 · 확정 활성) 사유 0개면 비활성이 아님 (' + o + ', ' + off + ')', C + ' #review');
    await p.keyboard.press('Escape'); await p.waitForTimeout(150);
    const back = await p.evaluate(() => !document.getElementById('dlg').open && document.activeElement.dataset.act + ':' + document.activeElement.dataset.r);
    if (back !== 'rvReason:approve') fail('keys', 'rv-reason-esc', 'Esc 후 사유 창이 닫히고 그 줄 승인 버튼으로 포커스가 돌아오지 않음 (' + back + ')', C + ' #review');
    await ctx.close();
  }
  // (2-2) 부족 해결 시트: 홈 오늘 할 일의 "부족 해결"에서 Enter → 시트(맨 위 "이상" 금액에 포커스), Esc → 닫히고 연 버튼으로 포커스.
  //       자금일보 알림의 "부족 해결"도 같은 방식. 추천 "승인" Enter → 신청 시트(단계 제목에 포커스), Esc → 처음 연 버튼으로
  {
    const { ctx, p } = await newPage(b, { w: 1280, h: 800 });
    count('keys', 3);
    for (const [h, sel] of [['home', '#sigBox [data-act="shortSheet"]'], ['report', '#sfCallout [data-act="shortSheet"]']]){
      await p.evaluate(x => location.hash = x, h); await p.waitForTimeout(150);
      await p.focus(sel); await p.keyboard.press('Enter'); await p.waitForTimeout(150);
      const foc = await p.evaluate(() => document.getElementById('dlg').open && document.getElementById('dlgTitle').textContent === '부족 해결' && document.activeElement.id);
      await p.keyboard.press('Escape'); await p.waitForTimeout(150);
      const back = await p.evaluate(s => !document.getElementById('dlg').open && document.activeElement === document.querySelector(s), sel);
      if (foc !== 'sfBig' || !back) fail('keys', 'short-esc-' + h, '부족 해결 시트 포커스(' + foc + ')·Esc 후 연 버튼 포커스(' + back + ')가 맞지 않음', C + ' #' + h);
    }
    await p.focus('#sfCallout [data-act="shortSheet"]'); await p.keyboard.press('Enter'); await p.waitForTimeout(150);
    await p.focus('#dlgBody [data-act="shortGo"]'); await p.keyboard.press('Enter'); await p.waitForTimeout(150);
    const ap = await p.evaluate(() => document.getElementById('dlg').open && !!document.querySelector('#dlg .stepbar') && document.activeElement.classList.contains('step-t'));
    await p.keyboard.press('Escape'); await p.waitForTimeout(150);
    const back2 = await p.evaluate(() => !document.getElementById('dlg').open && document.activeElement.dataset.act);
    if (!ap || back2 !== 'shortSheet') fail('keys', 'short-go', '추천 "승인" Enter로 신청 시트가 열리고(단계 제목 포커스) Esc 후 연 버튼으로 돌아오지 않음 (' + ap + ', ' + back2 + ')', C);
    await ctx.close();
  }
  // (2-2b) 부족 해결 단계 표시줄(390): nav 이름 · 버튼 4개(이상·이유·영향·판단) · Tab으로 차례로 이동 · Enter로 그 구간 제목에 포커스 + 지금 단계(aria-current) · 구간이 표시줄 아래에 보임
  //        보류 사유 시트: 사유 라디오 그룹(이름) · 고르기 전 "보류 기록" 비활성 · 기타는 메모 필수 · Esc는 사유 시트부터, 다음 Esc는 부족 해결 시트
  {
    const C3 = '키보드 390 라이트';
    const { ctx, p } = await newPage(b, { w: 390, h: 844 });
    await p.evaluate(() => location.hash = 'home'); await p.waitForTimeout(150);
    await p.focus('#sigBox [data-act="shortSheet"]'); await p.keyboard.press('Enter'); await p.waitForTimeout(150);
    count('keys', 6);
    const nav = await p.evaluate(() => { const n = document.getElementById('sfSteps'); return n && n.tagName === 'NAV' && n.getAttribute('aria-label') && [...n.querySelectorAll('button')].map(b => b.textContent.trim()).join(','); });
    if (nav !== '1 이상,2 이유,3 영향,4 판단') fail('keys', 'sf-steps-nav', '단계 표시줄이 이름 있는 nav + 버튼 4개(이상·이유·영향·판단)가 아님 (' + nav + ')', C3);
    // 시트 맨 위 포커스(sfBig)에서 Shift+Tab이 아니라 표시줄 첫 버튼부터: 표시줄 버튼에 직접 포커스한 뒤 Tab으로 다음 단계 버튼
    await p.focus('#sfSteps button >> nth=0'); await p.keyboard.press('Tab');
    const tab1 = await p.evaluate(() => document.activeElement.dataset.to);
    if (tab1 !== 'sfH2') fail('keys', 'sf-steps-tab', '단계 표시줄에서 Tab이 다음 단계 버튼(이유)으로 가지 않음 (' + tab1 + ')', C3);
    for (const [i, to] of [[1, 'sfH2'], [2, 'sfH3'], [3, 'sfH4'], [0, 'sfBig']]){
      await p.focus('#sfSteps button >> nth=' + i); await p.keyboard.press('Enter'); await p.waitForTimeout(150);
      const r = await p.evaluate(() => { const nav = document.getElementById('sfSteps').getBoundingClientRect(), a = document.activeElement, ar = a.getBoundingClientRect(), body = document.getElementById('dlgBody').getBoundingClientRect();
        return [a.id, document.querySelector('#sfSteps [aria-current="step"]').dataset.to, ar.top >= nav.bottom - 1 && ar.bottom <= body.bottom + 1]; });
      if (r[0] !== to || r[1] !== to || !r[2]) fail('keys', 'sf-step-' + to, '단계 버튼 Enter 후 포커스(' + r[0] + ')·지금 단계(' + r[1] + ')·보임(' + r[2] + ')이 ' + to + '와 맞지 않음', C3);
    }
    // 보류 사유 시트
    await p.focus('#dlgBody [data-act="shortHold"]'); await p.keyboard.press('Enter'); await p.waitForTimeout(150);
    const h0 = await p.evaluate(() => { const d = document.getElementById('holdDlg'), f = d.querySelector('fieldset'); return [d.open, document.activeElement.name, !!f && document.getElementById(f.getAttribute('aria-labelledby')).textContent, document.getElementById('holdOk').disabled, d.getAttribute('aria-labelledby') && document.getElementById(d.getAttribute('aria-labelledby')).textContent, !!document.querySelector('label[for="holdMemo"]')]; });
    if (!h0[0] || h0[1] !== 'holdR' || h0[2] !== '보류 사유' || !h0[3] || h0[4] !== '보류 사유' || !h0[5]) fail('keys', 'hold-open', '보류 사유 시트: 열림·첫 사유 포커스·라디오 그룹 이름·처음 비활성·제목·메모 이름 중 맞지 않음 (' + h0 + ')', C3);
    // 화살표로 사유 이동(라디오 그룹) → 기타까지 → 메모 없이는 비활성
    for (let i = 0; i < 3; i++){ await p.keyboard.press('ArrowDown'); await p.waitForTimeout(40); }
    const h1 = await p.evaluate(() => [document.activeElement.value, document.getElementById('holdOk').disabled]);
    await p.keyboard.press('Tab'); await p.keyboard.type('메모'); await p.waitForTimeout(60);
    const h2 = await p.evaluate(() => [document.activeElement.id, document.getElementById('holdOk').disabled]);
    if (h1[0] !== '기타' || !h1[1] || h2[0] !== 'holdMemo' || h2[1]) fail('keys', 'hold-other', '화살표로 기타 선택 시 비활성 · Tab으로 메모 입력 후 활성이 아님 (' + h1 + ' / ' + h2 + ')', C3);
    await p.keyboard.press('Escape'); await p.waitForTimeout(150);
    const e1 = await p.evaluate(() => [document.getElementById('holdDlg').open, document.getElementById('dlg').open, document.activeElement.dataset.act]);
    await p.keyboard.press('Escape'); await p.waitForTimeout(150);
    const e2 = await p.evaluate(() => [document.getElementById('dlg').open, document.activeElement.dataset.act]);
    if (e1[0] || !e1[1] || e1[2] !== 'shortHold' || e2[0] || e2[1] !== 'shortSheet') fail('keys', 'hold-esc', 'Esc 순서: 사유 시트 닫힘·보류 버튼 포커스(' + e1 + ') → 부족 해결 시트 닫힘·연 버튼 포커스(' + e2 + ')가 아님', C3);
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
  // (2-4) 미확인 입금 연결 시트(390): 합계 알약 Enter → 시트(추천 라디오에 포커스, 후보 묶음 이름) · 화살표로 후보 이동 · Esc → 알약으로 포커스
  //       다시 열어 추천으로 돌아와 "연결" Enter → 시트 닫히고 알약("합계 일치 ✓")에 포커스. 평소 범위 타일은 이름 있는 묶음(role=group, 숫자 포함)
  {
    const C4 = '키보드 390 라이트';
    const { ctx, p } = await newPage(b, { w: 390, h: 844 });
    await p.evaluate(() => location.hash = 'report'); await p.waitForTimeout(150);
    count('keys', 4);
    const tl = await p.evaluate(() => [...document.querySelectorAll('#rpTiles .rp-tile')].map(t => t.getAttribute('role') === 'group' && /\d/.test(t.getAttribute('aria-label') || '')));
    if (tl.length !== 6 || !tl.every(Boolean)) fail('keys', 'rp-tiles-name', '평소 범위 타일 6개가 이름(숫자 포함) 있는 묶음이 아님 (' + tl + ')', C4 + ' #report');
    await p.focus('#rpRecon'); await p.keyboard.press('Enter'); await p.waitForTimeout(150);
    const o = await p.evaluate(() => { const a = document.activeElement, f = a.closest('fieldset'); return [document.getElementById('dlg').open, a.name, a.checked, a.closest('#rcRec') ? 'rec' : '', f && document.getElementById(f.getAttribute('aria-labelledby')).textContent, document.getElementById('rpRecon').getAttribute('aria-haspopup')]; });
    if (!o[0] || o[1] !== 'rcPick' || !o[2] || o[3] !== 'rec' || !/^연결할 매출 · 금액 같은 \d+건$/.test(o[4] || '') || o[5] !== 'dialog') fail('keys', 'recon-open', '합계 알약 Enter로 연결 시트가 열려 추천 후보(이름 있는 묶음)에 포커스가 가지 않음 (' + o + ')', C4);
    await p.keyboard.press('ArrowDown'); await p.waitForTimeout(60);
    const mv = await p.evaluate(() => [document.activeElement.checked, !!document.activeElement.closest('#rcOther')]);
    if (!mv[0] || !mv[1]) fail('keys', 'recon-arrow', '화살표로 다른 매출 후보로 옮겨 고르지 못함 (' + mv + ')', C4);
    await p.keyboard.press('Escape'); await p.waitForTimeout(150);
    const e1 = await p.evaluate(() => [document.getElementById('dlg').open, document.activeElement.id]);
    if (e1[0] || e1[1] !== 'rpRecon') fail('keys', 'recon-esc', 'Esc 후 연결 시트가 닫히고 합계 알약으로 포커스가 돌아오지 않음 (' + e1 + ')', C4);
    await p.keyboard.press('Enter'); await p.waitForTimeout(150);
    await p.focus('#dlgFoot [data-act="reconLink"]'); await p.keyboard.press('Enter'); await p.waitForTimeout(150);
    const e2 = await p.evaluate(() => [document.getElementById('dlg').open, document.activeElement.id, document.getElementById('rpRecon').textContent.trim()]);
    if (e2[0] || e2[1] !== 'rpRecon' || e2[2] !== '합계 일치 ✓') fail('keys', 'recon-link', '"연결" Enter 후 시트가 닫히고 "합계 일치 ✓" 알약에 포커스가 아님 (' + e2 + ')', C4);
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
