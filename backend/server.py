from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import logging
import uuid
from datetime import datetime, timezone, timedelta
from typing import List, Optional

import bcrypt
import jwt
from fastapi import FastAPI, APIRouter, HTTPException, Request, Depends
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr

from emergentintegrations.llm.chat import LlmChat, UserMessage


# ==================== CONFIG ====================
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')
JWT_SECRET = os.environ.get('JWT_SECRET', 'dev-secret-change-me')
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_DAYS = 7
ADMIN_EMAIL = os.environ.get('ADMIN_EMAIL', 'admin@healthmate.app')
ADMIN_PASSWORD = os.environ.get('ADMIN_PASSWORD', 'Admin@1234')

# Configure logging early
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = FastAPI(title="HealthMate API")
api_router = APIRouter(prefix="/api")


# ==================== AUTH HELPERS ====================
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_access_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(days=ACCESS_TOKEN_DAYS),
        "type": "access",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


async def get_current_user(request: Request) -> dict:
    auth_header = request.headers.get("Authorization", "")
    token: Optional[str] = None
    if auth_header.startswith("Bearer "):
        token = auth_header[7:].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


def client_ip(request: Request) -> str:
    # Behind K8s ingress / proxy — use X-Forwarded-For first IP
    xff = request.headers.get("x-forwarded-for", "") or request.headers.get("X-Forwarded-For", "")
    if xff:
        first = xff.split(",")[0].strip()
        if first:
            return first
    real_ip = request.headers.get("x-real-ip", "")
    if real_ip:
        return real_ip.strip()
    return request.client.host if request.client else "unknown"


# ==================== MODELS ====================
class StatusCheck(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class StatusCheckCreate(BaseModel):
    client_name: str


# ---- Auth ----
class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=100)
    name: str = Field(min_length=1, max_length=80)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserPublic(BaseModel):
    id: str
    email: str
    name: str
    role: str
    created_at: datetime


class AuthResponse(BaseModel):
    user: UserPublic
    access_token: str
    token_type: str = "bearer"


# ---- Symptoms ----
class SymptomCheckRequest(BaseModel):
    symptoms: List[str]


class Disease(BaseModel):
    name: str
    match_score: float
    description: str
    recommendation: str
    specialist: str
    severity: str


class SymptomCheckResponse(BaseModel):
    results: List[Disease]
    disclaimer: str


# ---- Chat ----
class ChatRequest(BaseModel):
    session_id: str
    message: str


class ChatResponse(BaseModel):
    session_id: str
    reply: str


# ---- Workouts ----
class WorkoutLog(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: Optional[str] = None
    exercise: str
    reps: int
    duration_seconds: int
    calories_burned: float = 0.0
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class WorkoutLogCreate(BaseModel):
    exercise: str
    reps: int
    duration_seconds: int


# ==================== DATA: SYMPTOMS + EXERCISES ====================
SYMPTOM_DISEASE_DB = [
    {"name": "Common Cold", "symptoms": ["runny nose", "sneezing", "sore throat", "cough", "mild fever", "congestion", "headache"], "description": "A viral infection of the nose and throat (upper respiratory tract).", "recommendation": "Rest, stay hydrated, take over-the-counter cold medicine. Usually resolves in 7-10 days.", "specialist": "General Physician", "severity": "mild"},
    {"name": "Influenza (Flu)", "symptoms": ["high fever", "chills", "body aches", "fatigue", "cough", "headache", "sore throat", "muscle pain"], "description": "A contagious respiratory illness caused by influenza viruses.", "recommendation": "Rest, plenty of fluids, antiviral medications if prescribed within 48 hours. See a doctor if symptoms worsen.", "specialist": "General Physician", "severity": "moderate"},
    {"name": "Migraine", "symptoms": ["headache", "nausea", "vomiting", "sensitivity to light", "sensitivity to sound", "blurred vision"], "description": "A neurological condition causing severe throbbing pain, usually on one side of the head.", "recommendation": "Rest in a quiet, dark room. Take prescribed migraine medication. Track triggers.", "specialist": "Neurologist", "severity": "moderate"},
    {"name": "Tension Headache", "symptoms": ["headache", "neck stiffness", "fatigue", "difficulty concentrating", "muscle pain"], "description": "A common type of headache often caused by stress, poor posture, or eye strain.", "recommendation": "Rest, hydrate, gentle neck stretches, OTC pain relievers. Address stress and posture.", "specialist": "General Physician", "severity": "mild"},
    {"name": "Gastroenteritis", "symptoms": ["nausea", "vomiting", "diarrhea", "abdominal pain", "mild fever", "dehydration", "loss of appetite"], "description": "Inflammation of the stomach and intestines, often from a viral or bacterial infection.", "recommendation": "Drink oral rehydration solutions, eat bland foods, rest. See a doctor if symptoms persist >48 hrs.", "specialist": "Gastroenterologist", "severity": "moderate"},
    {"name": "Acid Reflux (GERD)", "symptoms": ["heartburn", "chest pain", "sour taste", "difficulty swallowing", "cough", "nausea"], "description": "Stomach acid frequently flows back into the esophagus, irritating its lining.", "recommendation": "Avoid spicy/fatty foods, eat smaller meals, don't lie down right after eating, OTC antacids.", "specialist": "Gastroenterologist", "severity": "mild"},
    {"name": "Seasonal Allergies", "symptoms": ["sneezing", "runny nose", "itchy eyes", "congestion", "watery eyes", "itchy throat", "rash"], "description": "An allergic response to airborne substances like pollen or dust.", "recommendation": "Antihistamines, nasal sprays, and avoiding allergens. Consult an allergist for testing.", "specialist": "Allergist / Immunologist", "severity": "mild"},
    {"name": "Asthma", "symptoms": ["shortness of breath", "wheezing", "chest tightness", "cough", "difficulty breathing"], "description": "A chronic condition where the airways narrow and swell, making breathing difficult.", "recommendation": "Use prescribed inhalers, avoid triggers. Seek emergency care for severe attacks.", "specialist": "Pulmonologist", "severity": "moderate"},
    {"name": "Bronchitis", "symptoms": ["cough", "mucus production", "chest discomfort", "fatigue", "shortness of breath", "mild fever"], "description": "Inflammation of the lining of the bronchial tubes that carry air to and from the lungs.", "recommendation": "Rest, fluids, humidifier, OTC cough medicine. See a doctor if cough lasts >3 weeks.", "specialist": "Pulmonologist", "severity": "moderate"},
    {"name": "Hypertension (High Blood Pressure)", "symptoms": ["headache", "dizziness", "blurred vision", "chest pain", "shortness of breath", "fatigue", "rapid heartbeat"], "description": "A common condition where the long-term force of blood against artery walls is too high.", "recommendation": "Regular BP monitoring, reduce salt, exercise, take prescribed medication. See cardiologist.", "specialist": "Cardiologist", "severity": "moderate"},
    {"name": "Diabetes (Type 2)", "symptoms": ["frequent urination", "increased thirst", "fatigue", "blurred vision", "weight loss", "slow healing", "tingling hands"], "description": "A chronic condition affecting how your body processes blood sugar (glucose).", "recommendation": "Monitor blood sugar, healthy diet, regular exercise, prescribed medication. See endocrinologist.", "specialist": "Endocrinologist", "severity": "moderate"},
    {"name": "Hypothyroidism", "symptoms": ["fatigue", "weight gain", "cold sensitivity", "dry skin", "hair loss", "constipation", "depression"], "description": "An underactive thyroid gland that doesn't produce enough thyroid hormone.", "recommendation": "Blood test (TSH). Treatment is daily thyroid hormone replacement medication.", "specialist": "Endocrinologist", "severity": "moderate"},
    {"name": "Hyperthyroidism", "symptoms": ["weight loss", "rapid heartbeat", "sweating", "anxiety", "trembling", "insomnia", "heat sensitivity"], "description": "An overactive thyroid gland that produces too much thyroid hormone.", "recommendation": "Blood test, possibly antithyroid drugs, radioactive iodine, or surgery.", "specialist": "Endocrinologist", "severity": "moderate"},
    {"name": "Anxiety Disorder", "symptoms": ["restlessness", "fatigue", "difficulty concentrating", "rapid heartbeat", "sweating", "trembling", "insomnia", "anxiety"], "description": "A mental health condition characterized by excessive worry and fear.", "recommendation": "Therapy (CBT), stress management, medication if prescribed. Seek a mental health professional.", "specialist": "Psychiatrist / Psychologist", "severity": "moderate"},
    {"name": "Depression", "symptoms": ["depression", "fatigue", "loss of appetite", "insomnia", "difficulty concentrating", "weight loss", "weight gain"], "description": "A mood disorder causing persistent feelings of sadness and loss of interest.", "recommendation": "Therapy, lifestyle changes, antidepressants if prescribed. Talk to a mental health professional.", "specialist": "Psychiatrist / Psychologist", "severity": "moderate"},
    {"name": "Pneumonia", "symptoms": ["high fever", "cough", "chest pain", "shortness of breath", "fatigue", "chills", "difficulty breathing", "mucus production"], "description": "Infection that inflames air sacs in one or both lungs, which may fill with fluid.", "recommendation": "See a doctor immediately. Antibiotics or antivirals, rest, hydration. Hospitalization may be needed.", "specialist": "Pulmonologist", "severity": "severe"},
    {"name": "COVID-19", "symptoms": ["high fever", "cough", "loss of taste", "loss of smell", "fatigue", "body aches", "shortness of breath", "headache", "sore throat"], "description": "A respiratory illness caused by the SARS-CoV-2 virus.", "recommendation": "Isolate, rest, hydrate, monitor oxygen. Seek emergency care if breathing becomes difficult.", "specialist": "General Physician / Pulmonologist", "severity": "severe"},
    {"name": "Urinary Tract Infection (UTI)", "symptoms": ["frequent urination", "burning sensation", "cloudy urine", "pelvic pain", "abdominal pain", "lower back pain"], "description": "An infection in any part of the urinary system (kidneys, bladder, urethra).", "recommendation": "Antibiotics, drink plenty of water. See a doctor for diagnosis and prescription.", "specialist": "Urologist / General Physician", "severity": "mild"},
    {"name": "Kidney Stones", "symptoms": ["lower back pain", "abdominal pain", "nausea", "vomiting", "burning sensation", "cloudy urine", "frequent urination"], "description": "Hard deposits of minerals and salts that form inside the kidneys.", "recommendation": "Drink lots of water, pain medication, sometimes medical procedures to break or remove stones.", "specialist": "Urologist", "severity": "moderate"},
    {"name": "Anemia", "symptoms": ["fatigue", "weakness", "pale skin", "shortness of breath", "dizziness", "cold hands", "headache", "rapid heartbeat"], "description": "A condition where you lack enough healthy red blood cells to carry adequate oxygen.", "recommendation": "Iron-rich diet, supplements, treat underlying cause. Blood tests needed for diagnosis.", "specialist": "Hematologist / General Physician", "severity": "mild"},
    {"name": "Sinusitis", "symptoms": ["congestion", "facial pain", "headache", "runny nose", "cough", "fatigue", "loss of smell"], "description": "Inflammation of the sinuses, usually due to viral, bacterial, or allergic causes.", "recommendation": "Saline rinses, decongestants, warm compresses. See a doctor if symptoms persist >10 days.", "specialist": "ENT Specialist", "severity": "mild"},
    {"name": "Conjunctivitis (Pink Eye)", "symptoms": ["itchy eyes", "watery eyes", "redness", "discharge", "light sensitivity"], "description": "Inflammation of the membrane covering the white of the eye, often contagious.", "recommendation": "Cold compresses, artificial tears, avoid touching eyes. See a doctor for antibiotic drops if bacterial.", "specialist": "Ophthalmologist", "severity": "mild"},
    {"name": "Eczema (Atopic Dermatitis)", "symptoms": ["rash", "dry skin", "itching", "redness", "skin inflammation"], "description": "A chronic skin condition causing itchy, inflamed patches of skin.", "recommendation": "Moisturize regularly, avoid triggers, prescribed steroid creams. Consult a dermatologist.", "specialist": "Dermatologist", "severity": "mild"},
    {"name": "Iron Deficiency", "symptoms": ["fatigue", "pale skin", "weakness", "shortness of breath", "dizziness", "cold hands", "brittle nails"], "description": "Low iron levels in the blood, often a precursor to or form of anemia.", "recommendation": "Iron-rich foods, supplements (under medical supervision), investigate cause.", "specialist": "Hematologist / General Physician", "severity": "mild"},
    {"name": "Heart Disease", "symptoms": ["chest pain", "shortness of breath", "fatigue", "rapid heartbeat", "dizziness", "swelling in legs", "cold sweats"], "description": "A range of conditions affecting the heart, including coronary artery disease.", "recommendation": "Seek immediate care for chest pain. Heart-healthy diet, exercise, medication, regular cardiology checkups.", "specialist": "Cardiologist", "severity": "severe"},
    {"name": "Stroke (Warning Signs)", "symptoms": ["sudden weakness", "facial drooping", "slurred speech", "blurred vision", "severe headache", "dizziness", "confusion"], "description": "When blood supply to part of the brain is interrupted. THIS IS A MEDICAL EMERGENCY.", "recommendation": "CALL EMERGENCY SERVICES IMMEDIATELY. Time is critical for stroke treatment (FAST: Face, Arms, Speech, Time).", "specialist": "Emergency / Neurologist", "severity": "severe"},
    {"name": "Arthritis", "symptoms": ["joint pain", "stiffness", "swelling", "reduced range of motion", "fatigue", "muscle pain"], "description": "Inflammation of one or more joints, causing pain and stiffness.", "recommendation": "Physical therapy, anti-inflammatory medications, weight management, gentle exercise.", "specialist": "Rheumatologist", "severity": "moderate"},
    {"name": "Insomnia", "symptoms": ["insomnia", "fatigue", "difficulty concentrating", "depression", "anxiety", "headache"], "description": "Persistent difficulty falling asleep or staying asleep.", "recommendation": "Sleep hygiene, reduce screen time before bed, regular schedule. CBT-I therapy is highly effective.", "specialist": "Sleep Specialist / General Physician", "severity": "mild"},
    {"name": "Dehydration", "symptoms": ["dehydration", "fatigue", "dizziness", "headache", "dry skin", "rapid heartbeat", "loss of appetite"], "description": "Insufficient body fluids to perform normal functions.", "recommendation": "Drink water and electrolyte solutions. Severe dehydration may need IV fluids.", "specialist": "General Physician", "severity": "mild"},
]
ALL_SYMPTOMS = sorted(list({s for d in SYMPTOM_DISEASE_DB for s in d["symptoms"]}))


EXERCISES = [
    {"id": "push-up", "name": "Push-Up", "emoji": "💪", "description": "A conditioning exercise performed in a prone position by raising and lowering the body with the arms.", "muscle_groups": ["Chest", "Shoulders", "Triceps", "Core"], "difficulty": "Beginner", "calories_per_10_reps": 5, "tracking_mode": "reps", "motion_axis": "y", "form_tips": ["Keep your body in a straight line from head to heels.", "Lower your chest until it nearly touches the floor.", "Keep elbows at roughly 45° to your body.", "Engage your core throughout the movement.", "Breathe in on the way down, exhale on the push up."]},
    {"id": "pull-up", "name": "Pull-Up", "emoji": "🏋️", "description": "An upper-body strength exercise where you pull yourself up while suspended by your hands.", "muscle_groups": ["Back", "Biceps", "Shoulders"], "difficulty": "Advanced", "calories_per_10_reps": 10, "tracking_mode": "reps", "motion_axis": "y", "form_tips": ["Grip the bar with hands slightly wider than shoulder-width.", "Start from a dead hang with arms fully extended.", "Pull up until your chin clears the bar.", "Control the descent — don't drop down.", "Keep your core engaged, avoid swinging."]},
    {"id": "squat", "name": "Squat", "emoji": "🦵", "description": "A strength exercise that lowers the hips from standing and returns. Great for lower body.", "muscle_groups": ["Quads", "Glutes", "Hamstrings", "Core"], "difficulty": "Beginner", "calories_per_10_reps": 6, "tracking_mode": "reps", "motion_axis": "y", "form_tips": ["Stand with feet shoulder-width apart, toes slightly out.", "Lower hips back and down as if sitting in a chair.", "Keep your chest up and back straight.", "Knees should track over toes, not collapse inward.", "Go down until thighs are parallel to floor, then drive up."]},
    {"id": "sit-up", "name": "Sit-Up", "emoji": "🤸", "description": "A core exercise that lifts the torso from a supine position to train abdominals.", "muscle_groups": ["Abs", "Core", "Hip Flexors"], "difficulty": "Beginner", "calories_per_10_reps": 4, "tracking_mode": "reps", "motion_axis": "y", "form_tips": ["Lie on your back with knees bent, feet flat.", "Cross arms on chest or place hands behind head (no pulling neck).", "Lift your torso toward your knees by contracting abs.", "Lower slowly under control, don't collapse.", "Breathe out on the way up, in on the way down."]},
    {"id": "plank", "name": "Plank", "emoji": "🧘", "description": "An isometric core strength exercise held in a push-up-like position.", "muscle_groups": ["Core", "Shoulders", "Glutes", "Back"], "difficulty": "Beginner", "calories_per_10_reps": 3, "tracking_mode": "time", "motion_axis": "none", "form_tips": ["Forearms on the ground, elbows under shoulders.", "Body straight from head to heels — no sagging hips.", "Squeeze your glutes and core the whole time.", "Keep your neck neutral — look at the floor.", "Start with 20-30 seconds, build up to 1-2 minutes."]},
    {"id": "lunges", "name": "Lunges", "emoji": "🚶", "description": "A unilateral lower-body exercise stepping one leg forward and lowering the hips.", "muscle_groups": ["Quads", "Glutes", "Hamstrings", "Calves"], "difficulty": "Beginner", "calories_per_10_reps": 5, "tracking_mode": "reps", "motion_axis": "y", "form_tips": ["Step forward with one leg, lowering hips until both knees are ~90°.", "Front knee aligned over ankle, not past toes.", "Back knee hovers just above the floor.", "Push through the front heel to return to start.", "Alternate legs, keep torso upright."]},
    {"id": "jumping-jacks", "name": "Jumping Jacks", "emoji": "🤾", "description": "A classic full-body cardio exercise jumping limbs out and in.", "muscle_groups": ["Calves", "Shoulders", "Core", "Glutes"], "difficulty": "Beginner", "calories_per_10_reps": 6, "tracking_mode": "reps", "motion_axis": "xyz", "form_tips": ["Start standing tall, feet together, arms at sides.", "Jump feet out wide while raising arms overhead.", "Jump back to start position — that's 1 rep.", "Land softly on the balls of your feet.", "Keep a steady rhythm and breathe naturally."]},
    {"id": "bicep-curls", "name": "Bicep Curls", "emoji": "💪", "description": "An isolation exercise that flexes the elbow with a weight in hand to train biceps.", "muscle_groups": ["Biceps", "Forearms"], "difficulty": "Beginner", "calories_per_10_reps": 4, "tracking_mode": "reps", "motion_axis": "y", "form_tips": ["Stand tall, hold dumbbells at your sides, palms facing forward.", "Curl the weight up by bending only at the elbow.", "Squeeze biceps at the top.", "Lower slowly with control.", "Keep elbows tucked close to the body, no swinging."]},
    {"id": "shoulder-press", "name": "Shoulder Press", "emoji": "🏋️‍♀️", "description": "A compound upper-body push exercise pressing weights overhead.", "muscle_groups": ["Shoulders", "Triceps", "Upper Chest"], "difficulty": "Intermediate", "calories_per_10_reps": 6, "tracking_mode": "reps", "motion_axis": "y", "form_tips": ["Start with weights at shoulder height, palms forward.", "Press overhead until arms are straight.", "Don't arch your back — engage the core.", "Lower under control back to the start.", "Keep your head neutral, looking forward."]},
    {"id": "burpees", "name": "Burpees", "emoji": "🔥", "description": "A full-body high-intensity exercise combining a squat, push-up, and jump.", "muscle_groups": ["Full Body", "Cardio"], "difficulty": "Advanced", "calories_per_10_reps": 12, "tracking_mode": "reps", "motion_axis": "xyz", "form_tips": ["Drop into a squat, place hands on the floor.", "Jump feet back to a plank.", "Perform a push-up (optional for scaled version).", "Jump feet forward, then explode up with a jump.", "Stay controlled — quality over speed."]},
    {"id": "deadlift", "name": "Deadlift (Guide)", "emoji": "🏋", "description": "A fundamental compound lift to train the posterior chain. Strength training guide.", "muscle_groups": ["Hamstrings", "Glutes", "Back", "Core"], "difficulty": "Advanced", "calories_per_10_reps": 8, "tracking_mode": "reps", "motion_axis": "y", "form_tips": ["Feet hip-width, bar over mid-foot.", "Hinge at hips, grip the bar just outside the knees.", "Flat back, chest up, shoulders over the bar.", "Drive through the heels and extend hips and knees together.", "Lower the bar under control — don't round your back."]},
]


# ==================== ROUTES ====================
@api_router.get("/")
async def root():
    return {"message": "HealthMate API is running", "version": "2.0.0"}


@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    status_obj = StatusCheck(**input.dict())
    doc = status_obj.dict()
    doc["timestamp"] = doc["timestamp"].isoformat()
    await db.status_checks.insert_one(doc)
    return status_obj


@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    docs = await db.status_checks.find({}, {"_id": 0}).to_list(1000)
    return [StatusCheck(**sc) for sc in docs]


# -------- AUTH --------
@api_router.post("/auth/register", response_model=AuthResponse)
async def register(req: RegisterRequest):
    email = req.email.lower().strip()
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user_id = str(uuid.uuid4())
    user_doc = {
        "id": user_id,
        "email": email,
        "name": req.name.strip(),
        "password_hash": hash_password(req.password),
        "role": "user",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(user_doc)
    token = create_access_token(user_id, email)
    public_user = UserPublic(
        id=user_id,
        email=email,
        name=req.name.strip(),
        role="user",
        created_at=datetime.fromisoformat(user_doc["created_at"]),
    )
    return AuthResponse(user=public_user, access_token=token)


@api_router.post("/auth/login", response_model=AuthResponse)
async def login(req: LoginRequest, request: Request):
    email = req.email.lower().strip()
    ip = client_ip(request)
    identifier = f"{ip}:{email}"

    # brute force check
    now = datetime.now(timezone.utc)
    attempt = await db.login_attempts.find_one({"identifier": identifier})
    if attempt and attempt.get("count", 0) >= 5:
        locked_until = attempt.get("locked_until")
        if locked_until and isinstance(locked_until, str):
            locked_until_dt = datetime.fromisoformat(locked_until)
            if now < locked_until_dt:
                raise HTTPException(status_code=429, detail="Too many failed attempts. Try again in 15 minutes.")

    user = await db.users.find_one({"email": email})
    if not user or not verify_password(req.password, user.get("password_hash", "")):
        # increment failed attempt
        new_count = (attempt.get("count", 0) + 1) if attempt else 1
        update_doc = {"count": new_count, "updated_at": now.isoformat(), "identifier": identifier}
        if new_count >= 5:
            update_doc["locked_until"] = (now + timedelta(minutes=15)).isoformat()
        await db.login_attempts.update_one(
            {"identifier": identifier},
            {"$set": update_doc},
            upsert=True,
        )
        raise HTTPException(status_code=401, detail="Invalid email or password")

    # clear attempts
    await db.login_attempts.delete_one({"identifier": identifier})

    token = create_access_token(user["id"], user["email"])
    created_at = user.get("created_at")
    if isinstance(created_at, str):
        created_at = datetime.fromisoformat(created_at)
    public_user = UserPublic(
        id=user["id"],
        email=user["email"],
        name=user["name"],
        role=user.get("role", "user"),
        created_at=created_at or datetime.now(timezone.utc),
    )
    return AuthResponse(user=public_user, access_token=token)


@api_router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user


@api_router.post("/auth/logout")
async def logout(user: dict = Depends(get_current_user)):
    # Stateless JWT — client deletes token. Return OK.
    return {"ok": True}


# -------- SYMPTOMS --------
@api_router.get("/symptoms")
async def get_symptoms():
    return {"symptoms": ALL_SYMPTOMS}


@api_router.post("/symptoms/check", response_model=SymptomCheckResponse)
async def check_symptoms(request: SymptomCheckRequest, http_request: Request):
    if not request.symptoms:
        raise HTTPException(status_code=400, detail="Please select at least one symptom.")
    user_symptoms = {s.lower().strip() for s in request.symptoms}
    scored: List[Disease] = []
    for disease in SYMPTOM_DISEASE_DB:
        disease_syms = set(disease["symptoms"])
        matches = user_symptoms.intersection(disease_syms)
        if not matches:
            continue
        disease_coverage = len(matches) / len(disease_syms)
        user_coverage = len(matches) / len(user_symptoms)
        score = round((disease_coverage * 0.7 + user_coverage * 0.3) * 100, 1)
        scored.append(Disease(
            name=disease["name"],
            match_score=score,
            description=disease["description"],
            recommendation=disease["recommendation"],
            specialist=disease["specialist"],
            severity=disease["severity"],
        ))
    scored.sort(key=lambda d: d.match_score, reverse=True)
    top = scored[:5]

    # Persist for authenticated user
    user_id = None
    auth_header = http_request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        try:
            payload = jwt.decode(auth_header[7:].strip(), JWT_SECRET, algorithms=[JWT_ALGORITHM])
            user_id = payload.get("sub")
        except Exception:
            user_id = None
    if user_id:
        await db.symptom_checks.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "symptoms": list(user_symptoms),
            "top_results": [d.dict() for d in top],
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })

    return SymptomCheckResponse(
        results=top,
        disclaimer="This is an AI-assisted preliminary assessment, not a medical diagnosis. Please consult a qualified healthcare professional for proper diagnosis and treatment.",
    )


@api_router.get("/symptom-checks/me/last")
async def last_symptom_check(user: dict = Depends(get_current_user)):
    """Return the timestamp of the user's most recent symptom check (or null)."""
    doc = await db.symptom_checks.find_one(
        {"user_id": user["id"]},
        {"_id": 0},
        sort=[("timestamp", -1)],
    )
    return {"last_check": doc}


# -------- EXERCISES / WORKOUTS --------
@api_router.get("/exercises")
async def get_exercises():
    return {"exercises": EXERCISES}


@api_router.get("/exercises/{exercise_id}")
async def get_exercise(exercise_id: str):
    for ex in EXERCISES:
        if ex["id"] == exercise_id:
            return ex
    raise HTTPException(status_code=404, detail="Exercise not found")


@api_router.post("/workouts", response_model=WorkoutLog)
async def log_workout(input: WorkoutLogCreate, request: Request):
    # Optional auth — attach user_id if authenticated, else log anonymously
    user_id = None
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        try:
            payload = jwt.decode(auth_header[7:].strip(), JWT_SECRET, algorithms=[JWT_ALGORITHM])
            user_id = payload.get("sub")
        except Exception:
            user_id = None
    # compute calories from exercise definition
    cal_per_10 = 5
    for ex in EXERCISES:
        if ex["name"] == input.exercise or ex["id"] == input.exercise:
            cal_per_10 = ex["calories_per_10_reps"]
            break
    if input.reps > 0:
        calories = round(input.reps / 10 * cal_per_10, 1)
    else:
        # time-based: ~3 cal per minute
        calories = round(input.duration_seconds / 60 * 3, 1)
    wl = WorkoutLog(user_id=user_id, calories_burned=calories, **input.dict())
    doc = wl.dict()
    doc["timestamp"] = doc["timestamp"].isoformat()
    await db.workouts.insert_one(doc)
    return wl


@api_router.get("/workouts", response_model=List[WorkoutLog])
async def list_workouts(limit: int = 20):
    docs = await db.workouts.find({}, {"_id": 0}).sort("timestamp", -1).to_list(limit)
    results = []
    for d in docs:
        if isinstance(d.get("timestamp"), str):
            try:
                d["timestamp"] = datetime.fromisoformat(d["timestamp"])
            except Exception:
                d["timestamp"] = datetime.now(timezone.utc)
        results.append(WorkoutLog(**d))
    return results


@api_router.get("/workouts/me/today")
async def my_workouts_today(user: dict = Depends(get_current_user)):
    """Return today's workouts and total calories for the authenticated user."""
    now = datetime.now(timezone.utc)
    start_iso = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    docs = await db.workouts.find(
        {"user_id": user["id"], "timestamp": {"$gte": start_iso}},
        {"_id": 0},
    ).sort("timestamp", -1).to_list(200)
    total_calories = round(sum(d.get("calories_burned", 0) or 0 for d in docs), 1)
    total_reps = sum(d.get("reps", 0) or 0 for d in docs)
    return {
        "date": start_iso[:10],
        "workout_count": len(docs),
        "total_calories": total_calories,
        "total_reps": total_reps,
        "workouts": docs,
    }


@api_router.get("/workouts/me")
async def my_workouts(limit: int = 50, user: dict = Depends(get_current_user)):
    """All workouts for the authenticated user, most recent first."""
    docs = await db.workouts.find(
        {"user_id": user["id"]}, {"_id": 0}
    ).sort("timestamp", -1).to_list(limit)
    return {"workouts": docs}


@api_router.get("/symptom-checks/me")
async def my_symptom_checks(limit: int = 50, user: dict = Depends(get_current_user)):
    """All symptom checks for the authenticated user, most recent first."""
    docs = await db.symptom_checks.find(
        {"user_id": user["id"]}, {"_id": 0}
    ).sort("timestamp", -1).to_list(limit)
    return {"checks": docs}


@api_router.get("/chat/sessions/me")
async def my_chat_sessions(user: dict = Depends(get_current_user)):
    """List unique chat sessions for the authenticated user with last message preview."""
    pipeline = [
        {"$match": {"user_id": user["id"]}},
        {"$sort": {"timestamp": -1}},
        {"$group": {
            "_id": "$session_id",
            "last_message": {"$first": "$content"},
            "last_role": {"$first": "$role"},
            "last_at": {"$first": "$timestamp"},
            "count": {"$sum": 1},
        }},
        {"$sort": {"last_at": -1}},
        {"$limit": 50},
    ]
    sessions = []
    async for s in db.chat_messages.aggregate(pipeline):
        sessions.append({
            "session_id": s["_id"],
            "last_message": s.get("last_message", ""),
            "last_role": s.get("last_role", ""),
            "last_at": s.get("last_at", ""),
            "message_count": s.get("count", 0),
        })
    return {"sessions": sessions}


# -------- CHAT --------
HEALTH_SYSTEM_PROMPT = (
    "You are 'MediBot', a friendly, empathetic, and knowledgeable healthcare assistant. "
    "Your role is to provide general health information, wellness tips, lifestyle guidance, "
    "and explanations of medical topics in easy-to-understand language. "
    "Always remind users that your responses are for informational purposes only and do NOT "
    "replace professional medical advice, diagnosis, or treatment. If the user describes "
    "severe, emergency, or persistent symptoms, strongly encourage them to seek immediate "
    "medical attention or call emergency services. Keep responses concise, supportive, and actionable. "
    "Use bullet points when helpful. Do not prescribe specific medications or dosages."
)


@api_router.post("/chat/send", response_model=ChatResponse)
async def chat_send(request: ChatRequest, http_request: Request):
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=500, detail="LLM key not configured.")
    # Optional auth — attach user_id if authenticated
    user_id = None
    auth_header = http_request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        try:
            payload = jwt.decode(auth_header[7:].strip(), JWT_SECRET, algorithms=[JWT_ALGORITHM])
            user_id = payload.get("sub")
        except Exception:
            user_id = None
    user_msg = {
        "id": str(uuid.uuid4()),
        "session_id": request.session_id,
        "user_id": user_id,
        "role": "user",
        "content": request.message,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    await db.chat_messages.insert_one(user_msg)
    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=request.session_id,
            system_message=HEALTH_SYSTEM_PROMPT,
        ).with_model("anthropic", "claude-sonnet-4-5-20250929")
        reply_text = await chat.send_message(UserMessage(text=request.message))
    except Exception as e:
        logger.error(f"LLM error: {e}")
        raise HTTPException(status_code=500, detail=f"Chat failed: {str(e)}")
    ai_msg = {
        "id": str(uuid.uuid4()),
        "session_id": request.session_id,
        "user_id": user_id,
        "role": "assistant",
        "content": reply_text,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    await db.chat_messages.insert_one(ai_msg)
    return ChatResponse(session_id=request.session_id, reply=reply_text)


@api_router.get("/chat/history/{session_id}")
async def chat_history(session_id: str):
    docs = await db.chat_messages.find({"session_id": session_id}, {"_id": 0}).sort("timestamp", 1).to_list(500)
    return {"session_id": session_id, "messages": docs}


# Include router
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ==================== STARTUP / SHUTDOWN ====================
@app.on_event("startup")
async def on_startup():
    try:
        await db.users.create_index("email", unique=True)
        await db.login_attempts.create_index("identifier")
    except Exception as e:
        logger.warning(f"Index creation warning: {e}")
    # seed admin
    existing = await db.users.find_one({"email": ADMIN_EMAIL})
    if not existing:
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "email": ADMIN_EMAIL,
            "name": "Admin",
            "password_hash": hash_password(ADMIN_PASSWORD),
            "role": "admin",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        logger.info(f"Seeded admin: {ADMIN_EMAIL}")
    else:
        # refresh password hash if env changed
        if not verify_password(ADMIN_PASSWORD, existing.get("password_hash", "")):
            await db.users.update_one(
                {"email": ADMIN_EMAIL},
                {"$set": {"password_hash": hash_password(ADMIN_PASSWORD)}},
            )
            logger.info(f"Updated admin password hash for: {ADMIN_EMAIL}")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
