from rasa_sdk import Action, Tracker
from rasa_sdk.executor import CollectingDispatcher
from datetime import datetime

class ActionStoreVisit(Action):
    def name(self) -> str:
        return "action_store_visit"

    def run(self, dispatcher: CollectingDispatcher, tracker: Tracker, domain):
        medecin = tracker.get_slot("medecin")
        date = tracker.get_slot("date")
        produit = tracker.get_slot("produit") or []

        if medecin and date:
            message = f"Visite enregistrée : Médecin = {medecin}, Date = {date}, Produits = {', '.join(produit) if produit else 'Aucun'}"
            dispatcher.utter_message(text=message)
        else:
            dispatcher.utter_message(text="Impossible d'enregistrer la visite : données manquantes.")
        return []

class ActionGenerateReport(Action):
    def name(self) -> str:
        return "action_generate_report"

    def run(self, dispatcher: CollectingDispatcher, tracker: Tracker, domain):
        # Récupérer les événements de la conversation
        events = tracker.events

        # Filtrer les slots définis
        report = "# Rapport de Conversation\n\n"
        report += f"Date du rapport : {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n"
        report += "## Détails des visites\n"

        for event in events:
            if event.get("event") == "slot":
                slot_name = event.get("name")
                slot_value = event.get("value")
                if slot_name in ["medecin", "date", "produit"] and slot_value:
                    report += f"- {slot_name.capitalize()} : {slot_value}\n"

        if "medecin" not in [e.get("name") for e in events if e.get("event") == "slot"] or \
           "date" not in [e.get("name") for e in events if e.get("event") == "slot"]:
            report += "\nAucune visite complète enregistrée dans cette conversation."

        dispatcher.utter_message(text=report)
        return []