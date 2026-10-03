/* VILPE Sense+ – klikattava prototyyppi.
   Kohteet: VILPE Express Store Vantaa (oikea data, data.js) + simuloidut taloyhtiöt (sim.js).
   Analytiikka (laitevalvonta, naapurivertailu, offline-tunnistus, Health Score)
   lasketaan selaimessa jokaiselle kohteelle samoilla säännöillä.
   Maaprofiili ja kieli (i18n.js) vaihtavat termit, yksiköt, valuutan ja säädöskytkennän. */
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
  const nd = (v, d) => v.toLocaleString(I.locale(), { maximumFractionDigits: d });
  const pct = (v) => (v > 99.9 && v < 100 ? n1(99.9) : n1(v));
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
  const today = new Date();
  const TODAY_ISO = today.toISOString().slice(0, 10);
  const addDays = (iso, n) => new Date(parseDay(iso).getTime() + n * 864e5).toISOString().slice(0, 10);
  const plural = (n, one, many) => (n === 1 ? one : many);

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

  // ---------- Tila (demon kulku) ----------
  const STORE = "vilpe-senseplus-demo-v2";
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
    newBuild: true,
    name: V.site.name,
    city: "Vantaa",
    type: "Liikekiinteistö · tasa- ja viherkatto",
    typeEn: "Commercial · flat and green roof",
    structureFi: V.site.structure,
    structureEn: "Concrete · flat roof + green roof + crawl space",
    apartments: null,
    roof: { ...V.roof, src: "assets/roof.jpg" },
    events: [{ d: "2025-05-13", cls: "info", t: "Katto ja ryömintätilainen alapohja valmistuneet, Sense-seuranta alkaa (7 imuria, 51 anturia)", tEn: "Roof and crawl space completed, Sense monitoring starts (7 roof fans, 51 sensors)" }],
  };
  const siteType = (s) => (s.typeEn ? L(s.type, s.typeEn) : typeLabel(s.type));
  const siteStructure = (s) => (s.structureFi ? L(s.structureFi, s.structureEn) : `${typeLabel(s.type)}${s.built ? ` · ${L(s.built, s.builtEn)}` : ""}`);
  const siteCache = new Map([["vantaa", VANTAA]]);
  const siteFor = (cfg) => {
    if (!siteCache.has(cfg.id)) siteCache.set(cfg.id, window.SenseSim.simulate(cfg));
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

  // ---------- Analytiikkakerros ----------
  const analysisCache = new Map();
  function analyze(site) {
    if (analysisCache.has(site.id)) return analysisCache.get(site.id);
    const days = site.days;
    const lastIdx = days.length - 1;
    const units = site.units;
    const sensors = site.sensors;

    // Naapurivertailu: 6 lähintä anturia kattokartalla
    sensors.forEach((s) => {
      s.neighbors = sensors
        .filter((o) => o !== s)
        .map((o) => [o, Math.hypot((o.pos[0] - s.pos[0]) * site.roof.w, (o.pos[1] - s.pos[1]) * site.roof.h)])
        .sort((a, b) => a[1] - b[1])
        .slice(0, 6)
        .map(([o]) => o);
      s.nbMedian = days.map((_, i) => { const v = s.neighbors.map((o) => o.rh[i]).filter((x) => x !== null); return v.length ? median(v) : null; });
      let rhDays = 0;
      let tDays = 0;
      days.forEach((_, i) => {
        const rhN = s.neighbors.map((o) => o.rh[i]).filter((x) => x !== null);
        const tN = s.neighbors.map((o) => o.t[i]).filter((x) => x !== null);
        if (s.rh[i] !== null && rhN.length >= 3 && s.rh[i] - median(rhN) > Math.max(3 * sd(rhN), 10)) rhDays++;
        if (s.t[i] !== null && tN.length >= 3 && median(tN) - s.t[i] > 4) tDays++;
      });
      s.anomalyDays = rhDays + tDays;
      s.rhAnomalyDays = rhDays;
      s.tAnomalyDays = tDays;
    });
    const anomalyMin = Math.max(5, Math.round(days.length * 0.068));
    const anomalies = sensors.filter((s) => s.anomalyDays >= anomalyMin).sort((a, b) => b.anomalyDays - a.anomalyDays);
    const others = sensors.filter((s) => !anomalies.includes(s));

    // Offline: ei mittausta > 36 h (anturit lähettävät 2 × vrk)
    const newest = Math.max(...sensors.map((s) => new Date(s.last.ts).getTime()), 0);
    const offline = sensors.filter((s) => newest - new Date(s.last.ts).getTime() > 36 * 3600e3).map((s) => {
      s.offlineDays = Math.max(1, Math.round((newest - new Date(s.last.ts).getTime()) / 864e5));
      return s;
    });

    // Laitevalvonta: puhallin seis ≥ 48 h, pakkassuojaus (ulko < −5 °C) ei ole vika
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

    const molds = units.map((u) => u.mold);
    const maxMold = molds.length ? Math.max(...molds) : null;
    const riskUnit = units.length ? units.reduce((a, b) => (b.mold > a.mold ? b : a)) : null;
    const monthly = site.networkMonthly;
    const firstMonth = monthly[0];
    const driest = monthly.reduce((a, b) => (b.rh < a.rh ? b : a));
    const wettest = monthly.reduce((a, b) => (b.rh > a.rh ? b : a));
    const lastMonth = monthly[monthly.length - 1];
    const rhNow = sensors.length ? avg(sensors.filter((s) => !offline.includes(s)).map((s) => s.last.rh)) : avg(units.map((u) => u.days[u.days.length - 1].rhIn));

    let safeShare;
    let safeKind;
    if (sensors.length) {
      let ok = 0;
      let all = 0;
      sensors.forEach((s) => s.rh.forEach((v) => { if (v !== null) { all++; if (v < 80) ok++; } }));
      safeShare = (100 * ok) / all;
      safeKind = "sensors";
    } else {
      const all = units.flatMap((u) => u.days.map((d) => d.rhIn)).filter((x) => x !== null);
      safeShare = (100 * all.filter((x) => x < 90).length) / all.length;
      safeKind = "units";
    }
    const overShare = units.length ? avg(units.map((u) => u.rhIn90)) : 100 - safeShare;
    const sensorDays = sensors.reduce((a, s) => a + s.rh.filter((x) => x !== null).length, 0);
    const result = {
      days, lastIdx, units, sensors,
      unitBy: Object.fromEntries(units.map((u) => [u.name, u])),
      sensorBy: Object.fromEntries(sensors.map((s) => [s.id, s])),
      anomalies, offline, stopped, maxMold, riskUnit,
      othersTMin: others.length ? Math.min(...others.map((s) => s.tMin)) : null,
      othersRhMax: others.length ? Math.max(...others.map((s) => s.rhMax)) : null,
      firstMonth, driest, wettest, lastMonth, rhNow, safeShare, safeKind, overShare,
      fanUptime: units.length ? avg(units.map((u) => u.on)) : null,
      sensorAvailability: sensors.length ? (100 * sensorDays) / (sensors.length * days.length) : null,
      measurements: site.real ? sensors.reduce((a, s) => a + s.n, 0) : sensors.reduce((a, s) => a + s.n, 0) + units.length * days.length * 12,
      fullYear: days.length >= 330,
    };
    analysisCache.set(site.id, result);
    return result;
  }
  const safeLabel = (A) => (A.safeKind === "sensors"
    ? L("anturipäivistä turvallisella alueella (vrk-keskiarvo RH < 80 %)", "of sensor-days in the safe range (daily mean RH < 80 %)")
    : L("päivistä rakenteen RH alle 90 %", "of days with structural RH below 90 %"));

  const siteFindings = (site) => (state.findings[site.id] = state.findings[site.id] || {});
  const fState = (site, id) => siteFindings(site)[id] || { status: "open" };

  function findings(site) {
    const A = analyze(site);
    const list = [];
    A.stopped.forEach((u) => {
      const n = uName(u);
      list.push({
        id: `fan-${u.serial}`,
        kind: "device",
        level: "alert",
        title: L(`${n}: puhallin ei ole käynyt ${n0(u.stopDays)} vrk`, `${n}: fan has not run for ${n0(u.stopDays)} days`),
        text: u.ongoing
          ? L(`Puhallin on ollut pysähdyksissä ${fdate(u.stopFrom)} lähtien. Rakenteen kosteus on noussut ${n1(u.stopPeak)} %:iin (kk-ka.).`, `The fan has been stopped since ${fdate(u.stopFrom)}. Structural humidity has risen to ${n1(u.stopPeak)} % (monthly mean).`)
          : L(`Puhallin oli pysähdyksissä ${fdate(u.stopFrom)}–${fdate(u.stopTo)}${u.on < 50 ? `, ja käy edelleen vain ${n0(u.on)} % ajasta` : ""}. Rakenteen kosteus nousi seisokin aikana ${n1(u.stopPeak)} %:iin (kk-ka.).`,
            `The fan was stopped ${fdate(u.stopFrom)}–${fdate(u.stopTo)}${u.on < 50 ? ` and still runs only ${n0(u.on)} % of the time` : ""}. Structural humidity rose to ${n1(u.stopPeak)} % (monthly mean) during the stop.`),
        evidence: L(`Sääntö: rpm = 0 yli 48 h (pakkaspäiviä alle ${tmp(-5)} ei lasketa) ja sisä-AH > ulko-AH → tuuletus olisi kannattanut ${u.ventLost} päivänä. Sense+ olisi hälyttänyt ${fdate(u.alertDay)}.`,
          `Rule: rpm = 0 for over 48 h (frost days below ${tmp(-5)} excluded) and indoor AH > outdoor AH → ventilation would have helped on ${u.ventLost} days. Sense+ would have alerted on ${fdate(u.alertDay)}.`),
        plain: L(`Huippuimuri (${n}) ei käynyt ${n0(u.stopDays)} vuorokauteen, ja rakenteen kosteus nousi ${n0(u.stopPeak)} %:iin.`, `A roof fan (${n}) did not run for ${n0(u.stopDays)} days, and structural humidity rose to ${n0(u.stopPeak)} %.`),
        pts: L(`${n}: puhaltimen huolto, vaihto jos vika toistuu (~${I.price(600)}).`, `${n}: fan service, replace if the fault recurs (~${I.price(600)}).`),
        passOpen: L(`1 kosteudenhallintayksikkö (${n}) ei toiminut ${n0(u.stopDays)} vrk`, `1 humidity control unit (${n}) out of action for ${n0(u.stopDays)} days`),
        passDone: L(`${n}: puhallin seis ${n0(u.stopDays)} vrk – huollettu`, `${n}: fan stopped ${n0(u.stopDays)} days – serviced`),
        action: L("Tilaa huolto", "Order service"),
        target: { type: "unit", name: u.name },
        orderText: L(`Huippuimurin ${n} (${u.serial}) puhallin ei käy. Laite on ollut pysähdyksissä ${fdate(u.stopFrom)}${u.ongoing ? " lähtien" : `–${fdate(u.stopTo)}`}. Pyydämme tarkistamaan puhaltimen, kytkennät ja MCU-2-ohjausyksikön asetukset.`,
          `The fan of roof fan unit ${n} (${u.serial}) is not running. It has been stopped ${u.ongoing ? `since ${fdate(u.stopFrom)}` : `${fdate(u.stopFrom)}–${fdate(u.stopTo)}`}. Please check the fan, wiring and MCU-2 control unit settings.`),
        weight: 25,
      });
    });
    A.offline.forEach((s) => {
      list.push({
        id: `offline-${s.id}`,
        kind: "device",
        level: "warn",
        title: L(`Anturi ${s.id} ei ole lähettänyt dataa ${s.offlineDays} vrk`, `Sensor ${s.id} has not reported for ${s.offlineDays} ${plural(s.offlineDays, "day", "days")}`),
        text: L(`Viimeisin mittaus ${fdate(s.last.ts)}. Anturi lähettää normaalisti kaksi kertaa vuorokaudessa, joten tämä katon alue on nyt valvonnan ulkopuolella.`, `Last reading ${fdate(s.last.ts)}. The sensor normally reports twice a day, so this part of the roof is currently unmonitored.`),
        evidence: L("Sääntö: ei mittausta yli 36 h. Todennäköinen syy: yhteyskatko tukiasemaan tai anturivika (akku mitoitettu 15 vuodelle).", "Rule: no reading for over 36 h. Likely cause: lost connection to the base station or a sensor fault (battery rated for 15 years)."),
        plain: L(`Yksi vuotoanturi (${s.id}) lakkasi lähettämästä dataa, joten osa katosta on valvonnan ulkopuolella.`, `One leak sensor (${s.id}) stopped reporting, so part of the roof is unmonitored.`),
        pts: L(`Anturin ${s.id} tarkistus tai vaihto (~${I.price(145)}).`, `Check or replace sensor ${s.id} (~${I.price(145)}).`),
        passOpen: L(`1 anturi (${s.id}) ilman yhteyttä ${s.offlineDays} vrk`, `1 sensor (${s.id}) offline for ${s.offlineDays} days`),
        passDone: L(`Anturi ${s.id}: yhteys palautettu`, `Sensor ${s.id}: connection restored`),
        action: L("Tilaa huolto", "Order service"),
        target: { type: "sensor", id: s.id, day: s.last.ts.slice(0, 10) },
        orderText: L(`Vuotoanturi ${s.id} ei ole lähettänyt mittauksia ${fdate(s.last.ts)} jälkeen. Pyydämme tarkistamaan anturin ja yhteyden tukiasemaan. Sijainti kosteuskartalla liitteenä.`, `Leak sensor ${s.id} has not reported since ${fdate(s.last.ts)}. Please check the sensor and its connection to the base station. Location on the humidity map attached.`),
        weight: 8,
      });
    });
    A.anomalies.forEach((s) => {
      const valid = (arr) => arr.filter((x) => x !== null);
      const tMinDay = A.days[s.t.indexOf(Math.min(...valid(s.t)))];
      const rhMaxDay = A.days[s.rh.indexOf(Math.max(...valid(s.rh)))];
      const parts = [
        s.rhAnomalyDays ? L(`RH nousi ${n1(s.rhMax)} %:iin (muiden maksimi ${n1(A.othersRhMax)} %)`, `RH rose to ${n1(s.rhMax)} % (others' maximum ${n1(A.othersRhMax)} %)`) : "",
        s.tAnomalyDays ? L(`lämpötila laski ${tmp(s.tMin)}:een (muiden minimi ${tmp(A.othersTMin)})`, `temperature fell to ${tmp(s.tMin)} (others' minimum ${tmp(A.othersTMin)})`) : "",
      ].filter(Boolean).join(L(" ja ", " and "));
      const leakish = s.rhAnomalyDays && !s.tAnomalyDays;
      list.push({
        id: `sensor-${s.id}`,
        kind: "sensor",
        level: "warn",
        title: L(`Anturi ${s.id} poikkeaa naapureistaan`, `Sensor ${s.id} deviates from its neighbours`),
        text: `${parts.charAt(0).toUpperCase()}${parts.slice(1)}. ${leakish
          ? L("Kosteus nousee sateiden jälkeen vain tällä alueella – todennäköinen vuoto vedeneristeessä tai läpiviennissä.", "Humidity rises after rain only in this area – a likely leak in the waterproofing or a penetration.")
          : L("Mahdollinen vuoto, kylmäsilta, läpivienti tai paikallinen kosteuslähde.", "Possible leak, thermal bridge, penetration or local moisture source.")}`,
        evidence: L(`Sääntö: RH > naapurien mediaani + 3σ tai T < mediaani − ${tmpDelta(4)}. Poikkeama ${s.anomalyDays} päivänä (RH ${s.rhAnomalyDays}, T ${s.tAnomalyDays}). Kostein päivä ${fdate(rhMaxDay)}, kylmin ${fdate(tMinDay)}.`,
          `Rule: RH > neighbours' median + 3σ or T < median − ${tmpDelta(4)}. Deviation on ${s.anomalyDays} days (RH ${s.rhAnomalyDays}, T ${s.tAnomalyDays}). Wettest day ${fdate(rhMaxDay)}, coldest ${fdate(tMinDay)}.`),
        plain: L(`Yksi katon anturi (${s.id}) näyttää muita kosteampaa${s.tAnomalyDays ? " ja kylmempää" : ""}. Alue kannattaa tarkastaa.`, `One roof sensor (${s.id}) reads wetter${s.tAnomalyDays ? " and colder" : ""} than the rest. The area should be inspected.`),
        pts: L(`Katon tarkastus anturin ${s.id} alueelta.`, `Roof inspection around sensor ${s.id}.`),
        passOpen: L(`1 poikkeama-alue tunnistettu (anturi ${s.id})`, `1 anomaly area identified (sensor ${s.id})`),
        passDone: L(`Poikkeama-alue (anturi ${s.id}) tarkastettu`, `Anomaly area (sensor ${s.id}) inspected`),
        action: L("Tilaa tarkastus", "Order inspection"),
        target: { type: "sensor", id: s.id, day: rhMaxDay },
        orderText: L(`Vuotoanturi ${s.id} poikkeaa jatkuvasti naapuriantureistaan (max ${n1(s.rhMax)} % RH, min ${tmp(s.tMin)}). Pyydämme tarkastamaan katon alueen anturin ympäriltä: vedeneriste, läpiviennit, reuna-alueet ja mahdolliset kylmäsillat. Sijainti kosteuskartalla liitteenä.`,
          `Leak sensor ${s.id} consistently deviates from neighbouring sensors (max ${n1(s.rhMax)} % RH, min ${tmp(s.tMin)}). Please inspect the roof around the sensor: waterproofing, penetrations, edges and possible thermal bridges. Location on the humidity map attached.`),
        weight: 10,
      });
    });
    const actionableCount = list.filter((f) => f.action).length;
    if (A.riskUnit && A.riskUnit.mold > 0.3) {
      const u = A.riskUnit;
      list.push({
        id: "risk-unit",
        kind: "info",
        level: "info",
        title: L(`${uName(u)} on kohteen riskialttein osa`, `${uName(u)} is the riskiest part of the site`),
        text: L(`Homeindeksi ${n1(u.mold)} (hälytysraja 2,5). Rakenteen RH yli 90 % ${n0(u.rhIn90)} % ajasta, vaikka puhallin käy ${n0(u.on)} % ajasta.`, `Mould index ${n1(u.mold)} (alert limit 2.5). Structural RH above 90 % for ${n0(u.rhIn90)} % of the time, although the fan runs ${n0(u.on)} % of the time.`),
        evidence: L("Seurannassa. Suositus PTS:ään: tuuletuksen tehostus, jos homeindeksi ylittää 1,0.", "Being monitored. Long-term plan: boost ventilation if the mould index exceeds 1.0."),
        pts: L(`${uName(u)}: tuuletuksen tehostus, jos homeindeksi ylittää 1,0.`, `${uName(u)}: boost ventilation if the mould index exceeds 1.0.`),
      });
    }
    if (site.newBuild) {
      list.push({
        id: "drying",
        kind: "info",
        level: "ok",
        title: L("Rakennuskosteus on kuivunut", "Construction moisture has dried out"),
        text: L(`Katon anturiston RH laski ${n1(A.firstMonth.rh)} %:sta ${n1(A.driest.rh)} %:iin (${month(A.driest.m)}). Kesän nousu seuraa ulkoilmaa eikä yllä kriittisiin lukemiin.`, `Roof sensor RH fell from ${n1(A.firstMonth.rh)} % to ${n1(A.driest.rh)} % (${month(A.driest.m)}). The summer rise follows outdoor air and stays well below critical levels.`),
        evidence: `${pct(A.safeShare)} % ${safeLabel(A)}.`,
      });
    } else {
      list.push({
        id: "stable",
        kind: "info",
        level: "ok",
        title: actionableCount ? L("Kosteustaso muuten normaali", "Humidity otherwise normal") : L("Kosteustaso on normaali", "Humidity is normal"),
        text: L(`Rakenteen kosteus vaihteli kuukausitasolla ${n1(A.driest.rh)}–${n1(A.wettest.rh)} % (${month(A.firstMonth.m)}–${month(A.lastMonth.m)}). Vaihtelu seuraa vuodenaikoja eikä yllä kriittisiin lukemiin.`, `Monthly structural humidity ranged ${n1(A.driest.rh)}–${n1(A.wettest.rh)} % (${month(A.firstMonth.m)}–${month(A.lastMonth.m)}). The variation follows the seasons and stays below critical levels.`),
        evidence: `${pct(A.safeShare)} % ${safeLabel(A)}.`,
      });
    }
    return list.map((f) => ({ ...f, state: fState(site, f.id) }));
  }
  const actionable = (site) => findings(site).filter((f) => f.action);
  const openCount = (site) => actionable(site).filter((f) => f.state.status !== "resolved").length;

  // Health Score: 100 − homeriski (30) − aika yli RH-rajan (25) − laiteviat (25) − avoimet poikkeamat (20)
  function health(site) {
    const A = analyze(site);
    const w = (f) => (f.state.status === "open" ? 1 : f.state.status === "ordered" ? 0.5 : 0);
    const fs = actionable(site);
    const mold = A.maxMold === null ? 0 : Math.min(30, (A.maxMold / 2.5) * 30);
    const rh = (A.overShare / 100) * 25;
    const dev = Math.min(25, fs.filter((f) => f.kind === "device").reduce((a, f) => a + f.weight * w(f), 0));
    const ano = Math.min(20, fs.filter((f) => f.kind === "sensor").reduce((a, f) => a + f.weight * w(f), 0));
    return { score: Math.round(100 - mold - rh - dev - ano), parts: { mold, rh, dev, ano } };
  }
  const level = (score) => (score >= 75 ? "ok" : score >= 50 ? "warn" : "alert");
  // Liikennevalo: avoin havainto pitää kohteen vähintään keltaisena
  const siteLevel = (site, score = health(site).score) => { const lv = level(score); return lv === "ok" && openCount(site) > 0 ? "warn" : lv; };
  const LEVEL_COLOR = { ok: "#3ADB76", warn: "#FFAE00", alert: "#E2202C", info: "#1A62A9" };
  const LEVEL_DARK = { ok: "#157539", warn: "#805700", alert: "#A3141C" };
  const levelText = (lv) => ({ ok: L("Kunnossa", "Good"), warn: L("Vaatii huomiota", "Needs attention"), alert: L("Kriittinen", "Critical") }[lv]);
  const passGrade = (site) => (openCount(site) === 0 ? "A" : "B");
  const GRADE_COLORS = { A: "#157539", B: "#3ADB76", C: "#FFAE00", D: "#E3530F", E: "#A00000" };
  const devicesText = (site) => [
    site.sensors.length ? L(`${site.sensors.length} anturia`, `${site.sensors.length} sensors`) : "",
    site.units.length ? L(`${site.units.length} imuria`, `${site.units.length} roof ${plural(site.units.length, "fan", "fans")}`) : "",
  ].filter(Boolean).join(" · ");
  const comboText = (site) => (site.sensors.length && site.units.length ? L("Vuotopaikannin + kosteudenhallinta", "Leak detection + humidity control") : site.sensors.length ? L("Vuotopaikannin", "Leak detection") : L("Kosteudenhallinta", "Humidity control"));
  const findingCountText = (n) => (n ? L(`${n} avoin${n > 1 ? "ta" : ""} havainto${n > 1 ? "a" : ""}`, `${n} open ${plural(n, "finding", "findings")}`) : L("Kaikki kunnossa", "All good"));

  function gauge(score, size = 72, dark = true, lv = level(score)) {
    const r = 30;
    const c = 2 * Math.PI * r;
    return `<svg class="gauge" viewBox="0 0 72 72" width="${size}" height="${size}" aria-label="Health Score ${score}">
      <circle cx="36" cy="36" r="${r}" fill="none" stroke="${dark ? "rgba(255,255,255,.15)" : "rgba(1,39,62,.08)"}" stroke-width="7"/>
      <circle cx="36" cy="36" r="${r}" fill="none" stroke="${LEVEL_COLOR[lv]}" stroke-width="7" stroke-dasharray="${(c * Math.max(0, score)) / 100} ${c}" transform="rotate(-90 36 36)"/>
      <text x="36" y="42" text-anchor="middle" font-size="20" font-weight="700" fill="${dark ? "#fff" : "#01273E"}" font-family="Inter, Helvetica, Arial">${score}</text>
    </svg>`;
  }

  // Kohdevalitsin kohdekohtaisille näkymille
  function siteSelect(site, viewKey) {
    return `<label class="site-select"><span class="caps muted">${L("Kohde", "Site")}</span>
      <select data-site-select="${viewKey}">${allSites().map((s) => `<option value="${s.id}" ${s.id === site.id ? "selected" : ""}>${esc(s.name)}</option>`).join("")}</select></label>`;
  }
  function bindSiteSelect() {
    $$("[data-site-select]").forEach((sel) => sel.addEventListener("change", () => { location.hash = `#/${sel.dataset.siteSelect}/${sel.value}`; }));
  }
  const dataBadge = (site) => (site.real
    ? `<span class="chip chip--info">${L("Oikea data", "Real data")}</span>`
    : `<span class="chip chip--muted">${L("Simuloitu data", "Simulated data")}${site.custom ? ` · ${L("uusi kohde", "new site")}` : ""}</span>`);

  function noSites() {
    view.innerHTML = `<div class="card locked"><h2 style="margin-bottom:8px">${L("Salkussa ei ole kohteita", "No sites in the portfolio")}</h2><p>${L("Lisää ensimmäinen kohde salkkunäkymässä.", "Add your first site in the portfolio view.")}</p><div style="margin-top:18px"><a class="button" href="#/salkku">${L("Siirry salkkuun", "Go to portfolio")}</a></div></div>`;
  }

  // ---------- Kirjautumissivu ----------
  function renderLogin() {
    view.innerHTML = `
      <div class="login">
        <div class="login__brand">
          <img src="assets/vilpe-logo.svg" alt="VILPE">
          <h1>Sense<b>+</b></h1>
          <p>${L("Rakenteen kosteusturva koko elinkaaren ajan.", "Structural moisture protection for the whole building lifecycle.")}</p>
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

  // ---------- Salkku ja kohteiden hallinta ----------
  function renderPortfolio() {
    const sites = allSites().map((s) => { const h = health(s).score; return { s, h, lv: siteLevel(s, h), open: openCount(s) }; }).sort((a, b) => a.h - b.h);
    const attention = sites.filter((x) => x.lv !== "ok").length;
    const openTotal = sites.reduce((a, x) => a + x.open, 0);
    const devTotal = sites.reduce((a, x) => a + x.s.sensors.length + x.s.units.length, 0);
    const devOk = sites.reduce((a, x) => {
      const A = analyze(x.s);
      const broken = A.stopped.filter((u) => fState(x.s, `fan-${u.serial}`).status !== "resolved").length;
      const off = A.offline.filter((s) => fState(x.s, `offline-${s.id}`).status !== "resolved").length;
      return a + x.s.sensors.length + x.s.units.length - broken - off;
    }, 0);

    view.innerHTML = `
      <div class="page-head">
        <div>
          <div class="caps muted">${I.weekday(today)} ${fdate(today)}</div>
          <h1>${L("Kohdesalkku", "Portfolio")}</h1>
          <p>${L("Kosteusturvan tilannekuva kohteistasi – järjestetty kiireellisyyden mukaan.", "Moisture status of your sites – sorted by urgency.")}</p>
        </div>
        <button class="button" id="add-site">+ ${L("Lisää kohde", "Add site")}</button>
      </div>
      ${sites.length ? `
      <div class="summary">
        <div><b class="num">${sites.length}</b><span>${L("kohdetta Sense+ Caressa", "sites in Sense+ Care")}</span></div>
        <div><b class="num" style="color:${attention ? LEVEL_DARK.warn : LEVEL_DARK.ok}">${attention}</b><span>${L("vaatii huomiota", "need attention")}</span></div>
        <div><b class="num" style="color:${openTotal ? LEVEL_DARK.alert : LEVEL_DARK.ok}">${openTotal}</b><span>${L("avointa havaintoa", "open findings")}</span></div>
        <div><b class="num">${devOk}/${devTotal}</b><span>${L("laitetta toiminnassa", "devices operational")}</span></div>
      </div>
      <div class="sites">
        ${sites.map(({ s, h, lv, open }) => `<article class="site" data-open-site="${s.id}" tabindex="0" role="link" aria-label="${L("Avaa", "Open")} ${esc(s.name)}">
            <div class="site__bar" style="background:${LEVEL_COLOR[lv]}"></div>
            <div class="site__body">
              <div class="site__info">
                <h3>${esc(s.name)}</h3>
                <div class="site__meta">${esc(s.city)} · ${esc(siteType(s))}</div>
                <div class="site__meta">${comboText(s)} · ${devicesText(s)}</div>
                <div class="site__meta">${L("Seuranta", "Monitoring")} ${fdate(s.days[0])}–${fdate(s.days[s.days.length - 1])}</div>
                <div class="site__status"><span class="dot dot--${lv}"></span><span>${findingCountText(open)}</span></div>
              </div>
              <div class="site__score"><b class="num" style="color:${LEVEL_DARK[lv]}">${h}</b><span>Health Score</span></div>
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
      <div class="modal__head"><h2 id="modal-title">${L("Lisää kohde", "Add site")}</h2><button class="modal__close" data-close aria-label="${L("Sulje", "Close")}">×</button></div>
      <form class="modal__body" id="site-form" novalidate>
        <div class="form-row"><label for="s-name">${L("Kohteen nimi", "Site name")}</label><input id="s-name" placeholder="${L("esim. As Oy Esimerkkitalo", "e.g. Example House")}" required maxlength="60"></div>
        <div class="form-row"><label for="s-city">${L("Paikkakunta", "City")}</label><input id="s-city" value="Vaasa" maxlength="40"></div>
        <div class="form-row"><label for="s-type">${L("Rakenne", "Structure")}</label><select id="s-type">${ROOF_TYPES.map((t) => `<option value="${t}">${typeLabel(t)}</option>`).join("")}</select></div>
        <div class="form-row"><label for="s-sensors">${L("Vuotoanturit (RHT-2)", "Leak sensors (RHT-2)")}</label><input id="s-sensors" type="number" min="0" max="80" value="20"></div>
        <div class="form-row"><label for="s-units">${L("Kosteudenhallinta (MCU-2 + imuri)", "Humidity control (MCU-2 + fan)")}</label><input id="s-units" type="number" min="0" max="10" value="1"></div>
        <div class="form-row"><label for="s-apts">${L("Asuntoja", "Apartments / units")}</label><input id="s-apts" type="number" min="0" max="400" value="24"></div>
        <div class="form-row"><span class="label"></span><p class="muted" style="font-size:13px">${L("Demossa uuden kohteen data simuloidaan 12 kuukauden ajalta valitulla laitekombolla.", "In the demo, 12 months of data are simulated for the new site with the chosen device combination.")}</p></div>
        <p class="login__error" id="site-error" role="alert" hidden></p>
      </form>
      <div class="modal__foot">
        <button class="button button--hollow" data-close>${L("Peruuta", "Cancel")}</button>
        <button class="button" id="save-site">${L("Lisää kohde", "Add site")}</button>
      </div>`);
    $("#s-name").focus();
    const submit = () => {
      const name = $("#s-name").value.trim();
      const sensors = Math.max(0, Math.min(80, Math.round(+$("#s-sensors").value || 0)));
      const units = Math.max(0, Math.min(10, Math.round(+$("#s-units").value || 0)));
      const err = $("#site-error");
      const fail = (msg) => { err.textContent = msg; err.hidden = false; };
      if (!name) return fail(L("Anna kohteelle nimi.", "Enter a name for the site."));
      if (sensors + units === 0) return fail(L("Kohteessa pitää olla vähintään yksi anturi tai kosteudenhallintayksikkö.", "The site needs at least one sensor or humidity control unit."));
      if (sensors === 1) return fail(L("Vuotopaikannukseen tarvitaan vähintään 2 anturia (suositus ~10 / 200 m²).", "Leak detection needs at least 2 sensors (recommended ~10 per 200 m²)."));
      const id = `k${Date.now().toString(36)}`;
      state.custom.push({
        id,
        custom: true,
        name,
        city: $("#s-city").value.trim() || "–",
        type: $("#s-type").value,
        apartments: Math.max(0, Math.round(+$("#s-apts").value || 0)) || null,
        sensors,
        units,
        storyEvents: [{ d: TODAY_ISO, cls: "info", t: "Kohde lisätty Sense+ Careen", tEn: "Site added to Sense+ Care" }],
      });
      save();
      closeModal();
      route();
      toast(L(`${name} lisätty salkkuun.`, `${name} added to the portfolio.`));
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
        <p>${L(`Poistetaanko <b>${esc(site.name)}</b> salkusta? Kohteen havainnot, työtilaukset ja suostumukset poistuvat näkymistä.`, `Delete <b>${esc(site.name)}</b> from the portfolio? Its findings, work orders and consents will be removed.`)}</p>
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

  // ---------- Kohde ----------
  const ui = { siteId: null, day: 0, metric: "rh", sensor: null, unit: null, playing: null };

  function renderSite(site) {
    const A = analyze(site);
    if (ui.siteId !== site.id) {
      ui.siteId = site.id;
      ui.day = A.lastIdx;
      ui.sensor = null;
      ui.unit = A.stopped[0] ? A.stopped[0].name : A.units[0] ? A.units[0].name : null;
    }
    const h = health(site);
    const lv = siteLevel(site, h.score);
    const brokenUnits = A.stopped.filter((u) => fState(site, `fan-${u.serial}`).status !== "resolved").length;
    const offlineOpen = A.offline.filter((s) => fState(site, `offline-${s.id}`).status !== "resolved").length;
    const fs = findings(site);
    const hasSensors = A.sensors.length > 0;
    const hasUnits = A.units.length > 0;

    view.innerHTML = `
      <div class="page-head">
        <div>
          <div class="crumbs"><a href="#/salkku">${L("Salkku", "Portfolio")}</a> / ${L("Kohde", "Site")}</div>
          <h1>${esc(site.name)}</h1>
          <p>${esc(siteStructure(site))} · ${comboText(site)} · ${L("seuranta", "monitoring")} ${fdate(A.days[0])}–${fdate(A.days[A.lastIdx])} ${dataBadge(site)}</p>
        </div>
        <div class="button-row">
          ${siteSelect(site, "kohde")}
          <a class="button button--hollow" href="#/raportti/${site.id}">${L("Hallitusraportti", "Board report")}</a>
          <a class="button" href="#/passi/${site.id}">${L("Luo Kosteuspassi", "Create Moisture Passport")}</a>
        </div>
      </div>

      <div class="kpis">
        <div class="kpi kpi--score">${gauge(h.score, 72, true, lv)}<div><div class="caps">Roof Health Score</div><span>${levelText(lv)}</span></div></div>
        <div class="kpi"><b class="num" style="color:${offlineOpen ? LEVEL_DARK.alert : "inherit"}">${hasSensors ? `${A.sensors.length - offlineOpen}/${A.sensors.length}` : "–"}</b><span>${hasSensors ? L("vuotoanturia yhteydessä", "leak sensors online") : L("ei vuotoantureita", "no leak sensors")}</span></div>
        <div class="kpi"><b class="num" style="color:${brokenUnits ? LEVEL_DARK.alert : "inherit"}">${hasUnits ? `${A.units.length - brokenUnits}/${A.units.length}` : "–"}</b><span>${hasUnits ? L("kosteudenhallintayksikköä toiminnassa", "humidity control units running") : L("ei kosteudenhallintaa", "no humidity control")}</span></div>
        <div class="kpi"><b class="num">${n1(A.rhNow)} %</b><span>${L("rakenteen RH nyt (ka.)", "structural RH now (mean)")}</span></div>
        <div class="kpi"><b class="num">${A.maxMold === null ? "–" : n1(A.maxMold)}</b><span>${A.maxMold === null ? L("homeindeksi vaatii MCU-2:n", "mould index requires MCU-2") : L("suurin homeindeksi (raja 2,5)", "highest mould index (limit 2.5)")}</span></div>
      </div>

      <div class="grid grid--main">
        <div class="stack">
          <section class="card" id="map-card">
            <div class="card__head">
              <h2>${hasSensors ? L("Kosteuskartta", "Humidity map") : L("Laitekartta", "Device map")}</h2>
              ${hasSensors ? `<div class="segmented" role="group" aria-label="${L("Suure", "Quantity")}">
                <button data-metric="rh" class="${ui.metric === "rh" ? "is-active" : ""}">RH %</button>
                <button data-metric="t" class="${ui.metric === "t" ? "is-active" : ""}">${I.tempUnit()}</button>
              </div>` : ""}
            </div>
            <div class="map ${site.real ? "" : "map--sim"}" id="map">
              <img src="${site.roof.src}" alt="${L("Kattokartta", "Roof plan")}, ${esc(site.name)}" width="${site.roof.w}" height="${site.roof.h}">
              <canvas id="heat"></canvas>
              ${A.sensors.map((s) => {
                const flagged = (A.anomalies.includes(s) && fState(site, `sensor-${s.id}`).status !== "resolved") || (A.offline.includes(s) && fState(site, `offline-${s.id}`).status !== "resolved");
                return `<button class="map__pin ${flagged ? "map__pin--flag" : ""}" data-sensor="${s.id}" style="left:${s.pos[0] * 100}%;top:${s.pos[1] * 100}%" aria-label="${L("Anturi", "Sensor")} ${s.id}"></button>`;
              }).join("")}
              ${A.units.filter((u) => u.pos).map((u) => `<button class="map__unit" data-unit="${esc(u.name)}" style="left:${u.pos[0] * 100}%;top:${u.pos[1] * 100}%" aria-label="${esc(uName(u))}"></button>`).join("")}
            </div>
            <div class="map-controls">
              <button class="round-btn" id="play" aria-label="${L("Toista seurantajakso", "Play the monitoring period")}">▶</button>
              <input type="range" id="day" min="0" max="${A.lastIdx}" value="${ui.day}" aria-label="${L("Päivä", "Day")}">
              <span class="date-badge num" id="day-label"></span>
            </div>
            <div class="legend">
              ${hasSensors ? `<span class="legend__item"><span class="scale" id="scale"></span><span id="scale-label"></span></span>
              <span class="legend__item"><span class="dot" style="border-radius:50%;background:#1A62A9"></span>${L("RHT-2 vuotoanturi", "RHT-2 leak sensor")}</span>` : ""}
              ${hasUnits ? `<span class="legend__item"><span class="dot" style="transform:rotate(45deg);background:#3ADB76"></span>${L("MCU-2 huippuimuri (punainen = seis)", "MCU-2 roof fan (red = stopped)")}</span>` : ""}
              ${hasSensors ? `<span class="legend__item"><span class="dot" style="border-radius:50%;box-shadow:0 0 0 2px #E2202C;background:#fff"></span>${L("havainto", "finding")}</span>` : ""}
            </div>
            <div id="sensor-detail"></div>
          </section>

          ${hasUnits ? `<section class="card" id="units-card">
            <div class="card__head"><h2>${L("Kosteudenhallintayksiköt", "Humidity control units")}</h2><span class="caps">MCU-2 · ${month(A.days[0].slice(0, 7))}–${month(A.days[A.lastIdx].slice(0, 7))}</span></div>
            <div class="table-wrap">
              <table>
                <thead><tr><th>${L("Laite", "Unit")}</th><th>${L("Tila", "Status")}</th><th class="r">${L("Puhallin käynnissä", "Fan running")}</th><th class="r">${L("Rakenteen RH ka.", "Structural RH mean")}</th><th class="r">RH &gt; 90 %</th><th class="r">${L("Homeindeksi", "Mould index")}</th></tr></thead>
                <tbody>${A.units.map((u) => {
                  const st = A.stopped.includes(u) ? fState(site, `fan-${u.serial}`).status : null;
                  const chip = st === "open" ? `<span class="chip chip--alert">${L("Puhallin seis", "Fan stopped")}</span>` : st === "ordered" ? `<span class="chip chip--warn">${L("Huolto tilattu", "Service ordered")}</span>` : A.riskUnit === u && u.mold > 0.3 ? `<span class="chip chip--info">${L("Seurannassa", "Monitoring")}</span>` : '<span class="chip chip--ok">OK</span>';
                  return `<tr class="is-clickable ${u.name === ui.unit ? "is-selected" : ""}" data-unit="${esc(u.name)}">
                    <td><b>${esc(uName(u))}</b><div class="muted" style="font-size:12px">${u.serial}</div></td><td>${chip}</td>
                    <td class="r num" style="${u.on < 60 ? `color:${LEVEL_DARK.alert};font-weight:700` : ""}">${n0(u.on)} %</td>
                    <td class="r num">${n1(u.rhInMean)} %</td><td class="r num">${n0(u.rhIn90)} %</td>
                    <td class="r num" style="${u.mold > 0.5 ? "font-weight:700" : ""}">${nd(u.mold, 3)}</td></tr>`;
                }).join("")}</tbody>
              </table>
            </div>
            <div style="margin-top:18px" id="unit-chart-wrap"></div>
          </section>` : ""}
        </div>

        <div class="stack">
          <section>
            <div class="card__head" style="margin-bottom:12px"><h2>${L("Toimenpidelista", "Action list")}</h2><span class="caps muted">${openCount(site)} ${L("avointa", "open")}</span></div>
            ${fs.map(findingCard).join("")}
          </section>
          <section class="card">
            <div class="card__head"><h2>${site.newBuild ? L("Rakennuskosteuden kuivuminen", "Construction moisture drying") : L("Rakenteen kosteus", "Structural humidity")}</h2><span class="caps">${hasSensors ? L("koko anturisto", "all sensors") : L("imurien sisäanturit", "fan indoor sensors")} · ${L("kk-ka.", "monthly mean")}</span></div>
            <div id="dry-chart"></div>
            <div class="legend">
              <span class="legend__item"><span class="legend__swatch" style="background:#1A62A9"></span>RH % (${L("vasen", "left")})</span>
              <span class="legend__item"><span class="legend__swatch" style="background:#E3530F"></span>${L("Lämpötila", "Temperature")} ${I.tempUnit()} (${L("vasen", "left")})</span>
              <span class="legend__item"><span class="legend__swatch" style="background:#8052B1"></span>AH g/m³ (${L("oikea", "right")})</span>
            </div>
          </section>
        </div>
      </div>`;

    bindSiteSelect();
    bindSite(site);
    if (hasUnits) drawUnitChart(site);
    const M = site.networkMonthly;
    Charts.timeSeries($("#dry-chart"), {
      labels: M.map((m) => m.m),
      height: 220,
      left: { min: 0, max: 100, ticks: 4, title: `% · ${I.tempUnit()}` },
      right: { min: 0, max: 20, title: "g/m³" },
      series: [
        { name: "RH", values: M.map((m) => m.rh), color: "#1A62A9", type: "area", unit: "%", width: 2.5, dots: true },
        { name: L("Lämpötila", "Temperature"), values: M.map((m) => (m.t === null ? null : Math.round(I.temp(m.t) * 10) / 10)), color: "#E3530F", unit: I.tempUnit() },
        { name: "AH", values: M.map((m) => m.ah), color: "#8052B1", axis: "right", unit: "g/m³", dash: "4 3" },
      ],
      tick: (_, i) => M.length <= 6 || i % 2 === 0,
      xFormat: month,
      tipTitle: month,
    });
  }

  function findingCard(f) {
    const st = f.state.status;
    const stLabel = st === "ordered" ? `<span class="chip chip--warn">${L("Työtilaus", "Work order")} ${f.state.order.no}</span>` : st === "resolved" ? `<span class="chip chip--ok">${L("Korjattu", "Fixed")}</span>` : "";
    let actions = "";
    if (f.action && st === "open") {
      actions = `<button class="button button--sm" data-order="${f.id}">${f.action}</button>`;
    } else if (f.action && st === "ordered") {
      actions = `<span class="muted" style="font-size:13px">${esc(f.state.order.partner)} · ${L("lähetetty", "sent")} ${fdate(f.state.order.date)}</span><button class="button button--hollow button--sm" data-resolve="${f.id}">${L("Merkitse korjatuksi", "Mark as fixed")}</button>`;
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
    const r = box.width * (site.sensors.length > 30 ? 0.065 : 0.09);
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
    const step = A.days.length > 200 ? 2 : 1;
    ui.playing = setInterval(() => {
      if (!$("#day")) { stopPlay(); return; }
      ui.day = Math.min(A.lastIdx, ui.day + step);
      updateMap(site);
      if (ui.day >= A.lastIdx) stopPlay();
    }, A.days.length > 200 ? 45 : 90);
  }

  function selectSensor(site, id, scroll = false) {
    const A = analyze(site);
    ui.sensor = id;
    const s = A.sensorBy[id];
    $$(".map__pin").forEach((p) => p.classList.toggle("is-selected", p.dataset.sensor === id));
    const chip = A.anomalies.includes(s) ? `<span class="chip chip--warn" style="margin-left:6px">${L("Poikkeava", "Anomaly")}</span>` : A.offline.includes(s) ? '<span class="chip chip--alert" style="margin-left:6px">Offline</span>' : "";
    $("#sensor-detail").innerHTML = `<div class="sensor-detail">
      <div class="card__head" style="margin-bottom:6px">
        <h3>${L("Anturi", "Sensor")} ${s.id} ${chip}</h3>
        <button class="link-button" style="font-size:13px" id="close-sensor">${L("Sulje", "Close")}</button>
      </div>
      <div class="muted" style="font-size:13px">${L("Keskiarvo", "Mean")} ${n1(s.rhMean)} % · max ${n1(s.rhMax)} % · min ${tmp(s.tMin)} · ${n0(s.n)} ${L("mittausta", "readings")} · ${L("viimeisin", "latest")} ${fdate(s.last.ts)}: ${n1(s.last.rh)} %, ${tmp(s.last.t)}</div>
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
      if (i >= 0) markers.push({ index: i, label: L("Sense+ olisi hälyttänyt", "Sense+ would have alerted"), color: "#E2202C" });
    }
    wrap.innerHTML = `
      <div style="display:flex;gap:20px;align-items:center;flex-wrap:wrap;margin-bottom:10px">
        <div class="mold"><div><b class="num">${nd(u.mold, 5)}</b><span>${L("Homeindeksi", "Mould index")}</span></div></div>
        <div>
          <h3>${esc(uName(u))} – ${L("olosuhteet ja puhallusteho", "conditions and fan output")}</h3>
          <p class="muted" style="font-size:14px;margin-top:4px">${purposeLabel(u.purpose)} · ${u.serial} · ${L(`puhallin käynnissä ${n0(u.on)} % ajasta`, `fan running ${n0(u.on)} % of the time`)}${u.rpmMean ? L(`, keskimäärin ${n0(u.rpmMean)} rpm käydessään`, `, ${n0(u.rpmMean)} rpm on average when running`) : ""}</p>
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
      bands: [{ from: 90, to: 100, color: "rgba(226,32,44,.08)", label: "RH > 90 %" }],
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

  // ---------- Modaali ja työtilaus ----------
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
    const isUnit = f.target.type === "unit";
    const P = I.profile();
    const partners = [...P.partners.map((p) => `${p} · ${L("VILPE-kumppani", "VILPE partner")}`), L("Kohteen oma huoltoyhtiö", "Building's own maintenance company")];
    const defaultPartner = I.country === "FI" && site.city === "Vantaa" ? 1 : 0;
    openModal(`
      <div class="modal__head"><h2 id="modal-title">${f.action}</h2><button class="modal__close" data-close aria-label="${L("Sulje", "Close")}">×</button></div>
      <form class="modal__body" id="order-form">
        <div class="form-row"><span class="label">${L("Kohde", "Site")}</span><div class="value"><b>${esc(site.name)}</b></div></div>
        <div class="form-row"><span class="label">${L("Havainto", "Finding")}</span><div class="value">${esc(f.title)}</div></div>
        <div class="form-row"><label for="partner">${esc(I.roleShort("contractor"))}</label><select id="partner">${partners.map((p, i) => `<option ${i === defaultPartner ? "selected" : ""}>${esc(p)}</option>`).join("")}</select></div>
        <div class="form-row"><label for="urgency">${L("Kiireellisyys", "Urgency")}</label><select id="urgency"><option ${f.level === "alert" ? "selected" : ""}>${L("Kiireellinen – 3 arkipäivää", "Urgent – 3 working days")}</option><option ${f.level === "alert" ? "" : "selected"}>${L("Normaali – 14 vrk", "Normal – 14 days")}</option></select></div>
        <div class="form-row"><label for="desc">${L("Kuvaus", "Description")}</label><textarea id="desc" rows="5">${f.orderText}</textarea></div>
        <div class="form-row"><span class="label">${L("Liitteet", "Attachments")}</span><div class="attach">
          <span>📎 ${isUnit ? L("Kosteuskartta ja laitteen sijainti", "Humidity map and unit location") : L("Kosteuskartta ja anturin sijainti", "Humidity map and sensor location")}</span>
          <span>📎 ${isUnit ? L("Aikasarja rpm + sisä/ulko RH (CSV)", "Time series rpm + indoor/outdoor RH (CSV)") : L("Aikasarja RH vs. naapurit (CSV)", "Time series RH vs. neighbours (CSV)")}</span>
          <span>📎 ${L("Sense+-analyysin perustelu ja laitetiedot", "Sense+ analysis rationale and device details")}</span>
        </div></div>
        <div class="form-row"><span class="label">${L("Tilaaja", "Ordered by")}</span><div class="value">${DEMO_USER} · ${esc(I.role("manager"))} · ${L("laskutus", "billed to")}: ${esc(I.roleShort("owner"))}</div></div>
      </form>
      <div class="modal__foot">
        <button class="button button--hollow" data-close>${L("Peruuta", "Cancel")}</button>
        <button class="button" id="send-order">${L("Lähetä työtilaus", "Send work order")}</button>
      </div>`);
    $("#send-order").addEventListener("click", () => {
      state.orders += 1;
      const urgent = $("#urgency").selectedIndex === 0;
      const order = { no: `TT-2026-${String(140 + state.orders).padStart(4, "0")}`, partner: $("#partner").value.split(" · ")[0], date: TODAY_ISO, urgent };
      siteFindings(site)[id] = { status: "ordered", order };
      save();
      openModal(`
        <div class="modal__head"><h2 id="modal-title">${L("Työtilaus lähetetty", "Work order sent")}</h2><button class="modal__close" data-close aria-label="${L("Sulje", "Close")}">×</button></div>
        <div class="modal__body success">
          <div class="success__icon">✓</div>
          <h2>${order.no}</h2>
          <p class="muted" style="margin-top:8px">${L(`${esc(order.partner)} sai tilauksen datan, kartan ja kuvauksen kanssa.`, `${esc(order.partner)} received the order with data, map and description.`)}<br>${urgent ? L("Kiireellinen – 3 arkipäivää", "Urgent – 3 working days") : L("Normaali – 14 vrk", "Normal – 14 days")}. ${L("Kuittaus tulee yleensä 24 tunnin sisällä.", "Confirmation usually arrives within 24 hours.")}</p>
          <p style="margin-top:14px;font-size:14px">${L("Kun urakoitsija kirjaa korjauksen, Health Score päivittyy ja tapahtuma tallentuu Kosteuspassin historiaan.", "When the contractor logs the repair, the Health Score updates and the event is stored in the Moisture Passport history.")}</p>
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
    toast(L(`Korjaus kirjattu – Health Score nyt ${health(site).score}.`, `Repair logged – Health Score is now ${health(site).score}.`));
  }

  // ---------- Kosteuspassi ----------
  const passUses = () => ({
    kauppa: I.country === "FI"
      ? L("Kiinteistökauppa – liite myynti-ilmoitukseen ja isännöitsijäntodistukseen", "Property sale – attachment to the listing and the property manager's certificate")
      : L("Kiinteistökauppa – liite myynti-ilmoitukseen ja kauppa-asiakirjoihin", "Property sale – attachment to the listing and sale documents"),
    vakuutus: L("Vakuutuksen uusiminen – riskitason todentaminen", "Insurance renewal – proof of risk level"),
    luovutus: L("Luovutus – rakennuskosteuden kuivumisen todentaminen", "Handover – proof that construction moisture has dried out"),
  });
  let passUse = "kauppa";

  function hash(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(16).toUpperCase().padStart(8, "0");
  }

  function renderPass(site) {
    const A = analyze(site);
    const P = I.profile();
    const grade = passGrade(site);
    const fs = actionable(site);
    const uses = passUses();
    const code = hash(JSON.stringify([site.id, A.sensors.length, A.units.length, A.days[0], A.days[A.lastIdx], A.safeShare, A.maxMold, fs.map((f) => f.state.status)]));
    const passId = `${site.id.slice(0, 3).toUpperCase()}-${code.slice(0, 4)}-${code.slice(4)}`;
    const url = `https://sense.vilpe.com/passi/${passId}`;
    const items = [];
    if (site.newBuild) items.push(["ok", L(`Rakennuskosteus kuivunut: katon RH ${n1(A.firstMonth.rh)} % → ${n1(A.driest.rh)} % (${month(A.driest.m)})`, `Construction moisture dried out: roof RH ${n1(A.firstMonth.rh)} % → ${n1(A.driest.rh)} % (${month(A.driest.m)})`)]);
    else items.push(["ok", L(`Rakenteen kosteus normaalilla tasolla: ${n1(A.driest.rh)}–${n1(A.wettest.rh)} % (kk-ka.), vaihtelu seuraa vuodenaikoja`, `Structural humidity at a normal level: ${n1(A.driest.rh)}–${n1(A.wettest.rh)} % (monthly mean), varying with the seasons`)]);
    if (A.maxMold !== null) items.push(["ok", L(`Homeindeksi enintään ${n1(A.maxMold)} (hälytysraja 2,5)`, `Mould index at most ${n1(A.maxMold)} (alert limit 2.5)`) + (A.riskUnit && A.riskUnit.mold > 0.3 ? L(` – ${uName(A.riskUnit).toLowerCase()} seurannassa`, ` – ${uName(A.riskUnit).toLowerCase()} being monitored`) : "")]);
    items.push(["ok", `${pct(A.safeShare)} % ${safeLabel(A)}`]);
    fs.forEach((f) => {
      if (f.state.status === "resolved") items.push(["ok", `${f.passDone} ${fdate(f.state.resolved)}`]);
      else items.push(["warn", `${f.passOpen} – ${f.state.status === "ordered" ? L("korjaus tilattu", "repair ordered") : L("avoin", "open")}`]);
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
            <div class="caps" style="color:#E3530F">VILPE Sense+ ${L("Kosteuspassi", "Moisture Passport")}${A.fullYear ? "" : ` · ${L("väliraportti", "interim report")}`}</div>
            <h1>${esc(site.name)}</h1>
            <p>${uses[passUse]}</p>
          </div>
          <img src="assets/vilpe-logo.svg" alt="VILPE">
        </header>
        <div class="doc__body">
          ${A.fullYear ? "" : `<div class="notice">${L(`Seuranta alkoi ${fdate(A.days[0])}. Täysi Kosteuspassi myönnetään 12 kuukauden seurannan jälkeen – tämä väliraportti kattaa ${A.days.length} vrk.`, `Monitoring started ${fdate(A.days[0])}. A full Moisture Passport is issued after 12 months of monitoring – this interim report covers ${A.days.length} days.`)}</div>`}
          <section class="doc__section">
            <div class="grade">
              <div class="grade__big" style="background:${GRADE_COLORS[grade]}">${grade}</div>
              <div class="grade__scale" aria-label="${L("Kosteusluokka", "Moisture class")}">
                ${["A", "B", "C", "D", "E"].map((g, i) => `<div class="grade__step ${g === grade ? "is-active" : ""}" style="background:${GRADE_COLORS[g]};width:${55 + i * 11}%">${g}</div>`).join("")}
              </div>
              <div style="flex:1;min-width:220px">
                <div class="caps muted">${L("Kosteusluokka", "Moisture class")}${A.fullYear ? "" : ` (${L("alustava", "preliminary")})`}</div>
                <h2 class="plain" style="font-size:24px;margin:4px 0 8px">${grade === "A" ? L("Koko seurantajakso turvallisella alueella", "Safe throughout the monitoring period") : L("Turvallinen, havaintoja korjattavana", "Safe, with findings to fix")}</h2>
                <p style="font-size:14px">${grade === "A" ? L("Havaitut poikkeamat on korjattu ja korjausten jälkeinen tila todennettu datalla.", "Detected anomalies have been fixed and the post-repair state verified with data.") : L("Kun avoimet havainnot on korjattu, kohde nousee luokkaan A.", "Once the open findings are fixed, the site rises to class A.")}</p>
              </div>
            </div>
          </section>
          <section class="doc__section">
            <div class="facts">
              <div><b class="num">${fdate(A.days[0])}–<br>${fdate(A.days[A.lastIdx])}</b><span>${L("seurantajakso", "monitoring period")}</span></div>
              <div><b class="num">${A.sensors.length} + ${A.units.length}</b><span>${devices.join(" + ")}</span></div>
              <div><b class="num">${n0(A.measurements)}</b><span>${L("mittausta", "readings")}</span></div>
              <div><b class="num">${n0(A.fanUptime !== null ? A.fanUptime : A.sensorAvailability)} %</b><span>${A.fanUptime !== null ? L("kosteudenhallinnan toiminta-aste", "humidity control uptime") : L("anturien käytettävyys", "sensor availability")}</span></div>
            </div>
          </section>
          <section class="doc__section">
            <h2>${L("Havainnot", "Findings")}</h2>
            <ul class="checklist">${items.map(([k, t]) => `<li><span class="${k}">${k === "ok" ? "✔" : "⚠"}</span><span>${t}</span></li>`).join("")}</ul>
          </section>
          <section class="doc__section grid grid--2" style="gap:28px">
            <div>
              <h2>${site.newBuild ? L("Kuivumiskäyrä", "Drying curve") : L("Kosteushistoria", "Humidity history")}</h2>
              <div id="pass-chart"></div>
            </div>
            <div>
              <h2>${L("Mittauskattavuus", "Measurement coverage")}</h2>
              <div class="mini-map">
                <img src="${site.roof.src}" alt="${L("Laitteiden sijainnit katolla", "Device locations on the roof")}">
                ${A.sensors.map((s) => `<i style="left:${s.pos[0] * 100}%;top:${s.pos[1] * 100}%"></i>`).join("")}
                ${A.units.filter((u) => u.pos).map((u) => `<i class="u" style="left:${u.pos[0] * 100}%;top:${u.pos[1] * 100}%"></i>`).join("")}
              </div>
              <p class="muted" style="font-size:12px;margin-top:6px">${A.sensors.length ? `● ${L("vuotoanturi", "leak sensor")} (~10 / ${n0(I.area(200))} ${I.areaUnit()}) &nbsp; ` : ""}${A.units.length ? `◆ ${L("kosteudenhallintayksikkö", "humidity control unit")}` : ""}</p>
            </div>
          </section>
          <section class="doc__section">
            <h2>${L("Säädöskytkentä", "Regulatory link")} · ${esc(I.pick(P.name))}</h2>
            <p style="font-size:14px">${esc(I.pick(P.regulation))}.</p>
            <p class="muted" style="font-size:13px;margin-top:6px">${esc(I.pick(P.extra))}</p>
          </section>
          <section class="doc__section">
            <h2>${L("Varmennus", "Verification")}</h2>
            <div class="verify">
              <div class="verify__qr" id="qr"></div>
              <div style="font-size:14px">
                <div class="caps muted">${L("Passin tunniste", "Passport ID")}</div>
                <b style="font-size:18px" class="num">${passId}</b>
                <p style="margin-top:6px">${L("Tarkista aitous", "Verify authenticity")}: <span style="color:#004F9F">${url.replace("https://", "")}</span></p>
                <p class="muted" style="margin-top:4px;font-size:13px">${L(`Generoitu ${fdate(today)} suoraan VILPE Sense -pilven mittausdatasta${site.real ? "" : " (demossa simuloitu)"}. Tietoja ei voi muokata jälkikäteen.`, `Generated ${fdate(today)} directly from VILPE Sense cloud measurement data${site.real ? "" : " (simulated in the demo)"}. The data cannot be edited afterwards.`)}</p>
              </div>
            </div>
          </section>
        </div>
        <footer class="doc__foot">
          <span>${L("Mittausraportti, ei takuu rakenteen kunnosta. Varmennus koskee datan aitoutta.", "A measurement report, not a guarantee of the structure's condition. Verification covers the authenticity of the data.")}</span>
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
    const M = site.networkMonthly;
    Charts.timeSeries($("#pass-chart"), {
      labels: M.map((m) => m.m),
      height: 190,
      left: { min: 0, max: 100, ticks: 4, title: "RH %" },
      series: [{ name: L("Rakenteen RH", "Structural RH"), values: M.map((m) => m.rh), color: "#1A62A9", type: "area", unit: "%", width: 2.5, dots: true }],
      tick: (_, i) => M.length <= 6 || i % 3 === 0,
      xFormat: month,
      tipTitle: month,
    });
  }

  // ---------- Vakuutusnäkymä ----------
  function riskClass(score) {
    if (score >= 85) return [1, L("Erittäin matala", "Very low")];
    if (score >= 75) return [2, L("Matala", "Low")];
    if (score >= 55) return [3, L("Kohtalainen", "Moderate")];
    if (score >= 40) return [4, L("Kohonnut", "Elevated")];
    return [5, L("Korkea", "High")];
  }

  function timelineEvents(site) {
    const A = analyze(site);
    const ev = site.events.map((e) => ({ ...e, t: L(e.t, e.tEn || e.t) }));
    A.stopped.forEach((u) => {
      const n = uName(u);
      ev.push({ d: u.alertDay, cls: "alert", t: L(`${n}: puhallin pysähtyi – Sense+ laitevalvonta olisi hälyttänyt`, `${n}: fan stopped – Sense+ device monitoring would have alerted`) });
      const peakMonth = u.months.filter((m) => m.m >= u.stopFrom.slice(0, 7) && m.m <= u.stopTo.slice(0, 7)).reduce((a, b) => (b.rhIn > a.rhIn ? b : a));
      ev.push({ d: `${peakMonth.m}-15`, cls: "warn", t: L(`${n}: rakenteen RH ${n0(peakMonth.rhIn)} % (kk-ka.) ilman tuuletusta`, `${n}: structural RH ${n0(peakMonth.rhIn)} % (monthly mean) without ventilation`) });
      if (!u.ongoing) ev.push({ d: u.stopTo, cls: "info", t: L(`${n}: puhallin käynnistyi uudelleen${u.on < 50 ? " (toiminta yhä vajaata)" : ""}`, `${n}: fan restarted${u.on < 50 ? " (still underperforming)" : ""}`) });
    });
    A.anomalies.forEach((s) => {
      const valid = (arr) => arr.filter((x) => x !== null);
      const rDay = A.days[s.rh.indexOf(Math.max(...valid(s.rh)))];
      if (s.tAnomalyDays) ev.push({ d: A.days[s.t.indexOf(Math.min(...valid(s.t)))], cls: "warn", t: L(`Anturi ${s.id}: lämpötila ${tmp(s.tMin)}, selvä poikkeama naapureista`, `Sensor ${s.id}: temperature ${tmp(s.tMin)}, a clear deviation from neighbours`) });
      ev.push({ d: rDay, cls: "warn", t: L(`Anturi ${s.id}: RH ${n1(s.rhMax)} %, tarkastuskohde`, `Sensor ${s.id}: RH ${n1(s.rhMax)} %, flagged for inspection`) });
    });
    A.offline.forEach((s) => ev.push({ d: addDays(s.last.ts.slice(0, 10), 2), cls: "warn", t: L(`Anturi ${s.id}: yhteys katkennut (ei mittausta yli 36 h)`, `Sensor ${s.id}: connection lost (no reading for over 36 h)`) }));
    if (site.real) ev.push({ d: TODAY_ISO, cls: "info", t: L("Sense+ Care otettu käyttöön, omistaja antoi suostumuksen datan jakoon", "Sense+ Care activated, owner consented to data sharing") });
    actionable(site).forEach((f) => {
      if (f.state.order) ev.push({ d: TODAY_ISO, cls: "info", t: L(`Työtilaus ${f.state.order.no} → ${f.state.order.partner}: ${f.title}`, `Work order ${f.state.order.no} → ${f.state.order.partner}: ${f.title}`) });
      if (f.state.status === "resolved") ev.push({ d: TODAY_ISO, cls: "ok", t: L(`Korjaus kirjattu: ${f.title}`, `Repair logged: ${f.title}`) });
    });
    return ev.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
  }

  function renderInsurer(site) {
    const A = analyze(site);
    const h = health(site);
    const [rc, rcText] = riskClass(h.score);
    const fs = actionable(site);
    const reacted = fs.filter((f) => f.state.status !== "open").length;
    const discount = openCount(site) === 0 ? "10 %" : reacted ? `${n1(7.5)} %` : "5 %";
    const consent = state.consent[site.id] !== false;
    view.innerHTML = `
      <div class="page-head">
        <div>
          <div class="caps muted">Partner API · ${esc(I.role("insurer"))}</div>
          <h1>${L("Riskinarvio", "Risk assessment")}: ${esc(site.name)}</h1>
          <p>${L("Näin vakuutusyhtiö näkee kohteen – vain sen, mihin omistaja on antanut luvan.", "This is how the insurer sees the site – only what the owner has consented to.")}</p>
        </div>
        <div class="button-row">${siteSelect(site, "vakuutus")}</div>
      </div>
      <div class="consent ${consent ? "" : "consent--off"}">
        <div>
          <b>${consent ? L("Omistajan suostumus voimassa", "Owner consent active") : L("Suostumus peruttu", "Consent withdrawn")} · ${esc(I.roleShort("owner"))}</b>
          <div class="muted" style="font-size:14px">${consent ? L("Jaetaan riskiluokka, hälytykset ja toimenpidehistoria · ei raakadataa eikä henkilötietoja", "Shared: risk class, alerts and action history · no raw data or personal data") : L("Vakuuttaja ei näe kohteen tietoja. Suostumuksen voi antaa uudelleen milloin tahansa.", "The insurer cannot see the site. Consent can be given again at any time.")}</div>
        </div>
        <label class="switch" title="${L("Omistajan suostumus datan jakoon", "Owner consent to data sharing")}"><input type="checkbox" id="consent" ${consent ? "checked" : ""}><span></span></label>
      </div>
      ${consent ? `
      <div class="grid grid--3">
        <section class="card">
          <div class="caps muted">${L("Riskiluokka", "Risk class")}</div>
          <div style="display:flex;align-items:baseline;gap:10px;margin-top:6px"><b style="font-size:44px">${rc}</b><span class="muted">/ 5 · ${rcText}</span></div>
          <div class="risk">${[1, 2, 3, 4, 5].map((i) => `<i style="${i <= rc ? `background:${["#157539", "#3ADB76", "#FFAE00", "#E3530F", "#A00000"][rc - 1]}` : ""}"></i>`).join("")}</div>
          <p class="muted" style="font-size:13px">${L(`Johdettu Roof Health Scoresta (${h.score}/100), homeindeksistä, laitteiden toimivuudesta ja avoimista poikkeamista.`, `Derived from the Roof Health Score (${h.score}/100), mould index, device health and open anomalies.`)}</p>
        </section>
        <section class="card">
          <div class="caps muted">${L("Alennusperuste", "Discount basis")}</div>
          <ul class="checklist" style="margin-top:10px;font-size:14px">
            ${A.sensors.length ? `<li><span class="ok">✔</span><span>${L(`Jatkuva vuotovalvonta: ${A.sensors.length} anturia rakenteessa`, `Continuous leak monitoring: ${A.sensors.length} sensors in the structure`)}</span></li>` : ""}
            ${A.units.length ? `<li><span class="ok">✔</span><span>${L(`Aktiivinen kosteudenhallinta: ${A.units.length} × MCU-2 + huippuimuri`, `Active humidity control: ${A.units.length} × MCU-2 + roof fan`)}</span></li>` : ""}
            <li><span class="ok">✔</span><span>${L("Sense+ Care -laitevalvonta ja asiantuntijavarmistus", "Sense+ Care device monitoring and expert verification")}</span></li>
            <li><span class="${reacted === fs.length ? "ok" : "warn"}">${reacted === fs.length ? "✔" : "⚠"}</span><span>${L("Hälytyksiin reagoitu", "Alerts acted on")}: ${reacted}/${fs.length}</span></li>
            <li><span class="${passGrade(site) === "A" ? "ok" : "warn"}">${passGrade(site) === "A" ? "✔" : "⚠"}</span><span>${L("Kosteuspassi luokka", "Moisture Passport class")} ${passGrade(site)}${A.fullYear ? "" : ` (${L("alustava", "preliminary")})`}</span></li>
          </ul>
        </section>
        <section class="card" style="background:var(--vilpe-navy);color:#fff;border-color:var(--vilpe-navy)">
          <div class="caps" style="color:rgba(255,255,255,.7)">${L("Suositeltu vakuutusetu", "Recommended insurance benefit")}</div>
          <b style="font-size:44px;display:block;margin-top:6px">${discount}</b>
          <p style="font-size:14px;color:rgba(255,255,255,.8)">${L("alennus kiinteistövakuutuksesta tai pienempi omavastuu vuotovahingoissa.", "discount on the property insurance premium or a lower deductible for water damage.")}</p>
          <p style="font-size:13px;color:rgba(255,255,255,.6);margin-top:10px">${L(`Pay-for-results: vakuuttaja maksaa VILPElle ~${I.price(75)}/kohde/v + bonuksen, jos korvauskulut laskevat.`, `Pay-for-results: the insurer pays VILPE ~${I.price(75)} per site per year + a bonus if claims costs fall.`)}</p>
        </section>
      </div>
      <div class="grid grid--2" style="margin-top:20px">
        <section class="card">
          <div class="card__head"><h2>${L("Toimenpidehistoria", "Action history")}</h2><span class="caps">${L("vahingonestotoimet", "loss prevention")}</span></div>
          <ol class="timeline">${timelineEvents(site).map((e) => `<li class="${e.cls}"><time>${fdate(e.d)}</time>${esc(e.t)}</li>`).join("")}</ol>
        </section>
        <section class="card">
          <div class="card__head"><h2>${L("Riskitekijät", "Risk factors")}</h2><span class="caps">${L("Health Score -erittely", "Health Score breakdown")}</span></div>
          <table>
            <thead><tr><th>${L("Tekijä", "Factor")}</th><th class="r">${L("Paino", "Weight")}</th><th class="r">${L("Vähennys", "Deduction")}</th></tr></thead>
            <tbody>
              <tr><td>${L("Homeriski", "Mould risk")} (${L("suurin homeindeksi", "highest mould index")} ${A.maxMold === null ? "–" : n1(A.maxMold)} / ${n1(2.5)})</td><td class="r">30 %</td><td class="r num">−${n1(h.parts.mold)}</td></tr>
              <tr><td>${L("Aika yli RH-rajan", "Time above RH limit")}</td><td class="r">25 %</td><td class="r num">−${n1(h.parts.rh)}</td></tr>
              <tr><td>${L("Laiteviat (puhallin seis, anturi offline)", "Device faults (fan stopped, sensor offline)")}</td><td class="r">25 %</td><td class="r num">−${n1(h.parts.dev)}</td></tr>
              <tr><td>${L("Avoimet poikkeamat", "Open anomalies")}</td><td class="r">20 %</td><td class="r num">−${n1(h.parts.ano)}</td></tr>
              <tr><td><b>Roof Health Score</b></td><td></td><td class="r"><b class="num">${h.score}</b></td></tr>
            </tbody>
          </table>
          <p class="muted" style="font-size:13px;margin-top:14px">${L("Vertailuluvut (Suomi): vuotovahinkoja ~35 000 / v, korvaukset ~171 M€, keskimääräinen vuotovahinko ~5 000 €. Jos valvonta estää yhden vahingon kymmenessä vuodessa, odotettu säästö on ~500 €/kohde/v.", "Reference figures (Finland): ~35,000 water-damage claims a year, ~€171M paid out, average claim ~€5,000. If monitoring prevents one claim in ten years, the expected saving is ~€500 per site per year.")}</p>
        </section>
      </div>` : `<div class="card locked"><div style="font-size:40px">🔒</div><h2 style="margin:10px 0 6px">${L("Ei pääsyä kohteen tietoihin", "No access to site data")}</h2><p>${L("Data on rakennuksen omistajan. Jako kolmansille osapuolille vain suostumuksella, ja suostumus on peruttavissa.", "The data belongs to the building owner. It is shared with third parties only with consent, which can be withdrawn.")}</p></div>`}`;
    bindSiteSelect();
    $("#consent").addEventListener("change", (e) => {
      state.consent[site.id] = e.target.checked;
      save();
      renderInsurer(site);
      toast(e.target.checked ? L("Suostumus annettu – vakuuttaja näkee riskitiedot.", "Consent given – the insurer can see risk data.") : L("Suostumus peruttu – tiedot piilotettu vakuuttajalta.", "Consent withdrawn – data hidden from the insurer."));
    });
  }

  // ---------- Hallitusraportti ----------
  function renderReport(site) {
    const A = analyze(site);
    const P = I.profile();
    const h = health(site);
    const fs = findings(site);
    const act = fs.filter((f) => f.action);
    const done = act.filter((f) => f.state.status !== "open");
    const open = openCount(site);
    const hw = A.sensors.length * 145 + A.units.length * 1100 + 1000;
    const monthly = hw / 120 + 30;
    const pts = [...fs.filter((f) => f.pts && f.state.status !== "resolved").map((f) => f.pts), L("Uusi Kosteuspassi 12 kk kuluttua tai ennen myyntiä / vakuutuksen uusintaa.", "New Moisture Passport in 12 months or before a sale / insurance renewal.")];
    const y0 = A.days[0].slice(0, 4);
    const y1 = A.days[A.lastIdx].slice(0, 4);
    const period = A.fullYear ? (y0 === y1 ? y0 : `${y0}–${y1}`) : `${month(A.days[0].slice(0, 7))} – ${month(A.days[A.lastIdx].slice(0, 7))}`;
    view.innerHTML = `
      <div class="doc-actions">
        <div class="button-row">${siteSelect(site, "raportti")}</div>
        <button class="button" id="print">${L("Tulosta / PDF", "Print / PDF")}</button>
      </div>
      <article class="doc">
        <header class="doc__head">
          <div>
            <div class="caps" style="color:#E3530F">Sense+ Care · ${A.fullYear ? esc(I.pick(P.boardDoc)) : L("kausiraportti hallitukselle", "interim report for the board")}</div>
            <h1>${L("Katon kosteusturva", "Roof moisture protection")} ${period}</h1>
            <p>${esc(site.name)} · ${L(`laatinut Sense+ automaattisesti ${fdate(today)}`, `generated automatically by Sense+ on ${fdate(today)}`)}</p>
          </div>
          <img src="assets/vilpe-logo.svg" alt="VILPE">
        </header>
        <div class="doc__body">
          <section class="doc__section" style="display:flex;gap:22px;align-items:center;flex-wrap:wrap">
            ${gauge(h.score, 96, false, siteLevel(site, h.score))}
            <div style="flex:1;min-width:240px">
              <div class="caps muted">${L("Tilannekuva", "Status")}</div>
              <h2 class="plain" style="font-size:22px;margin:4px 0 6px">${open === 0 ? L("Katto on kunnossa.", "The roof is in good condition.") : L(`Katto on pääosin kunnossa – ${open === 1 ? "yksi asia vaatii" : `${open} asiaa vaativat`} toimenpiteitä.`, `The roof is mostly in good condition – ${open === 1 ? "one issue needs" : `${open} issues need`} action.`)}</h2>
              <p style="font-size:15px">${L("Seurannassa", "Monitored")}: ${devicesText(site)}. ${pct(A.safeShare)} % ${safeLabel(A)}. ${open ? L(`Avoimia havaintoja ${open}.`, `Open findings: ${open}.`) : L("Kaikki havainnot on korjattu.", "All findings have been fixed.")}</p>
            </div>
          </section>
          <section class="doc__section">
            <h2>${L("Kauden tärkeimmät havainnot", "Key findings of the period")}</h2>
            <ul class="checklist">
              ${act.map((f) => `<li><span class="${f.state.status === "resolved" ? "ok" : "warn"}">${f.state.status === "resolved" ? "✔" : "⚠"}</span><span>${f.plain}${f.state.status === "resolved" ? L(" Korjattu.", " Fixed.") : ""}</span></li>`).join("")}
              ${site.newBuild
                ? `<li><span class="ok">✔</span><span>${L(`Rakennuskosteus on kuivunut: katon kosteus laski ${n0(A.firstMonth.rh)} %:sta ${n0(A.driest.rh)} %:iin.`, `Construction moisture has dried out: roof humidity fell from ${n0(A.firstMonth.rh)} % to ${n0(A.driest.rh)} %.`)}</span></li>`
                : `<li><span class="ok">✔</span><span>${L(`Rakenteen kosteustaso on normaali (kuukausikeskiarvot ${n0(A.driest.rh)}–${n0(A.wettest.rh)} %, vaihtelu seuraa vuodenaikoja).`, `Structural humidity is normal (monthly means ${n0(A.driest.rh)}–${n0(A.wettest.rh)} %, varying with the seasons).`)}</span></li>`}
              ${A.maxMold !== null ? `<li><span class="ok">✔</span><span>${L(`Homeriski on matala (suurin homeindeksi ${n1(A.maxMold)}, hälytysraja 2,5).`, `Mould risk is low (highest mould index ${n1(A.maxMold)}, alert limit 2.5).`)}</span></li>` : ""}
            </ul>
          </section>
          <section class="doc__section">
            <h2>${L("Tehdyt toimenpiteet", "Actions taken")}</h2>
            ${done.length ? `<div class="table-wrap"><table><thead><tr><th>${L("Havainto", "Finding")}</th><th>${L("Tilaus", "Order")}</th><th>${L("Tila", "Status")}</th></tr></thead><tbody>${done.map((f) => `<tr><td>${esc(f.title)}</td><td>${f.state.order.no} · ${esc(f.state.order.partner)}</td><td>${f.state.status === "resolved" ? `<span class="chip chip--ok">${L("Korjattu", "Fixed")}</span>` : `<span class="chip chip--warn">${L("Tilattu", "Ordered")}</span>`}</td></tr>`).join("")}</tbody></table></div>` : `<p class="muted">${act.length ? L("Ei vielä toimenpiteitä. Tilaa korjaukset kohdenäkymän toimenpidelistalta.", "No actions yet. Order repairs from the site view's action list.") : L("Ei toimenpiteitä vaativia havaintoja.", "No findings requiring action.")}</p>`}
          </section>
          <section class="doc__section grid grid--2" style="gap:28px">
            <div>
              <h2>${L("Suositukset pitkän tähtäimen suunnitelmaan", "Recommendations for the long-term plan")}</h2>
              <ul class="checklist" style="font-size:14px">${pts.map((p, i) => `<li><span>${i + 1}.</span><span>${esc(p)}</span></li>`).join("")}</ul>
            </div>
            <div>
              <h2>${L("Kustannus ja hyöty", "Cost and benefit")}</h2>
              <div class="facts" style="grid-template-columns:1fr 1fr">
                <div><b>~${I.price(monthly)}/${L("kk", "mo")}</b><span>${L("Care Pro + laitteisto palveluna", "Care Pro + hardware as a service")}</span></div>
                <div><b>${site.apartments ? I.price(monthly / site.apartments, 2) : "–"}</b><span>${site.apartments ? L(`per ${I.pick(P.unitWord)} kuukaudessa (${site.apartments} kpl)`, `per ${I.pick(P.unitWord)} per month (${site.apartments})`) : L("liikekiinteistö", "commercial property")}</span></div>
                <div><b>&gt; ${I.money(5000)}</b><span>${L("yksi vältetty kattovuoto", "one avoided roof leak")}</span></div>
                <div><b>5–10 %</b><span>${L("vakuutusalennus datan perusteella", "insurance discount based on data")}</span></div>
              </div>
              <p class="muted" style="font-size:12px;margin-top:8px">${L("Raportin vastaanottaja", "Report recipient")}: ${esc(I.role("owner"))}</p>
            </div>
          </section>
        </div>
        <footer class="doc__foot"><span>${L("Laskelmat ovat havainnollistavia arvioita.", "Figures are illustrative estimates.")}${site.real ? "" : L(" Kohteen data on simuloitu demoa varten.", " The site's data is simulated for the demo.")}</span><span>VILPE Sense+ Care Pro</span></footer>
      </article>`;
    bindSiteSelect();
    $("#print").addEventListener("click", () => window.print());
  }

  // ---------- Liiketoiminta ja maaprofiilit ----------
  function renderModel() {
    const P = I.profile();
    const codes = Object.keys(I.PROFILES).sort((a, b) => I.PROFILES[a].step - I.PROFILES[b].step);
    const roleRow = (label, k) => {
      const r = P.roles[k];
      return `<tr><th>${label}</th><td>${esc(L(r.fi, r.en))}${r.local ? ` <span class="muted">· ${esc(r.local)}</span>` : ""}</td></tr>`;
    };
    view.innerHTML = `
      <div class="page-head">
        <div>
          <div class="caps muted">${L("Ansaintamalli", "Business model")}</div>
          <h1>${L("Sama anturi. Uusi liiketoiminta.", "Same sensor. New business.")}</h1>
          <p>${L("Sense+ tuottaa arvoa koko rakennuksen elinkaaren ajan, ja samasta datasta maksaa useampi osapuoli.", "Sense+ creates value across the whole building lifecycle, and several parties pay for the same data.")}</p>
        </div>
      </div>
      <div class="lifecycle">
        <div><h3>${L("Rakentaminen", "Construction")}</h3><b>${L("Urakoitsija asentaa", "Contractor installs")}</b><span>${L("Sense + Sense+ tarjoukseen, urakoitsija saa provision", "Sense + Sense+ in the quote, contractor earns commission")}</span></div>
        <div><h3>${L("Luovutus", "Handover")}</h3><b>${L("Kosteuspassi #1", "Moisture Passport #1")}</b><span>${L("Kuivuminen todennettu datalla", "Drying verified with data")}</span></div>
        <div><h3>${L("Käyttö 10–15 v", "Operation 10–15 yrs")}</h3><b>Sense+ Care</b><span>${L("Valvoo, hälyttää, ohjaa korjaukset, raportoi", "Monitors, alerts, routes repairs, reports")}</span></div>
        <div><h3>${L("Myynti / remontti", "Sale / renovation")}</h3><b>${L("Kosteuspassi #2", "Moisture Passport #2")}</b><span>${L("Vuosien näyttö → uusi kierros", "Years of evidence → next cycle")}</span></div>
      </div>
      <div class="grid grid--3">
        <section class="card plan">
          <h3>Care Basic</h3><div class="plan__price">~${I.price(20)}<small style="font-size:14px;font-weight:400"> /${L("kk/kohde", "mo/site")}</small></div><span class="muted" style="font-size:14px">${L("Asuinyhteisöt, pienet kohteet", "Residential associations, small sites")}</span>
          <ul><li>${L("Salkkunäkymä ja Health Score", "Portfolio view and Health Score")}</li><li>${L("Laitevalvonta ja hälytykset", "Device monitoring and alerts")}</li><li>${L("Työtilaus kumppaniurakoitsijalle", "Work orders to partner contractors")}</li><li>${L("Hallitusraportti vuosittain", "Annual board report")}</li><li class="no">${L("Poikkeamatunnistus ja sääkorrelaatio", "Anomaly detection and weather correlation")}</li><li class="no">${L("Asiantuntijavarmistus", "Expert verification")}</li></ul>
        </section>
        <section class="card plan plan--featured">
          <h3>Care Pro</h3><div class="plan__price">${I.price(60)}–${I.price(90)}<small style="font-size:14px;font-weight:400"> /${L("kk/kohde", "mo/site")}</small></div><span class="muted" style="font-size:14px">${L("Tasakatot, viherkatot, liikekiinteistöt", "Flat roofs, green roofs, commercial")}</span>
          <ul><li>${L("Kaikki Basicin ominaisuudet", "Everything in Basic")}</li><li>${L("Poikkeamatunnistus (naapurivertailu)", "Anomaly detection (neighbour comparison)")}</li><li>${L("Sääkorrelaatio", "Weather correlation")}: ${esc(I.pick(P.weather))}</li><li>${L("VILPEn asiantuntijavarmistus", "VILPE expert verification")}</li><li>${L("Raportti kvartaaleittain + PTS-syöte", "Quarterly report + long-term plan input")}</li><li>${L("1 Kosteuspassi / vuosi", "1 Moisture Passport / year")}</li></ul>
        </section>
        <section class="card plan">
          <h3>Portfolio</h3><div class="plan__price">${L("Sopimus", "Contract")}</div><span class="muted" style="font-size:14px">${L(`${I.roleShort("manager")}-toimistot, −20 % yli 20 kohdetta`, `${I.roleShort("manager")} firms, −20 % above 20 sites`)}</span>
          <ul><li>${L("Kaikki Pron ominaisuudet", "Everything in Pro")}</li><li>${L("Kosteuspassit sisältyvät", "Moisture Passports included")}</li><li>${L("API ja kiinteistöjärjestelmäintegraatio", "API and property-system integration")}</li><li>${L("Vakuutusdatan jako suostumuksella", "Insurer data sharing with consent")}</li><li>${L("Oma yhteyshenkilö VILPEllä", "Dedicated VILPE contact")}</li></ul>
        </section>
      </div>
      <p class="muted" style="font-size:12px;margin-top:8px">${L(`Hinnat maaprofiililla ${I.pick(P.name)}: perushinta × maakerroin ${n1(P.mult)}${P.currency !== "EUR" ? ` × arvioitu kurssi ${nd(P.rate, 2)} ${P.currency}/€` : ""}. Hypoteeseja, testataan pilotissa.`, `Prices for the ${I.pick(P.name)} profile: base price × country multiplier ${n1(P.mult)}${P.currency !== "EUR" ? ` × estimated rate ${nd(P.rate, 2)} ${P.currency}/€` : ""}. Hypotheses to be tested in pilots.`)}</p>

      <div class="grid grid--2" style="margin-top:20px">
        <section class="card">
          <div class="card__head"><h2>${L("Maaprofiili", "Country profile")}: ${esc(I.pick(P.name))}</h2><span class="caps">${L("sama palvelu, eri termit", "same service, local terms")}</span></div>
          <table class="profile-table">
            <tbody>
              ${roleRow(L("Omistaja (maksaja)", "Owner (payer)"), "owner")}
              ${roleRow(L("Pääkäyttäjä", "Main user"), "manager")}
              ${roleRow(L("Korjaaja", "Repairer"), "contractor")}
              ${roleRow(L("Riskinkantaja", "Risk bearer"), "insurer")}
              <tr><th>${L("Kärkisegmentti", "Lead segment")}</th><td>${esc(I.pick(P.segment))}</td></tr>
              <tr><th>${L("Säädöskytkentä", "Regulatory link")}</th><td>${esc(I.pick(P.regulation))}</td></tr>
              <tr><th>${L("Säädata", "Weather data")}</th><td>${esc(I.pick(P.weather))}</td></tr>
              <tr><th>${L("Yksiköt ja valuutta", "Units and currency")}</th><td>${I.tempUnit()} · ${I.areaUnit()} · ${P.currency}</td></tr>
              <tr><th>${L("Tietosuoja", "Data protection")}</th><td>${esc(I.pick(P.privacy))} · ${L("data säilytetään EU:ssa", "data stored in the EU")}</td></tr>
              <tr><th>${L("Palvelun kieli", "Service language")}</th><td>${P.lang === "fi" ? L("suomi (englanti valittavissa)", "Finnish (English available)") : L("englanti (suomi valittavissa)", "English (Finnish available)")}</td></tr>
            </tbody>
          </table>
        </section>
        <section class="card">
          <div class="card__head"><h2>${L("Laajenemisjärjestys", "Expansion order")}</h2><span class="caps">${L("klikkaa vaihtaaksesi maata", "click to switch country")}</span></div>
          <div class="table-wrap"><table>
            <thead><tr><th>#</th><th>${L("Maa", "Country")}</th><th class="r">${L("Maakerroin", "Multiplier")}</th><th>${L("Valuutta", "Currency")}</th><th>${L("Kytkentä", "Link")}</th></tr></thead>
            <tbody>${codes.map((c) => {
              const p = I.PROFILES[c];
              const link = c === "UK" ? "Awaab's Law · golden thread" : c === "US" ? "Roof asset report" : "EPBD 2024";
              return `<tr class="is-clickable ${c === I.country ? "is-selected" : ""}" data-country="${c}"><td>${p.step}</td><td><b>${esc(I.pick(p.name))}</b></td><td class="r num">${n1(p.mult)}</td><td>${p.currency}</td><td>${link}</td></tr>`;
            }).join("")}</tbody>
          </table></div>
          <p class="muted" style="font-size:13px;margin-top:12px">${L("Uusi maa on yksi konfiguraatio: roolitermit, yksiköt, valuutta, säädöskytkentä ja hintakerroin – ei uutta ohjelmistoa.", "A new country is one configuration: role terms, units, currency, regulatory link and price multiplier – no new software.")}</p>
        </section>
      </div>

      <div class="grid grid--2" style="margin-top:20px">
        <section class="card calc">
          <div class="card__head"><h2>${L("Laskuri", "Calculator")}: ${esc(I.roleShort("owner"))}</h2><span class="caps">${L("laitteisto palveluna", "hardware as a service")}</span></div>
          <label for="c-area">${L("Kattoala", "Roof area")}: <span id="c-area-v"></span> ${I.areaUnit()}</label>
          <input type="range" id="c-area" min="200" max="3000" step="50" value="800">
          <label for="c-apts">${L("Asuntoja", "Apartments / units")}: <span id="c-apts-v"></span></label>
          <input type="range" id="c-apts" min="6" max="120" step="1" value="30">
          <label for="c-ins">${L("Kiinteistövakuutus", "Property insurance")}: <span id="c-ins-v"></span> /${L("v", "yr")}</label>
          <input type="range" id="c-ins" min="1000" max="20000" step="500" value="6000">
          <div class="calc__out" id="c-out"></div>
          <p class="muted" style="font-size:12px;margin-top:10px">${L(`~10 anturia / ${n0(I.area(200))} ${I.areaUnit()}, tukiasema ja asennus, kuoletus 10 v, Care Pro HaaS-paketissa, vakuutusetu 5–10 %. Hinnat maakertoimella.`, `~10 sensors per ${n0(I.area(200))} ${I.areaUnit()}, base station and installation, 10-year amortisation, Care Pro in the HaaS bundle, insurance benefit 5–10 %. Prices include the country multiplier.`)}</p>
        </section>
        <section class="card">
          <div class="card__head"><h2>${L("VILPEn esimerkkiskenaario", "VILPE example scenario")}</h2><span class="caps">${L("havainnollistava · EUR", "illustrative · EUR")}</span></div>
          <div class="table-wrap"><table>
            <thead><tr><th>${L("Vuosi", "Year")}</th><th class="r">${L("Care-kohteet", "Care sites")}</th><th class="r">Care</th><th class="r">${L("Passit", "Passports")}</th><th class="r">${L("Vakuutus", "Insurance")}</th><th class="r">${L("Yhteensä", "Total")}</th></tr></thead>
            <tbody>
              <tr><td>1 · ${L("pilotti", "pilot")}</td><td class="r num">150</td><td class="r num">${nd(0.1, 2)} M€</td><td class="r num">${nd(0.02, 2)} M€</td><td class="r num">–</td><td class="r num"><b>${nd(0.12, 2)} M€</b></td></tr>
              <tr><td>2</td><td class="r num">600</td><td class="r num">${nd(0.5, 2)} M€</td><td class="r num">${nd(0.1, 2)} M€</td><td class="r num">${nd(0.03, 2)} M€</td><td class="r num"><b>${nd(0.63, 2)} M€</b></td></tr>
              <tr><td>3</td><td class="r num">${n0(1500)}</td><td class="r num">${nd(1.35, 2)} M€</td><td class="r num">${nd(0.24, 2)} M€</td><td class="r num">${nd(0.11, 2)} M€</td><td class="r num"><b>${nd(1.7, 2)} M€</b></td></tr>
            </tbody>
          </table></div>
          <p class="muted" style="font-size:13px;margin-top:12px">${L("Oletukset: Care ~900 €/kohde/v, passi ~400 €, vakuutus ~75 €/kohde/v. Lisäksi kasvava laite- ja lisämyynti (huippuimurit, läpiviennit).", "Assumptions: Care ~€900 per site per year, passport ~€400, insurance ~€75 per site per year. Plus growing device and add-on sales (roof fans, penetrations).")}</p>
          <p class="quote" style="margin-top:18px">${L("Kertamyynnistä toistuvaan tuloon ja suoraan asiakassuhteeseen.", "From one-off sales to recurring revenue and a direct customer relationship.")}</p>
        </section>
      </div>`;
    const calc = () => {
      const area = +$("#c-area").value;
      const apts = +$("#c-apts").value;
      const ins = +$("#c-ins").value;
      $("#c-area-v").textContent = n0(I.area(area));
      $("#c-apts-v").textContent = apts;
      $("#c-ins-v").textContent = I.money(ins);
      const sensors = Math.ceil((area / 200) * 10);
      const hw = sensors * 145 + 1000;
      const monthly = hw / 120 + 30;
      $("#c-out").innerHTML = `
        <div><b class="num">${sensors}</b><span>${L("anturia", "sensors")} · ${L("laitteisto", "hardware")} ~${I.price(hw)}</span></div>
        <div><b class="num">${I.price(monthly)}/${L("kk", "mo")}</b><span>${L("vakuutusetu", "insurance benefit")} −${I.money(ins * 0.075)}/${L("v", "yr")}</span></div>
        <div><b class="num">${I.price(monthly / apts, 2)}</b><span>${L(`per ${I.pick(P.unitWord)} kuukaudessa`, `per ${I.pick(P.unitWord)} per month`)}</span></div>`;
    };
    $$(".calc input").forEach((i) => i.addEventListener("input", calc));
    calc();
    $$("[data-country]").forEach((row) => row.addEventListener("click", () => switchCountry(row.dataset.country)));
  }

  // ---------- Maa ja kieli ----------
  function renderLocaleControls() {
    const codes = Object.keys(I.PROFILES).sort((a, b) => I.PROFILES[a].step - I.PROFILES[b].step);
    $("#locale").innerHTML = `
      <select id="country" class="locale__country" aria-label="${L("Maaprofiili", "Country profile")}" title="${L("Maaprofiili", "Country profile")}">${codes.map((c) => `<option value="${c}" ${c === I.country ? "selected" : ""}>${c} · ${esc(I.pick(I.PROFILES[c].name))}</option>`).join("")}</select>
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
      salkku: L("Salkku", "Portfolio"), kohde: L("Kohde", "Site"), passi: L("Kosteuspassi", "Moisture Passport"),
      vakuutus: L("Vakuutusnäkymä", "Insurer view"), raportti: L("Hallitusraportti", "Board report"), malli: L("Liiketoiminta", "Business"),
    };
    $$("#nav a").forEach((a) => { a.textContent = NAV[a.dataset.view]; });
    $("#footer-a").textContent = L("VILPE Sense+ · prototyyppi · VILPE x Vaasa Hackathon 2026", "VILPE Sense+ · prototype · VILPE x Vaasa Hackathon 2026");
    $("#footer-b").textContent = L("VILPE Express Store, Vantaa: oikea data (9/2025–9/2026). Taloyhtiöiden data on simuloitu (12 kk), kumppanit kuvitteellisia.", "VILPE Express Store, Vantaa: real data (9/2025–9/2026). Housing company data is simulated (12 months); partners are fictional.");
    $("#reset").textContent = L("Nollaa demo", "Reset demo");
    renderLocaleControls();
  }

  // ---------- Reititys ----------
  const ROUTES = {
    salkku: { render: renderPortfolio },
    kohde: { render: renderSite, site: true },
    passi: { render: renderPass, site: true },
    vakuutus: { render: renderInsurer, site: true },
    raportti: { render: renderReport, site: true },
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
