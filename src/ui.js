// ui.js — architectural-minimal overlay. Three interchangeable navigation widgets
// (vertical slider / focus dial / horizontal scale), compass, mode + fading hints.
const NS = 'http://www.w3.org/2000/svg';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const svg = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };

export function mountUI(container, nav, uiOpts = {}) {
  const ov = el('div', 'overlay');
  container.appendChild(ov);

  // ---------- wordmark ----------
  const wm = el('div', 'wordmark');
  const wmTitle = uiOpts.title || 'Приход';
  wm.innerHTML = `<div class="a">${wmTitle}</div><div class="rule"></div>`;
  ov.appendChild(wm);

  // ---------- render-style toggle ----------
  let renderSeg = null;
  if (uiOpts.fixedRenderStyle) {
    // single locked render mode — no toggle shown (e.g. grounds widget = "Цвет")
    nav.onReady(() => nav.setRenderStyle(uiOpts.fixedRenderStyle));
  } else {
    const rs = el('div', 'rstyle');
    const styles = uiOpts.renderStyles || [{ s: 'solid', label: 'Гипс' }, { s: 'sketch', label: 'Набросок' }];
    const segHtml = styles.map((o, i) => `<button data-s="${o.s}"${i === 0 ? ' class="on"' : ''}>${o.label}</button>`).join('');
    rs.innerHTML = `<div class="cap">Отрисовка</div><div class="seg2">${segHtml}</div>`;
    ov.appendChild(rs);
    renderSeg = rs;
    rs.querySelectorAll('.seg2 button').forEach((b) => {
      b.onclick = () => {
        rs.querySelectorAll('.seg2 button').forEach((x) => x.classList.toggle('on', x === b));
        nav.setRenderStyle(b.dataset.s);
      };
    });
  }

  // ---------- fullscreen button ----------
  const fsBtn = el('button', 'fsbtn');
  const ICON_EXPAND = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M2 6 V2 H6 M10 2 H14 V6 M14 10 V14 H10 M6 14 H2 V10"/></svg>`;
  const ICON_SHRINK = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M6 2 V6 H2 M14 6 H10 V2 M10 14 V10 H14 M2 10 H6 V14"/></svg>`;
  fsBtn.innerHTML = ICON_EXPAND + `<span>Экран</span>`;
  fsBtn.title = 'Полный экран';
  ov.appendChild(fsBtn);
  const fsTarget = document.documentElement;
  const fsElement = () => document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || null;
  fsBtn.onclick = () => {
    try {
      if (!fsElement()) {
        const req = fsTarget.requestFullscreen || fsTarget.webkitRequestFullscreen || fsTarget.mozRequestFullScreen || fsTarget.msRequestFullscreen;
        if (req) { const p = req.call(fsTarget); if (p && p.catch) p.catch(() => {}); }
      } else {
        const ex = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen || document.msExitFullscreen;
        if (ex) ex.call(document);
      }
    } catch (e) { /* fullscreen may be blocked by host policy */ }
  };
  const onFsChange = () => {
    const on = !!fsElement();
    fsBtn.classList.toggle('on', on);
    fsBtn.querySelector('svg').outerHTML = on ? ICON_SHRINK : ICON_EXPAND;
    fsBtn.title = on ? 'Выйти из полного экрана' : 'Полный экран';
  };
  document.addEventListener('fullscreenchange', onFsChange);
  document.addEventListener('webkitfullscreenchange', onFsChange);

  // ---------- compass ----------
  const comp = el('div', 'compass');
  const strip = el('div', 'strip');
  const PPD = 2.0, DIRS = { 0: 'С', 90: 'В', 180: 'Ю', 270: 'З' };
  for (let d = -120; d <= 480; d += 15) {
    const norm = ((d % 360) + 360) % 360;
    const isCard = norm % 90 === 0;
    const m = el('div', 'm ' + (isCard ? 'md' : 'mi'));
    m.style.left = d * PPD + 'px';
    if (isCard) m.appendChild(el('div', 't', DIRS[norm]));
    else if (norm % 45 === 0) { const t = el('div', 't', norm); t.style.color = 'var(--ink-3)'; t.style.fontSize = '8px'; m.appendChild(t); }
    strip.appendChild(m);
  }
  comp.appendChild(strip);
  comp.appendChild(el('div', 'needle'));
  const hd = el('div', 'hd', '0°'); comp.appendChild(hd);
  ov.appendChild(comp);
  const compW = 300;
  function updateCompass(heading) {
    strip.style.transform = `translateX(${compW / 2 - heading * PPD}px)`;
    hd.textContent = Math.round(heading) + '°';
  }

  // ---------- status: mode + hint ----------
  const status = el('div', 'statusbar');
  const modeline = el('div', 'modeline');
  modeline.innerHTML = `<div class="dot"></div><div class="txt">Обзор</div>`;
  const hintWrap = el('div', 'hint-wrap');
  const hint = el('div', 'hint');
  const hideBtn = el('button', 'hint-hide', 'Скрыть');
  hintWrap.appendChild(hint); hintWrap.appendChild(hideBtn);
  const showBtn = el('button', 'hint-show', '? Управление');
  status.appendChild(modeline); status.appendChild(hintWrap); status.appendChild(showBtn);
  // The bottom-left status cluster (mode line + persistent control explanation) is
  // intentionally NOT mounted: the bottom-right toggle shows the active mode and the
  // centre watermark teaches the click gestures. Kept built so refs below stay valid.
  const modeTxt = modeline.querySelector('.txt');

  const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  const G = uiOpts.groundWord || { dat: 'полу', acc: 'пол' };  // floor vs ground wording
  const HINTS = isTouch ? {
    orbit: `<b>Проведите</b> — повернуть · <b>двойное касание</b> по ${G.dat} — войти в прогулку`,
    walk: `<b>Коснитесь ${G.acc === 'пол' ? 'пола' : 'земли'}</b> — идти · <b>проведите</b> — осмотреться · <b>двойное касание</b> — выйти из прогулки`,
  } : {
    orbit: `<b>Тяните</b> — повернуть · <span class="k">Shift</span> или правая кнопка — сдвинуть · <b>двойной клик</b> по ${G.dat} — войти в прогулку`,
    walk: `<span class="k">W</span><span class="k">A</span><span class="k">S</span><span class="k">D</span> или <b>клик</b> по ${G.dat} — идти · <span class="k">←</span><span class="k">→</span> — повернуть · <b>Тяните</b> — осмотреться · <b>двойной клик</b> — выйти из прогулки`,
  };
  // instructions stay visible by default; user can hide (preference persists)
  let hintHidden = false;
  try { hintHidden = localStorage.getItem('nav.hintHidden') === '1'; } catch (e) {}
  let lastHintMode = null;
  function applyHintVis() {
    hintWrap.style.display = hintHidden ? 'none' : '';
    showBtn.style.display = hintHidden ? '' : 'none';
  }
  function showHint(mode) {
    if (mode !== lastHintMode) { lastHintMode = mode; hint.innerHTML = HINTS[mode]; }
  }
  hideBtn.onclick = () => { hintHidden = true; applyHintVis(); try { localStorage.setItem('nav.hintHidden', '1'); } catch (e) {} };
  showBtn.onclick = () => { hintHidden = false; applyHintVis(); try { localStorage.setItem('nav.hintHidden', '0'); } catch (e) {} };
  applyHintVis();

  // ============================================================
  //  WIDGET I — vertical immersion slider
  // ============================================================
  const W1 = el('div', 'w-slider');
  W1.innerHTML = `
    <div class="ends">
      <div class="e"><div class="n">3/4</div><div class="s">обзор</div></div>
      <div class="e"><div class="n">Прогулка</div><div class="s">присутствие</div></div>
    </div>
    <div class="scale">
      <div class="track"></div><div class="fill"></div><div class="knob"></div>
    </div>`;
  const w1scale = W1.querySelector('.scale'), w1fill = W1.querySelector('.fill'), w1knob = W1.querySelector('.knob');
  for (let i = 0; i <= 20; i++) {
    const t = el('div', 'ti ' + (i % 5 === 0 ? 'maj' : 'min'));
    t.style.top = (i / 20 * 100) + '%';
    w1scale.appendChild(t);
  }
  function w1render(imm) {
    const y = imm * 100;
    w1knob.style.top = y + '%';
    w1fill.style.height = y + '%';
  }
  dragValue(w1knob, w1scale, (e, rect) => clamp((e.clientY - rect.top) / rect.height, 0, 1), nav);
  dragValue(w1scale, w1scale, (e, rect) => clamp((e.clientY - rect.top) / rect.height, 0, 1), nav, true);

  // ============================================================
  //  WIDGET II — focus dial (270° sweep, gap at bottom)
  // ============================================================
  const W2 = el('div', 'w-dial');
  const A0 = 135, A1 = 405; // sweep in degrees (clockwise from bottom-left to bottom-right)
  const cx = 74, cy = 74, rad = 58;
  const s2 = svg('svg', { viewBox: '0 0 148 148' });
  const polar = (a, r) => [cx + r * Math.cos(a * Math.PI / 180), cy + r * Math.sin(a * Math.PI / 180)];
  function arcPath(a0, a1, r) {
    const [x0, y0] = polar(a0, r), [x1, y1] = polar(a1, r);
    const large = (a1 - a0) > 180 ? 1 : 0;
    return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`;
  }
  const trackArc = svg('path', { d: arcPath(A0, A1, rad), fill: 'none', stroke: 'var(--hair)', 'stroke-width': 1 });
  const fillArc = svg('path', { d: arcPath(A0, A0 + 1, rad), fill: 'none', stroke: 'var(--accent)', 'stroke-width': 1.6, 'stroke-linecap': 'butt' });
  s2.appendChild(trackArc); s2.appendChild(fillArc);
  // ticks
  for (let i = 0; i <= 18; i++) {
    const a = A0 + (A1 - A0) * (i / 18);
    const maj = i % 3 === 0;
    const [xa, ya] = polar(a, rad - (maj ? 8 : 4)), [xb, yb] = polar(a, rad);
    s2.appendChild(svg('line', { x1: xa, y1: ya, x2: xb, y2: yb, stroke: maj ? 'var(--hair-strong)' : 'var(--hair)', 'stroke-width': 1 }));
  }
  const grip = svg('circle', { class: 'grip', r: 7, fill: 'var(--panel)', stroke: 'var(--ink)', 'stroke-width': 1, cx: cx, cy: cy + rad });
  s2.appendChild(grip);
  W2.appendChild(s2);
  const w2center = el('div', 'center'); w2center.innerHTML = `<div class="v">3/4</div><div class="m">обзор</div>`;
  W2.appendChild(w2center);
  W2.appendChild(Object.assign(el('div', 'lbl labtop'), { textContent: 'Фокус' }));
  W2.appendChild(Object.assign(el('div', 'lbl endL'), { textContent: '0' }));
  W2.appendChild(Object.assign(el('div', 'lbl endR'), { textContent: '1:1' }));
  const w2v = w2center.querySelector('.v'), w2m = w2center.querySelector('.m');
  function w2render(imm) {
    const a = A0 + (A1 - A0) * imm;
    fillArc.setAttribute('d', arcPath(A0, Math.max(A0 + 0.5, a), rad));
    const [gx, gy] = polar(a, rad);
    grip.setAttribute('cx', gx); grip.setAttribute('cy', gy);
    if (imm < 0.8) { w2v.textContent = '3/4'; w2m.textContent = 'обзор'; }
    else { w2v.textContent = '1:1'; w2m.textContent = 'присутствие'; }
  }
  dragAngle(W2, A0, A1, cx, cy, nav);

  // ============================================================
  //  WIDGET III — horizontal scale bar
  // ============================================================
  const W3 = el('div', 'w-scale');
  W3.innerHTML = `
    <div class="ends"><div class="n">Обзор<span>вид 3/4</span></div><div class="n r">Присутствие<span>от первого лица</span></div></div>
    <div class="bar"><div class="base"></div><div class="fill"></div><div class="plumb"><div class="h"></div></div></div>`;
  const w3bar = W3.querySelector('.bar'), w3fill = W3.querySelector('.fill'), w3plumb = W3.querySelector('.plumb');
  for (let i = 0; i <= 40; i++) {
    const t = el('div', 'ti ' + (i % 5 === 0 ? 'maj' : 'min'));
    t.style.left = (i / 40 * 100) + '%';
    w3bar.appendChild(t);
  }
  function w3render(imm) {
    w3plumb.style.left = (imm * 100) + '%';
    w3fill.style.width = (imm * 100) + '%';
  }
  dragValue(w3plumb, w3bar, (e, rect) => clamp((e.clientX - rect.left) / rect.width, 0, 1), nav);
  dragValue(w3bar, w3bar, (e, rect) => clamp((e.clientX - rect.left) / rect.width, 0, 1), nav, true);

  // ============================================================
  //  Navigation mode toggle — TWO states only: Обзор / Прогулка.
  //  Each button snaps immersion to 0 or 1 — there is no intermediate
  //  zoom to pick (the camera still animates smoothly between the two).
  //  The slider/dial/scale widgets above are built but left unmounted.
  // ============================================================
  const ICON_OVERVIEW = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"><path d="M12 3 L21 8 L12 13 L3 8 Z"/><path d="M3 8 V16 L12 21 L21 16 V8"/><path d="M12 13 V21"/></svg>`;
  const ICON_WALK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><circle cx="13" cy="4.4" r="2"/><path d="M13 7 L11.4 13 L8 20 M13 13 L15.6 16 L15 21 M13 8.6 L8.6 10.6 M13 8.6 L17.6 11"/></svg>`;
  const navToggle = el('div', 'w-toggle');
  navToggle.innerHTML =
    `<div class="modeseg">` +
      `<button data-imm="0" class="on"><span class="ic">${ICON_OVERVIEW}</span><span class="nm">Обзор</span></button>` +
      `<button data-imm="1"><span class="ic">${ICON_WALK}</span><span class="nm">Прогулка</span></button>` +
    `</div>`;
  ov.appendChild(navToggle);
  const navBtns = navToggle.querySelectorAll('.modeseg button');
  navBtns.forEach((b) => { b.onclick = () => nav.setTargetImmersion(+b.dataset.imm); });
  function syncToggle(mode) {
    const walk = mode === 'walk';
    navBtns.forEach((b) => b.classList.toggle('on', (b.dataset.imm === '1') === walk));
  }

  // ---------- gesture watermark (centre): the ONE key action per mode ----------
  // Overview → double-click/tap the floor to enter walk. Walk → single click/tap
  // the floor to move there. Wording adapts to touch vs mouse and floor vs ground.
  const gen = (G.acc === 'пол') ? 'пола' : 'земли';
  const FLOOR = `<path d="M6 39 H42" opacity=".45"/>`;
  const RIPPLE = `<ellipse cx="24" cy="39" rx="10" ry="3.2" opacity=".45"/>`;
  const CURSOR = `<path d="M20 13 L20 31 L24.6 26.7 L27.4 32.7 L30.3 31.3 L27.5 25.5 L33.4 25.3 Z" fill="currentColor" stroke="none"/>`;
  const HAND = `<path d="M21 17 V12.4 a2.4 2.4 0 0 1 4.8 0 V21 l3.7 1.3 a2.8 2.8 0 0 1 1.8 3.1 l-.8 4.9 a3.6 3.6 0 0 1-3.6 3 H22.2 a3.6 3.6 0 0 1-3-1.6 l-3.9-5.5 a2.2 2.2 0 0 1 3.4-2.8 L21 19"/>`;
  const X2 = `<text x="32" y="17" font-family="'IBM Plex Mono', monospace" font-weight="600" font-size="11" fill="currentColor" stroke="none">×2</text>`;
  const gwSvg = (parts) => `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${parts}</svg>`;
  const GW = isTouch ? {
    orbit: gwSvg(`${FLOOR}${RIPPLE}${HAND}${X2}`) + `<div class="t">Дважды коснитесь ${gen}<b>войти в прогулку</b></div>`,
    walk:  gwSvg(`${FLOOR}${RIPPLE}${HAND}${X2}`) + `<div class="t">Коснитесь ${gen} — идти туда<b>дважды — выйти из прогулки</b></div>`,
  } : {
    orbit: gwSvg(`${FLOOR}${RIPPLE}${CURSOR}${X2}`) + `<div class="t">Дважды щёлкните по ${G.dat}<b>войти в прогулку</b></div>`,
    walk:  gwSvg(`${FLOOR}${RIPPLE}${CURSOR}${X2}`) + `<div class="t">Щёлкните по ${G.dat} — идти туда<b>дважды — выйти из прогулки</b></div>`,
  };
  const gwm = el('div', 'gesture-wm');
  ov.appendChild(gwm);
  let gwTimer = null;
  function showWatermark(mode) {
    if (!GW[mode]) return;
    if (document.querySelector('.tour-card')) return;   // never overlap the onboarding tour
    gwm.innerHTML = GW[mode];
    gwm.classList.add('show');
    clearTimeout(gwTimer);
    gwTimer = setTimeout(() => gwm.classList.remove('show'), 5000);
  }
  syncToggle('orbit');

  // ---------- bind ----------
  let uiMode = 'orbit';
  nav.onChange((st) => {
    updateCompass(st.heading);
    modeline.classList.toggle('imm', st.mode === 'walk');
    modeTxt.textContent = st.mode === 'walk' ? 'Прогулка' : 'Обзор';
    showHint(st.mode);
    syncToggle(st.mode);
    if (st.mode !== uiMode) { uiMode = st.mode; showWatermark(st.mode); }
    // keep render-style toggle in sync (e.g. programmatic changes)
    if (renderSeg) renderSeg.querySelectorAll('.seg2 button').forEach((x) => x.classList.toggle('on', x.dataset.s === st.renderStyle));
  });
  showHint('orbit');

  // ============================================================
  //  Onboarding tour — coachmarks over each control (first visit)
  // ============================================================
  function startTour() {
    const steps = [
      { el: null, title: 'Как смотреть проект', text: 'Короткий тур по управлению — несколько шагов. Можно пропустить в любой момент.' },
      renderSeg && { el: renderSeg, title: 'Отрисовка', text: 'Переключайте вид модели: <b>«Гипс»</b> — белый макет, <b>«Набросок»</b> — лёгкие линии.' },
      { el: comp, title: 'Компас', text: 'Показывает, в какую сторону направлен ваш взгляд.' },
      { el: navToggle, title: 'Обзор и прогулка', text: isTouch
          ? `Два режима. <b>«Обзор»</b> — взгляд на проект сверху, 3/4. <b>«Прогулка»</b> — от первого лица. Переключайте кнопкой или <b>дважды коснитесь ${gen}</b>.`
          : `Два режима. <b>«Обзор»</b> — взгляд на проект сверху, 3/4. <b>«Прогулка»</b> — от первого лица. Переключайте кнопкой или <b>дважды щёлкните по ${G.dat}</b>.` },
    ].filter(Boolean);

    const scrim = el('div', 'tour-scrim');
    const card = el('div', 'tour-card');
    ov.appendChild(scrim); ov.appendChild(card);
    let i = 0, spotEl = null;

    function clearSpot() { if (spotEl) { spotEl.classList.remove('tour-spot'); spotEl.style.zIndex = ''; spotEl = null; } }
    function place(s) {
      const cw = card.offsetWidth, ch = card.offsetHeight, M = 16, vw = innerWidth, vh = innerHeight;
      if (!s.el) { card.style.left = (vw - cw) / 2 + 'px'; card.style.top = (vh - ch) / 2 + 'px'; return; }
      const r = s.el.getBoundingClientRect();
      let left, top;
      if (vh - r.bottom > ch + M && r.left < vw * 0.72) { top = r.bottom + M; left = r.left; }
      else if (r.left > cw + M) { left = r.left - cw - M; top = r.top; }
      else if (r.top > ch + M) { top = r.top - ch - M; left = r.left; }
      else if (vw - r.right > cw + M) { left = r.right + M; top = r.top; }
      else { left = (vw - cw) / 2; top = vh - ch - M; }
      card.style.left = clamp(left, M, vw - cw - M) + 'px';
      card.style.top = clamp(top, M, vh - ch - M) + 'px';
    }
    function render() {
      const s = steps[i];
      clearSpot();
      if (s.el) { s.el.classList.add('tour-spot'); s.el.style.zIndex = '26'; spotEl = s.el; }
      const last = i === steps.length - 1;
      card.innerHTML =
        `<div class="tc-step">${i + 1} / ${steps.length}</div>` +
        `<div class="tc-title">${s.title}</div>` +
        `<div class="tc-text">${s.text}</div>` +
        `<div class="tc-btns">` +
          (i > 0 ? `<button class="tc-back">Назад</button>` : '') +
          (last ? '' : `<button class="tc-skip">Пропустить</button>`) +
          `<button class="tc-next">${last ? 'Понятно' : 'Далее'}</button>` +
        `</div>`;
      // measure then position (card width is fixed by CSS)
      place(s);
      const back = card.querySelector('.tc-back'); if (back) back.onclick = () => { i = Math.max(0, i - 1); render(); };
      const skip = card.querySelector('.tc-skip'); if (skip) skip.onclick = finish;
      card.querySelector('.tc-next').onclick = () => { if (last) finish(); else { i++; render(); } };
    }
    function finish() {
      clearSpot();
      scrim.remove(); card.remove();
      removeEventListener('resize', onResize);
      try { localStorage.setItem('nav.tourSeen', '1'); } catch (e) {}
      showWatermark(uiMode);   // teach the one key gesture for the current mode
    }
    function onResize() { place(steps[i]); }
    addEventListener('resize', onResize);
    render();
  }
  // expose for manual replay (e.g. the "?" control)
  window.__startTour = startTour;
  function restartTour(){
    document.querySelectorAll('.tour-scrim,.tour-card').forEach(e=>e.remove());
    document.querySelectorAll('.tour-spot').forEach(e=>{ e.classList.remove('tour-spot'); e.style.zIndex=''; });
    startTour();
  }
  const replay = el('button', 'tour-replay', '?');
  replay.title = 'Показать обучение заново';
  replay.setAttribute('aria-label', 'Обучающий тур');
  // Onboarding replay ("?") button intentionally NOT mounted — the pop-up
  // gesture hints already make the controls self-explanatory. Kept built so
  // window.__startTour stays available for the first-run tour.
  void replay;
  let tourSeen = false;
  try { tourSeen = localStorage.getItem('nav.tourSeen') === '1'; } catch (e) {}
  if (!tourSeen) nav.onReady(() => setTimeout(startTour, 1400));
  else nav.onReady(() => setTimeout(() => showWatermark(uiMode), 700));
}

// drag a value control: maps pointer → 0..1 via fn, sets nav.targetImmersion
function dragValue(handle, frame, fn, nav, tapJump) {
  let active = false;
  const down = (e) => {
    e.preventDefault(); e.stopPropagation();
    active = true;
    if (handle.setPointerCapture && e.pointerId != null) handle.setPointerCapture(e.pointerId);
    if (tapJump) nav.setTargetImmersion(fn(e, frame.getBoundingClientRect()));
  };
  const move = (e) => { if (!active) return; nav.setTargetImmersion(fn(e, frame.getBoundingClientRect())); };
  const up = () => { active = false; };
  handle.addEventListener('pointerdown', down);
  addEventListener('pointermove', move);
  addEventListener('pointerup', up);
}

// drag around a dial: absolute pointer angle mapped over [a0,a1] sweep
function dragAngle(node, a0, a1, cx, cy, nav) {
  let active = false;
  const valFromEvent = (e) => {
    const r = node.getBoundingClientRect();
    const scale = 148 / r.width;
    const x = (e.clientX - r.left) * scale, y = (e.clientY - r.top) * scale;
    let a = Math.atan2(y - cy, x - cx) * 180 / Math.PI;     // -180..180
    if (a < a0 - 30) a += 360;                               // unwrap into sweep range
    a = clamp(a, a0, a1);
    return (a - a0) / (a1 - a0);
  };
  const down = (e) => { e.preventDefault(); e.stopPropagation(); active = true; nav.setTargetImmersion(valFromEvent(e)); };
  const move = (e) => { if (active) nav.setTargetImmersion(valFromEvent(e)); };
  const up = () => { active = false; };
  node.addEventListener('pointerdown', down);
  addEventListener('pointermove', move);
  addEventListener('pointerup', up);
}
