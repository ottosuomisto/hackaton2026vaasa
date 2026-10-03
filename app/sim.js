/* Simuloitu VILPE Sense -data demokohteille.
   Tuottaa saman muotoisen datan kuin scripts/build_data.py (window.VANTAA),
   joten kaikki näkymät toimivat sellaisenaan. Siemennetty satunnaisuus →
   sama kohde näyttää aina samalta. */
(function () {
  "use strict";

  const SIM_END = "2026-09-30";
  const SIM_DAYS = 365;

  function rng(seedStr) {
    let h = 1779033703 ^ seedStr.length;
    for (let i = 0; i < seedStr.length; i++) { h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
    let a = h >>> 0;
    return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const r1 = (v) => Math.round(v * 10) / 10;
  const ah = (t, rh) => r1((216.7 * ((rh / 100) * 6.112 * Math.exp((17.62 * t) / (243.12 + t)))) / (273.15 + t));
  const serial = (rand, prefix) => prefix + Array.from({ length: 9 }, () => "0123456789ABCDEFGHJKLMNPRSTUVWXYZ"[Math.floor(rand() * 33)]).join("");
  const avg = (a) => { const v = a.filter((x) => x !== null && x !== undefined); return v.length ? v.reduce((x, y) => x + y, 0) / v.length : null; };

  function dayList(end, n) {
    const out = [];
    const e = new Date(`${end}T12:00:00Z`);
    for (let i = n - 1; i >= 0; i--) out.push(new Date(e.getTime() - i * 864e5).toISOString().slice(0, 10));
    return out;
  }

  // Kattopiirros SVG:nä rakennetyypin mukaan
  function roofSvg(type, w, h) {
    const lines = [];
    const stroke = 'stroke="#5b6670" fill="none"';
    if (type === "Aluskatteeton peltikatto" || type === "Ullakollinen yläpohja") {
      lines.push(`<rect x="40" y="40" width="${w - 80}" height="${h - 80}" ${stroke} stroke-width="3"/>`);
      lines.push(`<line x1="40" y1="${h / 2}" x2="${w - 40}" y2="${h / 2}" ${stroke} stroke-width="2"/>`);
      for (let x = 80; x < w - 40; x += 34) lines.push(`<line x1="${x}" y1="42" x2="${x}" y2="${h - 42}" stroke="#c4ccd3" stroke-width="1"/>`);
      lines.push(`<text x="${w / 2}" y="${h / 2 - 10}" font-size="18" text-anchor="middle" fill="#7a858f" font-family="Arial">HARJA</text>`);
    } else {
      lines.push(`<rect x="40" y="40" width="${w - 80}" height="${h - 80}" ${stroke} stroke-width="3"/>`);
      lines.push(`<rect x="52" y="52" width="${w - 104}" height="${h - 104}" stroke="#c4ccd3" fill="none" stroke-width="1"/>`);
      if (type === "Viherkatto") lines.push(`<rect x="${w * 0.55}" y="52" width="${w * 0.45 - 52}" height="${h - 104}" fill="#dfe8dc" stroke="#9fb39a"/><text x="${w * 0.77}" y="${h - 70}" font-size="16" text-anchor="middle" fill="#6d8268" font-family="Arial">VIHERKATTO</text>`);
      [[0.2, 0.25], [0.45, 0.7], [0.75, 0.3]].forEach(([x, y]) => lines.push(`<rect x="${w * x}" y="${h * y}" width="46" height="30" stroke="#9aa4ad" fill="none"/>`));
      [[0.12, 0.85], [0.5, 0.15], [0.88, 0.8]].forEach(([x, y]) => lines.push(`<circle cx="${w * x}" cy="${h * y}" r="9" stroke="#9aa4ad" fill="none"/>`));
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><rect width="100%" height="100%" fill="#fff"/>${lines.join("")}</svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }

  // Sijoitetaan laitteet tasaiseen ruudukkoon katon sisälle
  function gridPositions(n, rand) {
    if (!n) return [];
    const cols = Math.ceil(Math.sqrt(n * 2));
    const rows = Math.ceil(n / cols);
    const out = [];
    for (let i = 0; i < n; i++) {
      const c = i % cols;
      const r = Math.floor(i / cols);
      out.push([
        r1(((0.1 + (0.8 * (c + 0.5)) / cols) + (rand() - 0.5) * 0.02) * 1000) / 1000,
        r1(((0.14 + (0.72 * (r + 0.5)) / rows) + (rand() - 0.5) * 0.03) * 1000) / 1000,
      ]);
    }
    return out;
  }

  /**
   * cfg: { id, name, city, type, sensors, units, apartments, events?: { leak?: {sensor, from}, offline?: {sensor, days}, fanStop?: {unit, from} } }
   */
  function simulate(cfg) {
    const rand = rng(cfg.seed || cfg.id);
    const noise = (s) => (rand() - 0.5) * 2 * s;
    const days = dayList(cfg.end || SIM_END, cfg.days || SIM_DAYS);
    const n = days.length;
    const ev = cfg.events || {};

    const rain = days.map(() => rand() < 0.32);
    // Vuodenaikavaihtelu (Vaasa): heinäkuu ~+17 °C, tammikuu ~−7 °C; ulkoilma kosteinta syksyllä ja talvella
    const doy = days.map((d) => (Date.parse(`${d}T12:00:00Z`) - Date.parse(`${d.slice(0, 4)}-01-01T00:00:00Z`)) / 864e5);
    const season = (i, peakDay) => Math.cos((2 * Math.PI * (doy[i] - peakDay)) / 365);
    let weather = 0;
    const tOut = days.map((_, i) => { weather = weather * 0.7 + noise(3.2); return r1(5 + 12 * season(i, 200) + weather); });
    const rhOut = days.map((_, i) => r1(clamp(80 + 11 * season(i, 340) + (rain[i] ? 9 : 0) + noise(6), 40, 100)));

    // Vuotoanturit (RHT-2)
    const sensorPos = gridPositions(cfg.sensors, rand);
    const sensors = sensorPos.map((pos, k) => {
      const id = serial(rand, "P6");
      const base = 36 + rand() * 9;
      const tBias = noise(0.8);
      let leak = 0;
      const rh = [];
      const t = [];
      days.forEach((_, i) => {
        if (ev.offline && ev.offline.sensor === k && i >= n - ev.offline.days) { rh.push(null); t.push(null); return; }
        if (ev.leak && ev.leak.sensor === k && i >= ev.leak.from) leak = clamp(leak * 0.9 + (rain[i] ? 9 + rand() * 6 : 0), 0, 48);
        rh.push(r1(clamp(base + 9 * season(i, 225) + (rain[i] ? 1.5 : 0) + leak + noise(1.6), 15, 99)));
        t.push(r1(tOut[i] * 0.45 + 10.5 + tBias + noise(0.6) - (leak ? 1.2 : 0)));
      });
      const valid = rh.map((v, i) => [v, t[i], i]).filter(([v]) => v !== null);
      const [lv, lt, li] = valid[valid.length - 1];
      return {
        id,
        pos,
        rh,
        t,
        rhMean: r1(avg(rh)),
        rhMax: r1(Math.max(...valid.map((x) => x[0]))),
        tMin: r1(Math.min(...valid.map((x) => x[1]))),
        n: valid.length * 2,
        last: { ts: `${days[li]}T${li === n - 1 ? "08" : "19"}:${String(10 + Math.floor(rand() * 40))}:00`, t: lt, rh: lv, ah: ah(lt, lv) },
      };
    });

    // Kosteudenhallintayksiköt (MCU-2 + EC-huippuimuri)
    const unitNames = cfg.unitNames || [];
    const unitPos = gridPositions(cfg.units, rand).map(([x, y]) => [x, r1(clamp(y + 0.06, 0.12, 0.88) * 1000) / 1000]);
    const units = unitPos.map((pos, k) => {
      const name = unitNames[k] || `Huippuimuri ${k + 1}`;
      const base = 64 + rand() * 6;
      let rhState = base;
      const dd = days.map((d, i) => {
        const stopped = ev.fanStop && ev.fanStop.unit === k && i >= ev.fanStop.from;
        const tIn = r1(tOut[i] * 0.6 + 7 + noise(0.8));
        const target = base + 8 * season(i, 320) + (stopped ? 18 : 0);
        rhState = rhState * 0.7 + target * 0.3;
        const rhIn = r1(clamp(rhState + noise(2.5), 30, 99));
        const ahIn = ah(tIn, rhIn);
        const ahO = ah(tOut[i], rhOut[i]);
        // Kovalla pakkasella ohjaus pysäyttää puhaltimen (pakkassuojaus)
        const frost = tOut[i] < -10;
        const on = stopped || frost ? 0 : clamp(Math.round((ahIn > ahO ? 92 : 55) + noise(8)), 0, 100);
        const rpm = stopped ? 0 : Math.round((on / 100) * (1100 + rand() * 600));
        return { d, rpm, on, tIn, rhIn, ahIn, tOut: tOut[i], rhOut: rhOut[i], ahOut: ahO };
      });
      const months = [...new Set(days.map((d) => d.slice(0, 7)))].map((m) => {
        const rs = dd.filter((x) => x.d.startsWith(m));
        const o = { m };
        ["rpm", "on", "tIn", "rhIn", "ahIn", "tOut", "rhOut", "ahOut"].forEach((key) => { o[key] = r1(avg(rs.map((x) => x[key]))); });
        return o;
      });
      // Pisin yhtäjaksoinen seisokki
      let best = [0, null, null];
      let start = null;
      dd.forEach((x, i) => {
        if (x.rpm === 0) { start = start === null ? i : start; if (i - start + 1 > best[0]) best = [i - start + 1, dd[start].d, x.d]; } else start = null;
      });
      const humid = dd.filter((x) => x.rhIn > 85).length;
      return {
        name,
        serial: serial(rand, "N1"),
        purpose: cfg.type === "Ryömintätilainen alapohja" ? "Ryömintätilan tuuletus" : cfg.type.includes("peltikatto") || cfg.type.includes("Ullakollinen") ? "Ullakon kosteudenhallinta" : "Kattorakenteen tuuletus",
        mold: Math.round((humid * 0.0025 + rand() * 0.004) * 100000) / 100000,
        rpmLast: dd[n - 1].rpm,
        pos,
        on: Math.round(avg(dd.map((x) => x.on))),
        rpmMean: Math.round(avg(dd.filter((x) => x.rpm > 0).map((x) => x.rpm)) || 0),
        rhInMean: r1(avg(dd.map((x) => x.rhIn))),
        rhIn90: Math.round((100 * dd.filter((x) => x.rhIn > 90).length) / n),
        stopDays: best[0],
        stopFrom: best[1],
        stopTo: best[2],
        days: dd,
        months,
      };
    });

    // Kuukausikeskiarvot rakenteesta: anturisto, tai imurien sisäanturit jos antureita ei ole
    const months = [...new Set(days.map((d) => d.slice(0, 7)))];
    const networkMonthly = months.map((m) => {
      const idx = days.map((d, i) => (d.startsWith(m) ? i : -1)).filter((i) => i >= 0);
      if (sensors.length) {
        const rh = avg(sensors.flatMap((s) => idx.map((i) => s.rh[i])));
        const t = avg(sensors.flatMap((s) => idx.map((i) => s.t[i])));
        return { m, rh: r1(rh), t: r1(t), ah: ah(t, rh) };
      }
      const rs = units.flatMap((u) => idx.map((i) => u.days[i]));
      const rh = avg(rs.map((x) => x.rhIn));
      const t = avg(rs.map((x) => x.tIn));
      return { m, rh: r1(rh), t: r1(t), ah: ah(t, rh) };
    });

    const W = 1000;
    const H = 560;
    return {
      id: cfg.id,
      simulated: true,
      custom: !!cfg.custom,
      name: cfg.name,
      city: cfg.city,
      type: cfg.type,
      apartments: cfg.apartments || null,
      built: cfg.built || "",
      builtEn: cfg.builtEn || cfg.built || "",
      days,
      sensors,
      units,
      networkMonthly,
      roof: { w: W, h: H, src: roofSvg(cfg.type, W, H) },
      events: (cfg.storyEvents || []).map((e) => ({ ...e, d: e.d || days[0] })),
    };
  }

  // Kolme demotaloyhtiötä eri tuotekomboilla
  const PRESETS = [
    {
      id: "rantakatu",
      name: "As Oy Vaasan Rantakatu 12",
      city: "Vaasa",
      type: "Tasakatto",
      built: "1978, katto uusittu 2019",
      builtEn: "1978, roof renewed 2019",
      apartments: 30,
      sensors: 28,
      units: 0,
      events: { leak: { sensor: 17, from: SIM_DAYS - 34 } },
      storyEvents: [{ d: null, cls: "info", t: "Sense-vuotopaikannin (28 × RHT-2) liitetty Sense+ Careen", tEn: "Sense leak detection (28 × RHT-2) connected to Sense+ Care" }],
    },
    {
      id: "hietalahdenkatu",
      name: "As Oy Hietalahdenkatu 5",
      city: "Vaasa",
      type: "Aluskatteeton peltikatto",
      built: "1962",
      apartments: 18,
      sensors: 0,
      units: 3,
      unitNames: ["Ullakko A", "Ullakko B", "Ullakko C"],
      events: { fanStop: { unit: 1, from: SIM_DAYS - 21 } },
      storyEvents: [{ d: null, cls: "info", t: "Kosteudenhallinta (3 × MCU-2 + EC-huippuimuri) liitetty Sense+ Careen", tEn: "Humidity control (3 × MCU-2 + EC roof fan) connected to Sense+ Care" }],
    },
    {
      id: "palosaari",
      name: "As Oy Palosaaren Helmi",
      city: "Vaasa",
      type: "Viherkatto",
      built: "2024",
      apartments: 24,
      sensors: 16,
      units: 2,
      unitNames: ["Viherkatto itä", "Viherkatto länsi"],
      events: { offline: { sensor: 5, days: 4 } },
      storyEvents: [{ d: null, cls: "info", t: "Vuotoanturit (16 × RHT-2) ja 2 × MCU-2 liitetty Sense+ Careen", tEn: "Leak sensors (16 × RHT-2) and 2 × MCU-2 connected to Sense+ Care" }],
    },
  ];

  window.SenseSim = { simulate, PRESETS, SIM_DAYS };
})();
