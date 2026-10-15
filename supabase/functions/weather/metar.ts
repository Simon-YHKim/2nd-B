// Only public reporting-station data leaves this parser. Device locations never enter it.
// https://aviationweather.gov/data/api/ and /help/data/ define the bulk CSV and METAR codes.
export type MetarSky = 'clear' | 'partlyCloudy' | 'cloudy' | 'rain' | 'snow';
export interface MetarStation {
  id: string;
  latitude: number;
  longitude: number;
  tempC: number;
  sky: MetarSky;
  observedAt: string;
}

const MAX_ROWS = 10_000;
const MAX_CSV_CHARACTERS = 8 * 1024 * 1024;
const weatherToken = /^[+-]?(?:VC)?(?:MI|PR|BC|DR|BL|SH|TS|FZ)?(?:DZ|RA|SN|SG|IC|PL|GR|GS|UP|BR|FG|FU|VA|DU|SA|HZ|PY|PO|SQ|FC|SS|DS)+$/;

/** RFC 4180 quoted fields, including escaped quotes and embedded line breaks. */
function* csvRows(text: string): Generator<string[]> {
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let closedQuote = false;
  for (let i = 0; i <= text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === undefined) throw new Error('invalid_csv');
      if (char === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; }
        else { quoted = false; closedQuote = true; }
      } else field += char;
      continue;
    }
    if (char === ',' || char === '\n' || char === '\r' || char === undefined) {
      row.push(field);
      if (row.length > 128) throw new Error('invalid_csv');
      field = '';
      closedQuote = false;
      if (char === ',') continue;
      if (row.length > 1 || row[0] !== '') yield row;
      row = [];
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      continue;
    }
    if (closedQuote) throw new Error('invalid_csv');
    if (char === '"') {
      if (field !== '') throw new Error('invalid_csv');
      quoted = true;
    } else field += char;
  }
}

function skyCondition(raw: string, decodedWeather: string, decodedSkies: string[]): MetarSky | null {
  // Forecast trends and remarks must never replace the observed condition.
  const body = raw.split(/(?:^|\s)(?:RMK|TEMPO|BECMG|PROB(?:30|40)|FM\d{6})\b/)[0];
  const tokens = body.trim().split(/\s+/).map((token) => token.replace(/=$/, ''));
  const weather = decodedWeather.trim() || tokens.filter((token) => weatherToken.test(token)).join(' ');
  if (weather) {
    if (!weather.split(/\s+/).every((token) => weatherToken.test(token))) return null;
    if (/SN|SG|PL/.test(weather)) return 'snow';
    if (/RA|DZ/.test(weather)) return 'rain';
    if (/FG|BR/.test(weather)) return 'cloudy';
    // Unsupported phenomena (for example ash or haze) must not become clear sky.
    return null;
  }
  const skies = [...decodedSkies];
  for (const token of tokens) {
    if (/^(SKC|CLR)$/.test(token)) skies.push(token);
    const layer = /^(FEW|SCT|BKN|OVC)(?:\d{3}|\/\/\/)(?:CB|TCU)?$/.exec(token);
    if (layer) skies.push(layer[1]);
  }
  // Four repeated sky_cover columns describe successive layers. Keep the most cloud.
  if (skies.some((sky) => sky === 'OVC' || sky === 'BKN')) return 'cloudy';
  if (skies.some((sky) => sky === 'SCT' || sky === 'FEW')) return 'partlyCloudy';
  if (skies.some((sky) => sky === 'SKC' || sky === 'CLR')) return 'clear';
  // CAVOK/NSC only rule out operationally significant low cloud, not all cloud.
  return null;
}

function numeric(value: string, bound: number): number | null {
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(value)) return null;
  const number = Number(value);
  return Number.isFinite(number) && Math.abs(number) <= bound ? number : null;
}

export function parseMetarCsv(csv: string): MetarStation[] {
  if (csv.length > MAX_CSV_CHARACTERS) throw new Error('csv_too_large');
  const rows = csvRows(csv.replace(/^\uFEFF/, ''));
  const header = rows.next().value as string[] | undefined;
  if (!header) throw new Error('invalid_csv');
  const required = ['raw_text', 'station_id', 'observation_time', 'latitude', 'longitude', 'temp_c', 'wx_string'];
  const indices = new Map<string, number>();
  for (const key of required) {
    if (header.filter((column) => column === key).length !== 1) throw new Error('invalid_csv');
    indices.set(key, header.indexOf(key));
  }
  const skyIndices = header.flatMap((column, index) => column === 'sky_cover' ? [index] : []);
  if (!skyIndices.length || skyIndices.length > 4) throw new Error('invalid_csv');
  const stations = new Map<string, MetarStation>();
  let count = 0;
  for (const row of rows) {
    count += 1;
    if (count > MAX_ROWS) throw new Error('too_many_stations');
    if (row.length !== header.length) throw new Error('invalid_csv');
    const get = (key: string) => row[indices.get(key)!].trim();
    const id = get('station_id');
    const latitude = numeric(get('latitude'), 90);
    const longitude = numeric(get('longitude'), 180);
    const tempC = numeric(get('temp_c'), 100);
    const timestamp = get('observation_time');
    const time = Date.parse(timestamp);
    if (!/^[A-Z0-9]{3,8}$/.test(id) || latitude === null || longitude === null || tempC === null ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(timestamp) || !Number.isFinite(time)) continue;
    const observedAt = new Date(time).toISOString();
    if (observedAt.slice(0, 19) !== timestamp.slice(0, 19)) continue;
    const sky = skyCondition(get('raw_text'), get('wx_string'), skyIndices.map((index) => row[index].trim()));
    if (!sky) continue;
    const previous = stations.get(id);
    if (!previous || observedAt > previous.observedAt) stations.set(id, { id, latitude, longitude, tempC, sky, observedAt });
  }
  return [...stations.values()];
}
