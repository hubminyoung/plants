import json,re,sys
P='index.html'; s=open(P,encoding='utf-8').read()
i=s.index('const DATA=')+len('const DATA='); D,end=json.JSONDecoder().raw_decode(s[i:])
SYM=json.load(open('calder_sym.json',encoding='utf-8'))
SRC='Calder(2024)'
rows={r['name']:r for r in D['rows']}

# ── 새 속(genus) → 과·한글 속명 ──
NEWFAM={'Magnoliaceae 목련과':'','Styracaceae 때죽나무과':'','Sapindaceae 무환자나무과':'','Cornaceae 층층나무과':'','Ericaceae 진달래과':'',
 'Hamamelidaceae 조록나무과':'','Viburnaceae 산분꽃나무과':'','Theaceae 차나무과':'','Aquifoliaceae 감탕나무과':'','Fagaceae 참나무과':'',
 'Nyssaceae 니사과':'','Cannabaceae 삼과':'','Celastraceae 노박덩굴과':'','Vitaceae 포도과':'','Polypodiaceae 고란초과':''}
GEN={'Lavandula':('Lamiaceae 꿀풀과','라벤더속'),'Lonicera':('Caprifoliaceae 인동과','인동속'),'Parthenocissus':('Vitaceae 포도과','담쟁이덩굴속'),
 'Wisteria':('Fabaceae 콩과','등속'),'Polypodium':('Polypodiaceae 고란초과','미역고사리속'),'Caulophyllum':('Berberidaceae 매자나무과','꿩의다리아재비속'),
 'Jeffersonia':('Berberidaceae 매자나무과','깽깽이풀속'),'Dicentra':('Papaveraceae 양귀비과','디센트라속'),'Phellodendron':('Rutaceae 운향과','황벽나무속'),
 'Magnolia':('Magnoliaceae 목련과','목련속'),'Styrax':('Styracaceae 때죽나무과','때죽나무속'),'Cotinus':('Anacardiaceae 옻나무과','안개나무속'),
 'Gymnocladus':('Fabaceae 콩과','짐노클라두스속'),'Acer':('Sapindaceae 무환자나무과','단풍나무속'),'Cornus':('Cornaceae 층층나무과','층층나무속'),
 'Sorbus':('Rosaceae 장미과','마가목속'),'Rhododendron':('Ericaceae 진달래과','진달래속'),'Hamamelis':('Hamamelidaceae 조록나무과','풍년화속'),
 'Fothergilla':('Hamamelidaceae 조록나무과','포더길라속'),'Viburnum':('Viburnaceae 산분꽃나무과','산분꽃나무속'),'Clerodendrum':('Lamiaceae 꿀풀과','누리장나무속'),
 'Stewartia':('Theaceae 차나무과','노각나무속'),'Ilex':('Aquifoliaceae 감탕나무과','감탕나무속'),'Quercus':('Fagaceae 참나무과','참나무속'),
 'Nyssa':('Nyssaceae 니사과','니사속'),'Celtis':('Cannabaceae 삼과','팽나무속'),'Prunus':('Rosaceae 장미과','벚나무속'),
 'Cercis':('Fabaceae 콩과','박태기나무속'),'Euonymus':('Celastraceae 노박덩굴과','화살나무속')}

def gof(n):
    return re.sub(r'^×\s*','',n).split()[0]

# ── 등록 목록: 이름 → (구역·수량 메모들, 범례기호들[(이미지, 구역, 짝, 메모)]) ──
C='Calder · '
E=[]  # (name, [pj...], [sym...])
def add(name,pj=(),sym=()): E.append((name,list(pj),list(sym)))
SB='Calder · Small borders'; RB='Calder · Robust border'; SG='Calder · Sunken garden'; MX='Calder · Matrix'; WE='Calder · Woodland E'; WW='Calder · Woodland W'
S=lambda img,z,m=(),n='':{'i':'cal_'+img,'z':z,'m':list(m),'n':n,'or':False}

# 범례 1열 — Small borders at the entrance (+ Matrix)
add("Agastache 'Blue Fortune'",[C+'Small borders at the entrance (범례)'],[S('Agastache',SB)])
add("Amsonia tabernaemontana var. salicifolia",[C+'Small borders at the entrance (범례)'],[S('Amsonia_sal',SB)])
add("Asclepias tuberosa 'Gay Butterflies'",[C+'Small borders at the entrance (범례)'],[S('Asclepias_gay',SB)])
add("Echinacea paradoxa",[C+'Small borders at the entrance (범례)'],[S('Echinacea_par',SB)])
add("Echinops bannaticus",[C+'Small borders at the entrance (범례)'],[S('Echinops_ban',SB,["Eryngium × zabelii 'Big Blue'"])])
add("Eryngium × zabelii 'Big Blue'",[C+'Small borders at the entrance (범례)'],[S('Echinops_ban',SB,['Echinops bannaticus'])])
add("Eragrostis spectabilis",[C+'Small borders at the entrance (범례)'],[S('Eragrostis',SB)])
add("Geranium 'Rozanne'",[C+'Small borders at the entrance (범례)'],[S('Geranium_roz',SB)])
add("Helenium 'Moerheim Beauty'",[C+'Small borders at the entrance (범례)'],[S('Helenium_moer',SB)])
add("Hemerocallis 'Gentle Shepherd'",[C+'Small borders at the entrance (범례)'],[S('Hemerocallis',SB)])
add("Liatris pycnostachya",[C+'Small borders at the entrance (범례)'],[S('Liatris',SB)])
add("Molinia caerulea subsp. arundinacea 'Crystal Veil'",[C+'Small borders at the entrance (범례)',C+'Robust border east 27주 (+ Geranium sanguineum \'Album\' 30주)'],[S('Molinia_cv1',SB),S('Molinia_cv2',RB,["Geranium sanguineum 'Album'"])])
add("Monarda bradburiana",[C+'Small borders at the entrance (범례)'],[S('Monarda_brad',SB)])
add("Persicaria amplexicaulis 'Black Field'",[C+'Small borders at the entrance (범례)',C+'목록 38~42 (구역 미상) 12주'],[S('Persicaria',SB)])
add("Stipa gigantea",[C+'Small borders at the entrance (범례)',C+'Vestige garden lower level 9주'],[S('Stipa',SB)])
add("Vernonia 'Summer's Swan Song'",[C+'Small borders at the entrance (범례)',C+'Vestige garden lower level 7주'],[S('Vernonia_sss',SB)])
add("Sesleria nitida",[C+'Matrix (범례)'],[S('Sesleria_nit',MX)])
add("Sporobolus airoides",[C+'Matrix (범례)'],[S('Sporobolus_air',MX)])

# 범례 2·3열 + 목록 — Robust perennial border street entrance east
add("Aconitum carmichaelii Wilsonii Group",[C+'Robust border east 53주',C+'Vestige garden lower level 14주'],[S('Aconitum',RB)])
add("Amsonia 'Blue Ice'",[C+'Robust border east 123주',C+'East shade garden 82주'],[S('Amsonia_bi',RB)])
add("Andropogon gerardii 'Blackhawks'",[C+"Robust border east 5주 (목록 표기 'Black Hawk')"],[S('Andropogon_bh',RB)])
add("Andropogon gerardii 'Red October'",[C+'Robust border east 21주'],[S('Andropogon_ro',RB)])
add("Anemone hupehensis 'Hadspen Abundance'",[C+'Robust border east 26주'],[S('Anemone_ha',RB)])
add("Asclepias incarnata",[C+'Robust border east 13주'],[S('Asclepias_inc',RB)])
add("Aster amellus 'Rosa Erfüllung'",[C+'Robust border east 102주'],[S('Aster_rosa',RB)])
add("Briza media",[C+'Robust border east 58주'],[S('Briza',RB)])
add("Carex montana",[C+'Robust border east 80주',C+'West shade garden 467주'],[S('Carex_mont',RB)])
add("Actaea 'Queen of Sheba'",[C+'Robust border east 52주',C+'Vestige garden lower level 7주'],[S('Cimicifuga',RB)])
add("Echinops ritro 'Veitch's Blue'",[C+'Robust border east 19주',C+'Vestige garden lower level 25주'],[S('Echinops_veitch',RB)])
add("Eupatorium hyssopifolium",[C+'Robust border east 16주',C+'Vestige garden lower level 12주'],[S('Eupatorium_hys',RB)])
add("Eutrochium maculatum 'Gateway' (formerly Eupatorium)",[C+'Robust border east 40주',C+'Vestige garden lower level 15주'],[S('Eutrochium_gw',RB)])
add("Geranium 'Orion'",[C+"Robust border east 51주 (+ 'Dreamland' 51주, 50:50)"],[S('Geranium_orion',RB,["Geranium 'Dreamland'"])])
add("Geranium 'Dreamland'",[C+"Robust border east 51주 (+ 'Orion' 51주, 50:50)"],[S('Geranium_orion',RB,["Geranium 'Orion'"])])
add("Geum 'Tales of Hex'",[C+'Robust border east 123주',C+'West shade · 단독/소그룹 40주 (Aruncus 사이 소그룹)'],[S('Geum_itex',RB,['itex Silverspire (범례 표기, 확인 필요)'])])
add("Helenium 'Loysder Wieck'",[C+'Robust border east 24주'],[S('Helenium_lois',RB)])
add("Molinia 'Brush'",[C+'Robust border east 166주'],[S('Molinia_brush',RB)])
add("Geranium sanguineum 'Album'",[C+'Robust border east 30주 (+ Molinia \'Crystal Veil\' 27주)'],[S('Molinia_cv2',RB,["Molinia caerulea subsp. arundinacea 'Crystal Veil'"])])
add("Monarda 'Neon'",[C+'Robust border east 25주'],[S('Monarda_neon',RB)])
add("Phlomis tuberosa 'Amazone'",[C+'Robust border east 31주'],[S('Phlomis',RB)])
add("Phlox paniculata 'Dixter'",[C+'Robust border east 33주'],[S('Phlox_dix',RB)])
add("Sanguisorba 'Blackthorn'",[C+'Robust border east 12주',C+'Vestige garden lower level 15주'],[S('Sanguisorba',RB)])
add("Scutellaria incana",[C+'Robust border east 25주'],[S('Scutellaria',RB)])
add("Silphium mohrii",[C+'Robust border east 11주'],[S('Silphium',RB)])
add("Thalictrum 'Elin'",[C+'Robust border east 24주'],[S('Thalictrum_elin',RB)])
add("Thalictrum aquilegiifolium",[C+'Vestige garden lower level 7주'],[S('Thalictrum_aq',RB)])
add("Thalictrum aquilegiifolium 'Blue Stocking'",[C+'Robust border east 24주'],[])
add("Vernonia 'Summer Surrender'",[C+'Robust border east 6주'],[S('Vernonia_ssur',RB)])
add("Veronicastrum virginicum 'Diana'",[C+"Robust border east 17주 (+2) (범례·목록 표기 'Diane')"],[S('Veronicastrum',RB)])

# 범례 3열 하단 — Inner circle / sunken garden
add("Adiantum pedatum",[C+'Inner circle/sunken garden (범례)',C+'West shade garden 324주'],[S('Adiantum',SG)])
add("Asarum canadense",[C+'Inner circle/sunken garden (범례)'],[S('Asarum',SG)])
add("Deschampsia cespitosa 'Goldtau'",[C+'Inner circle/sunken garden (범례)',C+"Vestige garden lower level 9주 (+ Euphorbia 'Orange Beauty' 11주)"],[S('Deschampsia',SG)])
add("Euphorbia 'Orange Beauty'",[C+'Inner circle/sunken garden (범례)',C+"Vestige garden lower level 11주 (+ Deschampsia 'Goldtau' 9주)",C+'West shade · 단독/소그룹 30주'],[S('Euphorbia_ob',SG)])
add("Hakonechloa macra",[C+'Inner circle/sunken garden (범례)',C+'West shade garden 164주'],[S('Hakonechloa',SG)])
add("Helleborus 'Dr. Pink'",[C+'Inner circle/sunken garden (범례, 표기 확인 필요)'],[S('Helleborus_dp',SG)])
add("Hosta 'Blue Angel'",[C+'Inner circle/sunken garden (범례 — 기호 2가지로 두 번 나옴)'],[S('Hosta_ba1',SG),S('Hosta_ba2',SG,[],'범례에 두 번째로 나온 기호')])
add("Polystichum 'Herrenhausen'",[C+'Inner circle/sunken garden (범례)'],[S('Polystichum_h',SG)])
add("Tricyrtis formosana",[C+'Inner circle/sunken garden (범례)'],[S('Tricyrtis',SG)])

# 목록 38~42 (구역 미상)
add("Lavandula angustifolia 'Hidcote'",[C+'목록 38~42 (구역 미상) 88주'])
add("Salvia × sylvestris 'Rhapsody in Blue'",[C+'목록 38~42 (구역 미상) 142주'])
add("Schizachyrium scoparium 'Ha Ha Tonka'",[C+'목록 38~42 (구역 미상) 22주'])
add("Sporobolus heterolepis",[C+"목록 38~42 (구역 미상) 96주 (+ Echinacea 'Vintage Wine' 36주)"])
add("Echinacea purpurea 'Vintage Wine'",[C+'목록 38~42 (구역 미상) 36주 (+ Sporobolus heterolepis 96주)'])
# VG Upper Garden Matrix (113.5㎡)
add("Sesleria 'Greenlee Hybrid'",[C+'VG upper garden matrix 218주 (+ Geranium renardii 158주)',C+'East shade garden 417주'])
add("Geranium renardii",[C+"VG upper garden matrix 158주 (+ Sesleria 'Greenlee Hybrid' 218주)",C+'East shade garden 92주 (+ G. wlassovianum 30%)'])
add("Allium 'Summer Beauty'",[C+'VG upper garden matrix 108주 (+ Limonium latifolium 31주)'])
add("Limonium latifolium",[C+"VG upper garden matrix 31주 (+ Allium 'Summer Beauty' 108주)"])
add("Sedum spectabile 'Stardust'",[C+'VG upper garden matrix 146주'])
add("Baptisia 'Midnight Prairie Blues'",[C+'VG upper garden matrix 4주'])
add("Schizachyrium scoparium 'Smoke Signal'",[C+'VG upper garden matrix 25주'])
add("Papaver orientale 'Perry's White'",[C+'VG upper garden matrix 60주 (매트릭스에 랜덤)'])
# 덩굴 — Vestige garden
for n in ["Clematis 'Bill MacKenzie'","Clematis × jouiniana 'Praecox'","Clematis viticella","Parthenocissus henryana","Wisteria frutescens 'Amethyst Falls'"]:
    add(n,[C+'Vestige garden 상부 덩굴·하수형'])
add("Lonicera periclymenum 'Serotina'",[C+"Vestige garden 상부 덩굴·하수형 (또는 'Major Wheeler')"])
add("Lonicera sempervirens 'Major Wheeler'",[C+"Vestige garden 상부 덩굴·하수형 (또는 'Serotina')"])
# Vestige garden lower level
add("Eurybia × herveyi 'Aster Twilight'",[C+"Vestige garden lower level 19주 (목록 표기 Aster 'Twilight')"])
add("Glycyrrhiza yunnanensis",[C+'Vestige garden lower level 2주'])
add("Molinia caerulea subsp. arundinacea 'Dark Beauty'",[C+'Vestige garden lower level 9주'])
add("Rudbeckia subtomentosa 'Little Henry'",[C+'Vestige garden lower level 12주'])
add("Veronicastrum virginicum 'Challenger'",[C+'Vestige garden lower level 18주'])
# West shade garden (365㎡)
add("Aruncus aethusifolius",[C+'West shade garden 238주'])
add("Aster pyrenaeus 'Lutetia'",[C+'West shade garden 312주'])
add("Astilbe 'Delft Lace'",[C+'West shade garden 500주'])
add("Brunnera macrophylla",[C+'West shade garden 170주 (+ Geranium wlassovianum 86주)'])
add("Geranium wlassovianum",[C+'West shade garden 86주 (+ Brunnera macrophylla 170주)',C+'East shade garden (G. renardii + 30%)'])
add("Epimedium grandiflorum 'Pink Champagne'",[C+'West shade garden 343주',C+'East shade garden 274주 (또는 다른 흰꽃)'])
add("Geranium macrorrhizum 'Spessart'",[C+"West shade garden 224주 (+ Astrantia 'Roma' 121주)"])
add("Astrantia major 'Roma'",[C+"West shade garden 121주 (+ G. macrorrhizum 'Spessart' 224주)"])
add("Geranium nodosum 'Clos du Coudray'",[C+'West shade garden 297주'])
add("Heuchera villosa",[C+"West shade garden 370주 (+ 10% H. 'Caramel' 56주)",C+"East shade garden 308주 (+ H. 'Brownies' 10%)"])
add("Heuchera 'Caramel'",[C+'West shade garden 56주 (H. villosa의 10%)'])
add("Molinia caerulea subsp. caerulea 'Poul Petersen'",[C+'West shade garden 260주 (+ Veronica gentianoides 154주)'])
add("Veronica gentianoides",[C+"West shade garden 154주 (+ Molinia 'Poul Petersen' 260주)"])
add("Pachysandra procumbens",[C+'West shade garden 114주'])
add("Polygonatum biflorum",[C+'West shade garden 245주'])
add("Polypodium vulgare",[C+'West shade garden 414주'])
add("Scutellaria serrata",[C+'West shade garden 189주'])
add("Maianthemum racemosum",[C+'West shade garden 18주 (목록 표기 Smilacina racemosa)',C+'West shade · 단독/소그룹 36주'])
add("Tricyrtis 'Shinonome'",[C+"West shade garden 155주 (+ Tiarella 'Spring Symphony' 157주)"])
add("Tiarella 'Spring Symphony'",[C+"West shade garden 157주 (+ Tricyrtis 'Shinonome' 155주)"])
add("Aquilegia canadensis",[C+'West shade · 단독/소그룹 300주 (랜덤)',C+'Woodland East 랜덤 (식재도 메모)'])
add("Caulophyllum thalictroides",[C+'West shade · 단독/소그룹 61주'])
add("Digitalis ferruginea",[C+'West shade · 단독/소그룹 70주'])
add("Gillenia trifoliata",[C+'West shade · 단독/소그룹 24주',C+'East shade · 단독/소그룹 12주'])
add("Kirengeshoma palmata",[C+'West shade · 단독/소그룹 67주'])
add("Polystichum munitum",[C+'West shade · 단독/소그룹 60주 (목록 표기 Polystichum minutum)'])
add("Solidago 'Lemore'",[C+'West shade · 단독/소그룹 41주'])
add("Jeffersonia diphylla",[C+'West shade · 단독/소그룹 400주 (랜덤)'])
# East shade garden (345㎡)
add("Astilbe 'Henny Graafland'",[C+"East shade garden 230주 (+ 10% 'Visions in Pink')"])
add("Astilbe 'Visions in Pink'",[C+"East shade garden ('Henny Graafland' 230주 중 10%)"])
add("Carex albicans",[C+'East shade garden 115주 (+ Carex eburnea 150주, 25:75)'])
add("Carex eburnea",[C+'East shade garden 150주 (+ Carex albicans 115주, 25:75)'])
add("Heuchera 'Brownies'",[C+'East shade garden 50주 (H. villosa의 10%)'])
add("Phlox divaricata",[C+'East shade garden 274주'])
add("Polypodium virginianum",[C+"East shade garden 203주 (+ Athyrium 'Metallicum' 20% 63주)"])
add("Athyrium niponicum var. pictum 'Metallicum'",[C+'East shade garden 63주 (Polypodium virginianum의 20%)'])
add("Thalictrum kyusianum",[C+'East shade garden 302주 (또는 비슷한 지피)'])
add("Tiarella wherryi",[C+"East shade garden 213주 (+ Campanula 'Caroline' 20% 68주)"])
add("Campanula glomerata 'Caroline'",[C+'East shade garden 68주 (Tiarella wherryi의 20%)'])
add("Actaea pachypoda",[C+'East shade · 단독/소그룹 32주'])
add("Symphyotrichum oblongifolium 'Raydon's Favorite'",[C+"East shade · 단독/소그룹 10주 (목록 표기 Aster 'Raydon's Favorite')"])
add("Digitalis ambigua",[C+'East shade · 단독/소그룹 44주'])
add("Euphorbia 'Miner's Merlot'",[C+'East shade · 단독/소그룹 29주'])
add("Gentiana 'True Blue'",[C+'East shade · 단독/소그룹 41주'])
add("Helleborus argutifolius",[C+'East shade · 단독/소그룹 24주'])
add("Lathyrus vernus",[C+"East shade · 단독/소그룹 26주 (목록 표기 'Blue')"])
add("Paeonia emodi",[C+'East shade · 단독/소그룹 27주'])
add("Dicentra cucullaria",[C+'Woodland East 랜덤 (식재도 메모)'])
# 나무·관목 — Woodland East
TE=[("Magnolia macrophylla",'T_magnolia_macrophylla'),("Styrax obassia",'T_styrax_obassia'),("Cotinus obovatus",'T_cotinus'),("Gymnocladus dioica",'T_gymnocladus'),
 ("Acer vitifolium",'T_acer_vitifolium'),("Acer japonicum",'T_acer_japonicum'),("Cornus kousa 'China Girl'",'T_cornus_china'),("Maackia amurensis",'T_maackia'),
 ("Sorbus alnifolia",'T_sorbus'),("Rhododendron (azalea)",'T_azalea'),("Acer triflorum",'T_acer_triflorum'),("Viburnum prunifolium",'T_vib_prunifolium'),
 ("Clerodendrum trichotomum",'T_clerodendrum'),("Viburnum dilatatum 'Michael Dodge'",'T_vib_dodge')]
for n,img in TE: add(n,[C+'Woodland East'],[S(img,WE)])
add("Hamamelis × intermedia 'Arnold Promise'",[C+'Woodland East (식재도)'],[S('T_hamamelis',WE,[],'범례 표기 hamamelis')])
add("Hamamelis × intermedia 'Orange Beauty'",[C+'Woodland East (식재도)'],[S('T_hamamelis',WE,[],'범례 표기 hamamelis')])
add("Magnolia × soulangeana",[C+'Woodland East (식재도)'])
add("Stewartia pseudocamellia",[C+'Woodland East (식재도)'])
add("Ilex verticillata",[C+'Woodland West',C+'Woodland East (식재도 메모 extra)'])
# 나무·관목 — Woodland West
add("Quercus bicolor",[C+'Woodland West'],[S('T_quercus_bicolor',WW)])
add("Nyssa sylvatica",[C+'Woodland West'],[S('T_nyssa',WW)])
add("Celtis occidentalis",[C+'Woodland West'],[S('T_celtis',WW)])
for n in ["Magnolia acuminata","Prunus × yedoensis","Prunus 'Accolade'","Cornus florida","Cercis canadensis","Cercis siliquastrum","Fothergilla major","Hamamelis virginiana","Euonymus americanus","Styrax japonicus"]:
    add(n,[C+'Woodland West'])
add("Phellodendron amurense",[C+'교목 목록 (식재도에서 위치 못 찾음)'])

# ── 적용 ──
fam=D['FAM']
for g,(f,ko) in GEN.items():
    if f not in fam: fam[f]=''
    if g not in fam[f].split(): fam[f]=(fam[f]+' '+g).strip()
    D['GKO'].setdefault(g,ko)
G2F={g:f for f,gs in fam.items() for g in gs.split()}
new=[];upd=0
for name,pj,sym in E:
    r=rows.get(name)
    if not r:
        g=gof(name)
        assert g in G2F,('속 과 없음',name,g)
        r={"g":g,"name":name,"com":"","ko":"","light":"","soil":"","zone":"","h":"","pm2":"","bloom":"","leaf":0,"st":[],"role":"","tags":[],"note":"","kn":"","src":[],"k":[],"only":1}
        D['rows'].append(r); rows[name]=r; new.append(name)
    else: upd+=1
    if SRC not in r['src']: r['src'].append(SRC)
    r['pj']=r.get('pj',[])+[x for x in pj if x not in r.get('pj',[])]
    for x in sym:
        assert x['i'] in SYM,('기호 없음',x['i'])
        r.setdefault('sym',[]).append(x)
D['symimg'].update(SYM)
print('기존',upd,'신규',len(new)); print(new)

# ── 화면: Calder 출처 표시, 구역·수량 메모, 검색 ──
t=s[i+end:]
def R(a,b):
    global t
    assert t.count(a)==1,(a[:60],t.count(a)); t=t.replace(a,b)
R('${o.src.map(x=>x==="vandalorum(2024)"?`<span class="proj">${x}</span>`:x).join(", ")}</td>`;',
  '${o.src.map(x=>/^(vandalorum|Calder)\\(/.test(x)?`<span class="proj">${x}</span>`:x).join(", ")}${(o.pj||[]).map(x=>`<span class="pj">${esc(x)}</span>`).join("")}</td>`;')
R('o.kn,o.dn||"",o.role,','o.kn,o.dn||"",(o.pj||[]).join(" "),o.role,')
R('Vandalorum(2024) · ${ALL}건','Vandalorum(2024) · Calder(2024) · ${ALL}건')
R('<span class="proj">vandalorum(2024)</span>프로젝트 식재 범례</span>','<span class="proj">vandalorum(2024)</span><span class="proj">Calder(2024)</span>프로젝트 식재 범례·수량</span>')
head=s[:i]
assert head.count('.proj{')==1
head=head.replace('.proj{','.pj{display:block;font-size:.72rem;color:#8a4b16;white-space:normal;margin-top:2px}\n.proj{',1)
s=head+json.dumps(D,ensure_ascii=False,separators=(',',':'))+t
open(P,'w',encoding='utf-8').write(s); print('저장',len(s))
