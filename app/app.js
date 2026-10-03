/* VILPE Sense+ Kuiva katto -takuu – klikattava prototyyppi (konsepti v5).
   Kohteet: VILPE Express Store Vantaa (oikea data, data.js) + simuloidut hallit (sim.js).
   Analytiikka (laitevalvonta, naapurivertailu, lämpöpoikkeamat, tuuletuksen hyöty,
   kuivuminen, riskiluokka A–E) lasketaan selaimessa samoilla säännöillä kaikille kohteille. */
(function () {
  "use strict";

  const I = window.I18N;
  const L = I.L;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const view = $("#view");

  // ---------- Apurit ----------
  const n1 = (v) => (v === null || v === undefined ? "–" : v.toLocaleString(I.locale(), { maximumFractionDigits: 1 }));
  const n0 = (v) => (v === null || v === undefined ? "–" : Math.round(v).toLocaleString(I.locale()));
  const nd = (v, d) => (v === null || v === undefined ? "–" : v.toLocaleString(I.locale(), { maximumFractionDigits: d, minimumFractionDigits: 0 }));
  const nf = (v, d) => v.toLocaleString(I.locale(), { maximumFractionDigits: d, minimumFractionDigits: d });
  const parseDay = (s) => new Date(`${s}T12:00:00`);
  const fdate = (s) => I.date(s);
  const month = (s) => I.month(s);
  const monthTick = (s, i) => i === 0 || s.endsWith("-01");
  const median = (a) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const sd = (a) => { const m = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length); };
  const avg = (a) => { const v = a.filter((x) => x !== null && x !== undefined); return v.length ? v.reduce((x, y) => x + y, 0) / v.length : null; };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const tmp = (c) => `${n1(I.temp(c))} ${I.tempUnit()}`;
  const tmpDelta = (c) => `${n1(I.tempDelta(c))} ${I.tempUnit()}`;
  const area = (m2) => `${n0(I.area(m2))} ${I.areaUnit()}`;
  const perArea = (eur) => `${I.money(I.perArea(eur), 2)}/${I.areaUnit()}`;
  const today = new Date();
  const TODAY_ISO = today.toISOString().slice(0, 10);
  const addDays = (iso, n) => new Date(parseDay(iso).getTime() + n * 864e5).toISOString().slice(0, 10);
  const plural = (n, one, many) => (n === 1 ? one : many);
  const yr = () => L("v", "yr");
  const zero = () => I.money(0);

  // Näyttönimet (data pitää suomenkieliset avaimet)
  const UNIT_EN = {
    "Hallin alapohja": "Hall crawl space", "Katto 1": "Roof 1", "Katto 2": "Roof 2", "Katto 3": "Roof 3", "Katto 4": "Roof 4",
    "Viherkatto 1": "Green roof 1", "Viherkatto 2": "Green roof 2", "Ullakko A": "Attic A", "Ullakko B": "Attic B", "Ullakko C": "Attic C",
    "Viherkatto itä": "Green roof east", "Viherkatto länsi": "Green roof west",
  };
  const TYPE_EN = {
    Tasakatto: "Flat roof", Viherkatto: "Green roof", "Ullakollinen yläpohja": "Attic roof",
    "Aluskatteeton peltikatto": "Metal roof without underlay", "Ryömintätilainen alapohja": "Crawl space",
  };
  const PURPOSE_EN = { "Kattorakenteen tuuletus": "Roof structure ventilation", "Ryömintätilan tuuletus": "Crawl space ventilation", "Ullakon kosteudenhallinta": "Attic humidity control" };
  const uName = (u) => { const n = typeof u === "string" ? u : u.name; return L(n, UNIT_EN[n] || n.replace(/^Huippuimuri/, "Roof fan")); };
  const typeLabel = (t) => L(t, TYPE_EN[t] || t);
  const purposeLabel = (p) => L(p, PURPOSE_EN[p] || p);

  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("is-visible");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.remove("is-visible"), 2800);
  }

  function lerpColor(stops, v) {
    if (v === null || v === undefined) return "#CACACA";
    if (v <= stops[0][0]) return stops[0][1];
    for (let i = 1; i < stops.length; i++) {
      if (v <= stops[i][0]) {
        const [v0, c0] = stops[i - 1];
        const [v1, c1] = stops[i];
        const t = (v - v0) / (v1 - v0);
        const a = c0.match(/\w\w/g).map((h) => parseInt(h, 16));
        const b = c1.match(/\w\w/g).map((h) => parseInt(h, 16));
        return `#${a.map((x, k) => Math.round(x + (b[k] - x) * t).toString(16).padStart(2, "0")).join("")}`;
      }
    }
    return stops[stops.length - 1][1];
  }
  // Väriasteikot lasketaan aina °C:ssa; näytössä yksikkö maaprofiilin mukaan.
  const SCALES = {
    rh: { stops: [[20, "#CFE3F2"], [45, "#4EACE8"], [68, "#1A62A9"], [80, "#FFAE00"], [92, "#E2202C"]], min: 20, max: 92 },
    t: { stops: [[-5, "#2D0396"], [5, "#4EACE8"], [15, "#9FC3DE"], [25, "#EA4840"]], min: -5, max: 25 },
  };
  const scaleCss = (s) => `linear-gradient(90deg, ${s.stops.map(([v, c]) => `${c} ${((v - s.min) / (s.max - s.min)) * 100}%`).join(", ")})`;
  const scaleLabel = (key) => (key === "rh" ? `${L("Suhteellinen kosteus", "Relative humidity")} 20…92 %` : `${L("Lämpötila", "Temperature")} ${n0(I.temp(-5))}…${n0(I.temp(25))} ${I.tempUnit()}`);

  // ---------- Hinnasto ja takuun hinnoittelu (konsepti luvut 3.3, 10 ja 11) ----------
  const PRICE_LIST = {
    leakPack: { no: "735045", eur: 580, fi: "Vuotopaikannin 10 kpl (RHT-2)", en: "Leak detector, 10 pcs (RHT-2)" },
    ccu: { no: "735044", eur: 695, fi: "Mobiilitukiasema (CCU)", en: "Mobile base station (CCU)" },
    mcuPack: { no: "735040", eur: 1115, fi: "Sense-paketti (MCU-2 + 2 anturia)", en: "Sense package (MCU-2 + 2 sensors)" },
    extraSensor: { no: "735041", eur: 181.5, fi: "Lisäanturi (kosteudenhallinta)", en: "Extra sensor (humidity control)" },
    fan: { no: "741982", eur: 522, fi: "ECo Sense -huippuimuri", en: "ECo Sense roof fan" },
  };
  // Laitteisto hinnaston mukaan: anturit 10 kpl paketteina, yksi tukiasema per 200 anturia / 50 MCU-2
  function hardware(sensors, units, m2) {
    const packs = Math.ceil(sensors / 10);
    const ccus = sensors + units ? Math.max(1, Math.ceil(sensors / 200), Math.ceil(units / 50)) : 0;
    const list = packs * PRICE_LIST.leakPack.eur + ccus * PRICE_LIST.ccu.eur + units * (PRICE_LIST.mcuPack.eur + PRICE_LIST.fan.eur);
    const install = Math.max(1000, m2 * 0.4); // asennus [H]
    return { packs, ccus, list, install, total: list + install };
  }
  // Takuumaksu riskiluokan mukaan, €/m²/v [H]. D vaatii korjaukset ennen takuuta, E ei kelpaa.
  const CLASS_PRICE = { A: 1.2, B: 1.5, C: 1.8, D: 2.0, E: null };
  // Maksun jako 1,5 €/m²/v -esimerkissä; muilla hinnoilla samassa suhteessa
  const SPLIT = [
    { key: "hw", eur: 0.5, fi: "Laitteisto palveluna (VILPE)", en: "Hardware as a service (VILPE)", color: "#01273E" },
    { key: "svc", eur: 0.4, fi: "Analytiikka, alusta, vuosipassi (VILPE)", en: "Analytics, platform, annual passport (VILPE)", color: "#1A62A9" },
    { key: "con", eur: 0.35, fi: "Vuositarkastus ja ennakkohuolto (urakoitsija)", en: "Annual inspection and preventive care (contractor)", color: "#E3530F" },
    { key: "fund", eur: 0.25, fi: "Korjausrahasto", en: "Repair fund", color: "#3ADB76" },
  ];
  const splitOf = (price) => SPLIT.map((s) => ({ ...s, value: (s.eur / 1.5) * price }));
  const REPAIR_CAP = 10000; // korjausten enimmäismäärä €/kohde/v [H]

  // ---------- Tila (demon kulku) ----------
  const STORE = "vilpe-senseplus-demo-v5";
  const fresh = () => ({ findings: {}, consent: {}, orders: 0, removed: [], custom: [], current: "vantaa" });
  let state = fresh();
  try { state = Object.assign(fresh(), JSON.parse(localStorage.getItem(STORE)) || {}); } catch (e) { /* esim. yksityinen ikkuna */ }
  const save = () => { try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) { /* ohitetaan */ } };

  // ---------- Kirjautuminen (demotunnus, ei oikea tietoturva) ----------
  const AUTH_KEY = "vilpe-senseplus-session";
  const DEMO_USER = "VilpeDemo";
  const DEMO_PASS = "VilpeDemo";
  let session = null;
  try { session = sessionStorage.getItem(AUTH_KEY); } catch (e) { /* ohitetaan */ }
  const loggedIn = () => session === DEMO_USER;

  // ---------- Kohteet ----------
  const V = window.VANTAA;
  const VANTAA = {
    ...V,
    id: "vantaa",
    real: true,
    pilot: true,
    name: V.site.name,
    city: "Vantaa",
    type: "Liikekiinteistö · tasa- ja viherkatto",
    typeEn: "Commercial · flat and green roof",
    structureFi: V.site.structure,
    structureEn: "Concrete · flat roof + green roof + crawl space",
    m2: 1000,
    contractStart: TODAY_ISO,
    roof: { ...V.roof, src: "assets/roof.jpg" },
  };
  const siteType = (s) => (s.typeEn ? L(s.type, s.typeEn) : typeLabel(s.type));
  const siteStructure = (s) => (s.structureFi ? L(s.structureFi, s.structureEn) : `${typeLabel(s.type)}${s.built ? ` · ${L(s.built, s.builtEn)}` : ""}`);
  const siteCache = new Map([["vantaa", VANTAA]]);
  const siteFor = (cfg) => {
    if (!siteCache.has(cfg.id)) {
      const s = window.SenseSim.simulate(cfg);
      s.contractStart = cfg.custom ? TODAY_ISO : s.days[0];
      siteCache.set(cfg.id, s);
    }
    return siteCache.get(cfg.id);
  };
  function allSites() {
    const list = [VANTAA, ...window.SenseSim.PRESETS.map(siteFor), ...state.custom.map(siteFor)];
    return list.filter((s) => !state.removed.includes(s.id));
  }
  function currentSite() {
    const list = allSites();
    return list.find((s) => s.id === state.current) || list[0] || null;
  }

  // ---------- Analytiikkamoottori (konsepti luku 15.3) ----------
  const analysisCache = new Map();
  function analyze(site) {
    if (analysisCache.has(site.id)) return analysisCache.get(site.id);
    const days = site.days;
    const lastIdx = days.length - 1;
    const units = site.units;
    const sensors = site.sensors;

    // Ulkoilma vuorokausittain: simuloiduilla oma sarja, Vantaalla MCU-2-ulkoanturien keskiarvo
    const outdoor = site.outdoor || (() => {
      const byDay = units.map((u) => Object.fromEntries(u.days.map((d) => [d.d, d])));
      return {
        t: days.map((d) => avg(byDay.map((m) => (m[d] ? m[d].tOut : null)))),
        ah: days.map((d) => avg(byDay.map((m) => (m[d] ? m[d].ahOut : null)))),
      };
    })();

    // Poikkeava anturi: RH > 6 lähimmän naapurin mediaani + 3σ (väh. 10 %-yks.)
    sensors.forEach((s) => {
      s.neighbors = sensors
        .filter((o) => o !== s)
        .map((o) => [o, Math.hypot((o.pos[0] - s.pos[0]) * site.roof.w, (o.pos[1] - s.pos[1]) * site.roof.h)])
        .sort((a, b) => a[1] - b[1])
        .slice(0, 6)
        .map(([o]) => o);
      s.nbMedian = days.map((_, i) => { const v = s.neighbors.map((o) => o.rh[i]).filter((x) => x !== null); return v.length ? median(v) : null; });
      let rhDays = 0;
      days.forEach((_, i) => {
        const rhN = s.neighbors.map((o) => o.rh[i]).filter((x) => x !== null);
        if (s.rh[i] !== null && rhN.length >= 3 && s.rh[i] - median(rhN) > Math.max(3 * sd(rhN), 10)) rhDays++;
      });
      s.anomalyDays = rhDays;
    });
    const anomalyMin = Math.max(5, Math.round(days.length * 0.068));
    const anomalies = sensors.filter((s) => s.anomalyDays >= anomalyMin).sort((a, b) => b.anomalyDays - a.anomalyDays);
    const others = sensors.filter((s) => !anomalies.includes(s));

    // Lämpöpoikkeama: talvella T_anturi = a + b · T_ulko; poikkeama, jos b > mediaani + 2σ tai anturi selvästi muita kylmempi
    const winter = days.map((d, i) => [d, i]).filter(([d]) => /-(12|01|02)-/.test(d)).map(([, i]) => i);
    const fits = [];
    sensors.forEach((s) => {
      const pts = winter.filter((i) => s.t[i] !== null && outdoor.t[i] !== null).map((i) => [outdoor.t[i], s.t[i]]);
      if (pts.length < 30) return;
      const mx = avg(pts.map((p) => p[0]));
      const my = avg(pts.map((p) => p[1]));
      const b = pts.reduce((a, p) => a + (p[0] - mx) * (p[1] - my), 0) / pts.reduce((a, p) => a + (p[0] - mx) ** 2, 0);
      s.coupling = b;
      fits.push({ s, b, mean: my, n: pts.length });
    });
    let thermal = [];
    let thermalStats = null;
    if (fits.length >= 5) {
      const mb = median(fits.map((f) => f.b));
      const sb = sd(fits.map((f) => f.b));
      const mm = median(fits.map((f) => f.mean));
      thermalStats = { median: mb, sd: sb, meanT: mm, n: Math.round(median(fits.map((f) => f.n))) };
      thermal = fits
        .filter((f) => (f.b > mb + 2 * sb && f.b - mb > 0.1) || f.mean < mm - 2)
        .map((f) => ({ ...f, kind: f.b > mb + 2 * sb && f.b - mb > 0.1 ? "coupling" : "cold" }))
        .sort((a, b) => b.b - a.b);
    }

    // Anturi offline: ei mittausta > 36 h
    const newest = Math.max(...sensors.map((s) => new Date(s.last.ts).getTime()), 0);
    const offline = sensors.filter((s) => newest - new Date(s.last.ts).getTime() > 36 * 3600e3).map((s) => {
      s.offlineDays = Math.max(1, Math.round((newest - new Date(s.last.ts).getTime()) / 864e5));
      return s;
    });

    // Puhallin seis: rpm = 0 > 48 h ja tuuletus kannattaisi (pakkasjaksot eivät ole vika)
    const stopped = units.filter((u) => {
      if (!u.stopFrom || u.stopDays < 2) return false;
      const inStop = u.days.filter((d) => d.d >= u.stopFrom && d.d <= u.stopTo && d.rpm === 0);
      u.warmStopDays = inStop.filter((d) => d.tOut === null || d.tOut > -5).length;
      return u.warmStopDays >= 3;
    });
    stopped.forEach((u) => {
      const inStop = u.days.filter((d) => d.d >= u.stopFrom && d.d <= u.stopTo && d.rpm === 0);
      u.ventLost = inStop.filter((d) => d.ahIn !== null && d.ahOut !== null && d.ahIn > d.ahOut).length;
      const stopMonths = u.months.filter((m) => m.m >= u.stopFrom.slice(0, 7) && m.m <= u.stopTo.slice(0, 7));
      u.stopPeak = Math.max(...stopMonths.map((m) => m.rhIn).filter((x) => x !== null));
      u.alertDay = addDays(u.stopFrom, 2);
      u.ongoing = u.stopTo === days[lastIdx];
    });

    // Tuuletuksen hyöty: osuus käyntitunneista, joina AH_sisä > AH_ulko.
    // Tarkistus, jos kesällä < 50 % ja rakenne on silti märkä (RH > 95 % yli puolet ajasta).
    units.forEach((u) => {
      const ys = Object.keys(u.summer || {}).filter((y) => u.summer[y].hOn > 100).sort();
      u.ventYears = ys.map((y) => ({ y, benefit: 100 * (1 - u.summer[y].hWet / u.summer[y].hOn), wet: 100 * (u.summer[y].hWet / u.summer[y].hOn), rh95: u.summer[y].rh95, dAH: u.summer[y].dAH }));
      u.ventFlag = !stopped.includes(u) && u.ventYears.length > 0 && u.ventYears.every((v) => v.benefit < 50 && v.rh95 > 50);
      // Kuivuminen valmis: Δ(AH_sisä − AH_ulko) samana vuodenaikana vuodesta toiseen ≈ 0
      const allYears = Object.keys(u.summer || {}).sort();
      u.dryDelta = allYears.length >= 2 ? u.summer[allYears[allYears.length - 1]].dAH - u.summer[allYears[0]].dAH : null;
    });
    const ventFlagged = units.filter((u) => u.ventFlag);

    // Kuivuminen (vuotoanturit): ensimmäiset vs. viimeiset 11 vrk, kun jakso kattaa vuoden → sama vuodenaika
    let drying = null;
    if (sensors.length && days.length >= 330) {
      const win = (from, to) => ({ ah: avg(sensors.flatMap((s) => s.ah.slice(from, to))), out: avg(outdoor.ah.slice(from, to)) });
      const a = win(0, 11);
      const b = win(days.length - 11, days.length);
      if (a.ah !== null && a.out !== null && b.ah !== null && b.out !== null) {
        drying = { a, b, dIn: b.ah - a.ah, dOut: b.out - a.out };
        drying.gap = drying.dIn - drying.dOut;
      }
    }

    const molds = units.map((u) => u.mold);
    const maxMold = molds.length ? Math.max(...molds) : null;
    const riskUnit = units.length ? units.reduce((a, b) => (b.mold > a.mold ? b : a)) : null;
    const months = site.networkMonthly.map((m) => m.m);
    const outdoorMonthly = months.map((m) => avg(days.map((d, i) => (d.startsWith(m) ? outdoor.ah[i] : null))));

    // Aika yli RH-rajan: vuotoanturien vrk-keskiarvot > 80 %, ilman antureita MCU-2:n rakenne-RH > 90 %
    let overShare;
    if (sensors.length) {
      let over = 0;
      let all = 0;
      sensors.forEach((s) => s.rh.forEach((v) => { if (v !== null) { all++; if (v > 80) over++; } }));
      overShare = (100 * over) / all;
    } else {
      overShare = avg(units.map((u) => u.rhIn90));
    }
    const sensorDays = sensors.reduce((a, s) => a + s.rh.filter((x) => x !== null).length, 0);
    const result = {
      days, lastIdx, units, sensors, outdoor, months, outdoorMonthly,
      unitBy: Object.fromEntries(units.map((u) => [u.name, u])),
      sensorBy: Object.fromEntries(sensors.map((s) => [s.id, s])),
      anomalies, offline, stopped, thermal, thermalStats, ventFlagged, drying, maxMold, riskUnit,
      othersRhMax: others.length ? Math.max(...others.map((s) => s.rhMax)) : null,
      overShare,
      fanUptime: units.length ? avg(units.map((u) => u.on)) : null,
      sensorAvailability: sensors.length ? (100 * sensorDays) / (sensors.length * days.length) : null,
      fullYear: days.length >= 330,
    };
    analysisCache.set(site.id, result);
    return result;
  }

  const siteFindings = (site) => (state.findings[site.id] = state.findings[site.id] || {});
  const fState = (site, id) => siteFindings(site)[id] || { status: "open" };

  // Havainnot: kind = device | sensor | vent | thermal | info. cost = korjausarvio € korjausrahastosta [H].
  function findings(site) {
    const A = analyze(site);
    const list = [];
    A.stopped.forEach((u) => {
      const n = uName(u);
      list.push({
        id: `fan-${u.serial}`,
        kind: "device",
        level: "alert",
        cap: true,
        weight: 7,
        cost: 400,
        title: L(`${n}: puhallin ei ole käynyt ${n0(u.stopDays)} vrk`, `${n}: fan has not run for ${n0(u.stopDays)} days`),
        text: u.ongoing
          ? L(`Puhallin on ollut pysähdyksissä ${fdate(u.stopFrom)} lähtien. Rakenteen kosteus on noussut ${n1(u.stopPeak)} %:iin (kk-ka.).`, `The fan has been stopped since ${fdate(u.stopFrom)}. Structural humidity has risen to ${n1(u.stopPeak)} % (monthly mean).`)
          : L(`Puhallin oli pysähdyksissä ${fdate(u.stopFrom)}–${fdate(u.stopTo)}${u.on < 50 ? `, eikä se ole sen jälkeenkään toiminut normaalisti (käy ${n0(u.on)} % ajasta)` : ""}. Rakenteen kosteus nousi seisokin aikana ${n1(u.stopPeak)} %:iin (kk-ka.). Muut imurit kävivät ~90 % ajasta.`,
            `The fan was stopped ${fdate(u.stopFrom)}–${fdate(u.stopTo)}${u.on < 50 ? ` and has not worked normally since (runs ${n0(u.on)} % of the time)` : ""}. Structural humidity rose to ${n1(u.stopPeak)} % (monthly mean) during the stop. The other fans ran ~90 % of the time.`),
        evidence: L(`Löydös 1 · Sääntö: rpm = 0 yli 48 h (pakkaspäiviä alle ${tmp(-5)} ei lasketa) ja sisä-AH > ulko-AH → tuuletus olisi kannattanut ${u.ventLost} päivänä. Takuussa havainto 48 h:ssa: ${fdate(u.alertDay)}.`,
          `Finding 1 · Rule: rpm = 0 for over 48 h (frost days below ${tmp(-5)} excluded) and indoor AH > outdoor AH → ventilation would have helped on ${u.ventLost} days. Under the guarantee it is caught within 48 h: ${fdate(u.alertDay)}.`),
        passOpen: L(`1 kosteudenhallintayksikkö (${n}) ei toiminut ${n0(u.stopDays)} vrk`, `1 humidity control unit (${n}) out of action for ${n0(u.stopDays)} days`),
        passDone: L(`${n}: puhallin seis ${n0(u.stopDays)} vrk – korjattu takuun puitteissa`, `${n}: fan stopped ${n0(u.stopDays)} days – fixed under the guarantee`),
        action: L("Tilaa huolto", "Order service"),
        target: { type: "unit", name: u.name },
        orderText: L(`Huippuimurin ${n} (${u.serial}) puhallin ei käy. Laite on ollut pysähdyksissä ${fdate(u.stopFrom)}${u.ongoing ? " lähtien" : `–${fdate(u.stopTo)}`}. Tarkistakaa puhallin, kytkennät ja MCU-2-ohjausyksikön asetukset. Vaihto tarvittaessa (ECo Sense ${I.money(PRICE_LIST.fan.eur)}).`,
          `The fan of roof fan unit ${n} (${u.serial}) is not running. It has been stopped ${u.ongoing ? `since ${fdate(u.stopFrom)}` : `${fdate(u.stopFrom)}–${fdate(u.stopTo)}`}. Please check the fan, wiring and MCU-2 control unit settings. Replace if needed (ECo Sense ${I.money(PRICE_LIST.fan.eur)}).`),
      });
    });
    A.offline.forEach((s) => {
      list.push({
        id: `offline-${s.id}`,
        kind: "device",
        level: "warn",
        cap: true,
        weight: 4,
        cost: 200,
        title: L(`Anturi ${s.id} ei ole lähettänyt dataa ${s.offlineDays} vrk`, `Sensor ${s.id} has not reported for ${s.offlineDays} ${plural(s.offlineDays, "day", "days")}`),
        text: L(`Viimeisin mittaus ${fdate(s.last.ts)}. Anturi lähettää normaalisti kaksi kertaa vuorokaudessa, joten tämä katon alue on nyt valvonnan ulkopuolella.`, `Last reading ${fdate(s.last.ts)}. The sensor normally reports twice a day, so this part of the roof is currently unmonitored.`),
        evidence: L("Sääntö: ei mittausta yli 36 h. Todennäköinen syy: yhteyskatko tukiasemaan tai anturivika (akku ~15 v).", "Rule: no reading for over 36 h. Likely cause: lost connection to the base station or a sensor fault (battery ~15 yrs)."),
        passOpen: L(`1 anturi (${s.id}) ilman yhteyttä ${s.offlineDays} vrk`, `1 sensor (${s.id}) offline for ${s.offlineDays} days`),
        passDone: L(`Anturi ${s.id}: yhteys palautettu`, `Sensor ${s.id}: connection restored`),
        action: L("Tilaa huolto", "Order service"),
        target: { type: "sensor", id: s.id, day: s.last.ts.slice(0, 10) },
        orderText: L(`Vuotoanturi ${s.id} ei ole lähettänyt mittauksia ${fdate(s.last.ts)} jälkeen. Tarkistakaa anturi ja yhteys tukiasemaan; vaihto tarvittaessa (${I.money(PRICE_LIST.leakPack.eur / 10)}/anturi). Sijainti kartalla liitteenä.`, `Leak sensor ${s.id} has not reported since ${fdate(s.last.ts)}. Please check the sensor and its base-station link; replace if needed (${I.money(PRICE_LIST.leakPack.eur / 10)} per sensor). Location on the map attached.`),
      });
    });
    A.anomalies.forEach((s) => {
      const rhMaxDay = A.days[s.rh.indexOf(Math.max(...s.rh.filter((x) => x !== null)))];
      const cold = A.thermal.some((t) => t.s === s && t.kind === "cold");
      list.push({
        id: `sensor-${s.id}`,
        kind: "sensor",
        level: "warn",
        cap: !cold,
        weight: cold ? 3 : 6,
        cost: cold ? 300 : 2500,
        title: L(`Anturi ${s.id}: kosteus poikkeaa naapureista`, `Sensor ${s.id}: humidity deviates from neighbours`),
        text: cold
          ? L(`RH nousi ${n1(s.rhMax)} %:iin (muiden maksimi ${n1(A.othersRhMax)} %). Sama anturi on talvella muita kylmempi → todennäköisesti reuna-alue tai kylmäsilta, jossa kosteus tiivistyy.`, `RH rose to ${n1(s.rhMax)} % (others' maximum ${n1(A.othersRhMax)} %). The same sensor is colder than the rest in winter → likely an edge or thermal bridge where moisture condenses.`)
          : L(`RH nousi ${n1(s.rhMax)} %:iin (muiden maksimi ${n1(A.othersRhMax)} %). Kosteus nousee sateiden jälkeen vain tällä alueella → todennäköinen vuoto vedeneristeessä tai läpiviennissä. Aikainen paikannus pitää korjauksen pienenä.`, `RH rose to ${n1(s.rhMax)} % (others' maximum ${n1(A.othersRhMax)} %). Humidity rises after rain only in this area → a likely leak in the waterproofing or a penetration. Early location keeps the repair small.`),
        evidence: L(`Sääntö: RH > naapurien mediaani + 3σ. Poikkeama ${s.anomalyDays} päivänä, kostein ${fdate(rhMaxDay)}.`, `Rule: RH > neighbours' median + 3σ. Deviation on ${s.anomalyDays} days, wettest ${fdate(rhMaxDay)}.`),
        passOpen: L(`1 kosteuspoikkeama (anturi ${s.id})`, `1 humidity anomaly (sensor ${s.id})`),
        passDone: L(`Kosteuspoikkeama (anturi ${s.id}) tarkastettu`, `Humidity anomaly (sensor ${s.id}) inspected`),
        action: L("Tilaa tarkastus", "Order inspection"),
        target: { type: "sensor", id: s.id, day: rhMaxDay },
        orderText: L(`Vuotoanturi ${s.id} poikkeaa naapuriantureistaan (max ${n1(s.rhMax)} % RH). Paikantakaa ja korjatkaa: vedeneriste, läpiviennit, reuna-alueet. Sijainti kartalla liitteenä.`, `Leak sensor ${s.id} deviates from neighbouring sensors (max ${n1(s.rhMax)} % RH). Please locate and fix: waterproofing, penetrations, edges. Location on the map attached.`),
      });
    });
    A.ventFlagged.forEach((u) => {
      const n = uName(u);
      const ys = u.ventYears.map((v) => `${v.y}: ${n0(v.wet)} %`).join(", ");
      const rh = u.ventYears.map((v) => `${v.y}: ${n0(v.rh95)} %`).join(", ");
      list.push({
        id: `vent-${u.serial}`,
        kind: "vent",
        level: "warn",
        weight: 3,
        cost: 150,
        title: L(`${n}: tuuletuksen hyöty vaihtelee vuodenajan mukaan`, `${n}: ventilation benefit varies with the season`),
        text: L(`Kesällä (18.6.–10.9.) ulkoilma oli kosteampaa kuin rakenne ${ys} käyntitunneista, ja RH > 95 % ${rh} ajasta. Talvella tuuletus kuivattaa tehokkaasti. Ohjaus moduloi (~${n0(u.rpmDry)} rpm kuivatuksen ollessa mahdollista, ~${n0(u.rpmWet)} rpm ulkoilman ollessa kosteampaa); minimikierroksille voi olla syy. Homeindeksi ${n1(u.mold)} (raja 2,5).`,
          `In summer (18 Jun–10 Sep) outdoor air was wetter than the structure for ${ys} of running hours, and RH > 95 % for ${rh} of the time. In winter ventilation dries effectively. The control modulates (~${n0(u.rpmDry)} rpm when drying is possible, ~${n0(u.rpmWet)} rpm when outdoor air is wetter); there may be a reason for minimum speed. Mould index ${n1(u.mold)} (limit 2.5).`),
        evidence: L("Löydös 2 · Sääntö: tuuletuksen hyöty = käyntitunnit, joina AH_sisä > AH_ulko; alle 50 % ja rakenne märkä → kesäohjauksen tarkistus. Uutta tietoa myös VILPEn tuotekehitykselle.", "Finding 2 · Rule: ventilation benefit = running hours with AH_in > AH_out; below 50 % while the structure stays wet → review summer control. New insight for VILPE product development too."),
        passOpen: L(`${n}: RH > 95 % yli puolet kesästä, homeindeksi ${n1(u.mold)} → tuuletuksen kesäohjaus tarkistetaan`, `${n}: RH > 95 % for over half of summer, mould index ${n1(u.mold)} → summer ventilation control to be reviewed`),
        passDone: L(`${n}: tuuletuksen kesäohjaus tarkistettu`, `${n}: summer ventilation control reviewed`),
        action: L("Tilaa ohjauksen tarkistus", "Order control review"),
        target: { type: "unit", name: u.name },
        orderText: L(`Huippuimurin ${n} (${u.serial}) kesäohjaus: ulkoilma on kesällä usein kosteampaa kuin rakenne. Tarkistakaa MCU-2:n ohjausasetukset (minimikierrokset, alipaine) yhdessä VILPEn kanssa.`, `Summer control of roof fan ${n} (${u.serial}): outdoor air is often wetter than the structure in summer. Please review the MCU-2 control settings (minimum speed, negative pressure) together with VILPE.`),
      });
    });
    if (A.thermal.length) {
      const coupling = A.thermal.filter((t) => t.kind === "coupling");
      const cold = A.thermal.filter((t) => t.kind === "cold");
      const st = A.thermalStats;
      const cTxt = coupling.map((t) => `${t.s.id} ${nf(t.b, 2)}`).join(L(" ja ", " and "));
      const coldFi = cold.map((t) => `${t.s.id} on koko talven muita kylmempi (ka. ${tmp(t.mean)} vs. ~${tmp(st.meanT)})`).join(", ");
      const coldEn = cold.map((t) => `${t.s.id} is colder than the rest all winter (mean ${tmp(t.mean)} vs ~${tmp(st.meanT)})`).join(", ");
      list.push({
        id: "thermal",
        kind: "thermal",
        level: "warn",
        weight: 1.5 * A.thermal.length,
        cost: 0,
        title: L(`${A.thermal.length} lämpöpoikkeamaa eristeessä`, `${A.thermal.length} thermal anomalies in the insulation`),
        text: L(`Talvella (12–2) anturin lämpötila seurasi ulkolämpötilaa kulmakertoimella, jonka mediaani on ${nf(st.median, 2)} (σ ${nf(st.sd, 2)}). ${coupling.length ? `${cTxt} ylittävät rajan mediaani + 2σ. ` : ""}${cold.length ? `${coldFi} → reuna tai kylmäsilta. ` : ""}Arvo on kondenssiriskin paljastamisessa.`,
          `In winter (Dec–Feb) sensor temperature tracked outdoor temperature with a median slope of ${nf(st.median, 2)} (σ ${nf(st.sd, 2)}). ${coupling.length ? `${cTxt} exceed the median + 2σ limit. ` : ""}${cold.length ? `${coldEn} → edge or thermal bridge. ` : ""}The value lies in revealing condensation risk.`),
        evidence: L(`Löydös 4 · Sääntö: T_anturi = a + b · T_ulko (n ≈ ${st.n} vrk/anturi); b > mediaani + 2σ tai anturi > ${tmpDelta(2)} muita kylmempi.`, `Finding 4 · Rule: T_sensor = a + b · T_out (n ≈ ${st.n} days/sensor); b > median + 2σ or sensor > ${tmpDelta(2)} colder than the rest.`),
        passOpen: L(`${coupling.length} lämpöpoikkeamaa${cold.length ? ` + ${cold.length} kylmä reuna-alue` : ""} → vuositarkastukseen`, `${coupling.length} thermal anomalies${cold.length ? ` + ${cold.length} cold edge area` : ""} → annual inspection`),
        passDone: L("Lämpöpoikkeamat tarkastettu vuositarkastuksessa", "Thermal anomalies checked in the annual inspection"),
        action: L("Lisää vuositarkastukseen", "Add to annual inspection"),
        target: { type: "sensor", id: A.thermal[0].s.id, day: A.days.find((d) => /-01-15$/.test(d)) || A.days[0] },
        orderText: L(`Vuositarkastuksen kohteet: ${A.thermal.map((t) => t.s.id).join(", ")}. Tarkistakaa eristeen jatkuvuus, reuna-alueet ja mahdolliset kylmäsillat. Sijainnit kartalla liitteenä.`, `Annual inspection targets: ${A.thermal.map((t) => t.s.id).join(", ")}. Please check insulation continuity, edges and possible thermal bridges. Locations on the map attached.`),
      });
    }
    if (A.riskUnit && A.riskUnit.mold > 0.3 && !A.ventFlagged.includes(A.riskUnit)) {
      const u = A.riskUnit;
      list.push({
        id: "risk-unit",
        kind: "info",
        level: "info",
        title: L(`${uName(u)} on kohteen riskialttein osa`, `${uName(u)} is the riskiest part of the site`),
        text: L(`Homeindeksi ${n1(u.mold)} (hälytysraja 2,5). Rakenteen RH yli 90 % ${n0(u.rhIn90)} % ajasta.`, `Mould index ${n1(u.mold)} (alert limit 2.5). Structural RH above 90 % for ${n0(u.rhIn90)} % of the time.`),
        evidence: L("Löydös 5 · Seurannassa; vaikuttaa riskiluokkaan.", "Finding 5 · Being monitored; affects the risk class."),
      });
    }
    // Löydös 3: kuivuminen tasapainoon
    const dryUnits = A.units.filter((u) => u.dryDelta !== null);
    if (A.drying || dryUnits.length) {
      const d = A.drying;
      const wetter = dryUnits.filter((u) => u.dryDelta > 0.3);
      list.push({
        id: "drying",
        kind: "info",
        level: "ok",
        title: L("Katon eriste on kuivunut tasapainoon", "The roof insulation has dried to equilibrium"),
        text: [
          d ? L(`Sama vuodenaika eri vuosina: vuotoanturien AH ${nf(d.a.ah, 2)} → ${nf(d.b.ah, 2)} g/m³ (${nf(d.dIn, 2)}), ulkoilman ${nf(d.a.out, 2)} → ${nf(d.b.out, 2)} g/m³ (${nf(d.dOut, 2)}). Muutos seuraa ulkoilmaa (ero ${nf(Math.abs(d.gap), 2)} g/m³).`,
            `Same season in different years: leak-sensor AH ${nf(d.a.ah, 2)} → ${nf(d.b.ah, 2)} g/m³ (${nf(d.dIn, 2)}), outdoor ${nf(d.a.out, 2)} → ${nf(d.b.out, 2)} g/m³ (${nf(d.dOut, 2)}). The change follows outdoor air (gap ${nf(Math.abs(d.gap), 2)} g/m³).`) : "",
          dryUnits.length ? L(`MCU-2-kesäjaksoissa (sisä-AH − ulko-AH) katto-osat ovat tasapainossa${wetter.length ? `; kosteammaksi muuttui ${wetter.map((u) => `${uName(u).toLowerCase()} (+${nf(u.dryDelta, 2)} g/m³)`).join(", ")}` : ""}.`,
            `In the MCU-2 summer windows (indoor AH − outdoor AH) the roof parts are in equilibrium${wetter.length ? `; ${wetter.map((u) => `${uName(u).toLowerCase()} became wetter (+${nf(u.dryDelta, 2)} g/m³)`).join(", ")}` : ""}.`) : "",
        ].filter(Boolean).join(" "),
        evidence: L("Löydös 3 · Sääntö: Δ(AH_sisä − AH_ulko) samana vuodenaikana ≈ 0. Pelkkä RH-käyrä johtaisi harhaan (kausivaihtelu). Takuu voi alkaa todistetusti kuivasta rakenteesta.", "Finding 3 · Rule: Δ(AH_in − AH_out) in the same season ≈ 0. An RH curve alone would mislead (seasonal variation). The guarantee can start from a verified dry structure."),
      });
    } else {
      list.push({
        id: "stable",
        kind: "info",
        level: "ok",
        title: L("Kosteustaso normaali", "Humidity normal"),
        text: L("Rakenteen kosteus seuraa vuodenaikoja eikä yllä kriittisiin lukemiin. Kuivumisen vuosivertailu (sama vuodenaika kahtena vuonna) tehdään, kun toinen kesäjakso on mitattu.", "Structural humidity follows the seasons and stays below critical levels. The year-on-year drying comparison (same season in two years) is made once the second summer window has been measured."),
        evidence: L(`Seurantaa ${A.days.length} vrk.`, `${A.days.length} days of monitoring.`),
      });
    }
    return list.map((f) => ({ ...f, state: fState(site, f.id) }));
  }
  const actionable = (site) => findings(site).filter((f) => f.action);
  const openCount = (site) => actionable(site).filter((f) => f.state.status !== "resolved").length;

  // Riskiluokka: 100 − homeriski (25) − aika yli RH-rajan (20) − laiteviat (20) − lämpöpoikkeamat (15) − avoimet havainnot (20)
  // A ≥ 90, B ≥ 75, C ≥ 60, D ≥ 40, E < 40. Avoin laitevika tai vuotoepäily estää A-luokan.
  function risk(site) {
    const A = analyze(site);
    const w = (f) => (f.state.status === "open" ? 1 : f.state.status === "ordered" ? 0.5 : 0);
    const fs = actionable(site);
    const sum = (kinds, cap) => Math.min(cap, fs.filter((f) => kinds.includes(f.kind)).reduce((a, f) => a + f.weight * w(f), 0));
    const parts = {
      mold: A.maxMold === null ? 0 : Math.min(25, (A.maxMold / 2.5) * 25),
      rh: (A.overShare / 100) * 20,
      dev: sum(["device"], 20),
      thermal: sum(["thermal"], 15),
      open: sum(["sensor", "vent"], 20),
    };
    let score = Math.round(100 - parts.mold - parts.rh - parts.dev - parts.thermal - parts.open);
    if (fs.some((f) => f.cap && f.state.status !== "resolved")) score = Math.min(score, 89);
    return { score, cls: toClass(score), parts };
  }
  const toClass = (s) => (s >= 90 ? "A" : s >= 75 ? "B" : s >= 60 ? "C" : s >= 40 ? "D" : "E");
  // Rakenneosan riskiluokka (MCU-2-yksiköt)
  function unitClass(site, u) {
    const A = analyze(site);
    const open = (id) => fState(site, id).status !== "resolved";
    let s = 100 - Math.min(25, (u.mold / 2.5) * 25) - (u.rhIn90 / 100) * 20;
    if (A.stopped.includes(u) && open(`fan-${u.serial}`)) s -= 20;
    if (u.ventFlag && open(`vent-${u.serial}`)) s -= 10;
    return toClass(s);
  }
  const CLASS_COLOR = { A: "#157539", B: "#3ADB76", C: "#FFAE00", D: "#E3530F", E: "#A00000" };
  const classText = (c) => ({ A: L("Erinomainen", "Excellent"), B: L("Hyvä", "Good"), C: L("Tyydyttävä", "Fair"), D: L("Korjattava ennen takuuta", "Repairs needed first"), E: L("Ei takuukelpoinen", "Not eligible") }[c]);
  const badge = (c, size = "") => `<span class="rclass ${size}" style="background:${CLASS_COLOR[c]}">${c}</span>`;

  // Takuun talous per kohde
  function guarantee(site) {
    const r = risk(site);
    const price = CLASS_PRICE[r.cls] || CLASS_PRICE.D;
    const fee = price * site.m2;
    const fund = (0.25 / 1.5) * fee;
    const used = actionable(site).filter((f) => f.state.status !== "open").reduce((a, f) => a + (f.cost || 0), 0);
    return { ...r, price, fee, fund, used, balance: fund - used };
  }

  const comboText = (site) => (site.sensors.length && site.units.length ? L("Vuotopaikannin + kosteudenhallinta", "Leak detection + humidity control") : site.sensors.length ? L("Vuotopaikannin", "Leak detection") : L("Kosteudenhallinta", "Humidity control"));
  const findingCountText = (n) => (n ? L(`${n} avoin${n > 1 ? "ta" : ""} havainto${n > 1 ? "a" : ""}`, `${n} open ${plural(n, "finding", "findings")}`) : L("Ei avoimia havaintoja", "No open findings"));

  function siteSelect(site, viewKey) {
    return `<label class="site-select"><span class="caps muted">${L("Kohde", "Site")}</span>
      <select data-site-select="${viewKey}">${allSites().map((s) => `<option value="${s.id}" ${s.id === site.id ? "selected" : ""}>${esc(s.name)}</option>`).join("")}</select></label>`;
  }
  function bindSiteSelect() {
    $$("[data-site-select]").forEach((sel) => sel.addEventListener("change", () => { location.hash = `#/${sel.dataset.siteSelect}/${sel.value}`; }));
  }
  const dataBadge = (site) => (site.real
    ? `<span class="chip chip--info">${L("Oikea data", "Real data")}${site.pilot ? ` · ${L("pilotti", "pilot")}` : ""}</span>`
    : `<span class="chip chip--muted">${L("Simuloitu data", "Simulated data")}${site.custom ? ` · ${L("uusi kohde", "new site")}` : ""}</span>`);

  function noSites() {
    view.innerHTML = `<div class="card locked"><h2 style="margin-bottom:8px">${L("Salkussa ei ole kohteita", "No sites in the portfolio")}</h2><p>${L("Lisää ensimmäinen takuukohde salkkunäkymässä.", "Add your first guarantee site in the portfolio view.")}</p><div style="margin-top:18px"><a class="button" href="#/salkku">${L("Siirry salkkuun", "Go to portfolio")}</a></div></div>`;
  }

  // ---------- Kirjautumissivu ----------
  function renderLogin() {
    view.innerHTML = `
      <div class="login">
        <div class="login__brand">
          <img src="assets/vilpe-logo.svg" alt="VILPE">
          <h1>Sense<b>+</b></h1>
          <p><b>${L("Kuiva katto -takuu", "Dry Roof Guarantee")}</b><br>${L("Maksa kuivasta katosta, älä antureista.", "Pay for a dry roof, not for sensors.")}</p>
        </div>
        <form class="login__form" id="login-form" novalidate>
          <h2>${L("Kirjaudu sisään", "Sign in")}</h2>
          <div class="field"><label for="login-user">${L("Käyttäjätunnus", "Username")}</label><input id="login-user" autocomplete="username" required></div>
          <div class="field"><label for="login-pass">${L("Salasana", "Password")}</label><input id="login-pass" type="password" autocomplete="current-password" required></div>
          <p class="login__error" id="login-error" role="alert" hidden>${L("Väärä käyttäjätunnus tai salasana.", "Incorrect username or password.")}</p>
          <button class="button" type="submit">${L("Kirjaudu", "Sign in")}</button>
        </form>
      </div>`;
    $("#login-user").focus();
    $("#login-form").addEventListener("submit", (e) => {
      e.preventDefault();
      if ($("#login-user").value.trim() === DEMO_USER && $("#login-pass").value === DEMO_PASS) {
        session = DEMO_USER;
        try { sessionStorage.setItem(AUTH_KEY, session); } catch (err) { /* ohitetaan */ }
        if (!location.hash || location.hash === "#/") location.hash = "#/salkku";
        route();
      } else {
        $("#login-error").hidden = false;
        $("#login-pass").value = "";
        $("#login-pass").focus();
      }
    });
  }

  function logout() {
    session = null;
    try { sessionStorage.removeItem(AUTH_KEY); } catch (e) { /* ohitetaan */ }
    location.hash = "#/salkku";
    route();
  }

  // ---------- Takuusalkku ja kohteiden hallinta ----------
  function renderPortfolio() {
    const rows = allSites().map((s) => ({ s, g: guarantee(s), open: openCount(s) }));
    const order = "ABCDE";
    rows.sort((a, b) => order.indexOf(b.g.cls) - order.indexOf(a.g.cls) || b.open - a.open || a.g.score - b.g.score);
    const m2 = rows.reduce((a, r) => a + r.s.m2, 0);
    const fees = rows.reduce((a, r) => a + r.g.fee, 0);
    const orders = rows.reduce((a, r) => a + actionable(r.s).filter((f) => f.state.status === "ordered").length, 0);
    const openTotal = rows.reduce((a, r) => a + r.open, 0);

    view.innerHTML = `
      <div class="page-head">
        <div>
          <div class="caps muted">${I.weekday(today)} ${fdate(today)}</div>
          <h1>${L("Takuusalkku", "Guarantee portfolio")}</h1>
          <p>${L("Kuiva katto kiinteään hintaan: riskiluokka, takuumaksu ja työtilaukset kohteittain.", "A dry roof at a fixed price: risk class, guarantee fee and work orders per site.")}</p>
        </div>
        <button class="button" id="add-site">+ ${L("Lisää kohde", "Add site")}</button>
      </div>
      ${rows.length ? `
      <div class="summary">
        <div><b class="num">${rows.length}</b><span>${L("takuukohdetta", "guarantee sites")}</span></div>
        <div><b class="num">${area(m2)}</b><span>${L("kattoa takuun piirissä", "of roof under guarantee")}</span></div>
        <div><b class="num">${I.money(fees)}</b><span>${L("takuumaksut vuodessa", "guarantee fees per year")}</span></div>
        <div><b class="num" style="color:${openTotal ? "#A3141C" : "#157539"}">${openTotal}</b><span>${L(`avointa havaintoa · ${orders} työtilausta käynnissä`, `open findings · ${orders} work orders in progress`)}</span></div>
      </div>
      <div class="sites">
        ${rows.map(({ s, g, open }) => `<article class="site" data-open-site="${s.id}" tabindex="0" role="link" aria-label="${L("Avaa", "Open")} ${esc(s.name)}">
            <div class="site__bar" style="background:${CLASS_COLOR[g.cls]}"></div>
            <div class="site__body">
              <div class="site__info">
                <h3>${esc(s.name)}</h3>
                <div class="site__meta">${esc(s.city)} · ${esc(siteType(s))}</div>
                <div class="site__meta">${area(s.m2)} · ${comboText(s)}</div>
                <div class="site__meta"><b>${I.money(g.fee)}/${yr()}</b> · ${perArea(g.price)}/${yr()}</div>
                <div class="site__status"><span class="dot dot--${open ? "warn" : "ok"}"></span><span>${findingCountText(open)}</span></div>
              </div>
              <div class="site__score">${badge(g.cls, "rclass--lg")}<span>${L("Riskiluokka", "Risk class")}</span></div>
            </div>
            <div class="site__foot">
              <span>${dataBadge(s)}</span>
              <span class="site__actions"><button class="link-button" data-delete-site="${s.id}">${L("Poista", "Delete")}</button><strong>${L("Avaa", "Open")} →</strong></span>
            </div>
          </article>`).join("")}
      </div>` : `<div class="card locked"><h2 style="margin-bottom:8px">${L("Salkku on tyhjä", "The portfolio is empty")}</h2><p>${L("Lisää kohde aloittaaksesi, tai palauta demokohteet footerin Nollaa demo -painikkeesta.", "Add a site to get started, or restore the demo sites with Reset demo in the footer.")}</p></div>`}`;

    $("#add-site").addEventListener("click", openAddSite);
    $$("[data-open-site]").forEach((card) => {
      const go = () => { location.hash = `#/kohde/${card.dataset.openSite}`; };
      card.addEventListener("click", go);
      card.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
    });
    $$("[data-delete-site]").forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); openDeleteSite(b.dataset.deleteSite); }));
  }

  const ROOF_TYPES = ["Tasakatto", "Viherkatto", "Ullakollinen yläpohja", "Aluskatteeton peltikatto", "Ryömintätilainen alapohja"];
  function openAddSite() {
    openModal(`
      <div class="modal__head"><h2 id="modal-title">${L("Lisää takuukohde", "Add guarantee site")}</h2><button class="modal__close" data-close aria-label="${L("Sulje", "Close")}">×</button></div>
      <form class="modal__body" id="site-form" novalidate>
        <div class="form-row"><label for="s-name">${L("Kohteen nimi", "Site name")}</label><input id="s-name" placeholder="${L("esim. Logistiikkahalli Seinäjoki", "e.g. Logistics hall Seinäjoki")}" required maxlength="60"></div>
        <div class="form-row"><label for="s-city">${L("Paikkakunta", "City")}</label><input id="s-city" value="Vaasa" maxlength="40"></div>
        <div class="form-row"><label for="s-type">${L("Rakenne", "Structure")}</label><select id="s-type">${ROOF_TYPES.map((t) => `<option value="${t}">${typeLabel(t)}</option>`).join("")}</select></div>
        <div class="form-row"><label for="s-m2">${L("Katon pinta-ala (m²)", "Roof area (m²)")}</label><input id="s-m2" type="number" min="100" max="50000" value="3000"></div>
        <div class="form-row"><label for="s-sensors">${L("Vuotoanturit (RHT-2)", "Leak sensors (RHT-2)")}</label><input id="s-sensors" type="number" min="0" max="400" value="150"></div>
        <div class="form-row"><label for="s-units">${L("Kosteudenhallinta (MCU-2 + imuri)", "Humidity control (MCU-2 + fan)")}</label><input id="s-units" type="number" min="0" max="10" value="0"></div>
        <div class="form-row"><span class="label"></span><p class="muted" style="font-size:13px">${L("Aloituskartoitus: anturit ~10 / 200 m², asennetaan takuun alussa (sisältyy maksuun). Demossa data simuloidaan 12 kuukauden ajalta.", "Start survey: sensors ~10 per 200 m², installed at guarantee start (included in the fee). In the demo, 12 months of data are simulated.")}</p></div>
        <p class="login__error" id="site-error" role="alert" hidden></p>
      </form>
      <div class="modal__foot">
        <button class="button button--hollow" data-close>${L("Peruuta", "Cancel")}</button>
        <button class="button" id="save-site">${L("Lisää kohde", "Add site")}</button>
      </div>`);
    $("#s-name").focus();
    $("#s-m2").addEventListener("input", () => { $("#s-sensors").value = Math.round((+$("#s-m2").value || 0) / 20); });
    const submit = () => {
      const name = $("#s-name").value.trim();
      const m2 = Math.max(100, Math.min(50000, Math.round(+$("#s-m2").value || 0)));
      const sensors = Math.max(0, Math.min(400, Math.round(+$("#s-sensors").value || 0)));
      const units = Math.max(0, Math.min(10, Math.round(+$("#s-units").value || 0)));
      const err = $("#site-error");
      const fail = (msg) => { err.textContent = msg; err.hidden = false; };
      if (!name) return fail(L("Anna kohteelle nimi.", "Enter a name for the site."));
      if (sensors + units === 0) return fail(L("Kohteessa pitää olla vähintään yksi anturi tai kosteudenhallintayksikkö.", "The site needs at least one sensor or humidity control unit."));
      if (sensors === 1) return fail(L("Vuotopaikannukseen tarvitaan vähintään 2 anturia.", "Leak detection needs at least 2 sensors."));
      const id = `k${Date.now().toString(36)}`;
      state.custom.push({
        id, custom: true, name, m2, sensors, units,
        city: $("#s-city").value.trim() || "–",
        type: $("#s-type").value,
      });
      save();
      closeModal();
      route();
      toast(L(`${name} lisätty takuusalkkuun.`, `${name} added to the guarantee portfolio.`));
    };
    $("#save-site").addEventListener("click", submit);
    $("#site-form").addEventListener("submit", (e) => { e.preventDefault(); submit(); });
  }

  function openDeleteSite(id) {
    const site = allSites().find((s) => s.id === id);
    if (!site) return;
    openModal(`
      <div class="modal__head"><h2 id="modal-title">${L("Poista kohde", "Delete site")}</h2><button class="modal__close" data-close aria-label="${L("Sulje", "Close")}">×</button></div>
      <div class="modal__body">
        <p>${L(`Poistetaanko <b>${esc(site.name)}</b> takuusalkusta? Kohteen havainnot, työtilaukset ja suostumukset poistuvat näkymistä.`, `Delete <b>${esc(site.name)}</b> from the guarantee portfolio? Its findings, work orders and consents will be removed.`)}</p>
        <p class="muted" style="font-size:13px;margin-top:10px">${site.custom ? L("Itse lisätty kohde poistetaan pysyvästi.", "A site you added is deleted permanently.") : L("Demokohteen saa takaisin footerin Nollaa demo -painikkeella.", "Demo sites can be restored with Reset demo in the footer.")}</p>
      </div>
      <div class="modal__foot">
        <button class="button button--hollow" data-close>${L("Peruuta", "Cancel")}</button>
        <button class="button" id="confirm-delete">${L("Poista kohde", "Delete site")}</button>
      </div>`);
    $("#confirm-delete").addEventListener("click", () => {
      if (site.custom) {
        state.custom = state.custom.filter((c) => c.id !== id);
        siteCache.delete(id);
        analysisCache.delete(id);
      } else {
        state.removed.push(id);
      }
      delete state.findings[id];
      delete state.consent[id];
      if (state.current === id) state.current = (allSites()[0] || {}).id || null;
      save();
      closeModal();
      route();
      toast(L(`${site.name} poistettu salkusta.`, `${site.name} deleted from the portfolio.`));
    });
  }

  // ---------- Takuukohde ----------
  const ui = { siteId: null, day: 0, metric: "rh", sensor: null, unit: null, playing: null };

  function renderSite(site) {
    const A = analyze(site);
    if (ui.siteId !== site.id) {
      ui.siteId = site.id;
      ui.day = A.lastIdx;
      ui.sensor = null;
      ui.unit = A.stopped[0] ? A.stopped[0].name : A.ventFlagged[0] ? A.ventFlagged[0].name : A.units[0] ? A.units[0].name : null;
    }
    const g = guarantee(site);
    const fs = findings(site);
    const hasSensors = A.sensors.length > 0;
    const hasUnits = A.units.length > 0;
    const devTotal = A.sensors.length + A.units.length;
    const devDown = A.stopped.filter((u) => fState(site, `fan-${u.serial}`).status !== "resolved").length + A.offline.filter((s) => fState(site, `offline-${s.id}`).status !== "resolved").length;
    const thermalIds = new Set(A.thermal.map((t) => t.s.id));
    const dense = A.sensors.length > 80;

    view.innerHTML = `
      <div class="page-head">
        <div>
          <div class="crumbs"><a href="#/salkku">${L("Takuusalkku", "Guarantee portfolio")}</a> / ${L("Takuukohde", "Guarantee site")}</div>
          <h1>${esc(site.name)}</h1>
          <p>${esc(siteStructure(site))} · ${area(site.m2)} · ${comboText(site)} · ${L("seuranta", "monitoring")} ${fdate(A.days[0])}–${fdate(A.days[A.lastIdx])} ${dataBadge(site)}</p>
        </div>
        <div class="button-row">
          ${siteSelect(site, "kohde")}
          <a class="button" href="#/passi/${site.id}">${L("Vuosipassi", "Annual passport")}</a>
        </div>
      </div>

      <div class="kpis">
        <div class="kpi kpi--score">${badge(g.cls, "rclass--xl")}<div><div class="caps">${L("Riskiluokka", "Risk class")}</div><span>${classText(g.cls)} · ${g.score}/100</span></div></div>
        <div class="kpi"><b class="num">${I.money(g.fee)}</b><span>${L("takuumaksu vuodessa", "guarantee fee per year")} · ${perArea(g.price)}</span></div>
        <div class="kpi"><b class="num" style="color:${g.balance < 0 ? "#A3141C" : "inherit"}">${I.money(g.balance)}</b><span>${L(`korjausrahaston saldo · ${I.money(g.fund)}/v, käytetty ${I.money(g.used)}`, `repair fund balance · ${I.money(g.fund)}/yr, used ${I.money(g.used)}`)}</span></div>
        <div class="kpi"><b class="num" style="color:${devDown ? "#A3141C" : "inherit"}">${devTotal - devDown}/${devTotal}</b><span>${L("laitetta toiminnassa", "devices operational")}</span></div>
        <div class="kpi"><b class="num">${A.maxMold === null ? "–" : n1(A.maxMold)}</b><span>${A.maxMold === null ? L("homeindeksi vaatii MCU-2:n", "mould index requires MCU-2") : L("suurin homeindeksi (raja 2,5)", "highest mould index (limit 2.5)")}</span></div>
      </div>

      <div class="grid grid--main">
        <div class="stack">
          <section class="card" id="map-card">
            <div class="card__head">
              <h2>${hasSensors ? L("Kosteuskartta ja löydökset", "Humidity map and findings") : L("Laitekartta", "Device map")}</h2>
              ${hasSensors ? `<div class="segmented" role="group" aria-label="${L("Suure", "Quantity")}">
                <button data-metric="rh" class="${ui.metric === "rh" ? "is-active" : ""}">RH %</button>
                <button data-metric="t" class="${ui.metric === "t" ? "is-active" : ""}">${I.tempUnit()}</button>
              </div>` : ""}
            </div>
            <div class="map ${site.real ? "" : "map--sim"} ${dense ? "map--dense" : ""}" id="map">
              <img src="${site.roof.src}" alt="${L("Kattokartta", "Roof plan")}, ${esc(site.name)}" width="${site.roof.w}" height="${site.roof.h}">
              <canvas id="heat"></canvas>
              ${A.sensors.map((s) => {
                const flagged = (A.anomalies.includes(s) && fState(site, `sensor-${s.id}`).status !== "resolved") || (A.offline.includes(s) && fState(site, `offline-${s.id}`).status !== "resolved");
                const therm = thermalIds.has(s.id) && fState(site, "thermal").status !== "resolved";
                return `<button class="map__pin ${flagged ? "map__pin--flag" : ""} ${therm ? "map__pin--thermal" : ""}" data-sensor="${s.id}" style="left:${s.pos[0] * 100}%;top:${s.pos[1] * 100}%" aria-label="${L("Anturi", "Sensor")} ${s.id}"></button>`;
              }).join("")}
              ${A.units.filter((u) => u.pos).map((u) => `<button class="map__unit ${u.ventFlag && fState(site, `vent-${u.serial}`).status !== "resolved" ? "map__unit--vent" : ""}" data-unit="${esc(u.name)}" style="left:${u.pos[0] * 100}%;top:${u.pos[1] * 100}%" aria-label="${esc(uName(u))}"></button>`).join("")}
            </div>
            <div class="map-controls">
              <button class="round-btn" id="play" aria-label="${L("Toista seurantajakso", "Play the monitoring period")}">▶</button>
              <input type="range" id="day" min="0" max="${A.lastIdx}" value="${ui.day}" aria-label="${L("Päivä", "Day")}">
              <span class="date-badge num" id="day-label"></span>
            </div>
            <div class="legend">
              ${hasSensors ? `<span class="legend__item"><span class="scale" id="scale"></span><span id="scale-label"></span></span>
              <span class="legend__item"><span class="dot" style="border-radius:50%;box-shadow:0 0 0 2px #E2202C;background:#fff"></span>${L("kosteuspoikkeama / offline", "humidity anomaly / offline")}</span>
              <span class="legend__item"><span class="dot" style="border-radius:50%;box-shadow:0 0 0 2px #E3530F;background:#fff"></span>${L("lämpöpoikkeama", "thermal anomaly")}</span>` : ""}
              ${hasUnits ? `<span class="legend__item"><span class="dot" style="transform:rotate(45deg);background:#3ADB76"></span>${L("MCU-2 (punainen = seis, oranssi reuna = kesäohjaus)", "MCU-2 (red = stopped, orange ring = summer control)")}</span>` : ""}
            </div>
            <div id="sensor-detail"></div>
          </section>

          ${hasUnits ? `<section class="card" id="units-card">
            <div class="card__head"><h2>${L("Rakenneosat ja kosteudenhallinta", "Structure parts and humidity control")}</h2><span class="caps">MCU-2</span></div>
            <div class="table-wrap">
              <table>
                <thead><tr><th>${L("Rakenneosa", "Part")}</th><th>${L("Luokka", "Class")}</th><th>${L("Tila", "Status")}</th><th class="r">${L("Puhallin käynnissä", "Fan running")}</th><th class="r">${L("Tuuletuksen hyöty kesällä", "Summer ventilation benefit")}</th><th class="r">${L("RH > 95 % kesällä", "RH > 95 % in summer")}</th><th class="r">${L("Homeindeksi", "Mould index")}</th></tr></thead>
                <tbody>${A.units.map((u) => {
                  const fid = A.stopped.includes(u) ? `fan-${u.serial}` : u.ventFlag ? `vent-${u.serial}` : null;
                  const st = fid ? fState(site, fid).status : null;
                  const chip = A.stopped.includes(u) && st === "open" ? `<span class="chip chip--alert">${L("Puhallin seis", "Fan stopped")}</span>`
                    : u.ventFlag && st === "open" ? `<span class="chip chip--warn">${L("Kesäohjaus", "Summer control")}</span>`
                    : st === "ordered" ? `<span class="chip chip--warn">${L("Työtilaus", "Work order")}</span>` : '<span class="chip chip--ok">OK</span>';
                  const lastY = u.ventYears[u.ventYears.length - 1];
                  return `<tr class="is-clickable ${u.name === ui.unit ? "is-selected" : ""}" data-unit="${esc(u.name)}">
                    <td><b>${esc(uName(u))}</b><div class="muted" style="font-size:12px">${u.serial}</div></td><td>${badge(unitClass(site, u), "rclass--sm")}</td><td>${chip}</td>
                    <td class="r num" style="${u.on < 60 ? "color:#A3141C;font-weight:700" : ""}">${n0(u.on)} %</td>
                    <td class="r num">${lastY ? `${n0(lastY.benefit)} %` : "–"}</td>
                    <td class="r num" style="${lastY && lastY.rh95 > 50 ? "font-weight:700" : ""}">${lastY ? `${n0(lastY.rh95)} %` : "–"}</td>
                    <td class="r num" style="${u.mold > 0.5 ? "font-weight:700" : ""}">${nd(u.mold, 3)}</td></tr>`;
                }).join("")}</tbody>
              </table>
            </div>
            <div style="margin-top:18px" id="unit-chart-wrap"></div>
          </section>` : ""}
        </div>

        <div class="stack">
          <section>
            <div class="card__head" style="margin-bottom:12px"><h2>${L("Havainnot ja työtilaukset", "Findings and work orders")}</h2><span class="caps muted">${openCount(site)} ${L("avointa", "open")}</span></div>
            ${fs.map((f) => findingCard(f)).join("")}
          </section>
          <section class="card">
            <div class="card__head"><h2>${L("Takuusopimus", "Guarantee contract")}</h2><span class="caps">${site.pilot ? L("pilotti · VILPEn oma katto", "pilot · VILPE's own roof") : L("10 v", "10 yrs")}</span></div>
            <table class="profile-table"><tbody>
              <tr><th>${L("Alkanut", "Started")}</th><td>${fdate(site.contractStart)} · ${L("kesto 10 v", "term 10 yrs")}</td></tr>
              <tr><th>${L("Hinta", "Price")}</th><td>${perArea(g.price)}/${yr()} (${L("luokka", "class")} ${g.cls}) · <b>${I.money(g.fee)}/${yr()}</b></td></tr>
              <tr><th>${L("Sisältää", "Includes")}</th><td>${L("Sense-laitteisto palveluna, jatkuva analytiikka, data-ohjattu vuositarkastus, vuotojen paikannus ja korjaus, vuosipassi", "Sense hardware as a service, continuous analytics, data-driven annual inspection, leak location and repair, annual passport")}</td></tr>
              <tr><th>${L("Korjaukset", "Repairs")}</th><td>${L(`Korjausrahastosta enintään ${I.money(REPAIR_CAP)}/v · ${zero()} omistajalle`, `From the repair fund up to ${I.money(REPAIR_CAP)}/yr · ${zero()} to the owner`)}</td></tr>
              <tr><th>${L("Urakoitsija", "Contractor")}</th><td>${esc(I.profile().partners[0])}</td></tr>
              <tr><th>${L("Ei sisällä", "Excludes")}</th><td class="muted">${L("Katteen elinkaaren lopun uusiminen, suunnitteluvirheet, ulkoiset vahingot (kiinteistövakuutus)", "End-of-life roof replacement, design faults, external damage (property insurance)")}</td></tr>
              <tr><th>${L("Kiinteistökauppa", "Property sale")}</th><td>${L("Takuu ja vuosipassi siirtyvät ostajalle", "Guarantee and annual passport transfer to the buyer")}</td></tr>
            </tbody></table>
          </section>
          <section class="card">
            <div class="card__head"><h2>${L("Rakenne vs. ulkoilma", "Structure vs. outdoor air")}</h2><span class="caps">AH g/m³ · ${L("kk-ka.", "monthly mean")}</span></div>
            <div id="ah-chart"></div>
            <div class="legend">
              <span class="legend__item"><span class="legend__swatch" style="background:#8052B1"></span>${hasSensors ? L("Eriste (vuotoanturit)", "Insulation (leak sensors)") : L("Rakenne (MCU-2 sisä)", "Structure (MCU-2 indoor)")}</span>
              <span class="legend__item"><span class="legend__swatch" style="background:#2D0396"></span>${L("Ulkoilma", "Outdoor air")}</span>
            </div>
            <p class="muted" style="font-size:12px;margin-top:8px">${L("Kuivuminen arvioidaan absoluuttisesta kosteudesta suhteessa ulkoilmaan – RH-käyrä vaihtelee vuodenaikojen mukaan.", "Drying is assessed from absolute humidity relative to outdoor air – the RH curve varies with the seasons.")}</p>
          </section>
        </div>
      </div>`;

    bindSiteSelect();
    bindSite(site);
    if (hasUnits) drawUnitChart(site);
    ahChart($("#ah-chart"), site, 210, hasSensors ? L("Eriste", "Insulation") : L("Rakenne", "Structure"));
  }

  function ahChart(el, site, height, label) {
    const A = analyze(site);
    const M = site.networkMonthly;
    Charts.timeSeries(el, {
      labels: A.months,
      height,
      left: { min: 0, max: 14, ticks: 7, title: "g/m³" },
      series: [
        { name: L("Ulkoilma", "Outdoor"), values: A.outdoorMonthly.map((v) => (v === null ? null : Math.round(v * 100) / 100)), color: "#2D0396", unit: "g/m³", width: 2, dash: "5 3" },
        { name: label, values: M.map((m) => m.ah), color: "#8052B1", unit: "g/m³", width: 2.5, dots: true },
      ],
      tick: (_, i) => M.length <= 6 || i % 2 === 0,
      xFormat: month,
      tipTitle: month,
    });
  }

  function findingCard(f) {
    const st = f.state.status;
    const stLabel = st === "ordered" ? `<span class="chip chip--warn">${L("Työtilaus", "Work order")} ${f.state.order.no}</span>` : st === "resolved" ? `<span class="chip chip--ok">${L("Hoidettu", "Done")}</span>` : "";
    let actions = "";
    if (f.action && st === "open") {
      actions = `<button class="button button--sm" data-order="${f.id}">${f.action}</button><span class="muted" style="font-size:12px">${L(`takuun puitteissa · ${zero()} omistajalle`, `under the guarantee · ${zero()} to the owner`)}</span>`;
    } else if (f.action && st === "ordered") {
      actions = `<span class="muted" style="font-size:13px">${esc(f.state.order.partner)} · ${L("lähetetty", "sent")} ${fdate(f.state.order.date)}</span><button class="button button--hollow button--sm" data-resolve="${f.id}">${L("Merkitse hoidetuksi", "Mark as done")}</button>`;
    }
    if (f.target) actions += `<button class="link-button" style="font-size:13px" data-show="${f.id}">${L("Näytä datassa", "Show in data")}</button>`;
    return `<article class="finding finding--${st === "resolved" ? "ok" : f.level} ${st === "resolved" ? "finding--resolved" : ""}">
      <div class="finding__bar"></div>
      <div class="finding__body">
        <div class="finding__top"><h3>${esc(f.title)}</h3>${stLabel}</div>
        <p>${f.text}</p>
        <div class="finding__evidence">${f.evidence}</div>
        ${actions ? `<div class="finding__actions">${actions}</div>` : ""}
      </div>
    </article>`;
  }

  function bindSite(site) {
    const slider = $("#day");
    slider.addEventListener("input", () => { ui.day = +slider.value; updateMap(site); });
    $("#play").addEventListener("click", () => togglePlay(site));
    $$("[data-metric]").forEach((b) => b.addEventListener("click", () => {
      ui.metric = b.dataset.metric;
      $$("[data-metric]").forEach((x) => x.classList.toggle("is-active", x === b));
      updateMap(site);
    }));
    $$(".map__pin").forEach((p) => p.addEventListener("click", () => selectSensor(site, p.dataset.sensor)));
    $$("[data-unit]").forEach((r) => r.addEventListener("click", () => selectUnit(site, r.dataset.unit, r.classList.contains("map__unit"))));
    $$("[data-order]").forEach((b) => b.addEventListener("click", () => openOrder(site, b.dataset.order)));
    $$("[data-resolve]").forEach((b) => b.addEventListener("click", () => resolve(site, b.dataset.resolve)));
    $$("[data-show]").forEach((b) => b.addEventListener("click", () => showTarget(site, b.dataset.show)));
    updateMap(site);
    if (ui.sensor && analyze(site).sensorBy[ui.sensor]) selectSensor(site, ui.sensor);
  }

  function updateMap(site) {
    const A = analyze(site);
    const sc = SCALES[ui.metric];
    $("#day-label").textContent = fdate(A.days[ui.day]);
    $("#day").value = ui.day;
    if ($("#scale")) {
      $("#scale").style.background = scaleCss(sc);
      $("#scale-label").textContent = scaleLabel(ui.metric);
    }
    const vals = {};
    $$(".map__pin").forEach((p) => {
      const s = A.sensorBy[p.dataset.sensor];
      // Anturit lähettävät 2 × vrk; jos päivältä puuttuu mittaus, käytetään edellisten 2 vrk viimeisintä.
      const series = s[ui.metric];
      const v = [0, 1, 2].map((k) => series[ui.day - k]).find((x) => x !== null && x !== undefined) ?? null;
      vals[s.id] = v;
      p.style.background = lerpColor(sc.stops, v);
      p.title = `${s.id} · ${v === null ? L("ei mittausta", "no reading") : ui.metric === "rh" ? `${n1(v)} %` : tmp(v)}`;
    });
    const dayStr = A.days[ui.day];
    $$(".map__unit").forEach((m) => {
      const u = A.unitBy[m.dataset.unit];
      const d = u.days.find((x) => x.d === dayStr);
      const bad = d ? d.rpm === 0 && A.stopped.includes(u) && dayStr >= u.stopFrom && dayStr <= u.stopTo : false;
      m.style.background = !d ? "#CACACA" : bad ? "#E2202C" : d.rpm > 0 ? "#3ADB76" : "#FFAE00";
      m.title = `${uName(u)} · ${d ? `${n0(d.rpm)} rpm, ${L("rakenteen RH", "structural RH")} ${n1(d.rhIn)} %` : L("ei dataa", "no data")}`;
    });
    drawHeat(site, vals, sc);
  }

  function drawHeat(site, vals, sc) {
    const canvas = $("#heat");
    const box = $("#map").getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = box.width * dpr;
    canvas.height = box.height * dpr;
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    const r = box.width * Math.min(0.09, 0.48 / Math.sqrt(Math.max(1, site.sensors.length)));
    site.sensors.forEach((s) => {
      const v = vals[s.id];
      if (v === null || v === undefined) return;
      const x = s.pos[0] * box.width;
      const y = s.pos[1] * box.height;
      const col = lerpColor(sc.stops, v);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `${col}88`);
      g.addColorStop(1, `${col}00`);
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
    });
  }

  function stopPlay() {
    if (ui.playing) { clearInterval(ui.playing); ui.playing = null; }
    if ($("#play")) $("#play").textContent = "▶";
  }
  function togglePlay(site) {
    if (ui.playing) { stopPlay(); return; }
    const A = analyze(site);
    if (ui.day >= A.lastIdx) ui.day = 0;
    $("#play").textContent = "❚❚";
    ui.playing = setInterval(() => {
      if (!$("#day")) { stopPlay(); return; }
      ui.day = Math.min(A.lastIdx, ui.day + 2);
      updateMap(site);
      if (ui.day >= A.lastIdx) stopPlay();
    }, 45);
  }

  function selectSensor(site, id, scroll = false) {
    const A = analyze(site);
    ui.sensor = id;
    const s = A.sensorBy[id];
    const th = A.thermal.find((t) => t.s === s);
    $$(".map__pin").forEach((p) => p.classList.toggle("is-selected", p.dataset.sensor === id));
    const chips = [
      A.anomalies.includes(s) ? `<span class="chip chip--warn">${L("Kosteuspoikkeama", "Humidity anomaly")}</span>` : "",
      th ? `<span class="chip chip--warn">${th.kind === "cold" ? L("Kylmä reuna", "Cold edge") : L("Lämpöpoikkeama", "Thermal anomaly")}</span>` : "",
      A.offline.includes(s) ? '<span class="chip chip--alert">Offline</span>' : "",
    ].join(" ");
    const fit = s.coupling !== undefined && A.thermalStats ? ` · ${L("talven lämpökytkentä", "winter thermal coupling")} b = ${nf(s.coupling, 2)} (${L("mediaani", "median")} ${nf(A.thermalStats.median, 2)})` : "";
    $("#sensor-detail").innerHTML = `<div class="sensor-detail">
      <div class="card__head" style="margin-bottom:6px">
        <h3>${L("Anturi", "Sensor")} ${s.id} ${chips}</h3>
        <button class="link-button" style="font-size:13px" id="close-sensor">${L("Sulje", "Close")}</button>
      </div>
      <div class="muted" style="font-size:13px">${L("Keskiarvo", "Mean")} ${n1(s.rhMean)} % · max ${n1(s.rhMax)} % · min ${tmp(s.tMin)} · ${n0(s.n)} ${L("mittausta", "readings")}${fit}</div>
      <div id="sensor-chart" style="margin-top:10px"></div>
      <div class="legend">
        <span class="legend__item"><span class="legend__swatch" style="background:#EA4840"></span>${L("Tämä anturi, RH %", "This sensor, RH %")}</span>
        <span class="legend__item"><span class="legend__swatch" style="background:#4EACE8"></span>${L("6 lähimmän naapurin mediaani", "Median of 6 nearest neighbours")}</span>
      </div>
    </div>`;
    $("#close-sensor").addEventListener("click", () => { ui.sensor = null; $("#sensor-detail").innerHTML = ""; $$(".map__pin").forEach((p) => p.classList.remove("is-selected")); });
    Charts.timeSeries($("#sensor-chart"), {
      labels: A.days,
      height: 170,
      left: { min: 0, max: 100, ticks: 4, title: "RH %" },
      bands: [{ from: 80, to: 100, color: "rgba(226,32,44,.06)" }],
      series: [
        { name: L("Naapurit", "Neighbours"), values: s.nbMedian.map((v) => (v === null ? null : Math.round(v * 10) / 10)), color: "#4EACE8", unit: "%", width: 1.5 },
        { name: s.id, values: s.rh, color: "#EA4840", unit: "%", width: 1.8 },
      ],
      markers: [{ index: ui.day, label: fdate(A.days[ui.day]), color: "#01273E" }],
      tick: monthTick,
      xFormat: (d) => month(d.slice(0, 7)),
      tipTitle: fdate,
    });
    if (scroll) $("#map-card").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function selectUnit(site, name, scroll) {
    ui.unit = name;
    $$("#units-card tbody tr").forEach((r) => r.classList.toggle("is-selected", r.dataset.unit === name));
    $$(".map__unit").forEach((m) => m.classList.toggle("is-selected", m.dataset.unit === name));
    drawUnitChart(site);
    if (scroll && $("#units-card")) $("#units-card").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function drawUnitChart(site) {
    const A = analyze(site);
    const u = A.unitBy[ui.unit] || A.units[0];
    const wrap = $("#unit-chart-wrap");
    if (!u || !wrap) return;
    const markers = [];
    if (A.stopped.includes(u)) {
      const i = u.days.findIndex((d) => d.d >= u.alertDay);
      if (i >= 0) markers.push({ index: i, label: L("Takuussa havaittu 48 h:ssa", "Caught within 48 h under guarantee"), color: "#E2202C" });
    }
    wrap.innerHTML = `
      <div style="display:flex;gap:20px;align-items:center;flex-wrap:wrap;margin-bottom:10px">
        <div class="mold"><div><b class="num">${nd(u.mold, 5)}</b><span>${L("Homeindeksi", "Mould index")}</span></div></div>
        <div>
          <h3>${esc(uName(u))} – ${L("olosuhteet ja puhallusteho", "conditions and fan output")}</h3>
          <p class="muted" style="font-size:14px;margin-top:4px">${purposeLabel(u.purpose)} · ${u.serial} · ${L(`puhallin käynnissä ${n0(u.on)} % ajasta`, `fan running ${n0(u.on)} % of the time`)}${u.ventYears.length ? L(` · kesän tuuletuksen hyöty ${u.ventYears.map((v) => `${v.y}: ${n0(v.benefit)} %`).join(", ")}`, ` · summer ventilation benefit ${u.ventYears.map((v) => `${v.y}: ${n0(v.benefit)} %`).join(", ")}`) : ""}</p>
        </div>
      </div>
      <div id="unit-chart"></div>
      <div class="legend">
        <span class="legend__item"><span class="legend__swatch" style="background:#EA4840"></span>${L("Rakenteen RH %", "Structural RH %")}</span>
        <span class="legend__item"><span class="legend__swatch" style="background:#4EACE8"></span>${L("Ulkoilman RH %", "Outdoor RH %")}</span>
        <span class="legend__item"><span class="legend__swatch legend__swatch--bar" style="background:#ADC3F4"></span>${L("Puhallin rpm (oikea)", "Fan rpm (right)")}</span>
      </div>`;
    Charts.timeSeries($("#unit-chart"), {
      labels: u.days.map((d) => d.d),
      height: 230,
      left: { min: 0, max: 100, ticks: 4, title: "RH %" },
      right: { min: 0, max: 3000, title: "rpm" },
      bands: [{ from: 95, to: 100, color: "rgba(226,32,44,.08)", label: "RH > 95 %" }],
      series: [
        { name: L("Puhallin", "Fan"), values: u.days.map((d) => d.rpm), color: "#ADC3F4", type: "bar", axis: "right", unit: "rpm" },
        { name: L("Ulkoilman RH", "Outdoor RH"), values: u.days.map((d) => d.rhOut), color: "#4EACE8", unit: "%", width: 1.2 },
        { name: L("Rakenteen RH", "Structural RH"), values: u.days.map((d) => d.rhIn), color: "#EA4840", unit: "%", width: 2 },
      ],
      markers,
      tick: monthTick,
      xFormat: (d) => month(d.slice(0, 7)),
      tipTitle: fdate,
    });
  }

  function showTarget(site, id) {
    const A = analyze(site);
    const f = findings(site).find((x) => x.id === id);
    if (!f) return;
    if (f.target.type === "unit") {
      selectUnit(site, f.target.name, true);
    } else {
      ui.day = Math.max(0, A.days.indexOf(f.target.day));
      updateMap(site);
      selectSensor(site, f.target.id, true);
    }
  }

  // ---------- Modaali ja työtilaus urakoitsijalle ----------
  function openModal(html) {
    const modal = $("#modal");
    $(".modal__panel", modal).innerHTML = html;
    modal.hidden = false;
    $$("[data-close]", modal).forEach((b) => b.addEventListener("click", (e) => { e.preventDefault(); closeModal(); }));
    const first = $("input, select, textarea, button", $(".modal__panel", modal));
    if (first) first.focus();
  }
  function closeModal() { $("#modal").hidden = true; }
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#modal").hidden) closeModal(); });

  function openOrder(site, id) {
    const f = findings(site).find((x) => x.id === id);
    const g = guarantee(site);
    const isUnit = f.target.type === "unit";
    const partners = I.profile().partners.map((p) => `${p} · ${L("sertifioitu Sense-urakoitsija", "certified Sense contractor")}`);
    const urgencies = [L("Kiireellinen – 48 h", "Urgent – 48 h"), L("Normaali – 14 vrk", "Normal – 14 days"), L("Seuraava vuositarkastus", "Next annual inspection")];
    const defUrg = f.level === "alert" ? 0 : f.kind === "thermal" ? 2 : 1;
    openModal(`
      <div class="modal__head"><h2 id="modal-title">${f.action}</h2><button class="modal__close" data-close aria-label="${L("Sulje", "Close")}">×</button></div>
      <form class="modal__body" id="order-form">
        <div class="guarantee-note">✓ ${L(`Hoidetaan takuun puitteissa – ${zero()} omistajalle.`, `Handled under the guarantee – ${zero()} to the owner.`)} ${f.cost ? L(`Kustannusarvio ${I.money(f.cost)} korjausrahastosta (saldo ${I.money(g.balance)}).`, `Cost estimate ${I.money(f.cost)} from the repair fund (balance ${I.money(g.balance)}).`) : L("Sisältyy vuositarkastukseen.", "Included in the annual inspection.")}</div>
        <div class="form-row"><span class="label">${L("Kohde", "Site")}</span><div class="value"><b>${esc(site.name)}</b> · ${area(site.m2)}</div></div>
        <div class="form-row"><span class="label">${L("Havainto", "Finding")}</span><div class="value">${esc(f.title)}</div></div>
        <div class="form-row"><label for="partner">${esc(I.roleShort("contractor"))}</label><select id="partner">${partners.map((p) => `<option>${esc(p)}</option>`).join("")}</select></div>
        <div class="form-row"><label for="urgency">${L("Kiireellisyys", "Urgency")}</label><select id="urgency">${urgencies.map((u, i) => `<option ${i === defUrg ? "selected" : ""}>${u}</option>`).join("")}</select></div>
        <div class="form-row"><label for="desc">${L("Kuvaus", "Description")}</label><textarea id="desc" rows="5">${f.orderText}</textarea></div>
        <div class="form-row"><span class="label">${L("Liitteet", "Attachments")}</span><div class="attach">
          <span>📎 ${isUnit ? L("Kattokartta ja laitteen sijainti", "Roof map and unit location") : L("Kattokartta ja anturien sijainnit", "Roof map and sensor locations")}</span>
          <span>📎 ${L("Aikasarjat ja Sense+-analyysin perustelu (CSV)", "Time series and Sense+ analysis rationale (CSV)")}</span>
        </div></div>
        <div class="form-row"><span class="label">${L("Tilaaja", "Ordered by")}</span><div class="value">${DEMO_USER} · ${esc(I.role("manager"))} · ${L("maksaja: korjausrahasto", "paid by: repair fund")}</div></div>
      </form>
      <div class="modal__foot">
        <button class="button button--hollow" data-close>${L("Peruuta", "Cancel")}</button>
        <button class="button" id="send-order">${L("Lähetä työtilaus", "Send work order")}</button>
      </div>`);
    $("#send-order").addEventListener("click", () => {
      state.orders += 1;
      const urgency = $("#urgency").selectedIndex;
      const order = { no: `TT-2026-${String(140 + state.orders).padStart(4, "0")}`, partner: $("#partner").value.split(" · ")[0], date: TODAY_ISO, urgency };
      siteFindings(site)[id] = { status: "ordered", order };
      save();
      openModal(`
        <div class="modal__head"><h2 id="modal-title">${L("Työtilaus lähetetty", "Work order sent")}</h2><button class="modal__close" data-close aria-label="${L("Sulje", "Close")}">×</button></div>
        <div class="modal__body success">
          <div class="success__icon">✓</div>
          <h2>${order.no}</h2>
          <p class="muted" style="margin-top:8px">${L(`${esc(order.partner)} sai tilauksen kartan ja datan kanssa.`, `${esc(order.partner)} received the order with map and data.`)}<br>${urgencies[urgency]}.</p>
          <p style="margin-top:14px;font-size:14px">${L("Omistajan ei tarvitse tehdä mitään. Kun urakoitsija kirjaa toimenpiteen, riskiluokka päivittyy ja tapahtuma tallentuu vuosipassiin.", "The owner does not need to do anything. When the contractor logs the work, the risk class updates and the event is recorded in the annual passport.")}</p>
        </div>
        <div class="modal__foot"><button class="button" data-close>${L("Valmis", "Done")}</button></div>`);
      route();
    });
  }

  function resolve(site, id) {
    const f = siteFindings(site)[id];
    siteFindings(site)[id] = { ...f, status: "resolved", resolved: TODAY_ISO };
    save();
    route();
    const r = risk(site);
    toast(L(`Toimenpide kirjattu – riskiluokka nyt ${r.cls} (${r.score}).`, `Work logged – risk class now ${r.cls} (${r.score}).`));
  }

  // ---------- Vuosipassi ----------
  const passUses = () => ({
    vuosi: L("Vuositodistus – takuun vuosikatsaus omistajalle", "Annual certificate – guarantee year in review for the owner"),
    kauppa: L("Kiinteistökauppa – takuu ja passi siirtyvät ostajalle", "Property sale – guarantee and passport transfer to the buyer"),
    luovutus: L("Luovutus – takuu alkaa todistetusti kuivasta katosta", "Handover – the guarantee starts from a verified dry roof"),
  });
  let passUse = "vuosi";

  function hash(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(16).toUpperCase().padStart(8, "0");
  }

  function renderPass(site) {
    const A = analyze(site);
    const P = I.profile();
    const g = guarantee(site);
    const fs = findings(site);
    const act = fs.filter((f) => f.action);
    const uses = passUses();
    const code = hash(JSON.stringify([site.id, A.sensors.length, A.units.length, A.days[0], A.days[A.lastIdx], g.score, act.map((f) => f.state.status)]));
    const passId = `${site.id.slice(0, 3).toUpperCase()}-${code.slice(0, 4)}-${code.slice(4)}`;
    const url = `https://sense.vilpe.com/passi/${passId}`;
    const drying = fs.find((f) => f.id === "drying");
    const items = [];
    if (drying) items.push(["ok", `${drying.title}. ${drying.text}`]);
    const roofUnits = A.units.filter((u) => !/alapohja|ryömintä/i.test(`${u.name} ${u.purpose}`));
    if (roofUnits.length) items.push(["ok", L(`Homeindeksi katolla enintään ${nf(Math.max(...roofUnits.map((u) => u.mold)), 2)} (raja 2,5)`, `Mould index on the roof at most ${nf(Math.max(...roofUnits.map((u) => u.mold)), 2)} (limit 2.5)`)]);
    if (A.fanUptime !== null) items.push(["ok", L(`Kosteudenhallinnan käyntiaste ${n0(A.fanUptime)} %`, `Humidity control running ${n0(A.fanUptime)} % of the time`)]);
    if (A.sensorAvailability !== null) items.push(["ok", L(`Anturien käytettävyys ${n0(A.sensorAvailability)} %`, `Sensor availability ${n0(A.sensorAvailability)} %`)]);
    act.forEach((f) => {
      if (f.state.status === "resolved") items.push(["ok", `${f.passDone} ${fdate(f.state.resolved)}`]);
      else items.push(["warn", `${f.passOpen}${f.state.status === "ordered" ? ` – ${L("työtilaus käynnissä", "work order in progress")}` : ""}`]);
    });
    const devices = [A.sensors.length ? L(`${A.sensors.length} vuotoanturia`, `${A.sensors.length} leak sensors`) : "", A.units.length ? L(`${A.units.length} kosteudenhallintayksikköä`, `${A.units.length} humidity control units`) : ""].filter(Boolean);

    view.innerHTML = `
      <div class="doc-actions">
        <div class="button-row">${siteSelect(site, "passi")}</div>
        <div class="button-row">
          <select id="pass-use" aria-label="${L("Käyttötarkoitus", "Purpose")}" class="select">
            ${Object.entries(uses).map(([k, v]) => `<option value="${k}" ${k === passUse ? "selected" : ""}>${v.split(" – ")[0]}</option>`).join("")}
          </select>
          <button class="button button--hollow" id="copy-link">${L("Kopioi jakolinkki", "Copy share link")}</button>
          <button class="button" id="print">${L("Tulosta / PDF", "Print / PDF")}</button>
        </div>
      </div>
      <article class="doc">
        <header class="doc__head">
          <div>
            <div class="caps" style="color:#E3530F">VILPE Sense+ ${L("Kuiva katto -takuu · vuosipassi", "Dry Roof Guarantee · annual passport")}${A.fullYear ? "" : ` · ${L("väliraportti", "interim report")}`}</div>
            <h1>${esc(site.name)}</h1>
            <p>${uses[passUse]}</p>
          </div>
          <img src="assets/vilpe-logo.svg" alt="VILPE">
        </header>
        <div class="doc__body">
          ${A.fullYear ? "" : `<div class="notice">${L(`Seuranta alkoi ${fdate(A.days[0])}. Tämä väliraportti kattaa ${A.days.length} vrk.`, `Monitoring started ${fdate(A.days[0])}. This interim report covers ${A.days.length} days.`)}</div>`}
          <section class="doc__section">
            <div class="grade">
              <div class="grade__big" style="background:${CLASS_COLOR[g.cls]}">${g.cls}</div>
              <div class="grade__scale" aria-label="${L("Riskiluokka", "Risk class")}">
                ${["A", "B", "C", "D", "E"].map((c, i) => `<div class="grade__step ${c === g.cls ? "is-active" : ""}" style="background:${CLASS_COLOR[c]};width:${62 + i * 9}%">${c}${CLASS_PRICE[c] ? ` · ${perArea(CLASS_PRICE[c])}` : ""}</div>`).join("")}
              </div>
              <div style="flex:1;min-width:220px">
                <div class="caps muted">${L("Riskiluokka", "Risk class")} · ${g.score}/100</div>
                <h2 class="plain" style="font-size:24px;margin:4px 0 8px">${classText(g.cls)}</h2>
                <p style="font-size:14px">${openCount(site) ? L("Toimenpiteiden jälkeen luokka paranee → takuuhinta laskee.", "After the actions the class improves → the guarantee price falls.") : L("Kaikki havainnot hoidettu. Hyvin hoidettu katto halpenee.", "All findings handled. A well-kept roof gets cheaper.")}</p>
              </div>
            </div>
          </section>
          <section class="doc__section">
            <div class="facts">
              <div><b class="num">${fdate(A.days[0])}–<br>${fdate(A.days[A.lastIdx])}</b><span>${L("seurantajakso", "monitoring period")}</span></div>
              <div><b class="num">${A.sensors.length} + ${A.units.length}</b><span>${devices.join(" + ")}</span></div>
              <div><b class="num">${area(site.m2)}</b><span>${L("katto takuun piirissä", "roof under guarantee")}</span></div>
              <div><b class="num">${I.money(g.fee)}</b><span>${L(`takuumaksu/v (${perArea(g.price)})`, `guarantee fee/yr (${perArea(g.price)})`)}</span></div>
            </div>
          </section>
          <section class="doc__section">
            <h2>${L("Havainnot ja toimenpiteet", "Findings and actions")}</h2>
            <ul class="checklist">${items.map(([k, t]) => `<li><span class="${k}">${k === "ok" ? "✔" : "⚠"}</span><span>${t}</span></li>`).join("")}</ul>
          </section>
          <section class="doc__section grid grid--2" style="gap:28px">
            <div>
              <h2>${L("Kuivuminen: rakenne vs. ulkoilma", "Drying: structure vs. outdoor air")}</h2>
              <div id="pass-chart"></div>
            </div>
            <div>
              <h2>${L("Mittauskattavuus ja löydökset", "Coverage and findings")}</h2>
              <div class="mini-map">
                <img src="${site.roof.src}" alt="${L("Laitteiden sijainnit katolla", "Device locations on the roof")}">
                ${A.sensors.map((s) => `<i class="${A.thermal.some((t) => t.s === s) ? "t" : ""}" style="left:${s.pos[0] * 100}%;top:${s.pos[1] * 100}%"></i>`).join("")}
                ${A.units.filter((u) => u.pos).map((u) => `<i class="u" style="left:${u.pos[0] * 100}%;top:${u.pos[1] * 100}%"></i>`).join("")}
              </div>
              <p class="muted" style="font-size:12px;margin-top:6px">${A.sensors.length ? `● ${L("vuotoanturi", "leak sensor")} &nbsp; <span style="color:#E3530F">●</span> ${L("lämpöpoikkeama", "thermal anomaly")} &nbsp; ` : ""}${A.units.length ? `◆ ${L("kosteudenhallintayksikkö", "humidity control unit")}` : ""}</p>
            </div>
          </section>
          <section class="doc__section">
            <h2>${L("Takuu", "Guarantee")}</h2>
            <ul class="checklist" style="font-size:14px">
              <li><span class="ok">✔</span><span>${L(`Voimassa ${fdate(site.contractStart)} alkaen, 10 v · urakoitsija ${esc(P.partners[0])}`, `Valid from ${fdate(site.contractStart)}, 10 yrs · contractor ${esc(P.partners[0])}`)}</span></li>
              <li><span class="ok">✔</span><span>${L("Siirrettävissä uudelle omistajalle kiinteistökaupassa", "Transferable to a new owner in a property sale")}</span></li>
              <li><span class="ok">✔</span><span>${L(`Korjaukset rahastosta enintään ${I.money(REPAIR_CAP)}/v; kauden toimenpiteet ${I.money(g.used)}`, `Repairs from the fund up to ${I.money(REPAIR_CAP)}/yr; this period's work ${I.money(g.used)}`)}</span></li>
            </ul>
            <p class="muted" style="font-size:13px;margin-top:10px">${L("Takuun kytkentä", "Guarantee link")} · ${esc(I.pick(P.name))}: ${esc(I.pick(P.link))}</p>
          </section>
          <section class="doc__section">
            <h2>${L("Varmennus", "Verification")}</h2>
            <div class="verify">
              <div class="verify__qr" id="qr"></div>
              <div style="font-size:14px">
                <div class="caps muted">${L("Passin tunniste", "Passport ID")}</div>
                <b style="font-size:18px" class="num">${passId}</b>
                <p style="margin-top:6px">${L("Tarkista aitous", "Verify authenticity")}: <span style="color:#004F9F">${url.replace("https://", "")}</span></p>
                <p class="muted" style="margin-top:4px;font-size:13px">${L(`Generoitu ${fdate(today)} VILPE Sense -pilven mittausdatasta${site.real ? "" : " (demossa simuloitu)"}. Tietoja ei voi muokata jälkikäteen.`, `Generated ${fdate(today)} from VILPE Sense cloud measurement data${site.real ? "" : " (simulated in the demo)"}. The data cannot be edited afterwards.`)}</p>
              </div>
            </div>
          </section>
        </div>
        <footer class="doc__foot">
          <span>${L("Passi on mittausraportti; takuu on erillinen sopimus.", "The passport is a measurement report; the guarantee is a separate contract.")}</span>
          <span>${L("Data omistajan luvalla", "Data with the owner's consent")} · VILPE Oy, Mustasaari</span>
        </footer>
      </article>`;

    bindSiteSelect();
    const qr = qrcode(0, "M");
    qr.addData(url);
    qr.make();
    $("#qr").innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
    $("#pass-use").addEventListener("change", (e) => { passUse = e.target.value; renderPass(site); });
    $("#print").addEventListener("click", () => window.print());
    $("#copy-link").addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(url); toast(L("Jakolinkki kopioitu leikepöydälle.", "Share link copied to the clipboard.")); } catch (e) { toast(url); }
    });
    ahChart($("#pass-chart"), site, 190, L("Rakenne", "Structure"));
  }

  // ---------- Vakuuttajan näkymä (vaihe 2) ----------
  function renderInsurer() {
    const rows = allSites().map((s) => ({ s, g: guarantee(s), consent: state.consent[s.id] !== false }));
    const shared = rows.filter((r) => r.consent);
    const m2 = shared.reduce((a, r) => a + r.s.m2, 0);
    const fund = shared.reduce((a, r) => a + r.g.fund, 0);
    const used = shared.reduce((a, r) => a + r.g.used, 0);
    const byClass = Object.fromEntries("ABCDE".split("").map((c) => [c, shared.filter((r) => r.g.cls === c).reduce((a, r) => a + r.s.m2, 0)]));
    view.innerHTML = `
      <div class="page-head">
        <div>
          <div class="caps muted">${L("Riskinkantaja · vaihe 2", "Risk bearer · phase 2")} · ${esc(I.role("insurer"))}</div>
          <h1>${L("Vakuuttajan näkymä", "Insurer view")}</h1>
          <p>${L("Hinnoiteltava kattoriski: riskiluokkajakauma ja korjauskulut suhteessa rahastoon. Vakuuttaja näkee vain kohteet, joiden omistaja on antanut suostumuksen.", "Priceable roof risk: risk class distribution and repair costs against the fund. The insurer only sees sites whose owner has consented.")}</p>
        </div>
      </div>
      <div class="summary">
        <div><b class="num">${shared.length}/${rows.length}</b><span>${L("kohdetta jaettu (suostumus)", "sites shared (consent)")}</span></div>
        <div><b class="num">${area(m2)}</b><span>${L("takuun piirissä", "under guarantee")}</span></div>
        <div><b class="num">${I.money(fund)}</b><span>${L("riskiosuus / korjausrahasto vuodessa", "risk share / repair fund per year")}</span></div>
        <div><b class="num" style="color:${used > fund ? "#A3141C" : "#157539"}">${fund ? n0((100 * used) / fund) : 0} %</b><span>${L(`korjauskulut ${I.money(used)} rahastosta`, `repair costs ${I.money(used)} of the fund`)}</span></div>
      </div>
      <div class="grid grid--2">
        <section class="card">
          <div class="card__head"><h2>${L("Riskiluokkajakauma", "Risk class distribution")}</h2><span class="caps">${L("osuus m²:stä", "share of m²")}</span></div>
          <div class="dist">${"ABCDE".split("").map((c) => (byClass[c] ? `<div style="flex:${byClass[c]};background:${CLASS_COLOR[c]}" title="${c}: ${area(byClass[c])}">${c}</div>` : "")).join("") || `<div style="flex:1;background:var(--vilpe-gray-300)">–</div>`}</div>
          <table style="margin-top:14px"><tbody>${"ABCDE".split("").map((c) => `<tr><td>${badge(c, "rclass--sm")} ${classText(c)}</td><td class="r num">${area(byClass[c])}</td><td class="r num">${m2 ? n0((100 * byClass[c]) / m2) : 0} %</td><td class="r muted">${CLASS_PRICE[c] ? `${perArea(CLASS_PRICE[c])}/${yr()}` : L("ei takuuta", "no guarantee")}</td></tr>`).join("")}</tbody></table>
        </section>
        <section class="card">
          <div class="card__head"><h2>${L("Miksi riski on hinnoiteltava", "Why the risk is priceable")}</h2></div>
          <ul class="checklist" style="font-size:14px">
            <li><span class="ok">✔</span><span>${L(`Mittaus rakenteen sisältä: vuoto havaitaan aikaisin ja pienenä (VILPEn tehdas: ${I.money(15000)} vs. ${I.money(60000)}) [R]`, `Measurement inside the structure: leaks are caught early and small (VILPE factory: ${I.money(15000)} vs. ${I.money(60000)}) [R]`)}</span></li>
            <li><span class="ok">✔</span><span>${L("Laitevalvonta: tuuletuksen toiminta varmistetaan 48 h:ssa (Vantaan puhallin seisoi 12 kk huomaamatta) [M]", "Device monitoring: ventilation is verified within 48 h (the Vantaa fan stood still unnoticed for 12 months) [M]")}</span></li>
            <li><span class="ok">✔</span><span>${L("Riskiluokka päivittyy vuosittain → hinta seuraa katon kuntoa", "Risk class updates yearly → price follows roof condition")}</span></li>
            <li><span class="ok">✔</span><span>${L(`Korjaukset rajattu: enintään ${I.money(REPAIR_CAP)}/kohde/v, aloitusluokka vähintään C`, `Repairs capped: up to ${I.money(REPAIR_CAP)}/site/yr, starting class at least C`)}</span></li>
          </ul>
          <p class="muted" style="font-size:13px;margin-top:12px">${L("Vertailuluvut (Suomi) [R]: vuotovahinkoja ~35 000 / v, korvaukset ~171 M€, keskimääräinen vuotovahinko ~5 000 €. Vakuuttajat palkitsevat jo vuotohälyttimiä (2022: 3/9 alennus, 5/9 pienempi omavastuu).", "Reference figures (Finland) [R]: ~35,000 water-damage claims a year, ~€171M paid out, average claim ~€5,000. Insurers already reward leak alarms (2022: 3/9 discount, 5/9 lower deductible).")}</p>
        </section>
      </div>
      <section class="card" style="margin-top:20px">
        <div class="card__head"><h2>${L("Kohteet", "Sites")}</h2><span class="caps">${L("suostumus omistajalta", "owner consent")}</span></div>
        <div class="table-wrap"><table>
          <thead><tr><th>${L("Kohde", "Site")}</th><th>${L("Luokka", "Class")}</th><th class="r">${L("Ala", "Area")}</th><th class="r">${L("Takuumaksu/v", "Fee/yr")}</th><th class="r">${L("Rahasto/v", "Fund/yr")}</th><th class="r">${L("Korjauskulut", "Repair costs")}</th><th>${L("Suostumus", "Consent")}</th></tr></thead>
          <tbody>${rows.map(({ s, g, consent }) => `<tr>
            <td><b>${esc(s.name)}</b><div class="muted" style="font-size:12px">${esc(s.city)}</div></td>
            <td>${consent ? badge(g.cls, "rclass--sm") : "🔒"}</td>
            <td class="r num">${area(s.m2)}</td>
            <td class="r num">${consent ? I.money(g.fee) : "–"}</td>
            <td class="r num">${consent ? I.money(g.fund) : "–"}</td>
            <td class="r num" style="${consent && g.used > g.fund ? "color:#A3141C;font-weight:700" : ""}">${consent ? I.money(g.used) : "–"}</td>
            <td><label class="switch" title="${L("Omistajan suostumus datan jakoon", "Owner consent to data sharing")}"><input type="checkbox" data-consent="${s.id}" ${consent ? "checked" : ""}><span></span></label></td>
          </tr>`).join("")}</tbody>
        </table></div>
        <p class="muted" style="font-size:13px;margin-top:10px">${L("Data on omistajan. Riskiluokka, havainnot ja toimenpidehistoria jaetaan sopimuksen ja suostumuksen perusteella; aggregoitu ja anonymisoitu data riskimallin kehitykseen. Data säilytetään EU:ssa.", "The data belongs to the owner. Risk class, findings and action history are shared based on contract and consent; aggregated and anonymised data improves the risk model. Data is stored in the EU.")}</p>
      </section>`;
    $$("[data-consent]").forEach((c) => c.addEventListener("change", () => {
      state.consent[c.dataset.consent] = c.checked;
      save();
      renderInsurer();
      toast(c.checked ? L("Suostumus annettu – vakuuttaja näkee kohteen riskitiedot.", "Consent given – the insurer can see the site's risk data.") : L("Suostumus peruttu – kohde piilotettu vakuuttajalta.", "Consent withdrawn – site hidden from the insurer."));
    }));
  }

  // ---------- Hinnoittelu ja liiketoimintamalli ----------
  const calc = { m2: 4000, cls: "B" };
  function renderModel() {
    const P = I.profile();
    const roleLabel = { owner: L("Omistaja (maksaja)", "Owner (payer)"), manager: L("Kiinteistön hoitaja (käyttäjä)", "Property manager (user)"), contractor: L("Urakoitsija", "Contractor"), insurer: L("Riskinkantaja", "Risk bearer") };
    view.innerHTML = `
      <div class="page-head">
        <div>
          <div class="caps muted">${L("Liiketoimintamalli", "Business model")}</div>
          <h1>${L("Maksa kuivasta katosta, älä antureista.", "Pay for a dry roof, not for sensors.")}</h1>
          <p>${L("Kiinteä hinta per neliö vuodessa: VILPE tuottaa laitteet ja datan, sertifioitu urakoitsija huoltaa ja korjaa, ja data tekee kattoriskistä hinnoiteltavan.", "A fixed price per square metre per year: VILPE provides hardware and data, a certified contractor maintains and repairs, and the data makes roof risk priceable.")}</p>
        </div>
      </div>
      <div class="lifecycle">
        <div><h3>${L("Kohde löytyy", "Site found")}</h3><b>${L("Urakoitsija / passi", "Contractor / passport")}</b><span>${L("Urakoitsija tarjoaa, luovutuspassi tai vakuuttaja suosittelee", "Contractor offers, handover passport or insurer recommends")}</span></div>
        <div><h3>${L("Aloitus", "Start")}</h3><b>${L("Kartoitus → riskiluokka", "Survey → risk class")}</b><span>${L("Riskiluokka määrää hinnan, vähintään C", "Risk class sets the price, at least C")}</span></div>
        <div><h3>${L("Käyttö 10 v", "Operation 10 yrs")}</h3><b>${L("Valvonta 24/7", "Monitoring 24/7")}</b><span>${L("Vuositarkastus, korjaukset rahastosta, vuosipassi", "Annual inspection, repairs from the fund, annual passport")}</span></div>
        <div><h3>${L("Kauppa / uusinta", "Sale / renewal")}</h3><b>${L("Takuu siirtyy", "Guarantee transfers")}</b><span>${L("Vuosipassi + takuu ostajalle tai sopimus uusitaan", "Annual passport + guarantee to the buyer, or renewal")}</span></div>
      </div>

      <div class="grid grid--2">
        <section class="card calc">
          <div class="card__head"><h2>${L("Hinnoittelulaskuri", "Pricing calculator")}</h2><span class="caps">[H]</span></div>
          <label for="c-m2">${L("Katon pinta-ala", "Roof area")}: <span id="c-m2-v"></span></label>
          <input type="range" id="c-m2" min="500" max="20000" step="500" value="${calc.m2}">
          <label>${L("Riskiluokka", "Risk class")}</label>
          <div class="segmented" role="group" aria-label="${L("Riskiluokka", "Risk class")}">${"ABCD".split("").map((c) => `<button data-cls="${c}" class="${c === calc.cls ? "is-active" : ""}">${c}</button>`).join("")}</div>
          <div class="calc__out" id="c-out"></div>
          <div class="split" id="c-split"></div>
          <div id="c-legend" class="legend legend--stack"></div>
          <p class="muted" style="font-size:12px;margin-top:10px" id="c-note"></p>
        </section>
        <section class="card">
          <div class="card__head"><h2>${L("Tulovirrat", "Revenue streams")}</h2><span class="caps">[H]</span></div>
          <div class="table-wrap"><table>
            <thead><tr><th>${L("Tulovirta", "Stream")}</th><th>${L("Maksaja", "Payer")}</th><th class="r">${L("Hinta", "Price")}</th></tr></thead>
            <tbody>
              <tr><td><b>${L("Kuiva katto -takuu", "Dry Roof Guarantee")}</b><div class="muted" style="font-size:12px">${L("päätuote", "core product")}</div></td><td>${L("Omistaja", "Owner")}</td><td class="r num">${I.money(I.perArea(1.2), 2)}–${perArea(2.0)}/${yr()}</td></tr>
              <tr><td>${L("Aloituskartoitus (ilman Senseä)", "Start survey (without Sense)")}</td><td>${L("Omistaja", "Owner")}</td><td class="r num">${I.money(0)}–${I.money(2000)}</td></tr>
              <tr><td>${L("Kosteuspassi erikseen", "Moisture passport separately")}<div class="muted" style="font-size:12px">${L("syöttökanava", "feeder channel")}</div></td><td>${L("Rakennuttaja, myyjä", "Developer, seller")}</td><td class="r num">${I.money(290)}–${I.money(3000)}</td></tr>
              <tr><td>${L("Kuivumisennuste", "Drying forecast")}<div class="muted" style="font-size:12px">${L("syöttökanava, ehdollinen", "feeder channel, conditional")}</div></td><td>${L("Rakennusliike", "Construction company")}</td><td class="r num">${I.money(1000)}–${I.money(3000)}</td></tr>
              <tr><td>${L("Riskiluokan korjaukset", "Risk-class repairs")}<div class="muted" style="font-size:12px">${L("lisämyynti", "upsell")}</div></td><td>${L("Omistaja", "Owner")}</td><td class="r">${L("VILPEn tuotteet + työ", "VILPE products + labour")}</td></tr>
            </tbody>
          </table></div>
          <p class="quote" style="margin-top:18px">${L("Yksi myöhään löydetty vuoto maksaa enemmän kuin kymmenen vuotta takuuta.", "One late-found leak costs more than ten years of guarantee.")}</p>
        </section>
      </div>

      <div class="grid grid--2" style="margin-top:20px">
        <section class="card">
          <div class="card__head"><h2>${L("VILPEn esimerkkiskenaario", "VILPE example scenario")}</h2><span class="caps">[H] · EUR</span></div>
          <div class="table-wrap"><table>
            <thead><tr><th>${L("Vuosi", "Year")}</th><th class="r">${L("Takuu-m²", "Guarantee m²")}</th><th class="r">${L("Takuutulo", "Guarantee")}</th><th class="r">${L("Passit", "Passports")}</th><th class="r">${L("Ennusteet", "Forecasts")}</th><th class="r">${L("Yhteensä", "Total")}</th></tr></thead>
            <tbody>
              <tr><td>1 · ${L("pilotti", "pilot")}</td><td class="r num">${n0(20000)}</td><td class="r num">0</td><td class="r num">${nd(0.02, 2)} M€</td><td class="r num">0</td><td class="r num"><b>~${nd(0.02, 2)} M€</b></td></tr>
              <tr><td>2</td><td class="r num">${n0(200000)}</td><td class="r num">${nd(0.18, 2)} M€</td><td class="r num">${nd(0.1, 2)} M€</td><td class="r num">${nd(0.06, 2)} M€</td><td class="r num"><b>~${nd(0.34, 2)} M€</b></td></tr>
              <tr><td>3</td><td class="r num">${n0(1000000)}</td><td class="r num">${nd(0.9, 2)} M€</td><td class="r num">${nd(0.24, 2)} M€</td><td class="r num">${nd(0.15, 2)} M€</td><td class="r num"><b>~${nd(1.29, 2)} M€</b></td></tr>
            </tbody>
          </table></div>
          <p class="muted" style="font-size:13px;margin-top:12px">${L("VILPEn osuus 0,9 €/m²/v, passi ~400 €, ennuste ~3 000 €/projekti. 1 000 000 m² ≈ 250 logistiikkahallia. Takuutulo on kumulatiivista 10 vuoden sopimuksilla.", "VILPE share €0.9/m²/yr, passport ~€400, forecast ~€3,000/project. 1,000,000 m² ≈ 250 logistics halls. Guarantee revenue is cumulative on 10-year contracts.")}</p>
        </section>
        <section class="card">
          <div class="card__head"><h2>${L("VILPEn hinnasto 2025", "VILPE price list 2025")}</h2><span class="caps">[R] · ${L("alv 0 %", "excl. VAT")}</span></div>
          <div class="table-wrap"><table>
            <thead><tr><th>${L("Tuote", "Product")}</th><th>${L("Tuotenro", "No.")}</th><th class="r">${L("Hinta", "Price")}</th></tr></thead>
            <tbody>${Object.values(PRICE_LIST).map((p) => `<tr><td>${esc(L(p.fi, p.en))}</td><td class="num">${p.no}</td><td class="r num">${I.money(p.eur, p.eur % 1 ? 2 : 0)}</td></tr>`).join("")}</tbody>
          </table></div>
          <p class="muted" style="font-size:13px;margin-top:10px">${L(`Vuotovalvonta ~${I.money(I.perArea(2.9), 1)}/${I.areaUnit()} + tukiasema; kosteudenhallinta ~${I.money(1637)}/huippuimuri. Vantaan kohde ~${I.money(15600)}. Sensessä ei ole tänään toistuvaa maksua.`, `Leak detection ~${I.money(I.perArea(2.9), 1)}/${I.areaUnit()} + base station; humidity control ~${I.money(1637)} per roof fan. The Vantaa site ~${I.money(15600)}. Sense has no recurring fee today.`)}</p>
        </section>
      </div>

      <div class="grid grid--2" style="margin-top:20px">
        <section class="card">
          <div class="card__head"><h2>${L("Maaprofiili", "Country profile")}: ${esc(I.pick(P.name))}</h2><span class="caps">${L("roolit, ei instituutiot", "roles, not institutions")}</span></div>
          <table class="profile-table"><tbody>
            ${["owner", "manager", "contractor", "insurer"].map((k) => { const r = P.roles[k]; return `<tr><th>${roleLabel[k]}</th><td>${esc(L(r.fi, r.en))}${r.local ? ` <span class="muted">· ${esc(r.local)}</span>` : ""}</td></tr>`; }).join("")}
            <tr><th>${L("Takuun kytkentä", "Guarantee link")}</th><td>${esc(I.pick(P.link))}</td></tr>
            <tr><th>${L("Yksiköt ja valuutta", "Units and currency")}</th><td>${I.tempUnit()} · ${I.areaUnit()} · ${P.currency}${P.currency !== "EUR" ? ` <span class="muted">(${L("arvioitu kurssi", "estimated rate")} ${nd(P.rate, 2)}/€)</span>` : ""}</td></tr>
            <tr><th>${L("Kieli", "Language")}</th><td>${L("suomi ja englanti", "Finnish and English")}</td></tr>
          </tbody></table>
        </section>
        <section class="card">
          <div class="card__head"><h2>${L("Takuu eri maissa", "The guarantee by country")}</h2><span class="caps">${L("klikkaa vaihtaaksesi", "click to switch")}</span></div>
          <div class="table-wrap"><table>
            <thead><tr><th>${L("Maa", "Country")}</th><th>${L("Takuun kytkentä", "Guarantee link")}</th></tr></thead>
            <tbody>${I.ORDER.map((c) => `<tr class="is-clickable ${c === I.country ? "is-selected" : ""}" data-country="${c}"><td><b>${esc(I.pick(I.PROFILES[c].name))}</b></td><td style="font-size:13px">${esc(I.pick(I.PROFILES[c].link))}</td></tr>`).join("")}</tbody>
          </table></div>
        </section>
      </div>`;

    const update = () => {
      const m2 = calc.m2;
      const price = CLASS_PRICE[calc.cls];
      const fee = price * m2;
      const parts = splitOf(price);
      const sensors = Math.ceil(m2 / 20);
      const hw = hardware(sensors, 0, m2);
      const hwShare = parts[0].value * m2;
      $("#c-m2-v").textContent = area(m2);
      $("#c-out").innerHTML = `
        <div><b class="num">${perArea(price)}</b><span>${L("takuumaksu", "guarantee fee")} / ${yr()}</span></div>
        <div><b class="num">${I.money(fee)}</b><span>${L(`vuodessa · ${I.money(fee / 12)}/kk`, `per year · ${I.money(fee / 12)}/mo`)}</span></div>
        <div><b class="num">${I.money((parts[0].value + parts[1].value) * m2)}</b><span>${L("VILPEn osuus / v", "VILPE share / yr")}</span></div>`;
      $("#c-split").innerHTML = parts.map((p) => `<div style="flex:${p.value};background:${p.color}" title="${esc(L(p.fi, p.en))}"></div>`).join("");
      $("#c-legend").innerHTML = parts.map((p) => `<span class="legend__item"><span class="legend__swatch legend__swatch--bar" style="background:${p.color}"></span>${esc(L(p.fi, p.en))} · ${perArea(p.value)} · <b>${I.money(p.value * m2)}</b></span>`).join("");
      $("#c-note").textContent = L(`Laitteisto hinnaston mukaan: ${sensors} anturia + tukiasema ${I.money(hw.list)} + asennus ~${I.money(hw.install)} [H] → laitteisto-osuus kattaa laitteiston ~${n1(hw.total / hwShare)} vuodessa.${calc.cls === "D" ? " Luokka D: korjaukset ennen takuun alkua." : ""}`, `Hardware at list prices: ${sensors} sensors + base station ${I.money(hw.list)} + installation ~${I.money(hw.install)} [H] → the hardware share covers it in ~${n1(hw.total / hwShare)} years.${calc.cls === "D" ? " Class D: repairs required before the guarantee starts." : ""}`);
    };
    $("#c-m2").addEventListener("input", (e) => { calc.m2 = +e.target.value; update(); });
    $$("[data-cls]").forEach((b) => b.addEventListener("click", () => { calc.cls = b.dataset.cls; $$("[data-cls]").forEach((x) => x.classList.toggle("is-active", x === b)); update(); }));
    update();
    $$("[data-country]").forEach((row) => row.addEventListener("click", () => switchCountry(row.dataset.country)));
  }

  // ---------- Maa ja kieli ----------
  function renderLocaleControls() {
    $("#locale").innerHTML = `
      <select id="country" class="locale__country" aria-label="${L("Maaprofiili", "Country profile")}" title="${L("Maaprofiili", "Country profile")}">${I.ORDER.map((c) => `<option value="${c}" ${c === I.country ? "selected" : ""}>${c} · ${esc(I.pick(I.PROFILES[c].name))}</option>`).join("")}</select>
      <div class="locale__lang" role="group" aria-label="${L("Kieli", "Language")}">
        <button data-lang="fi" class="${I.lang === "fi" ? "is-active" : ""}" aria-pressed="${I.lang === "fi"}">FI</button>
        <button data-lang="en" class="${I.lang === "en" ? "is-active" : ""}" aria-pressed="${I.lang === "en"}">EN</button>
      </div>`;
    $("#country").addEventListener("change", (e) => switchCountry(e.target.value));
    $$("[data-lang]").forEach((b) => b.addEventListener("click", () => { I.setLang(b.dataset.lang); route(); }));
  }
  function switchCountry(code) {
    I.setCountry(code);
    route();
    toast(L(`Maaprofiili: ${I.pick(I.PROFILES[code].name)} – termit, yksiköt ja valuutta päivitetty.`, `Country profile: ${I.pick(I.PROFILES[code].name)} – terms, units and currency updated.`));
  }

  function renderChrome() {
    document.documentElement.lang = I.lang;
    Charts.locale = I.locale();
    const NAV = {
      salkku: L("Takuusalkku", "Portfolio"), kohde: L("Takuukohde", "Site"), passi: L("Vuosipassi", "Annual passport"),
      vakuuttaja: L("Vakuuttaja", "Insurer"), malli: L("Hinnoittelu", "Pricing"),
    };
    $$("#nav a").forEach((a) => { a.textContent = NAV[a.dataset.view]; });
    $("#footer-a").textContent = L("VILPE Sense+ Kuiva katto -takuu · prototyyppi · VILPE x Vaasa Hackathon 2026", "VILPE Sense+ Dry Roof Guarantee · prototype · VILPE x Vaasa Hackathon 2026");
    $("#footer-b").textContent = L("VILPE Express Store, Vantaa: oikea data (9/2025–9/2026). Hallien data on simuloitu (12 kk), kumppanit kuvitteellisia. [H] = hypoteesi.", "VILPE Express Store, Vantaa: real data (9/2025–9/2026). Hall data is simulated (12 months); partners are fictional. [H] = hypothesis.");
    $("#reset").textContent = L("Nollaa demo", "Reset demo");
    renderLocaleControls();
  }

  // ---------- Reititys ----------
  const ROUTES = {
    salkku: { render: renderPortfolio },
    kohde: { render: renderSite, site: true },
    passi: { render: renderPass, site: true },
    vakuuttaja: { render: renderInsurer },
    malli: { render: renderModel },
  };

  function route() {
    stopPlay();
    renderChrome();
    document.body.classList.toggle("is-locked", !loggedIn());
    if (!loggedIn()) { renderLogin(); return; }
    const [key0, siteId] = location.hash.replace(/^#\/?/, "").split("/");
    const key = ROUTES[key0] ? key0 : "salkku";
    const r = ROUTES[key];
    if (siteId && allSites().some((s) => s.id === siteId) && state.current !== siteId) { state.current = siteId; save(); }
    const site = currentSite();
    $$("#nav a").forEach((a) => {
      a.classList.toggle("is-active", a.dataset.view === key);
      if (ROUTES[a.dataset.view].site && site) a.setAttribute("href", `#/${a.dataset.view}/${site.id}`);
    });
    $("#user").innerHTML = `<div class="user__avatar">VD</div><div>${DEMO_USER}<small>${esc(I.role("manager"))}</small></div><button class="link-button user__logout" id="logout">${L("Kirjaudu ulos", "Sign out")}</button>`;
    $("#logout").addEventListener("click", logout);
    if (r.site) {
      if (!site) { noSites(); return; }
      r.render(site);
    } else {
      r.render();
    }
  }

  let lastKey = null;
  window.addEventListener("hashchange", () => {
    const key = location.hash.replace(/^#\/?/, "") || "salkku";
    route();
    if (key !== lastKey) window.scrollTo(0, 0);
    lastKey = key;
  });
  window.addEventListener("resize", () => { const s = currentSite(); if ($("#heat") && s) updateMap(s); });
  $("#reset").addEventListener("click", () => {
    state = fresh();
    save();
    siteCache.forEach((_, id) => { if (id !== "vantaa" && !window.SenseSim.PRESETS.some((p) => p.id === id)) siteCache.delete(id); });
    ui.siteId = null;
    route();
    toast(L("Demo nollattu.", "Demo reset."));
  });
  route();
})();
