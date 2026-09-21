/*
 * Toegangspoort voor Digitale Binas.
 * De eerste keer dat een bezoeker de site opent, moet hij de toegangscode
 * invoeren. Na een juiste invoer wordt dit onthouden (localStorage) zodat de
 * poort niet opnieuw verschijnt.
 *
 * Het script draait synchroon vanuit de <head> zodat de overlay verschijnt
 * vóórdat de onderliggende pagina-inhoud zichtbaar wordt.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'binas_access_granted';
  var ACCESS_CODE = 'vml'; // niet hoofdlettergevoelig

  // Reeds toegang? Dan doen we niets.
  try {
    if (window.localStorage && localStorage.getItem(STORAGE_KEY) === 'true') {
      return;
    }
  } catch (e) {
    // localStorage niet beschikbaar (bv. privémodus): poort tonen, maar de
    // toegang geldt dan alleen voor deze sessie.
  }

  var STYLES = [
    '@import url("https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap");',
    '#binas-gate{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;',
    'padding:24px;box-sizing:border-box;font-family:"Inter",system-ui,-apple-system,sans-serif;',
    'background:linear-gradient(160deg,#f8fafc 0%,#eef2f6 100%);color:#0f172a;}',
    '#binas-gate *{box-sizing:border-box;}',
    '#binas-gate .gate-card{width:100%;max-width:420px;background:#fff;border:1px solid #e2e8f0;',
    'border-radius:16px;padding:40px 36px;box-shadow:0 24px 60px -20px rgba(15,23,42,0.2);text-align:center;}',
    '#binas-gate .gate-icon{width:58px;height:58px;border-radius:50%;background:#f1f5f9;color:#475569;',
    'display:flex;align-items:center;justify-content:center;margin:0 auto 22px;}',
    '#binas-gate h1{font-size:22px;margin:0 0 8px;font-weight:700;letter-spacing:-0.01em;}',
    '#binas-gate p.gate-sub{font-size:15px;color:#64748b;margin:0 0 24px;line-height:1.55;}',
    '#binas-gate form{display:flex;flex-direction:column;gap:12px;}',
    '#binas-gate input{width:100%;padding:14px 16px;font-size:16px;font-family:inherit;text-align:center;',
    'letter-spacing:0.08em;border:1px solid #e2e8f0;border-radius:10px;outline:none;transition:border-color .15s,box-shadow .15s;background:#f8fafc;}',
    '#binas-gate input:focus{border-color:#0f172a;box-shadow:0 0 0 3px rgba(15,23,42,0.12);background:#fff;}',
    '#binas-gate input.gate-error{border-color:#ef4444;box-shadow:0 0 0 3px rgba(239,68,68,0.15);}',
    '#binas-gate button{width:100%;padding:14px 16px;font-size:16px;font-weight:600;font-family:inherit;',
    'color:#fff;background:#0f172a;border:none;border-radius:10px;cursor:pointer;transition:background .15s;}',
    '#binas-gate button:hover{background:#1e293b;}',
    '#binas-gate .gate-msg{min-height:20px;font-size:14px;color:#ef4444;font-weight:500;margin:0;}',
    '#binas-gate .gate-foot{font-size:12px;color:#94a3b8;margin:20px 0 0;}',
    '#binas-gate.gate-hide{opacity:0;transition:opacity .35s ease;pointer-events:none;}',
    '@keyframes binas-gate-shake{0%,100%{transform:translateX(0);}20%,60%{transform:translateX(-6px);}40%,80%{transform:translateX(6px);}}',
    '#binas-gate .gate-shake{animation:binas-gate-shake .4s;}'
  ].join('');

  var style = document.createElement('style');
  style.id = 'binas-gate-style';
  style.appendChild(document.createTextNode(STYLES));
  (document.head || document.documentElement).appendChild(style);

  var overlay = document.createElement('div');
  overlay.id = 'binas-gate';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Site closed');
  overlay.innerHTML = [
    '<div class="gate-card">',
    '  <div class="gate-icon">',
    '    <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">',
    '      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>',
    '      <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>',
    '    </svg>',
    '  </div>',
    '  <h1>This site is currently closed</h1>',
    '  <p class="gate-sub">Access is restricted. Please enter your access code to continue.</p>',
    '  <form id="binas-gate-form" novalidate>',
    '    <input id="binas-gate-input" type="text" inputmode="text" autocomplete="off" autocapitalize="none" spellcheck="false" autofocus placeholder="Access code" aria-label="Access code" />',
    '    <button type="submit">Continue</button>',
    '  </form>',
    '  <p class="gate-msg" id="binas-gate-msg" aria-live="polite"></p>',
    '  <p class="gate-foot">Authorized access only</p>',
    '</div>'
  ].join('');
  document.documentElement.appendChild(overlay);

  // Voorkom scrollen van de achtergrond zolang de poort actief is.
  var htmlEl = document.documentElement;
  var prevOverflow = htmlEl.style.overflow;
  htmlEl.style.overflow = 'hidden';

  function wire() {
    var form = document.getElementById('binas-gate-form');
    var input = document.getElementById('binas-gate-input');
    var msg = document.getElementById('binas-gate-msg');
    var card = overlay.querySelector('.gate-card');

    // Het tekstvak meteen focussen. Sommige browsers negeren een directe
    // focus()-aanroep vlak na het invoegen, dus proberen we het ook nog op de
    // volgende frame en houden we de focus vast zolang de poort actief is.
    function focusInput() {
      if (input && document.body && document.body.contains(input)) {
        try {
          input.focus({ preventScroll: true });
        } catch (e) {
          input.focus();
        }
      }
    }
    focusInput();
    if (window.requestAnimationFrame) {
      requestAnimationFrame(focusInput);
    }
    setTimeout(focusInput, 60);
    if (input) {
      // Houd de focus binnen de poort: klikt iemand ernaast, dan keren we terug.
      overlay.addEventListener('mousedown', function (ev) {
        if (ev.target !== input) {
          ev.preventDefault();
          focusInput();
        }
      });
    }

    function fail() {
      if (msg) {
        msg.textContent = 'Incorrect code. Please try again.';
      }
      if (input) {
        input.classList.add('gate-error');
        input.select();
      }
      if (card) {
        card.classList.remove('gate-shake');
        // forceer reflow zodat de animatie opnieuw start
        void card.offsetWidth;
        card.classList.add('gate-shake');
      }
    }

    function unlock() {
      try {
        if (window.localStorage) {
          localStorage.setItem(STORAGE_KEY, 'true');
        }
      } catch (e) {
        /* negeren */
      }
      htmlEl.style.overflow = prevOverflow;
      overlay.classList.add('gate-hide');
      setTimeout(function () {
        if (overlay && overlay.parentNode) {
          overlay.parentNode.removeChild(overlay);
        }
        if (style && style.parentNode) {
          style.parentNode.removeChild(style);
        }
      }, 400);
    }

    function submit(e) {
      if (e) {
        e.preventDefault();
      }
      var value = (input && input.value ? input.value : '').trim().toLowerCase();
      if (value === ACCESS_CODE) {
        unlock();
      } else {
        fail();
      }
    }

    if (form) {
      form.addEventListener('submit', submit);
    }
    if (input) {
      input.addEventListener('input', function () {
        input.classList.remove('gate-error');
        if (msg) {
          msg.textContent = '';
        }
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire);
  } else {
    wire();
  }
})();
