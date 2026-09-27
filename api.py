from collections import Counter
from contextlib import asynccontextmanager
from datetime import datetime
import os
import sqlite3

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator
import pandas as pd
import requests

CHROMA_PATH = "chroma"
DATA_PATH = "data/medicine_data_tn.csv"
DB_PATH = "crm_data.db"
RASA_URL = os.environ.get("RASA_URL", "http://localhost:5005/webhooks/rest/webhook")
VISIT_KEYWORDS = ("médecin", "medecin", "rendez-vous", "rendezvous", "consultation")
MONTHS_FR = (
    "janv.", "févr.", "mars", "avr.", "mai", "juin",
    "juil.", "août", "sept.", "oct.", "nov.", "déc.",
)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1)
    sender: str = "user"

    @field_validator("message")
    @classmethod
    def message_not_blank(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Le message est vide")
        return cleaned


class ReportRequest(BaseModel):
    delegateName: str
    doctorName: str
    specialty: str
    visitDate: str
    medications: str
    notes: str = ""

    @field_validator("delegateName", "doctorName", "specialty", "visitDate", "medications")
    @classmethod
    def required_text(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Champ obligatoire")
        return cleaned

    @field_validator("notes")
    @classmethod
    def clean_notes(cls, value: str) -> str:
        return (value or "").strip()


class LoginRequest(BaseModel):
    username: str
    password: str
    sender: str = "user"


def is_visit_query(query: str) -> bool:
    lowered = query.lower()
    return any(keyword in lowered for keyword in VISIT_KEYWORDS)


def get_embedding_function():
    from langchain_ollama import OllamaEmbeddings

    return OllamaEmbeddings(model="mistral")


def initialize_chroma():
    if not os.path.exists(CHROMA_PATH):
        if not os.path.exists(DATA_PATH):
            print(f"Warning: Data file {DATA_PATH} not found.")
            return None

        from langchain_chroma import Chroma
        from langchain_community.document_loaders import DataFrameLoader
        from langchain_text_splitters import RecursiveCharacterTextSplitter

        df = pd.read_csv(DATA_PATH)
        df["content"] = df.apply(
            lambda row: (
                f"Nom: {row.get('Name', 'N/A')}, DCI: {row.get('DCI', 'N/A')}, "
                f"Forme: {row.get('Forme', 'N/A')}, Dosage: {row.get('Dosage', 'N/A')}, "
                f"Prix: {row.get('Price', 'N/A')} DT, Indication: {row.get('Indication', 'N/A')}"
            ),
            axis=1,
        )

        documents = DataFrameLoader(df, page_content_column="content").load()
        text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=800,
            chunk_overlap=80,
            length_function=len,
            is_separator_regex=False,
        )
        chunks = text_splitter.split_documents(documents)

        for i, chunk in enumerate(chunks):
            chunk.metadata["id"] = f"med_{i}"
            chunk.metadata["source"] = "medicine_data_tn"

        Chroma.from_documents(
            documents=chunks,
            embedding=get_embedding_function(),
            persist_directory=CHROMA_PATH,
        )
        print("Base de données Chroma initialisée avec succès!")

    from langchain_chroma import Chroma

    return Chroma(persist_directory=CHROMA_PATH, embedding_function=get_embedding_function())


def initialize_sqlite():
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS visit_reports (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                delegate_name TEXT,
                doctor_name TEXT,
                doctor_specialty TEXT,
                visit_date TEXT,
                medications_discussed TEXT,
                notes TEXT,
                created_at TIMESTAMP
            )
            """
        )


def connect_db():
    return sqlite3.connect(DB_PATH)


def verify_token(authorization: str | None = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Token manquant ou invalide")
    token = authorization.split(" ", 1)[1]
    if token not in {"fake-jwt-123", "fake-jwt-456"}:
        raise HTTPException(status_code=403, detail="Accès non autorisé")
    return token


def split_medications(series) -> list[str]:
    medications = []
    for med_string in series.dropna():
        medications.extend(med.strip() for med in str(med_string).split(",") if med.strip())
    return medications


def format_month(timestamp) -> str:
    return f"{MONTHS_FR[timestamp.month - 1]} {timestamp.year}"


def build_markdown_report(df_reports: pd.DataFrame) -> str:
    if df_reports.empty:
        return "Aucun rapport de visite disponible pour générer un résumé."

    report = "# Rapport CRM Pharmaceutique\n\n"
    report += "## Résumé\n"
    report += f"- Total des visites: {len(df_reports)}\n"
    report += f"- Médecins uniques: {df_reports['doctor_name'].nunique()}\n"
    if not df_reports["doctor_specialty"].mode().empty:
        report += f"- Spécialité la plus commune: {df_reports['doctor_specialty'].mode().iloc[0]}\n\n"
    else:
        report += "\n"

    report += "## Insights sur les médicaments\n"
    medications_list = split_medications(df_reports["medications_discussed"])
    if medications_list:
        top_medications = Counter(medications_list).most_common(5)
        report += "Top 5 des médicaments discutés:\n"
        for med, count in top_medications:
            report += f"- {med}: {count} fois\n"
    else:
        report += "Aucun médicament enregistré.\n"

    report += "\n## Détails des visites médicales\n"
    for _, row in df_reports.iterrows():
        report += f"- **Médecin**: {row['doctor_name']} ({row['doctor_specialty']})\n"
        report += f"  - **Date**: {row['visit_date']}\n"
        report += f"  - **Médicaments**: {row['medications_discussed']}\n"
        report += f"  - **Notes**: {row['notes'] or '—'}\n\n"
    return report


def load_reports() -> pd.DataFrame:
    with connect_db() as conn:
        return pd.read_sql_query("SELECT * FROM visit_reports", conn)


def ask_rasa(message: str, sender: str) -> list[dict]:
    try:
        response = requests.post(
            RASA_URL,
            json={"sender": sender, "message": message},
            timeout=8,
        )
        response.raise_for_status()
        payload = response.json()
    except requests.RequestException:
        return [{
            "text": "Le service conversationnel est indisponible. Réessayez dans un instant.",
            "source": "error",
        }]

    if not payload:
        return [{"text": "Aucune réponse de Rasa.", "source": "rasa"}]

    first = payload[0] if isinstance(payload, list) else {}
    text = first.get("text") if isinstance(first, dict) else None
    return [{"text": text or "Réponse non textuelle.", "source": "rasa"}]


def ask_rag(query: str) -> list[dict]:
    try:
        db = initialize_chroma()
        if db is None:
            return [{
                "text": "La base médicaments n'est pas disponible pour le moment.",
                "source": "error",
            }]

        results = db.similarity_search_with_score(query, k=3)
        filtered_results = [(doc, score) for doc, score in results if score < 0.8]
        if not filtered_results:
            return [{
                "text": "Aucune information pertinente trouvée. Précisez le nom du médicament ou son indication.",
                "source": "rag",
            }]

        context_text = "\n\n---\n\n".join(doc.page_content for doc, _score in filtered_results)
        from langchain.prompts import PromptTemplate
        from langchain_community.llms import Ollama

        prompt_template = PromptTemplate.from_template(
            """
            Vous êtes un assistant CRM pharmaceutique. Fournissez des informations précises sur les médicaments basées sur le contexte suivant.
            Contexte: {context}
            Question: {question}
            Répondez de manière concise et professionnelle en français.
            """
        )
        prompt = prompt_template.format(context=context_text, question=query)
        response = Ollama(model="mistral").invoke(prompt)
        return [{"text": response, "source": "rag"}]
    except Exception:
        return [{
            "text": "La recherche médicament est momentanément indisponible.",
            "source": "error",
        }]


@asynccontextmanager
async def lifespan(_app: FastAPI):
    initialize_sqlite()
    yield


app = FastAPI(title="CRM Pharma Backend API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4173",
        "http://127.0.0.1:4173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/api/chat")
def chat_endpoint(req: ChatRequest):
    if is_visit_query(req.message):
        return ask_rasa(req.message, req.sender)
    return ask_rag(req.message)


@app.post("/api/reports", dependencies=[Depends(verify_token)])
def submit_report(req: ReportRequest):
    try:
        with connect_db() as conn:
            conn.execute(
                """
                INSERT INTO visit_reports (
                    delegate_name, doctor_name, doctor_specialty, visit_date,
                    medications_discussed, notes, created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    req.delegateName,
                    req.doctorName,
                    req.specialty,
                    req.visitDate,
                    req.medications,
                    req.notes,
                    datetime.now().isoformat(timespec="seconds"),
                ),
            )
        return {"status": "success", "message": "Rapport soumis avec succès"}
    except sqlite3.Error as exc:
        raise HTTPException(status_code=500, detail="Impossible d'enregistrer le rapport") from exc


@app.get("/api/reports/generate", dependencies=[Depends(verify_token)])
def generate_report():
    try:
        df_reports = load_reports()
    except (sqlite3.Error, pd.errors.DatabaseError) as exc:
        raise HTTPException(status_code=500, detail="Erreur de lecture des rapports") from exc
    return {"markdown": build_markdown_report(df_reports)}


@app.post("/api/login")
def login(req: LoginRequest):
    if req.username == "admin" and req.password == "1234":
        return {"status": "success", "token": "fake-jwt-123", "delegateName": "Admin Délégué"}
    if req.username == "user" and req.password == "test":
        return {"status": "success", "token": "fake-jwt-456", "delegateName": "Jean Dupont"}
    raise HTTPException(status_code=401, detail="Identifiants incorrects")


@app.get("/api/dashboard/stats", dependencies=[Depends(verify_token)])
def dashboard_stats():
    try:
        df = load_reports()
    except (sqlite3.Error, pd.errors.DatabaseError) as exc:
        raise HTTPException(status_code=500, detail="Erreur de lecture des statistiques") from exc

    if df.empty:
        return {
            "totalVisits": 0,
            "uniqueDoctors": 0,
            "medicationMentions": 0,
            "topSpecialties": [],
            "topMedications": [],
            "monthlyVisits": [],
        }

    specialties_counts = df["doctor_specialty"].value_counts().reset_index()
    specialties_counts.columns = ["name", "value"]

    med_counter = Counter(split_medications(df["medications_discussed"]))
    top_medications = [{"name": name, "value": count} for name, count in med_counter.most_common(5)]

    dated = df.copy()
    dated["visit_date"] = pd.to_datetime(dated["visit_date"], errors="coerce")
    dated = dated.dropna(subset=["visit_date"])
    monthly_visits = []
    if not dated.empty:
        dated["month_key"] = dated["visit_date"].dt.to_period("M")
        monthly_counts = (
            dated.groupby("month_key")
            .size()
            .reset_index(name="visits")
            .sort_values("month_key")
        )
        monthly_visits = [
            {"month": format_month(row.month_key.to_timestamp()), "visits": int(row.visits)}
            for row in monthly_counts.itertuples(index=False)
        ]

    return {
        "totalVisits": int(len(df)),
        "uniqueDoctors": int(df["doctor_name"].nunique()),
        "medicationMentions": int(sum(med_counter.values())),
        "topSpecialties": specialties_counts.head(5).to_dict("records"),
        "topMedications": top_medications,
        "monthlyVisits": monthly_visits,
    }
