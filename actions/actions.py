import os
import sqlite3
from datetime import datetime

from rasa_sdk import Action, Tracker
from rasa_sdk.executor import CollectingDispatcher

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "crm_data.db")


def _format_products(produit):
    if not produit:
        return "Aucun"
    if isinstance(produit, list):
        values = [str(item) for item in produit if item]
        return ", ".join(values) if values else "Aucun"
    return str(produit)


def _ensure_reports_table(conn):
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


class ActionStoreVisit(Action):
    def name(self) -> str:
        return "action_store_visit"

    def run(self, dispatcher: CollectingDispatcher, tracker: Tracker, domain):
        medecin = tracker.get_slot("medecin")
        date = tracker.get_slot("date")
        produit = tracker.get_slot("produit") or []
        products_label = _format_products(produit)

        if not medecin or not date:
            dispatcher.utter_message(text="Impossible d'enregistrer la visite : médecin ou date manquant.")
            return []

        medications = "" if products_label == "Aucun" else products_label
        try:
            with sqlite3.connect(DB_PATH) as conn:
                _ensure_reports_table(conn)
                conn.execute(
                    """
                    INSERT INTO visit_reports (
                        delegate_name, doctor_name, doctor_specialty, visit_date,
                        medications_discussed, notes, created_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        "Chatbot",
                        medecin,
                        "Non précisée",
                        date,
                        medications,
                        "Enregistrée depuis la conversation.",
                        datetime.now().isoformat(timespec="seconds"),
                    ),
                )
        except sqlite3.Error:
            dispatcher.utter_message(text="La visite a été comprise, mais l'enregistrement a échoué.")
            return []

        dispatcher.utter_message(
            text=(
                f"Visite enregistrée : Médecin = {medecin}, "
                f"Date = {date}, Produits = {products_label}"
            )
        )
        return []


class ActionGenerateReport(Action):
    def name(self) -> str:
        return "action_generate_report"

    def run(self, dispatcher: CollectingDispatcher, tracker: Tracker, domain):
        latest = {}
        for event in tracker.events:
            if event.get("event") != "slot":
                continue
            slot_name = event.get("name")
            slot_value = event.get("value")
            if slot_name in {"medecin", "date", "produit"} and slot_value:
                latest[slot_name] = slot_value

        report = "# Rapport de conversation\n\n"
        report += f"Date du rapport : {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n"
        report += "## Détails de la visite\n"

        if latest.get("medecin") and latest.get("date"):
            report += f"- Médecin : {latest['medecin']}\n"
            report += f"- Date : {latest['date']}\n"
            report += f"- Produits : {_format_products(latest.get('produit'))}\n"
        else:
            report += "Aucune visite complète enregistrée dans cette conversation."

        dispatcher.utter_message(text=report)
        return []
