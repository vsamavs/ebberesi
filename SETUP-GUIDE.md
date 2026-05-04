# 🍷 Ebbere Si — Guida Setup Completa

## Architettura

```
ebberesi.it (Vercel)  ←→  Firebase (DB + Auth)  ←→  Stripe/PayPal/Satispay (Pagamenti)
```

- **Vercel**: hosting gratuito, deploya automaticamente da GitHub
- **Firebase Firestore**: database eventi, prenotazioni, utenti, blog
- **Firebase Auth**: login con email OTP (magic link)
- **Stripe**: pagamenti carta di credito
- **PayPal**: pagamenti PayPal
- **Satispay**: pagamenti Satispay

---

## 1. Creare il progetto Firebase (5 minuti)

1. Vai su [console.firebase.google.com](https://console.firebase.google.com)
2. Clicca **"Aggiungi progetto"** → nome: `ebberesi` → disattiva Google Analytics (non serve)
3. Nel progetto, vai su **"Crea database"** (Firestore Database):
   - Scegli **"Avvia in modalità test"** (lo metteremo in sicurezza dopo)
   - Location: `europe-west6` (Zurigo, la più vicina)
4. Vai su **Authentication** → **Sign-in method** → abilita **"Link email (senza password)"**
5. Vai su **Impostazioni progetto** (icona ingranaggio) → **Generali** → scorri in basso
6. Clicca **"Aggiungi app"** → scegli **Web** (icona `</>`)
   - Nome: `ebberesi-web`
   - Copia la configurazione che ti viene mostrata (servirà nel file `.env`)

La configurazione sarà tipo:
```
apiKey: "AIzaSy..."
authDomain: "ebberesi.firebaseapp.com"
projectId: "ebberesi"
storageBucket: "ebberesi.appspot.com"
messagingSenderId: "123456789"
appId: "1:123456789:web:abc123"
```

---

## 2. Popolare il database (2 minuti)

Nella console Firebase → Firestore → **"Avvia raccolta"**:

### Collection: `events`
Aggiungi un documento con questi campi:

| Campo         | Tipo      | Esempio                                     |
|---------------|-----------|---------------------------------------------|
| title         | string    | Barolo e Barbaresco: le colline del re       |
| date          | timestamp | 18 Apr 2026 20:30                           |
| location      | string    | Torino, Via Roma 42                         |
| price         | number    | 35                                          |
| totalSpots    | number    | 30                                          |
| bookedSpots   | number    | 6                                           |
| description   | string    | Un viaggio nelle Langhe attraverso 6 etichette... |
| emoji         | string    | 🍷                                          |
| status        | string    | available                                   |
| published     | boolean   | true                                        |

---

## 3. Configurare il progetto locale

```bash
# Clona il progetto (o copia i file che ti ho preparato)
cd ebberesi

# Installa dipendenze
npm install

# Crea il file .env.local con le tue chiavi Firebase
cp .env.example .env.local
# Modifica .env.local con i dati dal punto 1
```

---

## 4. Deploy su Vercel (3 minuti)

1. Carica il progetto su GitHub:
   ```bash
   git init
   git add .
   git commit -m "first commit"
   git branch -M main
   git remote add origin https://github.com/TUO-USERNAME/ebberesi.git
   git push -u origin main
   ```

2. Vai su [vercel.com](https://vercel.com) → accedi con GitHub
3. Clicca **"New Project"** → importa il repo `ebberesi`
4. Nelle **Environment Variables** aggiungi le stesse variabili del `.env.local`
5. Clicca **Deploy** — fatto!

### Collegare il dominio ebberesi.it
1. In Vercel → Settings → Domains → aggiungi `ebberesi.it`
2. Vercel ti dirà quali record DNS configurare
3. Vai nel pannello del tuo registrar (dove hai comprato il dominio) e aggiorna i DNS

---

## 5. Stripe (per pagamenti carta)

1. Crea un account su [stripe.com](https://stripe.com)
2. Dashboard → Developers → API Keys
3. Copia la **Publishable key** (`pk_test_...`) nel `.env.local`
4. La **Secret key** (`sk_test_...`) servirà per il backend (Vercel Serverless Functions)
5. Quando sei pronto per andare live, attiva l'account e usa le chiavi `pk_live_` / `sk_live_`

---

## 6. PayPal

1. Vai su [developer.paypal.com](https://developer.paypal.com)
2. Crea un'app → copia il **Client ID**
3. Aggiungilo al `.env.local`

---

## 7. Satispay

1. Vai su [business.satispay.com](https://business.satispay.com)
2. Registra l'associazione
3. Nelle impostazioni API, ottieni le credenziali
4. Aggiungile al `.env.local`

---

## Struttura file

```
ebberesi/
├── public/              # File statici
├── src/
│   ├── components/      # Componenti React (Navbar, Hero, Events, Modal, ecc.)
│   ├── lib/
│   │   └── firebase.js  # Configurazione Firebase
│   ├── styles/
│   │   └── globals.css  # CSS globale (lo stile del sito)
│   └── index.html       # Entry point
├── api/                 # Vercel Serverless Functions (pagamenti)
│   └── create-checkout.js
├── .env.example         # Template variabili d'ambiente
├── .env.local           # Le TUE chiavi (NON committare su Git!)
├── package.json
├── vite.config.js
└── README.md
```

---

## Costi

| Servizio  | Piano gratuito                        | Quando paghi               |
|-----------|---------------------------------------|----------------------------|
| Vercel    | 100GB bandwidth/mese                  | Mai per un sito così       |
| Firebase  | 50K letture/giorno, 20K scritture     | Mai per un'associazione    |
| Stripe    | Nessun fisso                          | 1.4% + 0.25€ a transazione|
| PayPal    | Nessun fisso                          | ~3.4% + 0.35€ a transazione|
| Satispay  | Nessun fisso (associazioni)           | Gratuito sotto 10€, poi 0.20€|

**Costo fisso mensile: €0** — paghi solo le commissioni sui biglietti venduti.
