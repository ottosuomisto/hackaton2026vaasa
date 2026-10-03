/* Maaprofiilit ja kielet (konsepti v5, luku 12.2).
   Palvelu suunnitellaan rooleihin (omistaja, kiinteistön hoitaja, urakoitsija, riskinkantaja);
   maaprofiili vaihtaa termit, yksiköt, valuutan ja takuun kytkennän. Kielet: suomi ja englanti. */
(function () {
  "use strict";

  const PROFILES = {
    FI: {
      name: { fi: "Suomi", en: "Finland" },
      lang: "fi",
      currency: "EUR", rate: 1, temp: "C", area: "m2",
      roles: {
        owner: { fi: "Kiinteistönomistaja", en: "Property owner" },
        manager: { fi: "Kiinteistöpäällikkö", en: "Property manager", local: "kiinteistöpäällikkö" },
        contractor: { fi: "Sertifioitu kattourakoitsija", en: "Certified roofing contractor" },
        insurer: { fi: "Vakuutusyhtiö", en: "Insurer" },
      },
      link: { fi: "Kotimarkkina; taloyhtiöt isännöitsijöiden kautta vaiheessa 2", en: "Home market; housing companies via property managers in phase 2" },
      partners: ["Pohjanmaan Kattohuolto Oy", "Uudenmaan Kattotekniikka Oy"],
    },
    SE: {
      name: { fi: "Ruotsi", en: "Sweden" },
      lang: "en",
      currency: "SEK", rate: 11.2, temp: "C", area: "m2",
      roles: {
        owner: { fi: "Kiinteistönomistaja", en: "Property owner", local: "fastighetsägare" },
        manager: { fi: "Kiinteistön hoitaja", en: "Property manager", local: "förvaltare" },
        contractor: { fi: "Sertifioitu kattourakoitsija", en: "Certified roofing contractor", local: "takentreprenör" },
        insurer: { fi: "Vakuutusyhtiö", en: "Insurer" },
      },
      link: { fi: "Kotimarkkina; BRF + förvaltare vaiheessa 2", en: "Home market; BRF + förvaltare in phase 2" },
      partners: ["Norrtak Entreprenad AB", "Stockholms Takservice AB"],
    },
    EE: {
      name: { fi: "Viro", en: "Estonia" },
      lang: "en",
      currency: "EUR", rate: 1, temp: "C", area: "m2",
      roles: {
        owner: { fi: "Kiinteistönomistaja", en: "Property owner" },
        manager: { fi: "Kiinteistön hoitaja", en: "Property manager", local: "haldusfirma" },
        contractor: { fi: "Sertifioitu kattourakoitsija", en: "Certified roofing contractor" },
        insurer: { fi: "Vakuutusyhtiö", en: "Insurer" },
      },
      link: { fi: "Peruskorjausaalto (tasakattojen lisäeristys) → takuu korjauksen onnistumiselle; EPBD-remonttipassi", en: "Renovation wave (flat-roof re-insulation) → guarantee that the renovation succeeded; EPBD renovation passport" },
      partners: ["Tallinna Katusetööd OÜ", "Põhja Ehitus OÜ"],
    },
    LV: {
      name: { fi: "Latvia", en: "Latvia" },
      lang: "en",
      currency: "EUR", rate: 1, temp: "C", area: "m2",
      roles: {
        owner: { fi: "Kiinteistönomistaja", en: "Property owner" },
        manager: { fi: "Kiinteistön hoitaja", en: "Property manager", local: "pārvaldnieks" },
        contractor: { fi: "Sertifioitu kattourakoitsija", en: "Certified roofing contractor" },
        insurer: { fi: "Vakuutusyhtiö", en: "Insurer" },
      },
      link: { fi: "Peruskorjausaalto (tasakattojen lisäeristys) → takuu korjauksen onnistumiselle; EPBD-remonttipassi", en: "Renovation wave (flat-roof re-insulation) → guarantee that the renovation succeeded; EPBD renovation passport" },
      partners: ["Rīgas Jumti SIA", "Baltic Roof Works SIA"],
    },
    LT: {
      name: { fi: "Liettua", en: "Lithuania" },
      lang: "en",
      currency: "EUR", rate: 1, temp: "C", area: "m2",
      roles: {
        owner: { fi: "Kiinteistönomistaja", en: "Property owner" },
        manager: { fi: "Kiinteistön hoitaja", en: "Property administrator", local: "administratorius" },
        contractor: { fi: "Sertifioitu kattourakoitsija", en: "Certified roofing contractor" },
        insurer: { fi: "Vakuutusyhtiö", en: "Insurer" },
      },
      link: { fi: "Peruskorjausaalto (tasakattojen lisäeristys) → takuu korjauksen onnistumiselle; EPBD-remonttipassi", en: "Renovation wave (flat-roof re-insulation) → guarantee that the renovation succeeded; EPBD renovation passport" },
      partners: ["Vilniaus Stogai UAB", "Kauno Stogdengiai UAB"],
    },
    PL: {
      name: { fi: "Puola", en: "Poland" },
      lang: "en",
      currency: "PLN", rate: 4.3, temp: "C", area: "m2",
      roles: {
        owner: { fi: "Kiinteistönomistaja", en: "Property owner" },
        manager: { fi: "Kiinteistön hoitaja", en: "Property manager", local: "zarządca nieruchomości" },
        contractor: { fi: "Sertifioitu kattourakoitsija", en: "Certified roofing contractor", local: "dekarz" },
        insurer: { fi: "Vakuutusyhtiö", en: "Insurer" },
      },
      link: { fi: "Logistiikkahallien uudisrakentaminen", en: "New construction of logistics halls" },
      partners: ["Dachy Pomorze Sp. z o.o.", "Warszawskie Dachy Sp. z o.o."],
    },
    UK: {
      name: { fi: "Iso-Britannia", en: "United Kingdom" },
      lang: "en",
      currency: "GBP", rate: 0.85, temp: "C", area: "m2",
      roles: {
        owner: { fi: "Asuntoyhdistys / kiinteistönomistaja", en: "Housing association / building owner" },
        manager: { fi: "Kiinteistön hoitaja", en: "Managing agent" },
        contractor: { fi: "Sertifioitu kattourakoitsija", en: "Certified roofing contractor" },
        insurer: { fi: "Vakuutusyhtiö", en: "Insurer" },
      },
      link: { fi: "Housing associations, Awaab's Law (kosteus ja home)", en: "Housing associations, Awaab's Law (damp and mould)" },
      partners: ["Northgate Roofing Ltd", "Thames Roof Services Ltd"],
    },
    US: {
      name: { fi: "USA", en: "United States" },
      lang: "en",
      currency: "USD", rate: 1.1, temp: "F", area: "ft2",
      roles: {
        owner: { fi: "Kiinteistönomistaja / REIT", en: "Building owner / REIT" },
        manager: { fi: "Kiinteistön hoitaja", en: "Property / facility manager" },
        contractor: { fi: "Sertifioitu kattourakoitsija", en: "Certified roofing contractor" },
        insurer: { fi: "Kiinteistövakuuttaja", en: "Property insurer" },
      },
      link: { fi: "Kaupalliset tasakatot; kattotakuut ovat vakiintunut markkina → datapohjainen takuu on tuttu konsepti", en: "Commercial flat roofs; roof warranties are an established market → a data-driven guarantee is a familiar concept" },
      partners: ["Lakeside Commercial Roofing Inc.", "Summit Roof Consultants LLC"],
    },
  };
  const ORDER = ["FI", "SE", "EE", "LV", "LT", "PL", "UK", "US"];

  const KEY = "vilpe-senseplus-locale";
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { /* ohitetaan */ }
  const st = { country: PROFILES[saved.country] ? saved.country : "FI", lang: saved.lang === "en" || saved.lang === "fi" ? saved.lang : null };
  if (!st.lang) st.lang = PROFILES[st.country].lang;
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* ohitetaan */ } };

  const P = () => PROFILES[st.country];
  const L = (fi, en) => (st.lang === "en" ? en : fi);
  const pick = (o) => (o && typeof o === "object" ? (o[st.lang] !== undefined ? o[st.lang] : o.en) : o);
  const locale = () => (st.lang === "fi" ? "fi-FI" : st.country === "US" ? "en-US" : "en-GB");

  const MONTHS_FI = ["tammi", "helmi", "maalis", "huhti", "touko", "kesä", "heinä", "elo", "syys", "loka", "marras", "joulu"];
  const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  const I18N = {
    PROFILES,
    ORDER,
    get country() { return st.country; },
    get lang() { return st.lang; },
    profile: P,
    L,
    pick,
    locale,
    setCountry(code) { if (PROFILES[code]) { st.country = code; st.lang = PROFILES[code].lang; persist(); } },
    setLang(lang) { if (lang === "fi" || lang === "en") { st.lang = lang; persist(); } },
    // Rooli: näyttökieli + paikallinen termi selitteenä, esim. "Property manager (förvaltare)"
    role(key) {
      const r = P().roles[key];
      const shown = L(r.fi, r.en);
      return r.local && r.local.toLowerCase() !== shown.toLowerCase() ? `${shown} (${r.local})` : shown;
    },
    roleShort(key) { const r = P().roles[key]; return L(r.fi, r.en); },
    date(iso) {
      const d = typeof iso === "string" ? new Date(`${iso.slice(0, 10)}T12:00:00`) : iso;
      if (st.lang === "fi") return `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`;
      return d.toLocaleDateString(locale(), { day: "numeric", month: "short", year: "numeric" });
    },
    month(ym) { const [y, m] = ym.split("-"); return `${(st.lang === "fi" ? MONTHS_FI : MONTHS_EN)[+m - 1]} ${y.slice(2)}`; },
    weekday(d) { return d.toLocaleDateString(locale(), { weekday: "long" }); },
    // Yksiköt
    tempUnit() { return P().temp === "F" ? "°F" : "°C"; },
    temp(c) { return c === null || c === undefined ? null : P().temp === "F" ? c * 1.8 + 32 : c; },
    tempDelta(c) { return P().temp === "F" ? c * 1.8 : c; },
    areaUnit() { return P().area === "ft2" ? "ft²" : "m²"; },
    area(m2) { return P().area === "ft2" ? m2 * 10.7639 : m2; },
    // Hinta per pinta-alayksikkö (€/m² → $/ft² jne.)
    perArea(eurPerM2) { return P().area === "ft2" ? eurPerM2 / 10.7639 : eurPerM2; },
    // Rahat: euromääräinen hinta muunnetaan valuuttakurssilla
    money(eur, digits = 0) {
      return new Intl.NumberFormat(locale(), { style: "currency", currency: P().currency, maximumFractionDigits: digits, minimumFractionDigits: digits }).format(eur * P().rate);
    },
  };
  window.I18N = I18N;
})();
