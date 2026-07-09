// ─────────────────────────────────────────────────────────────────────────────
// 식물분석툴 — Cloudflare Worker API Proxy
// ─────────────────────────────────────────────────────────────────────────────
// API 키 기본값 (Cloudflare secrets 미설정 시 fallback)
const DEFAULT_PERENUAL_KEY = 'sk-Zu5O6a3c9480bae9818402';
// GEMINI_API_KEY는 secrets에서만 사용 (기본값 없음)
// ─────────────────────────────────────────────────────────────────────────────

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-app-password',
};

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

    // ── 비밀번호 인증 ──────────────────────────────────────────
    if (env.APP_PASSWORD) {
      const pw = req.headers.get('x-app-password') || '';
      if (pw !== env.APP_PASSWORD) {
        return new Response(JSON.stringify({ error: 'unauthorized' }), {
          status: 401, headers: { ...CORS, 'Content-Type': 'application/json' }
        });
      }
    }

    const { pathname, searchParams } = new URL(req.url);

    try {
      let data;
      if      (pathname === '/api/perenual/search')  data = await perenualSearch(searchParams, env);
      else if (pathname === '/api/perenual/details') data = await perenualDetails(searchParams, env);
      else if (pathname === '/api/perenual/care')    data = await perenualCare(searchParams, env);
      else if (pathname === '/api/mbg/search')       data = await mbgSearch(searchParams);
      else if (pathname === '/api/mbg/details')      data = await mbgDetails(searchParams);
      else if (pathname === '/api/hf/image')         data = await hfImage(req, env);
      else if (pathname === '/api/hf/translate')     data = await hfTranslate(req, env);
      else if (pathname === '/api/gaissmayer/details') data = await gaissmayerDetails(searchParams);
      else if (pathname === '/api/gardenia/test')    data = await gardeniaTest(searchParams);
      else if (pathname === '/api/gardenia/details') data = await gardeniaDetails(searchParams);
      else if (pathname === '/api/kv/get')  data = await kvGet(searchParams, env);
      else if (pathname === '/api/kv/set')  data = await kvSet(req, env);
      else if (pathname === '/api/gemini/image')     data = await geminiImage(req, env);
      else if (pathname === '/api/gemini/test')      data = await geminiTest(env);
      else if (pathname === '/api/naturadb/details') data = await naturadbDetails(searchParams, env);
      else if (pathname === '/api/naturadb/test')    data = await naturadbTest(searchParams);
      else return new Response('Not found', { status: 404, headers: CORS });

      return new Response(JSON.stringify(data), {
        headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' }
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 500,
        headers: { ...CORS, 'Content-Type': 'application/json' }
      });
    }
  }
};


// ── Perenual API ──────────────────────────────────────────────────────────────

async function perenualSearch(params, env) {
  const q = params.get('q') ?? '';
  const key = env.PERENUAL_API_KEY || DEFAULT_PERENUAL_KEY;
  const resp = await fetch(
    `https://perenual.com/api/species-list?key=${key}&q=${encodeURIComponent(q)}&per_page=5`
  );
  return resp.json();
}

async function perenualDetails(params, env) {
  const id = params.get('id') ?? '';
  const key = env.PERENUAL_API_KEY || DEFAULT_PERENUAL_KEY;
  const resp = await fetch(
    `https://perenual.com/api/species/details/${id}?key=${key}`
  );
  return resp.json();
}

async function perenualCare(params, env) {
  const id = params.get('id') ?? '';
  const key = env.PERENUAL_API_KEY || DEFAULT_PERENUAL_KEY;
  const resp = await fetch(
    `https://perenual.com/api/species-care-guide-list?key=${key}&species_id=${id}&per_page=1`
  );
  return resp.json();
}

// ── Missouri Botanical Garden Plant Finder ────────────────────────────────────
// Search: /api/mbg/search?q=<name>  → { taxonid, matchedName, fallback? }
// Detail: /api/mbg/details?taxonid=<id> → { commonName, plantType, family, ... }

const MBG_UA = { 'User-Agent': 'Mozilla/5.0 (compatible; PlantBot/1.0)' };

// 분류학적으로 속명이 바뀐 경우 동의어 매핑 (소문자)
const GENUS_SYNONYMS = {
  'cimicifuga':   'actaea',       // 2005 APG
  'aster':        'symphyotrichum', // 북미 국화과
  'eupatorium':   'eutrochium',   // 북미 등골나물속
  'sedum':        'hylotelephium',// 큰꿩의비름 류
  'lychnis':      'silene',       // 패랭이꽃과
  'chrysanthemum':'glebionis',    // 일부 국화
  'solidago':     'solidago',     // 유지 (변경 없음 — placeholder)
  'echinacea':    'echinacea',    // 유지
};

async function mbgSearch(params) {
  const q = (params.get('q') ?? '').trim();
  if (!q) return { taxonid: null };

  let result = await mbgFetchSearch(q);
  if (result.taxonid) return result;

  // Fallback 1: genus only
  const genus = q.split(' ')[0];
  if (genus && genus !== q) {
    result = await mbgFetchSearch(genus);
    if (result.taxonid) return { ...result, fallback: 'genus' };
  }

  // Fallback 2: 속명 동의어 (예: Cimicifuga → Actaea)
  const synGenus = GENUS_SYNONYMS[(genus || q).toLowerCase()];
  if (synGenus && synGenus !== (genus || q).toLowerCase()) {
    // 재배종명 있으면 동의어속명 + 재배종명 먼저 시도
    const cultivarPart = q.match(/([''][^'']+[''])/)?.[1];
    if (cultivarPart) {
      result = await mbgFetchSearch(`${synGenus} ${cultivarPart}`);
      if (result.taxonid) return { ...result, fallback: 'synonym_cultivar' };
    }
    result = await mbgFetchSearch(synGenus);
    if (result.taxonid) return { ...result, fallback: 'synonym' };
  }

  return { taxonid: null };
}

async function mbgFetchSearch(q) {
  const url = `https://www.missouribotanicalgarden.org/PlantFinder/PlantFinderListResults.aspx?basic=${encodeURIComponent(q)}`;
  const html = await (await fetch(url, { headers: MBG_UA })).text();

  const m = html.match(/taxonid=(\d+)/i);
  if (!m) return { taxonid: null };

  const nm = html.match(/taxonid=\d+[^"]*"[^>]*>(?:<[^>]+>)*([^<]+)/i);
  const matchedName = nm ? nm[1].replace(/&amp;/g,'&').trim() : '';
  return { taxonid: m[1], matchedName };
}

async function mbgDetails(params) {
  const taxonid = (params.get('taxonid') ?? '').trim();
  if (!taxonid) throw new Error('taxonid required');

  const url = `https://www.missouribotanicalgarden.org/PlantFinder/PlantFinderDetails.aspx?taxonid=${taxonid}&isprofile=0`;
  const html = await (await fetch(url, { headers: MBG_UA })).text();

  function ent(s) {
    return s.replace(/&amp;/g,'&').replace(/&nbsp;/g,' ').replace(/&#\d+;/g,'').replace(/&[a-z]+;/g,'').trim();
  }

  // CSS height/width 등을 피하기 위해 식물 프로파일 섹션만 검색
  const profileIdx = html.indexOf('Common Name:');
  const profile = profileIdx >= 0 ? html.slice(profileIdx, profileIdx + 6000) : html;

  function fieldVal(label) {
    const re = new RegExp(label + ':\\s*(?:<[^>]+>\\s*)*([^<\\n]+)', 'i');
    const m = profile.match(re);
    if (!m) return '';
    // 섹션 제목(Culture, Problems, Uses, Noteworthy)이 값에 붙으면 제거
    return ent(m[1]).replace(/\s*(Culture|Problems|Uses|Noteworthy Characteristics)\s*$/i, '').trim();
  }

  function sectionText(heading) {
    const re = new RegExp('<h[2-6][^>]*>\\s*' + heading + '\\s*</h[2-6]>\\s*<p[^>]*>([\\s\\S]*?)</p>', 'i');
    const m = html.match(re);
    if (!m) return '';
    return ent(m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')).slice(0, 800);
  }

  return {
    commonName:   fieldVal('Common Name'),
    plantType:    fieldVal('Type'),
    family:       fieldVal('Family'),
    nativeRange:  fieldVal('Native Range'),
    zone:         fieldVal('Zone'),
    heightFeet:   fieldVal('Height'),
    spreadFeet:   fieldVal('Spread'),
    bloomTime:    fieldVal('Bloom Time'),
    bloomColor:   fieldVal('Bloom Description'),
    sun:          fieldVal('Sun'),
    water:        fieldVal('Water'),
    maintenance:  fieldVal('Maintenance'),
    suggestedUse: fieldVal('Suggested Use'),
    flower:       fieldVal('Flower'),
    leaf:         fieldVal('Leaf'),
    attracts:     fieldVal('Attracts'),
    tolerate:     fieldVal('Tolerate'),
    culture:      sectionText('Culture'),
    noteworthy:   sectionText('Noteworthy Characteristics'),
    problems:     sectionText('Problems'),
    uses:         sectionText('Uses'),
  };
}

// ── Hugging Face Image Generation ────────────────────────────────────────────
// HF_API_KEY: hf.co → Settings → Access Tokens 에서 발급 (무료)
// 모델: black-forest-labs/FLUX.1-schnell (빠르고 고품질)

async function hfImage(req, env) {
  const { prompt } = await req.json();
  const key = env.HF_API_KEY || '';
  if (!key) throw new Error('HF_API_KEY secret not set. hf.co → Settings → Access Tokens에서 발급하세요.');

  const resp = await fetch(
    'https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell',
    {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ inputs: prompt, parameters: { num_inference_steps: 4 } }),
    }
  );

  if (!resp.ok) {
    const txt = await resp.text();
    // 모델 로딩 중이면 estimated_time 반환
    try { const j = JSON.parse(txt); if (j.estimated_time) throw new Error(`모델 로딩 중 (약 ${Math.round(j.estimated_time)}초). 잠시 후 다시 시도하세요.`); } catch(e2) { if (e2.message.includes('로딩')) throw e2; }
    throw new Error(`HF API ${resp.status}: ${txt.slice(0, 200)}`);
  }

  const buffer = await resp.arrayBuffer();
  const bytes  = new Uint8Array(buffer);
  let binary   = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  const base64 = btoa(binary);
  const ct     = resp.headers.get('content-type') || 'image/webp';
  return { image: `data:${ct};base64,${base64}`, ok: true };
}

// ── Hugging Face 번역 (en→ko) ─────────────────────────────────────────────────
async function hfTranslate(req, env) {
  const { text } = await req.json();
  if (!text) return { translation: '' };
  const key = env.HF_API_KEY || '';
  if (!key) throw new Error('HF_API_KEY not set');
  const resp = await fetch(
    'https://api-inference.huggingface.co/models/Helsinki-NLP/opus-mt-tc-big-en-ko',
    { method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ inputs: text.slice(0, 1500) }) }   // 모델 토큰 한계
  );
  if (!resp.ok) {
    const t = await resp.text();
    try { const j = JSON.parse(t); if (j.estimated_time) throw new Error(`모델 로딩 중 (약 ${Math.round(j.estimated_time)}초). 잠시 후 재시도.`); } catch(e2) { if (e2.message.includes('로딩')) throw e2; }
    throw new Error(`HF translate ${resp.status}: ${t.slice(0,200)}`);
  }
  const data = await resp.json();
  const translation = Array.isArray(data) ? data[0]?.translation_text : data?.translation_text;
  return { translation: translation || '' };
}

// ── Gemini Key Test ───────────────────────────────────────────────────────────

async function geminiTest(env) {
  const key = env.GEMINI_API_KEY || '';
  if (!key) return { ok: false, error: 'GEMINI_API_KEY secret not set', keyPrefix: '' };

  const body = JSON.stringify({ contents: [{ parts: [{ text: 'Say hi' }] }] });
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

  // AQ. 형식 키 → Bearer 토큰, AIza 형식 → x-goog-api-key 헤더
  const isOAuth = key.startsWith('AQ.') || key.startsWith('ya29.');
  const authHeader = isOAuth
    ? { 'Authorization': `Bearer ${key}` }
    : { 'x-goog-api-key': key };

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader },
    body,
  });
  const data = await resp.json();
  return { ok: resp.ok, status: resp.status, keyPrefix: key.slice(0, 8) + '...', isOAuth, error: data.error?.message };
}

// ── Gemini Image Generation ───────────────────────────────────────────────────

async function geminiImage(req, env) {
  const body = await req.json();
  const key = env.GEMINI_API_KEY || '';
  const isOAuth = key.startsWith('AQ.') || key.startsWith('ya29.');
  const authHeader = isOAuth
    ? { 'Authorization': `Bearer ${key}` }
    : { 'x-goog-api-key': key };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image:generateContent`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader },
    body: JSON.stringify(body),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.error?.message || `Gemini HTTP ${resp.status}`);
  return data;
}

// ── Gardenia.net ─────────────────────────────────────────────────────────────
const GDN_UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' };

async function gardeniaTest(params) {
  const q = (params.get('q') ?? 'caltha-palustris').trim();
  const url = `https://www.gardenia.net/plant/${q}`;
  try {
    const resp = await fetch(url, { headers: GDN_UA });
    const html = await resp.text();
    return {
      status: resp.status,
      ok: resp.ok,
      hasData: html.includes('Hardiness') || html.includes('plant-detail'),
      preview: html.slice(0, 400),
    };
  } catch(e) {
    return { error: e.message };
  }
}

async function gardeniaDetails(params) {
  const q = (params.get('q') ?? '').trim();
  if (!q) return { error: 'q required' };

  // 학명 → 슬러그
  const slug = q.replace(/\s*[''''][^'''']+['''']\s*/g,'').trim()
    .toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,'');

  const url = `https://www.gardenia.net/plant/${slug}`;
  const resp = await fetch(url, { headers: GDN_UA });
  if (!resp.ok) return { error: `HTTP ${resp.status}`, slug };
  const html = await resp.text();

  function ent(s) {
    return s.replace(/&amp;/g,'&').replace(/&nbsp;/g,' ').replace(/&#\d+;/g,'').trim();
  }
  function field(label) {
    const re = new RegExp(label + '[^<]*</[^>]+>\\s*<[^>]+>([^<]+)', 'i');
    const m = html.match(re);
    return m ? ent(m[1]) : null;
  }
  function fieldAlt(label) {
    const re = new RegExp(label + '[\\s\\S]{0,60}?<[^>]+>([^<]{2,80})', 'i');
    const m = html.match(re);
    return m ? ent(m[1]) : null;
  }

  return {
    hardiness:    field('Hardiness')   || fieldAlt('Hardiness'),
    height:       field('Height')      || fieldAlt('Height'),
    spread:       field('Spread')      || fieldAlt('Spread'),
    bloomTime:    field('Bloom Time')  || fieldAlt('Bloom'),
    sun:          field('Exposure')    || fieldAlt('Exposure') || fieldAlt('Sun'),
    water:        field('Watering')    || fieldAlt('Water'),
    maintenance:  field('Maintenance') || fieldAlt('Maintenance'),
    plantType:    field('Plant Type')  || fieldAlt('Plant Type'),
    nativeRange:  field('Origin')      || fieldAlt('Origin'),
    attracts:     field('Attracts')    || fieldAlt('Attracts'),
    url,
  };
}

// ── Cloudflare KV — 식물 추가 데이터 저장 ────────────────────────────────────
// GET  /api/kv/get?key=caltha-palustris  → { geselligkeit, pflanzAbstand, ... }
// POST /api/kv/set  body: { key, geselligkeit, pflanzAbstand }

async function kvGet(params, env) {
  if (!env.PLANT_DATA) return { error: 'KV not bound' };
  const key = (params.get('key') ?? '').trim().toLowerCase();
  if (!key) return { error: 'key required' };
  const val = await env.PLANT_DATA.get(key, { type: 'json' });
  return val || {};
}

async function kvSet(req, env) {
  if (!env.PLANT_DATA) return { error: 'KV not bound' };
  const body = await req.json();
  const key = (body.key ?? '').trim().toLowerCase();
  if (!key) return { error: 'key required' };
  const entry = {};
  if (body.geselligkeit  !== undefined) entry.geselligkeit  = body.geselligkeit;
  if (body.pflanzAbstand !== undefined) entry.pflanzAbstand = body.pflanzAbstand;
  if (body.pflanzCount   !== undefined) entry.pflanzCount   = body.pflanzCount;
  // 기존 데이터와 병합
  const existing = await env.PLANT_DATA.get(key, { type: 'json' }) || {};
  await env.PLANT_DATA.put(key, JSON.stringify({ ...existing, ...entry }));
  return { ok: true, key, saved: entry };
}

// ── Gaissmayer 식재 정보 ──────────────────────────────────────────────────────
// Geselligkeit (군집도 I~V), Pflanzabstand (식재간격 cm + 개/m²)

const GSM_UA = { 'User-Agent': 'Mozilla/5.0 (compatible; PlantBot/1.0; +https://hubminyoung.github.io/plants/)' };

async function gaissmayerDetails(params) {
  const q = (params.get('q') ?? '').trim();
  if (!q) return { geselligkeit: null, pflanzAbstand: null };

  // 학명 → URL 슬러그 변환 (재배종 제거 후)
  const base = q.replace(/\s*[''''][^'''']+['''']\s*/g, '').trim();
  const slug = base.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

  // 시도할 URL 목록: 직접 슬러그 → 검색
  const urls = [
    `https://www.staudengaertnerei-gaissmayer.de/stauden-shop/${slug}/`,
    `https://www.staudengaertnerei-gaissmayer.de/stauden-shop/staudensuche/?suche=${encodeURIComponent(base)}`,
  ];

  let detailHtml = null;

  for (const url of urls) {
    const resp = await fetch(url, { headers: GSM_UA });
    const html = await resp.text();

    if (url.includes('staudensuche')) {
      // 검색 결과에서 첫 번째 상품 링크 추출
      const m = html.match(/href="(https?:\/\/www\.staudengaertnerei-gaissmayer\.de\/stauden-shop\/(?!staudensuche)[^"]{4,}\/)"/)
             || html.match(/href="(\/stauden-shop\/(?!staudensuche|tag|category)[^"]{4,}\/)"/)
             || html.match(/class="woocommerce-LoopProduct-link[^"]*"\s+href="([^"]+)"/);
      if (!m) return { geselligkeit: null, pflanzAbstand: null, debug: 'no_search_link', preview: html.slice(0,300) };
      const detailUrl = m[1].startsWith('http') ? m[1] : 'https://www.staudengaertnerei-gaissmayer.de' + m[1];
      const dr = await fetch(detailUrl, { headers: GSM_UA });
      detailHtml = await dr.text();
      break;
    } else if (resp.ok) {
      // 직접 URL — Geselligkeit 없어도 일단 사용 시도
      detailHtml = html;
      break;
    }
  }

  if (!detailHtml) return { geselligkeit: null, pflanzAbstand: null, debug: 'no_detail' };

  function extractField(html, label) {
    // WooCommerce attribute table 패턴
    const re1 = new RegExp('<th[^>]*>\\s*' + label + '\\s*</th>\\s*<td[^>]*>([^<]+)', 'i');
    const m1 = html.match(re1);
    if (m1) return m1[1].trim();
    // 일반 패턴
    const re2 = new RegExp(label + '[^<]{0,30}<[^>]+>([^<]{1,80})', 'i');
    const m2 = html.match(re2);
    return m2 ? m2[1].trim() : null;
  }

  const geselligkeit = extractField(detailHtml, 'Geselligkeit');
  const pflanzRaw    = extractField(detailHtml, 'Pflanzabstand');

  let pflanzAbstand = pflanzRaw;
  if (pflanzRaw) {
    const cm  = pflanzRaw.match(/([\d,\.]+)\s*cm/i)?.[1]?.replace(',','.');
    const stm = pflanzRaw.match(/([\d,\.]+)\s*St\./i)?.[1]?.replace(',','.');
    if (cm || stm) pflanzAbstand = [cm ? cm+'cm' : null, stm ? stm+'개/m²' : null].filter(Boolean).join(' · ');
  }

  // 못 찾으면 페이지 일부를 디버그로 반환
  const hasGes = detailHtml.includes('Geselligkeit');
  return {
    geselligkeit:  geselligkeit  || null,
    pflanzAbstand: pflanzAbstand || null,
    debug: hasGes ? 'found_but_no_parse' : 'no_field_in_page',
    preview: detailHtml.slice(detailHtml.indexOf('product') > 0 ? detailHtml.indexOf('product') : 0, 500),
  };
}

// ── Gemini 독일어→한국어 번역 헬퍼 ──────────────────────────────────────────────
async function geminiTranslateDE(prompt, apiKey) {
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + apiKey;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 2048 }
    })
  });
  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    console.error('[Gemini] HTTP', resp.status, errText.slice(0, 200));
    return null;
  }
  const data = await resp.json();
  const result = data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
  if (!result) console.error('[Gemini] empty response:', JSON.stringify(data).slice(0, 200));
  return result;
}

// ── NaturaDB 연결 테스트 ───────────────────────────────────────────────────────
async function naturadbTest(params) {
  const q = params.get('q') || 'caltha-palustris';
  const slug = q.toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,'');
  const url = `https://www.naturadb.de/pflanzen/${slug}/`;
  try {
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept-Language': 'de-DE,de;q=0.9',
        'Accept': 'text/html,application/xhtml+xml',
      }
    });
    const text = await resp.text();
    return {
      ok: resp.ok,
      status: resp.status,
      url,
      htmlLength: text.length,
      hasHöhe: text.includes('Höhe'),
      hasBlick: text.includes('Wichtigste'),
      preview: text.slice(0, 300),
    };
  } catch(e) {
    return { error: e.message, url };
  }
}

// ── NaturaDB 식물 정보 ─────────────────────────────────────────────────────────
async function naturadbDetails(params, env) {
  const q = (params.get('q') ?? '').trim();
  if (!q) return { error: 'q required' };

  const base = q.replace(/\s*['''''][^''''']+[''''']\s*/g, '').trim();
  const slug = base.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  const url  = `https://www.naturadb.de/pflanzen/${slug}/`;

  let html;
  try {
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept-Language': 'de-DE,de;q=0.9',
        'Accept': 'text/html,application/xhtml+xml',
      }
    });
    if (!resp.ok) return { error: `HTTP ${resp.status}`, url };
    html = await resp.text();
  } catch (e) {
    return { error: e.message, url };
  }

  if (html.includes('Pflanze nicht gefunden') || html.length < 3000) {
    return { error: 'not_found', url };
  }

  // ── tr/td 테이블 (Das Wichtigste auf einen Blick 섹션) ────────────────────
  const table = {};
  const blickStart = html.indexOf('Das Wichtigste auf einen Blick');
  const blickSlice = blickStart >= 0 ? html.slice(blickStart, blickStart + 12000) : html;

  const trRe = /<tr[^>]*>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<\/tr>/gi;
  let m;
  while ((m = trRe.exec(blickSlice)) !== null) {
    const key = m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().replace(/:$/, '');
    const val = m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (key && val && key.length < 50) table[key] = val;
  }

  // ── 개화기: month-indicator[data-active] 위치 (1~12) ─────────────────────
  const bloomMonths = [];
  const indRe = /<div class="month-indicator"([^>]*)>/gi;
  let idx = 0;
  while ((m = indRe.exec(html)) !== null) {
    idx++;
    if (idx > 12) break;
    if (m[1].includes('data-active="true"')) bloomMonths.push(idx);
  }

  // ── 텍스트 섹션 ──────────────────────────────────────────────────────────
  const SEC_NAMES = ['Standort','Schnitt','Vermehrung','Verwendung',
                     'Schädlinge','Ökologie','Interessantes','Wissenswertes'];
  const sections = {};
  for (const name of SEC_NAMES) {
    const re = new RegExp(
      `<h[23][^>]*>\\s*${name}\\s*<\\/h[23]>([\\s\\S]*?)(?=<h[23]|<footer|$)`, 'i'
    );
    const match = html.match(re);
    if (match) {
      sections[name] = match[1]
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 2000);
    }
  }

  // ── Gemini로 독일어 전체 → 한국어 번역 ─────────────────────────────────
  if (env?.GEMINI_API_KEY) {
    try {
      // 번역할 테이블 키 목록
      const TABLE_KEYS = ['Boden','Nährstoffe','PH-Wert','Kübel/Balkon geeignet',
        'Pflanzenart','Wuchs','Wurzelsystem','Blütenform','Blütenduft',
        'Blattfarbe','Blattphase','Blattform','schneckenresistent','Schnecken',
        'windverträglich','schnittverträglich'];
      const tableEntries = TABLE_KEYS.filter(k => table[k]).map(k => `${k}: ${table[k]}`);

      const secEntries = Object.entries(sections).filter(([,v]) => v)
        .map(([k,v]) => `[${k}]\n${v.slice(0,800)}`);

      if (tableEntries.length || secEntries.length) {
        const prompt = `다음 독일어 원예 정보를 한국어로 번역하세요.
테이블 항목은 "키: 값" 형식 그대로 유지하고, 섹션은 [섹션명] 태그 그대로 유지하세요.

${tableEntries.length ? '[TABLE]\n' + tableEntries.join('\n') : ''}

${secEntries.join('\n\n')}`;

        const translated = await geminiTranslateDE(prompt, env.GEMINI_API_KEY);
        if (translated) {
          // 테이블 값 파싱
          for (const k of TABLE_KEYS) {
            if (!table[k]) continue;
            const re = new RegExp(`^${k.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}:\s*(.+)$`, 'm');
            const m = translated.match(re);
            if (m) table[k] = m[1].trim();
          }
          // 섹션 텍스트 파싱
          for (const key of Object.keys(sections)) {
            const re = new RegExp(`\\[${key}\\]\\n([\\s\\S]*?)(?=\\n\\n\\[|$)`);
            const m = translated.match(re);
            if (m) sections[key] = m[1].trim();
          }
        }
      }
    } catch(e) { /* 번역 실패 시 독일어 원문 유지 */ }
  }

  return { url, table, bloomMonths, sections };
}
