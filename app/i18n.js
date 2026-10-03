/* Maaprofiilit ja kielet (konsepti luku 13.2).
   Ydin pysyy samana; maaprofiili vaihtaa roolitermit, yksiköt, valuutan,
   säädöskytkennän, säädatan lähteen ja hintakertoimen. Kielet: suomi ja englanti. */
(function () {
  "use strict";

  const EPBD = {
    fi: "EU:n energiatehokkuusdirektiivi (EPBD 2024): Kosteuspassi on remonttipassin ja digitaalisen rakennuslokikirjan kosteusmoduuli",
    en: "EU Energy Performance of Buildings Directive (EPBD 2024): the Moisture Passport is the moisture module of the renovation passport and digital building logbook",
  };
  const GLOBAL_WEATHER = { fi: "Globaali säädata (Copernicus / Open-Meteo) + MCU-2-ulkoanturi", en: "Global weather data (Copernicus / Open-Meteo) + MCU-2 outdoor sensor" };

  const PROFILES = {
    FI: {
      name: { fi: "Suomi", en: "Finland" },
      lang: "fi",
      currency: "EUR", rate: 1, mult: 1.0, temp: "C", area: "m2",
      roles: {
        owner: { fi: "Taloyhtiö", en: "Housing company", local: "taloyhtiö" },
        manager: { fi: "Isännöitsijä", en: "Property manager", local: "isännöitsijä" },
        contractor: { fi: "Kattourakoitsija", en: "Roofing contractor" },
        insurer: { fi: "Vakuutusyhtiö", en: "Insurer" },
      },
      unitWord: { fi: "asunto", en: "apartment" },
      boardDoc: { fi: "vuosiraportti yhtiökokoukseen", en: "annual report for the AGM" },
      regulation: EPBD,
      extra: { fi: "Kosteusvauriot ovat asuntokaupan riitojen ykkösaihe.", en: "Moisture damage is the most common cause of housing-sale disputes." },
      weather: { fi: "Ilmatieteen laitoksen avoin data + MCU-2-ulkoanturi", en: "Finnish Meteorological Institute open data + MCU-2 outdoor sensor" },
      privacy: "GDPR",
      segment: { fi: "Asuinyhteisöt, julkiset kiinteistöt", en: "Residential associations, public buildings" },
      partners: ["Pohjanmaan Kattohuolto Oy", "Uudenmaan Kattotekniikka Oy"],
      step: 1,
    },
    SE: {
      name: { fi: "Ruotsi", en: "Sweden" },
      lang: "en",
      currency: "SEK", rate: 11.2, mult: 1.1, temp: "C", area: "m2",
      roles: {
        owner: { fi: "Asunto-osakeyhdistys", en: "Housing cooperative", local: "bostadsrättsförening (BRF)" },
        manager: { fi: "Isännöitsijä", en: "Property manager", local: "förvaltare" },
        contractor: { fi: "Kattourakoitsija", en: "Roofing contractor", local: "takentreprenör" },
        insurer: { fi: "Vakuutusyhtiö", en: "Insurer" },
      },
      unitWord: { fi: "asunto", en: "apartment" },
      boardDoc: { fi: "vuosiraportti BRF:n hallitukselle", en: "annual report for the BRF board" },
      regulation: EPBD,
      extra: { fi: "Kytkeytyy BRF:n kunnossapitosuunnitelmaan (underhållsplan).", en: "Feeds the BRF maintenance plan (underhållsplan)." },
      weather: GLOBAL_WEATHER,
      privacy: "GDPR",
      segment: { fi: "Asuinyhteisöt", en: "Residential associations" },
      partners: ["Norrtak Entreprenad AB", "Stockholms Takservice AB"],
      step: 2,
    },
    EE: {
      name: { fi: "Viro", en: "Estonia" },
      lang: "en",
      currency: "EUR", rate: 1, mult: 0.6, temp: "C", area: "m2",
      roles: {
        owner: { fi: "Asunto-omistajien yhdistys", en: "Apartment owners' association", local: "korteriühistu" },
        manager: { fi: "Hoitoyhtiö", en: "Property manager", local: "haldusfirma" },
        contractor: { fi: "Remonttiurakoitsija", en: "Renovation contractor" },
        insurer: { fi: "Vakuutusyhtiö, avustuksen myöntäjä, pankki", en: "Insurer, grant provider, bank" },
      },
      unitWord: { fi: "asunto", en: "apartment" },
      boardDoc: { fi: "vuosiraportti yhdistyksen hallitukselle", en: "annual report for the association board" },
      regulation: EPBD,
      extra: { fi: "Avustuksilla rahoitettu korjausaalto: passi todistaa remontin onnistumisen avustuksen myöntäjälle ja pankille.", en: "Grant-funded renovation wave: the passport proves the renovation succeeded to the grant provider and bank." },
      weather: GLOBAL_WEATHER,
      privacy: "GDPR",
      segment: { fi: "Neuvostoaikaisten kerrostalojen peruskorjaukset", en: "Deep renovation of Soviet-era apartment blocks" },
      partners: ["Tallinna Katusetööd OÜ", "Põhja Ehitus OÜ"],
      step: 3,
    },
    LV: {
      name: { fi: "Latvia", en: "Latvia" },
      lang: "en",
      currency: "EUR", rate: 1, mult: 0.6, temp: "C", area: "m2",
      roles: {
        owner: { fi: "Asunto-omistajien yhdistys", en: "Apartment owners' association", local: "dzīvokļu īpašnieku biedrība" },
        manager: { fi: "Hoitoyhtiö", en: "Property manager", local: "pārvaldnieks" },
        contractor: { fi: "Remonttiurakoitsija", en: "Renovation contractor" },
        insurer: { fi: "Vakuutusyhtiö, avustuksen myöntäjä, pankki", en: "Insurer, grant provider, bank" },
      },
      unitWord: { fi: "asunto", en: "apartment" },
      boardDoc: { fi: "vuosiraportti yhdistyksen hallitukselle", en: "annual report for the association board" },
      regulation: EPBD,
      extra: { fi: "Avustuksilla rahoitettu korjausaalto; VILPEllä datakeskusreferenssi Latviassa.", en: "Grant-funded renovation wave; VILPE has a data-centre reference in Latvia." },
      weather: GLOBAL_WEATHER,
      privacy: "GDPR",
      segment: { fi: "Kerrostalojen peruskorjaukset, kriittiset kohteet", en: "Apartment block renovations, critical facilities" },
      partners: ["Rīgas Jumti SIA", "Baltic Roof Works SIA"],
      step: 3,
    },
    LT: {
      name: { fi: "Liettua", en: "Lithuania" },
      lang: "en",
      currency: "EUR", rate: 1, mult: 0.6, temp: "C", area: "m2",
      roles: {
        owner: { fi: "Asunto-omistajien yhdistys", en: "Apartment owners' association", local: "DNSB" },
        manager: { fi: "Hoitoyhtiö", en: "Property administrator", local: "administratorius" },
        contractor: { fi: "Remonttiurakoitsija", en: "Renovation contractor" },
        insurer: { fi: "Vakuutusyhtiö, avustuksen myöntäjä, pankki", en: "Insurer, grant provider, bank" },
      },
      unitWord: { fi: "asunto", en: "apartment" },
      boardDoc: { fi: "vuosiraportti yhdistyksen hallitukselle", en: "annual report for the association board" },
      regulation: EPBD,
      extra: { fi: "Avustuksilla rahoitettu korjausaalto: passi todistaa remontin onnistumisen.", en: "Grant-funded renovation wave: the passport proves the renovation succeeded." },
      weather: GLOBAL_WEATHER,
      privacy: "GDPR",
      segment: { fi: "Kerrostalojen peruskorjaukset", en: "Apartment block renovations" },
      partners: ["Vilniaus Stogai UAB", "Kauno Stogdengiai UAB"],
      step: 3,
    },
    PL: {
      name: { fi: "Puola", en: "Poland" },
      lang: "en",
      currency: "PLN", rate: 4.3, mult: 0.6, temp: "C", area: "m2",
      roles: {
        owner: { fi: "Asunto-omistajien yhteisö", en: "Housing community", local: "wspólnota / spółdzielnia mieszkaniowa" },
        manager: { fi: "Kiinteistön hoitaja", en: "Property manager", local: "zarządca nieruchomości" },
        contractor: { fi: "Kattourakoitsija", en: "Roofing contractor", local: "dekarz" },
        insurer: { fi: "Vakuutusyhtiö", en: "Insurer" },
      },
      unitWord: { fi: "asunto", en: "apartment" },
      boardDoc: { fi: "vuosiraportti yhteisön hallitukselle", en: "annual report for the community board" },
      regulation: EPBD,
      extra: { fi: "Rakennuttajan vastuuaika: luovutuspassi uudiskohteisiin ja logistiikkahalleihin.", en: "Developer liability period: handover passport for new builds and logistics halls." },
      weather: GLOBAL_WEATHER,
      privacy: "GDPR",
      segment: { fi: "Uudisrakentaminen, logistiikkahallit", en: "New construction, logistics halls" },
      partners: ["Dachy Pomorze Sp. z o.o.", "Warszawskie Dachy Sp. z o.o."],
      step: 4,
    },
    UK: {
      name: { fi: "Iso-Britannia", en: "United Kingdom" },
      lang: "en",
      currency: "GBP", rate: 0.85, mult: 1.1, temp: "C", area: "m2",
      roles: {
        owner: { fi: "Asuntoyhdistys / kiinteistönomistaja", en: "Housing association / freeholder" },
        manager: { fi: "Kiinteistön hoitaja", en: "Managing agent" },
        contractor: { fi: "Kattourakoitsija", en: "Roofing contractor" },
        insurer: { fi: "Vakuutusyhtiö, sääntelijä", en: "Insurer, regulator" },
      },
      unitWord: { fi: "asunto", en: "flat" },
      boardDoc: { fi: "vuosiraportti hallitukselle", en: "annual report for the board" },
      regulation: {
        fi: "Awaab's Law (lokakuusta 2025): kosteus- ja homeongelmat korjattava määräajassa → varhaisvaroitus ja todiste. Building Safety Act \"golden thread\": passi osaksi rakennuksen tietoketjua",
        en: "Awaab's Law (from October 2025): damp and mould must be fixed within set deadlines → early warning and evidence. Building Safety Act \"golden thread\": the passport joins the building's information chain",
      },
      extra: { fi: "Kärkisegmentti: sosiaalinen vuokra-asuminen (housing associations).", en: "Lead segment: social housing (housing associations)." },
      weather: GLOBAL_WEATHER,
      privacy: "UK GDPR",
      segment: { fi: "Housing associations, managing agents", en: "Housing associations, managing agents" },
      partners: ["Northgate Roofing Ltd", "Thames Roof Services Ltd"],
      step: 5,
    },
    US: {
      name: { fi: "USA", en: "United States" },
      lang: "en",
      currency: "USD", rate: 1.1, mult: 1.3, temp: "F", area: "ft2",
      roles: {
        owner: { fi: "Kiinteistönomistaja / HOA / REIT", en: "Building owner / HOA / REIT" },
        manager: { fi: "Kiinteistön hoitaja", en: "Property / facility manager" },
        contractor: { fi: "Kattourakoitsija", en: "Roofing contractor" },
        insurer: { fi: "Kiinteistövakuuttaja, kattotakuun antaja", en: "Property insurer, roof warranty provider" },
      },
      unitWord: { fi: "asunto", en: "unit" },
      boardDoc: { fi: "vuosiraportti omistajalle", en: "annual report for the owner" },
      regulation: {
        fi: "Vakuutus- ja kattotakuuvetoinen markkina: passi toimii \"roof asset report\" -raporttina vakuuttajalle ja kattotakuun antajalle",
        en: "Insurance- and warranty-driven market: the passport serves as a roof asset report for the property insurer and roof warranty provider",
      },
      extra: { fi: "Kärkisegmentti: kaupalliset tasakatot (varastot, kauppakeskukset, REITit).", en: "Lead segment: commercial flat roofs (warehouses, retail, REITs)." },
      weather: GLOBAL_WEATHER,
      privacy: { fi: "osavaltiokohtainen tietosuojalainsäädäntö", en: "state privacy laws" },
      segment: { fi: "Kaupalliset tasakatot", en: "Commercial flat roofs" },
      partners: ["Lakeside Commercial Roofing Inc.", "Summit Roof Consultants LLC"],
      step: 6,
    },
  };

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
    areaToM2(v) { return P().area === "ft2" ? v / 10.7639 : v; },
    // Rahat: euromääräinen perushinta × kurssi (hinnoissa lisäksi maakerroin)
    money(eur, digits = 0) {
      return new Intl.NumberFormat(locale(), { style: "currency", currency: P().currency, maximumFractionDigits: digits, minimumFractionDigits: digits }).format(eur * P().rate);
    },
    price(eur, digits = 0) { return I18N.money(eur * P().mult, digits); },
  };
  window.I18N = I18N;
})();
