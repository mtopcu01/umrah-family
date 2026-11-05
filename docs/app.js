(() => {
  'use strict';

  const I18N = window.I18N;
  const SITE = document.body.dataset.site || 'family';
  const CATS = ['flights', 'train', 'hotel', 'passport', 'visa', 'baggage'];
  const STEPS = ['people', 'categories', 'results'];
  const TRIP_END = '2026-12-02';
  const KEY_STORE = 'umrah.key';
  const SEL_STORE = 'umrah.sel';
  const LANG_STORE = 'umrah.lang';
  const AVATAR_COLORS = ['#1F5C4E', '#B08A3E', '#2F6690', '#6B4C8A', '#8A5A2B', '#3E7C59', '#9A4A5A', '#4A6670', '#7A6A2E'];

  const app = document.getElementById('app');
  const st = {
    lang: 'en',
    data: null,
    tr: {},
    photos: {},
    people: [],
    cats: [],
    errorKey: '',
    unlocking: false,
    exporting: false,
    lastStep: null,
  };

  // ---------- storage (any of these can throw in private mode) ----------
  const store = {
    get(area, k) { try { return window[area].getItem(k); } catch { return null; } },
    set(area, k, v) { try { window[area].setItem(k, v); } catch { /* ignore */ } },
    del(area, k) { try { window[area].removeItem(k); } catch { /* ignore */ } },
  };

  function initialLang() {
    const saved = store.get('localStorage', LANG_STORE);
    if (saved === 'en' || saved === 'tr') return saved;
    return /^tr\b/i.test(navigator.language || '') ? 'tr' : 'en';
  }
  st.lang = initialLang();

  // ---------- text helpers ----------
  function t(key, vars) {
    let s = I18N[st.lang][key] ?? I18N.en[key] ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(v);
    return s;
  }
  // Translate a string that came from the trip data.
  function tx(s) {
    if (s == null) return '';
    s = String(s);
    if (st.lang !== 'tr') return s;
    return (st.tr[s] ?? s).replace(/(\d+)h (\d+)m/g, '$1 sa $2 dk');
  }
  function U(s) {
    const turkish = st.lang === 'tr' || /[çğıöşüİ]/i.test(s);
    return String(s).toLocaleUpperCase(turkish ? 'tr' : 'en');
  }
  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  const plural = (base, n) => t(n === 1 ? `${base}_1` : `${base}_n`, { n });

  // ---------- dates ----------
  const MONTHS = {
    en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    tr: ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'],
  };
  const DAYS = {
    en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    tr: ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'],
  };
  function dparts(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return { y, m, d, wd: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
  }
  // "Fri, Nov 27, 2026" / "27 Kasım 2026, Cuma"
  function fmtDay(iso) {
    if (!iso) return '';
    const { y, m, d, wd } = dparts(iso);
    return st.lang === 'tr'
      ? `${d} ${MONTHS.tr[m - 1]} ${y}, ${DAYS.tr[wd]}`
      : `${DAYS.en[wd]}, ${MONTHS.en[m - 1]} ${d}, ${y}`;
  }
  // "26 Jun 1952" / "26 Haziran 1952"
  function fmtDate(iso) {
    if (!iso) return '';
    const { y, m, d } = dparts(iso);
    return `${d} ${MONTHS[st.lang][m - 1]} ${y}`;
  }
  function dayDiff(a, b) {
    return Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
  }
  function todayIso() {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
  }
  function addMonths(iso, months) {
    const { y, m, d } = dparts(iso);
    const dt = new Date(Date.UTC(y, m - 1 + months, d));
    return dt.toISOString().slice(0, 10);
  }

  // ---------- icons (flat, white on green) ----------
  const svg = (body, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${body}</svg>`;
  const PLANE_PATH = '<path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z" fill="currentColor" stroke="none"/>';
  const ICONS = {
    flights: `<svg viewBox="0 0 24 24" aria-hidden="true" style="color:#fff;transform:rotate(45deg)">${PLANE_PATH}</svg>`,
    train: svg('<rect x="5.5" y="3" width="13" height="14" rx="3"/><path d="M5.5 10h13"/><circle cx="9" cy="13.5" r=".9" fill="#fff"/><circle cx="15" cy="13.5" r=".9" fill="#fff"/><path d="M9 17l-2 4M15 17l2 4M7.6 19.5h8.8"/>'),
    hotel: svg('<rect x="3" y="5.5" width="18" height="13" rx="2"/><rect x="6" y="9" width="5" height="4" rx="1"/><path d="M14 10h4M14 13h3M6 16h12"/>'),
    passport: svg('<rect x="5" y="3" width="14" height="18" rx="2"/><circle cx="12" cy="10" r="3.2"/><path d="M8.8 10h6.4M12 6.8c1 1 1 5.4 0 6.4M12 6.8c-1 1-1 5.4 0 6.4M9 16.5h6"/>'),
    visa: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M6.5 9.5h6M6.5 12.5h4M6.5 15.5h5"/><circle cx="16.5" cy="13" r="2.6"/><path d="M15.4 13l.8.8 1.5-1.6"/>'),
    baggage: svg('<rect x="4.5" y="7" width="15" height="13" rx="2"/><path d="M9 7V4.8c0-.5.4-.8.8-.8h4.4c.4 0 .8.3.8.8V7M9 10.5v6M15 10.5v6"/>'),
  };
  const CHECK = svg('<path d="M5 12.5l4.2 4L19 7" stroke-width="2.6"/>');
  const LOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
  const SMALL_PLANE = `<svg viewBox="0 0 24 24" aria-hidden="true" style="color:#B08A3E">${PLANE_PATH}</svg>`;
  const WHEELCHAIR = '<svg viewBox="0 0 24 24" fill="none" stroke="#123F36" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="4" r="1.6"/><path d="M11 7v6h5l2 5"/><path d="M11 10h4"/><path d="M8 10.5a5.5 5.5 0 1 0 7.5 7"/></svg>';
  const SEAT = '<svg viewBox="0 0 24 24" fill="none" stroke="#123F36" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 3v10h9l2 7M7 13l-1 7M10 9h5"/></svg>';

  // ---------- crypto ----------
  const enc = new TextEncoder();
  const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const toB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
  let blobPromise = null;

  function fetchBlob() {
    if (!blobPromise) {
      blobPromise = fetch('data.enc.json', { cache: 'no-cache' }).then((r) => {
        if (!r.ok) throw new Error('fetch');
        return r.json();
      }).catch((e) => { blobPromise = null; throw e; });
    }
    return blobPromise;
  }
  async function deriveKey(password, blob) {
    const base = await crypto.subtle.importKey('raw', enc.encode(password.normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', hash: 'SHA-256', salt: b64(blob.salt), iterations: blob.iterations },
      base, { name: 'AES-GCM', length: 256 }, true, ['decrypt'],
    );
  }
  async function decrypt(key, blob) {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(blob.iv) }, key, b64(blob.data));
    return JSON.parse(new TextDecoder().decode(plain));
  }
  function accept(payload) {
    st.data = payload.data;
    st.tr = payload.tr || {};
    st.photos = payload.photos || {};
    const sel = JSON.parse(store.get('sessionStorage', SEL_STORE) || '{}');
    const ids = new Set(st.data.people.map((p) => p.id));
    st.people = (sel.people || []).filter((id) => ids.has(id));
    st.cats = (sel.cats || []).filter((c) => CATS.includes(c));
  }

  async function unlock(password) {
    if (st.unlocking) return;
    st.unlocking = true;
    st.errorKey = '';
    renderLock();
    try {
      const blob = await fetchBlob();
      const key = await deriveKey(password, blob);
      let payload;
      try {
        payload = await decrypt(key, blob);
      } catch {
        st.errorKey = 'wrongPassword';
        return;
      }
      store.set('sessionStorage', KEY_STORE, toB64(await crypto.subtle.exportKey('raw', key)));
      accept(payload);
    } catch {
      st.errorKey = 'loadError';
    } finally {
      st.unlocking = false;
      if (st.data) {
        if (!STEPS.includes(route())) history.replaceState(null, '', '#people');
      }
      render();
      if (!st.data) document.getElementById('pw')?.focus();
    }
  }

  async function resumeSession() {
    const raw = store.get('sessionStorage', KEY_STORE);
    if (!raw) return;
    st.unlocking = true;
    renderLock();
    try {
      const blob = await fetchBlob();
      const key = await crypto.subtle.importKey('raw', b64(raw), 'AES-GCM', false, ['decrypt']);
      accept(await decrypt(key, blob));
      if (!STEPS.includes(route())) history.replaceState(null, '', '#people');
    } catch {
      store.del('sessionStorage', KEY_STORE);
    } finally {
      st.unlocking = false;
      render();
    }
  }

  function lock() {
    store.del('sessionStorage', KEY_STORE);
    store.del('sessionStorage', SEL_STORE);
    st.data = null;
    st.tr = {};
    st.photos = {};
    st.people = [];
    st.cats = [];
    st.errorKey = '';
    history.replaceState(null, '', location.pathname + location.search);
    render();
  }

  // ---------- routing ----------
  function route() { return location.hash.replace(/^#\/?/, ''); }
  function go(step) {
    if (route() === step) render();
    else location.hash = step;
  }
  function saveSel() {
    store.set('sessionStorage', SEL_STORE, JSON.stringify({ people: st.people, cats: st.cats }));
  }
  const selPeople = () => st.people.map((id) => st.data.people.find((p) => p.id === id)).filter(Boolean);

  // ---------- shared pieces ----------
  function langToggle() {
    return `<div class="lang" role="group" aria-label="${esc(t('language'))}">${['en', 'tr'].map((l) =>
      `<button type="button" data-action="lang" data-lang="${l}" aria-pressed="${st.lang === l}" lang="${l}">${l.toUpperCase()}</button>`).join('')}</div>`;
  }
  function topbar(eyebrow, title) {
    return `<header class="top stars"><div class="top-in">
      <div class="top-text"><div class="eyebrow">${esc(eyebrow)}</div><h1>${esc(title)}</h1></div>
      <div class="top-actions">${langToggle()}<button type="button" class="lock-btn" data-action="lock">${LOCK}${esc(t('lock'))}</button></div>
    </div></header>`;
  }
  const progress = (n) => `<div class="progress" aria-hidden="true"><span class="on"></span><span class="${n >= 2 ? 'on' : ''}"></span></div>`;
  const bottombar = (left, right) => `<nav class="bottombar"><div class="bottombar-in"><div class="left">${left}</div><div class="right">${right}</div></div></nav>`;
  const lastName = (p) => p.name.slice(p.first.length).trim();
  const initial = (p) => U(p.first.charAt(0));
  function avatar(p) {
    const photo = st.photos[p.id];
    if (photo) return `<span class="avatar"><img src="${photo}" alt=""></span>`;
    const i = st.data.people.indexOf(p);
    return `<span class="avatar" style="background:${AVATAR_COLORS[i % AVATAR_COLORS.length]}" aria-hidden="true">${esc(initial(p))}</span>`;
  }
  const field = (label, value, cls = '') => `<div class="${cls}"><span class="lb">${esc(U(label))}</span><span class="v">${value}</span></div>`;
  const unit = (html) => `<div class="unit">${html}</div>`;

  // ---------- screens ----------
  function renderLock() {
    const prev = document.getElementById('pw')?.value || '';
    app.innerHTML = `<main class="lock-screen">
      <div class="lock-top">${langToggle()}</div>
      <div class="lock-title">
        <div class="eyebrow">${esc(U(t('title')))} · ${esc(U(t(`site_${SITE}`)))}</div>
        <h1>${esc(t('title'))}</h1>
        <p class="sub">${esc(t('subtitle'))}</p>
      </div>
      <form class="lock-panel" id="unlock" novalidate>
        <label class="lb" for="pw">${esc(U(t('password')))}</label>
        <input id="pw" name="password" type="password" autocomplete="current-password" autocapitalize="off" autocorrect="off" spellcheck="false" ${st.unlocking ? 'disabled' : ''}>
        <button class="btn-gold" type="submit" ${st.unlocking ? 'disabled' : ''}>${esc(st.unlocking ? t('unlocking') : t('enter'))}</button>
        <p class="err" role="alert">${st.errorKey ? esc(t(st.errorKey)) : ''}</p>
      </form>
    </main>`;
    const input = document.getElementById('pw');
    input.value = st.errorKey === 'wrongPassword' ? '' : prev;
  }

  function renderPeople() {
    const all = st.people.length === st.data.people.length;
    return topbar(U(t('step1')), t('whoTitle')) + `<main class="content">${progress(1)}
      <div class="row-hint"><p class="hint">${esc(t('whoHint'))}</p>
        <button type="button" class="link" data-action="${all ? 'clear' : 'all'}">${esc(all ? t('clearAll') : t('selectAll'))}</button></div>
      <div class="people">${st.data.people.map((p) => `
        <button type="button" class="person" data-action="person" data-id="${esc(p.id)}" aria-pressed="${st.people.includes(p.id)}">
          <span class="badge">${CHECK}</span>${avatar(p)}
          <span class="first">${esc(p.first)}</span><span class="last">${esc(lastName(p))}</span>
        </button>`).join('')}
      </div></main>` + bottombar(
      `<span class="count" aria-live="polite">${esc(t('nSelected', { n: st.people.length }))}</span>`,
      `<button type="button" class="btn-gold" data-action="next" ${st.people.length ? '' : 'disabled'}>${esc(t('next'))}</button>`,
    );
  }

  function renderCategories() {
    return topbar(U(t('step2')), t('whatTitle')) + `<main class="content">${progress(2)}
      <div class="chips">${selPeople().map((p) => `<span class="chip">${esc(p.first)}</span>`).join('')}</div>
      <p class="hint" style="margin-bottom:12px">${esc(t('whatHint'))}</p>
      <div class="cats">${CATS.map((c) => `
        <button type="button" class="cat" data-action="cat" data-id="${c}" aria-pressed="${st.cats.includes(c)}">
          <span class="ic">${ICONS[c]}</span>
          <span class="txt"><span class="t">${esc(t(`cat_${c}`))}</span><span class="d">${esc(t(`cat_${c}_d`))}</span></span>
          <span class="box">${CHECK}</span>
        </button>`).join('')}
      </div></main>` + bottombar(
      `<button type="button" class="btn-ghost" data-action="to-people">${esc(t('back'))}</button>
       <span class="count">${esc(t('summary', { p: plural('people', st.people.length), c: plural('items', st.cats.length) }))}</span>`,
      `<button type="button" class="btn-gold" data-action="display" ${st.cats.length ? '' : 'disabled'}>${esc(t('display'))}</button>`,
    );
  }

  function resultsTitle() {
    const cats = CATS.filter((c) => st.cats.includes(c));
    if (cats.length === 1) return t(`cat_${cats[0]}`);
    if (cats.length === 2) {
      const loc = st.lang === 'tr' ? 'tr' : 'en';
      return `${t(`cat_${cats[0]}`)} & ${t(`cat_${cats[1]}`).toLocaleLowerCase(loc)}`;
    }
    return t('results');
  }

  function renderResults() {
    const { alerts, sections } = buildBlocks();
    const eyebrow = U(selPeople().map((p) => p.first).join(' · '));
    return topbar(eyebrow, resultsTitle()) + `<main class="content">${progress(2)}
      ${alerts ? `<div class="sec">${alerts}</div>` : ''}
      ${sections.map((s) => `<section class="sec">${secHeading(s.cat)}
        <div class="grid ${s.cat === 'flights' || s.cat === 'train' ? 'wide' : s.cat === 'baggage' ? 'single' : ''}">${s.units.join('')}</div></section>`).join('')}
      </main>` + bottombar(
      `<button type="button" class="btn-ghost" data-action="to-categories">${esc(t('back'))}</button>
       <button type="button" class="btn-ghost" data-action="restart">${esc(t('startOver'))}</button>`,
      `<button type="button" class="btn-gold" data-action="pdf">${esc(t('exportPdf'))}</button>`,
    );
  }

  const secHeading = (cat) => `<h2 class="sec-h"><span class="ic sm">${ICONS[cat]}</span>${esc(t(`cat_${cat}`))}</h2>`;

  function buildBlocks() {
    const people = selPeople();
    const ids = new Set(st.people);
    const list = (st.data.alerts || [])
      .filter((a) => a.who === 'all' || (Array.isArray(a.who) && a.who.some((id) => ids.has(id))))
      .sort((a, b) => (a.level === 'urgent' ? 0 : 1) - (b.level === 'urgent' ? 0 : 1));
    const alerts = list.length ? `<div class="alerts unit">${list.map((a) => `
      <div class="alert ${a.level === 'urgent' ? 'urgent' : 'reminder'}"><span class="lvl">${esc(U(t(a.level === 'urgent' ? 'urgent' : 'reminder')))}</span><p>${esc(tx(a.text))}</p></div>`).join('')}</div>` : '';
    const sections = CATS.filter((c) => st.cats.includes(c)).map((cat) => ({
      cat,
      units: cat === 'baggage' ? baggageUnits(people) : people.flatMap((p) => CARDS[cat](p)),
    })).filter((s) => s.units.length);
    return { alerts, sections };
  }

  // ---------- cards ----------
  function flightUnits(p) {
    const f = p.flights;
    if (!f) return [];
    return ['outbound', 'return'].filter((d) => f[d]?.legs?.length).map((dir) => {
      const legs = f[dir].legs.map((leg, i) => (i ? `<div class="layover">${esc(t('layover'))} · ${esc(tx(f[dir].layover))}</div>` : '') + boardingPass(p, f, leg)).join('');
      const notes = [
        f.wheelchair && `<div class="note-chip">${WHEELCHAIR}<span>${esc(tx(f.wheelchair))}</span></div>`,
        f.seatNote && `<div class="note-chip">${SEAT}<span>${esc(tx(f.seatNote))}</span></div>`,
      ].filter(Boolean).join('');
      return unit(`<div class="dir-label"><span>${esc(U(t(dir)))}</span><span class="who">${esc(p.name)}</span></div>${legs}${notes}`);
    });
  }

  function boardingPass(p, f, leg) {
    const days = leg.arriveDate && leg.departDate ? dayDiff(leg.departDate, leg.arriveDate) : 0;
    const seat = leg.seat === 'Assigned at check-in' ? t('atCheckin') : tx(leg.seat);
    const b = f.baggage || {};
    const bag = [
      b.checked && `${esc(tx(b.checked))}`,
      b.carryOn && `${esc(t('carryOn'))}: ${esc(tx(b.carryOn))}`,
      b.underSeat && `${esc(t('underSeat'))}: ${esc(tx(b.underSeat))}`,
    ].filter(Boolean).join('<br>');
    const fields = [
      field(t('passenger'), esc(p.name)),
      field(t('booking'), esc(tx(f.booking))),
      f.eTicket && field(t('eTicket'), esc(f.eTicket)),
      f.bookedVia && field(t('bookedVia'), esc(f.bookedVia)),
    ].filter(Boolean).join('');
    return `<article class="card bp">
      <header class="bp-h stars"><span>${esc(tx(leg.flight))} · ${esc(leg.airline)}</span><span class="bp-date">${esc(fmtDay(leg.departDate))}</span></header>
      <div class="bp-body">
        <div class="bp-main">
          <div class="route">
            <div class="ap"><div class="code">${esc(leg.from)}</div><div class="time">${esc(leg.depart)}</div><div class="apn">${esc(leg.fromName)}</div></div>
            <div class="path"><span>${SMALL_PLANE}${esc(tx(leg.duration))}</span></div>
            <div class="ap r"><div class="code">${esc(leg.to)}</div><div class="time">${esc(leg.arrive)}${days > 0 ? `<sup>+${days}</sup>` : ''}</div><div class="apn">${esc(leg.toName)}</div></div>
          </div>
          <div class="fields">${fields}</div>
        </div>
        <aside class="bp-stub">
          <div><span class="lb">${esc(U(t('seat')))}</span><div class="big ${seat.length > 6 ? 'mid' : ''}">${esc(seat)}</div></div>
          <div><span class="lb">${esc(U(t('baggage')))}</span><div>${bag}</div></div>
          ${leg.meal ? `<div><span class="lb">${esc(U(t('meal')))}</span><div>${esc(tx(leg.meal))}</div></div>` : ''}
        </aside>
      </div>
    </article>`;
  }

  function trainUnits(p) {
    const r = p.train;
    if (!r) return [];
    return [unit(`<article class="card ticket">
      <div class="tk-main">
        <div class="eyebrow">${esc(U([fmtDay(r.date), r.operator, tx(r.class)].filter(Boolean).join(' · ')))}</div>
        <div class="route">
          <div class="ap"><div class="city">${esc(tx(r.from))}</div><div class="time">${esc(r.depart)}</div></div>
          <div class="path"><span>${esc(tx(r.duration))}</span></div>
          <div class="ap r"><div class="city">${esc(tx(r.to))}</div><div class="time">${esc(r.arrive)}</div></div>
        </div>
        <div class="fields">
          ${field(t('passenger'), esc(p.name))}
          ${field(t('booking'), esc(r.booking))}
          ${r.ticketNumber ? field(t('ticketNo'), esc(r.ticketNumber)) : ''}
        </div>
        ${r.gatesOpen ? `<p class="gates">${esc(t('gates', { open: r.gatesOpen, close: r.gatesClose }))}</p>` : ''}
        ${r.notes?.length ? `<ul class="tk-notes">${r.notes.map((n) => `<li>${esc(tx(n))}</li>`).join('')}</ul>` : ''}
      </div>
      <aside class="tk-stub">
        <span class="lb">${esc(U(t('train')))}</span><div class="big">${esc(r.train)}</div>
        <span class="lb">${esc(U(t('coach')))}</span><div class="big">${esc(r.coach)}</div>
        <span class="lb">${esc(U(t('seat')))}</span><div class="big">${esc(r.seat)}</div>
      </aside>
    </article>`)];
  }

  function hotelUnits(p) {
    return (p.hotels || []).map((h) => {
      const mates = (h.roommates || []).filter((n) => !n.startsWith(p.name)).map(tx);
      return unit(`<article class="card key">
        <div class="key-band" aria-hidden="true"></div>
        <div class="key-body">
          <span class="key-chip" aria-hidden="true"></span>
          <div class="eyebrow">${esc(U(`${tx(h.city)} · ${plural('nights', h.nights)}`))}</div>
          <h3>${esc(h.hotel)}</h3>
          <p class="key-sub">${esc([tx(h.room), tx(h.roomType)].filter(Boolean).join(' · '))}</p>
          ${mates.length ? `<p class="key-sub">${esc(t('roomWith', { names: mates.join(', ') }))}</p>` : ''}
          ${h.breakfast ? `<p class="key-sub">${esc(t('breakfast'))}: ${esc(tx(h.breakfast))}</p>` : ''}
          <div class="key-row">
            ${field(t('checkIn'), esc(tx(h.checkIn)))}
            ${field(t('checkOut'), esc(tx(h.checkOut)))}
            ${field(t('booking'), `${esc(tx(h.booking))}${h.bookedUnder ? `<small>${esc(t('bookedUnder', { name: h.bookedUnder }))}</small>` : ''}`)}
          </div>
          <p class="key-addr">${esc([h.address, h.phone].filter(Boolean).join(' · '))}</p>
          ${h.note ? `<p class="key-note">${esc(tx(h.note))}</p>` : ''}
        </div>
        <div class="key-stars" aria-hidden="true"></div>
      </article>`);
    });
  }

  function passportUnits(p) {
    const pp = p.passport;
    if (!pp) return [];
    const valid = pp.expires >= addMonths(TRIP_END, 6);
    const photo = st.photos[p.id] ? `<img src="${st.photos[p.id]}" alt="">` : esc(initial(p));
    const nat = tx(pp.nationality);
    return [unit(`<article class="card pp">
      <header class="pp-h stars"><span class="pp-name">${esc(p.name)}</span><span class="pp-tag">${esc(U(t('passport')))} · ${esc(U(nat))}</span></header>
      <div class="pp-body">
        <div class="pp-photo" aria-hidden="true">${photo}</div>
        <div class="pp-fields">
          ${field(t('passportNumber'), `<span class="pp-num">${esc(pp.number)}</span>`, 'full')}
          ${field(t('nationality'), esc(nat))}
          ${field(t('sex'), esc(t(`sex_${pp.sex}`)))}
          ${field(t('dateOfBirth'), esc(fmtDate(pp.dateOfBirth)))}
          ${field(t('placeOfBirth'), esc(tx(pp.placeOfBirth)))}
          ${field(t('issued'), esc(fmtDate(pp.issued)))}
          ${field(t('expires'), esc(fmtDate(pp.expires)))}
        </div>
      </div>
      <footer class="pp-f">
        <span class="${valid ? 'ok' : 'bad'}">${esc(t(valid ? 'validForTrip' : 'notValidForTrip', { date: fmtDate(TRIP_END) }))}</span>
        <span>${esc(t('tripName'))}</span>
      </footer>
    </article>`)];
  }

  function visaUnits(p) {
    const v = p.visa;
    if (!v) return [];
    const status = ['issued', 'pending', 'needsCorrection'].includes(v.status) ? v.status : 'pending';
    const blank = '<div class="blank"></div>';
    const val = (x) => (status === 'pending' ? blank : esc(x ?? ''));
    const type = v.type ? `${tx(v.type)}${v.entries ? ` · ${tx(v.entries)} ${t('entry')}` : ''}` : '';
    const passportNo = v.passportOnVisa || p.passport?.number || '';
    let rows;
    if (status === 'needsCorrection') {
      rows = [
        field(t('visaNumber'), esc(v.visaNumber)),
        field(t('nationalityOnVisa'), `<span class="bad">${esc(tx(v.nationalityOnVisa))} ✗</span>${v.correctNationality ? `<small style="display:block;font-weight:500;color:var(--muted)">${esc(t('shouldBe', { x: tx(v.correctNationality) }))}</small>` : ''}`),
        field(t('passport'), esc([passportNo, tx(v.correctNationality || p.passport?.nationality)].filter(Boolean).join(' · '))),
        field(t('visaType'), esc(type)),
        field(t('validFrom'), esc(fmtDate(v.validFrom))),
        field(t('validUntil'), esc(fmtDate(v.validUntil))),
        field(t('stayAllowed'), esc(tx(v.stayAllowed))),
        field(t('applicationNo'), esc(v.applicationNumber)),
      ];
    } else {
      rows = [
        field(t('visaNumber'), val(v.visaNumber)),
        field(t('visaType'), status === 'pending' ? blank : esc(type)),
        field(t('validFrom'), status === 'pending' ? blank : esc(fmtDate(v.validFrom))),
        field(t('validUntil'), status === 'pending' ? blank : esc(fmtDate(v.validUntil))),
        field(t('stayAllowed'), status === 'pending' ? blank : esc(tx(v.stayAllowed))),
        field(t('passport'), esc(passportNo)),
        status === 'issued' ? field(t('applicationNo'), esc(v.applicationNumber)) : '',
      ];
    }
    const stamp = status === 'issued'
      ? `<div class="stamp" aria-hidden="true">${esc(U(t('stamp_issued')))}</div>`
      : status === 'pending' ? `<div class="stamp pending" aria-hidden="true">${esc(U(t('stamp_pending')))}</div>` : '';
    const note = v.note
      ? (status === 'needsCorrection' ? `<p class="warn">${esc(tx(v.note))}</p>` : `<p class="visa-note">${esc(tx(v.note))}</p>`)
      : '';
    return [unit(`<article class="card visa">
      <header class="visa-h"><span class="name">${esc(p.name)}</span><span class="pill ${status}">${esc(U(t(`visa_${status}`)))}</span></header>
      <div class="visa-body">${rows.join('')}${stamp}</div>
      ${note}
    </article>`)];
  }

  function baggageUnits(people) {
    const r = st.data.baggageRules;
    if (!r) return [];
    const airlines = new Set(people.flatMap((p) => ['outbound', 'return'].flatMap((d) => p.flights?.[d]?.legs || []).map((l) => l.airline)));
    const short = (s) => tx(s).replace(/\s*(bags?|bavul|çanta)\s*/i, ' ');
    const tiles = [];
    if (r.train) {
      tiles.push(`<div class="tile train"><span class="lb">${esc(U(t('trainLimit')))}</span>
        <div class="big">${esc((r.train.weight.match(/\d+\s*kg/) || [r.train.weight])[0])}</div>
        <div class="s">${esc(tx(r.train.pieces))}</div><div class="s">${esc(tx(r.train.largestBag))}</div></div>`);
    }
    const airlineTile = (name, rule) => `<div class="tile"><span class="lb">${esc(U(name))}</span>
      <div class="big">${esc(short(rule.checked))}</div>
      ${rule.carryOn ? `<div class="s">${esc(t('carryOn'))}: ${esc(tx(rule.carryOn))}</div>` : ''}
      ${rule.underSeat ? `<div class="s">${esc(t('underSeat'))}: ${esc(tx(rule.underSeat))}</div>` : ''}</div>`;
    if (r.qatarAirways && airlines.has('Qatar Airways')) tiles.push(airlineTile('Qatar Airways', r.qatarAirways));
    if (r.pegasus && [...airlines].some((a) => /pegasus/i.test(a))) tiles.push(airlineTile('Pegasus', r.pegasus));
    const head = tx(r.headline || '');
    const cut = head.indexOf('. ');
    const title = cut > 0 ? head.slice(0, cut + 1) : head;
    const rest = cut > 0 ? head.slice(cut + 2) : '';
    return [unit(`<article class="card bag">
      <h3>${esc(title)}</h3>
      <div class="tiles">${tiles.join('')}</div>
      ${rest ? `<p class="bag-p">${esc(rest)}</p>` : ''}
      ${r.train?.extra ? `<p class="bag-x">${esc(tx(r.train.extra))}</p>` : ''}
    </article>`)];
  }

  const CARDS = { flights: flightUnits, train: trainUnits, hotel: hotelUnits, passport: passportUnits, visa: visaUnits };

  // ---------- PDF ----------
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) return resolve();
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  function busy(text, sub = '') {
    let el = document.querySelector('.busy');
    if (!el) {
      el = document.createElement('div');
      el.className = 'busy';
      el.setAttribute('role', 'status');
      document.body.appendChild(el);
    }
    el.innerHTML = `<div><div class="spinner"></div>${esc(text)}<small>${esc(sub)}</small></div>`;
    return el;
  }
  function fileName() {
    const names = selPeople().map((p) => p.first.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i').replace(/[^A-Za-z0-9]/g, ''));
    return `Umrah2026_${names.join('_')}.pdf`;
  }

  async function exportPdf() {
    if (st.exporting) return;
    st.exporting = true;
    const overlay = busy(t('preparingPdf'));
    const stage = document.createElement('div');
    stage.className = 'pdf-stage';
    const scrollY = window.scrollY;
    try {
      await loadScript('vendor/html2canvas.min.js');
      await loadScript('vendor/jspdf.umd.min.js');
      if (document.fonts?.ready) await document.fonts.ready;

      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ unit: 'pt', format: st.lang === 'tr' ? 'a4' : 'letter', compress: true });
      const PW = pdf.internal.pageSize.getWidth();
      const PH = pdf.internal.pageSize.getHeight();
      const M = 30;
      const cw = PW - 2 * M;
      const ch = PH - 2 * M;
      const W = 720;
      const pageH = Math.floor((W * ch) / cw);

      const { alerts, sections } = buildBlocks();
      const names = selPeople().map((p) => p.name).join(', ');
      const blocks = [
        { html: `<div class="pdf-head stars"><div><div class="eyebrow">${esc(U(t('title')))} · ${esc(U(t(`site_${SITE}`)))}</div>
          <div class="pdf-title">${esc(t('title'))}</div><div class="pdf-names">${esc(names)}</div></div>
          <div class="pdf-date">${esc(t('exportedOn', { date: fmtDay(todayIso()) }))}</div></div>` },
        ...(alerts ? [{ html: alerts }] : []),
        ...sections.flatMap((s) => [{ html: secHeading(s.cat), keep: true }, ...s.units.map((html) => ({ html }))]),
      ];

      window.scrollTo(0, 0);
      document.body.appendChild(stage);
      const newPage = () => {
        const pg = document.createElement('div');
        pg.className = 'pdf-page';
        stage.appendChild(pg);
        return pg;
      };
      let page = newPage();
      const tpl = document.createElement('template');
      for (const b of blocks) {
        tpl.innerHTML = b.html.trim();
        const el = tpl.content.firstElementChild;
        if (b.keep) el.dataset.keep = '1';
        page.appendChild(el);
        if (page.offsetHeight > pageH && page.children.length > 1) {
          el.remove();
          const carry = [];
          while (page.lastElementChild?.dataset.keep) {
            const h = page.lastElementChild;
            h.remove();
            carry.unshift(h);
          }
          if (!page.children.length) page.remove();
          page = newPage();
          carry.forEach((c) => page.appendChild(c));
          page.appendChild(el);
        }
      }

      const pages = [...stage.children].filter((pg) => pg.children.length);
      for (let i = 0; i < pages.length; i++) {
        busy(t('preparingPdf'), t('pdfProgress', { i: i + 1, n: pages.length }));
        const canvas = await window.html2canvas(pages[i], {
          scale: 2, backgroundColor: '#ffffff', logging: false, useCORS: true,
          scrollX: 0, scrollY: 0, windowWidth: 1100,
        });
        let w = cw;
        let h = (canvas.height / canvas.width) * cw;
        if (h > ch) { w = (cw * ch) / h; h = ch; }
        if (i > 0) pdf.addPage();
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.9), 'JPEG', M + (cw - w) / 2, M, w, h);
      }
      pdf.save(fileName());
    } catch (e) {
      console.error(e);
      overlay.remove();
      alert(t('pdfFailed'));
      window.print();
    } finally {
      stage.remove();
      document.querySelector('.busy')?.remove();
      window.scrollTo(0, scrollY);
      st.exporting = false;
    }
  }

  // ---------- render ----------
  function render() {
    document.documentElement.lang = st.lang;
    document.title = t('title');
    if (!st.data) return renderLock();

    let r = route();
    if (!STEPS.includes(r)) r = 'people';
    if (r !== 'people' && !st.people.length) r = 'people';
    if (r === 'results' && !st.cats.length) r = 'categories';
    if (r !== route()) history.replaceState(null, '', `#${r}`);

    const focused = document.activeElement?.closest?.('[data-action]');
    const focusSel = focused && focused.dataset.action !== 'lang'
      ? `[data-action="${focused.dataset.action}"]${focused.dataset.id ? `[data-id="${focused.dataset.id}"]` : ''}`
      : focused ? `[data-lang="${focused.dataset.lang}"]` : null;

    app.innerHTML = r === 'people' ? renderPeople() : r === 'categories' ? renderCategories() : renderResults();
    if (focusSel) app.querySelector(focusSel)?.focus({ preventScroll: true });
    if (st.lastStep !== r) window.scrollTo(0, 0);
    st.lastStep = r;
  }

  function toggle(arr, id) {
    const i = arr.indexOf(id);
    if (i >= 0) arr.splice(i, 1); else arr.push(id);
  }

  app.addEventListener('click', (e) => {
    const b = e.target.closest('[data-action]');
    if (!b || b.disabled) return;
    switch (b.dataset.action) {
      case 'lang':
        st.lang = b.dataset.lang;
        store.set('localStorage', LANG_STORE, st.lang);
        render();
        break;
      case 'lock': lock(); break;
      case 'person': toggle(st.people, b.dataset.id); saveSel(); render(); break;
      case 'all':
        for (const p of st.data.people) if (!st.people.includes(p.id)) st.people.push(p.id);
        saveSel(); render(); break;
      case 'clear': st.people = []; saveSel(); render(); break;
      case 'next': go('categories'); break;
      case 'cat': toggle(st.cats, b.dataset.id); saveSel(); render(); break;
      case 'to-people': go('people'); break;
      case 'to-categories': go('categories'); break;
      case 'display': go('results'); break;
      case 'restart': st.people = []; st.cats = []; saveSel(); go('people'); break;
      case 'pdf': exportPdf(); break;
      default:
    }
  });
  app.addEventListener('submit', (e) => {
    if (e.target.id !== 'unlock') return;
    e.preventDefault();
    const pw = document.getElementById('pw').value;
    if (pw) unlock(pw);
  });
  window.addEventListener('hashchange', render);

  render();
  resumeSession();
})();
