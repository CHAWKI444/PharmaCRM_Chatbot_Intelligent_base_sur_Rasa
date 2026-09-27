import api
from fastapi.testclient import TestClient


def _report(doctor="Dr. Martin", specialty="Cardiologie", visit_date="2024-01-15", medications="Doliprane, Glucophage"):
    return {
        "delegateName": "Admin Délégué",
        "doctorName": doctor,
        "specialty": specialty,
        "visitDate": visit_date,
        "medications": medications,
        "notes": "Visite de suivi",
    }


def test_login_and_protected_routes(tmp_path, monkeypatch):
    monkeypatch.setattr(api, "DB_PATH", str(tmp_path / "crm.db"))
    with TestClient(api.app) as client:
        denied = client.get("/api/dashboard/stats")
        assert denied.status_code == 401

        bad = client.post("/api/login", json={"username": "admin", "password": "wrong"})
        assert bad.status_code == 401
        assert "1234" not in bad.json()["detail"]

        ok = client.post("/api/login", json={"username": "admin", "password": "1234"})
        assert ok.status_code == 200
        token = ok.json()["token"]
        headers = {"Authorization": f"Bearer {token}"}

        forbidden = client.get("/api/dashboard/stats", headers={"Authorization": "Bearer nope"})
        assert forbidden.status_code == 403

        empty = client.get("/api/dashboard/stats", headers=headers)
        assert empty.status_code == 200
        assert empty.json()["totalVisits"] == 0

        invalid = client.post("/api/reports", headers=headers, json=_report(doctor="  ", medications=" "))
        assert invalid.status_code == 422

        created = client.post("/api/reports", headers=headers, json=_report())
        assert created.status_code == 200

        client.post(
            "/api/reports",
            headers=headers,
            json=_report(
                doctor="Dr. Bernard",
                specialty="Neurologie",
                visit_date="2024-12-02",
                medications="Doliprane, , Aspirine",
            ),
        )

        stats = client.get("/api/dashboard/stats", headers=headers).json()
        assert stats["totalVisits"] == 2
        assert stats["uniqueDoctors"] == 2
        assert stats["medicationMentions"] == 4
        assert stats["topMedications"][0]["name"] == "Doliprane"
        assert [row["month"] for row in stats["monthlyVisits"]] == ["janv. 2024", "déc. 2024"]

        report = client.get("/api/reports/generate", headers=headers).json()["markdown"]
        assert "Dr. Martin" in report
        assert "Doliprane: 2 fois" in report


def test_chat_routes_visits_to_rasa_and_hides_connection_errors(tmp_path, monkeypatch):
    monkeypatch.setattr(api, "DB_PATH", str(tmp_path / "crm.db"))
    monkeypatch.setattr(api, "CHROMA_PATH", str(tmp_path / "chroma"))

    def explode(*_args, **_kwargs):
        raise api.requests.ConnectionError("offline")

    monkeypatch.setattr(api.requests, "post", explode)
    with TestClient(api.app) as client:
        response = client.post("/api/chat", json={"message": "Je veux voir un medecin demain"})
        assert response.status_code == 200
        body = response.json()[0]
        assert body["source"] == "error"
        assert "ConnectionError" not in body["text"]

        blank = client.post("/api/chat", json={"message": "   "})
        assert blank.status_code == 422


def test_chat_reports_missing_medication_index(tmp_path, monkeypatch):
    monkeypatch.setattr(api, "DB_PATH", str(tmp_path / "crm.db"))
    monkeypatch.setattr(api, "CHROMA_PATH", str(tmp_path / "absent"))
    monkeypatch.setattr(api, "DATA_PATH", str(tmp_path / "missing.csv"))
    with TestClient(api.app) as client:
        response = client.post("/api/chat", json={"message": "Prix du Glucophage"})
        assert response.status_code == 200
        assert response.json()[0]["source"] == "error"
