// donate-core.js — shared ST00012 (GOST R 56042) donation QR logic for all widget
// variants. Exposes window.Donate. Loads after qrcode-generator.
(function () {
  const REQ = {
    Name: 'Религиозная организация Патриаршее подворье храма Святой Блаженной Ксении Петербургской в Даниловском Москва РПЦ МП',
    PersonalAcc: '40703810038000014912',
    BankName: 'ПАО СБЕРБАНК',
    BIC: '044525225',
    CorrespAcc: '30101810400000000225',
    // ИНН подтверждён по ЕГРЮЛ/Rusprofile (ОГРН 1197700007890, рук. Кузьмичёв А.Н.).
    PayeeINN: '9709049820',
    KPP: '770901001',
    Category: 'Пожертвование',
    Purpose: 'Пожертвование на уставную деятельность',
  };
  const AMOUNTS = [1000, 5000, 10000, 50000, 100000, 500000];
  const fmt = (n) => n.toLocaleString('ru-RU');

  // ST00012's trailing "2" declares the payload encoding as UTF-8, so the bytes
  // MUST be UTF-8 (the QR lib otherwise stores only the low byte of each char).
  function utf8Bytes(str) { return Array.from(new TextEncoder().encode(str)); }
  if (typeof qrcode !== 'undefined') qrcode.stringToBytes = utf8Bytes;

  function payload(rub) {
    // field order per the working ГОСТ Р 56042 (ST00012) sample
    let s = 'ST00012';
    s += '|Name=' + REQ.Name;
    s += '|PersonalAcc=' + REQ.PersonalAcc;
    s += '|BankName=' + REQ.BankName;
    s += '|BIC=' + REQ.BIC;
    s += '|CorrespAcc=' + REQ.CorrespAcc;
    if (REQ.PayeeINN) s += '|PayeeINN=' + REQ.PayeeINN;
    if (REQ.KPP) s += '|KPP=' + REQ.KPP;
    if (REQ.Category) s += '|Category=' + REQ.Category;
    if (rub > 0) s += '|Sum=' + Math.round(rub * 100);
    s += '|Purpose=' + REQ.Purpose;
    return s;
  }

  function makeQR(str) {
    // EC 'L' keeps the version (density) low so pickier scanners (Сбербанк) read it
    for (const lvl of ['L', 'M']) {
      try { const qr = qrcode(0, lvl); qr.addData(str); qr.make(); return qr; }
      catch (e) { /* capacity — try lower EC */ }
    }
    const qr = qrcode(0, 'L'); qr.addData(str); qr.make(); return qr;
  }

  // draw QR onto a canvas at cssPx logical size; dark/light overridable
  function drawQR(canvas, rub, cssPx, opts) {
    opts = opts || {};
    const dark = opts.dark || '#1b1a16';
    const light = opts.light || '#faf9f5';
    const qr = makeQR(payload(rub));
    const count = qr.getModuleCount();
    const quiet = 4;
    const total = count + quiet * 2;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const cell = Math.max(1, Math.floor((cssPx * dpr) / total));
    const dim = cell * total;
    canvas.width = dim; canvas.height = dim;
    canvas.style.width = cssPx + 'px'; canvas.style.height = cssPx + 'px';
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = light; ctx.fillRect(0, 0, dim, dim);
    ctx.fillStyle = dark;
    for (let r = 0; r < count; r++)
      for (let c = 0; c < count; c++)
        if (qr.isDark(r, c)) ctx.fillRect((c + quiet) * cell, (r + quiet) * cell, cell, cell);
    return canvas;
  }

  // build a labelled PNG and trigger download
  function downloadQR(rub) {
    const tmp = document.createElement('canvas');
    drawQR(tmp, rub, 600);
    const qd = tmp.width, m = 64;
    const out = document.createElement('canvas');
    out.width = qd + m * 2; out.height = qd + m * 2 + 120;
    const o = out.getContext('2d');
    o.fillStyle = '#faf9f5'; o.fillRect(0, 0, out.width, out.height);
    o.drawImage(tmp, m, m);
    o.fillStyle = '#1b1a16'; o.textAlign = 'center';
    o.font = '600 ' + Math.round(qd * 0.10) + 'px "IBM Plex Mono", monospace';
    o.fillText(fmt(rub) + ' \u20BD', out.width / 2, qd + m + 56);
    o.fillStyle = 'rgba(27,26,22,.55)';
    o.font = Math.round(qd * 0.045) + 'px "IBM Plex Mono", monospace';
    o.fillText('Пожертвование · Подворье храма', out.width / 2, qd + m + 92);
    const a = document.createElement('a');
    a.href = out.toDataURL('image/png');
    a.download = 'QR-пожертвование-' + rub + '.png';
    document.body.appendChild(a); a.click(); a.remove();
  }

  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || matchMedia('(pointer:coarse)').matches;
  const SHORT_HINT = {
    phone: 'Сохраните код → приложение банка → «Оплата по QR» → загрузите из галереи → подтвердите.',
    desktop: 'Приложение банка на телефоне → «Оплата по QR» → наведите камеру на код → подтвердите.',
  };

  window.Donate = { REQ, AMOUNTS, fmt, payload, drawQR, downloadQR, isMobile, SHORT_HINT };
})();
