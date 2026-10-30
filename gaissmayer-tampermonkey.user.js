// ==UserScript==
// @name         Gaissmayer → 식재리스트툴 자동 저장
// @namespace    https://hubminyoung.github.io/plants/
// @version      1.0
// @description  Gaissmayer 상품 페이지를 열면 사교성·식재간격·서식처유형 등을 읽어 식재리스트툴(Worker KV)에 저장합니다
// @author       K
// @match        https://www.gaissmayer.de/*
// @match        https://gaissmayer.de/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

// 쓰는 법: 식재툴 카드의 🌱 Gsm 링크로 Gaissmayer를 열고, 검색 결과에서 상품을 누르면 자동 저장.
// (링크 주소의 lsk=… 가 식재툴 수종 이름 — 이 탭 안에서 상품을 열 때까지 기억)
// 식재툴을 거치지 않고 연 상품 페이지에서는 오른쪽 아래 상자에서 수종 이름을 확인하고 [저장]을 누르면 됨.

(function () {
  'use strict';
  const WORKER = 'https://plantlist.younrake.workers.dev';
  const LS = 'lsk_plants';

  // 1) 식재툴에서 넘어온 수종 이름 기억 (같은 탭 안에서만)
  const url = new URL(location.href);
  const fromUrl = url.searchParams.get('lsk') || (location.hash.match(/lsk=([^&]+)/) || [])[1];
  if (fromUrl) sessionStorage.setItem(LS, decodeURIComponent(fromUrl));

  // 2) 상품 페이지인지: 상세 항목이 있을 때만
  const LABELS = {
    geselligkeit: 'Geselligkeit', pflanzAbstand: 'Pflanzabstand', lebensbereich: 'Lebensbereich',
    giftklasse: 'Giftklasse', bienenfreundlich: 'Bienenfreundlich', insektenweide: 'Insektenweide',
    pflanzZeitpunkt: 'Pflanz-Zeitpunkt',
  };
  function field(label) {
    // <strong>LABEL …</strong><p>VALUE</p>
    for (const st of document.querySelectorAll('strong')) {
      if (!st.textContent.trim().toLowerCase().startsWith(label.toLowerCase())) continue;
      let n = st.nextElementSibling;
      while (n && n.tagName !== 'P') n = n.nextElementSibling;
      if (!n && st.parentElement) n = st.parentElement.querySelector('p');
      const v = n && n.textContent.trim();
      if (v) return v.replace(/\s+/g, ' ');
    }
    const m = document.body.innerHTML.match(new RegExp('<strong>\\s*' + label + '[\\s\\S]*?<\\/strong>\\s*<p>([^<]+)<\\/p>', 'i'));
    return m ? m[1].trim() : '';
  }
  const vals = {};
  Object.entries(LABELS).forEach(([k, l]) => { const v = field(l) || (k === 'pflanzZeitpunkt' ? field('Pflanzzeitpunkt') : ''); if (v) vals[k] = v; });
  if (!vals.geselligkeit && !vals.pflanzAbstand && !vals.lebensbereich) return;   // 상품 페이지 아님

  // 식재간격 "30 cm, 11 St./m²" → pflanzAbstand "30cm", pflanzCount "11"
  if (vals.pflanzAbstand) {
    const raw = vals.pflanzAbstand;
    const cm = (raw.match(/([\d,.]+)\s*cm/i) || [])[1];
    const st = (raw.match(/([\d,.]+)\s*St/i) || [])[1];
    if (cm) vals.pflanzAbstand = cm.replace(',', '.') + 'cm';
    if (st) vals.pflanzCount = st.replace(',', '.') + '주/m²';
  }
  const h1 = (document.querySelector('h1') || {}).textContent || document.title;
  vals.gsmName = h1.trim().replace(/\s+/g, ' ');
  vals.gaissmayerUrl = location.origin + location.pathname;
  vals.gsmSaved = new Date().toISOString().slice(0, 10);

  const slug = s => String(s || '').toLowerCase().replace(/['‘’"]/g, '').replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-');
  let key = sessionStorage.getItem(LS) || '';
  // 다른 속의 상품을 열었으면 기억한 이름을 쓰지 않음
  if (key && !vals.gsmName.toLowerCase().includes(key.split('-')[0])) key = '';

  // 3) 화면 오른쪽 아래 상자
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:99999;background:#fff;border:2px solid #52b788;border-radius:10px;padding:10px 12px;font:13px/1.5 sans-serif;color:#234;box-shadow:0 4px 16px rgba(0,0,0,.2);max-width:320px';
  document.body.appendChild(box);

  async function save(k) {
    box.innerHTML = '🌿 식재툴에 저장 중…';
    try {
      const r = await fetch(WORKER + '/api/kv/set', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ key: k }, vals)) });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || '저장 실패');
      sessionStorage.removeItem(LS);
      box.innerHTML = `🌿 <b>식재툴에 저장했어요</b><br><span style="color:#567">${k}</span><br>`
        + ['geselligkeit', 'pflanzAbstand', 'pflanzCount', 'lebensbereich'].filter(f => vals[f]).map(f => `${({ geselligkeit: '사교성', pflanzAbstand: '식재간격', pflanzCount: '㎡당', lebensbereich: '서식처' })[f]}: ${vals[f]}`).join('<br>')
        + '<br><span style="color:#789">식재툴 탭으로 돌아가면 채워져요</span>';
      setTimeout(() => { box.style.opacity = '0.5'; }, 6000);
    } catch (e) { box.innerHTML = '⚠️ 저장 실패: ' + e.message; }
  }

  if (key) { save(key); return; }
  // 식재툴에서 오지 않았으면: 이름을 확인하고 직접 저장
  const guess = slug(vals.gsmName.replace(/-Hybride?/i, '').replace(/\b(Sorte|Hybride|Hybrid)\b/gi, ''));
  box.innerHTML = `🌿 식재툴에 저장할 수종 이름<br><input id="lsk-in" value="${guess}" style="width:100%;margin:4px 0;padding:3px 6px;border:1px solid #9c9;border-radius:5px">
    <span style="color:#789;font-size:11px">식재툴에 입력한 학명과 같게 (예: sesleria-greenlee)</span><br>
    <button id="lsk-btn" style="margin-top:4px;background:#52b788;color:#fff;border:0;border-radius:5px;padding:4px 12px;cursor:pointer">저장</button>
    <button id="lsk-x" style="margin-top:4px;background:#eee;border:0;border-radius:5px;padding:4px 10px;cursor:pointer">닫기</button>`;
  box.querySelector('#lsk-btn').onclick = () => { const k = slug(box.querySelector('#lsk-in').value); if (k) save(k); };
  box.querySelector('#lsk-x').onclick = () => box.remove();
})();
