// ==UserScript==
// @name         MBG → 식재리스트툴 자동 전송
// @namespace    https://hubminyoung.github.io/plants/
// @version      2.0
// @description  Missouri Botanical Garden 페이지에서 식물 데이터를 자동으로 파싱해 식재리스트툴로 전송하고, Worker KV에 저장합니다
// @author       K
// @match        https://plantfinder.mobot.org/PlantFinderDetails.aspx*
// @match        https://plantfinder.mobot.org/PlantFinderListResults.aspx*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const WORKER = 'https://plantlist.younrake.workers.dev';
  const TARGET_ORIGIN = 'https://hubminyoung.github.io';
  const urlParams = new URLSearchParams(window.location.search);
  const isDetail = location.pathname.includes('Details');
  const isSearch = location.pathname.includes('ListResults');

  function ent(s) {
    return s
      .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ')
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
      .replace(/&[a-z]+;/g, '').trim();
  }
  function stripTags(s) { return s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); }

  function field(html, label) {
    const re = new RegExp(label + ':\\s*(?:<[^>]+>\\s*)*([^<\\n]+)', 'i');
    const m = html.match(re);
    return m ? ent(m[1]).replace(/\s*(Culture|Problems|Uses|Noteworthy Characteristics)\s*$/i, '').trim() : '';
  }
  function section(html, heading) {
    const re = new RegExp('<h[2-6][^>]*>\\s*' + heading + '\\s*</h[2-6]>\\s*<p[^>]*>([\\s\\S]*?)</p>', 'i');
    const m = html.match(re);
    return m ? ent(stripTags(m[1])).slice(0, 800) : '';
  }

  // ── 검색 결과 페이지: taxonid 맵 수집 → Worker KV 저장 ──
  async function runSearch() {
    const links = [...document.querySelectorAll('a[href*="taxonid"]')];
    if (!links.length) return;

    const items = links.map(a => {
      const url = new URL(a.href);
      return { name: a.textContent.trim(), taxonid: url.searchParams.get('taxonid') };
    }).filter(x => x.name && x.taxonid);

    if (!items.length) return;

    try {
      await fetch(WORKER + '/api/mbg/save-taxon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(items),
      });
      showBadge('✅ ' + items.length + '개 taxonid 저장됨');
    } catch(e) {
      showBadge('⚠️ KV 저장 실패: ' + e.message);
    }
  }

  // ── 상세 페이지: 전체 데이터 스크래핑 → postMessage + Worker KV 저장 ──
  function runDetail() {
    const taxonid = urlParams.get('taxonid');
    if (!taxonid) return;

    const html = document.documentElement.innerHTML;
    const profileIdx = html.indexOf('Common Name:');
    if (profileIdx < 0) { setTimeout(runDetail, 1000); return; }

    const profile = html.slice(profileIdx, profileIdx + 8000);

    // 식물명 추출 (h1 또는 페이지 타이틀)
    const nameEl = document.querySelector('h1, .plant-name, #lblPlantName');
    const plantName = nameEl ? nameEl.textContent.trim() : document.title.split('|')[0].trim();

    const data = {
      commonName:  field(profile, 'Common Name'),
      plantType:   field(profile, 'Type'),
      family:      field(profile, 'Family'),
      nativeRange: field(profile, 'Native Range'),
      zone:        field(profile, 'Zone'),
      heightFeet:  field(profile, 'Height'),
      spreadFeet:  field(profile, 'Spread'),
      bloomTime:   field(profile, 'Bloom Time'),
      bloomColor:  field(profile, 'Bloom Description'),
      sun:         field(profile, 'Sun'),
      water:       field(profile, 'Water'),
      maintenance: field(profile, 'Maintenance'),
      attracts:    field(profile, 'Attracts'),
      tolerate:    field(profile, 'Tolerate'),
      culture:     section(html, 'Culture'),
      noteworthy:  section(html, 'Noteworthy Characteristics'),
      problems:    section(html, 'Problems'),
      uses:        section(html, 'Uses'),
    };

    // 1) Worker KV에 taxonid 매핑 저장 (이름 → taxonid)
    if (plantName) {
      fetch(WORKER + '/api/mbg/save-taxon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([{ name: plantName, taxonid }]),
      }).catch(() => {});
    }

    // 2) Worker KV에 상세 데이터 저장
    fetch(WORKER + '/api/mbg/kv-save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taxonid, data }),
    }).catch(() => {});

    // 3) opener(식재리스트툴 탭)로 postMessage 전송
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage({ source: 'mbg-tampermonkey', taxonid, data }, TARGET_ORIGIN);
      showBadge('✅ 식재리스트툴로 전송 + KV 저장 완료');
    } else {
      showBadge('✅ Worker KV에 저장됨 (taxonid: ' + taxonid + ')');
    }
  }

  function showBadge(msg) {
    const div = document.createElement('div');
    div.textContent = msg;
    Object.assign(div.style, {
      position: 'fixed', top: '12px', right: '12px', zIndex: 99999,
      background: msg.startsWith('✅') ? '#22c55e' : '#f59e0b',
      color: '#fff', padding: '8px 14px', borderRadius: '8px',
      fontSize: '13px', fontFamily: 'sans-serif', boxShadow: '0 2px 8px rgba(0,0,0,.3)',
    });
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 4000);
  }

  const ready = () => isDetail ? runDetail() : (isSearch ? runSearch() : null);
  if (document.readyState === 'complete') ready();
  else window.addEventListener('load', ready);
})();
