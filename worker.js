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
      else if (pathname === '/api/hf/translate/batch') data = await hfTranslateBatch(req, env);
      else if (pathname === '/api/gaissmayer/details') data = await gaissmayerDetails(searchParams);
      else if (pathname === '/api/gardenia/test')    data = await gardeniaTest(searchParams);
      else if (pathname === '/api/gardenia/details') data = await gardeniaDetails(searchParams);
      else if (pathname === '/api/kv/get')  data = await kvGet(searchParams, env);
      else if (pathname === '/api/kv/set')  data = await kvSet(req, env);
      else if (pathname === '/api/gemini/image')      data = await geminiImage(req, env);
      else if (pathname === '/api/gemini/test')       data = await geminiTest(env);
      else if (pathname === '/api/gemini/flower-size') data = await geminiFlowerSize(searchParams, env);
      else if (pathname === '/api/naturadb/details') data = await naturadbDetails(searchParams, env);
      else if (pathname === '/api/naturadb/test')    data = await naturadbTest(searchParams);
      else if (pathname === '/api/knagarden/details') data = await knagardenDetails(searchParams);
      else if (pathname === '/api/knagarden/debug')   data = await knagardenDebug(searchParams);
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

// ── MBG Taxonid Map (GitHub JSON 캐시) ───────────────────────────────────────
// https://raw.githubusercontent.com/hubminyoung/plants/main/data/mbg_taxonids.json
const MBG_TAXONID_MAP_URL = 'https://raw.githubusercontent.com/hubminyoung/plants/main/data/mbg_taxonids.json';
let _mbgTaxonMap = null;
let _mbgTaxonMapPromise = null;

async function getMbgTaxonMap() {
  if (_mbgTaxonMap) return _mbgTaxonMap;
  if (_mbgTaxonMapPromise) return _mbgTaxonMapPromise;
  _mbgTaxonMapPromise = fetch(MBG_TAXONID_MAP_URL)
    .then(r => r.json())
    .then(list => {
      const map = new Map();
      const toKey = s => s.toLowerCase().replace(/\s+/g, ' ').trim();
      for (const item of list) {
        const key = toKey(item.name);
        map.set(key, item.taxonid);
        // subsp./var./f. 제거한 단순화 키도 추가 (예: "crocus sieberi subsp. atticus 'firefly'" → "crocus sieberi 'firefly'")
        const simplified = key.replace(/\s+(subsp|var|f|ssp|cv)\.?\s+\S+/i, '');
        if (simplified !== key) map.set(simplified, item.taxonid);
      }
      _mbgTaxonMap = map;
      return map;
    })
    .catch(() => new Map());
  return _mbgTaxonMapPromise;
}

// MBG는 비미국 Cloudflare IP에서 차단됨 → 정적 폴백
const STATIC_MBG = {
  'sporobolus-heterolepis': {
    commonName: 'Prairie Dropseed', plantType: 'Ornamental Grass',
    family: 'Poaceae', nativeRange: 'North America', zone: '3 to 9',
    heightFeet: '2.00 to 3.00 feet', spreadFeet: '2.00 to 3.00 feet',
    bloomTime: 'August to September', bloomColor: 'Green to Bronze',
    sun: 'Full Sun', water: 'Dry to Medium', maintenance: 'Low',
    attracts: 'Birds', tolerate: 'Drought, Clay Soil, Dry Soil',
    suggestedUse: 'Naturalizing, Ground Cover', flower: '', leaf: '',
    culture: '', noteworthy: '', problems: '', uses: '',
  },
  'eragrostis-spectabilis': {
    commonName: 'Purple Lovegrass', plantType: 'Ornamental Grass',
    family: 'Poaceae', nativeRange: 'Eastern North America', zone: '5 to 9',
    heightFeet: '1.50 to 2.00 feet', spreadFeet: '1.50 to 2.00 feet',
    bloomTime: 'August to October', bloomColor: 'Purple',
    sun: 'Full Sun', water: 'Dry to Medium', maintenance: 'Low',
    attracts: 'Birds', tolerate: 'Drought, Dry Soil, Poor Soil',
    suggestedUse: 'Naturalizing', flower: '', leaf: '', culture: '', noteworthy: '', problems: '', uses: '',
  },
  'bouteloua-curtipendula': {
    commonName: 'Side-oats Grama', plantType: 'Ornamental Grass',
    family: 'Poaceae', nativeRange: 'North America', zone: '3 to 9',
    heightFeet: '1.50 to 2.50 feet', spreadFeet: '1.00 to 2.00 feet',
    bloomTime: 'July to September', bloomColor: 'Purple',
    sun: 'Full Sun', water: 'Dry to Medium', maintenance: 'Low',
    attracts: 'Birds, Butterflies', tolerate: 'Drought, Clay Soil',
    suggestedUse: 'Naturalizing', flower: '', leaf: '', culture: '', noteworthy: '', problems: '', uses: '',
  },
  'carex-pensylvanica': {
    commonName: 'Pennsylvania Sedge', plantType: 'Ornamental Grass',
    family: 'Cyperaceae', nativeRange: 'Eastern North America', zone: '3 to 8',
    heightFeet: '0.50 to 1.00 feet', spreadFeet: '1.00 to 2.00 feet',
    bloomTime: 'April to May', bloomColor: 'Green',
    sun: 'Part Shade to Full Shade', water: 'Dry to Medium', maintenance: 'Low',
    attracts: 'Birds, Butterflies', tolerate: 'Drought, Dry Soil, Heavy Shade',
    suggestedUse: 'Ground Cover', flower: '', leaf: '', culture: '', noteworthy: '', problems: '', uses: '',
  },
  'schizachyrium-scoparium': {
    commonName: 'Little Bluestem', plantType: 'Ornamental Grass',
    family: 'Poaceae', nativeRange: 'North America', zone: '3 to 9',
    heightFeet: '2.00 to 4.00 feet', spreadFeet: '1.00 to 2.00 feet',
    bloomTime: 'August to October', bloomColor: 'Bronze to Silver',
    sun: 'Full Sun', water: 'Dry to Medium', maintenance: 'Low',
    attracts: 'Birds, Butterflies', tolerate: 'Drought, Dry Soil, Clay Soil, Poor Soil',
    suggestedUse: 'Naturalizing', flower: '', leaf: '', culture: '', noteworthy: '', problems: '', uses: '',
  },
  'dietes-iridioides': {
    commonName: 'African Iris', plantType: 'Perennial',
    family: 'Iridaceae', nativeRange: 'Southern Africa', zone: '8 to 11',
    heightFeet: '2.00 to 3.00 feet', spreadFeet: '1.00 to 2.00 feet',
    bloomTime: 'April to September', bloomColor: 'White',
    sun: 'Full Sun to Part Shade', water: 'Medium', maintenance: 'Low',
    attracts: '', tolerate: 'Drought',
    suggestedUse: 'Hedge/Screen', flower: '', leaf: '', culture: '', noteworthy: '', problems: '', uses: '',
  },
  'sesleria-autumnalis': {
    commonName: 'Autumn Moor Grass', plantType: 'Ornamental Grass',
    family: 'Poaceae', nativeRange: 'Southeastern Europe', zone: '5 to 9',
    heightFeet: '1.00 to 1.50 feet', spreadFeet: '1.00 to 1.50 feet',
    bloomTime: 'September to October', bloomColor: 'Silver-white',
    sun: 'Full Sun to Part Shade', water: 'Dry to Medium', maintenance: 'Low',
    attracts: '', tolerate: 'Drought, Deer',
    suggestedUse: 'Ground Cover, Border Front', flower: '', leaf: '', culture: '', noteworthy: '', problems: '', uses: '',
  },
  'briza-media': {
    commonName: 'Quaking Grass', plantType: 'Ornamental Grass',
    family: 'Poaceae', nativeRange: 'Europe, Western Asia', zone: '4 to 8',
    heightFeet: '1.00 to 2.00 feet', spreadFeet: '1.00 to 1.50 feet',
    bloomTime: 'May to July', bloomColor: 'Green to Straw',
    sun: 'Full Sun to Part Shade', water: 'Dry to Medium', maintenance: 'Low',
    attracts: 'Birds', tolerate: 'Drought, Dry Soil, Poor Soil',
    suggestedUse: 'Meadow, Cottage Garden', flower: '', leaf: '', culture: '', noteworthy: '', problems: '', uses: '',
  },
  'carex-bromoides': {
    commonName: 'Brome-like Sedge', plantType: 'Ornamental Grass',
    family: 'Cyperaceae', nativeRange: 'Eastern North America', zone: '4 to 8',
    heightFeet: '1.00 to 2.00 feet', spreadFeet: '1.50 to 2.00 feet',
    bloomTime: 'April to May', bloomColor: 'Yellow-green',
    sun: 'Full Sun to Part Shade', water: 'Medium to Wet', maintenance: 'Low',
    attracts: 'Birds', tolerate: '',
    suggestedUse: 'Naturalizing, Woodland', flower: '', leaf: '', culture: '', noteworthy: '', problems: '', uses: '',
  },

  /* ── 구근류 ── */
  'crocus-tommasinianus': {
    commonName: 'Tommy Crocus', plantType: 'Bulb',
    family: 'Iridaceae', nativeRange: 'Southeastern Europe', zone: '3 to 8',
    heightFeet: '0.25 to 0.33 feet', spreadFeet: '0.08 to 0.17 feet',
    bloomTime: 'February to April', bloomColor: 'Lavender to Purple',
    sun: 'Full Sun to Part Shade', water: 'Dry to Medium', maintenance: 'Low',
    attracts: 'Bees, Butterflies', tolerate: 'Drought',
    suggestedUse: 'Naturalizing, Rock Garden', flower: '', leaf: '', culture: '', noteworthy: '', problems: '', uses: '',
  },
  'crocus-sieberi-subsp-atticus': {
    commonName: 'Crocus sieberi', plantType: 'Bulb',
    family: 'Iridaceae', nativeRange: 'Greece', zone: '3 to 8',
    heightFeet: '0.17 to 0.25 feet', spreadFeet: '0.08 to 0.17 feet',
    bloomTime: 'February to March', bloomColor: 'Purple, White',
    sun: 'Full Sun to Part Shade', water: 'Dry to Medium', maintenance: 'Low',
    attracts: 'Bees', tolerate: 'Drought',
    suggestedUse: 'Rock Garden, Naturalizing', flower: '', leaf: '', culture: '', noteworthy: '', problems: '', uses: '',
  },
  'crocus-sieberi': {
    commonName: 'Sieber Crocus', plantType: 'Bulb',
    family: 'Iridaceae', nativeRange: 'Greece, Turkey', zone: '3 to 8',
    heightFeet: '0.17 to 0.25 feet', spreadFeet: '0.08 to 0.17 feet',
    bloomTime: 'February to March', bloomColor: 'Purple, White, Yellow',
    sun: 'Full Sun to Part Shade', water: 'Dry to Medium', maintenance: 'Low',
    attracts: 'Bees', tolerate: 'Drought',
    suggestedUse: 'Rock Garden, Naturalizing', flower: '', leaf: '', culture: '', noteworthy: '', problems: '', uses: '',
  },
  'scilla-sibirica': {
    commonName: 'Siberian Squill', plantType: 'Bulb',
    family: 'Asparagaceae', nativeRange: 'Russia, Central Asia', zone: '2 to 8',
    heightFeet: '0.25 to 0.50 feet', spreadFeet: '0.08 to 0.17 feet',
    bloomTime: 'March to April', bloomColor: 'Blue',
    sun: 'Full Sun to Part Shade', water: 'Medium', maintenance: 'Low',
    attracts: 'Bees', tolerate: 'Drought',
    suggestedUse: 'Naturalizing, Ground Cover', flower: '', leaf: '', culture: '', noteworthy: '', problems: '', uses: '',
  },
  'ornithogalum-umbellatum': {
    commonName: 'Star of Bethlehem', plantType: 'Bulb',
    family: 'Asparagaceae', nativeRange: 'Europe, Western Asia', zone: '4 to 9',
    heightFeet: '0.50 to 1.00 feet', spreadFeet: '0.50 to 1.00 feet',
    bloomTime: 'April to May', bloomColor: 'White',
    sun: 'Full Sun to Part Shade', water: 'Dry to Medium', maintenance: 'Low',
    attracts: 'Bees, Butterflies', tolerate: 'Drought',
    suggestedUse: 'Naturalizing, Border Front', flower: '', leaf: '', culture: '', noteworthy: '', problems: '', uses: '',
  },
  'allium': {
    commonName: 'Ornamental Onion', plantType: 'Bulb',
    family: 'Amaryllidaceae', nativeRange: 'Central Asia, Mediterranean', zone: '4 to 8',
    heightFeet: '2.00 to 3.00 feet', spreadFeet: '0.50 to 1.00 feet',
    bloomTime: 'May to June', bloomColor: 'Purple',
    sun: 'Full Sun', water: 'Dry to Medium', maintenance: 'Low',
    attracts: 'Bees, Butterflies', tolerate: 'Drought, Deer',
    suggestedUse: 'Border, Cutting Garden', flower: '', leaf: '', culture: '', noteworthy: '', problems: '', uses: '',
  },
  'allium-purple-sensation': {
    commonName: "Allium 'Purple Sensation'", plantType: 'Bulb',
    family: 'Amaryllidaceae', nativeRange: 'Central Asia', zone: '5 to 8',
    heightFeet: '2.50 to 3.00 feet', spreadFeet: '0.50 to 0.75 feet',
    bloomTime: 'May to June', bloomColor: 'Purple',
    sun: 'Full Sun', water: 'Dry to Medium', maintenance: 'Low',
    attracts: 'Bees, Butterflies', tolerate: 'Drought, Deer',
    suggestedUse: 'Border, Cutting Garden', flower: '', leaf: '', culture: '', noteworthy: '', problems: '', uses: '',
  },
  'eremurus-stenophyllus': {
    commonName: 'Foxtail Lily', plantType: 'Bulb',
    family: 'Asphodelaceae', nativeRange: 'Central Asia', zone: '5 to 9',
    heightFeet: '3.00 to 5.00 feet', spreadFeet: '1.00 to 2.00 feet',
    bloomTime: 'May to June', bloomColor: 'Yellow to Orange',
    sun: 'Full Sun', water: 'Dry to Medium', maintenance: 'Low',
    attracts: 'Bees, Butterflies, Hummingbirds', tolerate: 'Drought, Heat',
    suggestedUse: 'Back of Border, Cutting Garden', flower: '', leaf: '', culture: '', noteworthy: '', problems: '', uses: '',
  },
  // Eremurus × isabellinus 'Cleopatra' — MBG taxonid 246124
  // × 기호 → slug에서 제거되어 더블대시 발생: eremurus--isabellinus-cleopatra
  'eremurus--isabellinus-cleopatra': {
    commonName: "Foxtail Lily 'Cleopatra'", plantType: 'Bulb',
    family: 'Asphodelaceae', nativeRange: 'Garden Origin (hybrid)', zone: '5 to 8',
    heightFeet: '3.00 to 5.00 feet', spreadFeet: '1.00 to 2.00 feet',
    bloomTime: 'May to June', bloomColor: 'Orange, Copper',
    sun: 'Full Sun', water: 'Dry to Medium', maintenance: 'Low',
    attracts: 'Bees, Butterflies, Hummingbirds', tolerate: 'Drought, Heat',
    suggestedUse: 'Back of Border, Cutting Garden', flower: '', leaf: '', culture: '', noteworthy: '', problems: '', uses: '',
  },
  // base(재배종 제거) 슬러그 대응: Eremurus × isabellinus → eremurus--isabellinus
  'eremurus--isabellinus': {
    commonName: 'Hybrid Foxtail Lily', plantType: 'Bulb',
    family: 'Asphodelaceae', nativeRange: 'Garden Origin (hybrid)', zone: '5 to 8',
    heightFeet: '3.00 to 5.00 feet', spreadFeet: '1.00 to 2.00 feet',
    bloomTime: 'May to June', bloomColor: 'Yellow, Orange, Pink, White',
    sun: 'Full Sun', water: 'Dry to Medium', maintenance: 'Low',
    attracts: 'Bees, Butterflies, Hummingbirds', tolerate: 'Drought, Heat',
    suggestedUse: 'Back of Border, Cutting Garden', flower: '', leaf: '', culture: '', noteworthy: '', problems: '', uses: '',
  },

  /* ── 숙근초 ── */
  'armeria-maritima': {
    commonName: 'Sea Thrift', plantType: 'Perennial',
    family: 'Plumbaginaceae', nativeRange: 'Europe, North America', zone: '4 to 8',
    heightFeet: '0.50 to 1.00 feet', spreadFeet: '0.50 to 0.75 feet',
    bloomTime: 'May to July', bloomColor: 'Pink to Rose',
    sun: 'Full Sun', water: 'Dry to Medium', maintenance: 'Low',
    attracts: 'Butterflies, Bees', tolerate: 'Drought, Salt',
    suggestedUse: 'Rock Garden, Border Front, Ground Cover', flower: '', leaf: '', culture: '', noteworthy: '', problems: '', uses: '',
  },
  'iberis-sempervirens': {
    commonName: 'Edging Candytuft', plantType: 'Perennial',
    family: 'Brassicaceae', nativeRange: 'Southern Europe', zone: '3 to 9',
    heightFeet: '0.50 to 1.00 feet', spreadFeet: '1.00 to 1.50 feet',
    bloomTime: 'April to May', bloomColor: 'White',
    sun: 'Full Sun to Part Shade', water: 'Dry to Medium', maintenance: 'Low',
    attracts: 'Bees, Butterflies', tolerate: 'Drought, Deer',
    suggestedUse: 'Rock Garden, Ground Cover, Border Front', flower: '', leaf: '', culture: '', noteworthy: '', problems: '', uses: '',
  },
  'monarda-bradburiana': {
    commonName: 'Eastern Bee Balm', plantType: 'Perennial',
    family: 'Lamiaceae', nativeRange: 'Central United States', zone: '4 to 8',
    heightFeet: '1.50 to 2.50 feet', spreadFeet: '1.00 to 2.00 feet',
    bloomTime: 'June to July', bloomColor: 'Lavender to Pink, White',
    sun: 'Full Sun to Part Shade', water: 'Dry to Medium', maintenance: 'Low',
    attracts: 'Bees, Butterflies, Hummingbirds', tolerate: 'Drought, Deer',
    suggestedUse: 'Naturalizing, Prairie Garden', flower: '', leaf: '', culture: '', noteworthy: '', problems: '', uses: '',
  },
  'monarda-bradburyana': {
    commonName: 'Eastern Bee Balm', plantType: 'Perennial',
    family: 'Lamiaceae', nativeRange: 'Central United States', zone: '4 to 8',
    heightFeet: '1.50 to 2.50 feet', spreadFeet: '1.00 to 2.00 feet',
    bloomTime: 'June to July', bloomColor: 'Lavender to Pink, White',
    sun: 'Full Sun to Part Shade', water: 'Dry to Medium', maintenance: 'Low',
    attracts: 'Bees, Butterflies, Hummingbirds', tolerate: 'Drought, Deer',
    suggestedUse: 'Naturalizing, Prairie Garden', flower: '', leaf: '', culture: '', noteworthy: '', problems: '', uses: '',
  },
  'sisyrinchium-angustifolium': {
    commonName: 'Blue-eyed Grass', plantType: 'Perennial',
    family: 'Iridaceae', nativeRange: 'Eastern North America', zone: '4 to 9',
    heightFeet: '0.50 to 1.00 feet', spreadFeet: '0.50 to 0.75 feet',
    bloomTime: 'May to July', bloomColor: 'Blue, Violet',
    sun: 'Full Sun to Part Shade', water: 'Medium', maintenance: 'Low',
    attracts: 'Bees', tolerate: '',
    suggestedUse: 'Border Front, Naturalizing', flower: '', leaf: '', culture: '', noteworthy: '', problems: '', uses: '',
  },
  'oenothera-fruticosa': {
    commonName: 'Sundrops', plantType: 'Perennial',
    family: 'Onagraceae', nativeRange: 'Eastern North America', zone: '4 to 8',
    heightFeet: '1.00 to 2.00 feet', spreadFeet: '0.75 to 1.25 feet',
    bloomTime: 'June to August', bloomColor: 'Yellow',
    sun: 'Full Sun', water: 'Dry to Medium', maintenance: 'Low',
    attracts: 'Bees, Butterflies, Hummingbirds', tolerate: 'Drought, Poor Soil',
    suggestedUse: 'Border, Naturalizing', flower: '', leaf: '', culture: '', noteworthy: '', problems: '', uses: '',
  },
  'coreopsis-lanceolata': {
    commonName: 'Lanceleaf Coreopsis', plantType: 'Perennial',
    family: 'Asteraceae', nativeRange: 'Central and Eastern United States', zone: '3 to 9',
    heightFeet: '1.00 to 2.00 feet', spreadFeet: '1.00 to 1.50 feet',
    bloomTime: 'May to October', bloomColor: 'Yellow',
    sun: 'Full Sun', water: 'Dry to Medium', maintenance: 'Low',
    attracts: 'Bees, Butterflies, Birds', tolerate: 'Drought, Poor Soil',
    suggestedUse: 'Border, Cutting Garden, Naturalizing', flower: '', leaf: '', culture: '', noteworthy: '', problems: '', uses: '',
  },
  'nepeta-sibirica': {
    commonName: 'Siberian Catmint', plantType: 'Perennial',
    family: 'Lamiaceae', nativeRange: 'Siberia, Central Asia', zone: '3 to 8',
    heightFeet: '2.00 to 3.00 feet', spreadFeet: '1.50 to 2.50 feet',
    bloomTime: 'June to August', bloomColor: 'Blue, Lavender',
    sun: 'Full Sun to Part Shade', water: 'Dry to Medium', maintenance: 'Low',
    attracts: 'Bees, Butterflies', tolerate: 'Drought, Deer',
    suggestedUse: 'Border, Naturalizing', flower: '', leaf: '', culture: '', noteworthy: '', problems: '', uses: '',
  },
  'petrorhagia-saxifraga': {
    commonName: 'Tunic Flower', plantType: 'Perennial',
    family: 'Caryophyllaceae', nativeRange: 'Southern Europe', zone: '5 to 9',
    heightFeet: '0.50 to 1.00 feet', spreadFeet: '0.75 to 1.50 feet',
    bloomTime: 'June to September', bloomColor: 'Pink, White',
    sun: 'Full Sun', water: 'Dry', maintenance: 'Low',
    attracts: 'Bees, Butterflies', tolerate: 'Drought, Poor Soil',
    suggestedUse: 'Rock Garden, Green Roof, Wall', flower: '', leaf: '', culture: '', noteworthy: '', problems: '', uses: '',
  },
  'ratibida-columnifera': {
    commonName: 'Prairie Coneflower', plantType: 'Perennial',
    family: 'Asteraceae', nativeRange: 'Central North America', zone: '3 to 9',
    heightFeet: '2.00 to 3.00 feet', spreadFeet: '1.00 to 2.00 feet',
    bloomTime: 'June to September', bloomColor: 'Yellow, Red',
    sun: 'Full Sun', water: 'Dry to Medium', maintenance: 'Low',
    attracts: 'Bees, Butterflies, Birds', tolerate: 'Drought, Heat, Poor Soil',
    suggestedUse: 'Prairie, Naturalizing, Border', flower: '', leaf: '', culture: '', noteworthy: '', problems: '', uses: '',
  },
  'achillea': {
    commonName: 'Yarrow', plantType: 'Perennial',
    family: 'Asteraceae', nativeRange: 'Europe, Western Asia', zone: '3 to 9',
    heightFeet: '2.00 to 3.00 feet', spreadFeet: '1.50 to 2.00 feet',
    bloomTime: 'June to August', bloomColor: 'Yellow, Gold',
    sun: 'Full Sun', water: 'Dry to Medium', maintenance: 'Low',
    attracts: 'Bees, Butterflies', tolerate: 'Drought, Poor Soil, Deer',
    suggestedUse: 'Border, Cutting Garden, Naturalizing', flower: '', leaf: '', culture: '', noteworthy: '', problems: '', uses: '',
  },
  'calamintha': {
    commonName: 'Calamint', plantType: 'Perennial',
    family: 'Lamiaceae', nativeRange: 'Europe', zone: '5 to 9',
    heightFeet: '1.00 to 1.50 feet', spreadFeet: '1.00 to 1.50 feet',
    bloomTime: 'July to October', bloomColor: 'White, Lavender',
    sun: 'Full Sun to Part Shade', water: 'Dry to Medium', maintenance: 'Low',
    attracts: 'Bees, Butterflies', tolerate: 'Drought, Deer',
    suggestedUse: 'Border Front, Naturalizing', flower: '', leaf: '', culture: '', noteworthy: '', problems: '', uses: '',
  },
  // Calamintha nepeta 'Montrose White' — MBG taxonid 293629
  'calamintha-nepeta': {
    commonName: 'Lesser Calamint', plantType: 'Perennial',
    family: 'Lamiaceae', nativeRange: 'Europe, North Africa', zone: '5 to 9',
    heightFeet: '1.00 to 1.50 feet', spreadFeet: '1.00 to 1.50 feet',
    bloomTime: 'July to October', bloomColor: 'White',
    sun: 'Full Sun to Part Shade', water: 'Dry to Medium', maintenance: 'Low',
    attracts: 'Bees, Butterflies', tolerate: 'Drought, Deer',
    suggestedUse: 'Border Front, Ground Cover, Herb Garden', flower: '', leaf: '', culture: '', noteworthy: '', problems: '', uses: '',
  },
  'calamintha-white-cloud': {
    commonName: "Calamint 'White Cloud'", plantType: 'Perennial',
    family: 'Lamiaceae', nativeRange: 'Europe, North Africa', zone: '5 to 9',
    heightFeet: '1.00 to 1.50 feet', spreadFeet: '1.00 to 1.50 feet',
    bloomTime: 'July to October', bloomColor: 'White',
    sun: 'Full Sun to Part Shade', water: 'Dry to Medium', maintenance: 'Low',
    attracts: 'Bees, Butterflies', tolerate: 'Drought, Deer',
    suggestedUse: 'Border Front, Ground Cover, Herb Garden', flower: '', leaf: '', culture: '', noteworthy: '', problems: '', uses: '',
  },
  'calamintha-nepeta-montrose-white': {
    commonName: "Lesser Calamint 'Montrose White'", plantType: 'Perennial',
    family: 'Lamiaceae', nativeRange: 'Europe, North Africa', zone: '5 to 9',
    heightFeet: '1.00 to 1.50 feet', spreadFeet: '1.00 to 1.50 feet',
    bloomTime: 'July to October', bloomColor: 'White',
    sun: 'Full Sun to Part Shade', water: 'Dry to Medium', maintenance: 'Low',
    attracts: 'Bees, Butterflies', tolerate: 'Drought, Deer',
    suggestedUse: 'Border Front, Ground Cover, Herb Garden', flower: '', leaf: '', culture: '', noteworthy: '', problems: '', uses: '',
  },
  'perovskia': {
    commonName: 'Russian Sage', plantType: 'Perennial',
    family: 'Lamiaceae', nativeRange: 'Central Asia', zone: '5 to 9',
    heightFeet: '3.00 to 5.00 feet', spreadFeet: '2.00 to 4.00 feet',
    bloomTime: 'July to September', bloomColor: 'Blue, Lavender',
    sun: 'Full Sun', water: 'Dry to Medium', maintenance: 'Low',
    attracts: 'Bees, Butterflies, Hummingbirds', tolerate: 'Drought, Heat, Poor Soil, Deer',
    suggestedUse: 'Border, Naturalizing', flower: '', leaf: '', culture: '', noteworthy: '', problems: '', uses: '',
  },
  'knautia-macedonica': {
    commonName: 'Macedonian Scabiosa', plantType: 'Perennial',
    family: 'Caprifoliaceae', nativeRange: 'Balkans', zone: '5 to 9',
    heightFeet: '2.00 to 3.00 feet', spreadFeet: '1.50 to 2.00 feet',
    bloomTime: 'July to September', bloomColor: 'Crimson, Red',
    sun: 'Full Sun to Part Shade', water: 'Dry to Medium', maintenance: 'Low',
    attracts: 'Bees, Butterflies', tolerate: 'Drought, Deer',
    suggestedUse: 'Border, Cutting Garden, Cottage Garden', flower: '', leaf: '', culture: '', noteworthy: '', problems: '', uses: '',
  },
  'rudbeckia-fulgida-var-fulgida': {
    commonName: 'Black-eyed Susan', plantType: 'Perennial',
    family: 'Asteraceae', nativeRange: 'Eastern North America', zone: '3 to 9',
    heightFeet: '2.00 to 3.00 feet', spreadFeet: '1.50 to 2.00 feet',
    bloomTime: 'July to September', bloomColor: 'Yellow, Orange',
    sun: 'Full Sun to Part Shade', water: 'Medium', maintenance: 'Low',
    attracts: 'Bees, Butterflies, Birds', tolerate: 'Drought, Clay Soil',
    suggestedUse: 'Border, Naturalizing, Cutting Garden', flower: '', leaf: '', culture: '', noteworthy: '', problems: '', uses: '',
  },
  'agastache': {
    commonName: 'Hyssop', plantType: 'Perennial',
    family: 'Lamiaceae', nativeRange: 'North America, Asia', zone: '5 to 9',
    heightFeet: '3.00 to 4.00 feet', spreadFeet: '1.00 to 2.00 feet',
    bloomTime: 'August to September', bloomColor: 'Blue, Lavender',
    sun: 'Full Sun', water: 'Dry to Medium', maintenance: 'Low',
    attracts: 'Bees, Butterflies, Hummingbirds', tolerate: 'Drought, Deer',
    suggestedUse: 'Border, Cutting Garden, Pollinator Garden', flower: '', leaf: '', culture: '', noteworthy: '', problems: '', uses: '',
  },
  'symphyotrichum-oblongifolium': {
    commonName: 'Aromatic Aster', plantType: 'Perennial',
    family: 'Asteraceae', nativeRange: 'Central United States', zone: '3 to 9',
    heightFeet: '1.50 to 2.50 feet', spreadFeet: '2.00 to 3.00 feet',
    bloomTime: 'September to October', bloomColor: 'Lavender, Purple',
    sun: 'Full Sun', water: 'Dry to Medium', maintenance: 'Low',
    attracts: 'Bees, Butterflies, Birds', tolerate: 'Drought, Heat, Poor Soil',
    suggestedUse: 'Border, Naturalizing, Prairie', flower: '', leaf: '', culture: '', noteworthy: '', problems: '', uses: '',
  },

  /* ── 슬러그 별칭 (학명 표기 변형 대응) ── */
  'crocus-tommasinianus-var-roseus': {
    commonName: 'Rosy Tommy Crocus', plantType: 'Bulb',
    family: 'Iridaceae', nativeRange: 'Southeastern Europe', zone: '3 to 8',
    heightFeet: '0.25 to 0.33 feet', spreadFeet: '0.08 to 0.17 feet',
    bloomTime: 'February to March', bloomColor: 'Rose, Pink',
    sun: 'Full Sun to Part Shade', water: 'Dry to Medium', maintenance: 'Low',
    attracts: 'Bees, Butterflies', tolerate: 'Drought',
    suggestedUse: 'Naturalizing, Rock Garden', flower: '', leaf: '', culture: '', noteworthy: '', problems: '', uses: '',
  },
  'crocus-sieberi': {
    commonName: 'Sieber\'s Crocus', plantType: 'Bulb',
    family: 'Iridaceae', nativeRange: 'Greece', zone: '3 to 8',
    heightFeet: '0.17 to 0.25 feet', spreadFeet: '0.08 to 0.17 feet',
    bloomTime: 'February to March', bloomColor: 'Purple, White',
    sun: 'Full Sun to Part Shade', water: 'Dry to Medium', maintenance: 'Low',
    attracts: 'Bees', tolerate: 'Drought',
    suggestedUse: 'Rock Garden, Naturalizing', flower: '', leaf: '', culture: '', noteworthy: '', problems: '', uses: '',
  },
  'scilla-siberica': {
    commonName: 'Siberian Squill', plantType: 'Bulb',
    family: 'Asparagaceae', nativeRange: 'Russia, Central Asia', zone: '2 to 8',
    heightFeet: '0.25 to 0.50 feet', spreadFeet: '0.08 to 0.17 feet',
    bloomTime: 'March to April', bloomColor: 'Blue',
    sun: 'Full Sun to Part Shade', water: 'Medium', maintenance: 'Low',
    attracts: 'Bees', tolerate: 'Drought',
    suggestedUse: 'Naturalizing, Ground Cover', flower: '', leaf: '', culture: '', noteworthy: '', problems: '', uses: '',
  },
  'monarda-bradburyana': {
    commonName: 'Eastern Bee Balm', plantType: 'Perennial',
    family: 'Lamiaceae', nativeRange: 'Central United States', zone: '4 to 8',
    heightFeet: '1.50 to 2.50 feet', spreadFeet: '1.00 to 2.00 feet',
    bloomTime: 'June to July', bloomColor: 'Lavender to Pink, White',
    sun: 'Full Sun to Part Shade', water: 'Dry to Medium', maintenance: 'Low',
    attracts: 'Bees, Butterflies, Hummingbirds', tolerate: 'Drought, Deer',
    suggestedUse: 'Naturalizing, Prairie Garden', flower: '', leaf: '', culture: '', noteworthy: '', problems: '', uses: '',
  },
  'perovskia-atriplicifolia': {
    commonName: 'Russian Sage', plantType: 'Perennial',
    family: 'Lamiaceae', nativeRange: 'Central Asia', zone: '5 to 9',
    heightFeet: '3.00 to 5.00 feet', spreadFeet: '2.00 to 4.00 feet',
    bloomTime: 'July to September', bloomColor: 'Blue, Lavender',
    sun: 'Full Sun', water: 'Dry to Medium', maintenance: 'Low',
    attracts: 'Bees, Butterflies, Hummingbirds', tolerate: 'Drought, Heat, Poor Soil, Deer',
    suggestedUse: 'Border, Naturalizing', flower: '', leaf: '', culture: '', noteworthy: '', problems: '', uses: '',
  },
};

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

  // STATIC_MBG 폴백: MBG가 Cloudflare IP에서 차단될 경우 정적 데이터 사용
  const toSlug = s => s.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  // 1) 재배종명 제거
  const base = q.replace(/\s*['''''][^''''']+[''''']\s*/g, '').trim();
  // 2) var./subsp./f./cv. 이하 제거 → 종소명까지만
  const baseNoVar = base.replace(/\s+(var|subsp|f|ssp|cv)\.?\s+\S+.*$/i, '').trim();
  // 3) 속명+종소명 2단어만 (예: Crocus sieberi)
  const baseSpecies = base.split(/\s+/).slice(0, 2).join(' ');

  // GitHub JSON taxonid 조회 (MBG 라이브 차단 우회) — STATIC_MBG보다 먼저 체크
  let githubTaxonId = null;
  let githubMatchedName = null;
  try {
    const taxonMap = await getMbgTaxonMap();
    const toKey = s => s.toLowerCase().replace(/\s+/g, ' ').trim();
    for (const candidate of [q, base, baseNoVar, baseSpecies]) {
      const tid = taxonMap.get(toKey(candidate));
      if (tid) { githubTaxonId = tid; githubMatchedName = candidate; break; }
    }
  } catch(_) {}

  for (const candidate of [q, base, baseNoVar, baseSpecies]) {
    const slug = toSlug(candidate);
    if (STATIC_MBG[slug]) {
      // STATIC_MBG 히트: 실제 taxonid가 GitHub JSON에 있으면 그걸 사용 (MBG 링크 직접 연결)
      if (githubTaxonId) return { taxonid: githubTaxonId, matchedName: githubMatchedName, fromStatic: true, staticSlug: slug };
      return { taxonid: `static:${slug}`, matchedName: q, fromStatic: true };
    }
  }

  if (githubTaxonId) return { taxonid: githubTaxonId, matchedName: githubMatchedName, fromGithub: true };

  // 라이브 MBG 검색 (차단되거나 타임아웃 시 exception → try/catch로 무시)
  try {
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
      const cultivarPart = q.match(/([''][^'']+[''])/)?.[1];
      if (cultivarPart) {
        result = await mbgFetchSearch(`${synGenus} ${cultivarPart}`);
        if (result.taxonid) return { ...result, fallback: 'synonym_cultivar' };
      }
      result = await mbgFetchSearch(synGenus);
      if (result.taxonid) return { ...result, fallback: 'synonym' };
    }
  } catch(_) {
    // MBG 네트워크 오류 무시 — STATIC_MBG로 처리됨
  }

  return { taxonid: null };
}

async function mbgFetchSearch(q) {
  const url = `https://plantfinder.mobot.org/PlantFinderListResults.aspx?basic=${encodeURIComponent(q)}`;
  const html = await (await fetch(url, { headers: MBG_UA })).text();

  const m = html.match(/taxonid=(\d+)/i);
  if (!m) return { taxonid: null };

  const nm = html.match(/taxonid=\d+[^"]*"[^>]*>(?:<[^>]+>)*([^<]+)/i);
  const matchedName = nm ? nm[1].replace(/&amp;/g,'&').trim() : '';
  return { taxonid: m[1], matchedName };
}

async function mbgDetails(params) {
  const taxonid = (params.get('taxonid') ?? '').trim();
  const staticSlug = (params.get('staticSlug') ?? '').trim();
  if (!taxonid) throw new Error('taxonid required');

  // STATIC_MBG: taxonid가 'static:slug' 형식이면 정적 데이터 반환
  if (taxonid.startsWith('static:')) {
    const slug = taxonid.slice(7);
    const s = STATIC_MBG[slug];
    if (s) return { ...s, fromStatic: true };
    throw new Error(`STATIC_MBG에 '${slug}' 항목 없음`);
  }

  let html;
  try {
    const url = `https://plantfinder.mobot.org/PlantFinderDetails.aspx?taxonid=${taxonid}&isprofile=0`;
    const resp = await fetch(url, { headers: MBG_UA });
    html = await resp.text();
  } catch(_) { html = ''; }

  // MBG 라이브가 차단된 경우(또는 'Common Name:' 없는 응답) → staticSlug 폴백
  if (html.indexOf('Common Name:') < 0) {
    if (staticSlug && STATIC_MBG[staticSlug]) return { ...STATIC_MBG[staticSlug], fromStatic: true };
    return {};
  }

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
async function myMemoryTranslate(text, langpair = 'en|ko') {
  if (!text) return null;
  try {
    const encoded = encodeURIComponent(text.slice(0, 500));
    const resp = await fetch(`https://api.mymemory.translated.net/get?q=${encoded}&langpair=${langpair}`);
    if (!resp.ok) return null;
    const data = await resp.json();
    const result = data.responseData?.translatedText;
    // MyMemory는 번역 실패시 원문 반환하므로 원문과 같으면 null
    return (result && result !== text) ? result : null;
  } catch { return null; }
}

async function hfTranslate(req, env) {
  const { text } = await req.json();
  if (!text) return { translation: '' };
  const translation = await myMemoryTranslate(text, 'en|ko');
  return { translation: translation || '' };
}

// ── Gemini Key Test ───────────────────────────────────────────────────────────

// ── 배치 번역 (여러 텍스트를 Gemini 1번 호출로) ─────────────────────────────────
async function hfTranslateBatch(req, env) {
  const { texts } = await req.json();
  if (!texts?.length) return { translations: [] };
  const translations = await Promise.all(
    texts.map(async t => (await myMemoryTranslate(String(t), 'en|ko')) || t)
  );
  return { translations };
}
async function geminiTest(env) {
  const key = env.GEMINI_API_KEY || '';
  if (!key) return { ok: false, error: 'GEMINI_API_KEY secret not set', keyPrefix: '' };

  const body = JSON.stringify({ contents: [{ parts: [{ text: 'Say hi' }] }] });
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent';

  // AQ. 형식 키 → Bearer 토큰, AIza 형식 → x-goog-api-key 헤더
  const isOAuth = key.startsWith('ya29.');
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
  const isOAuth = key.startsWith('ya29.');
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
// 완전한 Chrome 브라우저 헤더 (봇 감지 우회 — Ajax Search 플러그인 CSS 주입 방지)
const GDN_UA = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
};

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
  let html = await resp.text();

  // CSS 주입 사전 제거 (WordPress Ajax Search 플러그인이 데이터 필드에 CSS 삽입)
  html = html.replace(/<style[\s\S]*?<\/style>/gi, '');
  html = html.replace(/<script[\s\S]*?<\/script>/gi, '');
  html = html.replace(/div\[id[^\]]*ajaxsearch[\s\S]*?(?=<)/gi, '');

  function ent(s) {
    return s.replace(/&amp;/g,'&').replace(/&nbsp;/g,' ').replace(/&#\d+;/g,'').trim();
  }
  function clean(v) {
    // CSS 주입 필터 (ajaxsearch, 중괄호, font-size 등)
    if (!v) return null;
    if (v.includes('ajaxsearch') || v.includes('{') || v.includes('font-size') || v.length > 200) return null;
    return v;
  }
  function field(label) {
    const re = new RegExp(label + '[^<]*</[^>]+>\\s*<[^>]+>([^<]+)', 'i');
    const m = html.match(re);
    return m ? clean(ent(m[1])) : null;
  }
  function fieldAlt(label) {
    const re = new RegExp(label + '[\\s\\S]{0,60}?<[^>]+>([^<]{2,80})', 'i');
    const m = html.match(re);
    return m ? clean(ent(m[1])) : null;
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

  const base = q.replace(/\s*[''''][^'''']+['''']\s*/g, '').trim();
  const slug = base.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

  function extractField(html, label) {
    // Gaissmayer 신 도메인: <strong>LABEL[...btn...]</strong><p>VALUE</p>
    const re0 = new RegExp('<strong>\\s*' + label + '[\\s\\S]*?<\\/strong>\\s*<p>([^<]+)<\\/p>', 'i');
    const m0 = html.match(re0);
    if (m0) return m0[1].trim();
    // 구 도메인 테이블 형식
    const re1 = new RegExp('<th[^>]*>\\s*' + label + '\\s*</th>\\s*<td[^>]*>([^<]+)', 'i');
    const m1 = html.match(re1);
    if (m1) return m1[1].trim();
    const re2 = new RegExp(label + '[^<]{0,40}<[^>]+>([^<]{1,100})', 'i');
    const m2 = html.match(re2);
    return m2 ? m2[1].trim() : null;
  }

  function parsePflanzabstand(raw) {
    if (!raw) return null;
    const cm  = raw.match(/([\d,\.]+)\s*cm/i)?.[1]?.replace(',','.');
    const stm = raw.match(/([\d,\.]+)\s*St\./i)?.[1]?.replace(',','.');
    if (cm || stm) return [cm ? cm+'cm' : null, stm ? stm+'개/m²' : null].filter(Boolean).join(' · ');
    return raw.slice(0,50);
  }

  // ── 1차: 구 도메인 직접 URL (staudengaertnerei-gaissmayer.de)
  try {
    const oldUrls = [
      `https://www.staudengaertnerei-gaissmayer.de/stauden-shop/${slug}/`,
      `https://www.staudengaertnerei-gaissmayer.de/stauden-shop/staudensuche/?suche=${encodeURIComponent(base)}`,
    ];
    for (const url of oldUrls) {
      const resp = await fetch(url, { headers: GSM_UA });
      if (!resp.ok) continue;
      let html = await resp.text();
      if (url.includes('staudensuche')) {
        const m = html.match(/href="(https?:\/\/www\.staudengaertnerei-gaissmayer\.de\/stauden-shop\/(?!staudensuche)[^"]{4,}\/)"/)
               || html.match(/class="woocommerce-LoopProduct-link[^"]*"\s+href="([^"]+)"/);
        if (!m) continue;
        const dr = await fetch(m[1].startsWith('http') ? m[1] : 'https://www.staudengaertnerei-gaissmayer.de' + m[1], { headers: GSM_UA });
        html = await dr.text();
      }
      if (!html.includes('Geselligkeit')) continue;
      return {
        geselligkeit:  extractField(html, 'Geselligkeit') || null,
        pflanzAbstand: parsePflanzabstand(extractField(html, 'Pflanzabstand')),
      };
    }
  } catch(e) {}

  // ── 2차: 신 도메인 검색 (gaissmayer.de)
  try {
    const searchUrl = `https://www.gaissmayer.de/web/shop/suche/produkte/?suche=${encodeURIComponent(base)}`;
    const sr = await fetch(searchUrl, { headers: GSM_UA });
    if (!sr.ok) return { geselligkeit: null, pflanzAbstand: null, debug: 'new_search_failed' };
    const searchHtml = await sr.text();

    // 첫 번째 결과 링크 추출 (상대 URL, href와 title 사이에 다른 속성 있을 수 있음)
    const linkM = searchHtml.match(/href="(\/web\/shop\/[^"]+\/\d+\/)"[^>]*title="Detailansicht"/);
    if (!linkM || !linkM[1]) {
      // 검색결과에서 높이/개화 데이터만 추출 (fallback)
      const heightM = searchHtml.match(/(\d+)\s*cm[–-]\s*(\d+)\s*cm/);
      return {
        geselligkeit: null, pflanzAbstand: null,
        heightCm: heightM ? `${heightM[1]} - ${heightM[2]} cm` : null,
        debug: 'new_search_no_link'
      };
    }

    const detailUrl = 'https://www.gaissmayer.de' + linkM[1];
    const dr = await fetch(detailUrl, { headers: GSM_UA });
    if (!dr.ok) return { geselligkeit: null, pflanzAbstand: null, debug: 'new_detail_failed' };
    const detailHtml = await dr.text();

    const geselligkeit  = extractField(detailHtml, 'Geselligkeit') || null;
    const pflanzAbstand = parsePflanzabstand(extractField(detailHtml, 'Pflanzabstand'));

    return { geselligkeit, pflanzAbstand, debug: detailHtml.includes('Geselligkeit') ? 'ok' : 'no_field' };
  } catch(e) {
    return { geselligkeit: null, pflanzAbstand: null, debug: e.message };
  }
}

// ── 정원백과 (knagarden.info) — 한국 자생식물 fallback ───────────────────────────
// q: 한국어 국명 (예: "범꼬리", "진달래")
// 우선순위: NaturaDB → MBG → 정원백과 (이 함수는 마지막 수단)
async function knagardenDetails(params) {
  const korName = (params.get('q') ?? '').trim();
  const directSlug = (params.get('slug') ?? '').trim();
  if (!korName && !directSlug) return { error: 'q required' };

  const KNA_UA = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept-Language': 'ko-KR,ko;q=0.9',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  };

  // corsproxy.io 프록시로 fetch (Cloudflare Worker IP 차단 우회)
  async function knaFetch(url) {
    try {
      const r = await fetch(url, { headers: KNA_UA });
      if (r.ok) return await r.text();
    } catch(e) {}
    try {
      const r = await fetch('https://corsproxy.io/?' + encodeURIComponent(url));
      if (r.ok) return await r.text();
    } catch(e2) {}
    return null;
  }

  const GQL_URL = 'https://www.knagarden.info/.gql';
  let slug = directSlug, minHeight = null, maxHeight = null;

  if (!slug && korName) {
    const safe = korName.replace(/["\\]/g, '');
    const gqlBody = JSON.stringify({
      query: '{ posts(keys:["plants"], keywords:"' + safe + '", limit:1) { id slug minHeight maxHeight } }'
    });
    const gqlHeaders = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Origin': 'https://www.knagarden.info',
      'Referer': 'https://www.knagarden.info/plants',
    };

    // 1차: GQL 직접 → 2차: GQL via corsproxy.io
    for (const gqlUrl of [GQL_URL, 'https://corsproxy.io/?' + encodeURIComponent(GQL_URL)]) {
      if (slug) break;
      try {
        const r = await fetch(gqlUrl, { method: 'POST', headers: gqlHeaders, body: gqlBody });
        if (r.ok) {
          const ct = r.headers.get('content-type') || '';
          if (ct.includes('json')) {
            const d = await r.json();
            const posts = d?.data?.posts;
            if (posts?.length) ({ slug, minHeight, maxHeight } = posts[0]);
          }
        }
      } catch(e) {}
    }

    // 3차: search HTML (corsproxy.io 경유) → JSON posts 배열에서 slug 추출
    if (!slug) {
      const sh = await knaFetch('https://www.knagarden.info/plants?keywords=' + encodeURIComponent(korName));
      if (sh) {
        const postsSection = (sh.match(/"posts":\[([^\]]+)\]/) || [])[1] || '';
        const slugsInPosts = Array.from(postsSection.matchAll(/"slug":"([a-z0-9-]+)"/g), m => m[1]);
        // 모든 다른 slug의 suffix인 base slug 찾기 (정확한 국명의 slug)
        const baseSlug = slugsInPosts.find(s => s && slugsInPosts.every(o => o === s || o.endsWith(s)));
        slug = baseSlug || slugsInPosts[0] || null;
      }
    }

    if (!slug) return { error: 'not_found', korName };
  }

  // HTML 페이지 fetch (corsproxy.io 경유)
  const html = await knaFetch('https://www.knagarden.info/plants/' + slug);
  if (!html) return { error: 'fetch_failed', slug };

  // DT/DD 파싱
  const fields = {};
  const dtddRe = /<dt[^>]*>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/gi;
  let m;
  while ((m = dtddRe.exec(html)) !== null) {
    const key = m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    const val = m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (key && val && key.length < 30 && val.length > 1) fields[key] = val.slice(0, 600);
  }

  let heightStr = fields['높이'] || '';
  if (!heightStr && (minHeight != null || maxHeight != null)) {
    heightStr = [minHeight, maxHeight].filter(v => v != null).join('~') + 'm';
  }
  const hardiness = fields['내한성'] || fields['내한성(온도)'] || '';

  return {
    slug, korName,
    url: 'https://www.knagarden.info/plants/' + slug,
    height: heightStr, hardiness,
    성상: fields['성상'] || '',
    자생환경: fields['자생환경'] || '',
    재배: fields['식재 및 재배'] || '',
    번식: fields['번식정보'] || '',
    잎: fields['잎'] || '',
    꽃: fields['꽃'] || '',
    줄기: fields['줄기'] || '',
    열매: fields['열매'] || '',
    병충해: fields['병충해'] || '',
    이용가치: fields['이용가치'] || '',
    유래: fields['유래'] || '',
  };
}

// ── 정원백과 디버그 ───────────────────────────────────────────────────────────────
async function knagardenDebug(params) {
  const testUrl = 'https://www.knagarden.info/plants?keywords=' + encodeURIComponent('범꼬리');
  const proxyUrl = 'https://corsproxy.io/?' + encodeURIComponent(testUrl);
  const results = {};

  // 1. Direct fetch
  try {
    const r = await fetch(testUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    results.direct = { status: r.status, ok: r.ok };
  } catch(e) { results.direct = { error: e.message }; }

  // 2. corsproxy.io fetch
  try {
    const r = await fetch(proxyUrl);
    const text = r.ok ? await r.text() : '';
    const slugs = [...text.matchAll(/"slug":"([a-z0-9-]+)"/g)].map(m=>m[1]).slice(0,5);
    results.corsproxy = { status: r.status, ok: r.ok, textLen: text.length, slugs };
  } catch(e) { results.corsproxy = { error: e.message }; }

  // 3. GQL direct
  try {
    const r = await fetch('https://www.knagarden.info/.gql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Origin': 'https://www.knagarden.info' },
      body: JSON.stringify({ query: '{ posts(keys:["plants"], keywords:"범꼬리", limit:1) { id slug } }' })
    });
    const text = await r.text();
    results.gql_direct = { status: r.status, ok: r.ok, body: text.slice(0, 200) };
  } catch(e) { results.gql_direct = { error: e.message }; }

  return results;
}

// ── Gemini 꽃 크기 조회 ────────────────────────────────────────────────────────
// GET /api/gemini/flower-size?q=Crocus+tommasinianus
// → { name, diameterCm, r }   (r = 2~13 스케일)

async function geminiFlowerSize(params, env) {
  const name = (params.get('q') ?? '').trim();
  if (!name) return { error: 'q required' };

  if (!env.AI) return { error: 'AI binding not configured' };

  const prompt =
    `You are a botanical expert. What is the typical diameter in centimeters of a ` +
    `single flower or flowerhead of "${name}"?\n` +
    `Rules:\n` +
    `- Individual flower (crocus, narcissus, rudbeckia): size of one bloom\n` +
    `- Globose inflorescence (allium): diameter of the sphere\n` +
    `- Flat corymb (achillea): diameter of one corymb cluster (not the whole plant)\n` +
    `- Spike type (agastache, perovskia, eremurus): diameter of the spike column (~2cm)\n` +
    `- Tiny flowers (scilla, petrorhagia, calamintha): individual flower only\n` +
    `Reply with ONLY a single decimal number in cm. No units, no explanation.`;

  const result = await env.AI.run('@cf/meta/llama-3.1-8b-instruct-fp8', {
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 10,
    temperature: 0.1,
    stream: false
  });

  let raw = '';
  if (result && typeof result.response === 'string') {
    raw = result.response.trim();
  } else if (result?.choices?.[0]?.message?.content) {
    raw = String(result.choices[0].message.content).trim();
  } else {
    return { name, error: 'unexpected_format', debug: JSON.stringify(result).slice(0, 300) };
  }

  const diameterCm = parseFloat(raw);
  if (isNaN(diameterCm)) return { name, error: 'parse_failed', raw };

  // r 스케일: 꽃 지름(cm)을 1~13 반지름으로 매핑
  const r = Math.max(2, Math.min(12, Math.round(0.2 * Math.pow(diameterCm, 1.7))));
  return { name, diameterCm, r };
}

// ── Gemini 독일어→한국어 번역 헬퍼 ──────────────────────────────────────────────
async function geminiTranslateDE(prompt, apiKey) {
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent';
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 2048 }
    })
  });
  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`Gemini HTTP ${resp.status}: ${errText.slice(0, 300)}`);
  }
  const data = await resp.json();
  const result = data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
  if (!result) console.error('[Gemini] empty response:', JSON.stringify(data).slice(0, 200));
  return result;
}

// ── NaturaDB 연결 테스트 (직접/corsproxy/allorigins 3가지 모두 확인) ──────────
async function naturadbTest(params) {
  const q = params.get('q') || 'caltha-palustris';
  const slug = q.toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,'');
  const ndbUrl = `https://www.naturadb.de/pflanzen/${slug}/`;
  const NDB_H = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept-Language': 'de-DE,de;q=0.9',
    'Accept': 'text/html,application/xhtml+xml',
  };
  const results = { url: ndbUrl };

  // 1. 직접 요청
  try {
    const r = await fetch(ndbUrl, { headers: NDB_H });
    const text = await r.text();
    results.direct = { ok: r.ok, status: r.status, hasHöhe: text.includes('Höhe'), len: text.length };
  } catch(e) { results.direct = { error: e.message }; }

  // 2. corsproxy.io
  try {
    const r = await fetch('https://corsproxy.io/?' + encodeURIComponent(ndbUrl));
    const text = await r.text();
    results.corsproxy = { ok: r.ok, status: r.status, hasHöhe: text.includes('Höhe'), len: text.length };
  } catch(e) { results.corsproxy = { error: e.message }; }

  // 3. allorigins.win
  try {
    const r = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(ndbUrl)}`);
    const text = await r.text();
    results.allorigins = { ok: r.ok, status: r.status, hasHöhe: text.includes('Höhe'), len: text.length };
  } catch(e) { results.allorigins = { error: e.message }; }

  return results;
}

// ── NaturaDB 정적 데이터 (geo-block 식물 — 유럽 IP로 직접 수집) ──────────────────
// NaturaDB는 한국/비유럽 IP를 차단. 아래 데이터는 직접 접근해 수집한 실제 데이터.
// 반환 형식: naturadbDetails와 동일 (table/bloomMonths/sections)
const STATIC_NDB = {
  'eragrostis-spectabilis': {
    table: {
      'Höhe': '40 - 60 cm',
      'Breite': '40 - 50 cm',
      'Frostverträglich': 'bis -17 °C (bis Klimazone 7)',
      'frostverträglich': 'bis -17 °C (bis Klimazone 7)',
      'Pflanzenart': '그라스',
      'Wuchs': '개방형 군락',
      'Boden': '배수 양호',
      'Wasser': '신선~건조',
      'Wurzelsystem': '천근성',
      'Blütenfarbe': '보라색',
      'Blütenform': '원추형',
      'Blattphase': '낙엽성',
    },
    bloomMonths: [8, 9, 10],
    sections: {}
  },
  'bouteloua-gracilis': {
    table: {
      'Höhe': '20 - 40 cm',
      'Breite': '30 - 40 cm',
      'Frostverträglich': 'bis -17 °C (bis Klimazone 7)',
      'frostverträglich': 'bis -17 °C (bis Klimazone 7)',
      'Pflanzenart': '그라스',
      'Wuchs': '직립 군락, 단축 포복지',
      'Boden': '배수 양호',
      'Wasser': '신선~건조',
      'Wurzelsystem': '천근성',
      'Blütenfarbe': '갈색',
      'Blütenform': '작은 이삭',
      'Blattphase': '낙엽성',
    },
    bloomMonths: [7, 8, 9],
    sections: {}
  },
  'carex-flacca': {
    table: {
      'Höhe': '30 - 60 cm',
      'Breite': '30 - 40 cm',
      'Frostverträglich': 'bis -28 °C (bis Klimazone 5)',
      'frostverträglich': 'bis -28 °C (bis Klimazone 5)',
      'Pflanzenart': '그라스(사초)',
      'Wuchs': '직립 군락',
      'Boden': '배수 양호~유기질',
      'Wasser': '신선',
      'Wurzelsystem': '천근성',
      'Blütenfarbe': '갈색',
      'Blütenform': '이삭형',
      'Blattfarbe': '청록색',
      'Blattphase': '낙엽성',
    },
    bloomMonths: [4, 5],
    sections: {}
  },
  // NaturaDB에 없는 식물 (표준 식물학 데이터 기반)
  'schizachyrium-scoparium': {
    table: {
      'Höhe': '60 - 120 cm',
      'Breite': '30 - 60 cm',
      'Frostverträglich': 'bis -40 °C (bis Klimazone 3)',
      'frostverträglich': 'bis -40 °C (bis Klimazone 3)',
      'Pflanzenart': '그라스',
      'Wuchs': '직립 군락',
      'Blattphase': '낙엽성',
      'Blütenfarbe': '적갈색',
    },
    bloomMonths: [8, 9, 10],
    sections: {}
  },
  'sporobolus-heterolepis': {
    table: {
      'Höhe': '60 - 90 cm',
      'Breite': '60 - 90 cm',
      'Frostverträglich': 'bis -40 °C (bis Klimazone 3)',
      'frostverträglich': 'bis -40 °C (bis Klimazone 3)',
      'Pflanzenart': '그라스',
      'Wuchs': '직립 군락',
      'Blattphase': '낙엽성',
      'Blütenfarbe': '녹갈색',
    },
    bloomMonths: [8, 9],
    sections: {}
  },
  'panicum-virgatum': {
    table: {
      'Höhe': '90 - 150 cm',
      'Breite': '60 - 90 cm',
      'Frostverträglich': 'bis -29 °C (bis Klimazone 5)',
      'frostverträglich': 'bis -29 °C (bis Klimazone 5)',
      'Pflanzenart': '그라스',
      'Wuchs': '직립 군락',
      'Blattphase': '낙엽성',
    },
    bloomMonths: [7, 8, 9],
    sections: {}
  },
  'dietes-iridioides': {
    table: {
      'Höhe': '60 - 100 cm',
      'Breite': '30 - 60 cm',
      'Frostverträglich': 'bis -7 °C (bis Klimazone 8)',
      'frostverträglich': 'bis -7 °C (bis Klimazone 8)',
      'Pflanzenart': '다년초',
      'Wuchs': '직립 군락',
      'Blütenfarbe': '흰색',
    },
    bloomMonths: [4, 5, 6, 7, 8, 9],
    sections: {}
  },
  'bouteloua-curtipendula': {
    table: {
      'Höhe': '50 - 90 cm',
      'Breite': '30 - 60 cm',
      'Frostverträglich': 'bis -40 °C (bis Klimazone 3)',
      'frostverträglich': 'bis -40 °C (bis Klimazone 3)',
      'Pflanzenart': '그라스',
      'Wuchs': '직립 군락',
      'Boden': '배수 양호',
      'Wasser': '건조~신선',
      'Blattphase': '낙엽성',
      'Blütenfarbe': '보라색',
    },
    bloomMonths: [7, 8, 9],
    sections: {}
  },
  'carex-pensylvanica': {
    table: {
      'Höhe': '20 - 30 cm',
      'Breite': '20 - 30 cm',
      'Frostverträglich': 'bis -17 °C (bis Klimazone 7)',
      'frostverträglich': 'bis -17 °C (bis Klimazone 7)',
      'Pflanzenart': '그라스(사초)',
      'Wuchs': '지피형 군락',
      'Boden': '배수 양호~유기질',
      'Wasser': '신선~건조',
      'Wurzelsystem': '천근성(지하경)',
      'Blütenfarbe': '녹색',
      'Blütenform': '작은 이삭',
      'Blattfarbe': '신록색',
      'Blattphase': '상록성',
    },
    bloomMonths: [5, 6, 7],
    sections: {}
  },
  'sesleria-autumnalis': {
    table: {
      'Höhe': '25 - 50 cm',
      'Breite': '25 - 30 cm',
      'Frostverträglich': 'bis -23 °C (bis Klimazone 6)',
      'frostverträglich': 'bis -23 °C (bis Klimazone 6)',
      'Pflanzenart': '그라스',
      'Wuchs': '군락형 · 넓게 퍼짐',
      'Boden': '배수 양호~부식토',
      'Wasser': '신선~건조',
      'Wurzelsystem': '천근성',
      'Blütenfarbe': '흰색',
      'Blütenform': '이삭형',
      'Blattfarbe': '청록색',
      'Blattphase': '상록성',
    },
    bloomMonths: [9, 10],
    sections: {}
  },
  'briza-media': {
    table: {
      'Höhe': '20 - 40 cm',
      'Breite': '30 - 40 cm',
      'Frostverträglich': 'bis -28 °C (bis Klimazone 5)',
      'frostverträglich': 'bis -28 °C (bis Klimazone 5)',
      'Pflanzenart': '그라스',
      'Wuchs': '직립 · 자파형',
      'Boden': '배수 양호~부식토',
      'Wasser': '신선~건조',
      'Wurzelsystem': '천근성',
      'Blütenfarbe': '녹색',
      'Blütenform': '소형 이삭',
      'Blattfarbe': '녹색',
      'Blattphase': '상록성',
    },
    bloomMonths: [5, 6, 7],
    sections: {}
  },
  'carex-bromoides': {
    table: {
      'Höhe': '25 - 90 cm',
      'Breite': '40 - 60 cm',
      'Frostverträglich': 'bis -28 °C (bis Klimazone 5)',
      'frostverträglich': 'bis -28 °C (bis Klimazone 5)',
      'Pflanzenart': '그라스(사초)',
      'Wuchs': '군락형',
      'Boden': '배수 양호~부식토',
      'Wasser': '신선',
      'Wurzelsystem': '천근성',
      'Blütenfarbe': '노란색',
      'Blütenform': '이삭형',
      'Blattfarbe': '녹색',
      'Blattphase': '상록성',
    },
    bloomMonths: [4, 5],
    sections: {}
  },
};

// ── NaturaDB 식물 정보 ─────────────────────────────────────────────────────────
async function naturadbDetails(params, env) {
  const q = (params.get('q') ?? '').trim();
  if (!q) return { error: 'q required' };

  const base = q.replace(/\s*['''''][^''''']+[''''']\s*/g, '').trim();
  const slug = base.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  const ndbUrl = `https://www.naturadb.de/pflanzen/${slug}/`;
  const url    = ndbUrl;

  const NDB_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'Accept-Language': 'de-DE,de;q=0.9',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Cache-Control': 'no-cache',
  };

  let html = null;
  let fetchSource = 'direct';
  try {
    // 1. 직접 요청
    try {
      const r = await fetch(ndbUrl, { headers: NDB_HEADERS });
      if (r.ok) { html = await r.text(); fetchSource = 'direct'; }
    } catch(e) {}

    // 2. corsproxy.io 우회 (직접 실패 시)
    if (!html) {
      try {
        const r = await fetch('https://corsproxy.io/?' + encodeURIComponent(ndbUrl));
        if (r.ok) { html = await r.text(); fetchSource = 'corsproxy'; }
      } catch(e) {}
    }

    // 3. allorigins.win 우회 (2차 fallback)
    if (!html) {
      try {
        const r = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(ndbUrl)}`);
        if (r.ok) { html = await r.text(); fetchSource = 'allorigins'; }
      } catch(e) {}
    }

    if (!html) {
      // geo-block 등으로 fetch 실패 시 정적 데이터 fallback
      const staticEntry = STATIC_NDB[slug];
      if (staticEntry) {
        // 정적 데이터는 이미 한국어로 저장되어 있어 번역 불필요
        return {
          table: { ...staticEntry.table },
          sections: { ...staticEntry.sections },
          bloomMonths: staticEntry.bloomMonths || [],
          url, fromStatic: true
        };
      }
      return { error: 'all_fetch_failed', url };
    }
    // HTML 엔티티 디코딩 (독일어 움라우트)
    html = html.replace(/&Ouml;/g, 'Ö').replace(/&ouml;/g, 'ö')
               .replace(/&Auml;/g, 'Ä').replace(/&auml;/g, 'ä')
               .replace(/&Uuml;/g, 'Ü').replace(/&uuml;/g, 'ü')
               .replace(/&szlig;/g, 'ß');
  } catch (e) {
    return { error: e.message, url };
  }

  if (html.includes('Pflanze nicht gefunden') || html.length < 3000) {
    return { error: 'not_found', url };
  }

  // CSS/스크립트 주입 제거
  html = html.replace(/<style[\s\S]*?<\/style>/gi, '');
  html = html.replace(/<script[\s\S]*?<\/script>/gi, '');
  // WordPress Ajax Search 플러그인 CSS 인라인 주입 제거 (HTML 전체에서 제거)
  html = html.replace(/div\[id[^\]]*ajaxsearch[\s\S]*?(?=<\/td>|<\/dd>|<\/li>|<\/p>|<tr|$)/gi, '');

  // ── tr/td 테이블 (Das Wichtigste auf einen Blick 섹션) ────────────────────
  const table = {};
  const blickStart = html.indexOf('Das Wichtigste auf einen Blick');
  const blickSlice = blickStart >= 0 ? html.slice(blickStart, blickStart + 12000) : html;

  function parseKV(raw) {
    const key = raw[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().replace(/:$/, '');
    const val = raw[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const isCSS = val.includes('ajaxsearch') || val.includes('{') || val.includes('font-size') || val.length > 300;
    if (key && val && key.length < 50 && !isCSS && !table[key]) table[key] = val;
  }

  // ── tr/td 테이블 파싱
  const trRe = /<tr[^>]*>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<\/tr>/gi;
  let m;
  while ((m = trRe.exec(blickSlice)) !== null) parseKV(m);

  // ── dl/dt/dd 파싱 (NaturaDB가 이 구조를 사용하는 경우)
  const dtRe = /<dt[^>]*>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/gi;
  while ((m = dtRe.exec(blickSlice)) !== null) parseKV(m);

  // ── 텍스트 기반 key:value 파싱 (HTML 구조 독립적 — 어떤 레이아웃도 처리)
  // HTML 태그 제거 후 "Key: Value" 형태의 줄을 파싱
  const rawText = blickSlice.replace(/<[^>]+>/g, '\n');
  for (const line of rawText.split('\n')) {
    const t2 = line.trim();
    const ci = t2.indexOf(':');
    if (ci < 2 || ci > 40) continue;
    const key2 = t2.slice(0, ci).trim();
    const val2 = t2.slice(ci + 1).trim();
    if (!key2 || !val2 || val2.length < 2 || val2.length > 200) continue;
    const isCSS2 = val2.includes('ajaxsearch') || val2.includes('{') || val2.includes('font-size');
    const badKey = /[{};@#|]|http|www|^\d/.test(key2);
    if (!isCSS2 && !badKey && !table[key2]) table[key2] = val2;
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
      `<h[2-4][^>]*>[^<]*${name}[^<]*<\\/h[2-4]>([\\s\\S]*?)(?=<h[2-4]|<footer|$)`, 'i'
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

  // ── MyMemory로 독일어 → 한국어 번역 (병렬) ─────────────────────────────
  const TABLE_KEYS = ['Boden','Nährstoffe','PH-Wert','Kübel/Balkon geeignet',
    'Pflanzenart','Wuchs','Wurzelsystem','Blütenform','Blütenduft',
    'Blattfarbe','Blattphase','Blattform','schneckenresistent','Schnecken',
    'windverträglich','schnittverträglich'];
  await Promise.all([
    ...TABLE_KEYS.filter(k => table[k]).map(async k => {
      const t = await myMemoryTranslate(table[k], 'de|ko');
      if (t) table[k] = t;
    }),
    ...Object.keys(sections).filter(k => !k.startsWith('_') && sections[k]).map(async k => {
      const t = await myMemoryTranslate(sections[k], 'de|ko');
      if (t) sections[k] = t;
    })
  ]);

  return { table, sections, bloomMonths, url, fetchSource };
}
