"""HealthMate backend API tests (pytest)."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://fitness-care-hub.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ===== Root =====
class TestRoot:
    def test_root(self, client):
        r = client.get(f"{API}/", timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert "HealthMate" in data.get("message", "")


# ===== Symptoms =====
class TestSymptoms:
    def test_get_symptoms(self, client):
        r = client.get(f"{API}/symptoms", timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert "symptoms" in data
        assert isinstance(data["symptoms"], list)
        assert len(data["symptoms"]) > 10
        assert all(isinstance(x, str) for x in data["symptoms"])

    def test_check_symptoms_success(self, client):
        payload = {"symptoms": ["headache", "nausea", "sensitivity to light"]}
        r = client.post(f"{API}/symptoms/check", json=payload, timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert "results" in data
        assert "disclaimer" in data
        assert len(data["results"]) <= 5
        assert len(data["results"]) >= 1
        top = data["results"][0]
        for key in ["name", "match_score", "description", "recommendation", "specialist", "severity"]:
            assert key in top
        # Migraine should be a top hit
        names = [r["name"] for r in data["results"]]
        assert any("Migraine" in n for n in names)
        # sorted desc by score
        scores = [r["match_score"] for r in data["results"]]
        assert scores == sorted(scores, reverse=True)

    def test_check_symptoms_empty_returns_400(self, client):
        r = client.post(f"{API}/symptoms/check", json={"symptoms": []}, timeout=30)
        assert r.status_code == 400

    def test_check_symptoms_no_match(self, client):
        r = client.post(f"{API}/symptoms/check", json={"symptoms": ["unknown_xyz_symptom"]}, timeout=30)
        assert r.status_code == 200
        assert r.json()["results"] == []


# ===== Exercises =====
class TestExercises:
    def test_get_exercises(self, client):
        r = client.get(f"{API}/exercises", timeout=30)
        assert r.status_code == 200
        data = r.json()
        exs = data.get("exercises", [])
        assert len(exs) == 3
        ids = {e["id"] for e in exs}
        assert ids == {"push-up", "pull-up", "squat"}
        for e in exs:
            for key in ["name", "emoji", "description", "muscle_groups",
                       "difficulty", "calories_per_10_reps", "form_tips"]:
                assert key in e, f"Missing {key} in {e['id']}"

    def test_get_exercise_by_id(self, client):
        r = client.get(f"{API}/exercises/push-up", timeout=30)
        assert r.status_code == 200
        assert r.json()["id"] == "push-up"

    def test_get_exercise_invalid(self, client):
        r = client.get(f"{API}/exercises/nonexistent", timeout=30)
        assert r.status_code == 404


# ===== Workouts =====
class TestWorkouts:
    def test_log_and_list_workout(self, client):
        payload = {"exercise": "TEST_Push-Up", "reps": 15, "duration_seconds": 60}
        r = client.post(f"{API}/workouts", json=payload, timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert data["exercise"] == payload["exercise"]
        assert data["reps"] == 15
        assert data["duration_seconds"] == 60
        assert "id" in data
        assert "timestamp" in data

        # List and verify persistence
        r2 = client.get(f"{API}/workouts", timeout=30)
        assert r2.status_code == 200
        items = r2.json()
        assert isinstance(items, list)
        assert any(w["id"] == data["id"] for w in items)


# ===== Chat (Claude Sonnet 4.5 via Emergent LLM key) =====
class TestChat:
    session_id = f"test-session-{uuid.uuid4()}"

    def test_chat_send_and_history(self, client):
        payload = {
            "session_id": self.session_id,
            "message": "Give me one short tip to improve sleep.",
        }
        r = client.post(f"{API}/chat/send", json=payload, timeout=120)
        assert r.status_code == 200, f"Chat failed: {r.status_code} {r.text}"
        data = r.json()
        assert data["session_id"] == self.session_id
        assert isinstance(data["reply"], str)
        assert len(data["reply"].strip()) > 5

        # History
        r2 = client.get(f"{API}/chat/history/{self.session_id}", timeout=30)
        assert r2.status_code == 200
        hist = r2.json()
        assert hist["session_id"] == self.session_id
        msgs = hist["messages"]
        assert len(msgs) >= 2
        roles = [m["role"] for m in msgs]
        assert "user" in roles and "assistant" in roles
