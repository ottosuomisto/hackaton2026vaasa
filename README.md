# VILPE Sense+ – prototyyppi

Junction X Vaasa Hackathon 2026 · VILPE-haaste *"Unlocking the Value of Building Data"*.

VILPE Sense+ on palvelukerros VILPE Sense -anturien päällä: **Care**-valvontapalvelu isännöitsijöille, varmennettu **Kosteuspassi** ja **Partner API** vakuutusyhtiöille. Tämä repo sisältää klikattavan dashboard-prototyypin, joka käyttää VILPE Express Store Vantaan **oikeaa dataa** (51 vuotoanturia, 7 huippuimuria, 9/2025–9/2026).

## Käynnistys

Ei riippuvuuksia eikä build-vaihetta. Avaa `app/index.html` selaimessa tai käynnistä pieni palvelin:

```bash
node scripts/serve.js
```

→ http://localhost:8765

## Näkymät

| Näkymä | Mitä näyttää |
|---|---|
| **Salkku** | Isännöitsijä Sannan kohteet Health Scoren mukaan järjestettynä (Vantaa oikealla datalla, muut esimerkkejä) |
| **Kohde** | Kosteuskartta (päiväliukusäädin + toisto), toimenpidelista, huippuimurien tila ja aikasarjat, kuivumiskäyrä |
| **Työtilaus** | Yhden klikkauksen tilaus kumppaniurakoitsijalle → "Merkitse korjatuksi" → Health Score päivittyy |
| **Kosteuspassi** | Luokka A–E, havainnot, kuivumiskäyrä, mittauskattavuus, QR-varmennus, tulostus/PDF |
| **Vakuuttaja** | Suostumus (peruttavissa), riskiluokka, alennusperuste, toimenpidehistoria, Health Score -erittely |
| **Hallitusraportti** | Yhden sivun vuosikooste yhtiökokoukseen |
| **Liiketoiminta** | Elinkaari, paketit, taloyhtiön kustannuslaskuri, VILPEn tuloskenaario |

Demon tila (tilatut ja korjatut havainnot, suostumus) tallentuu selaimen localStorageen. Footerin **Nollaa demo** palauttaa alkutilan.

## Analytiikka (sääntöpohjainen MVP)

Lasketaan selaimessa `app/app.js`:ssä:

- **Laitevalvonta:** puhallin seis (rpm = 0) yli 48 h → hälytys; lisäksi lasketaan päivät, jolloin sisä-AH > ulko-AH eli tuuletus olisi kannattanut.
- **Naapurivertailu:** anturin RH > 6 lähimmän naapurin mediaani + max(3σ, 10 %-yks.) tai T < mediaani − 4 °C. Liputetaan anturit, joilla poikkeamapäiviä ≥ 25.
- **Roof Health Score:** 100 − homeriski (30) − aika yli RH 90 % (25) − laiteviat (25) − avoimet poikkeamat (20).

## Data

`app/data.js` ja `app/assets/roof.jpg` generoidaan hackathon-aineistosta:

```bash
pip install openpyxl pymupdf pillow
python scripts/build_data.py ../Vilpe_Materiaalit
```

Skripti lukee `measurements_*.xlsx` (vuotoanturit), `VILPE Vantaa, *.xlsx` (MCU-2-yksiköt) ja `site_layout_*.pdf` (kattokartta ja anturien sijainnit).

## Rakenne

```
app/
  index.html      kehys ja navigaatio
  styles.css      VILPE-ilme (vilpe_design.md)
  charts.js       riippuvuukseton SVG-aikasarjakaavio
  app.js          näkymät, analytiikka ja demon tila
  data.js         generoitu data
  assets/         logo ja kattokartta
  vendor/         qrcode-generator (MIT)
scripts/
  build_data.py   datan muunnos
  serve.js        staattinen palvelin
```
