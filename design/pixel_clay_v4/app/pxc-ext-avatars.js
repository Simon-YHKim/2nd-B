/* PIXEL-CLAY · PIXEL AVATAR EXPANSION PACK
   16x16, seed-deterministic, integer coordinates only.
   Adds: 24 hair styles, 20 accessories, 14 face details, 10 expressions,
         26 animal species, 44 job outfits. Parts are shared by construction.
   Load AFTER _ds_bundle.js. */
(function (root) {
  "use strict";
  var DS = root.PIXELCLAYDesignSystem_ca692b;
  if (!DS || !DS.ICON_OPS) { console.error('[pxc-ext] design system bundle not loaded'); return; }
  var OPS = DS.ICON_OPS;

  /* ── palettes ─────────────────────────────────────────────────────── */
  var SKIN  = ['#f7dcc0','#f2c9a0','#e0aa78','#d99e7a','#c98e5e','#a86f43','#7d4f2e','#5a3820','#8f6a4a','#eab98f'];
  var HAIRC = ['#2b211b','#5a3820','#8f4f1a','#c97a2e','#e8c33a','#b53a2a','#4d5a8c','#7d9463','#a8917d','#d97757','#5c4a3f','#f0dced','#3f8fbf','#8f6fb5','#e278a1','#f2e9d8'];
  var CLOTH = ['#d97757','#4d7a8c','#7d9463','#e0a63c','#bf4a44','#8f6fb5','#3f8fbf','#c9a877','#5c8a3c','#e278a1','#2f5fc0','#6b4a2f','#2f3b5c','#a8917d','#4a4a52','#f2e9d8','#6d3f6b','#2e7d6e'];
  var FUR   = ['#e8a860','#c97a2e','#8f4f1a','#5c4a3f','#a8917d','#f2e9d8','#2b211b','#b0b9cc','#d9c9a8','#7d9463','#cbb8d6','#e0a63c'];

  var K = '#2b211b', W = '#f2e9d8', RD = '#bf4a44', BU = '#4d7a8c', NV = '#2f3b5c',
      GR = '#5c8a3c', GD = '#e0a63c', OR = '#d97757', PU = '#8f6fb5', ST = '#a8917d',
      BR = '#6b4a2f', TN = '#c9a877', PK = '#e0709b', SK = '#b0b9cc', TL = '#2e7d6e';

  /* ── rng ──────────────────────────────────────────────────────────── */
  function hash32(s){ var h=2166136261>>>0; for(var i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=Math.imul(h,16777619)>>>0; } return h>>>0; }
  function rngOf(seed){ var a=hash32(String(seed))||1; return function(){ a^=a<<13; a>>>=0; a^=a>>17; a^=a<<5; a>>>=0; return a/4294967296; }; }
  function idx(r,n){ return Math.floor(r()*n)%n; }

  /* ══════ HAIR — 24 styles ════════════════════════════════════════════ */
  var HAIR = [
    { id:'short',    ko:'숏컷',      en:'Short',      f:function(c){ return [['R',4,2,8,2,c]]; } },
    { id:'long',     ko:'롱',        en:'Long',       f:function(c){ return [['R',4,2,8,2,c],['R',3,3,1,7,c],['R',12,3,1,7,c]]; } },
    { id:'bob',      ko:'단발',      en:'Bob',        f:function(c){ return [['R',4,2,8,3,c],['R',3,3,1,5,c],['R',12,3,1,5,c]]; } },
    { id:'bun',      ko:'번',        en:'Bun',        f:function(c){ return [['R',4,2,8,2,c],['R',6,0,4,2,c]]; } },
    { id:'spike',    ko:'스파이크',   en:'Spiky',      f:function(c){ return [['R',4,2,8,2,c],['R',4,1,1,1,c],['R',6,1,1,1,c],['R',8,1,1,1,c],['R',10,1,1,1,c]]; } },
    { id:'buzz',     ko:'버즈컷',    en:'Buzz',       f:function(c){ return [['R',4,2,8,1,c]]; } },
    { id:'wavy',     ko:'웨이브',    en:'Wavy',       f:function(c){ return [['R',4,2,8,2,c],['R',3,4,1,2,c],['R',12,4,1,2,c],['R',4,1,2,1,c],['R',8,1,2,1,c]]; } },
    { id:'curly',    ko:'곱슬',      en:'Curly',      f:function(c){ return [['F',5,2.5,1.8,c],['F',8,2,2,c],['F',11,2.5,1.8,c],['R',4,3,8,1,c]]; } },
    { id:'ponytail', ko:'포니테일',   en:'Ponytail',   f:function(c){ return [['R',4,2,8,2,c],['R',12,4,2,6,c],['R',13,9,1,2,c]]; } },
    { id:'twintail', ko:'트윈테일',   en:'Twin tails', f:function(c){ return [['R',4,2,8,2,c],['R',2,4,2,5,c],['R',12,4,2,5,c]]; } },
    { id:'mohawk',   ko:'모히칸',    en:'Mohawk',     f:function(c){ return [['R',7,0,2,4,c],['R',6,1,4,2,c]]; } },
    { id:'afro',     ko:'아프로',    en:'Afro',       f:function(c){ return [['F',8,2.5,4.6,c],['R',3,2,10,2,c]]; } },
    { id:'sidepart', ko:'사이드파트', en:'Side part',  f:function(c){ return [['R',4,2,8,2,c],['R',4,4,3,1,c],['R',11,3,1,3,c]]; } },
    { id:'fringe',   ko:'뱅',        en:'Fringe',     f:function(c){ return [['R',4,2,8,3,c],['R',5,5,2,1,c],['R',9,5,2,1,c]]; } },
    { id:'braid',    ko:'땋은머리',   en:'Braid',      f:function(c){ return [['R',4,2,8,2,c],['R',12,4,1,7,c],['R',11,6,1,1,c],['R',13,8,1,1,c]]; } },
    { id:'undercut', ko:'언더컷',    en:'Undercut',   f:function(c){ return [['R',4,1,8,2,c],['R',4,3,2,1,c]]; } },
    { id:'topknot',  ko:'상투',      en:'Top knot',   f:function(c){ return [['R',4,2,8,2,c],['R',7,0,2,1,c],['R',6,1,4,1,c]]; } },
    { id:'dreads',   ko:'드레드',    en:'Dreads',     f:function(c){ return [['R',4,2,8,2,c],['R',3,4,1,7,c],['R',12,4,1,7,c],['R',5,4,1,3,c],['R',10,4,1,3,c]]; } },
    { id:'pixie',    ko:'픽시',      en:'Pixie',      f:function(c){ return [['R',4,2,8,2,c],['R',3,3,1,2,c],['R',12,3,1,2,c],['R',10,1,2,1,c]]; } },
    { id:'hime',     ko:'히메컷',    en:'Hime',       f:function(c){ return [['R',4,2,8,2,c],['R',3,3,1,8,c],['R',12,3,1,8,c],['R',4,4,1,2,c],['R',11,4,1,2,c]]; } },
    { id:'wavelong', ko:'롱웨이브',   en:'Long wave',  f:function(c){ return [['R',4,2,8,2,c],['R',3,3,1,9,c],['R',12,3,1,9,c],['R',2,7,1,3,c],['R',13,7,1,3,c]]; } },
    { id:'halfup',   ko:'하프업',    en:'Half up',    f:function(c){ return [['R',4,2,8,2,c],['R',3,3,1,4,c],['R',12,3,1,4,c],['R',6,0,4,2,c]]; } },
    { id:'messy',    ko:'덥수룩',    en:'Messy',      f:function(c){ return [['R',4,2,8,2,c],['R',3,2,1,2,c],['R',12,2,1,2,c],['R',5,1,1,1,c],['R',9,1,1,1,c],['R',11,1,1,1,c]]; } },
    { id:'bald',     ko:'민머리',    en:'Bald',       f:function(){ return []; } }
  ];

  /* ══════ ACCESSORIES — 20 ════════════════════════════════════════════ */
  var ACC = [
    { id:'none',      ko:'없음',      en:'None',        f:function(){ return []; } },
    { id:'headband',  ko:'머리띠',    en:'Headband',    f:function(p){ return [['R',3,3,10,1,p.cloth]]; } },
    { id:'beanie',    ko:'비니',      en:'Beanie',      f:function(p){ return [['R',3,1,10,3,p.cloth],['R',4,0,8,1,p.cloth],['R',2,3,12,1,W]]; } },
    { id:'capback',   ko:'캡(뒤로)',  en:'Cap',         f:function(p){ return [['R',4,1,8,3,p.cloth],['R',11,3,4,1,p.cloth]]; } },
    { id:'flowerpin', ko:'꽃핀',      en:'Flower pin',  f:function(){ return [['F',12,2,1.6,PK],['R',12,2,1,1,GD]]; } },
    { id:'headphone', ko:'헤드폰',    en:'Headphones',  f:function(){ return [['R',4,1,8,1,K],['R',3,2,1,4,K],['R',12,2,1,4,K],['R',2,3,1,2,K],['R',13,3,1,2,K]]; } },
    { id:'bandana',   ko:'반다나',    en:'Bandana',     f:function(p){ return [['R',3,2,10,2,p.cloth],['R',2,3,2,3,p.cloth]]; } },
    { id:'hairclip',  ko:'헤어핀',    en:'Hair clip',   f:function(){ return [['R',10,2,3,1,GD]]; } },
    { id:'halo',      ko:'헤일로',    en:'Halo',        f:function(){ return [['R',5,0,6,1,GD],['R',4,0,1,1,GD],['R',11,0,1,1,GD]]; } },
    { id:'catears',   ko:'고양이 귀',  en:'Cat ears',    f:function(p){ return [['T',3,0,3,3,'u',p.hairColor],['T',10,0,3,3,'u',p.hairColor],['R',4,2,1,1,PK],['R',11,2,1,1,PK]]; } },
    { id:'crownsm',   ko:'작은 왕관',  en:'Small crown', f:function(){ return [['R',4,2,8,1,GD],['R',4,1,1,1,GD],['R',7,0,2,2,GD],['R',11,1,1,1,GD]]; } },
    { id:'earrings',  ko:'귀걸이',    en:'Earrings',    f:function(){ return [['R',3,8,1,1,GD],['R',12,8,1,1,GD]]; } },
    { id:'scarf',     ko:'목도리',    en:'Scarf',       f:function(p){ return [['R',5,10,6,2,p.cloth2],['R',10,12,2,3,p.cloth2]]; } },
    { id:'bowtie',    ko:'나비넥타이', en:'Bow tie',     f:function(){ return [['R',6,11,2,2,RD],['R',9,11,2,2,RD],['R',8,11,1,2,K]]; } },
    { id:'hoodup',    ko:'후드',      en:'Hood',        f:function(p){ return [['R',2,2,2,9,p.cloth],['R',12,2,2,9,p.cloth],['R',3,1,10,2,p.cloth]]; } },
    { id:'antenna',   ko:'안테나',    en:'Antenna',     f:function(){ return [['R',8,0,1,3,ST],['F',8,0,1.2,RD]]; } },
    { id:'horns',     ko:'뿔',        en:'Horns',       f:function(){ return [['R',3,0,1,3,W],['R',12,0,1,3,W],['R',2,1,1,2,W],['R',13,1,1,2,W]]; } },
    { id:'visor',     ko:'바이저',    en:'Visor',       f:function(p){ return [['R',3,3,10,1,p.cloth],['R',2,4,12,1,K]]; } },
    { id:'facemask',  ko:'마스크',    en:'Face mask',   f:function(){ return [['R',4,7,8,4,W],['R',3,7,1,2,W],['R',12,7,1,2,W]]; } },
    { id:'freckleset',ko:'헤어밴드+핀',en:'Band + pin', f:function(p){ return [['R',3,3,10,1,p.cloth2],['R',11,2,2,1,GD]]; } }
  ];

  /* ══════ FACE DETAIL — 14 ════════════════════════════════════════════ */
  var FACE = [
    { id:'none',      ko:'없음',      en:'None',        f:function(){ return []; } },
    { id:'glasses',   ko:'안경',      en:'Glasses',     f:function(){ return [['R',5,5,3,1,K],['R',8,5,3,1,K],['R',5,7,3,1,K],['R',8,7,3,1,K],['R',5,6,1,1,K],['R',7,6,1,1,K],['R',8,6,1,1,K],['R',10,6,1,1,K]]; } },
    { id:'roundglass',ko:'동그란 안경',en:'Round glasses',f:function(){ return [['R',5,5,3,1,K],['R',5,7,3,1,K],['R',5,6,1,1,K],['R',7,6,1,1,K],['R',8,5,3,1,K],['R',8,7,3,1,K],['R',8,6,1,1,K],['R',10,6,1,1,K],['R',3,6,2,1,K],['R',11,6,2,1,K]]; } },
    { id:'sunglasses',ko:'선글라스',   en:'Sunglasses',  f:function(){ return [['R',4,5,4,3,K],['R',9,5,4,3,K],['R',8,6,1,1,K]]; } },
    { id:'monocle',   ko:'모노클',    en:'Monocle',     f:function(){ return [['R',8,5,3,1,GD],['R',8,7,3,1,GD],['R',8,6,1,1,GD],['R',10,6,1,1,GD],['R',11,8,1,3,GD],['R',11,10,2,1,GD]]; } },
    { id:'eyepatch',  ko:'안대',      en:'Eye patch',   f:function(){ return [['R',8,5,4,3,K],['R',4,4,8,1,K]]; } },
    { id:'beard',     ko:'턱수염',    en:'Full beard',  f:function(p){ return [['R',4,8,8,2,p.hairColor],['R',5,10,6,1,p.hairColor],['R',3,6,1,3,p.hairColor],['R',12,6,1,3,p.hairColor]]; } },
    { id:'mustache',  ko:'콧수염',    en:'Moustache',   f:function(p){ return [['R',5,7,6,1,p.hairColor]]; } },
    { id:'goatee',    ko:'염소수염',   en:'Goatee',      f:function(p){ return [['R',6,9,4,1,p.hairColor],['R',7,7,2,1,p.hairColor]]; } },
    { id:'stubble',   ko:'무정면도',   en:'Stubble',     f:function(){ return [['R',5,9,1,1,ST],['R',7,9,1,1,ST],['R',9,9,1,1,ST],['R',6,8,1,1,ST],['R',10,8,1,1,ST]]; } },
    { id:'freckles',  ko:'주근깨',    en:'Freckles',    f:function(){ return [['R',5,7,1,1,BR],['R',10,7,1,1,BR],['R',4,6,1,1,BR],['R',11,6,1,1,BR]]; } },
    { id:'blush',     ko:'볼터치',    en:'Blush',       f:function(){ return [['R',4,7,2,1,PK],['R',10,7,2,1,PK]]; } },
    { id:'scar',      ko:'흉터',      en:'Scar',        f:function(){ return [['R',10,4,1,4,RD]]; } },
    { id:'mole',      ko:'점',        en:'Mole',        f:function(){ return [['R',10,9,1,1,K]]; } }
  ];

  /* ══════ EXPRESSION — 10 ═════════════════════════════════════════════ */
  var EXPR = [
    { id:'neutral',  ko:'무표정',  en:'Neutral',   f:function(){ return [['R',6,6,1,1,K],['R',9,6,1,1,K],['R',7,8,2,1,K]]; } },
    { id:'smile',    ko:'미소',    en:'Smile',     f:function(){ return [['R',6,6,1,1,K],['R',9,6,1,1,K],['R',7,9,2,1,K],['R',6,8,1,1,K],['R',9,8,1,1,K]]; } },
    { id:'grin',     ko:'활짝',    en:'Grin',      f:function(){ return [['R',6,6,1,1,K],['R',9,6,1,1,K],['R',6,8,4,2,K],['R',6,9,4,1,W]]; } },
    { id:'sad',      ko:'슬픔',    en:'Sad',       f:function(){ return [['R',6,6,1,1,K],['R',9,6,1,1,K],['R',7,8,2,1,K],['R',6,9,1,1,K],['R',9,9,1,1,K]]; } },
    { id:'angry',    ko:'화남',    en:'Angry',     f:function(){ return [['R',5,5,2,1,K],['R',9,5,2,1,K],['R',6,6,1,1,K],['R',9,6,1,1,K],['R',6,9,4,1,K]]; } },
    { id:'surprise', ko:'놀람',    en:'Surprised', f:function(){ return [['R',5,5,2,2,K],['R',9,5,2,2,K],['R',7,8,2,2,K]]; } },
    { id:'wink',     ko:'윙크',    en:'Wink',      f:function(){ return [['R',6,6,1,1,K],['R',9,7,2,1,K],['R',7,9,2,1,K],['R',6,8,1,1,K],['R',9,8,1,1,K]]; } },
    { id:'sleepy',   ko:'졸림',    en:'Sleepy',    f:function(){ return [['R',5,6,2,1,K],['R',9,6,2,1,K],['R',7,8,1,1,K]]; } },
    { id:'cry',      ko:'울음',    en:'Crying',    f:function(){ return [['R',6,6,1,1,K],['R',9,6,1,1,K],['R',6,7,1,2,BU],['R',9,7,1,2,BU],['R',6,9,4,1,K]]; } },
    { id:'smirk',    ko:'씩',      en:'Smirk',     f:function(){ return [['R',6,6,1,1,K],['R',9,6,1,1,K],['R',7,8,3,1,K],['R',9,7,1,1,K]]; } }
  ];

  /* ══════ JOB OUTFITS — 44 ════════════════════════════════════════════ */
  function J(id, ko, en, group, cloth, hat, extra) {
    return { id:id, ko:ko, en:en, group:group, cloth:cloth, hat:hat||function(){return [];}, extra:extra||function(){return [];} };
  }
  var JOB = [
    /* 의료 */
    J('doctor','의사','Doctor','medical',W,
      function(){ return [['R',4,2,8,2,K],['R',6,1,4,1,K],['F',8,2,1.4,W],['R',7,2,2,1,K]]; },
      function(){ return [['R',5,11,1,3,K],['R',10,11,1,3,K],['R',6,13,4,1,K],['F',8,14,1.4,ST]]; }),
    J('nurse','간호사','Nurse','medical',W,
      function(){ return [['R',4,2,8,2,K],['R',5,0,6,2,W],['R',7,0,2,2,RD],['R',6,1,4,1,RD]]; },
      function(){ return [['R',6,11,4,1,BU]]; }),
    J('dentist','치과의사','Dentist','medical',W,
      function(){ return [['R',4,2,8,2,K]]; },
      function(){ return [['R',4,7,8,4,W],['R',3,7,1,2,W],['R',12,7,1,2,W]]; }),
    /* IT */
    J('dev','개발자','Developer','it',K,
      function(){ return [['R',4,2,8,2,K],['R',2,2,2,9,'#4a4a52'],['R',13,2,2,9,'#4a4a52'],['R',3,1,10,2,'#4a4a52']]; },
      function(){ return [['R',4,1,8,1,K],['R',3,2,1,4,K],['R',12,2,1,4,K],['R',4,4,1,4,K],['R',5,7,2,1,K]]; }),
    J('gamer','게이머','Gamer','it',PU,
      function(){ return [['R',4,2,8,2,'#8f4f1a'],['R',4,1,1,1,'#8f4f1a'],['R',7,1,1,1,'#8f4f1a'],['R',10,1,1,1,'#8f4f1a']]; },
      function(){ return [['R',4,1,8,1,RD],['R',3,2,1,5,RD],['R',12,2,1,5,RD],['R',3,7,2,1,K],['R',5,8,2,1,K]]; }),
    J('designer','디자이너','Designer','it',K,
      function(){ return [['R',3,1,10,3,OR],['R',12,0,2,1,OR]]; },
      function(){ return [['R',5,12,1,3,GD],['R',6,12,1,3,BU],['R',7,12,1,3,RD]]; }),
    /* 교육 */
    J('teacher','교사','Teacher','education',NV,
      function(){ return [['R',4,2,8,2,K],['R',2,1,12,2,K],['R',6,0,4,1,K],['R',13,2,1,3,GD]]; },
      function(){ return [['R',6,11,4,1,W],['R',7,12,2,3,RD]]; }),
    J('professor','교수','Professor','education',BR,
      function(){ return [['R',3,2,10,2,ST],['R',3,4,1,3,ST],['R',12,4,1,3,ST]]; },
      function(){ return [['R',4,8,8,2,ST],['R',5,10,6,1,ST],['R',6,11,4,1,W]]; }),
    J('scientist','과학자','Scientist','education',W,
      function(){ return [['R',4,2,8,2,K],['R',4,3,8,2,ST],['F',6,4,1.4,SK],['F',10,4,1.4,SK]]; },
      function(){ return [['R',5,12,2,3,BU]]; }),
    /* 요리 */
    J('chef','요리사','Chef','food',W,
      function(){ return [['R',4,0,8,3,W],['R',3,1,1,2,W],['R',12,1,1,2,W],['R',3,3,10,1,W]]; },
      function(){ return [['R',5,11,6,1,RD],['R',5,12,6,3,W]]; }),
    J('barista','바리스타','Barista','food',BR,
      function(){ return [['R',4,2,8,2,K],['R',4,1,8,2,K],['R',3,3,10,1,K]]; },
      function(){ return [['R',4,12,8,3,TN],['R',6,11,4,1,TN]]; }),
    J('baker','제빵사','Baker','food',W,
      function(){ return [['R',3,2,10,2,W],['R',2,3,2,2,W],['R',5,2,1,1,RD],['R',9,2,1,1,RD]]; },
      function(){ return [['R',4,12,8,3,TN]]; }),
    /* 건설 */
    J('builder','건설노동자','Builder','construction',OR,
      function(){ return [['R',4,2,8,2,K],['R',4,1,8,2,GD],['R',5,0,6,1,GD],['R',2,3,12,1,GD]]; },
      function(){ return [['R',4,11,8,1,GD],['R',5,12,2,3,GD]]; }),
    J('engineer','엔지니어','Engineer','construction',BU,
      function(){ return [['R',4,2,8,2,K],['R',4,1,8,2,W],['R',5,0,6,1,W],['R',2,3,12,1,W]]; },
      function(){ return [['R',5,11,6,1,GD],['R',10,12,2,2,ST]]; }),
    J('welder','용접공','Welder','construction',ST,
      function(){ return [['R',3,1,10,3,ST]]; },
      function(){ return [['R',4,3,8,7,ST],['R',5,5,6,1,K],['R',3,4,1,4,ST],['R',12,4,1,4,ST]]; }),
    /* 예술 */
    J('artist','화가','Artist','art',K,
      function(){ return [['R',3,1,10,3,PU],['R',12,0,2,1,PU]]; },
      function(){ return [['R',3,12,3,3,TN],['R',4,13,1,1,RD],['R',3,13,1,1,BU]]; }),
    J('photographer','사진가','Photographer','art',GR,
      function(){ return [['R',4,2,8,2,K],['R',4,1,8,2,GR],['R',11,3,4,1,GR]]; },
      function(){ return [['R',5,11,6,3,K],['F',8,12.5,1.4,SK],['R',4,10,8,1,K]]; }),
    J('musician','음악가','Musician','art',PU,
      function(){ return [['R',4,2,8,2,'#2b211b'],['R',3,3,1,7,'#2b211b'],['R',12,3,1,7,'#2b211b']]; },
      function(){ return [['R',4,1,8,1,K],['R',3,2,1,4,K],['R',12,2,1,4,K],['R',6,11,4,4,GD]]; }),
    /* 공공·안전 */
    J('police','경찰','Police','safety',NV,
      function(){ return [['R',4,2,8,2,K],['R',4,1,8,2,NV],['R',3,3,10,1,K],['R',7,1,2,1,GD]]; },
      function(){ return [['R',5,11,6,1,GD],['R',10,12,2,2,ST]]; }),
    J('firefighter','소방관','Firefighter','safety',RD,
      function(){ return [['R',3,1,10,3,RD],['R',2,4,12,1,RD],['R',6,0,4,1,RD],['R',7,2,2,1,GD]]; },
      function(){ return [['R',4,12,8,1,GD]]; }),
    J('soldier','군인','Soldier','safety',GR,
      function(){ return [['R',4,2,8,2,K],['R',3,1,10,3,GR],['R',2,3,12,1,GR],['R',6,11,4,1,'#4a5a3c']]; },
      function(){ return [['R',4,12,3,2,'#4a5a3c'],['R',9,13,3,2,'#4a5a3c']]; }),
    /* 비즈니스 */
    J('clerk','사무직','Office worker','business',NV,
      function(){ return [['R',4,2,8,2,K]]; },
      function(){ return [['R',6,11,4,1,W],['R',7,11,2,4,RD]]; }),
    J('lawyer','변호사','Lawyer','business','#2b211b',
      function(){ return [['R',4,2,8,2,K],['R',4,4,2,1,K]]; },
      function(){ return [['R',6,11,4,2,W],['R',7,11,2,4,NV]]; }),
    J('judge','판사','Judge','business',K,
      function(){ return [['R',3,1,10,3,W],['R',2,4,2,5,W],['R',12,4,2,5,W]]; },
      function(){ return [['R',5,11,6,2,W],['R',7,11,2,3,K]]; }),
    /* 운송 */
    J('pilot','파일럿','Pilot','transport',NV,
      function(){ return [['R',4,2,8,2,K],['R',4,1,8,2,W],['R',3,3,10,1,K],['R',7,1,2,1,GD]]; },
      function(){ return [['R',6,11,4,1,W],['R',4,12,2,1,GD],['R',4,13,3,1,GD]]; }),
    J('sailor','선원','Sailor','transport',W,
      function(){ return [['R',4,2,8,2,K],['R',4,1,8,2,W],['R',3,3,10,1,W],['R',6,2,4,1,NV]]; },
      function(){ return [['R',5,11,6,1,NV],['R',3,13,10,1,NV]]; }),
    J('driver','운전기사','Driver','transport',BU,
      function(){ return [['R',4,2,8,2,K],['R',4,1,8,2,BU],['R',3,3,10,1,K]]; },
      function(){ return [['R',6,11,4,1,W]]; }),
    /* 농림·어업 */
    J('farmer','농부','Farmer','agriculture',GR,
      function(){ return [['R',4,2,8,2,K],['R',5,1,6,2,TN],['R',1,3,14,1,TN],['R',5,2,6,1,BR]]; },
      function(){ return [['R',5,11,6,1,BU],['R',6,12,1,3,BU],['R',9,12,1,3,BU]]; }),
    J('fisher','어부','Fisher','agriculture',GD,
      function(){ return [['R',4,2,8,2,K],['R',4,1,8,2,GD],['R',2,3,12,1,GD]]; },
      function(){ return [['R',4,8,8,2,ST],['R',5,10,6,1,ST]]; }),
    J('miner','광부','Miner','agriculture',BR,
      function(){ return [['R',4,2,8,2,K],['R',4,1,8,2,GD],['R',2,3,12,1,GD],['R',7,1,2,1,W]]; },
      function(){ return [['R',5,9,6,1,'#4a4a52'],['R',4,12,8,1,'#4a4a52']]; }),
    /* 서비스 */
    J('barber','미용사','Barber','service',K,
      function(){ return [['R',4,2,8,2,K],['R',4,1,8,2,K]]; },
      function(){ return [['R',4,12,8,3,W],['R',10,11,1,2,ST],['R',11,11,1,2,ST]]; }),
    J('cleaner','청소원','Cleaner','service',TL,
      function(){ return [['R',4,2,8,2,K],['R',3,2,10,2,GD]]; },
      function(){ return [['R',4,12,8,3,W],['R',12,11,1,4,BR]]; }),
    J('courier','택배기사','Courier','service',OR,
      function(){ return [['R',4,2,8,2,K],['R',4,1,8,2,OR],['R',11,3,4,1,OR]]; },
      function(){ return [['R',3,11,5,4,TN],['R',5,11,1,4,BR]]; }),
    /* 판타지 */
    J('wizard','마법사','Wizard','fantasy',PU,
      function(){ return [['T',4,0,8,5,'u',PU],['R',2,4,12,1,PU],['R',7,2,2,1,GD]]; },
      function(){ return [['R',4,8,8,3,W],['R',5,11,6,1,W]]; }),
    J('knight','기사','Knight','fantasy',ST,
      function(){ return [['R',3,1,10,3,SK],['R',7,0,2,1,RD]]; },
      function(){ return [['R',4,3,8,7,SK],['R',5,5,6,1,K],['R',7,7,2,3,K],['R',3,4,1,4,SK],['R',12,4,1,4,SK]]; }),
    J('ninja','닌자','Ninja','fantasy',K,
      function(){ return [['R',3,1,10,4,K],['R',2,2,1,3,K],['R',13,2,1,3,K]]; },
      function(){ return [['R',4,7,8,4,K],['R',3,7,1,2,K],['R',12,7,1,2,K],['R',3,4,10,1,RD],['R',13,4,2,4,RD]]; }),
    J('pirate','해적','Pirate','fantasy',RD,
      function(){ return [['R',3,2,10,2,RD],['R',2,3,2,4,RD],['R',5,2,1,1,W],['R',9,2,1,1,W]]; },
      function(){ return [['R',8,5,4,3,K],['R',4,4,8,1,K],['R',5,11,6,1,W]]; }),
    J('viking','바이킹','Viking','fantasy',BR,
      function(){ return [['R',4,2,8,2,SK],['R',1,0,2,4,W],['R',13,0,2,4,W],['R',2,1,1,2,W],['R',13,1,1,2,W]]; },
      function(){ return [['R',4,8,8,3,'#c97a2e'],['R',5,11,6,1,'#c97a2e']]; }),
    J('king','왕','King','fantasy',PU,
      function(){ return [['R',4,2,8,2,K],['R',3,2,10,2,GD],['R',3,0,1,2,GD],['R',7,0,2,2,GD],['R',12,0,1,2,GD],['R',7,3,2,1,RD]]; },
      function(){ return [['R',5,11,6,1,GD],['R',4,12,8,1,W]]; }),
    J('monk','승려','Monk','fantasy',OR,
      function(){ return [['R',4,3,8,1,'#8f6a4a']]; },
      function(){ return [['R',3,10,10,2,GD],['R',6,11,4,1,OR]]; }),
    J('samurai','사무라이','Samurai','fantasy',K,
      function(){ return [['R',4,2,8,2,K],['R',3,1,10,3,'#4a4a52'],['R',2,3,12,1,'#4a4a52'],['R',5,0,6,1,GD],['R',7,1,2,1,GD]]; },
      function(){ return [['R',4,11,8,1,RD],['R',5,12,6,1,'#4a4a52']]; }),
    J('astronaut','우주비행사','Astronaut','fantasy',W,
      function(){ return [['R',2,1,12,3,W],['R',1,3,1,7,W],['R',14,3,1,7,W]]; },
      function(){ return [['R',2,3,2,7,W],['R',12,3,2,7,W],['R',4,3,8,1,W],['R',4,9,8,1,W],['R',4,11,8,1,SK],['R',5,12,2,2,RD],['R',9,12,2,2,BU]]; }),
    J('detective','탐정','Detective','fantasy',BR,
      function(){ return [['R',4,2,8,2,K],['R',3,1,10,2,'#4a3a2a'],['R',1,3,14,1,'#4a3a2a'],['R',3,2,10,1,K]]; },
      function(){ return [['R',5,7,6,1,'#5c4a3f'],['R',6,11,4,1,W]]; }),
    J('athlete','운동선수','Athlete','fantasy',W,
      function(){ return [['R',4,2,8,2,K],['R',3,3,10,1,RD]]; },
      function(){ return [['R',6,12,4,2,RD],['R',5,11,6,1,RD]]; })
  ];
  var JOB_BY_ID = {}; JOB.forEach(function(j){ JOB_BY_ID[j.id]=j; });
  function addJobs(list){ list.forEach(function(j){ if(!JOB_BY_ID[j.id]){ JOB.push(j); JOB_BY_ID[j.id]=j; } }); }
  function resolve(v, P){ return typeof v === 'function' ? v(P) : (v || []); }

  /* ══════ ANIMALS — 26 ════════════════════════════════════════════════ */
  function A(id, ko, en, ears, fur, opt) {
    return Object.assign({ id:id, ko:ko, en:en, ears:ears, fur:fur, muzzle:false, inner:'#d99e7a' }, opt||{});
  }
  var ANIMAL = [
    A('cat','고양이','Cat','pointed',null,{muzzle:true}),
    A('fox','여우','Fox','pointed','#c97a2e',{muzzle:'white'}),
    A('dog','개','Dog','floppy',null,{muzzle:true}),
    A('bear','곰','Bear','round','#8f4f1a',{muzzle:true}),
    A('panda','판다','Panda','round','#f2e9d8',{muzzle:true,patch:true,earDark:true}),
    A('rabbit','토끼','Rabbit','long','#f2e9d8',{muzzle:true}),
    A('frog','개구리','Frog','eyestalk','#7d9463',{wideMouth:true}),
    A('bird','새','Bird','none','#3f8fbf',{beak:true}),
    A('wolf','늑대','Wolf','pointed','#b0b9cc',{muzzle:true}),
    A('tiger','호랑이','Tiger','round','#e0a63c',{muzzle:true,stripes:true}),
    A('lion','사자','Lion','round','#e8a860',{muzzle:true,mane:true}),
    A('pig','돼지','Pig','pointed','#e278a1',{snout:true}),
    A('cow','소','Cow','floppy','#f2e9d8',{snout:true,spots:true}),
    A('sheep','양','Sheep','floppy','#f2e9d8',{wool:true,muzzle:true}),
    A('mouse','쥐','Mouse','biground','#b0b9cc',{muzzle:true}),
    A('hamster','햄스터','Hamster','round','#d9c9a8',{muzzle:true,cheeks:true}),
    A('penguin','펭귄','Penguin','none','#2b211b',{beak:true,belly:true}),
    A('owl','부엉이','Owl','tuft','#8f4f1a',{bigEyes:true,beak:true}),
    A('deer','사슴','Deer','antler','#c97a2e',{muzzle:true}),
    A('monkey','원숭이','Monkey','biground','#8f4f1a',{muzzle:'light'}),
    A('koala','코알라','Koala','fluffy','#a8917d',{snout:true}),
    A('raccoon','너구리','Raccoon','pointed','#b0b9cc',{patch:true,muzzle:true}),
    A('turtle','거북','Turtle','none','#5c8a3c',{shell:true}),
    A('dragon','드래곤','Dragon','horn','#2e7d6e',{muzzle:true,spikes:true}),
    A('unicorn','유니콘','Unicorn','horn','#f0dced',{muzzle:true,unicorn:true}),
    A('cat2','검은고양이','Black cat','pointed','#2b211b',{muzzle:true,glowEyes:true})
  ];
  var ANIMAL_BY_ID = {}; ANIMAL.forEach(function(a){ ANIMAL_BY_ID[a.id]=a; });

  /* ══════ BUILDERS ════════════════════════════════════════════════════ */
  function humanLayers(sp) {
    var skin = SKIN[sp.skin], hairC = HAIRC[sp.hairColor], cloth = CLOTH[sp.cloth];
    var job = sp.job ? JOB_BY_ID[sp.job] : null;
    if (job && job.cloth) cloth = job.cloth;
    var P = { skin:skin, hairColor:hairC, cloth:cloth, cloth2:CLOTH[(sp.cloth+5)%CLOTH.length] };
    var L = [];
    L.push(['R',3,11,10,5,cloth]);
    L.push(['R',2,12,1,4,cloth],['R',13,12,1,4,cloth]);
    if (job) L = L.concat(resolve(job.extra, P));
    L.push(['R',6,10,4,1,skin]);
    L.push(['R',4,3,8,7,skin]);
    L.push(['R',3,5,1,3,skin],['R',12,5,1,3,skin]);
    L = L.concat(HAIR[sp.hair].f(hairC));
    if (job) L = L.concat(resolve(job.hat, P));
    if (!job) L = L.concat(ACC[sp.acc].f(P));
    L = L.concat(EXPR[sp.expr].f(P));
    L = L.concat(FACE[sp.face].f(P));
    return L;
  }

  function animalLayers(sp) {
    var a = ANIMAL_BY_ID[sp.species] || ANIMAL[0];
    var fur = a.fur || FUR[sp.fur];
    var inner = a.inner, dark = K, cloth = CLOTH[sp.cloth];
    var L = [];
    L.push(['R',4,12,8,4,cloth]);
    if (a.ears === 'pointed') L.push(['T',2,1,4,5,'u',fur],['T',10,1,4,5,'u',fur],['R',3,4,2,2,inner],['R',11,4,2,2,inner]);
    if (a.ears === 'floppy')  L.push(['R',1,4,3,6,fur],['R',12,4,3,6,fur]);
    if (a.ears === 'round')   L.push(['F',3.5,4,2.4,a.earDark?dark:fur],['F',12.5,4,2.4,a.earDark?dark:fur]);
    if (a.ears === 'biground')L.push(['F',3,4,3,fur],['F',13,4,3,fur],['F',3,4,1.6,inner],['F',13,4,1.6,inner]);
    if (a.ears === 'long')    L.push(['R',4,0,2,6,fur],['R',10,0,2,6,fur],['R',4,1,2,4,inner],['R',10,1,2,4,inner]);
    if (a.ears === 'tuft')    L.push(['T',2,2,3,4,'u',fur],['T',11,2,3,4,'u',fur]);
    if (a.ears === 'fluffy')  L.push(['F',3,5,3.2,fur],['F',13,5,3.2,fur],['F',3,5,1.6,'#f2e9d8'],['F',13,5,1.6,'#f2e9d8']);
    if (a.ears === 'antler')  L.push(['R',3,0,1,5,'#8f6a4a'],['R',12,0,1,5,'#8f6a4a'],['R',2,1,1,2,'#8f6a4a'],['R',13,1,1,2,'#8f6a4a'],['R',4,1,1,1,'#8f6a4a'],['R',11,1,1,1,'#8f6a4a']);
    if (a.ears === 'horn')    L.push(['T',3,0,2,4,'u','#e8dcc0'],['T',11,0,2,4,'u','#e8dcc0']);
    if (a.mane) L.push(['F',8,8,6.6,'#c97a2e']);
    if (a.wool) L.push(['F',4.5,4.5,2.6,'#f2e9d8'],['F',11.5,4.5,2.6,'#f2e9d8'],['F',8,3.5,2.6,'#f2e9d8']);
    L.push(['R',3,4,10,8,fur]);
    if (a.unicorn) L.push(['T',7,0,2,4,'u',GD]);
    if (a.spikes) L.push(['R',5,3,1,1,GD],['R',8,2,1,2,GD],['R',11,3,1,1,GD]);
    if (a.stripes) L.push(['R',5,4,1,2,dark],['R',8,4,1,2,dark],['R',11,4,1,2,dark]);
    if (a.spots) L.push(['F',5,6,1.8,dark],['F',11.5,9,1.6,dark]);
    if (a.belly) L.push(['R',5,7,6,5,'#f2e9d8']);
    if (a.shell) L.push(['R',2,9,12,3,'#8f6a4a'],['R',4,10,2,1,'#5c4a3f'],['R',8,10,2,1,'#5c4a3f']);
    if (a.ears === 'eyestalk') L.push(['F',4.5,4,2.2,fur],['F',11.5,4,2.2,fur],['R',4,3,1,1,dark],['R',11,3,1,1,dark]);
    if (a.patch) L.push(['F',5.5,7.5,2,dark],['F',10.5,7.5,2,dark]);
    if (a.bigEyes) L.push(['F',5.5,7,2.4,'#f2e9d8'],['F',10.5,7,2.4,'#f2e9d8']);
    if (a.cheeks) L.push(['R',3,8,2,2,PK],['R',11,8,2,2,PK]);
    L.push(['R',5,7,1,2,a.glowEyes?GD:dark],['R',10,7,1,2,a.glowEyes?GD:dark]);
    if (a.muzzle === 'white') L.push(['R',6,9,4,3,'#f2e9d8']);
    if (a.muzzle === 'light') L.push(['R',5,8,6,4,'#e8c9a0']);
    if (a.snout) L.push(['R',6,9,4,3,PK],['R',7,10,1,1,dark],['R',9,10,1,1,dark]);
    if (a.beak) L.push(['T',6,9,4,3,'d',GD]);
    if (!a.snout && !a.beak) L.push(['R',7,9,2,1,dark]);
    if (a.wideMouth) L.push(['R',5,10,6,1,dark]);
    else if (!a.beak && !a.snout) L.push(['R',6,10,1,1,dark],['R',9,10,1,1,dark]);
    return L;
  }

  /* ── layers → SVG ──────────────────────────────────────────────────── */
  function layersToRects(layers) {
    var grid = [], y, x;
    for (y = 0; y < 16; y++) { grid.push(new Array(16).fill(null)); }
    layers.forEach(function (l) {
      var k = l[0], color = l[l.length - 1], args = l.slice(1, -1), v = 1;
      if (k[0] === '-') { k = k.slice(1); v = 0; }
      var tmp = [];
      for (y = 0; y < 16; y++) tmp.push(new Uint8Array(16));
      OPS[k].apply(null, [tmp, 1].concat(args));
      for (y = 0; y < 16; y++) for (x = 0; x < 16; x++) if (tmp[y][x]) grid[y][x] = v ? color : null;
    });
    var out = '';
    for (y = 0; y < 16; y++) {
      x = 0;
      while (x < 16) {
        var c = grid[y][x];
        if (c) { var w = 0; while (x + w < 16 && grid[y][x + w] === c) w++;
          out += '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="1" fill="' + c + '"/>'; x += w; }
        else x++;
      }
    }
    return out;
  }

  /* ── spec + render ─────────────────────────────────────────────────── */
  function spec(seed, opts) {
    opts = opts || {};
    var r = rngOf(seed == null ? Math.random() : seed);
    var s = {
      seed: String(seed),
      type: opts.type || (r() < 0.72 ? 'human' : 'animal'),
      skin: idx(r, SKIN.length), hairColor: idx(r, HAIRC.length), cloth: idx(r, CLOTH.length),
      fur: idx(r, FUR.length),
      hair: idx(r, HAIR.length), acc: r() < 0.45 ? idx(r, ACC.length) : 0,
      expr: r() < 0.5 ? 0 : idx(r, EXPR.length), face: r() < 0.5 ? idx(r, FACE.length) : 0,
      species: ANIMAL[idx(r, ANIMAL.length)].id,
      job: opts.job !== undefined ? opts.job : null
    };
    ['skin','hairColor','cloth','fur','hair','acc','expr','face','species','job','type'].forEach(function (k) {
      if (opts[k] !== undefined && opts[k] !== null) s[k] = opts[k];
    });
    if (s.job) s.type = 'human';
    return s;
  }

  function svg(sp, cls, title) {
    var body = layersToRects(sp.type === 'animal' ? animalLayers(sp) : humanLayers(sp));
    return '<span class="px-pavatar' + (cls ? ' ' + cls : '') + '"' + (title ? ' title="' + title + '"' : '') +
      '><svg viewBox="0 0 16 16" shape-rendering="crispEdges" role="img" aria-label="avatar">' + body + '</svg></span>';
  }
  function avatar(seed, opts, cls) { var sp = spec(seed, opts); return svg(sp, cls, sp.seed); }
  function rawSVG(sp) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="128" height="128" ' +
      'shape-rendering="crispEdges">' + layersToRects(sp.type === 'animal' ? animalLayers(sp) : humanLayers(sp)) + '</svg>';
  }

  var JOB_GROUPS = [
    { id:'medical',      ko:'의료·건강',    en:'Medical' },
    { id:'it',           ko:'IT·개발',      en:'IT' },
    { id:'education',    ko:'교육·연구',    en:'Education' },
    { id:'food',         ko:'요리·식음료',  en:'Food' },
    { id:'construction', ko:'건설·제조',    en:'Construction' },
    { id:'art',          ko:'예술·창작',    en:'Art' },
    { id:'safety',       ko:'공공·안전',    en:'Public safety' },
    { id:'business',     ko:'비즈니스·사무',en:'Business' },
    { id:'transport',    ko:'운송·물류',    en:'Transport' },
    { id:'agriculture',  ko:'농림·어업',    en:'Agriculture' },
    { id:'service',      ko:'서비스·미용',  en:'Service' },
    { id:'fantasy',      ko:'판타지·기타',  en:'Fantasy / other' }
  ];

  root.PXC_EXT = Object.assign(root.PXC_EXT || {}, {
    HAIR: HAIR, ACC: ACC, FACE: FACE, EXPR: EXPR, JOB: JOB, JOB_GROUPS: JOB_GROUPS, ANIMAL: ANIMAL,
    JOB_BY_ID: JOB_BY_ID, addJobs: addJobs,
    K: K, W: W, RD: RD, BU: BU, NV: NV, GR: GR, GD: GD, OR: OR, PU: PU, ST: ST, BR: BR, TN: TN, PK: PK, SK: SK, TL: TL,
    SKIN: SKIN, HAIRC: HAIRC, CLOTH: CLOTH, FUR: FUR,
    avatarSpec: spec, avatarSVG: svg, avatar: avatar, avatarRawSVG: rawSVG, layersToRects: layersToRects
  });
})(window);
