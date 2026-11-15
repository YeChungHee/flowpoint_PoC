// 화면 단순화 측정: 390×844(휴대폰)에서 화면별 보이는 글자 수 · 보이는 버튼(누를 수 있는 것) 수 · 세로 길이(화면 몇 장)
// 사용법: node tests/ux-count.js /절대경로/index.html
// 측정 범위: 현재 화면(.view.on) 안. 탭 바·아래 테스트 막대는 빼고 센다 (단계 전후 비교용 기준 v5)
// 접힌 <details> 안의 버튼은 화면에 보이지 않으므로 세지 않는다 (펼침 요약 줄 summary만 셈, 단계 5부터)
const { chromium } = require('playwright');
const HASHES = ['home', 'report', 'orders', 'sales', 'score', 'flowpay', 'deals', 'calendar', 'inbox'];
// v8부터: 소개 페이지 2개(#intro · #intro-review)와 심사역 #review(사이드바 심사역 전환 후)도 셈. 화면이 없는 판(v7 이하)은 "—" (합계 글자에는 넣지 않음)
const EXTRA = ['intro', 'intro-review', 'review'];
const W = 390, H = 844;
(async () => {
  if (!process.argv[2]){ console.error('사용법: node tests/ux-count.js /절대경로/index.html'); process.exit(2); }
  const file = 'file://' + process.argv[2];
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: W, height: H } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  // 처음부터 다시: 저장 기록을 지우고 다시 열면 시나리오가 새로 만들어진다. 접속 시 뜨는 승인 창은 닫는다
  await p.goto(file + '#home'); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(250);
  if (await p.evaluate(() => document.getElementById('dlg').open)) { await p.click('#dlgLeft [data-act="close"]'); await p.waitForTimeout(100); }
  const rows = [];
  for (const h of [...HASHES, ...EXTRA]) {
    if (h === 'review' && await p.evaluate(() => !!document.getElementById('roleBtn'))) { await p.evaluate(() => { location.hash = 'home'; }); await p.waitForTimeout(150); await p.evaluate(() => document.getElementById('roleBtn').click()); await p.waitForTimeout(200);
      if (await p.evaluate(() => document.getElementById('dlg').open)) { await p.click('#dlgLeft [data-act="close"]'); await p.waitForTimeout(100); } }
    await p.evaluate(x => { location.hash = x; window.scrollTo(0, 0); }, h); await p.waitForTimeout(200);
    rows.push(await p.evaluate(({ h, H }) => {
      const v = document.querySelector('.view.on');
      if (!v || v.id !== 'v-' + h) return { h, none: true };
      const vis = e => !!(e.offsetParent || e.getClientRects().length) && getComputedStyle(e).visibility !== 'hidden';
      const inter = [...v.querySelectorAll('button, a[href], a.btn, input:not([type="hidden"]), select, textarea, summary, [data-act]')]
        .filter(e => vis(e) && !e.closest('[hidden]') && !(e.closest('details:not([open])') && !e.matches('details > summary')) && !(e.matches('[data-act]') && e.parentElement.closest('button, a[href], [data-act]')));
      return { h, chars: v.innerText.replace(/\s+/g, '').length, inter: new Set(inter).size, screens: Math.round(v.scrollHeight / H * 10) / 10 };
    }, { h, H }));
  }
  const pad = (s, n) => String(s).padStart(n);
  console.log('화면 단순화 측정 (' + W + '×' + H + ', 처음부터 다시 후, 승인 창 닫음)');
  console.log('화면'.padEnd(14) + pad('글자 수', 8) + pad('누를 것', 8) + pad('화면 수', 8));
  for (const r of rows) console.log(('#' + r.h).padEnd(14) + (r.none ? pad('—', 10) + pad('—', 10) + pad('—', 10) : pad(r.chars.toLocaleString('ko-KR'), 10) + pad(r.inter, 10) + pad(r.screens, 10)));
  const sum = rows.filter(r => HASHES.includes(r.h)).reduce((a, r) => a + r.chars, 0);
  console.log('합계 글자 수(고객 9개 화면) ' + sum.toLocaleString('ko-KR'));
  console.log('오류: ' + (errs.length ? errs.join(' / ') : '없음'));
  await b.close();
  process.exit(errs.length ? 1 : 0);
})();
