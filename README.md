# CRM Pharma

Application de suivi des visites médicales pour délégués pharmaceutiques. L’interface React enregistre les comptes rendus, affiche les indicateurs et discute avec un assistant. L’API FastAPI stocke les visites dans SQLite, interroge un référentiel médicament (Ollama + Chroma) et transmet les demandes de rendez-vous à Rasa.

## Fonctionnalités

- Connexion de démonstration et espace délégué.
- Saisie d’une visite : médecin, spécialité, date, médicaments, notes.
- Tableau de bord : volume de visites, médecins, mentions de produits, spécialités, évolution mensuelle.
- Export Markdown des comptes rendus.
- Assistant conversationnel :
  - question médicament → recherche dans le référentiel tunisien (Ollama `mistral`) ;
  - phrase contenant `médecin`, `rendez-vous` ou `consultation` → Rasa, qui peut enregistrer la visite ;
  - dictée (Web Speech, français) et lecture vocale des réponses.
- Thème clair et sombre.

## Architecture

```text
Navigateur (React, :5173)
        │  http://localhost:8000/api
        ▼
API FastAPI (api.py, :8000)
        ├── SQLite crm_data.db          visites et statistiques
        ├── Ollama mistral (:11434)     réponses médicament
        │     └── Chroma ./chroma       index construit depuis data/medicine_data_tn.csv
        └── Rasa REST (:5005)           visites et rendez-vous
              └── serveur d’actions (:5055) → même base SQLite
```

Cinq processus pour la chaîne complète. L’interface et l’API suffisent pour les visites, le tableau de bord et l’export. Sans Ollama, une question médicament reçoit un message d’indisponibilité. Sans Rasa, une demande de visite reçoit le même type de message. L’application reste utilisable.

## Prérequis

| Outil | Version utilisée ici | Rôle |
|---|---|---|
| Python | 3.11 (`.venv`) | API FastAPI |
| Python | 3.9 (`Test/rasa-env`) | Rasa 3.6.21. Ne pas installer Rasa dans le venv de l’API. |
| Node.js | 20 ou plus récent | Frontend Vite |
| Ollama | installation Windows | Modèle `mistral` pour le référentiel médicament |

Les commandes ci-dessous sont écrites pour PowerShell, depuis la racine du dépôt `chat-rasa`.

## Arborescence

```text
chat-rasa/
├── api.py                      API FastAPI
├── app.py                      ancienne interface Streamlit (optionnelle)
├── requirements.txt            dépendances de l’API
├── crm_data.db                 visites (créée au démarrage)
├── config.yml                  pipeline et politiques Rasa
├── domain.yml                  intents, slots, réponses, actions
├── endpoints.yml               webhook du serveur d’actions
├── credentials.yml             canal REST
├── data/
│   ├── nlu.yml                 exemples d’entraînement
│   ├── stories.yml
│   ├── rules.yml
│   └── medicine_data_tn.csv    référentiel (nom, dosage, forme, prix, DCI)
├── actions/actions.py          enregistrement d’une visite depuis Rasa
├── models/                     modèles Rasa entraînés (.tar.gz)
├── chroma/                     index vectoriel (créé au premier usage)
├── frontend/                   React + Vite
├── tests/test_api.py
└── Test/rasa-env/              environnement Python de Rasa
```

## Installation

### 1. API

```powershell
cd C:\Users\chawk\chat-rasa
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

La recherche médicament demande en plus les bibliothèques d’indexation. Elles ne sont pas dans `requirements.txt`, car l’API démarre sans elles :

```powershell
python -m pip install langchain langchain-community langchain-text-splitters langchain-chroma langchain-ollama chromadb
```

### 2. Frontend

```powershell
cd C:\Users\chawk\chat-rasa\frontend
npm install
```

`frontend/.env` pointe déjà vers l’API :

```text
VITE_API_URL=http://localhost:8000/api
```

### 3. Ollama

Installer [Ollama pour Windows](https://ollama.com/download), puis télécharger le modèle utilisé par le code (`mistral`, non configurable sans modifier `api.py`) :

```powershell
ollama pull mistral
ollama list
```

L’application Ollama lance en général le serveur toute seule et écoute `http://localhost:11434`. Si `ollama list` échoue, démarrer le serveur dans un terminal dédié et le laisser ouvert :

```powershell
ollama serve
```

Vérifier que le modèle répond :

```powershell
ollama run mistral "Réponds en un mot : ok"
```

Quitter le chat Ollama avec `/bye`. Le serveur, lui, reste actif.

### 4. Rasa

Rasa est déjà installé dans `Test\rasa-env` (Python 3.9, Rasa 3.6.21). Les commandes se lancent depuis la racine du dépôt, là où se trouvent `config.yml`, `domain.yml` et `data/`.

Valider les données d’entraînement :

```powershell
cd C:\Users\chawk\chat-rasa
.\Test\rasa-env\Scripts\python.exe -m rasa data validate
```

Entraîner le modèle. DIET et TED sont réglés sur 100 epochs : compter plusieurs minutes. Le fichier est écrit dans `models/`.

```powershell
.\Test\rasa-env\Scripts\python.exe -m rasa train
```

Relancer l’entraînement après une modification de `domain.yml`, `data/` ou `config.yml`. `rasa run` charge le modèle le plus récent.

Dialogue en console, sans l’interface web :

```powershell
.\Test\rasa-env\Scripts\python.exe -m rasa shell
```

## Démarrage

Ouvrir un terminal par processus. L’ordre utile est : Ollama, actions Rasa, serveur Rasa, API, frontend.

### Terminal A — Ollama

Rien à lancer si `ollama list` répond. Sinon :

```powershell
ollama serve
```

### Terminal B — actions Rasa (port 5055)

```powershell
cd C:\Users\chawk\chat-rasa
.\Test\rasa-env\Scripts\python.exe -m rasa run actions --port 5055
```

`endpoints.yml` envoie les actions personnalisées vers `http://localhost:5055/webhook`. `action_store_visit` écrit dans `crm_data.db`. Sans ce terminal, Rasa répond encore aux formules simples, mais l’enregistrement d’une visite depuis le chat échoue.

### Terminal C — serveur Rasa (port 5005)

```powershell
cd C:\Users\chawk\chat-rasa
.\Test\rasa-env\Scripts\python.exe -m rasa run --enable-api --cors "*" --port 5005
```

L’API joint ce serveur à l’adresse `http://localhost:5005/webhooks/rest/webhook`. Une autre adresse se définit avant de lancer l’API :

```powershell
$env:RASA_URL = "http://localhost:5005/webhooks/rest/webhook"
```

### Terminal D — API (port 8000)

```powershell
cd C:\Users\chawk\chat-rasa
.\.venv\Scripts\Activate.ps1
python -m uvicorn api:app --host 127.0.0.1 --port 8000
```

Contrôle rapide :

```powershell
Invoke-RestMethod http://127.0.0.1:8000/api/login -Method POST -ContentType "application/json" -Body '{"username":"admin","password":"1234"}'
```

La réponse contient `token` et `delegateName`.

Au premier appel médicament, si le dossier `chroma/` n’existe pas, l’API lit `data/medicine_data_tn.csv`, calcule les embeddings avec Ollama et crée l’index. Cette étape est longue. Les suivantes réutilisent `chroma/`.

### Terminal E — frontend (port 5173)

```powershell
cd C:\Users\chawk\chat-rasa\frontend
npm run dev -- --host 127.0.0.1 --port 5173
```

Ouvrir [http://127.0.0.1:5173](http://127.0.0.1:5173).

### Démarrage minimal

Pour les formulaires, le tableau de bord et l’export, seuls les terminaux D et E sont nécessaires. Le chat répond alors que le service médicament ou le service conversationnel est indisponible.

## Comptes de démonstration

| Identifiant | Mot de passe | Nom affiché |
|---|---|---|
| `admin` | `1234` | Admin Délégué |
| `user` | `test` | Jean Dupont |

L’authentification est locale et statique (`fake-jwt-123`, `fake-jwt-456`). Elle sert à la démonstration. Les routes visites, statistiques et export exigent l’en-tête `Authorization: Bearer <token>`.

## Parcours dans l’interface

1. Se connecter avec un compte de démonstration.
2. **Nouvelle visite** : enregistrer un médecin, une spécialité, une date et au moins un médicament. Le nom du délégué reprend le compte connecté.
3. **Activité** : les indicateurs se rechargent depuis `/api/dashboard/stats`.
4. **Export** : télécharge un Markdown produit par `/api/reports/generate`.
5. **Assistant** :
   - « Donne-moi le prix du Glucophage » interroge Ollama ;
   - « Je veux voir un médecin le 20 juillet » interroge Rasa ;
   - confirmer avec « oui » pour que l’action Rasa enregistre la visite.

Le micro utilise le service de reconnaissance du navigateur (souvent un appel réseau). S’il est injoignable, un message s’affiche sous le champ. La lecture vocale se coupe et se rallume avec le bouton du bandeau.

## API

Base : `http://localhost:8000/api`. Origines CORS autorisées : `localhost` et `127.0.0.1` sur les ports 5173, 4173 et 3000.

| Méthode | Chemin | Auth | Rôle |
|---|---|---|---|
| `POST` | `/login` | non | `{ username, password }` → jeton et nom du délégué |
| `POST` | `/reports` | oui | crée une visite |
| `GET` | `/dashboard/stats` | oui | totaux, spécialités, médicaments, visites par mois |
| `GET` | `/reports/generate` | oui | `{ markdown }` |
| `POST` | `/chat` | non | `{ sender, message }` → liste `[{ text, source }]` |

Corps d’une visite :

```json
{
  "delegateName": "Admin Délégué",
  "doctorName": "Dr Martin",
  "specialty": "Cardiologie",
  "visitDate": "2026-09-27",
  "medications": "Doliprane, Glucophage",
  "notes": "Suivi tension"
}
```

Routage du chat dans `api.py` : si le message contient `médecin`, `medecin`, `rendez-vous`, `rendezvous` ou `consultation`, il part vers Rasa. Sinon il part vers la recherche médicament.

## Tests

API, sans serveur lancé :

```powershell
cd C:\Users\chawk\chat-rasa
.\.venv\Scripts\Activate.ps1
python -m pytest tests/test_api.py
```

Données Rasa :

```powershell
.\Test\rasa-env\Scripts\python.exe -m rasa data validate
```

Frontend :

```powershell
cd frontend
npm run lint
npm run build
```

## Variables d’environnement

| Variable | Où | Défaut |
|---|---|---|
| `RASA_URL` | processus de l’API | `http://localhost:5005/webhooks/rest/webhook` |
| `VITE_API_URL` | `frontend/.env` | `http://localhost:8000/api` |

## Interface Streamlit

`app.py` est une interface plus ancienne, sur le même SQLite, le même Chroma et le même Rasa. Elle n’est pas nécessaire pour utiliser le frontend React. Il faut y ajouter Streamlit dans le venv de l’API, ainsi que les paquets d’indexation :

```powershell
python -m pip install streamlit
python -m streamlit run app.py
```

## Dépannage

| Symptôme | Cause probable | Action |
|---|---|---|
| « Connexion impossible. Vérifiez que l’API est démarrée. » | Uvicorn arrêté, ou mauvaise URL | Terminal D. Vérifier `VITE_API_URL`. |
| « La recherche médicament est momentanément indisponible. » | Ollama arrêté, `mistral` absent, ou paquets LangChain / Chroma manquants | `ollama list`, puis l’installation de la section 1. |
| « Le service conversationnel est indisponible. » | Rasa n’écoute pas sur le port 5005 | Terminaux B et C. |
| La visite du chat n’apparaît pas au tableau de bord | Serveur d’actions arrêté, ou la confirmation « oui » n’a pas été envoyée | Terminal B, puis reformuler la visite et confirmer. |
| `rasa: The term is not recognized` | Rasa n’est pas sur le PATH | Toujours préfixer avec `.\Test\rasa-env\Scripts\python.exe -m rasa`. |
| Erreur de version Python en installant Rasa dans `.venv` | Rasa 3.6 vise Python 3.8 à 3.10 | Garder Rasa dans `Test\rasa-env` (Python 3.9). |
| Le premier message médicament reste longtemps sans réponse | Construction de l’index Chroma | Attendre la fin. Les messages suivants sont plus courts. |
| CORS dans la console du navigateur | Page ouverte depuis une origine non listée | Utiliser `http://127.0.0.1:5173` ou `http://localhost:5173`. |
