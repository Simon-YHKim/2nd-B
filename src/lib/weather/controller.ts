// A small, testable flow: adult + committed consent precede every OS/GPS/API call.
import type { CoarsePlace, WeatherLocationStatus } from "../location/weather-location";
import { EMPTY_WEATHER, WEATHER_TIMEOUT_MS, type ClockWeatherInput, type WeatherConsent, type WeatherReading } from "./model";

export interface WeatherPorts {
  enabled: boolean;
  isMinor: boolean | null;
  current(): boolean;
  locallyAllowed(): boolean;
  consent(signal: AbortSignal): Promise<WeatherConsent>;
  save(status: WeatherConsent, signal: AbortSignal): Promise<WeatherConsent>;
  permission(): Promise<WeatherLocationStatus>;
  requestPermission(): Promise<WeatherLocationStatus>;
  place(signal: AbortSignal): Promise<CoarsePlace | null>;
  weather(place: CoarsePlace, signal: AbortSignal): Promise<WeatherReading | null>;
  clear(): void;
}
export interface WeatherState extends ClockWeatherInput { busy: boolean; failed: boolean }

export function createWeatherController(ports: WeatherPorts, publish: (state: WeatherState) => void) {
  let state: WeatherState = { ...EMPTY_WEATHER, busy: false, failed: false };
  let operation: AbortController | null = null;
  let disposed = false;
  let displayExpiry: ReturnType<typeof setTimeout> | undefined;
  const eligible = () => !disposed && ports.enabled && ports.isMinor === false && ports.current();
  const emit = (patch: Partial<WeatherState>) => { state = { ...state, ...patch }; publish(state); };

  async function run(enable: boolean) {
    if (!eligible()) return;
    if (operation && !operation.signal.aborted) return;
    operation?.abort();
    const task = new AbortController();
    operation = task;
    const live = () => eligible() && !task.signal.aborted && operation === task;
    clearTimeout(displayExpiry);
    emit({ busy: true, failed: false, weather: null });
    // Location SDK calls cannot be cancelled. Abort the continuation instead:
    // a late position must never select weather after the visit has ended.
    const timer = setTimeout(() => {
      if (live()) { task.abort(); emit({ busy: false, failed: enable }); }
    }, WEATHER_TIMEOUT_MS * 3);
    try {
      let consent = await ports.consent(task.signal);
      if (!live()) return;
      if (!consent.eligible || !consent.available) { emit({ ...EMPTY_WEATHER }); return; }
      emit({ enabled: true, consent: consent.enabled && ports.locallyAllowed() });
      if (enable) {
        consent = await ports.save(consent, task.signal);
        if (!live()) return;
        if (!consent.enabled || !consent.eligible || !consent.available) throw new Error("weather_not_saved");
        emit({ consent: true });
      }
      if (!consent.enabled || !ports.locallyAllowed()) { emit({ consent: false }); ports.clear(); return; }
      const permission = enable ? await ports.requestPermission() : await ports.permission();
      if (!live() || !ports.locallyAllowed()) return;
      emit({ permission });
      if (permission !== "granted") { ports.clear(); return true; }
      const place = await ports.place(task.signal);
      if (!live() || !ports.locallyAllowed()) return;
      if (!place) return true;
      const reading = await ports.weather(place, task.signal);
      if (live() && ports.locallyAllowed()) {
        const remaining = reading ? reading.expiresAt - Date.now() : 0;
        emit({ weather: remaining > 0 ? reading!.weather : null });
        // Cache hits keep their original deadline. No background GPS or polling.
        if (remaining > 0) displayExpiry = setTimeout(() => {
          if (eligible()) emit({ weather: null });
        }, remaining);
      }
      return live();
    } catch {
      if (live()) emit({ weather: null, failed: enable });
    } finally {
      clearTimeout(timer);
      if (operation === task) { operation = null; if (!disposed) emit({ busy: false }); }
    }
  }
  return {
    activate() { disposed = false; },
    refresh: () => run(false),
    enable: () => run(true),
    cancel() { operation?.abort(); operation = null; emit({ busy: false }); },
    suspend() { operation?.abort(); operation = null; clearTimeout(displayExpiry); emit({ busy: false, weather: null }); },
    withdraw() { operation?.abort(); operation = null; clearTimeout(displayExpiry); ports.clear(); emit({ consent: false, weather: null, busy: false }); },
    dispose() { disposed = true; operation?.abort(); clearTimeout(displayExpiry); ports.clear(); },
  };
}
