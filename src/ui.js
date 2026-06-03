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
  const wmSub = uiOpts.subtitle || 'Интерьер — навигация';
  wm.innerHTML = `<div class="a">${wmTitle}</div><div class="b">${wmSub}</div><div class="rule"></div>`;
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
  modeline.innerHTML = `<div class="dot"></div><div class="txt">3/4 Обзор</div><div class="pct">00%</div>`;
  const hintWrap = el('div', 'hint-wrap');
  const hint = el('div', 'hint');
  const hideBtn = el('button', 'hint-hide', 'Скрыть');
  hintWrap.appendChild(hint); hintWrap.appendChild(hideBtn);
  const showBtn = el('button', 'hint-show', '? Управление');
  status.appendChild(modeline); status.appendChild(hintWrap); status.appendChild(showBtn);
  ov.appendChild(status);
  const modeTxt = modeline.querySelector('.txt'), modePct = modeline.querySelector('.pct');

  const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  const G = uiOpts.groundWord || { dat: 'полу', acc: 'пол' };  // floor vs ground wording
  const HINTS = isTouch ? {
    orbit: `<b>Проведите</b> — повернуть · <b>двумя пальцами</b> — сдвинуть · <b>двойное касание</b> по ${G.dat} — войти`,
    walk: `<b>Коснитесь ${G.acc === 'пол' ? 'пола' : 'земли'}</b> — идти · <b>проведите</b> — осмотреться · <b>двойное касание</b> — выйти`,
  } : {
    orbit: `<b>Тяните</b> — повернуть · <span class="k">Shift</span> или правая кнопка — сдвинуть · <b>двойной клик</b> по ${G.dat} — войти`,
    walk: `<span class="k">W</span><span class="k">A</span><span class="k">S</span><span class="k">D</span> или <b>клик</b> по ${G.dat} — идти · <span class="k">←</span><span class="k">→</span> — повернуть · <b>Тяните</b> — осмотреться · <b>двойной клик</b> — выйти`,
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

  const widgets = { 1: W1, 2: W2, 3: W3 };
  const renderers = { 1: w1render, 2: w2render, 3: w3render };

  // Only the slider widget (variant I) — the chosen navigation control.
  ov.appendChild(W1);
  W2.style.display = 'none'; W3.style.display = 'none';
  let active = 1;
  function setActive(n) { active = n; renderers[n](nav.getImmersion()); }
  setActive(1);

  // ---------- bind ----------
  nav.onChange((st) => {
    renderers[active](st.imm);
    updateCompass(st.heading);
    modeline.classList.toggle('imm', st.mode === 'walk');
    modeTxt.textContent = st.mode === 'walk' ? 'Присутствие' : '3/4 Обзор';
    modePct.textContent = String(Math.round(st.imm * 100)).padStart(2, '0') + '%';
    showHint(st.mode);
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
      { el: widgets[1], title: 'Обзор и прогулка', text: isTouch
          ? 'Тяните ползунок вниз, чтобы войти внутрь от первого лица, и вверх — чтобы вернуться к обзору 3/4.'
          : 'Тяните ползунок (или крутите <b>колесо мыши</b>): вниз — войти внутрь от первого лица, вверх — вернуться к обзору 3/4.' },
      { el: status, title: 'Управление', text: isTouch
          ? `<b>Проведите</b> — повернуть · <b>двумя пальцами</b> — сдвинуть · <b>двойное касание</b> по ${G.dat} — войти. В прогулке: <b>коснитесь ${G.acc === 'пол' ? 'пола' : 'земли'}</b> — идти.`
          : `<b>Тяните</b> — повернуть · <b>двойной клик</b> по ${G.dat} — войти. В прогулке: <span class="k">W</span><span class="k">A</span><span class="k">S</span><span class="k">D</span> или <b>клик</b> по ${G.dat} — идти.` },
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
  replay.onclick = restartTour;
  ov.appendChild(replay);
  let tourSeen = false;
  try { tourSeen = localStorage.getItem('nav.tourSeen') === '1'; } catch (e) {}
  if (!tourSeen) nav.onReady(() => setTimeout(startTour, 1400));
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
