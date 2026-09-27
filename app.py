import streamlit as st
import pandas as pd
import sqlite3
import os
from langchain_community.document_loaders import DataFrameLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_chroma import Chroma
from langchain.prompts import PromptTemplate
from langchain_community.llms import Ollama
from langchain_ollama import OllamaEmbeddings
from datetime import datetime
import requests

# Paths
CHROMA_PATH = "chroma"
DATA_PATH = "data/medicine_data_tn.csv"
DB_PATH = "crm_data.db"

# Embedding function
def get_embedding_function():
    return OllamaEmbeddings(model="mistral")

# Initialize Chroma database with medication data - SANS CACHE
def initialize_chroma():
    if not os.path.exists(CHROMA_PATH):
        if not os.path.exists(DATA_PATH):
            st.error(f"Le fichier {DATA_PATH} n'existe pas. Veuillez vérifier le chemin.")
            return None
            
        df = pd.read_csv(DATA_PATH)
        df['content'] = df.apply(lambda row: f"Nom: {row.get('Name', 'N/A')}, DCI: {row.get('DCI', 'N/A')}, Forme: {row.get('Forme', 'N/A')}, Dosage: {row.get('Dosage', 'N/A')}, Prix: {row.get('Price', 'N/A')} DT, Indication: {row.get('Indication', 'N/A')}", axis=1)
        
        documents = DataFrameLoader(df, page_content_column="content").load()
        text_splitter = RecursiveCharacterTextSplitter(chunk_size=800, chunk_overlap=80, length_function=len, is_separator_regex=False)
        chunks = text_splitter.split_documents(documents)
        
        for i, chunk in enumerate(chunks):
            chunk.metadata["id"] = f"med_{i}"
            chunk.metadata["source"] = "medicine_data_tn"
        
        Chroma.from_documents(documents=chunks, embedding=get_embedding_function(), persist_directory=CHROMA_PATH)
        st.success("Base de données Chroma initialisée avec succès!")
    
    return Chroma(persist_directory=CHROMA_PATH, embedding_function=get_embedding_function())

# Initialize SQLite database for CRM reports
def initialize_sqlite():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
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
    """)
    conn.commit()
    conn.close()

# Submit a visit report
def submit_report(delegate_name, doctor_name, doctor_specialty, visit_date, medications, notes):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO visit_reports (delegate_name, doctor_name, doctor_specialty, visit_date, medications_discussed, notes, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (delegate_name, doctor_name, doctor_specialty, visit_date, medications, notes, datetime.now()))
    conn.commit()
    conn.close()

# Query Rasa API
def query_rasa(message):
    url = "http://localhost:5005/webhooks/rest/webhook"
    payload = {"sender": "user", "message": message}
    try:
        response = requests.post(url, json=payload, timeout=8)
        response.raise_for_status()
        payload_json = response.json()
    except requests.RequestException:
        return "Le service Rasa est indisponible."
    if not payload_json:
        return "Aucune réponse de Rasa."
    first = payload_json[0] if isinstance(payload_json, list) else {}
    return first.get("text") or "Réponse non textuelle."

# Query RAG system
def query_rag(query_text):
    try:
        db = initialize_chroma()
        if db is None:
            return "Erreur lors de l'initialisation de la base de données.", []
            
        results = db.similarity_search_with_score(query_text, k=3)
        if not results:
            return "Aucune information pertinente trouvée. Veuillez essayer une requête plus spécifique.", []
        
        filtered_results = [(doc, score) for doc, score in results if score < 0.8]
        if not filtered_results:
            return "Aucune information pertinente trouvée. Veuillez essayer une requête plus spécifique.", []
        
        context_text = "\n\n---\n\n".join([doc.page_content for doc, _score in filtered_results])
        sources = [doc.metadata.get("id", "unknown") for doc, _score in filtered_results]

        prompt_template = PromptTemplate.from_template("""
            Vous êtes un assistant CRM pharmaceutique. Fournissez des informations précises sur les médicaments basées sur le contexte suivant.

            Contexte: {context}

            Question: {question}

            Répondez de manière concise et professionnelle en français.
        """)
        
        prompt = prompt_template.format(context=context_text, question=query_text)
        model = Ollama(model="mistral")
        response = model.invoke(prompt)
        return response, sources
    except Exception:
        return "La recherche médicament est momentanément indisponible.", []

# Generate sample report
def generate_sample_report():
    conn = sqlite3.connect(DB_PATH)
    try:
        df_reports = pd.read_sql_query("SELECT * FROM visit_reports", conn)
    except:
        return "Erreur lors de la lecture des rapports."
    finally:
        conn.close()

    if df_reports.empty:
        return "Aucun rapport de visite disponible pour générer un résumé."

    report = "# Rapport CRM Pharmaceutique\n\n"
    report += "## Résumé\n"
    report += f"- Total des visites: {len(df_reports)}\n"
    report += f"- Médecins uniques: {df_reports['doctor_name'].nunique()}\n"
    if not df_reports['doctor_specialty'].mode().empty:
        report += f"- Spécialité la plus commune: {df_reports['doctor_specialty'].mode()[0]}\n\n"

    report += "## Insights sur les médicaments\n"
    medications_list = []
    for med_string in df_reports['medications_discussed'].dropna():
        medications_list.extend([med.strip() for med in med_string.split(",")])
    
    if medications_list:
        from collections import Counter
        medication_counts = Counter(medications_list)
        top_medications = medication_counts.most_common(5)
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
        report += f"  - **Notes**: {row['notes']}\n\n"

    return report

# Streamlit UI
st.set_page_config(page_title="CRM Pharmaceutique", page_icon="💊", layout="wide")
st.title("💊 CRM Pharmaceutique avec Chatbot")

# Initialize databases
initialize_sqlite()

# Sidebar for navigation
st.sidebar.header("🧭 Navigation")
page = st.sidebar.radio("Sélectionnez une page", ["📝 Soumettre un rapport", "🤖 Chatbot", "📊 Générer un rapport"])

if page == "📝 Soumettre un rapport":
    st.header("📝 Soumettre un rapport de visite")
    col1, col2 = st.columns(2)
    with col1:
        with st.form("visit_form"):
            delegate_name = st.text_input("👤 Nom du délégué")
            doctor_name = st.text_input("👨‍⚕️ Nom du médecin")
            doctor_specialty = st.selectbox("🏥 Spécialité du médecin", ["Cardiologie", "Médecine générale", "Endocrinologie", "Pneumologie", "Neurologie", "Rhumatologie", "Autre"])
            visit_date = st.date_input("📅 Date de visite")
            medications = st.text_input("💊 Médicaments discutés (séparés par des virgules)")
            notes = st.text_area("📋 Notes")
            submitted = st.form_submit_button("✅ Soumettre", use_container_width=True)
            if submitted:
                if delegate_name and doctor_name and medications:
                    submit_report(delegate_name, doctor_name, doctor_specialty, str(visit_date), medications, notes)
                    st.success("✅ Rapport soumis avec succès!")
                else:
                    st.error("⚠️ Veuillez remplir tous les champs obligatoires.")
    with col2:
        st.info("ℹ️ **Instructions:**\n\n1. Remplissez tous les champs obligatoires\n2. Séparez les médicaments par des virgules\n3. Ajoutez des notes détaillées sur la visite\n4. Cliquez sur 'Soumettre' pour enregistrer")

elif page == "🤖 Chatbot":
    st.header("🤖 Chatbot: Recherche sur les médicaments et gestion des visites")
    st.info("💡 **Exemples de questions:**\n\n• Quels sont les effets secondaires du Doliprane ?\n• Prix du Glucophage en Tunisie\n• Je veux voir un médecin Dr. Dupont le 20 juillet")
    
    query = st.text_input("🔍 Posez votre question ou décrivez une visite:", placeholder="Ex: Informations sur le Doliprane ou Je veux voir un médecin")
    
    if query:
        with st.spinner("🔍 Recherche en cours..."):
            # Vérifier si la requête semble liée à une visite (contient "médecin" ou "rendez-vous")
            if any(keyword in query.lower() for keyword in ["médecin", "rendez-vous", "consultation"]):
                rasa_response = query_rasa(query)
                st.write("**🤖 Réponse Rasa:**")
                st.write(rasa_response)
            else:
                rag_response, sources = query_rag(query)
                st.write("**🤖 Réponse:**")
                st.write(rag_response)
                if sources:
                    st.write("**📚 Sources:**")
                    for source in sources:
                        st.write(f"- {source}")

elif page == "📊 Générer un rapport":
    st.header("📊 Générer un rapport d'analyse")
    col1, col2 = st.columns([1, 2])
    with col1:
        if st.button("📈 Générer le rapport", use_container_width=True):
            with st.spinner("📊 Génération du rapport..."):
                report = generate_sample_report()
            st.success("✅ Rapport généré avec succès!")
            st.download_button(label="💾 Télécharger le rapport", data=report, file_name=f"rapport_crm_{datetime.now().strftime('%Y%m%d_%H%M%S')}.md", mime="text/markdown", use_container_width=True)
    with col2:
        st.info("ℹ️ **Le rapport contient:**\n\n• Résumé des visites effectuées\n• Statistiques sur les médecins visités\n• Analyse des médicaments discutés\n• Détails de chaque visite")

# Footer
st.markdown("---")
st.markdown("💊 **CRM Pharmaceutique** - Développé avec Streamlit et LangChain")
