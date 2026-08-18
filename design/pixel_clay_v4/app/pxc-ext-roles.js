/* PIXEL-CLAY · ROLE PACK — relationship & social roles (icons + avatars)
   plus the plain "default" set every catalogue needs.
   Load AFTER pxc-ext-icons2.js and pxc-ext-jobs.js. */
(function (root) {
  "use strict";
  var DS = root.PIXELCLAYDesignSystem_ca692b, E = root.PXC_EXT;
  if (!DS || !E || !E.addJobs) { console.error('[pxc-ext] earlier packs not loaded'); return; }

  /* ══════ ICONS · 기본 (default person set) ══════════════════════════ */
  var BASIC = {
    person:[['F',8,4,3],['R',4,8,8,8],['-R',4,8,2,1],['-R',10,8,2,1]],
    personCircle:[['C',8,8,6.6],['F',8,6,2.2],['R',5,9,6,5],['-R',5,9,1,1],['-R',10,9,1,1],['-R',3,13,10,3]],
    personSquare:[['R',1,1,14,14],['-F',8,6,2.4],['-R',5,9,6,5],['R',5,9,1,1],['R',10,9,1,1]],
    personRemove:[['F',6,5,3],['R',1,10,10,6],['-R',1,10,2,1],['-R',9,10,2,1],['R',10,7,6,2]],
    personCheck:[['F',6,5,3],['R',1,10,10,6],['-R',1,10,2,1],['-R',9,10,2,1],['D',10,8,3,1,1],['D',10,9,2,1,1],['D',12,10,4,1,-1],['D',12,11,3,1,-1]],
    personBlock:[['F',6,5,3],['R',1,10,10,6],['C',12,11,3.4],['D',10,9,5,1,1]],
    personSearch:[['F',6,5,3],['R',1,10,10,6],['C',12,10,3],['R',14,13,2,2]],
    personStar:[['F',6,5,3],['R',1,10,10,6],['T',11,7,4,3,'u'],['R',9,10,8,1],['R',11,11,4,2],['R',10,13,2,2],['R',14,13,2,2]],
    anonymous:[['R',3,2,10,2],['R',1,4,14,1],['F',8,7,3],['R',5,6,6,2],['R',4,11,8,5]],
    silhouette:[['F',8,4,3],['R',4,8,8,8]],
    avatarSlot:[['R',1,1,4,1],['R',7,1,2,1],['R',11,1,4,1],['R',1,15,4,1],['R',7,15,2,1],['R',11,15,4,1],['R',1,1,1,4],['R',1,7,1,2],['R',1,11,1,4],['R',15,1,1,4],['R',15,7,1,2],['R',15,11,1,4],['F',8,6,2.2],['R',5,9,6,5]],
    group3:[['F',3.5,5,2.2],['R',1,9,5,7],['F',8,4,2.4],['R',5,8,6,8],['F',12.5,5,2.2],['R',10,9,5,7]],
    profileFrame:[['F',8,5,3],['R',4,9,8,7],['R',1,1,4,1],['R',1,1,1,4],['R',11,1,4,1],['R',14,1,1,4],['R',1,14,4,1],['R',1,11,1,4],['R',11,14,4,1],['R',14,11,1,4]],
    idBadge:[['R',6,1,4,2],['R',2,3,12,12],['F',8,7,2.4],['R',5,10,6,3]]
  };

  /* ══════ ICONS · 역할 (roles) ══════════════════════════════════════ */
  var ROLE = {
    /* 가족 */
    roleMother:[['R',3,1,6,3],['F',6,4,2.6],['R',2,2,1,6],['R',9,2,1,6],['R',3,8,6,8],['F',12.5,9,2],['R',11,12,4,4]],
    roleFather:[['R',3,1,6,2],['F',6,4,2.6],['R',3,7,6,9],['F',12.5,9,2],['R',11,12,4,4]],
    roleGrandma:[['F',6,4,2.6],['R',4,1,4,2],['R',5,0,2,1],['R',3,8,6,8],['R',12,4,1,11],['R',11,15,3,1]],
    roleGrandpa:[['F',6,3.5,2.6],['R',4,6,4,3],['R',3,8,6,8],['R',12,4,1,11],['R',11,15,3,1]],
    roleSon:[['F',11,4,2.6],['R',8,8,6,8],['F',4.5,8,2.2],['R',2,11,5,5]],
    roleDaughter:[['F',11,4,2.6],['R',8,8,6,8],['F',4.5,8,2.2],['R',2,6,5,2],['R',1,7,1,3],['R',7,7,1,3],['R',2,11,5,5]],
    roleSibling:[['F',5,4,2.6],['R',2,8,6,8],['F',11,4,2.6],['R',8,8,6,8]],
    roleSpouse:[['F',5,6,2.6],['R',2,10,6,6],['F',11,6,2.6],['R',8,10,6,6],['F',6.5,2,1.8],['F',9.5,2,1.8],['T',5,2,6,4,'d']],
    roleRelative:[['F',3.5,5,2.2],['R',1,9,5,7],['F',8,4,2.4],['R',5,8,6,8],['F',12.5,5,2.2],['R',10,9,5,7]],
    roleGuardian:[['F',6,4,2.6],['R',3,8,6,8],['F',12.5,9,2],['R',11,12,4,4],['R',9,1,6,3],['T',9,4,6,3,'d']],
    roleParentToBe:[['F',6,4,2.6],['R',3,8,6,8],['F',8.5,12,2.6],['R',9,1,6,3],['T',9,4,6,3,'d']],
    /* 사회 */
    roleFriend:[['F',5,5,2.6],['R',2,9,6,7],['F',11,5,2.6],['R',8,9,6,7],['R',6,8,4,2]],
    roleBestFriend:[['F',5,6,2.6],['R',2,10,6,6],['F',11,6,2.6],['R',8,10,6,6],['R',6,9,4,2],['R',7,1,2,4],['R',5,2,6,2]],
    roleSenior:[['F',4.5,5,2.4],['R',1,9,7,7],['F',11.5,7,2.2],['R',9,11,5,5],['T',2,0,5,4,'u'],['R',3,3,3,2]],
    roleJunior:[['F',4.5,7,2.2],['R',2,11,5,5],['F',11.5,5,2.4],['R',8,9,7,7],['T',10,1,5,4,'d'],['R',11,0,3,2]],
    roleClassmate:[['F',5,4,2.4],['R',2,7,6,5],['F',11,4,2.4],['R',8,7,6,5],['R',2,13,12,3],['R',7,12,2,4]],
    roleRoommate:[['T',1,0,14,4,'u'],['R',1,3,14,2],['F',5,8,2.4],['R',2,11,6,5],['F',11,8,2.4],['R',8,11,6,5]],
    roleNeighbor:[['T',1,2,7,4,'u'],['R',1,5,7,10],['T',8,2,7,4,'u'],['R',8,5,7,10],['-R',3,9,3,6],['-R',10,9,3,6],['R',7,1,2,15]],
    roleColleague:[['F',5,4,2.4],['R',2,7,6,5],['F',11,4,2.4],['R',8,7,6,5],['R',5,12,6,4],['R',7,11,2,2]],
    roleTeammate:[['F',5,4,2.4],['R',2,7,6,5],['F',11,4,2.4],['R',8,7,6,5],['R',5,11,6,3],['T',5,14,6,2,'d']],
    roleRival:[['F',4,5,2.6],['R',1,9,6,7],['F',12,5,2.6],['R',9,9,6,7],['R',8,2,2,4],['R',7,6,2,3],['R',6,9,2,5]],
    rolePartner:[['F',4,4,2.4],['R',1,7,6,4],['F',12,4,2.4],['R',9,7,6,4],['R',1,11,6,2],['R',9,11,6,2],['R',5,12,6,3]],
    roleMentee:[['F',11.5,4,2.6],['R',8,8,7,8],['F',4,8,2.2],['R',1,11,6,5],['T',5,2,5,4,'u'],['R',6,5,3,2]],
    roleFanRole:[['F',8,7,2.8],['R',5,11,6,5],['R',2,7,2,5],['R',12,7,2,5],['F',5,3,2],['F',11,3,2],['T',2,3,12,4,'d']],
    roleStranger:[['F',6,5,3],['R',1,10,10,6],['R',11,3,4,2],['R',14,5,1,2],['R',12,7,3,2],['R',12,9,2,2],['R',12,12,2,2]],
    roleGuest:[['R',1,1,9,15],['-R',3,3,5,11],['R',7,8,2,2],['F',13,5,2.4],['R',11,9,5,7]],
    roleHost:[['F',5,5,2.8],['R',2,9,6,7],['T',9,5,3,6,'l'],['R',11,4,2,8],['R',13,2,2,12]],
    roleLeader:[['F',6,6,2.8],['R',3,10,6,6],['R',11,1,2,14],['R',13,2,2,5],['R',6,3,5,3],['-R',7,4,1,1],['-R',9,4,1,1]],
    roleMember:[['C',8,8,6.6],['F',8,6,2.2],['R',5,9,6,5],['-R',3,13,10,3]],
    roleVolunteer:[['F',6,6,2.8],['R',3,10,6,6],['F',11,4,2.2],['F',14,4,2.2],['T',9,5,7,5,'d']],
    roleCaptain:[['F',8,4,3],['R',4,8,8,8],['-R',4,8,2,1],['-R',10,8,2,1],['-R',10,10,2,3],['R',10,10,2,1]],
    roleNewbie:[['F',8,5,2.8],['R',4,9,8,7],['R',1,1,3,1],['R',2,0,1,3],['R',12,2,3,1],['R',13,1,1,3]],
    roleVeteran:[['F',8,5,2.8],['R',4,9,8,7],['R',5,1,6,1],['R',4,2,8,1],['R',6,3,4,1]],
    roleFollowerRole:[['F',5,5,2.6],['R',2,9,6,7],['F',11,5,2.6],['R',8,9,6,7],['-R',8,9,1,7],['R',7,6,2,2]]
  };

  Object.assign(DS.ICONS, BASIC, ROLE);

  E.ICON_CATEGORIES.unshift(
    { id:'basic', ko:'기본', en:'Basics', origin:'new',
      names:['person','personCircle','personSquare','silhouette','anonymous','avatarSlot','profileFrame','idBadge','personCheck','personRemove','personBlock','personSearch','personStar','group3','user','users','follow','heart','star','home','search','gear'] },
    { id:'role', ko:'역할', en:'Roles', origin:'new',
      names:Object.keys(ROLE).concat(['family','couple','friends','baby','mentor','teamwork','community','handshake']) }
  );

  /* ══════ AVATARS · 역할 ════════════════════════════════════════════ */
  var K=E.K, W=E.W, RD=E.RD, BU=E.BU, NV=E.NV, GR=E.GR, GD=E.GD, OR=E.OR,
      PU=E.PU, ST=E.ST, BR=E.BR, TN=E.TN, PK=E.PK, SK=E.SK, TL=E.TL;
  var GY='#4a4a52', MAR='#6d3f6b', CRM='#e8dcc0', LIM='#8ad84d', CYN='#3f8fbf';

  var hair  = function(c){ return [['R',4,2,8,2,c]]; };
  var hairL = function(c){ return [['R',4,2,8,2,c],['R',3,3,1,7,c],['R',12,3,1,7,c]]; };
  var bun   = function(c){ return [['R',4,2,8,2,c],['R',6,0,4,2,c]]; };
  var bob   = function(c){ return [['R',4,2,8,3,c],['R',3,3,1,5,c],['R',12,3,1,5,c]]; };
  var pony  = function(c){ return [['R',4,2,8,2,c],['R',12,4,2,6,c],['R',13,9,1,2,c]]; };
  var twin  = function(c){ return [['R',4,2,8,2,c],['R',2,4,2,5,c],['R',12,4,2,5,c]]; };
  var spike = function(c){ return [['R',4,2,8,2,c],['R',4,1,1,1,c],['R',6,1,1,1,c],['R',8,1,1,1,c],['R',10,1,1,1,c]]; };
  var buzz  = function(c){ return [['R',4,2,8,1,c]]; };
  var bald  = [];
  var capB  = function(a){ return [['R',4,2,8,2,K],['R',4,1,8,2,a],['R',11,3,4,1,a]]; };
  var beard = function(a){ return [['R',4,8,8,2,a],['R',5,10,6,1,a]]; };
  var glass = [['R',5,5,3,1,K],['R',8,5,3,1,K],['R',5,7,3,1,K],['R',8,7,3,1,K],['R',5,6,1,1,K],['R',7,6,1,1,K],['R',8,6,1,1,K],['R',10,6,1,1,K]];
  var blush = [['R',4,7,2,1,PK],['R',10,7,2,1,PK]];
  var collar= function(a){ return [['R',6,11,4,1,a]]; };
  var tie   = function(a){ return [['R',6,11,4,1,W],['R',7,11,2,4,a]]; };
  var apron = function(a){ return [['R',4,12,8,3,a]]; };
  var scarf = function(a){ return [['R',5,10,6,2,a],['R',10,12,2,3,a]]; };
  var badge = function(a){ return [['R',5,11,2,2,a]]; };
  var bag   = function(a){ return [['R',2,11,3,4,a],['R',4,10,1,3,a]]; };
  var kid   = function(a){ return [['R',12,11,3,5,a],['F',13.5,9,1.6,'#f2c9a0']]; };

  function jb(id, ko, en, group, cloth, hat, extra) {
    return { id:id, ko:ko, en:en, group:group, cloth:cloth, hat:hat||[], extra:extra||[] };
  }

  E.JOB_GROUPS.push(
    { id:'role-family', ko:'가족 역할', en:'Family roles' },
    { id:'role-social', ko:'사회 관계', en:'Social roles' },
    { id:'role-work',   ko:'일터 관계', en:'Workplace roles' },
    { id:'role-life',   ko:'생애 역할', en:'Life-stage roles' },
    { id:'basic',       ko:'기본',      en:'Defaults' }
  );

  E.addJobs([
    /* ── 가족 역할 ── */
    jb('mom','엄마','Mother','role-family',OR, bob('#5a3820'), collar(W).concat(kid(PK))),
    jb('dad','아빠','Father','role-family',BU, hair('#2b211b'), collar(W).concat(kid(GD))),
    jb('grandma','할머니','Grandmother','role-family',MAR, bun('#d8d2cc').concat(glass), scarf(PK)),
    jb('grandpa','할아버지','Grandfather','role-family',BR, buzz('#d8d2cc').concat(glass).concat(beard('#d8d2cc')), collar(W)),
    jb('son','아들','Son','role-family',LIM, spike('#2b211b'), collar(W)),
    jb('daughter','딸','Daughter','role-family',PK, twin('#8f4f1a').concat(blush), collar(W)),
    jb('olderBrother','형·오빠','Older brother','role-family',NV, hair('#2b211b'), badge(GD)),
    jb('olderSister','누나·언니','Older sister','role-family',MAR, hairL('#5a3820'), badge(GD)),
    jb('youngerSibling','동생','Younger sibling','role-family',CYN, hair('#8f4f1a').concat(blush), collar(W)),
    jb('aunt','이모·고모','Aunt','role-family',TL, pony('#b53a2a'), scarf(GD)),
    jb('uncle','삼촌','Uncle','role-family',TN, hair('#5c4a3f').concat(beard('#5c4a3f')), collar(W)),
    jb('cousin','사촌','Cousin','role-family',GD, hair('#c97a2e'), collar(W)),
    jb('spouseRole','배우자','Spouse','role-family',W, hairL('#2b211b'), [['R',7,11,2,2,GD],['R',6,11,4,1,W]]),
    jb('guardian','보호자','Guardian','role-family',GR, hair('#2b211b'), collar(W).concat(kid(CYN))),
    jb('inLaw','시댁·처가','In-law','role-family',ST, bun('#a8917d').concat(glass), scarf(TL)),
    jb('newborn','아기','Baby','role-family',CRM, [['R',5,1,6,2,PK],['R',4,2,8,1,PK]], blush.concat(collar(W))),
    /* ── 사회 관계 ── */
    jb('friend','친구','Friend','role-social',GD, hair('#8f4f1a'), collar(W)),
    jb('bestie','절친','Best friend','role-social',PK, pony('#e278a1').concat(blush), [['R',5,11,6,1,GD],['R',7,12,2,2,GD]]),
    jb('senior','선배','Senior (선배)','role-social',NV, hair('#2b211b'), [['R',5,11,6,1,GD],['R',5,13,6,1,GD]]),
    jb('junior','후배','Junior (후배)','role-social',CYN, spike('#5a3820'), [['R',5,11,6,1,W]]),
    jb('classmate','동기','Classmate','role-social',BU, hair('#5c4a3f'), [['R',6,11,4,1,W],['R',2,11,3,4,BR]]),
    jb('roommate','룸메이트','Roommate','role-social',TL, capB(TL), collar(W)),
    jb('neighbor','이웃','Neighbour','role-social',GR, hair('#a8917d'), apron(CRM)),
    jb('teammateRole','팀원','Teammate','role-social',RD, [['R',4,2,8,2,K],['R',3,3,10,1,W]], [['R',5,11,6,1,W],['R',7,12,2,2,W]]),
    jb('rival','라이벌','Rival','role-social',GY, spike('#b53a2a'), [['R',4,11,8,1,RD]]),
    jb('menteeRole','멘티','Mentee','role-social',LIM, hair('#c97a2e').concat(blush), collar(W)),
    jb('partnerRole','파트너','Partner','role-social',MAR, hairL('#2b211b'), tie(GD)),
    jb('fanRole','팬','Fan','role-social',PK, twin('#e278a1'), [['R',4,11,8,1,W],['R',2,10,2,2,GD],['R',12,10,2,2,GD]]),
    jb('guestRole','손님','Guest','role-social',CRM, hair('#5a3820'), [['R',6,11,4,1,W],['R',2,12,3,3,BR]]),
    jb('hostRole','주최자','Host','role-social',MAR, bun('#2b211b'), tie(RD)),
    jb('stranger','낯선 사람','Stranger','role-social',GY, [['R',3,2,10,2,GY],['R',1,4,14,1,GY]], [['R',5,5,6,3,K],['R',6,11,4,1,GY]]),
    jb('acquaintance','지인','Acquaintance','role-social',TN, hair('#5c4a3f'), collar(W)),
    /* ── 일터 관계 ── */
    jb('boss','상사','Boss','role-work','#2b211b', hair(ST), [['R',6,11,4,1,W],['R',7,11,2,4,MAR],['R',5,11,1,4,GD]]),
    jb('coworker','동료','Coworker','role-work',BU, hair('#2b211b'), tie(TL)),
    jb('intern','인턴','Intern','role-work',LIM, hair('#8f4f1a'), [['R',6,11,4,1,W],['R',4,12,3,3,W],['R',5,13,1,1,K]]),
    jb('client','고객','Client','role-work',NV, hairL('#5a3820'), [['R',6,11,4,1,W],['R',2,11,3,4,BR]]),
    jb('freelancer','프리랜서','Freelancer','role-work',OR, capB(OR), [['R',4,11,8,2,GY],['R',6,12,4,1,LIM]]),
    jb('teamLead','팀장','Team lead','role-work',TL, hair('#2b211b'), [['R',6,11,4,1,W],['R',7,11,2,4,GD],['R',4,11,2,1,GD]]),
    jb('newHire','신입','New hire','role-work',W, hair('#5c4a3f').concat(blush), [['R',6,11,4,1,K],['R',4,12,3,2,GD]]),
    jb('veteranRole','고참','Veteran','role-work',GY, hair(ST).concat(beard(ST)), [['R',5,11,6,1,W],['R',4,13,8,1,GD]]),
    jb('recruiter','채용담당','Recruiter','role-work',MAR, bun('#5a3820'), [['R',6,11,4,1,W],['R',3,12,4,3,W]]),
    jb('advisor','자문','Advisor','role-work',BR, hair('#d8d2cc').concat(glass), tie(BR)),
    /* ── 생애 역할 ── */
    jb('student','학생','Student','role-life',NV, hair('#2b211b'), [['R',6,11,4,1,W],['R',2,11,3,5,GD],['R',4,10,1,3,GD]]),
    jb('jobSeeker','취업준비생','Job seeker','role-life',GY, hair('#5c4a3f'), [['R',6,11,4,1,W],['R',7,11,2,3,NV],['R',2,12,3,3,K]]),
    jb('newlywed','신혼부부','Newlywed','role-life',W, [['R',4,2,8,2,'#2b211b'],['R',3,1,10,1,W],['R',2,2,2,4,W]], [['R',6,11,4,2,W],['R',7,12,2,1,GD]]),
    jb('expectingParent','예비 부모','Expecting parent','role-life',PK, bob('#8f4f1a').concat(blush), [['R',5,11,6,1,W],['F',8,14,2.6,PK]]),
    jb('retiree','은퇴자','Retiree','role-life',TN, buzz('#d8d2cc').concat(glass), [['R',6,11,4,1,W],['R',13,10,2,6,BR]]),
    jb('traveler','여행자','Traveller','role-life',OR, [['R',4,2,8,2,K],['R',5,1,6,2,TN],['R',1,3,14,1,TN]], [['R',2,11,4,5,BR],['R',4,10,1,3,BR]]),
    jb('hobbyist','취미인','Hobbyist','role-life',PU, hair('#4d5a8c'), [['R',4,12,3,3,W],['R',5,12,1,3,RD]]),
    jb('volunteerRole','봉사자','Volunteer','role-life',GR, capB(GR), [['R',5,11,6,1,W],['F',8,13,2,RD]]),
    jb('caregiverRole','돌봄자','Carer','role-life',TL, hairL('#5c4a3f'), collar(W).concat(kid(PK))),
    jb('petOwner','반려인','Pet owner','role-life',CYN, hair('#8f4f1a'), [['R',6,11,4,1,W],['F',13,13,2.4,'#e8a860'],['R',12,11,1,2,'#e8a860'],['R',14,11,1,2,'#e8a860']]),
    /* ── 기본 (defaults) ── */
    jb('basicShort','기본 · 숏컷','Default · short','basic',BU, hair('#2b211b'), collar(W)),
    jb('basicLong','기본 · 롱','Default · long','basic',MAR, hairL('#2b211b'), collar(W)),
    jb('basicChild','기본 · 어린이','Default · child','basic',LIM, hair('#8f4f1a').concat(blush), []),
    jb('basicElder','기본 · 노인','Default · elder','basic',ST, buzz('#d8d2cc').concat(beard('#d8d2cc')), []),
    jb('basicNeutral','기본 · 중립','Default · neutral','basic',ST, hair('#5c4a3f'), []),
    jb('basicGlasses','기본 · 안경','Default · glasses','basic',TL, hair('#2b211b').concat(glass), []),
    jb('basicHat','기본 · 모자','Default · cap','basic',OR, capB(OR), []),
    jb('basicSilhouette','기본 · 실루엣','Default · silhouette','basic',GY,
      [['R',3,2,10,9,GY],['R',3,3,10,7,GY]], [['R',3,11,10,5,GY],['R',2,12,1,4,GY],['R',13,12,1,4,GY]])
  ]);

  /* ══════ 기본 아바타 프리셋 (부품만 쓰는 무직업 조합) ══════════════ */
  E.BASIC_PRESETS = [
    { id:'plain',    ko:'기본',        en:'Plain',       spec:{ type:'human', hair:0,  acc:0, face:0,  expr:0, skin:1, hairColor:0,  cloth:1 } },
    { id:'smiling',  ko:'미소',        en:'Smiling',     spec:{ type:'human', hair:2,  acc:0, face:11, expr:1, skin:0, hairColor:1,  cloth:9 } },
    { id:'glasses',  ko:'안경',        en:'Glasses',     spec:{ type:'human', hair:5,  acc:0, face:1,  expr:0, skin:2, hairColor:0,  cloth:1 } },
    { id:'longHair', ko:'긴 머리',     en:'Long hair',   spec:{ type:'human', hair:1,  acc:0, face:0,  expr:1, skin:3, hairColor:2,  cloth:5 } },
    { id:'bunAcc',   ko:'번 + 머리띠',  en:'Bun + band',  spec:{ type:'human', hair:3,  acc:1, face:12, expr:1, skin:1, hairColor:11, cloth:9 } },
    { id:'beardMan', ko:'수염',        en:'Bearded',     spec:{ type:'human', hair:5,  acc:0, face:6,  expr:0, skin:4, hairColor:1,  cloth:11 } },
    { id:'kidFace',  ko:'어린이',      en:'Child',       spec:{ type:'human', hair:7,  acc:0, face:11, expr:2, skin:0, hairColor:3,  cloth:8 } },
    { id:'elderFace',ko:'노인',        en:'Elder',       spec:{ type:'human', hair:5,  acc:0, face:6,  expr:0, skin:6, hairColor:15, cloth:13 } },
    { id:'capPerson',ko:'모자',        en:'Capped',      spec:{ type:'human', hair:0,  acc:3, face:0,  expr:0, skin:2, hairColor:0,  cloth:0 } },
    { id:'hoodie',   ko:'후드',        en:'Hooded',      spec:{ type:'human', hair:0,  acc:14,face:3,  expr:0, skin:5, hairColor:0,  cloth:14 } },
    { id:'sleepy',   ko:'졸림',        en:'Sleepy',      spec:{ type:'human', hair:22, acc:0, face:0,  expr:7, skin:1, hairColor:0,  cloth:6 } },
    { id:'catEars',  ko:'고양이 귀',    en:'Cat ears',    spec:{ type:'human', hair:9,  acc:9, face:11, expr:1, skin:0, hairColor:11, cloth:9 } }
  ];
  E.TOTAL_ICONS = Object.keys(DS.ICONS).length;
  E.NEW_ICON_NAMES = E.NEW_ICON_NAMES.concat(Object.keys(BASIC), Object.keys(ROLE));
})(window);
