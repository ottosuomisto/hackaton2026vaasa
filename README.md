# VILPE Sense+ Kuiva katto -takuu – prototyyppi

Junction X Vaasa Hackathon 2026 · VILPE-haaste *"Unlocking the Value of Building Data"* · konsepti v5.

> **Maksa kuivasta katosta, älä antureista.** Kiinteistönomistaja ostaa kuivan katon kiinteään hintaan per neliö vuodessa. VILPE tuottaa laitteet ja datan, sertifioitu urakoitsija huoltaa ja korjaa, ja rakenteen sisältä mitattu data tekee kattoriskistä hinnoiteltavan.

## Käynnistys

Ei riippuvuuksia eikä build-vaihetta. Avaa `app/index.html` selaimessa tai käynnistä pieni palvelin:

```bash
node scripts/serve.js
```

→ http://localhost:8765 · kirjautuminen: `VilpeDemo` / `VilpeDemo` (selaimessa tarkistettava demoportti, ei oikea tietoturva).

## Näkymät (konsepti luku 19.1)

| Näkymä | Mitä näyttää |
|---|---|
| **Takuusalkku** | Kohteet, m², riskiluokka A–E, takuumaksu €/v ja avoimet havainnot. Kohteen lisäys (m², rakenne, laitekombo) ja poisto |
| **Takuukohde** | Löydökset kattokartalla (kosteus-, lämpö- ja tuuletuspoikkeamat), havainnot ja työtilaukset, rakenneosien riskiluokat, sopimustiedot, korjausrahaston saldo, AH rakenne vs. ulkoilma |
| **Työtilaus** | Urakoitsijalle kartan ja datan kanssa, "hoidetaan takuun puitteissa, 0 € omistajalle", kustannus korjausrahastosta |
| **Vuosipassi** | Riskiluokka, kuivuminen (AH-vertailu), lämpöpoikkeamat, tuuletuksen hyöty, korjaukset, "takuu siirrettävissä", QR-varmennus |
| **Vakuuttaja** | Riskiluokkajakauma m²:n mukaan, korjauskulut vs. rahasto, omistajan suostumus kohteittain |
| **Hinnoittelu** | Asiakaspolku, laskuri (m² + riskiluokka → €/v ja maksun jako), tulovirrat, skenaario, VILPEn hinnasto 2025, maaprofiili |

## Kohteet

| Kohde | Data | Laitteet | Löydös |
|---|---|---|---|
| VILPE Express Store, Vantaa (~1 000 m², pilotti) | **Oikea** 9/2025–9/2026 | 51 vuotoanturia + 7 huippuimuria | Löydökset 1–5 |
| Logistiikkahalli Vaasa (4 000 m²) | Simuloitu 12 kk | 200 vuotoanturia | Kosteuspoikkeama (vuotoepäily) |
| Varastohalli Mustasaari (2 500 m²) | Simuloitu 12 kk | 3 × MCU-2 + huippuimuri | Puhallin seis 21 vrk |
| Tuotantohalli Kokkola (3 200 m²) | Simuloitu 12 kk | 160 vuotoanturia + 2 huippuimuria | Anturi offline |

Footerin **Nollaa demo** palauttaa alkutilan. Maavalitsin (FI, SE, EE, LV, LT, PL, UK, US) vaihtaa roolitermit, yksiköt, valuutan ja takuun kytkennän; kielet suomi ja englanti.

## Analytiikka (konsepti luku 15.3)

- **Puhallin seis:** rpm = 0 > 48 h ja tuuletus kannattaisi; pakkasjaksot (ulko < −5 °C) eivät ole vika.
- **Anturi offline:** ei mittausta > 36 h.
- **Poikkeava anturi:** RH > 6 lähimmän naapurin mediaani + 3σ (väh. 10 %-yks.).
- **Lämpöpoikkeama:** talvella `T_anturi = a + b · T_ulko`; poikkeama, jos `b > mediaani + 2σ` tai anturi > 2 °C muita kylmempi.
- **Tuuletuksen hyöty:** osuus käyntitunneista, joina `AH_sisä > AH_ulko` (kesä 18.6.–10.9.); tarkistus, jos alle 50 % ja rakenne-RH > 95 % yli puolet ajasta.
- **Kuivuminen:** `Δ(AH_sisä − AH_ulko)` samana vuodenaikana vuodesta toiseen ≈ 0.
- **Riskiluokka:** 100 − homeriski (25) − aika yli RH-rajan (20) − laiteviat (20) − lämpöpoikkeamat (15) − avoimet havainnot (20) → A ≥ 90, B ≥ 75, C ≥ 60, D ≥ 40, E < 40. Avoin laitevika tai vuotoepäily estää A-luokan.
- **Takuumaksu [H]:** A 1,2 · B 1,5 · C 1,8 · D 2,0 €/m²/v (D: korjaukset ensin, E ei kelpaa). Jako: laitteisto 0,50 + palvelu 0,40 (VILPE), urakoitsija 0,35, korjausrahasto 0,25 €/m²/v. Korjauskulut arvioidaan havaintotyypin mukaan.

## Data

`app/data.js` ja `app/assets/roof.jpg` generoidaan hackathon-aineistosta (sisältää myös tuntitason tuuletustilastot löydökseen 2):

```bash
pip install openpyxl pymupdf pillow
python scripts/build_data.py ../Vilpe_Materiaalit
```

`scripts/analyysi/` sisältää konseptin löydösten 2–4 alkuperäiset analyysiskriptit (pandas). Simuloidut kohteet tuotetaan selaimessa (`app/sim.js`, siemennetty satunnaisuus).

## Rakenne

```
app/
  index.html      kehys ja navigaatio
  styles.css      VILPE-ilme (vilpe_design.md)
  app.js          näkymät, analytiikka, riskiluokka, takuun talous, kirjautuminen
  i18n.js         maaprofiilit ja kielet
  sim.js          simuloidut hallit
  charts.js       riippuvuukseton SVG-aikasarjakaavio
  data.js         Vantaan generoitu data
  assets/         logo ja kattokartta
  vendor/         qrcode-generator (MIT)
scripts/
  build_data.py   datan muunnos
  analyysi/       löydösten 2–4 analyysiskriptit
  serve.js        staattinen palvelin
```
