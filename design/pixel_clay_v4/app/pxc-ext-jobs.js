/* PIXEL-CLAY · JOB AVATAR PACK — 120+ additional occupations.
   Parts are shared by construction: every hat comes from one of ~16 builders,
   every uniform detail from one of ~10. Load AFTER pxc-ext-avatars.js. */
(function (root) {
  "use strict";
  var E = root.PXC_EXT;
  if (!E || !E.addJobs) { console.error('[pxc-ext] avatar pack not loaded'); return; }

  var K=E.K, W=E.W, RD=E.RD, BU=E.BU, NV=E.NV, GR=E.GR, GD=E.GD, OR=E.OR,
      PU=E.PU, ST=E.ST, BR=E.BR, TN=E.TN, PK=E.PK, SK=E.SK, TL=E.TL;
  var GY='#4a4a52', DGY='#2f3136', OLV='#4a5a3c', CRM='#e8dcc0', MAR='#6d3f6b',
      CYN='#3f8fbf', LIM='#8ad84d', BLK='#1a1a1f', SND='#d9c9a8', RST='#a24a2e';

  /* ── hat builders ─────────────────────────────────────────────────── */
  var hair  = function(c){ return [['R',4,2,8,2,c]]; };
  var hairL = function(c){ return [['R',4,2,8,2,c],['R',3,3,1,7,c],['R',12,3,1,7,c]]; };
  var capF  = function(a,b){ return [['R',4,2,8,2,K],['R',4,1,8,2,a],['R',3,3,10,1,b||K]]; };
  var capB  = function(a){ return [['R',4,2,8,2,K],['R',4,1,8,2,a],['R',11,3,4,1,a]]; };
  var hard  = function(a){ return [['R',4,2,8,2,K],['R',4,1,8,2,a],['R',5,0,6,1,a],['R',2,3,12,1,a]]; };
  var brim  = function(a){ return [['R',4,2,8,2,K],['R',5,1,6,2,a],['R',1,3,14,1,a]]; };
  var beret = function(a){ return [['R',3,1,10,3,a],['R',12,0,2,1,a]]; };
  var toque = function(a){ return [['R',4,0,8,3,a],['R',3,1,1,2,a],['R',12,1,1,2,a],['R',3,3,10,1,a]]; };
  var band  = function(a,b){ return [['R',4,2,8,2,b||K],['R',3,2,10,2,a],['R',2,3,2,3,a]]; };
  var helm  = function(a,p){ return [['R',3,1,10,3,a]].concat(p?[['R',7,0,2,1,p]]:[]); };
  var hood  = function(a){ return [['R',4,2,8,2,K],['R',2,2,2,9,a],['R',13,2,2,9,a],['R',3,1,10,2,a]]; };
  var headb = function(a,b){ return [['R',4,2,8,2,b||K],['R',3,3,10,1,a]]; };
  var hset  = function(a){ return [['R',4,1,8,1,a],['R',3,2,1,4,a],['R',12,2,1,4,a]]; };
  var wig   = function(a){ return [['R',3,1,10,3,a],['R',2,4,2,5,a],['R',12,4,2,5,a]]; };
  var bun   = function(c){ return [['R',4,2,8,2,c],['R',6,0,4,2,c]]; };
  var scarfH= function(a){ return [['R',3,1,10,4,a],['R',2,2,1,6,a],['R',13,2,1,6,a]]; };
  var visor = function(a){ return [['R',4,2,8,2,K],['R',3,3,10,1,a],['R',2,4,12,1,GY]]; };

  /* ── body / uniform builders ──────────────────────────────────────── */
  var none  = [];
  var collar= function(a){ return [['R',6,11,4,1,a||W]]; };
  var tie   = function(a){ return [['R',6,11,4,1,W],['R',7,11,2,4,a]]; };
  var apron = function(a){ return [['R',4,12,8,3,a]]; };
  var vest  = function(a){ return [['R',4,11,2,4,a],['R',10,11,2,4,a]]; };
  var badge = function(a){ return [['R',5,11,2,2,a]]; };
  var steth = [['R',5,11,1,3,K],['R',10,11,1,3,K],['R',6,13,4,1,K],['R',7,14,2,1,ST]];
  var belt  = function(a){ return [['R',3,13,10,1,a]]; };
  var stripe= function(a){ return [['R',3,12,10,1,a],['R',3,14,10,1,a]]; };
  var pocket= function(a){ return [['R',4,12,3,3,a]]; };
  var scarfB= function(a){ return [['R',5,10,6,2,a],['R',10,12,2,3,a]]; };
  var beard = function(a){ return [['R',4,8,8,2,a],['R',5,10,6,1,a]]; };

  function jb(id, ko, en, group, cloth, hat, extra) {
    return { id:id, ko:ko, en:en, group:group, cloth:cloth, hat:hat||[], extra:extra||[] };
  }

  E.addJobs([
    /* ══ 의료·건강 ══ */
    jb('surgeon','외과의','Surgeon','medical',TL, capF(TL,TL).concat([['R',4,7,8,4,TL],['R',3,7,1,2,TL],['R',12,7,1,2,TL]]), collar(TL)),
    jb('pharmacist','약사','Pharmacist','medical',W, hair(K), [['R',6,11,4,1,GR],['R',4,12,3,3,W],['R',5,13,1,1,GR]]),
    jb('vet','수의사','Veterinarian','medical',W, capF(W,W), steth),
    jb('paramedic','구급대원','Paramedic','medical',RD, capF(RD,K), [['R',5,11,6,1,W],['R',7,11,2,3,RD],['R',4,13,8,1,W]]),
    jb('therapist','물리치료사','Therapist','medical',TL, hairL('#5a3820'), collar(W)),
    jb('radiologist','영상의','Radiologist','medical',W, hair(K), [['R',4,11,8,4,GY],['R',6,12,4,2,W]]),
    jb('midwife','조산사','Midwife','medical',PK, bun('#5a3820'), collar(W)),
    jb('optometrist','안경사','Optometrist','medical',W, hair('#2b211b'), [['R',6,11,4,1,BU],['R',4,12,3,2,GY]]),
    jb('psychiatrist','정신과의','Psychiatrist','medical',NV, hair('#5c4a3f'), tie(TL)),
    jb('caregiver','요양보호사','Caregiver','medical','#e278a1', hairL('#8f4f1a'), apron(W)),
    /* ══ IT·개발 ══ */
    jb('dataScientist','데이터 과학자','Data scientist','it',NV, hair('#2b211b'), [['R',4,11,8,1,W],['R',5,12,2,2,LIM],['R',8,12,2,3,LIM],['R',11,12,1,2,LIM]]),
    jb('sysadmin','시스템 관리자','Sysadmin','it',DGY, hair(K), [['R',4,11,8,3,GY],['R',5,12,1,1,LIM],['R',7,12,1,1,GD],['R',9,12,1,1,RD]]),
    jb('qaEngineer','QA 엔지니어','QA engineer','it',LIM, hair('#8f4f1a'), collar(W)),
    jb('pm','기획자','Product manager','it',BU, hair('#5a3820'), tie(GD)),
    jb('uxResearcher','UX 리서처','UX researcher','it',MAR, bun('#2b211b'), pocket(W)),
    jb('securityAnalyst','보안 분석가','Security analyst','it',BLK, hood(BLK), [['R',5,11,6,1,LIM]]),
    jb('aiEngineer','AI 엔지니어','AI engineer','it','#2f3b5c', hair(K).concat([['R',7,0,2,2,SK],['R',6,0,1,1,CYN],['R',9,0,1,1,CYN]]), collar(CYN)),
    jb('streamer','스트리머','Streamer','it',PU, hair('#e278a1').concat(hset(PK)).concat([['R',3,6,2,1,PK],['R',5,7,2,1,K]]), [['R',4,11,8,1,PK]]),
    jb('techSupport','기술 지원','Tech support','it',CYN, hair('#5c4a3f').concat(hset(K)).concat([['R',3,6,2,1,K],['R',5,7,2,1,K]]), collar(W)),
    jb('devops','데브옵스','DevOps','it',DGY, capB(OR), [['R',4,11,8,2,GY],['R',6,12,4,1,OR]]),
    /* ══ 교육·연구 ══ */
    jb('librarian','사서','Librarian','education',BR, bun('#a8917d'), [['R',3,11,5,4,GR],['R',3,11,5,1,W]]),
    jb('tutor','과외교사','Tutor','education',TL, hair('#8f4f1a'), [['R',4,12,6,3,W],['R',5,13,4,1,K]]),
    jb('principal','교장','Principal','education',NV, hair('#a8917d'), tie(RD)),
    jb('researcher','연구원','Researcher','education',W, hair(K).concat([['R',4,3,8,2,ST],['R',5,4,2,1,SK],['R',9,4,2,1,SK]]), [['R',4,12,3,3,GR]]),
    jb('archaeologist','고고학자','Archaeologist','education',TN, brim(BR), [['R',3,11,4,4,BR],['R',5,11,1,4,'#4a3a2a']]),
    jb('astronomer','천문학자','Astronomer','education','#2f3b5c', hair('#2b211b'), [['R',4,11,8,1,GD],['R',6,12,1,1,GD],['R',9,13,1,1,GD]]),
    jb('historian','역사학자','Historian','education',BR, hair(ST).concat(beard(ST)), collar(W)),
    jb('translator','번역가','Translator','education',MAR, hairL('#2b211b'), [['R',4,11,4,3,W],['R',9,11,3,3,GD]]),
    jb('coach','코치','Coach','education',RD, capF(RD,K), [['R',5,11,6,1,W],['R',6,12,1,3,GD]]),
    jb('kinderTeacher','유치원 교사','Kindergarten teacher','education',GD, bun('#c97a2e'), [['R',4,12,8,3,PK]]),
    /* ══ 요리·식음료 ══ */
    jb('sushiChef','스시 셰프','Sushi chef','food',W, band(W,K), [['R',5,11,6,1,K],['R',4,12,8,3,W]]),
    jb('bartender','바텐더','Bartender','food',BLK, hair(K), [['R',6,11,4,1,W],['R',7,11,2,2,K],['R',4,13,8,2,'#333']]),
    jb('waiter','서버','Waiter','food',W, hair('#5a3820'), [['R',6,11,4,1,K],['R',7,11,2,2,K],['R',3,12,4,3,BLK]]),
    jb('butcher','정육사','Butcher','food',W, capF(W,W), apron('#c94a4a')),
    jb('sommelier','소믈리에','Sommelier','food',BLK, hair('#2b211b'), [['R',6,11,4,1,W],['R',10,11,2,3,MAR]]),
    jb('foodTruck','푸드트럭','Food truck cook','food',OR, capB(RD), apron(W)),
    jb('patissier','파티시에','Pâtissier','food',W, toque(W), [['R',4,12,8,3,PK]]),
    jb('brewer','브루어','Brewer','food',BR, band(GD,K).concat(beard('#8f4f1a')), apron(TN)),
    jb('dishwasher','주방보조','Kitchen hand','food',TL, band(TL,K), apron(GY)),
    jb('nutritionist','영양사','Nutritionist','food',W, hairL('#5a3820'), [['R',6,11,4,1,GR],['R',4,12,3,3,GR]]),
    /* ══ 건설·제조 ══ */
    jb('architect','건축가','Architect','construction',BLK, hair(K), [['R',3,11,4,4,CRM],['R',3,11,4,1,BU]]),
    jb('electrician','전기기사','Electrician','construction',GD, hard(BU), [['R',4,13,8,1,K],['R',6,11,1,3,GD],['R',9,11,1,3,GD]]),
    jb('plumber','배관공','Plumber','construction',BU, capB(RD), [['R',3,11,2,4,BU],['R',11,11,2,4,BU],['R',3,13,10,1,K]]),
    jb('carpenter','목수','Carpenter','construction',TN, capF(BR,BR), [['R',3,13,10,1,BR],['R',4,11,2,3,'#8f6a4a']]),
    jb('painterHouse','도장공','House painter','construction',W, capB(W), [['R',4,12,2,2,BU],['R',7,12,2,2,GD],['R',10,12,2,2,RD]]),
    jb('mechanic','정비사','Mechanic','construction',NV, capB(NV), [['R',4,11,8,1,W],['R',4,12,3,3,GY]]),
    jb('craneOp','크레인 기사','Crane operator','construction',OR, hard(GD), [['R',4,11,8,1,GD],['R',3,13,10,1,GY]]),
    jb('surveyor','측량기사','Surveyor','construction',LIM, hard(W), [['R',4,11,8,2,LIM],['R',5,12,6,1,K]]),
    jb('factoryWorker','생산직','Factory worker','construction',GY, hard(BU), vest(GD)),
    jb('blacksmith','대장장이','Blacksmith','construction','#5c4a3f', band(RD,K).concat(beard('#2b211b')), apron('#3a2f28')),
    /* ══ 예술·창작 ══ */
    jb('dancer','무용수','Dancer','art',PK, bun('#2b211b'), [['R',5,11,6,1,PK],['R',4,13,8,2,MAR]]),
    jb('actor','배우','Actor','art',MAR, hair('#2b211b'), [['R',6,11,4,1,W],['R',7,11,2,3,GD]]),
    jb('writer','작가','Writer','art',BR, hair('#a8917d'), [['R',4,11,4,4,CRM],['R',10,11,1,4,K]]),
    jb('filmmaker','영화감독','Filmmaker','art',BLK, capB(BLK), [['R',4,11,8,2,GY],['R',5,12,1,1,W],['R',7,12,1,1,W],['R',9,12,1,1,W]]),
    jb('tattooist','타투이스트','Tattoo artist','art',BLK, hair(K), [['R',2,12,1,4,BU],['R',13,12,1,4,BU],['R',5,11,6,1,GY]]),
    jb('sculptor','조각가','Sculptor','art',SND, band(SND,K), apron(TN)),
    jb('animator','애니메이터','Animator','art',CYN, hair('#8f4f1a'), [['R',4,11,8,1,W],['R',5,12,2,2,K],['R',8,12,2,2,K]]),
    jb('dj','디제이','DJ','art',BLK, hair(K).concat(hset(GD)), [['R',4,11,8,2,GD],['R',6,12,4,1,K]]),
    jb('singer','가수','Singer','art',MAR, hairL('#e8c33a'), [['R',7,11,2,4,GY],['R',6,10,4,1,GY]]),
    jb('illustrator','일러스트레이터','Illustrator','art',OR, bun('#4d5a8c'), [['R',4,12,3,3,W],['R',5,12,1,3,RD]]),
    /* ══ 공공·안전 ══ */
    jb('lifeguard','인명구조원','Lifeguard','safety',RD, capF(RD,W), [['R',5,11,6,1,W],['R',4,13,8,1,GD]]),
    jb('securityGuard','경비원','Security guard','safety',DGY, capF(DGY,K), badge(GD).concat([['R',5,13,6,1,K]])),
    jb('rescueWorker','구조대원','Rescue worker','safety',OR, hard(OR), [['R',4,11,8,1,W],['R',3,13,10,1,K]]),
    jb('coastGuard','해양경찰','Coast guard','safety',NV, capF(W,NV), [['R',5,11,6,1,GD],['R',4,13,8,1,W]]),
    jb('sheriff','보안관','Sheriff','safety',BR, brim(BR), [['R',5,11,2,2,GD],['R',6,13,4,1,K]]),
    jb('ranger','국립공원 관리','Park ranger','safety',OLV, brim(OLV), [['R',5,11,6,1,TN],['R',4,13,8,1,BR]]),
    jb('emt','응급구조사','EMT','safety',W, capF(W,RD), [['R',5,11,6,1,RD],['R',7,11,2,3,RD],['R',6,12,4,1,RD]]),
    jb('dispatcher','상황실','Dispatcher','safety',NV, hair('#5c4a3f').concat(hset(K)).concat([['R',3,6,2,1,K],['R',5,7,2,1,K]]), collar(W)),
    jb('inspector','안전점검원','Inspector','safety',LIM, hard(W), [['R',4,11,8,2,LIM],['R',10,12,2,2,W]]),
    jb('customs','세관원','Customs officer','safety','#2f3b5c', capF(NV,K), [['R',5,11,6,1,GD],['R',10,12,2,2,GD]]),
    /* ══ 비즈니스·사무 ══ */
    jb('ceo','대표','CEO','business',DGY, hair('#2b211b'), [['R',6,11,4,1,W],['R',7,11,2,4,MAR],['R',4,11,2,4,DGY]]),
    jb('accountant','회계사','Accountant','business',GY, hair('#5c4a3f'), tie(TL)),
    jb('banker','은행원','Banker','business',NV, hair(K), tie(GD)),
    jb('salesRep','영업','Sales rep','business',BU, hair('#8f4f1a'), tie(RD)),
    jb('marketer','마케터','Marketer','business',OR, hairL('#b53a2a'), [['R',4,11,8,1,W],['R',5,12,6,1,OR]]),
    jb('hr','인사담당','HR','business',TL, bun('#2b211b'), collar(W)),
    jb('consultant','컨설턴트','Consultant','business',BLK, hair('#5a3820'), tie(BU)),
    jb('realtor','공인중개사','Realtor','business',MAR, hair('#a8917d'), [['R',6,11,4,1,W],['R',4,12,3,2,GD]]),
    jb('auditor','감사','Auditor','business',GY, hair(ST), [['R',6,11,4,1,W],['R',10,12,2,3,K]]),
    jb('receptionist','안내원','Receptionist','business',PK, hairL('#2b211b').concat(hset(K)).concat([['R',3,6,2,1,K],['R',5,7,2,1,K]]), collar(W)),
    /* ══ 운송·물류 ══ */
    jb('busDriver','버스기사','Bus driver','transport',BU, capF(BU,K), collar(W)),
    jb('conductor','열차승무원','Train conductor','transport',DGY, capF(DGY,K), [['R',5,11,6,1,GD],['R',6,12,4,1,GD]]),
    jb('flightAttendant','승무원','Flight attendant','transport',NV, bun('#2b211b'), [['R',5,10,6,2,RD],['R',10,12,2,3,RD]]),
    jb('dockWorker','항만노동자','Dock worker','transport',OR, hard(OR), vest(GD)),
    jb('rider','배달 라이더','Delivery rider','transport',LIM, helm(W,RD).concat([['R',4,4,8,1,GY]]), [['R',3,11,5,4,LIM],['R',5,11,1,4,K]]),
    jb('forkliftOp','지게차 기사','Forklift operator','transport',GD, hard(GD), vest(OR)),
    jb('taxiDriver','택시기사','Taxi driver','transport',GD, capF(GD,K), collar(W)),
    jb('captain','선장','Captain','transport',NV, capF(W,NV).concat([['R',7,1,2,1,GD]]), [['R',5,11,6,1,GD],['R',4,13,3,1,GD]]),
    jb('atc','관제사','Air traffic controller','transport',CYN, hair(K).concat(hset(K)).concat([['R',3,6,2,1,K],['R',5,7,2,1,K]]), collar(W)),
    jb('warehouseWorker','물류센터','Warehouse worker','transport',LIM, capB(LIM), [['R',3,11,5,4,TN],['R',5,11,1,4,BR]]),
    /* ══ 농림·어업 ══ */
    jb('rancher','목장주','Rancher','agriculture',BR, brim(TN), [['R',5,11,6,1,W],['R',6,12,4,1,RD]]),
    jb('beekeeper','양봉가','Beekeeper','agriculture',W, brim(W).concat([['R',4,4,8,6,'#e8dcc0'],['R',4,4,8,1,GY],['R',4,9,8,1,GY]]), collar(W)),
    jb('forester','산림원','Forester','agriculture',OLV, brim(OLV).concat(beard('#5a3820')), belt(BR)),
    jb('gardener','정원사','Gardener','agriculture',GR, brim(SND), [['R',4,12,8,3,TN],['R',6,11,4,1,GR]]),
    jb('vintner','와인 농부','Vintner','agriculture',MAR, brim(TN), apron(MAR)),
    jb('shepherd','목동','Shepherd','agriculture',CRM, band(BR,'#8f4f1a'), [['R',12,10,2,6,BR]]),
    jb('hunter','사냥꾼','Hunter','agriculture',OLV, brim(OLV), [['R',3,11,2,5,BR],['R',4,10,1,6,BR]]),
    jb('fishmonger','생선장수','Fishmonger','agriculture',BU, band(BU,K), apron(W)),
    jb('agronomist','농업기술자','Agronomist','agriculture',LIM, hard(W), [['R',4,12,3,3,GR],['R',6,11,4,1,W]]),
    jb('lumberjack','벌목공','Lumberjack','agriculture',RD, band(RD,'#8f4f1a').concat(beard('#8f4f1a')), [['R',4,11,8,1,K],['R',4,13,8,1,K],['R',6,11,1,5,K],['R',9,11,1,5,K]]),
    /* ══ 서비스·미용 ══ */
    jb('hairstylist','헤어 디자이너','Hairstylist','service',BLK, hairL('#e278a1'), [['R',4,12,8,3,BLK],['R',10,11,1,2,ST],['R',11,11,1,2,ST]]),
    jb('nailArtist','네일 아티스트','Nail artist','service',PK, bun('#8f6fb5'), [['R',2,12,1,3,PK],['R',13,12,1,3,PK],['R',5,11,6,1,W]]),
    jb('masseur','마사지사','Masseur','service',W, hair(K), apron(TL)),
    jb('hotelStaff','호텔 직원','Hotel staff','service',MAR, capF(MAR,GD), [['R',6,11,4,1,W],['R',7,11,2,3,GD]]),
    jb('tailor','재단사','Tailor','service',DGY, hair(ST), [['R',5,11,6,1,W],['R',4,12,1,3,RD],['R',11,12,1,3,BU],['R',10,11,2,1,ST]]),
    jb('florist','플로리스트','Florist','service',GR, bun('#c97a2e').concat([['R',11,1,2,2,PK]]), apron(CRM)),
    jb('petGroomer','펫 미용사','Pet groomer','service',CYN, capB(CYN), [['R',4,12,8,3,W],['R',10,11,2,2,ST]]),
    jb('launderer','세탁사','Launderer','service',W, band(BU,K), apron(BU)),
    jb('makeupArtist','메이크업','Make-up artist','service',MAR, hairL('#b53a2a'), [['R',4,12,3,3,BLK],['R',5,12,1,2,PK],['R',10,11,2,2,PK]]),
    jb('shopkeeper','상점 주인','Shopkeeper','service',TN, hair('#5c4a3f'), apron(GR)),
    /* ══ 판타지·기타 ══ */
    jb('elf','엘프','Elf','fantasy',GR, [['R',2,3,2,3,'#f2c9a0'],['R',12,3,2,3,'#f2c9a0'],['R',1,2,2,2,'#f2c9a0'],['R',13,2,2,2,'#f2c9a0']].concat(hairL('#e8c33a')), collar(GR)),
    jb('dwarf','드워프','Dwarf','fantasy',BR, helm(SK).concat(beard('#b53a2a')), belt(GD)),
    jb('bard','음유시인','Bard','fantasy',MAR, [['T',4,0,8,4,'u',MAR],['R',3,3,10,1,MAR],['R',11,0,2,2,RD]], [['R',5,11,6,1,GD],['R',10,12,2,3,BR]]),
    jb('rogue','도적','Rogue','fantasy',DGY, hood(DGY), [['R',4,11,8,1,BR],['R',10,12,1,3,ST]]),
    jb('cleric','성직자','Cleric','fantasy',W, [['R',4,2,8,2,'#8f6a4a'],['R',3,1,10,1,GD]], [['R',7,11,2,3,GD],['R',6,12,4,1,GD]]),
    jb('druid','드루이드','Druid','fantasy',GR, hairL('#7d9463').concat(beard('#a8917d')), [['R',5,11,6,1,BR],['R',12,10,2,6,'#8f6a4a']]),
    jb('necromancer','네크로맨서','Necromancer','fantasy',BLK, [['T',4,0,8,5,'u',MAR],['R',2,4,12,1,MAR],['R',7,2,2,1,LIM]], [['R',4,11,8,1,MAR],['R',7,12,2,2,LIM]]),
    jb('alchemist','연금술사','Alchemist','fantasy',TL, [['R',4,2,8,2,K],['R',4,3,8,2,ST],['F',6,4,1.4,LIM],['F',10,4,1.4,LIM]], [['R',4,12,2,3,LIM],['R',10,12,2,3,PU]]),
    jb('cyborg','사이보그','Cyborg','fantasy',GY, [['R',4,2,8,2,SK],['R',8,3,4,7,GY],['R',9,6,2,1,RD],['R',12,4,2,3,SK]], [['R',4,11,8,1,CYN]]),
    jb('mermaid','인어','Mermaid','fantasy',TL, hairL('#3f8fbf'), [['R',4,11,8,2,TL],['R',3,13,10,2,CYN]]),
    jb('angel','천사','Angel','fantasy',W, hair('#e8c33a').concat([['R',5,0,6,1,GD],['R',4,0,1,1,GD],['R',11,0,1,1,GD]]), [['R',1,10,2,5,W],['R',13,10,2,5,W]]),
    jb('demon','악마','Demon','fantasy',RD, [['R',4,2,8,2,K],['T',2,0,3,4,'u',RD],['T',11,0,3,4,'u',RD]], [['R',4,11,8,1,K],['R',13,12,2,4,RD]]),
    jb('superhero','히어로','Superhero','fantasy',BU, [['R',4,2,8,2,K],['R',4,5,8,3,BU],['R',5,6,2,1,W],['R',9,6,2,1,W]], [['R',7,11,2,3,GD],['R',1,10,2,6,RD],['R',13,10,2,6,RD]]),
    jb('scholar','현자','Sage','fantasy',PU, hairL(W).concat(beard(W)), [['R',5,11,6,1,GD]]),
    jb('gladiator','검투사','Gladiator','fantasy',TN, helm(SK,RD).concat([['R',4,3,8,3,SK],['R',7,4,2,2,K]]), [['R',3,11,4,2,SK],['R',9,11,4,2,SK]]),
    jb('explorer','탐험가','Explorer','fantasy',TN, brim(TN), [['R',3,11,5,4,BR],['R',5,11,1,4,'#4a3a2a']]),
    jb('clown','광대','Clown','fantasy',RD, [['R',4,2,8,2,'#b53a2a'],['R',2,3,2,3,'#b53a2a'],['R',12,3,2,3,'#b53a2a'],['R',6,0,4,2,GD]], [['R',6,11,4,2,W],['R',7,7,2,2,RD]]),
    jb('robotArm','로봇','Robot','fantasy',SK, [['R',3,1,10,3,SK],['R',8,0,1,2,GY],['R',7,3,2,1,GY]], [['R',4,11,8,2,GY],['R',6,12,4,1,CYN]])
  ]);
})(window);
