/* VILPE Sense+ – klikattava prototyyppi.
   Kohteet: VILPE Express Store Vantaa (oikea data, data.js) + simuloidut taloyhtiöt (sim.js).
   Analytiikka (laitevalvonta, naapurivertailu, offline-tunnistus, Health Score)
   lasketaan selaimessa jokaiselle kohteelle samoilla säännöillä. */
(function () {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const view = $("#view");

  // ---------- Apurit ----------
  const nf1 = new Intl.NumberFormat("fi-FI", { maximumFractionDigits: 1 });
  const n1 = (v) => (v === null || v === undefined ? "–" : nf1.format(v));
  const n0 = (v) => (v === null || v === undefined ? "–" : Math.round(v).toLocaleString("fi-FI"));
  const parseDay = (s) => new Date(`${s}T12:00:00`);
  const fiDate = (s) => { const d = typeof s === "string" ? parseDay(s.length === 7 ? `${s}-01` : s.slice(0, 10)) : s; return `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`; };
  const MONTHS = ["tammi", "helmi", "maalis", "huhti", "touko", "kesä", "heinä", "elo", "syys", "loka", "marras", "joulu"];
  const monthShort = (s) => { const [y, m] = s.split("-"); return `${MONTHS[+m - 1]} ${y.slice(2)}`; };
  const monthTick = (s, i) => i === 0 || s.endsWith("-01");
  const median = (a) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const sd = (a) => { const m = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length); };
  const avg = (a) => { const v = a.filter((x) => x !== null && x !== undefined); return v.length ? v.reduce((x, y) => x + y, 0) / v.length : null; };
  const pct = (v) => (v > 99.9 && v < 100 ? "99,9" : n1(v));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const today = new Date();
  const TODAY = fiDate(today);
  const TODAY_ISO = today.toISOString().slice(0, 10);
  const addDays = (iso, n) => new Date(parseDay(iso).getTime() + n * 864e5).toISOString().slice(0, 10);

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
  const SCALES = {
    rh: { stops: [[20, "#CFE3F2"], [45, "#4EACE8"], [68, "#1A62A9"], [80, "#FFAE00"], [92, "#E2202C"]], unit: "%", label: "Suhteellinen kosteus", min: 20, max: 92 },
    t: { stops: [[-5, "#2D0396"], [5, "#4EACE8"], [15, "#9FC3DE"], [25, "#EA4840"]], unit: "°C", label: "Lämpötila", min: -5, max: 25 },
  };
  const scaleCss = (s) => `linear-gradient(90deg, ${s.stops.map(([v, c]) => `${c} ${((v - s.min) / (s.max - s.min)) * 100}%`).join(", ")})`;

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
    structure: V.site.structure,
    apartments: null,
    roof: { ...V.roof, src: "assets/roof.jpg" },
    events: [{ d: "2025-05-13", cls: "info", t: "Katto ja ryömintätilainen alapohja valmistuneet, Sense-seuranta alkaa (7 imuria, 51 anturia)" }],
  };
  const siteCache = new Map([["vantaa", VANTAA]]);
  function siteFor(cfg) {
    if (!siteCache.has(cfg.id)) siteCache.set(cfg.id, window.SenseSim.simulate(cfg));
    return siteCache.get(cfg.id);
  }
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
    const lastMonth = monthly[monthly.length - 1];
    const rhNow = sensors.length ? avg(sensors.filter((s) => !offline.includes(s)).map((s) => s.last.rh)) : avg(units.map((u) => u.days[u.days.length - 1].rhIn));

    let safeShare;
    let safeLabel;
    let overShare;
    if (sensors.length) {
      let ok = 0;
      let all = 0;
      sensors.forEach((s) => s.rh.forEach((v) => { if (v !== null) { all++; if (v < 80) ok++; } }));
      safeShare = (100 * ok) / all;
      safeLabel = "anturipäivistä turvallisella alueella (vrk-keskiarvo RH < 80 %)";
    } else {
      const all = units.flatMap((u) => u.days.map((d) => d.rhIn)).filter((x) => x !== null);
      safeShare = (100 * all.filter((x) => x < 90).length) / all.length;
      safeLabel = "päivistä rakenteen RH alle 90 %";
    }
    if (units.length) overShare = avg(units.map((u) => u.rhIn90));
    else overShare = 100 - safeShare;

    const sensorDays = sensors.reduce((a, s) => a + s.rh.filter((x) => x !== null).length, 0);
    const result = {
      days, lastIdx, units, sensors,
      unitBy: Object.fromEntries(units.map((u) => [u.name, u])),
      sensorBy: Object.fromEntries(sensors.map((s) => [s.id, s])),
      anomalies, offline, stopped, maxMold, riskUnit,
      othersTMin: others.length ? Math.min(...others.map((s) => s.tMin)) : null,
      othersRhMax: others.length ? Math.max(...others.map((s) => s.rhMax)) : null,
      firstMonth, driest, lastMonth, rhNow, safeShare, safeLabel, overShare,
      fanUptime: units.length ? avg(units.map((u) => u.on)) : null,
      sensorAvailability: sensors.length ? (100 * sensorDays) / (sensors.length * days.length) : null,
      measurements: site.real ? sensors.reduce((a, s) => a + s.n, 0) : sensors.reduce((a, s) => a + s.n, 0) + units.length * days.length * 12,
      fullYear: days.length >= 330,
    };
    analysisCache.set(site.id, result);
    return result;
  }

  const siteFindings = (site) => (state.findings[site.id] = state.findings[site.id] || {});
  const fState = (site, id) => siteFindings(site)[id] || { status: "open" };

  function findings(site) {
    const A = analyze(site);
    const list = [];
    A.stopped.forEach((u) => {
      list.push({
        id: `fan-${u.serial}`,
        kind: "device",
        level: "alert",
        title: `${u.name}: puhallin ei ole käynyt ${n0(u.stopDays)} vrk`,
        text: u.ongoing
          ? `Puhallin on ollut pysähdyksissä ${fiDate(u.stopFrom)} lähtien. Rakenteen kosteus on noussut ${n1(u.stopPeak)} %:iin (kk-ka.).`
          : `Puhallin oli pysähdyksissä ${fiDate(u.stopFrom)}–${fiDate(u.stopTo)}${u.on < 50 ? `, ja käy edelleen vain ${n0(u.on)} % ajasta` : ""}. Rakenteen kosteus nousi seisokin aikana ${n1(u.stopPeak)} %:iin (kk-ka.).`,
        evidence: `Sääntö: rpm = 0 yli 48 h (pakkaspäiviä ei lasketa) ja sisä-AH > ulko-AH → tuuletus olisi kannattanut ${u.ventLost} päivänä. Sense+ olisi hälyttänyt ${fiDate(u.alertDay)}.`,
        plain: `Huippuimuri (${u.name}) ei käynyt ${n0(u.stopDays)} vuorokauteen, ja rakenteen kosteus nousi ${n0(u.stopPeak)} %:iin.`,
        pts: `${u.name}: puhaltimen huolto, vaihto jos vika toistuu (~500–700 €).`,
        passOpen: `1 kosteudenhallintayksikkö (${u.name}) ei toiminut ${n0(u.stopDays)} vrk`,
        passDone: `${u.name}: puhallin seis ${n0(u.stopDays)} vrk – huollettu`,
        action: "Tilaa huolto",
        target: { type: "unit", name: u.name },
        orderText: `Huippuimurin ${u.name} (${u.serial}) puhallin ei käy. Laite on ollut pysähdyksissä ${fiDate(u.stopFrom)}${u.ongoing ? " lähtien" : `–${fiDate(u.stopTo)}`}. Pyydämme tarkistamaan puhaltimen, kytkennät ja MCU-2-ohjausyksikön asetukset.`,
        weight: 25,
      });
    });
    A.offline.forEach((s) => {
      list.push({
        id: `offline-${s.id}`,
        kind: "device",
        level: "warn",
        title: `Anturi ${s.id} ei ole lähettänyt dataa ${s.offlineDays} vrk`,
        text: `Viimeisin mittaus ${fiDate(s.last.ts)}. Anturi lähettää normaalisti kaksi kertaa vuorokaudessa, joten tämä katon alue on nyt valvonnan ulkopuolella.`,
        evidence: "Sääntö: ei mittausta yli 36 h. Todennäköinen syy: yhteyskatko tukiasemaan tai anturivika (akku mitoitettu 15 vuodelle).",
        plain: `Yksi vuotoanturi (${s.id}) lakkasi lähettämästä dataa, joten osa katosta on valvonnan ulkopuolella.`,
        pts: `Anturin ${s.id} tarkistus tai vaihto (~145 €).`,
        passOpen: `1 anturi (${s.id}) ilman yhteyttä ${s.offlineDays} vrk`,
        passDone: `Anturi ${s.id}: yhteys palautettu`,
        action: "Tilaa huolto",
        target: { type: "sensor", id: s.id, day: s.last.ts.slice(0, 10) },
        orderText: `Vuotoanturi ${s.id} ei ole lähettänyt mittauksia ${fiDate(s.last.ts)} jälkeen. Pyydämme tarkistamaan anturin ja yhteyden tukiasemaan. Sijainti kosteuskartalla liitteenä.`,
        weight: 8,
      });
    });
    A.anomalies.forEach((s) => {
      const valid = (arr) => arr.filter((x) => x !== null);
      const tMinDay = A.days[s.t.indexOf(Math.min(...valid(s.t)))];
      const rhMaxDay = A.days[s.rh.indexOf(Math.max(...valid(s.rh)))];
      list.push({
        id: `sensor-${s.id}`,
        kind: "sensor",
        level: "warn",
        title: `Anturi ${s.id} poikkeaa naapureistaan`,
        text: `${[s.rhAnomalyDays ? `RH nousi ${n1(s.rhMax)} %:iin (muiden maksimi ${n1(A.othersRhMax)} %)` : "", s.tAnomalyDays ? `lämpötila laski ${n1(s.tMin)} °C:seen (muiden minimi ${n1(A.othersTMin)} °C)` : ""].filter(Boolean).join(" ja ").replace(/^./, (c) => c.toUpperCase())}. ${s.rhAnomalyDays && !s.tAnomalyDays ? "Kosteus nousee sateiden jälkeen vain tällä alueella – todennäköinen vuoto vedeneristeessä tai läpiviennissä." : "Mahdollinen vuoto, kylmäsilta, läpivienti tai paikallinen kosteuslähde."}`,
        evidence: `Sääntö: RH > naapurien mediaani + 3σ tai T < mediaani − 4 °C. Poikkeama ${s.anomalyDays} päivänä (RH ${s.rhAnomalyDays}, T ${s.tAnomalyDays}). Kostein päivä ${fiDate(rhMaxDay)}, kylmin ${fiDate(tMinDay)}.`,
        plain: `Yksi katon anturi (${s.id}) näyttää muita kosteampaa${s.tAnomalyDays ? " ja kylmempää" : ""}. Alue kannattaa tarkastaa.`,
        pts: `Katon tarkastus anturin ${s.id} alueelta.`,
        passOpen: `1 poikkeama-alue tunnistettu (anturi ${s.id})`,
        passDone: `Poikkeama-alue (anturi ${s.id}) tarkastettu`,
        action: "Tilaa tarkastus",
        target: { type: "sensor", id: s.id, day: rhMaxDay },
        orderText: `Vuotoanturi ${s.id} poikkeaa jatkuvasti naapuriantureistaan (max ${n1(s.rhMax)} % RH, min ${n1(s.tMin)} °C). Pyydämme tarkastamaan katon alueen anturin ympäriltä: vedeneriste, läpiviennit, reuna-alueet ja mahdolliset kylmäsillat. Sijainti kosteuskartalla liitteenä.`,
        weight: 10,
      });
    });
    if (A.riskUnit && A.riskUnit.mold > 0.3) {
      const u = A.riskUnit;
      list.push({
        id: "risk-unit",
        kind: "info",
        level: "info",
        title: `${u.name} on kohteen riskialttein osa`,
        text: `Homeindeksi ${n1(u.mold)} (hälytysraja 2,5). Rakenteen RH yli 90 % ${n0(u.rhIn90)} % ajasta, vaikka puhallin käy ${n0(u.on)} % ajasta.`,
        evidence: "Seurannassa. Suositus PTS:ään: tuuletuksen tehostus, jos homeindeksi ylittää 1,0.",
        pts: `${u.name}: tuuletuksen tehostus, jos homeindeksi ylittää 1,0.`,
      });
    }
    const actionableCount = list.filter((f) => f.action).length;
    if (site.newBuild) {
      list.push({
        id: "drying",
        kind: "info",
        level: "ok",
        title: "Rakennuskosteus on kuivunut",
        text: `Katon anturiston RH laski ${n1(A.firstMonth.rh)} %:sta ${n1(A.driest.rh)} %:iin (${monthShort(A.driest.m)}). Kesän nousu seuraa ulkoilmaa eikä yllä kriittisiin lukemiin.`,
        evidence: `${pct(A.safeShare)} % ${A.safeLabel}.`,
      });
    } else {
      list.push({
        id: "stable",
        kind: "info",
        level: "ok",
        title: actionableCount ? "Kosteustaso muuten normaali" : "Kosteustaso on normaali",
        text: `Rakenteen kosteus ${n1(A.firstMonth.rh)} % → ${n1(A.lastMonth.rh)} % (${monthShort(A.firstMonth.m)}–${monthShort(A.lastMonth.m)}). Nousu seuraa ulkoilman syksyistä kosteutta.`,
        evidence: `${pct(A.safeShare)} % ${A.safeLabel}.`,
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
  const LEVEL_TEXT = { ok: "Kunnossa", warn: "Vaatii huomiota", alert: "Kriittinen" };
  const passGrade = (site) => (openCount(site) === 0 ? "A" : "B");
  const GRADE_COLORS = { A: "#157539", B: "#3ADB76", C: "#FFAE00", D: "#E3530F", E: "#A00000" };
  const devicesText = (site) => [site.sensors.length ? `${site.sensors.length} anturia` : "", site.units.length ? `${site.units.length} imuria` : ""].filter(Boolean).join(" · ");
  const comboText = (site) => (site.sensors.length && site.units.length ? "Vuotopaikannin + kosteudenhallinta" : site.sensors.length ? "Vuotopaikannin" : "Kosteudenhallinta");

  function gauge(score, size = 72, dark = true, lv = level(score)) {
    const r = 30;
    const c = 2 * Math.PI * r;
    const col = LEVEL_COLOR[lv];
    return `<svg class="gauge" viewBox="0 0 72 72" width="${size}" height="${size}" aria-label="Health Score ${score}">
      <circle cx="36" cy="36" r="${r}" fill="none" stroke="${dark ? "rgba(255,255,255,.15)" : "rgba(1,39,62,.08)"}" stroke-width="7"/>
      <circle cx="36" cy="36" r="${r}" fill="none" stroke="${col}" stroke-width="7" stroke-dasharray="${(c * Math.max(0, score)) / 100} ${c}" transform="rotate(-90 36 36)"/>
      <text x="36" y="42" text-anchor="middle" font-size="20" font-weight="700" fill="${dark ? "#fff" : "#01273E"}" font-family="Inter, Helvetica, Arial">${score}</text>
    </svg>`;
  }

  // Kohdevalitsin kohdekohtaisille näkymille
  function siteSelect(site, viewKey) {
    const list = allSites();
    return `<label class="site-select"><span class="caps muted">Kohde</span>
      <select data-site-select="${viewKey}">${list.map((s) => `<option value="${s.id}" ${s.id === site.id ? "selected" : ""}>${esc(s.name)}</option>`).join("")}</select></label>`;
  }
  function bindSiteSelect() {
    $$("[data-site-select]").forEach((sel) => sel.addEventListener("change", () => { location.hash = `#/${sel.dataset.siteSelect}/${sel.value}`; }));
  }
  const dataBadge = (site) => (site.real ? '<span class="chip chip--info">Oikea data</span>' : `<span class="chip chip--muted">Simuloitu data${site.custom ? " · uusi kohde" : ""}</span>`);

  function noSites() {
    view.innerHTML = `<div class="card locked"><h2 style="margin-bottom:8px">Salkussa ei ole kohteita</h2><p>Lisää ensimmäinen kohde salkkunäkymässä.</p><div style="margin-top:18px"><a class="button" href="#/salkku">Siirry salkkuun</a></div></div>`;
  }

  // ---------- Kirjautumissivu ----------
  function renderLogin() {
    view.innerHTML = `
      <div class="login">
        <div class="login__brand">
          <img src="assets/vilpe-logo.svg" alt="VILPE">
          <h1>Sense<b>+</b></h1>
          <p>Rakenteen kosteusturva koko elinkaaren ajan.</p>
        </div>
        <form class="login__form" id="login-form" novalidate>
          <h2>Kirjaudu sisään</h2>
          <div class="field"><label for="login-user">Käyttäjätunnus</label><input id="login-user" autocomplete="username" required></div>
          <div class="field"><label for="login-pass">Salasana</label><input id="login-pass" type="password" autocomplete="current-password" required></div>
          <p class="login__error" id="login-error" role="alert" hidden>Väärä käyttäjätunnus tai salasana.</p>
          <button class="button" type="submit">Kirjaudu</button>
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
      const brokenUnits = A.stopped.filter((u) => fState(x.s, `fan-${u.serial}`).status !== "resolved").length;
      const offline = A.offline.filter((s) => fState(x.s, `offline-${s.id}`).status !== "resolved").length;
      return a + x.s.sensors.length + x.s.units.length - brokenUnits - offline;
    }, 0);

    view.innerHTML = `
      <div class="page-head">
        <div>
          <div class="caps muted">${today.toLocaleDateString("fi-FI", { weekday: "long" })} ${TODAY}</div>
          <h1>Kohdesalkku</h1>
          <p>Kosteusturvan tilannekuva kohteistasi – järjestetty kiireellisyyden mukaan.</p>
        </div>
        <button class="button" id="add-site">+ Lisää kohde</button>
      </div>
      ${sites.length ? `
      <div class="summary">
        <div><b class="num">${sites.length}</b><span>kohdetta Sense+ Caressa</span></div>
        <div><b class="num" style="color:${attention ? LEVEL_DARK.warn : LEVEL_DARK.ok}">${attention}</b><span>vaatii huomiota</span></div>
        <div><b class="num" style="color:${openTotal ? LEVEL_DARK.alert : LEVEL_DARK.ok}">${openTotal}</b><span>avointa havaintoa</span></div>
        <div><b class="num">${devOk}/${devTotal}</b><span>laitetta toiminnassa</span></div>
      </div>
      <div class="sites">
        ${sites.map(({ s, h, lv, open }) => {
          const note = open ? `${open} avoin${open > 1 ? "ta" : ""} havainto${open > 1 ? "a" : ""}` : "Kaikki kunnossa";
          return `<article class="site" data-open-site="${s.id}" tabindex="0" role="link" aria-label="Avaa ${esc(s.name)}">
            <div class="site__bar" style="background:${LEVEL_COLOR[lv]}"></div>
            <div class="site__body">
              <div class="site__info">
                <h3>${esc(s.name)}</h3>
                <div class="site__meta">${esc(s.city)} · ${esc(s.type)}</div>
                <div class="site__meta">${comboText(s)} · ${devicesText(s)}</div>
                <div class="site__meta">Seuranta ${fiDate(s.days[0])}–${fiDate(s.days[s.days.length - 1])}</div>
                <div class="site__status"><span class="dot dot--${lv}"></span><span>${note}</span></div>
              </div>
              <div class="site__score"><b class="num" style="color:${LEVEL_DARK[lv]}">${h}</b><span>Health Score</span></div>
            </div>
            <div class="site__foot">
              <span>${dataBadge(s)}</span>
              <span class="site__actions"><button class="link-button" data-delete-site="${s.id}">Poista</button><strong>Avaa →</strong></span>
            </div>
          </article>`;
        }).join("")}
      </div>` : `<div class="card locked"><h2 style="margin-bottom:8px">Salkku on tyhjä</h2><p>Lisää kohde aloittaaksesi, tai palauta demokohteet footerin Nollaa demo -painikkeesta.</p></div>`}`;

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
      <div class="modal__head"><h2 id="modal-title">Lisää kohde</h2><button class="modal__close" data-close aria-label="Sulje">×</button></div>
      <form class="modal__body" id="site-form" novalidate>
        <div class="form-row"><label for="s-name">Kohteen nimi</label><input id="s-name" placeholder="esim. As Oy Esimerkkitalo" required maxlength="60"></div>
        <div class="form-row"><label for="s-city">Paikkakunta</label><input id="s-city" value="Vaasa" maxlength="40"></div>
        <div class="form-row"><label for="s-type">Rakenne</label><select id="s-type">${ROOF_TYPES.map((t) => `<option>${t}</option>`).join("")}</select></div>
        <div class="form-row"><label for="s-sensors">Vuotoanturit (RHT-2)</label><input id="s-sensors" type="number" min="0" max="80" value="20"></div>
        <div class="form-row"><label for="s-units">Kosteudenhallinta (MCU-2 + imuri)</label><input id="s-units" type="number" min="0" max="10" value="1"></div>
        <div class="form-row"><label for="s-apts">Asuntoja</label><input id="s-apts" type="number" min="0" max="400" value="24"></div>
        <div class="form-row"><span class="label"></span><p class="muted" style="font-size:13px">Demossa uuden kohteen data simuloidaan 3 kuukauden ajalta valitulla laitekombolla.</p></div>
        <p class="login__error" id="site-error" role="alert" hidden></p>
      </form>
      <div class="modal__foot">
        <button class="button button--hollow" data-close>Peruuta</button>
        <button class="button" id="save-site">Lisää kohde</button>
      </div>`);
    $("#s-name").focus();
    const submit = () => {
      const name = $("#s-name").value.trim();
      const sensors = Math.max(0, Math.min(80, Math.round(+$("#s-sensors").value || 0)));
      const units = Math.max(0, Math.min(10, Math.round(+$("#s-units").value || 0)));
      const err = $("#site-error");
      if (!name) { err.textContent = "Anna kohteelle nimi."; err.hidden = false; return; }
      if (sensors + units === 0) { err.textContent = "Kohteessa pitää olla vähintään yksi anturi tai kosteudenhallintayksikkö."; err.hidden = false; return; }
      if (sensors === 1) { err.textContent = "Vuotopaikannukseen tarvitaan vähintään 2 anturia (suositus ~10 / 200 m²)."; err.hidden = false; return; }
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
        storyEvents: [{ d: TODAY_ISO, cls: "info", t: "Kohde lisätty Sense+ Careen" }],
      });
      save();
      closeModal();
      route();
      toast(`${name} lisätty salkkuun.`);
    };
    $("#save-site").addEventListener("click", submit);
    $("#site-form").addEventListener("submit", (e) => { e.preventDefault(); submit(); });
  }

  function openDeleteSite(id) {
    const site = allSites().find((s) => s.id === id);
    if (!site) return;
    openModal(`
      <div class="modal__head"><h2 id="modal-title">Poista kohde</h2><button class="modal__close" data-close aria-label="Sulje">×</button></div>
      <div class="modal__body">
        <p>Poistetaanko <b>${esc(site.name)}</b> salkusta? Kohteen havainnot, työtilaukset ja suostumukset poistuvat näkymistä.</p>
        <p class="muted" style="font-size:13px;margin-top:10px">${site.custom ? "Itse lisätty kohde poistetaan pysyvästi." : "Demokohteen saa takaisin footerin Nollaa demo -painikkeella."}</p>
      </div>
      <div class="modal__foot">
        <button class="button button--hollow" data-close>Peruuta</button>
        <button class="button" id="confirm-delete">Poista kohde</button>
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
      toast(`${site.name} poistettu salkusta.`);
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
          <div class="crumbs"><a href="#/salkku">Salkku</a> / Kohde</div>
          <h1>${esc(site.name)}</h1>
          <p>${esc(site.structure)} · ${comboText(site)} · seuranta ${fiDate(A.days[0])}–${fiDate(A.days[A.lastIdx])} ${dataBadge(site)}</p>
        </div>
        <div class="button-row">
          ${siteSelect(site, "kohde")}
          <a class="button button--hollow" href="#/raportti/${site.id}">Hallitusraportti</a>
          <a class="button" href="#/passi/${site.id}">Luo Kosteuspassi</a>
        </div>
      </div>

      <div class="kpis">
        <div class="kpi kpi--score">${gauge(h.score, 72, true, lv)}<div><div class="caps">Roof Health Score</div><span>${LEVEL_TEXT[lv]}</span></div></div>
        <div class="kpi"><b class="num" style="color:${offlineOpen ? LEVEL_DARK.alert : "inherit"}">${hasSensors ? `${A.sensors.length - offlineOpen}/${A.sensors.length}` : "–"}</b><span>${hasSensors ? "vuotoanturia yhteydessä" : "ei vuotoantureita"}</span></div>
        <div class="kpi"><b class="num" style="color:${brokenUnits ? LEVEL_DARK.alert : "inherit"}">${hasUnits ? `${A.units.length - brokenUnits}/${A.units.length}` : "–"}</b><span>${hasUnits ? "kosteudenhallintayksikköä toiminnassa" : "ei kosteudenhallintaa"}</span></div>
        <div class="kpi"><b class="num">${n1(A.rhNow)} %</b><span>rakenteen RH nyt (ka.)</span></div>
        <div class="kpi"><b class="num">${A.maxMold === null ? "–" : n1(A.maxMold)}</b><span>${A.maxMold === null ? "homeindeksi vaatii MCU-2:n" : "suurin homeindeksi (raja 2,5)"}</span></div>
      </div>

      <div class="grid grid--main">
        <div class="stack">
          <section class="card" id="map-card">
            <div class="card__head">
              <h2>${hasSensors ? "Kosteuskartta" : "Laitekartta"}</h2>
              ${hasSensors ? `<div class="segmented" role="group" aria-label="Suure">
                <button data-metric="rh" class="${ui.metric === "rh" ? "is-active" : ""}">RH %</button>
                <button data-metric="t" class="${ui.metric === "t" ? "is-active" : ""}">°C</button>
              </div>` : ""}
            </div>
            <div class="map ${site.real ? "" : "map--sim"}" id="map">
              <img src="${site.roof.src}" alt="Kattokartta, ${esc(site.name)}" width="${site.roof.w}" height="${site.roof.h}">
              <canvas id="heat"></canvas>
              ${A.sensors.map((s) => {
                const flagged = (A.anomalies.includes(s) && fState(site, `sensor-${s.id}`).status !== "resolved") || (A.offline.includes(s) && fState(site, `offline-${s.id}`).status !== "resolved");
                return `<button class="map__pin ${flagged ? "map__pin--flag" : ""}" data-sensor="${s.id}" style="left:${s.pos[0] * 100}%;top:${s.pos[1] * 100}%" aria-label="Anturi ${s.id}"></button>`;
              }).join("")}
              ${A.units.filter((u) => u.pos).map((u) => `<button class="map__unit" data-unit="${esc(u.name)}" style="left:${u.pos[0] * 100}%;top:${u.pos[1] * 100}%" aria-label="Huippuimuri ${esc(u.name)}"></button>`).join("")}
            </div>
            <div class="map-controls">
              <button class="round-btn" id="play" aria-label="Toista seurantajakso">▶</button>
              <input type="range" id="day" min="0" max="${A.lastIdx}" value="${ui.day}" aria-label="Päivä">
              <span class="date-badge num" id="day-label"></span>
            </div>
            <div class="legend">
              ${hasSensors ? `<span class="legend__item"><span class="scale" id="scale"></span><span id="scale-label"></span></span>
              <span class="legend__item"><span class="dot" style="border-radius:50%;background:#1A62A9"></span>RHT-2 vuotoanturi</span>` : ""}
              ${hasUnits ? '<span class="legend__item"><span class="dot" style="transform:rotate(45deg);background:#3ADB76"></span>MCU-2 huippuimuri (punainen = seis)</span>' : ""}
              ${hasSensors ? '<span class="legend__item"><span class="dot" style="border-radius:50%;box-shadow:0 0 0 2px #E2202C;background:#fff"></span>havainto</span>' : ""}
            </div>
            <div id="sensor-detail"></div>
          </section>

          ${hasUnits ? `<section class="card" id="units-card">
            <div class="card__head"><h2>Kosteudenhallintayksiköt</h2><span class="caps">MCU-2 · ${monthShort(A.days[0].slice(0, 7))}–${monthShort(A.days[A.lastIdx].slice(0, 7))}</span></div>
            <div class="table-wrap">
              <table>
                <thead><tr><th>Laite</th><th>Tila</th><th class="r">Puhallin käynnissä</th><th class="r">Rakenteen RH ka.</th><th class="r">RH &gt; 90 %</th><th class="r">Homeindeksi</th></tr></thead>
                <tbody>${A.units.map((u) => {
                  const st = A.stopped.includes(u) ? fState(site, `fan-${u.serial}`).status : null;
                  const chip = st === "open" ? '<span class="chip chip--alert">Puhallin seis</span>' : st === "ordered" ? '<span class="chip chip--warn">Huolto tilattu</span>' : A.riskUnit === u && u.mold > 0.3 ? '<span class="chip chip--info">Seurannassa</span>' : '<span class="chip chip--ok">OK</span>';
                  return `<tr class="is-clickable ${u.name === ui.unit ? "is-selected" : ""}" data-unit="${esc(u.name)}">
                    <td><b>${esc(u.name)}</b><div class="muted" style="font-size:12px">${u.serial}</div></td><td>${chip}</td>
                    <td class="r num" style="${u.on < 60 ? `color:${LEVEL_DARK.alert};font-weight:700` : ""}">${n0(u.on)} %</td>
                    <td class="r num">${n1(u.rhInMean)} %</td><td class="r num">${n0(u.rhIn90)} %</td>
                    <td class="r num" style="${u.mold > 0.5 ? "font-weight:700" : ""}">${u.mold.toLocaleString("fi-FI", { maximumFractionDigits: 3 })}</td></tr>`;
                }).join("")}</tbody>
              </table>
            </div>
            <div style="margin-top:18px" id="unit-chart-wrap"></div>
          </section>` : ""}
        </div>

        <div class="stack">
          <section>
            <div class="card__head" style="margin-bottom:12px"><h2>Toimenpidelista</h2><span class="caps muted">${openCount(site)} avointa</span></div>
            ${fs.map(findingCard).join("")}
          </section>
          <section class="card">
            <div class="card__head"><h2>${site.newBuild ? "Rakennuskosteuden kuivuminen" : "Rakenteen kosteus"}</h2><span class="caps">${hasSensors ? "koko anturisto" : "imurien sisäanturit"} · kk-ka.</span></div>
            <div id="dry-chart"></div>
            <div class="legend">
              <span class="legend__item"><span class="legend__swatch" style="background:#1A62A9"></span>RH % (vasen)</span>
              <span class="legend__item"><span class="legend__swatch" style="background:#E3530F"></span>Lämpötila °C (vasen)</span>
              <span class="legend__item"><span class="legend__swatch" style="background:#8052B1"></span>AH g/m³ (oikea)</span>
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
      left: { min: 0, max: 100, ticks: 4, title: "% · °C" },
      right: { min: 0, max: 20, title: "g/m³" },
      series: [
        { name: "RH", values: M.map((m) => m.rh), color: "#1A62A9", type: "area", unit: "%", width: 2.5, dots: true },
        { name: "Lämpötila", values: M.map((m) => m.t), color: "#E3530F", unit: "°C" },
        { name: "AH", values: M.map((m) => m.ah), color: "#8052B1", axis: "right", unit: "g/m³", dash: "4 3" },
      ],
      tick: (_, i) => M.length <= 6 || i % 2 === 0,
      xFormat: monthShort,
      tipTitle: monthShort,
    });
  }

  function findingCard(f) {
    const st = f.state.status;
    const stLabel = st === "ordered" ? `<span class="chip chip--warn">Työtilaus ${f.state.order.no}</span>` : st === "resolved" ? '<span class="chip chip--ok">Korjattu</span>' : "";
    let actions = "";
    if (f.action && st === "open") {
      actions = `<button class="button button--sm" data-order="${f.id}">${f.action}</button>`;
    } else if (f.action && st === "ordered") {
      actions = `<span class="muted" style="font-size:13px">${esc(f.state.order.partner)} · lähetetty ${f.state.order.date}</span><button class="button button--hollow button--sm" data-resolve="${f.id}">Merkitse korjatuksi</button>`;
    }
    if (f.target) actions += `<button class="link-button" style="font-size:13px" data-show="${f.id}">Näytä datassa</button>`;
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
    $("#day-label").textContent = fiDate(A.days[ui.day]);
    $("#day").value = ui.day;
    if ($("#scale")) {
      $("#scale").style.background = scaleCss(sc);
      $("#scale-label").textContent = `${sc.label} ${sc.min}…${sc.max} ${sc.unit}`;
    }
    const vals = {};
    $$(".map__pin").forEach((p) => {
      const s = A.sensorBy[p.dataset.sensor];
      // Anturit lähettävät 2 × vrk; jos päivältä puuttuu mittaus, käytetään edellisten 2 vrk viimeisintä.
      const series = s[ui.metric];
      const v = [0, 1, 2].map((k) => series[ui.day - k]).find((x) => x !== null && x !== undefined) ?? null;
      vals[s.id] = v;
      p.style.background = lerpColor(sc.stops, v);
      p.title = `${s.id} · ${v === null ? "ei mittausta" : `${n1(v)} ${sc.unit}`}`;
    });
    const dayStr = A.days[ui.day];
    $$(".map__unit").forEach((m) => {
      const u = A.unitBy[m.dataset.unit];
      const d = u.days.find((x) => x.d === dayStr);
      const bad = d ? d.rpm === 0 && A.stopped.includes(u) && dayStr >= u.stopFrom && dayStr <= u.stopTo : false;
      m.style.background = !d ? "#CACACA" : bad ? "#E2202C" : d.rpm > 0 ? "#3ADB76" : "#FFAE00";
      m.title = `${u.name} · ${d ? `${n0(d.rpm)} rpm, rakenteen RH ${n1(d.rhIn)} %` : "ei dataa"}`;
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
    const chip = A.anomalies.includes(s) ? '<span class="chip chip--warn" style="margin-left:6px">Poikkeava</span>' : A.offline.includes(s) ? '<span class="chip chip--alert" style="margin-left:6px">Offline</span>' : "";
    $("#sensor-detail").innerHTML = `<div class="sensor-detail">
      <div class="card__head" style="margin-bottom:6px">
        <h3>Anturi ${s.id} ${chip}</h3>
        <button class="link-button" style="font-size:13px" id="close-sensor">Sulje</button>
      </div>
      <div class="muted" style="font-size:13px">Keskiarvo ${n1(s.rhMean)} % · max ${n1(s.rhMax)} % · min ${n1(s.tMin)} °C · ${n0(s.n)} mittausta · viimeisin ${fiDate(s.last.ts)}: ${n1(s.last.rh)} %, ${n1(s.last.t)} °C</div>
      <div id="sensor-chart" style="margin-top:10px"></div>
      <div class="legend">
        <span class="legend__item"><span class="legend__swatch" style="background:#EA4840"></span>Tämä anturi, RH %</span>
        <span class="legend__item"><span class="legend__swatch" style="background:#4EACE8"></span>6 lähimmän naapurin mediaani</span>
      </div>
    </div>`;
    $("#close-sensor").addEventListener("click", () => { ui.sensor = null; $("#sensor-detail").innerHTML = ""; $$(".map__pin").forEach((p) => p.classList.remove("is-selected")); });
    Charts.timeSeries($("#sensor-chart"), {
      labels: A.days,
      height: 170,
      left: { min: 0, max: 100, ticks: 4, title: "RH %" },
      bands: [{ from: 80, to: 100, color: "rgba(226,32,44,.06)" }],
      series: [
        { name: "Naapurit", values: s.nbMedian.map((v) => (v === null ? null : Math.round(v * 10) / 10)), color: "#4EACE8", unit: "%", width: 1.5 },
        { name: s.id, values: s.rh, color: "#EA4840", unit: "%", width: 1.8 },
      ],
      markers: [{ index: ui.day, label: fiDate(A.days[ui.day]), color: "#01273E" }],
      tick: monthTick,
      xFormat: (d) => monthShort(d.slice(0, 7)),
      tipTitle: fiDate,
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
      if (i >= 0) markers.push({ index: i, label: "Sense+ olisi hälyttänyt", color: "#E2202C" });
    }
    wrap.innerHTML = `
      <div style="display:flex;gap:20px;align-items:center;flex-wrap:wrap;margin-bottom:10px">
        <div class="mold"><div><b class="num">${u.mold.toLocaleString("fi-FI", { maximumFractionDigits: 5 })}</b><span>Homeindeksi</span></div></div>
        <div>
          <h3>${esc(u.name)} – olosuhteet ja puhallusteho</h3>
          <p class="muted" style="font-size:14px;margin-top:4px">${u.purpose} · ${u.serial} · puhallin käynnissä ${n0(u.on)} % ajasta${u.rpmMean ? `, keskimäärin ${n0(u.rpmMean)} rpm käydessään` : ""}</p>
        </div>
      </div>
      <div id="unit-chart"></div>
      <div class="legend">
        <span class="legend__item"><span class="legend__swatch" style="background:#EA4840"></span>Rakenteen RH %</span>
        <span class="legend__item"><span class="legend__swatch" style="background:#4EACE8"></span>Ulkoilman RH %</span>
        <span class="legend__item"><span class="legend__swatch legend__swatch--bar" style="background:#ADC3F4"></span>Puhallin rpm (oikea)</span>
      </div>`;
    Charts.timeSeries($("#unit-chart"), {
      labels: u.days.map((d) => d.d),
      height: 230,
      left: { min: 0, max: 100, ticks: 4, title: "RH %" },
      right: { min: 0, max: 3000, title: "rpm" },
      bands: [{ from: 90, to: 100, color: "rgba(226,32,44,.08)", label: "RH > 90 %" }],
      series: [
        { name: "Puhallin", values: u.days.map((d) => d.rpm), color: "#ADC3F4", type: "bar", axis: "right", unit: "rpm" },
        { name: "Ulkoilman RH", values: u.days.map((d) => d.rhOut), color: "#4EACE8", unit: "%", width: 1.2 },
        { name: "Rakenteen RH", values: u.days.map((d) => d.rhIn), color: "#EA4840", unit: "%", width: 2 },
      ],
      markers,
      tick: monthTick,
      xFormat: (d) => monthShort(d.slice(0, 7)),
      tipTitle: fiDate,
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
  const PARTNERS = ["Pohjanmaan Kattohuolto Oy · VILPE-kumppani", "Uudenmaan Kattotekniikka Oy · VILPE-kumppani", "Kohteen oma huoltoyhtiö"];

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
    const defaultPartner = site.city === "Vantaa" ? 1 : 0;
    openModal(`
      <div class="modal__head"><h2 id="modal-title">${f.action}</h2><button class="modal__close" data-close aria-label="Sulje">×</button></div>
      <form class="modal__body" id="order-form">
        <div class="form-row"><span class="label">Kohde</span><div class="value"><b>${esc(site.name)}</b></div></div>
        <div class="form-row"><span class="label">Havainto</span><div class="value">${esc(f.title)}</div></div>
        <div class="form-row"><label for="partner">Urakoitsija</label><select id="partner">${PARTNERS.map((p, i) => `<option ${i === defaultPartner ? "selected" : ""}>${p}</option>`).join("")}</select></div>
        <div class="form-row"><label for="urgency">Kiireellisyys</label><select id="urgency"><option ${f.level === "alert" ? "selected" : ""}>Kiireellinen – 3 arkipäivää</option><option ${f.level === "alert" ? "" : "selected"}>Normaali – 14 vrk</option></select></div>
        <div class="form-row"><label for="desc">Kuvaus</label><textarea id="desc" rows="5">${f.orderText}</textarea></div>
        <div class="form-row"><span class="label">Liitteet</span><div class="attach">
          <span>📎 Kosteuskartta ja ${isUnit ? "laitteen" : "anturin"} sijainti</span>
          <span>📎 Aikasarja ${isUnit ? "rpm + sisä/ulko RH" : "RH vs. naapurit"} (CSV)</span>
          <span>📎 Sense+-analyysin perustelu ja laitetiedot</span>
        </div></div>
        <div class="form-row"><span class="label">Tilaaja</span><div class="value">${DEMO_USER} · laskutus kohteelle</div></div>
      </form>
      <div class="modal__foot">
        <button class="button button--hollow" data-close>Peruuta</button>
        <button class="button" id="send-order">Lähetä työtilaus</button>
      </div>`);
    $("#send-order").addEventListener("click", () => {
      state.orders += 1;
      const order = { no: `TT-2026-${String(140 + state.orders).padStart(4, "0")}`, partner: $("#partner").value.split(" · ")[0], date: TODAY, urgency: $("#urgency").value };
      siteFindings(site)[id] = { status: "ordered", order };
      save();
      openModal(`
        <div class="modal__head"><h2 id="modal-title">Työtilaus lähetetty</h2><button class="modal__close" data-close aria-label="Sulje">×</button></div>
        <div class="modal__body success">
          <div class="success__icon">✓</div>
          <h2>${order.no}</h2>
          <p class="muted" style="margin-top:8px">${esc(order.partner)} sai tilauksen datan, kartan ja kuvauksen kanssa.<br>${order.urgency}. Kuittaus tulee yleensä 24 tunnin sisällä.</p>
          <p style="margin-top:14px;font-size:14px">Kun urakoitsija kirjaa korjauksen, Health Score päivittyy ja tapahtuma tallentuu Kosteuspassin historiaan.</p>
        </div>
        <div class="modal__foot"><button class="button" data-close>Valmis</button></div>`);
      route();
    });
  }

  function resolve(site, id) {
    const f = siteFindings(site)[id];
    siteFindings(site)[id] = { ...f, status: "resolved", resolved: TODAY };
    save();
    route();
    toast(`Korjaus kirjattu – Health Score nyt ${health(site).score}.`);
  }

  // ---------- Kosteuspassi ----------
  const PASS_USES = {
    kauppa: "Kiinteistökauppa – liite myynti-ilmoitukseen ja isännöitsijäntodistukseen",
    vakuutus: "Vakuutuksen uusiminen – riskitason todentaminen",
    luovutus: "Luovutus – rakennuskosteuden kuivumisen todentaminen",
  };
  let passUse = "kauppa";

  function hash(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(16).toUpperCase().padStart(8, "0");
  }

  function renderPass(site) {
    const A = analyze(site);
    const grade = passGrade(site);
    const fs = actionable(site);
    const code = hash(JSON.stringify([site.id, A.sensors.length, A.units.length, A.days[0], A.days[A.lastIdx], A.safeShare, A.maxMold, fs.map((f) => f.state.status)]));
    const passId = `${site.id.slice(0, 3).toUpperCase()}-${code.slice(0, 4)}-${code.slice(4)}`;
    const url = `https://sense.vilpe.com/passi/${passId}`;
    const items = [];
    if (site.newBuild) items.push(["ok", `Rakennuskosteus kuivunut: katon RH ${n1(A.firstMonth.rh)} % → ${n1(A.driest.rh)} % (${monthShort(A.driest.m)})`]);
    else items.push(["ok", `Rakenteen kosteus normaalilla tasolla: ${n1(A.firstMonth.rh)} % → ${n1(A.lastMonth.rh)} % (kk-ka.)`]);
    if (A.maxMold !== null) items.push(["ok", `Homeindeksi enintään ${n1(A.maxMold)} (hälytysraja 2,5)${A.riskUnit && A.riskUnit.mold > 0.3 ? ` – ${A.riskUnit.name.toLowerCase()} seurannassa` : ""}`]);
    items.push(["ok", `${pct(A.safeShare)} % ${A.safeLabel}`]);
    fs.forEach((f) => {
      if (f.state.status === "resolved") items.push(["ok", `${f.passDone} ${f.state.resolved}`]);
      else items.push(["warn", `${f.passOpen} – ${f.state.status === "ordered" ? "korjaus tilattu" : "avoin"}`]);
    });
    const devices = [A.sensors.length ? `${A.sensors.length} vuotoanturia` : "", A.units.length ? `${A.units.length} kosteudenhallintayksikköä` : ""].filter(Boolean);

    view.innerHTML = `
      <div class="doc-actions">
        <div class="button-row">${siteSelect(site, "passi")}</div>
        <div class="button-row">
          <select id="pass-use" aria-label="Käyttötarkoitus" class="select">
            ${Object.entries(PASS_USES).map(([k, v]) => `<option value="${k}" ${k === passUse ? "selected" : ""}>${v.split(" – ")[0]}</option>`).join("")}
          </select>
          <button class="button button--hollow" id="copy-link">Kopioi jakolinkki</button>
          <button class="button" id="print">Tulosta / PDF</button>
        </div>
      </div>
      <article class="doc">
        <header class="doc__head">
          <div>
            <div class="caps" style="color:#E3530F">VILPE Sense+ Kosteuspassi${A.fullYear ? "" : " · väliraportti"}</div>
            <h1>${esc(site.name)}</h1>
            <p>${PASS_USES[passUse]}</p>
          </div>
          <img src="assets/vilpe-logo.svg" alt="VILPE">
        </header>
        <div class="doc__body">
          ${A.fullYear ? "" : `<div class="notice">Seuranta alkoi ${fiDate(A.days[0])}. Täysi Kosteuspassi myönnetään 12 kuukauden seurannan jälkeen – tämä väliraportti kattaa ${A.days.length} vrk.</div>`}
          <section class="doc__section">
            <div class="grade">
              <div class="grade__big" style="background:${GRADE_COLORS[grade]}">${grade}</div>
              <div class="grade__scale" aria-label="Kosteusluokka">
                ${["A", "B", "C", "D", "E"].map((g, i) => `<div class="grade__step ${g === grade ? "is-active" : ""}" style="background:${GRADE_COLORS[g]};width:${55 + i * 11}%">${g}</div>`).join("")}
              </div>
              <div style="flex:1;min-width:220px">
                <div class="caps muted">Kosteusluokka${A.fullYear ? "" : " (alustava)"}</div>
                <h2 class="plain" style="font-size:24px;margin:4px 0 8px">${grade === "A" ? "Koko seurantajakso turvallisella alueella" : "Turvallinen, havaintoja korjattavana"}</h2>
                <p style="font-size:14px">${grade === "A" ? "Havaitut poikkeamat on korjattu ja korjausten jälkeinen tila todennettu datalla." : "Kun avoimet havainnot on korjattu, kohde nousee luokkaan A."}</p>
              </div>
            </div>
          </section>
          <section class="doc__section">
            <div class="facts">
              <div><b class="num">${fiDate(A.days[0])}–<br>${fiDate(A.days[A.lastIdx])}</b><span>seurantajakso</span></div>
              <div><b class="num">${A.sensors.length} + ${A.units.length}</b><span>${devices.join(" + ")}</span></div>
              <div><b class="num">${n0(A.measurements)}</b><span>mittausta</span></div>
              <div><b class="num">${A.fanUptime !== null ? `${n0(A.fanUptime)} %` : `${n0(A.sensorAvailability)} %`}</b><span>${A.fanUptime !== null ? "kosteudenhallinnan toiminta-aste" : "anturien käytettävyys"}</span></div>
            </div>
          </section>
          <section class="doc__section">
            <h2>Havainnot</h2>
            <ul class="checklist">${items.map(([k, t]) => `<li><span class="${k}">${k === "ok" ? "✔" : "⚠"}</span><span>${t}</span></li>`).join("")}</ul>
          </section>
          <section class="doc__section grid grid--2" style="gap:28px">
            <div>
              <h2>${site.newBuild ? "Kuivumiskäyrä" : "Kosteushistoria"}</h2>
              <div id="pass-chart"></div>
            </div>
            <div>
              <h2>Mittauskattavuus</h2>
              <div class="mini-map">
                <img src="${site.roof.src}" alt="Laitteiden sijainnit katolla">
                ${A.sensors.map((s) => `<i style="left:${s.pos[0] * 100}%;top:${s.pos[1] * 100}%"></i>`).join("")}
                ${A.units.filter((u) => u.pos).map((u) => `<i class="u" style="left:${u.pos[0] * 100}%;top:${u.pos[1] * 100}%"></i>`).join("")}
              </div>
              <p class="muted" style="font-size:12px;margin-top:6px">${A.sensors.length ? "● vuotoanturi (~10 / 200 m²) &nbsp; " : ""}${A.units.length ? "◆ kosteudenhallintayksikkö" : ""}</p>
            </div>
          </section>
          <section class="doc__section">
            <h2>Varmennus</h2>
            <div class="verify">
              <div class="verify__qr" id="qr"></div>
              <div style="font-size:14px">
                <div class="caps muted">Passin tunniste</div>
                <b style="font-size:18px" class="num">${passId}</b>
                <p style="margin-top:6px">Tarkista aitous: <span style="color:#004F9F">${url.replace("https://", "")}</span></p>
                <p class="muted" style="margin-top:4px;font-size:13px">Generoitu ${TODAY} suoraan VILPE Sense -pilven mittausdatasta${site.real ? "" : " (demossa simuloitu)"}. Tietoja ei voi muokata jälkikäteen.</p>
              </div>
            </div>
          </section>
        </div>
        <footer class="doc__foot">
          <span>Mittausraportti, ei takuu rakenteen kunnosta. Varmennus koskee datan aitoutta.</span>
          <span>Data omistajan luvalla · VILPE Oy, Mustasaari</span>
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
      try { await navigator.clipboard.writeText(url); toast("Jakolinkki kopioitu leikepöydälle."); } catch (e) { toast(url); }
    });
    const M = site.networkMonthly;
    Charts.timeSeries($("#pass-chart"), {
      labels: M.map((m) => m.m),
      height: 190,
      left: { min: 0, max: 100, ticks: 4, title: "RH %" },
      series: [{ name: "Rakenteen RH", values: M.map((m) => m.rh), color: "#1A62A9", type: "area", unit: "%", width: 2.5, dots: true }],
      tick: (_, i) => M.length <= 6 || i % 3 === 0,
      xFormat: monthShort,
      tipTitle: monthShort,
    });
  }

  // ---------- Vakuutusnäkymä ----------
  function riskClass(score) {
    if (score >= 85) return [1, "Erittäin matala"];
    if (score >= 75) return [2, "Matala"];
    if (score >= 55) return [3, "Kohtalainen"];
    if (score >= 40) return [4, "Kohonnut"];
    return [5, "Korkea"];
  }

  function timelineEvents(site) {
    const A = analyze(site);
    const ev = [...site.events];
    A.stopped.forEach((u) => {
      ev.push({ d: u.alertDay, cls: "alert", t: `${u.name}: puhallin pysähtyi – Sense+ laitevalvonta olisi hälyttänyt` });
      const peakMonth = u.months.filter((m) => m.m >= u.stopFrom.slice(0, 7) && m.m <= u.stopTo.slice(0, 7)).reduce((a, b) => (b.rhIn > a.rhIn ? b : a));
      ev.push({ d: `${peakMonth.m}-15`, cls: "warn", t: `${u.name}: rakenteen RH ${n0(peakMonth.rhIn)} % (kk-ka.) ilman tuuletusta` });
      if (!u.ongoing) ev.push({ d: u.stopTo, cls: "info", t: `${u.name}: puhallin käynnistyi uudelleen${u.on < 50 ? " (toiminta yhä vajaata)" : ""}` });
    });
    A.anomalies.forEach((s) => {
      const valid = (arr) => arr.filter((x) => x !== null);
      const rDay = A.days[s.rh.indexOf(Math.max(...valid(s.rh)))];
      if (s.tAnomalyDays) ev.push({ d: A.days[s.t.indexOf(Math.min(...valid(s.t)))], cls: "warn", t: `Anturi ${s.id}: lämpötila ${n1(s.tMin)} °C, selvä poikkeama naapureista` });
      ev.push({ d: rDay, cls: "warn", t: `Anturi ${s.id}: RH ${n1(s.rhMax)} %, tarkastuskohde` });
    });
    A.offline.forEach((s) => ev.push({ d: addDays(s.last.ts.slice(0, 10), 2), cls: "warn", t: `Anturi ${s.id}: yhteys katkennut (ei mittausta yli 36 h)` }));
    if (site.real) ev.push({ d: TODAY_ISO, cls: "info", t: "Sense+ Care otettu käyttöön, omistaja antoi suostumuksen datan jakoon" });
    actionable(site).forEach((f) => {
      if (f.state.order) ev.push({ d: TODAY_ISO, cls: "info", t: `Työtilaus ${f.state.order.no} → ${f.state.order.partner}: ${f.title}` });
      if (f.state.status === "resolved") ev.push({ d: TODAY_ISO, cls: "ok", t: `Korjaus kirjattu: ${f.title}` });
    });
    return ev.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
  }

  function renderInsurer(site) {
    const A = analyze(site);
    const h = health(site);
    const [rc, rcText] = riskClass(h.score);
    const fs = actionable(site);
    const reacted = fs.filter((f) => f.state.status !== "open").length;
    const discount = openCount(site) === 0 ? "10 %" : reacted ? "7,5 %" : "5 %";
    const consent = state.consent[site.id] !== false;
    view.innerHTML = `
      <div class="page-head">
        <div>
          <div class="caps muted">Partner API · vakuutusyhtiön näkymä</div>
          <h1>Riskinarvio: ${esc(site.name)}</h1>
          <p>Näin vakuutusyhtiö näkee kohteen – vain sen, mihin omistaja on antanut luvan.</p>
        </div>
        <div class="button-row">${siteSelect(site, "vakuutus")}</div>
      </div>
      <div class="consent ${consent ? "" : "consent--off"}">
        <div>
          <b>${consent ? "Omistajan suostumus voimassa" : "Suostumus peruttu"}</b>
          <div class="muted" style="font-size:14px">${consent ? "Jaetaan riskiluokka, hälytykset ja toimenpidehistoria · ei raakadataa eikä henkilötietoja" : "Vakuuttaja ei näe kohteen tietoja. Suostumuksen voi antaa uudelleen milloin tahansa."}</div>
        </div>
        <label class="switch" title="Omistajan suostumus datan jakoon"><input type="checkbox" id="consent" ${consent ? "checked" : ""}><span></span></label>
      </div>
      ${consent ? `
      <div class="grid grid--3">
        <section class="card">
          <div class="caps muted">Riskiluokka</div>
          <div style="display:flex;align-items:baseline;gap:10px;margin-top:6px"><b style="font-size:44px">${rc}</b><span class="muted">/ 5 · ${rcText}</span></div>
          <div class="risk">${[1, 2, 3, 4, 5].map((i) => `<i style="${i <= rc ? `background:${["#157539", "#3ADB76", "#FFAE00", "#E3530F", "#A00000"][rc - 1]}` : ""}"></i>`).join("")}</div>
          <p class="muted" style="font-size:13px">Johdettu Roof Health Scoresta (${h.score}/100), homeindeksistä, laitteiden toimivuudesta ja avoimista poikkeamista.</p>
        </section>
        <section class="card">
          <div class="caps muted">Alennusperuste</div>
          <ul class="checklist" style="margin-top:10px;font-size:14px">
            ${A.sensors.length ? `<li><span class="ok">✔</span><span>Jatkuva vuotovalvonta: ${A.sensors.length} anturia rakenteessa</span></li>` : ""}
            ${A.units.length ? `<li><span class="ok">✔</span><span>Aktiivinen kosteudenhallinta: ${A.units.length} × MCU-2 + huippuimuri</span></li>` : ""}
            <li><span class="ok">✔</span><span>Sense+ Care -laitevalvonta ja asiantuntijavarmistus</span></li>
            <li><span class="${reacted === fs.length ? "ok" : "warn"}">${reacted === fs.length ? "✔" : "⚠"}</span><span>Hälytyksiin reagoitu: ${reacted}/${fs.length}</span></li>
            <li><span class="${passGrade(site) === "A" ? "ok" : "warn"}">${passGrade(site) === "A" ? "✔" : "⚠"}</span><span>Kosteuspassi luokka ${passGrade(site)}${A.fullYear ? "" : " (alustava)"}</span></li>
          </ul>
        </section>
        <section class="card" style="background:var(--vilpe-navy);color:#fff;border-color:var(--vilpe-navy)">
          <div class="caps" style="color:rgba(255,255,255,.7)">Suositeltu vakuutusetu</div>
          <b style="font-size:44px;display:block;margin-top:6px">${discount}</b>
          <p style="font-size:14px;color:rgba(255,255,255,.8)">alennus kiinteistövakuutuksesta tai pienempi omavastuu vuotovahingoissa.</p>
          <p style="font-size:13px;color:rgba(255,255,255,.6);margin-top:10px">Pay-for-results: vakuuttaja maksaa VILPElle ~75 €/kohde/v + bonuksen, jos korvauskulut laskevat.</p>
        </section>
      </div>
      <div class="grid grid--2" style="margin-top:20px">
        <section class="card">
          <div class="card__head"><h2>Toimenpidehistoria</h2><span class="caps">vahingonestotoimet</span></div>
          <ol class="timeline">${timelineEvents(site).map((e) => `<li class="${e.cls}"><time>${fiDate(e.d)}</time>${esc(e.t)}</li>`).join("")}</ol>
        </section>
        <section class="card">
          <div class="card__head"><h2>Riskitekijät</h2><span class="caps">Health Score -erittely</span></div>
          <table>
            <thead><tr><th>Tekijä</th><th class="r">Paino</th><th class="r">Vähennys</th></tr></thead>
            <tbody>
              <tr><td>Homeriski (suurin homeindeksi ${A.maxMold === null ? "–" : n1(A.maxMold)} / 2,5)</td><td class="r">30 %</td><td class="r num">−${n1(h.parts.mold)}</td></tr>
              <tr><td>Aika yli RH-rajan</td><td class="r">25 %</td><td class="r num">−${n1(h.parts.rh)}</td></tr>
              <tr><td>Laiteviat (puhallin seis, anturi offline)</td><td class="r">25 %</td><td class="r num">−${n1(h.parts.dev)}</td></tr>
              <tr><td>Avoimet poikkeamat</td><td class="r">20 %</td><td class="r num">−${n1(h.parts.ano)}</td></tr>
              <tr><td><b>Roof Health Score</b></td><td></td><td class="r"><b class="num">${h.score}</b></td></tr>
            </tbody>
          </table>
          <p class="muted" style="font-size:13px;margin-top:14px">Vuotovahinkoja Suomessa ~35 000 / v, korvaukset ~171 M€. Keskimääräinen vuotovahinko ~5 000 €. Jos valvonta estää yhden vahingon kymmenessä vuodessa, odotettu säästö on ~500 €/kohde/v.</p>
        </section>
      </div>` : `<div class="card locked"><div style="font-size:40px">🔒</div><h2 style="margin:10px 0 6px">Ei pääsyä kohteen tietoihin</h2><p>Data on rakennuksen omistajan. Jako kolmansille osapuolille vain suostumuksella, ja suostumus on peruttavissa.</p></div>`}`;
    bindSiteSelect();
    $("#consent").addEventListener("change", (e) => {
      state.consent[site.id] = e.target.checked;
      save();
      renderInsurer(site);
      toast(e.target.checked ? "Suostumus annettu – vakuuttaja näkee riskitiedot." : "Suostumus peruttu – tiedot piilotettu vakuuttajalta.");
    });
  }

  // ---------- Hallitusraportti ----------
  function renderReport(site) {
    const A = analyze(site);
    const h = health(site);
    const fs = findings(site);
    const act = fs.filter((f) => f.action);
    const done = act.filter((f) => f.state.status !== "open");
    const open = openCount(site);
    const hw = A.sensors.length * 145 + A.units.length * 1100 + 1000;
    const monthly = hw / 120 + 30;
    const pts = [...fs.filter((f) => f.pts && f.state.status !== "resolved").map((f) => f.pts), "Uusi Kosteuspassi 12 kk kuluttua tai ennen myyntiä / vakuutuksen uusintaa."];
    const y0 = A.days[0].slice(0, 4);
    const y1 = A.days[A.lastIdx].slice(0, 4);
    const period = A.fullYear ? (y0 === y1 ? y0 : `${y0}–${y1}`) : `${monthShort(A.days[0].slice(0, 7))} – ${monthShort(A.days[A.lastIdx].slice(0, 7))}`;
    view.innerHTML = `
      <div class="doc-actions">
        <div class="button-row">${siteSelect(site, "raportti")}</div>
        <button class="button" id="print">Tulosta / PDF</button>
      </div>
      <article class="doc">
        <header class="doc__head">
          <div>
            <div class="caps" style="color:#E3530F">Sense+ Care · ${A.fullYear ? "vuosiraportti yhtiökokoukseen" : "kausiraportti hallitukselle"}</div>
            <h1>Katon kosteusturva ${period}</h1>
            <p>${esc(site.name)} · laatinut Sense+ automaattisesti ${TODAY}</p>
          </div>
          <img src="assets/vilpe-logo.svg" alt="VILPE">
        </header>
        <div class="doc__body">
          <section class="doc__section" style="display:flex;gap:22px;align-items:center;flex-wrap:wrap">
            ${gauge(h.score, 96, false, siteLevel(site, h.score))}
            <div style="flex:1;min-width:240px">
              <div class="caps muted">Tilannekuva</div>
              <h2 class="plain" style="font-size:22px;margin:4px 0 6px">${open === 0 ? "Katto on kunnossa." : `Katto on pääosin kunnossa – ${open === 1 ? "yksi asia vaatii" : `${open} asiaa vaativat`} toimenpiteitä.`}</h2>
              <p style="font-size:15px">Seurannassa ${devicesText(site)}. ${pct(A.safeShare)} % ${A.safeLabel}. ${open ? `Avoimia havaintoja ${open}.` : "Kaikki havainnot on korjattu."}</p>
            </div>
          </section>
          <section class="doc__section">
            <h2>Kauden tärkeimmät havainnot</h2>
            <ul class="checklist">
              ${act.map((f) => `<li><span class="${f.state.status === "resolved" ? "ok" : "warn"}">${f.state.status === "resolved" ? "✔" : "⚠"}</span><span>${f.plain}${f.state.status === "resolved" ? " Korjattu." : ""}</span></li>`).join("")}
              ${site.newBuild ? `<li><span class="ok">✔</span><span>Rakennuskosteus on kuivunut: katon kosteus laski ${n0(A.firstMonth.rh)} %:sta ${n0(A.driest.rh)} %:iin.</span></li>` : `<li><span class="ok">✔</span><span>Rakenteen kosteustaso on normaali (${n0(A.firstMonth.rh)} → ${n0(A.lastMonth.rh)} %, nousu seuraa syksyn ulkoilmaa).</span></li>`}
              ${A.maxMold !== null ? `<li><span class="ok">✔</span><span>Homeriski on matala (suurin homeindeksi ${n1(A.maxMold)}, hälytysraja 2,5).</span></li>` : ""}
            </ul>
          </section>
          <section class="doc__section">
            <h2>Tehdyt toimenpiteet</h2>
            ${done.length ? `<div class="table-wrap"><table><thead><tr><th>Havainto</th><th>Tilaus</th><th>Tila</th></tr></thead><tbody>${done.map((f) => `<tr><td>${esc(f.title)}</td><td>${f.state.order.no} · ${esc(f.state.order.partner)}</td><td>${f.state.status === "resolved" ? '<span class="chip chip--ok">Korjattu</span>' : '<span class="chip chip--warn">Tilattu</span>'}</td></tr>`).join("")}</tbody></table></div>` : `<p class="muted">${act.length ? "Ei vielä toimenpiteitä. Tilaa korjaukset kohdenäkymän toimenpidelistalta." : "Ei toimenpiteitä vaativia havaintoja."}</p>`}
          </section>
          <section class="doc__section grid grid--2" style="gap:28px">
            <div>
              <h2>Suositukset PTS:ään</h2>
              <ul class="checklist" style="font-size:14px">${pts.map((p, i) => `<li><span>${i + 1}.</span><span>${esc(p)}</span></li>`).join("")}</ul>
            </div>
            <div>
              <h2>Kustannus ja hyöty</h2>
              <div class="facts" style="grid-template-columns:1fr 1fr">
                <div><b>~${n0(monthly)} €/kk</b><span>Care Pro + laitteisto palveluna</span></div>
                <div><b>${site.apartments ? `${(monthly / site.apartments).toLocaleString("fi-FI", { maximumFractionDigits: 2 })} €` : "–"}</b><span>${site.apartments ? `per asunto kuukaudessa (${site.apartments} as.)` : "liikekiinteistö"}</span></div>
                <div><b>&gt; 5 000 €</b><span>yksi vältetty kattovuoto</span></div>
                <div><b>5–10 %</b><span>vakuutusalennus datan perusteella</span></div>
              </div>
            </div>
          </section>
        </div>
        <footer class="doc__foot"><span>Laskelmat ovat havainnollistavia arvioita.${site.real ? "" : " Kohteen data on simuloitu demoa varten."}</span><span>VILPE Sense+ Care Pro</span></footer>
      </article>`;
    bindSiteSelect();
    $("#print").addEventListener("click", () => window.print());
  }

  // ---------- Liiketoiminta ----------
  function renderModel() {
    view.innerHTML = `
      <div class="page-head">
        <div>
          <div class="caps muted">Ansaintamalli</div>
          <h1>Sama anturi. Uusi liiketoiminta.</h1>
          <p>Sense+ tuottaa arvoa koko rakennuksen elinkaaren ajan, ja samasta datasta maksaa useampi osapuoli.</p>
        </div>
      </div>
      <div class="lifecycle">
        <div><h3>Rakentaminen</h3><b>Urakoitsija asentaa</b><span>Sense + Sense+ tarjoukseen, urakoitsija saa provision</span></div>
        <div><h3>Luovutus</h3><b>Kosteuspassi #1</b><span>Kuivuminen todennettu datalla</span></div>
        <div><h3>Käyttö 10–15 v</h3><b>Sense+ Care</b><span>Valvoo, hälyttää, ohjaa korjaukset, raportoi</span></div>
        <div><h3>Myynti / remontti</h3><b>Kosteuspassi #2</b><span>Vuosien näyttö → uusi kierros</span></div>
      </div>
      <div class="grid grid--3">
        <section class="card plan">
          <h3>Care Basic</h3><div class="plan__price">~20 €<small style="font-size:14px;font-weight:400"> /kk/kohde</small></div><span class="muted" style="font-size:14px">Taloyhtiöt, pienet kohteet</span>
          <ul><li>Salkkunäkymä ja Health Score</li><li>Laitevalvonta ja hälytykset</li><li>Työtilaus kumppaniurakoitsijalle</li><li>Hallitusraportti vuosittain</li><li class="no">Poikkeamatunnistus ja sääkorrelaatio</li><li class="no">Asiantuntijavarmistus</li></ul>
        </section>
        <section class="card plan plan--featured">
          <h3>Care Pro</h3><div class="plan__price">60–90 €<small style="font-size:14px;font-weight:400"> /kk/kohde</small></div><span class="muted" style="font-size:14px">Tasakatot, viherkatot, liikekiinteistöt</span>
          <ul><li>Kaikki Basicin ominaisuudet</li><li>Poikkeamatunnistus (naapurivertailu)</li><li>Sääkorrelaatio (FMI avoin data)</li><li>VILPEn asiantuntijavarmistus</li><li>Raportti kvartaaleittain + PTS-syöte</li><li>1 Kosteuspassi / vuosi</li></ul>
        </section>
        <section class="card plan">
          <h3>Portfolio</h3><div class="plan__price">Sopimus</div><span class="muted" style="font-size:14px">Isännöintitoimistot, −20 % yli 20 kohdetta</span>
          <ul><li>Kaikki Pron ominaisuudet</li><li>Kosteuspassit sisältyvät</li><li>API ja isännöintijärjestelmäintegraatio</li><li>Vakuutusdatan jako suostumuksella</li><li>Oma yhteyshenkilö VILPEllä</li></ul>
        </section>
      </div>
      <div class="grid grid--2" style="margin-top:20px">
        <section class="card calc">
          <div class="card__head"><h2>Laskuri taloyhtiölle</h2><span class="caps">laitteisto palveluna</span></div>
          <label for="c-area">Kattoala: <span id="c-area-v"></span> m²</label>
          <input type="range" id="c-area" min="200" max="3000" step="50" value="800">
          <label for="c-apts">Asuntoja: <span id="c-apts-v"></span></label>
          <input type="range" id="c-apts" min="6" max="120" step="1" value="30">
          <label for="c-ins">Kiinteistövakuutus: <span id="c-ins-v"></span> €/v</label>
          <input type="range" id="c-ins" min="1000" max="20000" step="500" value="6000">
          <div class="calc__out" id="c-out"></div>
          <p class="muted" style="font-size:12px;margin-top:10px">~10 anturia / 200 m² à 145 €, tukiasema ja asennus ~1 000 €, kuoletus 10 v, Care Pro 30 €/kk HaaS-paketissa, vakuutusetu 5–10 %.</p>
        </section>
        <section class="card">
          <div class="card__head"><h2>VILPEn esimerkkiskenaario</h2><span class="caps">havainnollistava</span></div>
          <div class="table-wrap"><table>
            <thead><tr><th>Vuosi</th><th class="r">Care-kohteet</th><th class="r">Care</th><th class="r">Passit</th><th class="r">Vakuutus</th><th class="r">Yhteensä</th></tr></thead>
            <tbody>
              <tr><td>1 · pilotti</td><td class="r num">150</td><td class="r num">0,10 M€</td><td class="r num">0,02 M€</td><td class="r num">–</td><td class="r num"><b>0,12 M€</b></td></tr>
              <tr><td>2</td><td class="r num">600</td><td class="r num">0,50 M€</td><td class="r num">0,10 M€</td><td class="r num">0,03 M€</td><td class="r num"><b>0,63 M€</b></td></tr>
              <tr><td>3</td><td class="r num">1 500</td><td class="r num">1,35 M€</td><td class="r num">0,24 M€</td><td class="r num">0,11 M€</td><td class="r num"><b>1,70 M€</b></td></tr>
            </tbody>
          </table></div>
          <p class="muted" style="font-size:13px;margin-top:12px">Oletukset: Care ~900 €/kohde/v, passi ~400 €, vakuutus ~75 €/kohde/v. Lisäksi kasvava laite- ja lisämyynti (huippuimurit, läpiviennit).</p>
          <p class="quote" style="margin-top:18px">Kertamyynnistä toistuvaan tuloon ja suoraan asiakassuhteeseen.</p>
        </section>
      </div>`;
    const calc = () => {
      const area = +$("#c-area").value;
      const apts = +$("#c-apts").value;
      const ins = +$("#c-ins").value;
      $("#c-area-v").textContent = n0(area);
      $("#c-apts-v").textContent = apts;
      $("#c-ins-v").textContent = n0(ins);
      const sensors = Math.ceil((area / 200) * 10);
      const hw = sensors * 145 + 1000;
      const monthly = hw / 120 + 30;
      const saving = ins * 0.075;
      $("#c-out").innerHTML = `
        <div><b class="num">${sensors}</b><span>anturia · laitteisto ~${n0(hw)} €</span></div>
        <div><b class="num">${n0(monthly)} €/kk</b><span>vakuutusetu −${n0(saving)} €/v</span></div>
        <div><b class="num">${(monthly / apts).toLocaleString("fi-FI", { maximumFractionDigits: 2 })} €</b><span>per asunto kuukaudessa</span></div>`;
    };
    $$(".calc input").forEach((i) => i.addEventListener("input", calc));
    calc();
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
    $("#user").innerHTML = `<div class="user__avatar">VD</div><div>${DEMO_USER}<small>Demotunnus</small></div><button class="link-button user__logout" id="logout">Kirjaudu ulos</button>`;
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
    toast("Demo nollattu.");
  });
  route();
})();
