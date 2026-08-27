// ==UserScript==
// @name         MBG → 식재리스트툴 자동 전송
// @namespace    https://hubminyoung.github.io/plants/
// @version      1.0
// @description  Missouri Botanical Garden 페이지에서 식물 데이터를 자동으로 파싱해 식재리스트툴로 전송합니다
// @author       K
// @match        https://plantfinder.mobot.org/PlantFinderDetails.aspx*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // taxonid 추출
  const params = new URLSearchParams(window.location.search);
  const taxonid = params.get('taxonid');
  if (!taxonid) return;

  function ent(s) {
    return s
      .replace(/&amp;/g, '&')
      .replace(/&nbsp;/g, ' ')
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
      .replace(/&[a-z]+;/g, '')
      .trim();
  }
  function stripTags(s) {
    return s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }

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

  function run() {
    const html = document.documentElement.innerHTML;
    const profileIdx = html.indexOf('Common Name:');
    if (profileIdx < 0) {
      // 페이지가 아직 로드 중이면 재시도
      setTimeout(run, 1000);
      return;
    }

    const profile = html.slice(profileIdx, profileIdx + 8000);

    const data = {
      commonName:   field(profile, 'Common Name'),
      plantType:    field(profile, 'Type'),
      family:       field(profile, 'Family'),
      nativeRange:  field(profile, 'Native Range'),
      zone:         field(profile, 'Zone'),
      heightFeet:   field(profile, 'Height'),
      spreadFeet:   field(profile, 'Spread'),
      bloomTime:    field(profile, 'Bloom Time'),
      bloomColor:   field(profile, 'Bloom Description'),
      sun:          field(profile, 'Sun'),
      water:        field(profile, 'Water'),
      maintenance:  field(profile, 'Maintenance'),
      attracts:     field(profile, 'Attracts'),
      tolerate:     field(profile, 'Tolerate'),
      culture:      section(html, 'Culture'),
      noteworthy:   section(html, 'Noteworthy Characteristics'),
      problems:     section(html, 'Problems'),
      uses:         section(html, 'Uses'),
    };

    // opener(식재리스트툴 탭)로 전송
    const TARGET_ORIGIN = 'https://hubminyoung.github.io';
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage({ source: 'mbg-tampermonkey', taxonid, data }, TARGET_ORIGIN);
      showBadge('✅ 식재리스트툴로 전송 완료');
    } else {
      // opener가 없으면 localStorage에 직접 저장 (같은 브라우저 프로필이면 접근 가능)
      // 단, cross-origin이므로 불가 — 안내만 표시
      showBadge('⚠️ 식재리스트툴 탭을 열어두세요 (MBG 링크를 툴에서 클릭하면 자동 전송됩니다)');
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

  // 페이지 준비 후 실행
  if (document.readyState === 'complete') run();
  else window.addEventListener('load', run);
})();
