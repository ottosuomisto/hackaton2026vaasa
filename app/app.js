/* VILPE Sense+ – klikattava prototyyppi.
   Analytiikka (laitevalvonta, naapurivertailu, Health Score) lasketaan selaimessa
   Vantaan oikeasta datasta (data.js), jonka scripts/build_data.py tuottaa. */
(function () {
  "use strict";

  const D = window.VANTAA;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const view = $("#view");

  // ---------- Apurit ----------
  const nf1 = new Intl.NumberFormat("fi-FI", { maximumFractionDigits: 1 });
  const n1 = (v) => (v === null || v === undefined ? "–" : nf1.format(v));
  const n0 = (v) => Math.round(v).toLocaleString("fi-FI");
  const parseDay = (s) => new Date(`${s}T12:00:00`);
  const fiDate = (s) => { const d = typeof s === "string" ? parseDay(s.length === 7 ? `${s}-01` : s) : s; return `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`; };
  const MONTHS = ["tammi", "helmi", "maalis", "huhti", "touko", "kesä", "heinä", "elo", "syys", "loka", "marras", "joulu"];
  const monthShort = (s) => { const [y, m] = s.split("-"); return `${MONTHS[+m - 1]} ${y.slice(2)}`; };
  const monthTick = (s, i) => i === 0 || s.endsWith("-01");
  const median = (a) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const sd = (a) => { const m = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length); };
  const avg = (a) => { const v = a.filter((x) => x !== null && x !== undefined); return v.length ? v.reduce((x, y) => x + y, 0) / v.length : null; };
  const today = new Date();
  const TODAY = fiDate(today);

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

  // ---------- Analytiikkakerros ----------
  const units = D.units;
  const unitBy = Object.fromEntries(units.map((u) => [u.name, u]));
  const sensorBy = Object.fromEntries(D.sensors.map((s) => [s.id, s]));

  // Naapurit: 6 lähintä anturia kattokartalla
  D.sensors.forEach((s) => {
    s.neighbors = D.sensors
      .filter((o) => o !== s)
      .map((o) => [o, Math.hypot((o.pos[0] - s.pos[0]) * D.roof.w, (o.pos[1] - s.pos[1]) * D.roof.h)])
      .sort((a, b) => a[1] - b[1])
      .slice(0, 6)
      .map(([o]) => o);
    s.nbMedian = D.days.map((_, i) => { const v = s.neighbors.map((o) => o.rh[i]).filter((x) => x !== null); return v.length ? median(v) : null; });
    let rhDays = 0;
    let tDays = 0;
    D.days.forEach((_, i) => {
      const rhN = s.neighbors.map((o) => o.rh[i]).filter((x) => x !== null);
      const tN = s.neighbors.map((o) => o.t[i]).filter((x) => x !== null);
      if (s.rh[i] !== null && rhN.length >= 3 && s.rh[i] - median(rhN) > Math.max(3 * sd(rhN), 10)) rhDays++;
      if (s.t[i] !== null && tN.length >= 3 && median(tN) - s.t[i] > 4) tDays++;
    });
    s.anomalyDays = rhDays + tDays;
    s.rhAnomalyDays = rhDays;
    s.tAnomalyDays = tDays;
  });
  const anomalies = D.sensors.filter((s) => s.anomalyDays >= 25).sort((a, b) => b.anomalyDays - a.anomalyDays);
  const otherSensors = D.sensors.filter((s) => !anomalies.includes(s));
  const othersTMin = Math.min(...otherSensors.map((s) => s.tMin));
  const othersRhMax = Math.max(...otherSensors.map((s) => s.rhMax));

  // Laitevalvonta: puhallin seis ≥ 2 vrk
  const stoppedUnits = units.filter((u) => u.stopDays >= 30);
  stoppedUnits.forEach((u) => {
    u.ventLost = u.days.filter((d) => d.rpm === 0 && d.ahIn !== null && d.ahOut !== null && d.ahIn > d.ahOut).length;
    const winter = u.months.filter((m) => ["2025-11", "2025-12", "2026-01"].includes(m.m));
    u.winterRh = avg(winter.map((m) => m.rhIn));
    u.winterPeak = Math.max(...u.months.filter((m) => m.on === 0).map((m) => m.rhIn));
    const alertDay = new Date(parseDay(u.stopFrom).getTime() + 2 * 864e5);
    u.alertDay = alertDay.toISOString().slice(0, 10);
  });

  const maxMold = Math.max(...units.map((u) => u.mold));
  const crawl = unitBy["Hallin alapohja"];
  const firstMonth = D.networkMonthly[0];
  const driest = D.networkMonthly.reduce((a, b) => (b.rh < a.rh ? b : a));
  const lastDayIdx = D.days.length - 1;
  const rhNow = avg(D.sensors.map((s) => s.last.rh));
  const safeShare = (() => {
    let ok = 0;
    let all = 0;
    D.sensors.forEach((s) => s.rh.forEach((v) => { if (v !== null) { all++; if (v < 80) ok++; } }));
    return (100 * ok) / all;
  })();
  const pct = (v) => (v > 99.9 && v < 100 ? "99,9" : n1(v));
  const fanUptime = avg(units.map((u) => u.on));

  // ---------- Tila (demon kulku) ----------
  const STORE = "vilpe-senseplus-demo-v1";
  const fresh = () => ({ findings: {}, consent: true, orders: 0 });
  let state = fresh();
  try { state = Object.assign(fresh(), JSON.parse(localStorage.getItem(STORE)) || {}); } catch (e) { /* esim. yksityinen ikkuna */ }
  const save = () => { try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) { /* ohitetaan */ } };
  const fState = (id) => state.findings[id] || { status: "open" };

  // ---------- Havainnot ----------
  function findings() {
    const list = [];
    stoppedUnits.forEach((u) => {
      list.push({
        id: `fan-${u.serial}`,
        kind: "device",
        level: "alert",
        title: `${u.name}: puhallin ei ole käynyt ${n0(u.stopDays)} vrk`,
        text: `Puhallin oli pysähdyksissä ${fiDate(u.stopFrom)}–${fiDate(u.stopTo)}, ja käy edelleen vain ${n0(u.on)} % ajasta (muut imurit ~91 %). Rakenteen kosteus oli talvella keskimäärin ${n1(u.winterRh)} %.`,
        evidence: `Sääntö: rpm = 0 yli 48 h ja sisä-AH > ulko-AH → tuuletus olisi kannattanut ${u.ventLost} päivänä. Sense+ olisi hälyttänyt ${fiDate(u.alertDay)}.`,
        action: "Tilaa huolto",
        target: { type: "unit", name: u.name },
        orderText: `Huippuimurin ${u.name} (${u.serial}) puhallin ei käy. Laite on ollut pysähdyksissä ${fiDate(u.stopFrom)}–${fiDate(u.stopTo)} ja käy nyt vain ${n0(u.on)} % ajasta. Pyydämme tarkistamaan puhaltimen, kytkennät ja MCU-2-ohjausyksikön asetukset.`,
      });
    });
    anomalies.forEach((s) => {
      const tMinDay = D.days[s.t.indexOf(Math.min(...s.t.filter((x) => x !== null)))];
      list.push({
        id: `sensor-${s.id}`,
        kind: "sensor",
        level: "warn",
        title: `Anturi ${s.id} poikkeaa naapureistaan`,
        text: `Lämpötila laski ${n1(s.tMin)} °C:seen, kun muun anturiston minimi oli ${n1(othersTMin)} °C. RH nousi ${n1(s.rhMax)} %:iin (muiden maksimi ${n1(othersRhMax)} %). Todennäköinen kylmäsilta, läpivienti tai paikallinen kosteuslähde.`,
        evidence: `Sääntö: RH > naapurien mediaani + 3σ tai T < mediaani − 4 °C. Poikkeama ${s.anomalyDays} päivänä (RH ${s.rhAnomalyDays}, T ${s.tAnomalyDays}). Kylmin päivä ${fiDate(tMinDay)}.`,
        action: "Tilaa tarkastus",
        target: { type: "sensor", id: s.id, day: D.days[s.rh.indexOf(Math.max(...s.rh.filter((x) => x !== null)))] },
        orderText: `Vuotoanturi ${s.id} poikkeaa jatkuvasti naapuriantureistaan (min ${n1(s.tMin)} °C, max ${n1(s.rhMax)} % RH). Pyydämme tarkastamaan katon alueen anturin ympäriltä: läpiviennit, reuna-alueet ja mahdolliset kylmäsillat. Sijainti kosteuskartalla liitteenä.`,
      });
    });
    list.push({
      id: "crawl",
      kind: "info",
      level: "info",
      title: "Hallin alapohja on kohteen riskialttein osa",
      text: `Homeindeksi ${n1(crawl.mold)} (hälytysraja 2,5). Rakenteen RH yli 90 % ${n0(crawl.rhIn90)} % ajasta, vaikka puhallin käy ${n0(crawl.on)} % ajasta.`,
      evidence: "Seurannassa. Suositus PTS:ään: alapohjan tuuletuksen tehostus, jos homeindeksi ylittää 1,0.",
    });
    list.push({
      id: "drying",
      kind: "info",
      level: "ok",
      title: "Rakennuskosteus on kuivunut",
      text: `Katon anturiston RH laski ${n1(firstMonth.rh)} %:sta ${n1(driest.rh)} %:iin (${monthShort(driest.m)}). Kesän nousu seuraa ulkoilmaa eikä yllä kriittisiin lukemiin.`,
      evidence: `${pct(safeShare)} % anturipäivistä turvallisella alueella (vrk-keskiarvo RH < 80 %).`,
    });
    return list.map((f) => ({ ...f, state: fState(f.id) }));
  }
  const actionable = () => findings().filter((f) => f.action);
  const openCount = () => actionable().filter((f) => f.state.status !== "resolved").length;

  // Health Score: 100 − homeriski (30) − aika yli RH-rajan (25) − laiteviat (25) − avoimet poikkeamat (20)
  function health() {
    const weight = (f) => (f.state.status === "open" ? 1 : f.state.status === "ordered" ? 0.5 : 0);
    const fs = actionable();
    const mold = Math.min(30, (maxMold / 2.5) * 30);
    const rh = (avg(units.map((u) => u.rhIn90)) / 100) * 25;
    const dev = Math.min(25, fs.filter((f) => f.kind === "device").reduce((a, f) => a + 15 * weight(f), 0));
    const ano = Math.min(20, fs.filter((f) => f.kind === "sensor").reduce((a, f) => a + 10 * weight(f), 0));
    return { score: Math.round(100 - mold - rh - dev - ano), parts: { mold, rh, dev, ano } };
  }
  const level = (score) => (score >= 75 ? "ok" : score >= 50 ? "warn" : "alert");
  const LEVEL_COLOR = { ok: "#3ADB76", warn: "#FFAE00", alert: "#E2202C", info: "#1A62A9" };
  const LEVEL_TEXT = { ok: "Kunnossa", warn: "Vaatii huomiota", alert: "Kriittinen" };
  const passGrade = () => (openCount() === 0 ? "A" : "B");
  const GRADE_COLORS = { A: "#157539", B: "#3ADB76", C: "#FFAE00", D: "#E3530F", E: "#A00000" };

  function gauge(score, size = 72, dark = true) {
    const r = 30;
    const c = 2 * Math.PI * r;
    const col = LEVEL_COLOR[level(score)];
    return `<svg class="gauge" viewBox="0 0 72 72" width="${size}" height="${size}" aria-label="Health Score ${score}">
      <circle cx="36" cy="36" r="${r}" fill="none" stroke="${dark ? "rgba(255,255,255,.15)" : "rgba(1,39,62,.08)"}" stroke-width="7"/>
      <circle cx="36" cy="36" r="${r}" fill="none" stroke="${col}" stroke-width="7" stroke-dasharray="${(c * score) / 100} ${c}" transform="rotate(-90 36 36)"/>
      <text x="36" y="42" text-anchor="middle" font-size="20" font-weight="700" fill="${dark ? "#fff" : "#01273E"}" font-family="Inter, Helvetica, Arial">${score}</text>
    </svg>`;
  }

  // ---------- Salkku ----------
  const PORTFOLIO = [
    { name: "As Oy Palosaaren Helmi", city: "Vaasa", type: "Tasakatto · 1981", sensors: "24 anturia", score: 71, note: "Anturi P6713… offline 3 vrk", open: 1 },
    { name: "Kiinteistö Oy Mustasaaren Logistiikka", city: "Mustasaari", type: "Tasakatto 6 200 m²", sensors: "312 anturia · 8 imuria", score: 79, note: "Kaikki kunnossa", open: 0 },
    { name: "As Oy Hietalahdenkatu 5", city: "Vaasa", type: "Aluskatteeton peltikatto", sensors: "4 kosteudenhallintayksikköä", score: 86, note: "Kaikki kunnossa", open: 0 },
    { name: "As Oy Gerbyn Kallio", city: "Vaasa", type: "Ullakollinen yläpohja", sensors: "2 kosteudenhallintayksikköä", score: 88, note: "Kaikki kunnossa", open: 0 },
    { name: "As Oy Vaasan Rantakatu 12", city: "Vaasa", type: "Tasakatto · uusittu 2019", sensors: "38 anturia", score: 91, note: "Kaikki kunnossa", open: 0 },
    { name: "As Oy Sundominrinne", city: "Vaasa", type: "Viherkatto · 2024", sensors: "46 anturia · 3 imuria", score: 94, note: "Kaikki kunnossa", open: 0 },
    { name: "As Oy Kotiranta", city: "Mustasaari", type: "Ryömintätilainen alapohja", sensors: "1 kosteudenhallintayksikkö", score: 83, note: "Kaikki kunnossa", open: 0 },
  ];

  function renderPortfolio() {
    const h = health();
    const vantaa = { real: true, name: D.site.name, city: "Vantaa", type: "Liikekiinteistö · tasa- ja viherkatto", sensors: `${D.sensors.length} anturia · ${units.length} imuria`, score: h.score, open: openCount() };
    vantaa.note = vantaa.open ? `${vantaa.open} avointa havaintoa` : "Korjaukset kirjattu";
    const sites = [vantaa, ...PORTFOLIO].sort((a, b) => a.score - b.score);
    const attention = sites.filter((s) => s.score < 75).length;
    const openTotal = sites.reduce((a, s) => a + s.open, 0);
    const devicesOk = units.length - stoppedUnits.filter((u) => fState(`fan-${u.serial}`).status !== "resolved").length;

    view.innerHTML = `
      <div class="page-head">
        <div>
          <div class="caps muted">${today.toLocaleDateString("fi-FI", { weekday: "long" })} ${TODAY}</div>
          <h1>Hyvää huomenta, Sanna</h1>
          <p>Kosteusturvan tilannekuva kohteistasi – järjestetty kiireellisyyden mukaan.</p>
        </div>
      </div>
      <div class="summary">
        <div><b class="num">${sites.length}</b><span>kohdetta Sense+ Caressa</span></div>
        <div><b class="num" style="color:${attention ? "#805700" : "#157539"}">${attention}</b><span>vaatii huomiota</span></div>
        <div><b class="num" style="color:${openTotal ? "#A3141C" : "#157539"}">${openTotal}</b><span>avointa havaintoa</span></div>
        <div><b class="num">${devicesOk}/${units.length}</b><span>Vantaan kosteudenhallintayksiköistä toiminnassa</span></div>
      </div>
      <div class="sites">
        ${sites.map((s) => {
          const lv = level(s.score);
          return `<${s.real ? "a href=\"#/kohde\"" : "div"} class="site ${s.real ? "" : "site--demo"}" style="text-decoration:none">
            <div class="site__bar" style="background:${LEVEL_COLOR[lv]}"></div>
            <div class="site__body">
              <div class="site__info">
                <h3>${s.name}</h3>
                <div class="site__meta">${s.city} · ${s.type}</div>
                <div class="site__meta">${s.sensors}</div>
                <div class="site__status"><span class="dot dot--${lv}"></span><span>${s.note}</span></div>
              </div>
              <div class="site__score"><b class="num" style="color:${lv === "ok" ? "#157539" : lv === "warn" ? "#805700" : "#A3141C"}">${s.score}</b><span>Health Score</span></div>
            </div>
            <div class="site__foot">
              <span>${s.real ? "Oikea data · 51 + 7 laitetta" : "Esimerkkikohde"}</span>
              ${s.real ? "<strong>Avaa kohde →</strong>" : ""}
            </div>
          </${s.real ? "a" : "div"}>`;
        }).join("")}
      </div>`;
  }

  // ---------- Kohde ----------
  const ui = { day: lastDayIdx, metric: "rh", sensor: null, unit: stoppedUnits[0] ? stoppedUnits[0].name : units[0].name, playing: null };

  function renderSite() {
    const h = health();
    const lv = level(h.score);
    const unitsOk = units.length - stoppedUnits.filter((u) => fState(`fan-${u.serial}`).status !== "resolved").length;
    const fs = findings();
    view.innerHTML = `
      <div class="page-head">
        <div>
          <div class="crumbs"><a href="#/salkku">Salkku</a> / Kohde</div>
          <h1>${D.site.name}</h1>
          <p>${D.site.structure} · seuranta ${fiDate(D.days[0])}–${fiDate(D.days[lastDayIdx])}</p>
        </div>
        <div class="button-row">
          <a class="button button--hollow" href="#/raportti">Hallitusraportti</a>
          <a class="button" href="#/passi">Luo Kosteuspassi</a>
        </div>
      </div>

      <div class="kpis">
        <div class="kpi kpi--score">${gauge(h.score)}<div><div class="caps">Roof Health Score</div><span>${LEVEL_TEXT[lv]}</span></div></div>
        <div class="kpi"><b class="num">${D.sensors.length}/${D.sensors.length}</b><span>vuotoanturia yhteydessä</span></div>
        <div class="kpi"><b class="num" style="color:${unitsOk < units.length ? "#A3141C" : "inherit"}">${unitsOk}/${units.length}</b><span>kosteudenhallintayksikköä toiminnassa</span></div>
        <div class="kpi"><b class="num">${n1(rhNow)} %</b><span>katon rakenteen RH nyt (ka.)</span></div>
        <div class="kpi"><b class="num">${n1(maxMold)}</b><span>suurin homeindeksi (raja 2,5)</span></div>
      </div>

      <div class="grid grid--main">
        <div class="stack">
          <section class="card" id="map-card">
            <div class="card__head">
              <h2>Kosteuskartta</h2>
              <div class="segmented" role="group" aria-label="Suure">
                <button data-metric="rh" class="${ui.metric === "rh" ? "is-active" : ""}">RH %</button>
                <button data-metric="t" class="${ui.metric === "t" ? "is-active" : ""}">°C</button>
              </div>
            </div>
            <div class="map" id="map">
              <img src="assets/roof.jpg" alt="Kattokartta, VILPE Express Store Vantaa" width="${D.roof.w}" height="${D.roof.h}">
              <canvas id="heat"></canvas>
              ${D.sensors.map((s) => `<button class="map__pin ${anomalies.includes(s) && fState(`sensor-${s.id}`).status !== "resolved" ? "map__pin--flag" : ""}" data-sensor="${s.id}" style="left:${s.pos[0] * 100}%;top:${s.pos[1] * 100}%" aria-label="Anturi ${s.id}"></button>`).join("")}
              ${units.filter((u) => u.pos).map((u) => `<button class="map__unit" data-unit="${u.name}" style="left:${u.pos[0] * 100}%;top:${u.pos[1] * 100}%" aria-label="Huippuimuri ${u.name}"></button>`).join("")}
            </div>
            <div class="map-controls">
              <button class="round-btn" id="play" aria-label="Toista vuosi">▶</button>
              <input type="range" id="day" min="0" max="${lastDayIdx}" value="${ui.day}" aria-label="Päivä">
              <span class="date-badge num" id="day-label"></span>
            </div>
            <div class="legend">
              <span class="legend__item"><span class="scale" id="scale"></span><span id="scale-label"></span></span>
              <span class="legend__item"><span class="dot" style="border-radius:50%;background:#1A62A9"></span>RHT-2 vuotoanturi</span>
              <span class="legend__item"><span class="dot" style="transform:rotate(45deg);background:#3ADB76"></span>MCU-2 huippuimuri</span>
              <span class="legend__item"><span class="dot" style="border-radius:50%;box-shadow:0 0 0 2px #E2202C;background:#fff"></span>poikkeava anturi</span>
            </div>
            <div id="sensor-detail"></div>
          </section>

          <section class="card" id="units-card">
            <div class="card__head"><h2>Kosteudenhallintayksiköt</h2><span class="caps">MCU-2 · 5/2025–9/2026</span></div>
            <div class="table-wrap">
              <table>
                <thead><tr><th>Laite</th><th>Tila</th><th class="r">Puhallin käynnissä</th><th class="r">Rakenteen RH ka.</th><th class="r">RH &gt; 90 %</th><th class="r">Homeindeksi</th></tr></thead>
                <tbody>${units.map((u) => {
                  const stopped = stoppedUnits.includes(u) && fState(`fan-${u.serial}`).status !== "resolved";
                  const ordered = stoppedUnits.includes(u) && fState(`fan-${u.serial}`).status === "ordered";
                  const chip = stopped ? (ordered ? '<span class="chip chip--warn">Huolto tilattu</span>' : '<span class="chip chip--alert">Puhallin seis</span>') : u === crawl ? '<span class="chip chip--info">Seurannassa</span>' : '<span class="chip chip--ok">OK</span>';
                  return `<tr class="is-clickable ${u.name === ui.unit ? "is-selected" : ""}" data-unit="${u.name}">
                    <td><b>${u.name}</b><div class="muted" style="font-size:12px">${u.serial}</div></td><td>${chip}</td>
                    <td class="r num" style="${u.on < 50 ? "color:#A3141C;font-weight:700" : ""}">${n0(u.on)} %</td>
                    <td class="r num">${n1(u.rhInMean)} %</td><td class="r num">${n0(u.rhIn90)} %</td>
                    <td class="r num" style="${u.mold > 0.5 ? "font-weight:700" : ""}">${u.mold.toLocaleString("fi-FI", { maximumFractionDigits: 3 })}</td></tr>`;
                }).join("")}</tbody>
              </table>
            </div>
            <div style="margin-top:18px" id="unit-chart-wrap"></div>
          </section>
        </div>

        <div class="stack">
          <section>
            <div class="card__head" style="margin-bottom:12px"><h2>Toimenpidelista</h2><span class="caps muted">${openCount()} avointa</span></div>
            ${fs.map(findingCard).join("")}
          </section>
          <section class="card">
            <div class="card__head"><h2>Rakennuskosteuden kuivuminen</h2><span class="caps">koko anturisto</span></div>
            <div id="dry-chart"></div>
            <div class="legend">
              <span class="legend__item"><span class="legend__swatch" style="background:#1A62A9"></span>RH % (vasen)</span>
              <span class="legend__item"><span class="legend__swatch" style="background:#E3530F"></span>Lämpötila °C (vasen)</span>
              <span class="legend__item"><span class="legend__swatch" style="background:#8052B1"></span>AH g/m³ (oikea)</span>
            </div>
          </section>
        </div>
      </div>`;

    bindSite();
    drawUnitChart();
    Charts.timeSeries($("#dry-chart"), {
      labels: D.networkMonthly.map((m) => m.m),
      height: 220,
      left: { min: 0, max: 80, ticks: 4, title: "% · °C" },
      right: { min: 0, max: 16, title: "g/m³" },
      series: [
        { name: "RH", values: D.networkMonthly.map((m) => m.rh), color: "#1A62A9", type: "area", unit: "%", width: 2.5, dots: true },
        { name: "Lämpötila", values: D.networkMonthly.map((m) => m.t), color: "#E3530F", unit: "°C" },
        { name: "AH", values: D.networkMonthly.map((m) => m.ah), color: "#8052B1", axis: "right", unit: "g/m³", dash: "4 3" },
      ],
      tick: (_, i) => i % 2 === 0,
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
      actions = `<span class="muted" style="font-size:13px">${f.state.order.partner} · lähetetty ${f.state.order.date}</span><button class="button button--hollow button--sm" data-resolve="${f.id}">Merkitse korjatuksi</button>`;
    }
    if (f.target) actions += `<button class="link-button" style="font-size:13px" data-show="${f.id}">Näytä datassa</button>`;
    return `<article class="finding finding--${st === "resolved" ? "ok" : f.level} ${st === "resolved" ? "finding--resolved" : ""}">
      <div class="finding__bar"></div>
      <div class="finding__body">
        <div class="finding__top"><h3>${f.title}</h3>${stLabel}</div>
        <p>${f.text}</p>
        <div class="finding__evidence">${f.evidence}</div>
        ${actions ? `<div class="finding__actions">${actions}</div>` : ""}
      </div>
    </article>`;
  }

  function bindSite() {
    const slider = $("#day");
    slider.addEventListener("input", () => { ui.day = +slider.value; updateMap(); });
    $("#play").addEventListener("click", togglePlay);
    $$("[data-metric]").forEach((b) => b.addEventListener("click", () => {
      ui.metric = b.dataset.metric;
      $$("[data-metric]").forEach((x) => x.classList.toggle("is-active", x === b));
      updateMap();
    }));
    $$(".map__pin").forEach((p) => p.addEventListener("click", () => selectSensor(p.dataset.sensor)));
    $$("[data-unit]").forEach((r) => r.addEventListener("click", () => selectUnit(r.dataset.unit, r.classList.contains("map__unit"))));
    $$("[data-order]").forEach((b) => b.addEventListener("click", () => openOrder(b.dataset.order)));
    $$("[data-resolve]").forEach((b) => b.addEventListener("click", () => resolve(b.dataset.resolve)));
    $$("[data-show]").forEach((b) => b.addEventListener("click", () => showTarget(b.dataset.show)));
    updateMap();
    if (ui.sensor) selectSensor(ui.sensor, false);
  }

  function updateMap() {
    const sc = SCALES[ui.metric];
    $("#day-label").textContent = fiDate(D.days[ui.day]);
    $("#day").value = ui.day;
    $("#scale").style.background = scaleCss(sc);
    $("#scale-label").textContent = `${sc.label} ${sc.min}…${sc.max} ${sc.unit}`;
    const vals = {};
    $$(".map__pin").forEach((p) => {
      const s = sensorBy[p.dataset.sensor];
      // Anturit lähettävät 2 × vrk; jos päivältä puuttuu mittaus, käytetään edellisten 2 vrk viimeisintä.
      const series = s[ui.metric];
      const v = [0, 1, 2].map((k) => series[ui.day - k]).find((x) => x !== null && x !== undefined) ?? null;
      vals[s.id] = v;
      p.style.background = lerpColor(sc.stops, v);
      p.title = `${s.id} · ${v === null ? "ei mittausta" : `${n1(v)} ${sc.unit}`}`;
    });
    const dayStr = D.days[ui.day];
    $$(".map__unit").forEach((m) => {
      const u = unitBy[m.dataset.unit];
      const d = u.days.find((x) => x.d === dayStr);
      const bad = d ? d.rpm === 0 && stoppedUnits.includes(u) : false;
      m.style.background = !d ? "#CACACA" : bad ? "#E2202C" : d.rpm > 0 ? "#3ADB76" : "#FFAE00";
      m.title = `${u.name} · ${d ? `${n0(d.rpm)} rpm, rakenteen RH ${n1(d.rhIn)} %` : "ei dataa"}`;
    });
    drawHeat(vals, sc);
  }

  function drawHeat(vals, sc) {
    const canvas = $("#heat");
    const box = $("#map").getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = box.width * dpr;
    canvas.height = box.height * dpr;
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    const r = box.width * 0.065;
    D.sensors.forEach((s) => {
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

  function togglePlay() {
    const btn = $("#play");
    if (ui.playing) {
      clearInterval(ui.playing);
      ui.playing = null;
      btn.textContent = "▶";
      return;
    }
    if (ui.day >= lastDayIdx) ui.day = 0;
    btn.textContent = "❚❚";
    ui.playing = setInterval(() => {
      if (!$("#day")) { clearInterval(ui.playing); ui.playing = null; return; }
      ui.day = Math.min(lastDayIdx, ui.day + 2);
      updateMap();
      if (ui.day >= lastDayIdx) togglePlay();
    }, 45);
  }

  function selectSensor(id, scroll = false) {
    ui.sensor = id;
    const s = sensorBy[id];
    $$(".map__pin").forEach((p) => p.classList.toggle("is-selected", p.dataset.sensor === id));
    const isAnomaly = anomalies.includes(s);
    $("#sensor-detail").innerHTML = `<div class="sensor-detail">
      <div class="card__head" style="margin-bottom:6px">
        <h3>Anturi ${s.id} ${isAnomaly ? '<span class="chip chip--warn" style="margin-left:6px">Poikkeava</span>' : ""}</h3>
        <button class="link-button" style="font-size:13px" id="close-sensor">Sulje</button>
      </div>
      <div class="muted" style="font-size:13px">Vuosikeskiarvo ${n1(s.rhMean)} % · max ${n1(s.rhMax)} % · min ${n1(s.tMin)} °C · ${n0(s.n)} mittausta · viimeisin ${fiDate(s.last.ts.slice(0, 10))}: ${n1(s.last.rh)} %, ${n1(s.last.t)} °C</div>
      <div id="sensor-chart" style="margin-top:10px"></div>
      <div class="legend">
        <span class="legend__item"><span class="legend__swatch" style="background:#EA4840"></span>Tämä anturi, RH %</span>
        <span class="legend__item"><span class="legend__swatch" style="background:#4EACE8"></span>6 lähimmän naapurin mediaani</span>
      </div>
    </div>`;
    $("#close-sensor").addEventListener("click", () => { ui.sensor = null; $("#sensor-detail").innerHTML = ""; $$(".map__pin").forEach((p) => p.classList.remove("is-selected")); });
    Charts.timeSeries($("#sensor-chart"), {
      labels: D.days,
      height: 170,
      left: { min: 0, max: 100, ticks: 4, title: "RH %" },
      bands: [{ from: 80, to: 100, color: "rgba(226,32,44,.06)" }],
      series: [
        { name: "Naapurit", values: s.nbMedian.map((v) => (v === null ? null : Math.round(v * 10) / 10)), color: "#4EACE8", unit: "%", width: 1.5 },
        { name: s.id, values: s.rh, color: "#EA4840", unit: "%", width: 1.8 },
      ],
      markers: [{ index: ui.day, label: fiDate(D.days[ui.day]), color: "#01273E" }],
      tick: monthTick,
      xFormat: (d) => monthShort(d.slice(0, 7)),
      tipTitle: fiDate,
    });
    if (scroll) $("#map-card").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function selectUnit(name, scroll) {
    ui.unit = name;
    $$("#units-card tbody tr").forEach((r) => r.classList.toggle("is-selected", r.dataset.unit === name));
    $$(".map__unit").forEach((m) => m.classList.toggle("is-selected", m.dataset.unit === name));
    drawUnitChart();
    if (scroll) $("#units-card").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function drawUnitChart() {
    const u = unitBy[ui.unit];
    const wrap = $("#unit-chart-wrap");
    const markers = [];
    if (stoppedUnits.includes(u)) {
      const i = u.days.findIndex((d) => d.d >= u.alertDay);
      if (i >= 0) markers.push({ index: i, label: "Sense+ olisi hälyttänyt", color: "#E2202C" });
    }
    wrap.innerHTML = `
      <div style="display:flex;gap:20px;align-items:center;flex-wrap:wrap;margin-bottom:10px">
        <div class="mold"><div><b class="num">${u.mold.toLocaleString("fi-FI", { maximumFractionDigits: 5 })}</b><span>Homeindeksi</span></div></div>
        <div>
          <h3>${u.name} – olosuhteet ja puhallusteho</h3>
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

  function showTarget(id) {
    const f = findings().find((x) => x.id === id);
    if (!f) return;
    if (f.target.type === "unit") {
      selectUnit(f.target.name, true);
    } else {
      ui.day = D.days.indexOf(f.target.day);
      updateMap();
      selectSensor(f.target.id, true);
    }
  }

  // ---------- Työtilaus ----------
  const PARTNERS = ["Pohjanmaan Kattohuolto Oy · VILPE-kumppani", "Uudenmaan Kattotekniikka Oy · VILPE-kumppani", "Kohteen oma huoltoyhtiö"];

  function openModal(html) {
    const modal = $("#modal");
    $(".modal__panel", modal).innerHTML = html;
    modal.hidden = false;
    $$("[data-close]", modal).forEach((b) => b.addEventListener("click", closeModal));
    const first = $("select, textarea, button", $(".modal__panel", modal));
    if (first) first.focus();
  }
  function closeModal() { $("#modal").hidden = true; }
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#modal").hidden) closeModal(); });

  function openOrder(id) {
    const f = findings().find((x) => x.id === id);
    const isDevice = f.kind === "device";
    openModal(`
      <div class="modal__head"><h2 id="modal-title">${f.action}</h2><button class="modal__close" data-close aria-label="Sulje">×</button></div>
      <form class="modal__body" id="order-form">
        <div class="form-row"><span class="label">Kohde</span><div class="value"><b>${D.site.name}</b></div></div>
        <div class="form-row"><span class="label">Havainto</span><div class="value">${f.title}</div></div>
        <div class="form-row"><label for="partner">Urakoitsija</label><select id="partner">${PARTNERS.map((p, i) => `<option ${i === (isDevice ? 1 : 0) ? "selected" : ""}>${p}</option>`).join("")}</select></div>
        <div class="form-row"><label for="urgency">Kiireellisyys</label><select id="urgency"><option ${isDevice ? "selected" : ""}>Kiireellinen – 3 arkipäivää</option><option ${isDevice ? "" : "selected"}>Normaali – 14 vrk</option></select></div>
        <div class="form-row"><label for="desc">Kuvaus</label><textarea id="desc" rows="5">${f.orderText}</textarea></div>
        <div class="form-row"><span class="label">Liitteet</span><div class="attach">
          <span>📎 Kosteuskartta ja ${isDevice ? "laitteen sijainti" : "anturin sijainti"}</span>
          <span>📎 Aikasarja ${isDevice ? "rpm + sisä/ulko RH" : "RH vs. naapurit"} (CSV, 12 kk)</span>
          <span>📎 Sense+-analyysin perustelu ja laitetiedot</span>
        </div></div>
        <div class="form-row"><span class="label">Tilaaja</span><div class="value">Sanna, isännöitsijä · laskutus taloyhtiölle</div></div>
      </form>
      <div class="modal__foot">
        <button class="button button--hollow" data-close>Peruuta</button>
        <button class="button" id="send-order">Lähetä työtilaus</button>
      </div>`);
    $("#send-order").addEventListener("click", () => {
      state.orders += 1;
      const order = { no: `TT-2026-${String(140 + state.orders).padStart(4, "0")}`, partner: $("#partner").value.split(" · ")[0], date: TODAY, urgency: $("#urgency").value };
      state.findings[id] = { status: "ordered", order };
      save();
      openModal(`
        <div class="modal__head"><h2 id="modal-title">Työtilaus lähetetty</h2><button class="modal__close" data-close aria-label="Sulje">×</button></div>
        <div class="modal__body success">
          <div class="success__icon">✓</div>
          <h2>${order.no}</h2>
          <p class="muted" style="margin-top:8px">${order.partner} sai tilauksen datan, kartan ja kuvauksen kanssa.<br>${order.urgency}. Kuittaus tulee yleensä 24 tunnin sisällä.</p>
          <p style="margin-top:14px;font-size:14px">Kun urakoitsija kirjaa korjauksen, Health Score päivittyy ja tapahtuma tallentuu Kosteuspassin historiaan.</p>
        </div>
        <div class="modal__foot"><button class="button" data-close>Valmis</button></div>`);
      route();
    });
  }

  function resolve(id) {
    const f = state.findings[id];
    state.findings[id] = { ...f, status: "resolved", resolved: TODAY };
    save();
    route();
    toast(`Korjaus kirjattu – Health Score nyt ${health().score}.`);
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

  function renderPass() {
    const grade = passGrade();
    const fs = actionable();
    const code = hash(JSON.stringify([D.sensors.length, D.days[0], D.days[lastDayIdx], safeShare, maxMold, fs.map((f) => f.state.status)]));
    const passId = `VNT-53-${code.slice(0, 4)}-${code.slice(4)}`;
    const url = `https://sense.vilpe.com/passi/${passId}`;
    const fan = fs.find((f) => f.kind === "device");
    const sen = fs.find((f) => f.kind === "sensor");
    const fanUnit = stoppedUnits[0];
    const anomaly = anomalies[0];
    const items = [
      ["ok", `Rakennuskosteus kuivunut: katon RH ${n1(firstMonth.rh)} % → ${n1(driest.rh)} % (${monthShort(driest.m)})`],
      ["ok", `Homeindeksi enintään ${n1(maxMold)} (hälytysraja 2,5) – ${crawl.name.toLowerCase()} seurannassa`],
      ["ok", `${pct(safeShare)} % anturipäivistä turvallisella alueella (vrk-keskiarvo RH < 80 %)`],
    ];
    if (anomaly) items.push(sen.state.status === "resolved" ? ["ok", `Poikkeama-alue (anturi ${anomaly.id}) tarkastettu ${sen.state.resolved}`] : ["warn", `1 poikkeama-alue tunnistettu (anturi ${anomaly.id}) – ${sen.state.status === "ordered" ? "tarkastus tilattu" : "seurannassa"}`]);
    if (fanUnit) items.push(fan.state.status === "resolved" ? ["ok", `${fanUnit.name}: puhallin seis ${n0(fanUnit.stopDays)} vrk (${monthShort(fanUnit.stopFrom.slice(0, 7))}–${monthShort(fanUnit.stopTo.slice(0, 7))}) – huollettu ${fan.state.resolved}`] : ["warn", `1 kosteudenhallintayksikkö ei toiminut ${n0(fanUnit.stopDays / 30.4)} kk (${monthShort(fanUnit.stopFrom.slice(0, 7))}–${monthShort(fanUnit.stopTo.slice(0, 7))}) – ${fan.state.status === "ordered" ? "huolto tilattu" : "toiminta yhä vajaata"}`]);

    view.innerHTML = `
      <div class="doc-actions">
        <div class="crumbs" style="margin:0"><a href="#/kohde">${D.site.name}</a> / Kosteuspassi</div>
        <div class="button-row">
          <select id="pass-use" aria-label="Käyttötarkoitus" style="font:14px var(--font);padding:9px 10px;border:1px solid #CACACA;color:var(--vilpe-navy)">
            ${Object.entries(PASS_USES).map(([k, v]) => `<option value="${k}" ${k === passUse ? "selected" : ""}>${v.split(" – ")[0]}</option>`).join("")}
          </select>
          <button class="button button--hollow" id="copy-link">Kopioi jakolinkki</button>
          <button class="button" id="print">Tulosta / PDF</button>
        </div>
      </div>
      <article class="doc">
        <header class="doc__head">
          <div>
            <div class="caps" style="color:#E3530F">VILPE Sense+ Kosteuspassi</div>
            <h1>${D.site.name}</h1>
            <p>${PASS_USES[passUse]}</p>
          </div>
          <img src="assets/vilpe-logo.png" alt="VILPE">
        </header>
        <div class="doc__body">
          <section class="doc__section">
            <div class="grade">
              <div class="grade__big" style="background:${GRADE_COLORS[grade]}">${grade}</div>
              <div class="grade__scale" aria-label="Kosteusluokka">
                ${["A", "B", "C", "D", "E"].map((g, i) => `<div class="grade__step ${g === grade ? "is-active" : ""}" style="background:${GRADE_COLORS[g]};width:${55 + i * 11}%">${g}</div>`).join("")}
              </div>
              <div style="flex:1;min-width:220px">
                <div class="caps muted">Kosteusluokka</div>
                <h2 class="plain" style="font-size:24px;margin:4px 0 8px">${grade === "A" ? "Koko seurantajakso turvallisella alueella" : "Turvallinen, havaintoja korjattavana"}</h2>
                <p style="font-size:14px">${grade === "A" ? "Havaitut poikkeamat on korjattu ja korjausten jälkeinen tila todennettu datalla." : "Kun avoimet havainnot on korjattu, kohde nousee luokkaan A."}</p>
              </div>
            </div>
          </section>
          <section class="doc__section">
            <div class="facts">
              <div><b class="num">${fiDate(D.days[0])}–<br>${fiDate(D.days[lastDayIdx])}</b><span>seurantajakso</span></div>
              <div><b class="num">${D.sensors.length} + ${units.length}</b><span>vuotoanturia + kosteudenhallintayksikköä</span></div>
              <div><b class="num">${n0(D.sensors.reduce((a, s) => a + s.n, 0))}</b><span>mittausta anturistosta</span></div>
              <div><b class="num">${n0(fanUptime)} %</b><span>kosteudenhallinnan toiminta-aste</span></div>
            </div>
          </section>
          <section class="doc__section">
            <h2>Havainnot</h2>
            <ul class="checklist">${items.map(([k, t]) => `<li><span class="${k}">${k === "ok" ? "✔" : "⚠"}</span><span>${t}</span></li>`).join("")}</ul>
          </section>
          <section class="doc__section grid grid--2" style="gap:28px">
            <div>
              <h2>Kuivumiskäyrä</h2>
              <div id="pass-chart"></div>
            </div>
            <div>
              <h2>Mittauskattavuus</h2>
              <div class="mini-map">
                <img src="assets/roof.jpg" alt="Anturien sijainnit katolla">
                ${D.sensors.map((s) => `<i style="left:${s.pos[0] * 100}%;top:${s.pos[1] * 100}%"></i>`).join("")}
                ${units.filter((u) => u.pos).map((u) => `<i class="u" style="left:${u.pos[0] * 100}%;top:${u.pos[1] * 100}%"></i>`).join("")}
              </div>
              <p class="muted" style="font-size:12px;margin-top:6px">● vuotoanturi (~10 / 200 m²) &nbsp; ◆ kosteudenhallintayksikkö</p>
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
                <p class="muted" style="margin-top:4px;font-size:13px">Generoitu ${TODAY} suoraan VILPE Sense -pilven mittausdatasta. Tietoja ei voi muokata jälkikäteen.</p>
              </div>
            </div>
          </section>
        </div>
        <footer class="doc__foot">
          <span>Mittausraportti, ei takuu rakenteen kunnosta. Varmennus koskee datan aitoutta.</span>
          <span>Data omistajan luvalla · VILPE Oy, Mustasaari</span>
        </footer>
      </article>`;

    const qr = qrcode(0, "M");
    qr.addData(url);
    qr.make();
    $("#qr").innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
    $("#pass-use").addEventListener("change", (e) => { passUse = e.target.value; renderPass(); });
    $("#print").addEventListener("click", () => window.print());
    $("#copy-link").addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(url); toast("Jakolinkki kopioitu leikepöydälle."); } catch (e) { toast(url); }
    });
    Charts.timeSeries($("#pass-chart"), {
      labels: D.networkMonthly.map((m) => m.m),
      height: 190,
      left: { min: 0, max: 80, ticks: 4, title: "RH %" },
      series: [{ name: "Katon RH", values: D.networkMonthly.map((m) => m.rh), color: "#1A62A9", type: "area", unit: "%", width: 2.5, dots: true }],
      tick: (_, i) => i % 3 === 0,
      xFormat: monthShort,
      tipTitle: monthShort,
    });
  }

  // ---------- Vakuuttaja ----------
  function riskClass(score) {
    if (score >= 85) return [1, "Erittäin matala"];
    if (score >= 75) return [2, "Matala"];
    if (score >= 55) return [3, "Kohtalainen"];
    if (score >= 40) return [4, "Kohonnut"];
    return [5, "Korkea"];
  }

  function timelineEvents() {
    const fs = actionable();
    const ev = [
      { d: "2025-05-13", cls: "info", t: "Katto ja ryömintätilainen alapohja valmistuneet, Sense-seuranta alkaa (7 imuria, 51 anturia)" },
    ];
    stoppedUnits.forEach((u) => {
      ev.push({ d: u.alertDay, cls: "alert", t: `${u.name}: puhallin pysähtyi – Sense+ laitevalvonta olisi hälyttänyt` });
      ev.push({ d: "2025-11-01", cls: "warn", t: `${u.name}: rakenteen RH ${n0(u.winterPeak)} % (kk-ka.), ulkoilma ~100 % – ei tuuletusta koko talvena` });
      ev.push({ d: u.stopTo, cls: "info", t: `${u.name}: puhallin käynnistyi uudelleen (toiminta yhä vajaata)` });
    });
    anomalies.forEach((s) => {
      const tDay = D.days[s.t.indexOf(Math.min(...s.t.filter((x) => x !== null)))];
      const rDay = D.days[s.rh.indexOf(Math.max(...s.rh.filter((x) => x !== null)))];
      ev.push({ d: tDay, cls: "warn", t: `Anturi ${s.id}: lämpötila ${n1(s.tMin)} °C, selvä poikkeama naapureista` });
      ev.push({ d: rDay, cls: "warn", t: `Anturi ${s.id}: RH ${n1(s.rhMax)} %, tarkastuskohde` });
    });
    ev.push({ d: today.toISOString().slice(0, 10), cls: "info", t: "Sense+ Care otettu käyttöön, omistaja antoi suostumuksen datan jakoon" });
    fs.forEach((f) => {
      if (f.state.order) ev.push({ d: today.toISOString().slice(0, 10), cls: "info", t: `Työtilaus ${f.state.order.no} → ${f.state.order.partner}: ${f.title}` });
      if (f.state.status === "resolved") ev.push({ d: today.toISOString().slice(0, 10), cls: "ok", t: `Korjaus kirjattu: ${f.title}` });
    });
    return ev.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
  }

  function renderInsurer() {
    const h = health();
    const [rc, rcText] = riskClass(h.score);
    const fs = actionable();
    const reacted = fs.filter((f) => f.state.status !== "open").length;
    const discount = openCount() === 0 ? "10 %" : reacted ? "7,5 %" : "5 %";
    view.innerHTML = `
      <div class="page-head">
        <div>
          <div class="caps muted">Partner API · vakuutusyhtiön näkymä</div>
          <h1>Riskinarvio: ${D.site.name}</h1>
          <p>Riskienhallintapäällikkö näkee vain sen, mihin omistaja on antanut luvan.</p>
        </div>
      </div>
      <div class="consent ${state.consent ? "" : "consent--off"}">
        <div>
          <b>${state.consent ? "Omistajan suostumus voimassa" : "Suostumus peruttu"}</b>
          <div class="muted" style="font-size:14px">${state.consent ? `Annettu ${TODAY} · jaetaan riskiluokka, hälytykset ja toimenpidehistoria · ei raakadataa eikä henkilötietoja` : "Vakuuttaja ei näe kohteen tietoja. Omistaja voi antaa suostumuksen uudelleen milloin tahansa."}</div>
        </div>
        <label class="switch" title="Simuloi omistajan suostumusta"><input type="checkbox" id="consent" ${state.consent ? "checked" : ""}><span></span></label>
      </div>
      ${state.consent ? `
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
            <li><span class="ok">✔</span><span>Jatkuva vuotovalvonta: ${D.sensors.length} anturia rakenteessa</span></li>
            <li><span class="ok">✔</span><span>Sense+ Care -laitevalvonta ja asiantuntijavarmistus</span></li>
            <li><span class="${reacted === fs.length ? "ok" : "warn"}">${reacted === fs.length ? "✔" : "⚠"}</span><span>Hälytyksiin reagoitu: ${reacted}/${fs.length}</span></li>
            <li><span class="${passGrade() === "A" ? "ok" : "warn"}">${passGrade() === "A" ? "✔" : "⚠"}</span><span>Kosteuspassi luokka ${passGrade()}</span></li>
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
          <ol class="timeline">${timelineEvents().map((e) => `<li class="${e.cls}"><time>${fiDate(e.d)}</time>${e.t}</li>`).join("")}</ol>
        </section>
        <section class="card">
          <div class="card__head"><h2>Riskitekijät</h2><span class="caps">Health Score -erittely</span></div>
          <table>
            <thead><tr><th>Tekijä</th><th class="r">Paino</th><th class="r">Vähennys</th></tr></thead>
            <tbody>
              <tr><td>Homeriski (suurin homeindeksi ${n1(maxMold)} / 2,5)</td><td class="r">30 %</td><td class="r num">−${n1(h.parts.mold)}</td></tr>
              <tr><td>Aika yli RH-rajan (rakenne &gt; 90 %)</td><td class="r">25 %</td><td class="r num">−${n1(h.parts.rh)}</td></tr>
              <tr><td>Laiteviat (${stoppedUnits.length} kosteudenhallintayksikkö)</td><td class="r">25 %</td><td class="r num">−${n1(h.parts.dev)}</td></tr>
              <tr><td>Avoimet poikkeamat</td><td class="r">20 %</td><td class="r num">−${n1(h.parts.ano)}</td></tr>
              <tr><td><b>Roof Health Score</b></td><td></td><td class="r"><b class="num">${h.score}</b></td></tr>
            </tbody>
          </table>
          <p class="muted" style="font-size:13px;margin-top:14px">Vuotovahinkoja Suomessa ~35 000 / v, korvaukset ~171 M€. Keskimääräinen vuotovahinko ~5 000 €. Jos valvonta estää yhden vahingon kymmenessä vuodessa, odotettu säästö on ~500 €/kohde/v.</p>
        </section>
      </div>` : `<div class="card locked"><div style="font-size:40px">🔒</div><h2 style="margin:10px 0 6px">Ei pääsyä kohteen tietoihin</h2><p>Data on rakennuksen omistajan. Jako kolmansille osapuolille vain suostumuksella, ja suostumus on peruttavissa.</p></div>`}`;
    $("#consent").addEventListener("change", (e) => {
      state.consent = e.target.checked;
      save();
      renderInsurer();
      toast(state.consent ? "Suostumus annettu – vakuuttaja näkee riskitiedot." : "Suostumus peruttu – tiedot piilotettu vakuuttajalta.");
    });
  }

  // ---------- Hallitusraportti ----------
  function renderReport() {
    const h = health();
    const fs = actionable();
    const done = fs.filter((f) => f.state.status !== "open");
    view.innerHTML = `
      <div class="doc-actions">
        <div class="crumbs" style="margin:0"><a href="#/kohde">${D.site.name}</a> / Hallitusraportti</div>
        <button class="button" id="print">Tulosta / PDF</button>
      </div>
      <article class="doc">
        <header class="doc__head">
          <div>
            <div class="caps" style="color:#E3530F">Sense+ Care · vuosiraportti yhtiökokoukseen</div>
            <h1>Katon kosteusturva 2025–2026</h1>
            <p>${D.site.name} · laatinut Sense+ automaattisesti ${TODAY}</p>
          </div>
          <img src="assets/vilpe-logo.png" alt="VILPE">
        </header>
        <div class="doc__body">
          <section class="doc__section" style="display:flex;gap:22px;align-items:center;flex-wrap:wrap">
            ${gauge(h.score, 96, false)}
            <div style="flex:1;min-width:240px">
              <div class="caps muted">Tilannekuva</div>
              <h2 class="plain" style="font-size:22px;margin:4px 0 6px">${openCount() === 0 ? "Katto on kunnossa." : `Katto on pääosin kunnossa – ${openCount() === 1 ? "yksi asia vaatii" : `${openCount()} asiaa vaativat`} toimenpiteitä.`}</h2>
              <p style="font-size:15px">Rakenne on kuivunut rakentamisen jälkeen ja anturien vuorokausikeskiarvot ovat pysyneet turvallisella alueella (RH < 80 %) ${pct(safeShare)} % ajasta. ${openCount() ? `Avoimia havaintoja ${openCount()}.` : "Kaikki havainnot on korjattu."}</p>
            </div>
          </section>
          <section class="doc__section">
            <h2>Vuoden tärkeimmät havainnot</h2>
            <ul class="checklist">
              ${stoppedUnits.map((u) => `<li><span class="warn">⚠</span><span>Viherkaton huippuimuri (${u.name}) ei käynyt ${n0(u.stopDays)} vuorokauteen. Rakenteen kosteus nousi syksyllä ${n0(u.winterPeak)} %:iin, eikä tuuletus käynyt kertaakaan. Kukaan ei huomannut, koska dataa ei seurattu.</span></li>`).join("")}
              ${anomalies.map((s) => `<li><span class="warn">⚠</span><span>Yksi katon anturi (${s.id}) näyttää muita kylmempää ja kosteampaa. Alue kannattaa tarkastaa.</span></li>`).join("")}
              <li><span class="ok">✔</span><span>Rakennuskosteus on kuivunut: katon kosteus laski ${n0(firstMonth.rh)} %:sta ${n0(driest.rh)} %:iin.</span></li>
              <li><span class="ok">✔</span><span>Homeriski on matala kaikkialla (suurin homeindeksi ${n1(maxMold)}, hälytysraja 2,5).</span></li>
            </ul>
          </section>
          <section class="doc__section">
            <h2>Tehdyt toimenpiteet</h2>
            ${done.length ? `<table><thead><tr><th>Havainto</th><th>Tilaus</th><th>Tila</th></tr></thead><tbody>${done.map((f) => `<tr><td>${f.title}</td><td>${f.state.order.no} · ${f.state.order.partner}</td><td>${f.state.status === "resolved" ? '<span class="chip chip--ok">Korjattu</span>' : '<span class="chip chip--warn">Tilattu</span>'}</td></tr>`).join("")}</tbody></table>` : '<p class="muted">Ei vielä toimenpiteitä. Tilaa korjaukset kohdenäkymän toimenpidelistalta.</p>'}
          </section>
          <section class="doc__section grid grid--2" style="gap:28px">
            <div>
              <h2>Suositukset PTS:ään</h2>
              <ul class="checklist" style="font-size:14px">
                <li><span>1.</span><span>Viherkatto 2: puhaltimen huolto 2026, vaihto jos vika toistuu (~500–700 €).</span></li>
                <li><span>2.</span><span>Katon tarkastus poikkeavan anturin alueelta seuraavan huollon yhteydessä.</span></li>
                <li><span>3.</span><span>Hallin alapohja: tuuletuksen tehostus, jos homeindeksi ylittää 1,0.</span></li>
                <li><span>4.</span><span>Uusi Kosteuspassi 9/2027 tai ennen myyntiä / vakuutuksen uusintaa.</span></li>
              </ul>
            </div>
            <div>
              <h2>Kustannus ja hyöty</h2>
              <div class="facts" style="grid-template-columns:1fr 1fr">
                <div><b>~90 €/kk</b><span>Care Pro + laitteisto palveluna</span></div>
                <div><b>&lt; 3 €</b><span>per asunto kuukaudessa (30 as.)</span></div>
                <div><b>&gt; 5 000 €</b><span>yksi vältetty kattovuoto</span></div>
                <div><b>5–10 %</b><span>vakuutusalennus datan perusteella</span></div>
              </div>
            </div>
          </section>
        </div>
        <footer class="doc__foot"><span>Laskelmat ovat havainnollistavia arvioita.</span><span>VILPE Sense+ Care Pro</span></footer>
      </article>`;
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
    salkku: [renderPortfolio, "SA", "Sanna", "Isännöitsijä · 18 taloyhtiötä"],
    kohde: [renderSite, "SA", "Sanna", "Isännöitsijä"],
    passi: [renderPass, "SA", "Sanna", "Isännöitsijä · jaettava passi"],
    vakuuttaja: [renderInsurer, "RH", "Riskienhallinta", "Vakuutusyhtiö (esimerkki)"],
    raportti: [renderReport, "MH", "Matti", "Hallituksen puheenjohtaja"],
    malli: [renderModel, "V", "VILPE", "Liiketoimintamalli"],
  };

  function route() {
    const key = (location.hash.replace(/^#\/?/, "").split("?")[0]) || "salkku";
    const r = ROUTES[key] || ROUTES.salkku;
    if (ui.playing) { clearInterval(ui.playing); ui.playing = null; }
    $$("#nav a").forEach((a) => a.classList.toggle("is-active", a.dataset.view === key));
    $("#user").innerHTML = `<div class="user__avatar">${r[1]}</div><div>${r[2]}<small>${r[3]}</small></div>`;
    r[0]();
  }

  let lastKey = null;
  window.addEventListener("hashchange", () => {
    const key = location.hash.replace(/^#\/?/, "") || "salkku";
    route();
    if (key !== lastKey) window.scrollTo(0, 0);
    lastKey = key;
  });
  window.addEventListener("resize", () => { if ($("#heat")) updateMap(); });
  $("#reset").addEventListener("click", () => {
    state = fresh();
    save();
    ui.sensor = null;
    ui.day = lastDayIdx;
    route();
    toast("Demo nollattu.");
  });
  route();
})();
