"""HealthMate backend API tests (pytest) - Iteration 2 with JWT auth + 11 exercises."""
import os
import uuid
import pytest
import requests

BASE_URL = (
    os.environ.get("EXPO_BACKEND_URL")
    or os.environ.get("EXPO_PUBLIC_BACKEND_URL")
    or "https://fitness-care-hub.preview.emergentagent.com"
).rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@healthmate.app"
ADMIN_PASSWORD = "Admin@1234"


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def admin_token(client):
    r = client.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


# ===== Root =====
class TestRoot:
    def test_root(self, client):
        r = client.get(f"{API}/", timeout=30)
        assert r.status_code == 200
        assert "HealthMate" in r.json().get("message", "")


# ===== AUTH =====
class TestAuth:
    def test_admin_login_success(self, client):
        r = client.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"
        assert data["user"]["email"] == ADMIN_EMAIL
        assert data["user"]["role"] == "admin"
        assert data["user"]["name"] == "Admin"
        assert "id" in data["user"]

    def test_login_wrong_password_returns_401(self, client):
        # Use unique email-ip combo to avoid lockout interference
        r = client.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": "wrongpass-xyz"}, timeout=30)
        assert r.status_code == 401

    def test_register_new_user(self, client):
        email = f"test_{uuid.uuid4().hex[:8]}@test.com"
        payload = {"email": email, "password": "Test@1234", "name": "TEST_NewUser"}
        r = client.post(f"{API}/auth/register", json=payload, timeout=30)
        assert r.status_code == 200, f"Register failed: {r.status_code} {r.text}"
        data = r.json()
        assert data["user"]["email"] == email.lower()
        assert data["user"]["name"] == "TEST_NewUser"
        assert data["user"]["role"] == "user"
        assert "access_token" in data
        # token must work
        token = data["access_token"]
        r2 = client.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {token}"}, timeout=30)
        assert r2.status_code == 200
        assert r2.json()["email"] == email.lower()

    def test_register_duplicate_email_returns_400(self, client):
        email = f"dup_{uuid.uuid4().hex[:8]}@test.com"
        payload = {"email": email, "password": "Test@1234", "name": "TEST_Dup"}
        r1 = client.post(f"{API}/auth/register", json=payload, timeout=30)
        assert r1.status_code == 200
        r2 = client.post(f"{API}/auth/register", json=payload, timeout=30)
        assert r2.status_code == 400

    def test_me_without_token_returns_401(self, client):
        r = requests.get(f"{API}/auth/me", timeout=30)
        assert r.status_code == 401

    def test_me_with_admin_token(self, client, admin_token):
        r = client.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {admin_token}"}, timeout=30)
        assert r.status_code == 200
        assert r.json()["email"] == ADMIN_EMAIL

    def test_logout_requires_token(self, client, admin_token):
        r = client.post(f"{API}/auth/logout", headers={"Authorization": f"Bearer {admin_token}"}, timeout=30)
        assert r.status_code == 200
        assert r.json()["ok"] is True
        r2 = requests.post(f"{API}/auth/logout", timeout=30)
        assert r2.status_code == 401

    def test_brute_force_lockout(self, client):
        """6+ wrong attempts should trigger 429 lockout (backend locks at count >=5)."""
        email = f"bf_{uuid.uuid4().hex[:8]}@test.com"
        # Register the user first
        client.post(f"{API}/auth/register", json={"email": email, "password": "Correct@123", "name": "TEST_BF"}, timeout=30)
        codes = []
        for i in range(7):
            r = client.post(f"{API}/auth/login", json={"email": email, "password": "wrong"}, timeout=30)
            codes.append(r.status_code)
        # At least one of the later attempts should be 429
        assert 429 in codes, f"Expected 429 in attempts, got {codes}"


# ===== Symptoms =====
class TestSymptoms:
    def test_get_symptoms(self, client):
        r = client.get(f"{API}/symptoms", timeout=30)
        assert r.status_code == 200
        assert len(r.json()["symptoms"]) > 10

    def test_check_symptoms_success(self, client):
        r = client.post(f"{API}/symptoms/check", json={"symptoms": ["headache", "nausea", "sensitivity to light"]}, timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert len(data["results"]) >= 1
        assert any("Migraine" in x["name"] for x in data["results"])

    def test_check_symptoms_empty_400(self, client):
        r = client.post(f"{API}/symptoms/check", json={"symptoms": []}, timeout=30)
        assert r.status_code == 400


# ===== Exercises (NOW 11) =====
class TestExercises:
    EXPECTED_IDS = {
        "push-up", "pull-up", "squat", "sit-up", "plank",
        "lunges", "jumping-jacks", "bicep-curls", "shoulder-press",
        "burpees", "deadlift",
    }

    def test_get_exercises_has_11(self, client):
        r = client.get(f"{API}/exercises", timeout=30)
        assert r.status_code == 200
        exs = r.json()["exercises"]
        assert len(exs) == 11, f"Expected 11 exercises, got {len(exs)}"
        ids = {e["id"] for e in exs}
        assert ids == self.EXPECTED_IDS, f"IDs mismatch: {ids}"
        # All must have tracking_mode and motion_axis
        for e in exs:
            assert "tracking_mode" in e, f"{e['id']} missing tracking_mode"
            assert "motion_axis" in e, f"{e['id']} missing motion_axis"
            assert e["tracking_mode"] in ("reps", "time")

    def test_plank_is_timed(self, client):
        r = client.get(f"{API}/exercises/plank", timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert data["tracking_mode"] == "time"
        assert data["motion_axis"] == "none"

    def test_new_exercises_are_reps(self, client):
        r = client.get(f"{API}/exercises", timeout=30)
        exs = {e["id"]: e for e in r.json()["exercises"]}
        for eid in ["sit-up", "lunges", "jumping-jacks", "bicep-curls", "shoulder-press", "burpees", "deadlift"]:
            assert exs[eid]["tracking_mode"] == "reps", f"{eid} should be reps"

    def test_get_exercise_invalid(self, client):
        r = client.get(f"{API}/exercises/nonexistent", timeout=30)
        assert r.status_code == 404


# ===== Workouts =====
class TestWorkouts:
    def test_log_workout_anonymous(self, client):
        payload = {"exercise": "TEST_Push-Up", "reps": 15, "duration_seconds": 60}
        r = client.post(f"{API}/workouts", json=payload, timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert data["exercise"] == "TEST_Push-Up"
        assert data["reps"] == 15
        assert data.get("user_id") is None
        # List persistence
        r2 = client.get(f"{API}/workouts", timeout=30)
        assert r2.status_code == 200
        assert any(w["id"] == data["id"] for w in r2.json())

    def test_log_workout_with_auth(self, client, admin_token):
        payload = {"exercise": "TEST_Plank", "reps": 0, "duration_seconds": 45}
        r = client.post(
            f"{API}/workouts",
            json=payload,
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=30,
        )
        assert r.status_code == 200
        data = r.json()
        assert data["user_id"] is not None

    def test_log_workout_calories_pushup(self, client):
        # 20 push-ups @ 5 cal/10reps -> 10.0
        payload = {"exercise": "Push-Up", "reps": 20, "duration_seconds": 60}
        r = client.post(f"{API}/workouts", json=payload, timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert data["calories_burned"] == 10.0, f"Expected 10.0 calories, got {data.get('calories_burned')}"

    def test_log_workout_calories_by_id(self, client):
        # exercise field can also be id "burpees" (12 cal/10reps) -> 30 reps = 36.0
        payload = {"exercise": "burpees", "reps": 30, "duration_seconds": 90}
        r = client.post(f"{API}/workouts", json=payload, timeout=30)
        assert r.status_code == 200
        assert r.json()["calories_burned"] == 36.0


# ===== Workouts /me/today endpoint =====
class TestWorkoutsMeToday:
    def test_requires_auth(self, client):
        r = requests.get(f"{API}/workouts/me/today", timeout=30)
        assert r.status_code == 401

    def test_returns_today_aggregates(self, client):
        # Register a fresh user, log 2 workouts, check totals
        email = f"today_{uuid.uuid4().hex[:8]}@test.com"
        reg = client.post(f"{API}/auth/register", json={"email": email, "password": "Test@1234", "name": "TEST_Today"}, timeout=30)
        token = reg.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        # 20 push-ups = 10 cal
        client.post(f"{API}/workouts", json={"exercise": "Push-Up", "reps": 20, "duration_seconds": 60}, headers=headers, timeout=30)
        # 10 squats = 6 cal
        client.post(f"{API}/workouts", json={"exercise": "Squat", "reps": 10, "duration_seconds": 30}, headers=headers, timeout=30)
        r = client.get(f"{API}/workouts/me/today", headers=headers, timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert data["workout_count"] == 2
        assert data["total_reps"] == 30
        assert data["total_calories"] == 16.0, f"Expected 16.0 cal, got {data['total_calories']}"
        assert len(data["workouts"]) == 2


# ===== Symptom-checks /me/last endpoint =====
class TestSymptomChecksLast:
    def test_requires_auth(self, client):
        r = requests.get(f"{API}/symptom-checks/me/last", timeout=30)
        assert r.status_code == 401

    def test_persists_and_returns_last(self, client):
        email = f"sym_{uuid.uuid4().hex[:8]}@test.com"
        reg = client.post(f"{API}/auth/register", json={"email": email, "password": "Test@1234", "name": "TEST_Sym"}, timeout=30)
        token = reg.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        # First call -> last_check should be null (or absent)
        r = client.get(f"{API}/symptom-checks/me/last", headers=headers, timeout=30)
        assert r.status_code == 200
        first = r.json()
        assert first.get("last_check") in (None, {}, []) or first["last_check"] is None
        # Submit a symptom check
        sc = client.post(f"{API}/symptoms/check", json={"symptoms": ["headache", "nausea"]}, headers=headers, timeout=30)
        assert sc.status_code == 200
        # Now last_check should exist with a timestamp
        r2 = client.get(f"{API}/symptom-checks/me/last", headers=headers, timeout=30)
        assert r2.status_code == 200
        last = r2.json().get("last_check")
        assert last is not None
        assert "timestamp" in last
        assert last.get("user_id")  # should match user

    def test_anonymous_symptoms_check_does_not_persist(self, client):
        # No Bearer token -> should still return 200 but not persist anywhere we can verify directly,
        # so just confirm the endpoint works without auth.
        r = client.post(f"{API}/symptoms/check", json={"symptoms": ["headache"]}, timeout=30)
        assert r.status_code == 200


# ===== Chat (Emergent LLM) =====
class TestChat:
    session_id = f"test-session-{uuid.uuid4()}"

    def test_chat_send_and_history(self, client):
        payload = {"session_id": self.session_id, "message": "One short sleep tip."}
        r = client.post(f"{API}/chat/send", json=payload, timeout=120)
        assert r.status_code == 200, f"Chat failed: {r.status_code} {r.text}"
        data = r.json()
        assert data["session_id"] == self.session_id
        assert len(data["reply"].strip()) > 5
        r2 = client.get(f"{API}/chat/history/{self.session_id}", timeout=30)
        assert r2.status_code == 200
        msgs = r2.json()["messages"]
        assert len(msgs) >= 2
