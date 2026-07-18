// Star aliases for imported relation signals (연동 P0③, Simon 2026-07-18).
//
// KakaoTalk relation signals are PIPA-gray third-party data, so the other
// person's name is NEVER stored — each sender becomes a pseudonymous, playful
// constellation alias instead: a daily-life action prefix + a real star name,
// e.g. "새벽에 걷는 베텔게우스" / "Dawn-walking Betelgeuse" (Simon's spec:
// prefix-suffix combination, 100+ of each side, star-name suffixes to match
// the 별자리 concept).
//
// Determinism: the alias derives from subjectKeyFor(rawName) — an FNV-1a hash
// pair — so re-importing the same export maps each sender to the SAME alias
// (idempotent upserts) without ever persisting the name itself. The raw name
// goes in, a hex key comes out, and only the key + alias are kept.
//
// Pure module: no I/O, no React. Alias vocabulary is deliberately mundane and
// warm (chores, small habits, weather) — never clinical, romantic, or
// judgmental.

export interface StarAliasSuffix {
  ko: string;
  en: string;
}

// 110+ daily-life action prefixes, Korean. "…하는/…는" form so the star name
// reads as the subject: "우산을 챙기는 폴라리스".
export const STAR_ALIAS_PREFIXES_KO: readonly string[] = [
  "새벽에 걷는", "아침을 챙기는", "커피를 내리는", "라면을 끓이는", "버스를 기다리는",
  "지하철에서 조는", "책갈피를 꽂는", "메모를 쌓는", "화분에 물 주는", "이불을 개는",
  "달력에 동그라미 치는", "우산을 챙기는", "골목을 산책하는", "노래를 흥얼거리는", "사진을 정리하는",
  "엽서를 모으는", "손을 흔드는", "창문을 여는", "별을 세는", "야식을 참는",
  "알람을 미루는", "계단을 오르는", "자전거를 닦는", "장바구니를 채우는", "도시락을 싸는",
  "텀블러를 들고 다니는", "이어폰을 찾는", "충전기를 빌려주는", "맞장구를 치는", "농담을 던지는",
  "약속에 일찍 나오는", "마중 나오는", "배웅하는", "문을 잡아주는", "짐을 들어주는",
  "길을 잘 찾는", "지도를 확대하는", "메뉴를 오래 고르는", "디저트를 남겨두는", "그릇을 포개는",
  "설거지를 몰아 하는", "빨래를 널는", "양말을 짝 맞추는", "단추를 다는", "손톱을 다듬는",
  "일기를 미루는", "책을 쌓아두는", "밑줄을 긋는", "접시를 데우는", "간식을 나누는",
  "레시피를 저장하는", "냉장고를 정리하는", "전등을 갈아 끼우는", "리모컨을 찾아주는", "베개를 두드리는",
  "고양이를 구경하는", "강아지와 눈 맞추는", "새 소리를 듣는", "구름을 올려다보는", "노을을 기다리는",
  "첫눈을 반기는", "빗소리를 좋아하는", "바람을 쐬는", "손난로를 쥐여 주는", "부채질해 주는",
  "창가 자리를 고르는", "콘센트 자리를 찾는", "와이파이를 나누는", "사전을 뒤적이는", "퍼즐을 맞추는",
  "바둑돌을 놓는", "종이비행기를 접는", "연필을 깎는", "형광펜을 고르는", "스티커를 아끼는",
  "포장지를 모으는", "영수증을 정리하는", "동전을 저금하는", "가계부를 적는", "목록을 만드는",
  "지우개를 빌려주는", "필기를 보여주는", "정류장을 알려주는", "환승을 잘하는", "막차를 타는",
  "첫차를 기다리는", "산책로를 아는", "지름길을 아는", "단골집을 아는", "메뉴를 추천하는",
  "리필을 챙기는", "물을 자주 마시는", "스트레칭을 하는", "줄넘기를 하는", "공원을 도는",
  "계절을 먼저 아는", "달력을 넘기는", "시간을 잘 지키는", "안부를 먼저 묻는", "생일을 기억하는",
  "사진을 잘 찍어주는", "각도를 잡아주는", "불빛을 비춰주는", "짐칸을 양보하는", "자리를 맡아주는",
  "박수를 크게 치는", "앙코르를 외치는", "휘파람을 부는", "콧노래를 부르는", "기지개를 켜는",
  "창문에 김을 부는", "낙엽을 밟는", "눈사람을 만드는", "물수제비를 뜨는", "조약돌을 줍는",
];

// 110+ daily-life action prefixes, English. Hyphenated so the alias reads as
// one name: "Dawn-walking Betelgeuse".
export const STAR_ALIAS_PREFIXES_EN: readonly string[] = [
  "Dawn-walking", "Breakfast-keeping", "Coffee-brewing", "Noodle-simmering", "Bus-waiting",
  "Subway-dozing", "Bookmark-placing", "Memo-stacking", "Plant-watering", "Blanket-folding",
  "Calendar-circling", "Umbrella-carrying", "Alley-strolling", "Tune-humming", "Photo-sorting",
  "Postcard-collecting", "Hand-waving", "Window-opening", "Star-counting", "Snack-resisting",
  "Alarm-snoozing", "Stair-climbing", "Bike-polishing", "Basket-filling", "Lunchbox-packing",
  "Tumbler-toting", "Earbud-finding", "Charger-lending", "Nod-along", "Joke-tossing",
  "Early-arriving", "Greeting-first", "Farewell-waving", "Door-holding", "Bag-carrying",
  "Way-finding", "Map-zooming", "Menu-pondering", "Dessert-saving", "Dish-stacking",
  "Dish-postponing", "Laundry-hanging", "Sock-pairing", "Button-sewing", "Nail-tidying",
  "Diary-postponing", "Book-stacking", "Line-underlining", "Plate-warming", "Snack-sharing",
  "Recipe-saving", "Fridge-sorting", "Bulb-changing", "Remote-finding", "Pillow-fluffing",
  "Cat-watching", "Dog-greeting", "Birdsong-hearing", "Cloud-gazing", "Sunset-waiting",
  "First-snow-cheering", "Rain-listening", "Breeze-catching", "Handwarmer-sharing", "Fan-waving",
  "Window-seat-choosing", "Outlet-finding", "Wifi-sharing", "Dictionary-leafing", "Puzzle-fitting",
  "Stone-placing", "Paper-plane-folding", "Pencil-sharpening", "Highlighter-choosing", "Sticker-saving",
  "Wrapper-keeping", "Receipt-sorting", "Coin-saving", "Ledger-writing", "List-making",
  "Eraser-lending", "Notes-sharing", "Stop-announcing", "Transfer-mastering", "Last-train-catching",
  "First-train-waiting", "Trail-knowing", "Shortcut-knowing", "Regular-spot-knowing", "Menu-recommending",
  "Refill-minding", "Water-sipping", "Stretch-taking", "Rope-skipping", "Park-looping",
  "Season-noticing", "Calendar-turning", "Time-keeping", "Hello-first-saying", "Birthday-remembering",
  "Photo-taking", "Angle-finding", "Light-holding", "Rack-yielding", "Seat-saving",
  "Loud-clapping", "Encore-calling", "Whistle-blowing", "Hum-along", "Stretch-reaching",
  "Glass-fogging", "Leaf-crunching", "Snowman-building", "Stone-skipping", "Pebble-picking",
];

// 112 real star proper names (IAU + traditional), Hangul + Latin.
export const STAR_ALIAS_SUFFIXES: readonly StarAliasSuffix[] = [
  { ko: "솔", en: "Sol" }, { ko: "시리우스", en: "Sirius" }, { ko: "카노푸스", en: "Canopus" },
  { ko: "아르크투루스", en: "Arcturus" }, { ko: "베가", en: "Vega" }, { ko: "카펠라", en: "Capella" },
  { ko: "리겔", en: "Rigel" }, { ko: "프로키온", en: "Procyon" }, { ko: "베텔게우스", en: "Betelgeuse" },
  { ko: "아케르나르", en: "Achernar" }, { ko: "하다르", en: "Hadar" }, { ko: "알타이르", en: "Altair" },
  { ko: "아크룩스", en: "Acrux" }, { ko: "알데바란", en: "Aldebaran" }, { ko: "안타레스", en: "Antares" },
  { ko: "스피카", en: "Spica" }, { ko: "폴룩스", en: "Pollux" }, { ko: "포말하우트", en: "Fomalhaut" },
  { ko: "데네브", en: "Deneb" }, { ko: "미모사", en: "Mimosa" }, { ko: "레굴루스", en: "Regulus" },
  { ko: "아다라", en: "Adhara" }, { ko: "카스토르", en: "Castor" }, { ko: "가크룩스", en: "Gacrux" },
  { ko: "벨라트릭스", en: "Bellatrix" }, { ko: "엘나스", en: "Elnath" }, { ko: "미아플라시두스", en: "Miaplacidus" },
  { ko: "알닐람", en: "Alnilam" }, { ko: "알나이르", en: "Alnair" }, { ko: "알니타크", en: "Alnitak" },
  { ko: "알리오트", en: "Alioth" }, { ko: "두베", en: "Dubhe" }, { ko: "미르파크", en: "Mirfak" },
  { ko: "웨젠", en: "Wezen" }, { ko: "사르가스", en: "Sargas" }, { ko: "카우스", en: "Kaus" },
  { ko: "알카이드", en: "Alkaid" }, { ko: "멘칼리난", en: "Menkalinan" }, { ko: "아트리아", en: "Atria" },
  { ko: "알헤나", en: "Alhena" }, { ko: "피콕", en: "Peacock" }, { ko: "알파르드", en: "Alphard" },
  { ko: "하말", en: "Hamal" }, { ko: "폴라리스", en: "Polaris" }, { ko: "디프다", en: "Diphda" },
  { ko: "눈키", en: "Nunki" }, { ko: "멘카르", en: "Menkar" }, { ko: "사이프", en: "Saiph" },
  { ko: "미라크", en: "Mirach" }, { ko: "코카브", en: "Kochab" }, { ko: "라스알하게", en: "Rasalhague" },
  { ko: "알게니브", en: "Algenib" }, { ko: "알페라츠", en: "Alpheratz" }, { ko: "마르카브", en: "Markab" },
  { ko: "알골", en: "Algol" }, { ko: "알마크", en: "Almach" }, { ko: "셰다르", en: "Schedar" },
  { ko: "카프", en: "Caph" }, { ko: "루크바", en: "Ruchbah" }, { ko: "에니프", en: "Enif" },
  { ko: "셰아트", en: "Scheat" }, { ko: "알기에바", en: "Algieba" }, { ko: "데네볼라", en: "Denebola" },
  { ko: "조스마", en: "Zosma" }, { ko: "메그레즈", en: "Megrez" }, { ko: "페크다", en: "Phecda" },
  { ko: "메라크", en: "Merak" }, { ko: "미자르", en: "Mizar" }, { ko: "알코르", en: "Alcor" },
  { ko: "투반", en: "Thuban" }, { ko: "엘타닌", en: "Eltanin" }, { ko: "무프리드", en: "Muphrid" },
  { ko: "이자르", en: "Izar" }, { ko: "알페카", en: "Alphecca" }, { ko: "우누칼하이", en: "Unukalhai" },
  { ko: "사비크", en: "Sabik" }, { ko: "라스알게티", en: "Rasalgethi" }, { ko: "코르네포로스", en: "Kornephoros" },
  { ko: "셸리아크", en: "Sheliak" }, { ko: "술라파트", en: "Sulafat" }, { ko: "타라제드", en: "Tarazed" },
  { ko: "알비레오", en: "Albireo" }, { ko: "사드르", en: "Sadr" }, { ko: "지에나", en: "Gienah" },
  { ko: "알데라민", en: "Alderamin" }, { ko: "나시라", en: "Nashira" }, { ko: "사달수드", en: "Sadalsuud" },
  { ko: "사달멜리크", en: "Sadalmelik" }, { ko: "미라", en: "Mira" }, { ko: "자우라크", en: "Zaurak" },
  { ko: "쿠르사", en: "Cursa" }, { ko: "아르네브", en: "Arneb" }, { ko: "니할", en: "Nihal" },
  { ko: "무르짐", en: "Mirzam" }, { ko: "알루드라", en: "Aludra" }, { ko: "나오스", en: "Naos" },
  { ko: "수하일", en: "Suhail" }, { ko: "아비오르", en: "Avior" }, { ko: "아스피디스케", en: "Aspidiske" },
  { ko: "파크트", en: "Phact" }, { ko: "크라즈", en: "Kraz" }, { ko: "알키오네", en: "Alcyone" },
  { ko: "마이아", en: "Maia" }, { ko: "엘렉트라", en: "Electra" }, { ko: "타이게타", en: "Taygeta" },
  { ko: "메로페", en: "Merope" }, { ko: "아틀라스", en: "Atlas" }, { ko: "안카", en: "Ankaa" },
  { ko: "아카마르", en: "Acamar" }, { ko: "셰라탄", en: "Sheratan" }, { ko: "프로푸스", en: "Propus" },
  { ko: "와사트", en: "Wasat" }, { ko: "샤울라", en: "Shaula" }, { ko: "아셀라", en: "Ascella" },
  { ko: "포리마", en: "Porrima" },
];

// FNV-1a 32-bit — tiny, dependency-free, stable across platforms. Two passes
// with different offset bases give two independent indices so prefix and
// suffix don't correlate.
function fnv1a(text: string, offset: number): number {
  let hash = offset >>> 0;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

const FNV_OFFSET_A = 0x811c9dc5;
const FNV_OFFSET_B = 0x811c9dc5 ^ 0x5bd1e995;

/**
 * Pseudonymous stable key for a sender name. The RAW NAME never leaves this
 * function — callers persist only this key (as a subject:<key> tag) so a
 * re-import can find the same alias row without the app ever storing who the
 * person is.
 */
export function subjectKeyFor(rawName: string): string {
  const norm = rawName.trim();
  const a = fnv1a(norm, FNV_OFFSET_A).toString(16).padStart(8, "0");
  const b = fnv1a(norm, FNV_OFFSET_B).toString(16).padStart(8, "0");
  return `${a}${b}`;
}

/**
 * Deterministic star alias for a subject key: action prefix + star name,
 * "새벽에 걷는 베텔게우스" / "Dawn-walking Betelgeuse". `variant` shifts both
 * indices for collision probing (two different subjects landing on the same
 * combination) — same key + same variant always yields the same alias.
 */
export function starAliasFor(subjectKey: string, ko: boolean, variant = 0): string {
  const a = Number.parseInt(subjectKey.slice(0, 8), 16) >>> 0;
  const b = Number.parseInt(subjectKey.slice(8, 16), 16) >>> 0;
  const prefixes = ko ? STAR_ALIAS_PREFIXES_KO : STAR_ALIAS_PREFIXES_EN;
  const prefix = prefixes[(a + variant) % prefixes.length];
  const suffix = STAR_ALIAS_SUFFIXES[(b + variant * 7) % STAR_ALIAS_SUFFIXES.length];
  return `${prefix} ${ko ? suffix.ko : suffix.en}`;
}
