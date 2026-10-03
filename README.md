# VILPE Sense+ – prototyyppi

Junction X Vaasa Hackathon 2026 · VILPE-haaste *"Unlocking the Value of Building Data"*.

VILPE Sense+ on palvelukerros VILPE Sense -anturien päällä: **Care**-valvontapalvelu isännöitsijöille, varmennettu **Kosteuspassi** ja **Partner API** vakuutusyhtiöille. Tämä repo sisältää klikattavan dashboard-prototyypin.

Salkussa on neljä kohdetta:

| Kohde | Data | Laitekombo |
|---|---|---|
| VILPE Express Store, Vantaa | **Oikea** (9/2025–9/2026) | 51 vuotoanturia + 7 huippuimuria |
| As Oy Vaasan Rantakatu 12 | Simuloitu (3 kk) | 28 vuotoanturia – vuotoepäily |
| As Oy Hietalahdenkatu 5 | Simuloitu (3 kk) | 3 × MCU-2 + huippuimuri – puhallin seis |
| As Oy Palosaaren Helmi | Simuloitu (3 kk) | 16 vuotoanturia + 2 huippuimuria – anturi offline |

## Kirjautuminen

Kaikki näkymät ovat yhden demotunnuksen takana:

- Käyttäjätunnus: `VilpeDemo`
- Salasana: `VilpeDemo`

Kirjautuminen tarkistetaan selaimessa, eli se on demon portti eikä oikea tietoturva. Istunto päättyy, kun välilehti suljetaan tai painetaan *Kirjaudu ulos*.

## Käynnistys

Ei riippuvuuksia eikä build-vaihetta. Avaa `app/index.html` selaimessa tai käynnistä pieni palvelin:

```bash
node scripts/serve.js
```

→ http://localhost:8765

## Näkymät

| Näkymä | Mitä näyttää |
|---|---|
| **Salkku** | Kohteet Health Scoren mukaan järjestettynä. **Lisää kohde** (nimi, rakenne, laitekombo → 3 kk simuloitu data) ja **Poista** kohde |
| **Kohde** | Kosteuskartta (päiväliukusäädin + toisto), toimenpidelista, huippuimurien tila ja aikasarjat, kuivumiskäyrä |
| **Työtilaus** | Yhden klikkauksen tilaus kumppaniurakoitsijalle → "Merkitse korjatuksi" → Health Score päivittyy |
| **Kosteuspassi** | Luokka A–E, havainnot, kuivumiskäyrä, mittauskattavuus, QR-varmennus, tulostus/PDF |
| **Vakuutusnäkymä** | Suostumus (peruttavissa), riskiluokka, alennusperuste, toimenpidehistoria, Health Score -erittely |
| **Hallitusraportti** | Yhden sivun vuosikooste yhtiökokoukseen |
| **Liiketoiminta** | Elinkaari, paketit, taloyhtiön kustannuslaskuri, VILPEn tuloskenaario |

Kohdekohtaisissa näkymissä on kohdevalitsin. Demon tila (tilaukset, korjaukset, suostumukset, lisätyt ja poistetut kohteet) tallentuu selaimen localStorageen. Footerin **Nollaa demo** palauttaa alkutilan.

## Analytiikka (sääntöpohjainen MVP)

Lasketaan selaimessa `app/app.js`:ssä:

- **Laitevalvonta:** puhallin seis (rpm = 0) yli 48 h → hälytys. Pakkaspäiviä (ulko < −5 °C) ei lasketa, koska seisokki on silloin todennäköisesti pakkassuojaus. Lisäksi lasketaan päivät, jolloin sisä-AH > ulko-AH eli tuuletus olisi kannattanut.
- **Offline:** anturilta ei mittausta yli 36 h (normaalisti 2 × vrk).
- **Naapurivertailu:** anturin RH > 6 lähimmän naapurin mediaani + max(3σ, 10 %-yks.) tai T < mediaani − 4 °C. Liputetaan anturit, joilla poikkeamapäiviä ≥ ~7 % seurantajaksosta.
- **Roof Health Score:** 100 − homeriski (30) − aika yli RH-rajan (25) − laiteviat (25) − avoimet poikkeamat (20). Avoin havainto pitää liikennevalon vähintään keltaisena.

## Data

Simuloitu data tuotetaan selaimessa (`app/sim.js`, siemennetty satunnaisuus → sama kohde näyttää aina samalta). Vantaan `app/data.js` ja `app/assets/roof.jpg` generoidaan hackathon-aineistosta:

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
  app.js          näkymät, analytiikka, kirjautuminen ja demon tila
  sim.js          simuloidut kohteet
  data.js         Vantaan generoitu data
  assets/         logo ja kattokartta
  vendor/         qrcode-generator (MIT)
scripts/
  build_data.py   datan muunnos
  serve.js        staattinen palvelin
```
