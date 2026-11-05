# Body Tracking

Training, Essen, Wasser, Schlaf und Körpergewicht für eine geschlossene Gruppe. Registrierung nur per Einladungscode, jeder sieht nur die eigenen Daten. Optional gibt es eine Wochen-Rangliste für Trainingsvolumen und Wasser.

## Aufbau

| Bereich | Technik |
|---|---|
| Frontend (`public/`) | Statisch, ES-Module ohne Build-Schritt, Firebase-SDK per CDN |
| Login und Daten | Firebase Auth, Firestore mit Offline-Cache |
| `api/` | Node-Functions auf Vercel für alles, was dem Browser nicht vertraut werden darf |
| Nährwerte | Bundeslebensmittelschlüssel (eingebettet), Open Food Facts (Barcode) |

```
public/js/logic.js        Fachlogik, auch von den Functions genutzt
public/js/food-parser.js  Freitext → Kalorien und Eiweiß, ohne KI
public/js/store.js        Firestore-Zugriffe
public/js/app.js          Oberfläche
api/register.js           Einladung prüfen, Konto anlegen
api/leaderboard-sync.js   Wochenwerte serverseitig berechnen
api/product.js            Barcode-Abfrage
api/account.js            Konto samt Daten löschen
scripts/                  Einladungen, Datenimport, BLS-Aufbereitung
private/                  Persönliche Daten, nie im Repo (.gitignore)
```

### Daten in Firestore

```
users/{uid}                      username, goals, leaderboardOptIn
users/{uid}/meta/plan            exercises, plans, schedule, history
users/{uid}/meta/foods           eigene Lebensmittel
users/{uid}/days/{datum}         entries, plannedIds, note, bw, sl
users/{uid}/food/{datum}         items
users/{uid}/water/{datum}        log
invites/{hash}                   nur Server
leaderboard/{woche}_{metrik}_{uid}  nur Server schreibt
```

## Lokal entwickeln

Voraussetzung: Node 22+ und **Java 21+** für die Firebase-Emulatoren.

```bash
npm ci
npm run dev            # App mit Emulatoren: http://localhost:3000/?emulator=1
npm test               # Unit-Tests
npm run test:emulator  # Sicherheitsregeln und Functions
```

Einladungscode für den Emulator erzeugen, während `npm run dev` läuft:

```bash
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 GCLOUD_PROJECT=demo-body-tracking node scripts/create-invite.mjs
```

## Einrichtung

### 1. Firebase

1. Authentication: Anbieter **E-Mail/Passwort** aktivieren.
2. Firestore: **Standort prüfen**, er sollte in der EU liegen und lässt sich später nicht ändern.
3. Dienstkonto-Schlüssel erzeugen (Projekteinstellungen → Dienstkonten). Die Datei nie ins Repo legen.

Direkte Registrierungen am Einladungscode vorbei geben dank `member`-Claim keinen Datenzugriff. Zusätzlich lässt sich die Selbstregistrierung unter Authentication → Einstellungen abschalten.

### 2. Vercel

Projekt anlegen und `vercel link` ausführen. Umgebungsvariablen für Production:

| Variable | Inhalt |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | Inhalt der Dienstkonto-Datei als JSON |
| `OFF_CONTACT` | Kontaktadresse für Open Food Facts, wird im User-Agent mitgeschickt |

Der Hobby-Tarif ist nur für nicht-kommerzielle Nutzung erlaubt.

### 3. GitHub

Repository-Secrets:

| Secret | Inhalt |
|---|---|
| `VERCEL_TOKEN` | Vercel-API-Token |
| `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` | Aus `.vercel/project.json` |
| `GCP_SA_KEY` | Dienstkonto-JSON zum Deployen von Regeln und Indizes |

## Deployment

`.github/workflows/deploy.yml` läuft bei jedem Push auf `main` oder per Knopfdruck unter **Actions → Tests und Deployment → Run workflow**:

1. Prüfung auf persönliche Daten, Unit-Tests, Emulator-Tests
2. Firestore-Regeln und Indizes deployen
3. `vercel pull`, `vercel build --prod`, `vercel deploy --prebuilt --prod`

Pull Requests führen nur die Tests aus. Die Git-Integration von Vercel ist in `vercel.json` abgeschaltet, sonst würde doppelt deployt.

## Betrieb

```bash
# Einladungscodes erzeugen (der Klartext erscheint nur hier)
node scripts/create-invite.mjs --key <dienstkonto.json> 3 "Trainingsgruppe"

# Daten der alten App in ein bestehendes Konto übernehmen. Ohne --confirm nur Zusammenfassung.
node scripts/import-seed.mjs --key <dienstkonto.json> --email <adresse> [--extra <export.json>] --confirm
```

## Grenzen

- **Rangliste:** Nur der Server schreibt in die Rangliste, die Werte beruhen aber auf den eigenen Einträgen. Plausibilitätsgrenzen dämpfen falsche Angaben, verhindern sie aber nicht.
- **Kalorienberechnung:** Das sind Schätzungen. Zusammengesetzte Gerichte ohne Mengenangabe werden oft zu niedrig geschätzt. Am genauesten wird es mit Mengenangaben und „Meine Lebensmittel“.
- **Barcode per Kamera:** Klappt nur in Browsern mit `BarcodeDetector`, sonst wird die Nummer eingetippt.

## Quellen und Lizenzen

- Nährwerte: Max Rubner-Institut (2025), Bundeslebensmittelschlüssel (BLS), Version 4.0, Karlsruhe, DOI: 10.25826/Data20251217-134202-0, Lizenz CC BY 4.0. `public/data/bls.min.json` enthält daraus nur Name, kcal und Eiweiß. Neu erzeugen mit `npm run build:bls -- <BLS_4_0_Daten_2025_DE.xlsx>`.
- Produktdaten: Open Food Facts, Lizenz ODbL.
