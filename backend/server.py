from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime, timezone

from emergentintegrations.llm.chat import LlmChat, UserMessage

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')

# Configure logging (must be before any usage)
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Create the main app without a prefix
app = FastAPI(title="HealthMate API")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")


# ==================== MODELS ====================
class StatusCheck(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class StatusCheckCreate(BaseModel):
    client_name: str


class SymptomCheckRequest(BaseModel):
    symptoms: List[str]


class Disease(BaseModel):
    name: str
    match_score: float
    description: str
    recommendation: str
    specialist: str
    severity: str  # mild / moderate / severe


class SymptomCheckResponse(BaseModel):
    results: List[Disease]
    disclaimer: str


class ChatRequest(BaseModel):
    session_id: str
    message: str


class ChatMessage(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    session_id: str
    role: str  # "user" or "assistant"
    content: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ChatResponse(BaseModel):
    session_id: str
    reply: str


class WorkoutLog(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    exercise: str
    reps: int
    duration_seconds: int
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class WorkoutLogCreate(BaseModel):
    exercise: str
    reps: int
    duration_seconds: int


# ==================== SYMPTOM CHECKER DATA ====================
# Rule-based symptom → disease mapping (inspired by common medical symptom checkers)
SYMPTOM_DISEASE_DB = [
    {
        "name": "Common Cold",
        "symptoms": ["runny nose", "sneezing", "sore throat", "cough", "mild fever", "congestion", "headache"],
        "description": "A viral infection of the nose and throat (upper respiratory tract).",
        "recommendation": "Rest, stay hydrated, take over-the-counter cold medicine. Usually resolves in 7-10 days.",
        "specialist": "General Physician",
        "severity": "mild",
    },
    {
        "name": "Influenza (Flu)",
        "symptoms": ["high fever", "chills", "body aches", "fatigue", "cough", "headache", "sore throat"],
        "description": "A contagious respiratory illness caused by influenza viruses.",
        "recommendation": "Rest, plenty of fluids, antiviral medications if prescribed within 48 hours. See a doctor if symptoms worsen.",
        "specialist": "General Physician",
        "severity": "moderate",
    },
    {
        "name": "Migraine",
        "symptoms": ["headache", "nausea", "vomiting", "sensitivity to light", "sensitivity to sound", "blurred vision"],
        "description": "A neurological condition causing severe throbbing pain, usually on one side of the head.",
        "recommendation": "Rest in a quiet, dark room. Take prescribed migraine medication. Track triggers.",
        "specialist": "Neurologist",
        "severity": "moderate",
    },
    {
        "name": "Gastroenteritis",
        "symptoms": ["nausea", "vomiting", "diarrhea", "abdominal pain", "mild fever", "dehydration"],
        "description": "Inflammation of the stomach and intestines, often from a viral or bacterial infection.",
        "recommendation": "Drink oral rehydration solutions, eat bland foods, rest. See a doctor if symptoms persist >48 hrs.",
        "specialist": "Gastroenterologist",
        "severity": "moderate",
    },
    {
        "name": "Seasonal Allergies",
        "symptoms": ["sneezing", "runny nose", "itchy eyes", "congestion", "watery eyes", "itchy throat"],
        "description": "An allergic response to airborne substances like pollen or dust.",
        "recommendation": "Antihistamines, nasal sprays, and avoiding allergens. Consult an allergist for testing.",
        "specialist": "Allergist / Immunologist",
        "severity": "mild",
    },
    {
        "name": "Asthma",
        "symptoms": ["shortness of breath", "wheezing", "chest tightness", "cough", "difficulty breathing"],
        "description": "A chronic condition where the airways narrow and swell, making breathing difficult.",
        "recommendation": "Use prescribed inhalers, avoid triggers. Seek emergency care for severe attacks.",
        "specialist": "Pulmonologist",
        "severity": "moderate",
    },
    {
        "name": "Hypertension (High Blood Pressure)",
        "symptoms": ["headache", "dizziness", "blurred vision", "chest pain", "shortness of breath", "fatigue"],
        "description": "A common condition where the long-term force of blood against artery walls is too high.",
        "recommendation": "Regular BP monitoring, reduce salt, exercise, take prescribed medication. See cardiologist.",
        "specialist": "Cardiologist",
        "severity": "moderate",
    },
    {
        "name": "Diabetes (Type 2)",
        "symptoms": ["frequent urination", "increased thirst", "fatigue", "blurred vision", "weight loss", "slow healing"],
        "description": "A chronic condition affecting how your body processes blood sugar (glucose).",
        "recommendation": "Monitor blood sugar, healthy diet, regular exercise, prescribed medication. See endocrinologist.",
        "specialist": "Endocrinologist",
        "severity": "moderate",
    },
    {
        "name": "Anxiety Disorder",
        "symptoms": ["restlessness", "fatigue", "difficulty concentrating", "rapid heartbeat", "sweating", "trembling", "insomnia"],
        "description": "A mental health condition characterized by excessive worry and fear.",
        "recommendation": "Therapy (CBT), stress management, medication if prescribed. Seek a mental health professional.",
        "specialist": "Psychiatrist / Psychologist",
        "severity": "moderate",
    },
    {
        "name": "Pneumonia",
        "symptoms": ["high fever", "cough", "chest pain", "shortness of breath", "fatigue", "chills", "difficulty breathing"],
        "description": "Infection that inflames air sacs in one or both lungs, which may fill with fluid.",
        "recommendation": "See a doctor immediately. Antibiotics or antivirals, rest, hydration. Hospitalization may be needed.",
        "specialist": "Pulmonologist",
        "severity": "severe",
    },
    {
        "name": "Urinary Tract Infection (UTI)",
        "symptoms": ["frequent urination", "burning sensation", "cloudy urine", "pelvic pain", "abdominal pain"],
        "description": "An infection in any part of the urinary system (kidneys, bladder, urethra).",
        "recommendation": "Antibiotics, drink plenty of water. See a doctor for diagnosis and prescription.",
        "specialist": "Urologist / General Physician",
        "severity": "mild",
    },
    {
        "name": "Anemia",
        "symptoms": ["fatigue", "weakness", "pale skin", "shortness of breath", "dizziness", "cold hands", "headache"],
        "description": "A condition where you lack enough healthy red blood cells to carry adequate oxygen.",
        "recommendation": "Iron-rich diet, supplements, treat underlying cause. Blood tests needed for diagnosis.",
        "specialist": "Hematologist / General Physician",
        "severity": "mild",
    },
]

ALL_SYMPTOMS = sorted(list({s for d in SYMPTOM_DISEASE_DB for s in d["symptoms"]}))


# ==================== EXERCISES DATA ====================
EXERCISES = [
    {
        "id": "push-up",
        "name": "Push-Up",
        "emoji": "💪",
        "description": "A conditioning exercise performed in a prone position by raising and lowering the body with the arms.",
        "muscle_groups": ["Chest", "Shoulders", "Triceps", "Core"],
        "difficulty": "Beginner",
        "calories_per_10_reps": 5,
        "form_tips": [
            "Keep your body in a straight line from head to heels.",
            "Lower your chest until it nearly touches the floor.",
            "Keep elbows at roughly 45° to your body.",
            "Engage your core throughout the movement.",
            "Breathe in on the way down, exhale on the push up.",
        ],
    },
    {
        "id": "pull-up",
        "name": "Pull-Up",
        "emoji": "🏋️",
        "description": "An upper-body strength exercise where you pull yourself up while suspended by your hands.",
        "muscle_groups": ["Back", "Biceps", "Shoulders"],
        "difficulty": "Advanced",
        "calories_per_10_reps": 10,
        "form_tips": [
            "Grip the bar with hands slightly wider than shoulder-width.",
            "Start from a dead hang with arms fully extended.",
            "Pull up until your chin clears the bar.",
            "Control the descent — don't drop down.",
            "Keep your core engaged, avoid swinging.",
        ],
    },
    {
        "id": "squat",
        "name": "Squat",
        "emoji": "🦵",
        "description": "A strength exercise that lowers the hips from standing and returns. Great for lower body.",
        "muscle_groups": ["Quads", "Glutes", "Hamstrings", "Core"],
        "difficulty": "Beginner",
        "calories_per_10_reps": 6,
        "form_tips": [
            "Stand with feet shoulder-width apart, toes slightly out.",
            "Lower hips back and down as if sitting in a chair.",
            "Keep your chest up and back straight.",
            "Knees should track over toes, not collapse inward.",
            "Go down until thighs are parallel to floor, then drive up.",
        ],
    },
]


# ==================== ROUTES ====================
@api_router.get("/")
async def root():
    return {"message": "HealthMate API is running", "version": "1.0.0"}


@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    status_obj = StatusCheck(**input.dict())
    doc = status_obj.dict()
    doc["timestamp"] = doc["timestamp"].isoformat()
    await db.status_checks.insert_one(doc)
    return status_obj


@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    status_checks = await db.status_checks.find({}, {"_id": 0}).to_list(1000)
    return [StatusCheck(**sc) for sc in status_checks]


# -------- Symptom Checker --------
@api_router.get("/symptoms")
async def get_symptoms():
    """Return list of all supported symptoms."""
    return {"symptoms": ALL_SYMPTOMS}


@api_router.post("/symptoms/check", response_model=SymptomCheckResponse)
async def check_symptoms(request: SymptomCheckRequest):
    """Predict possible diseases from selected symptoms."""
    if not request.symptoms:
        raise HTTPException(status_code=400, detail="Please select at least one symptom.")

    user_symptoms = {s.lower().strip() for s in request.symptoms}
    scored: List[Disease] = []

    for disease in SYMPTOM_DISEASE_DB:
        disease_syms = set(disease["symptoms"])
        matches = user_symptoms.intersection(disease_syms)
        if not matches:
            continue
        # score = % of disease symptoms matched * 0.7 + % of user symptoms covered * 0.3
        disease_coverage = len(matches) / len(disease_syms)
        user_coverage = len(matches) / len(user_symptoms)
        score = round((disease_coverage * 0.7 + user_coverage * 0.3) * 100, 1)
        scored.append(
            Disease(
                name=disease["name"],
                match_score=score,
                description=disease["description"],
                recommendation=disease["recommendation"],
                specialist=disease["specialist"],
                severity=disease["severity"],
            )
        )

    scored.sort(key=lambda d: d.match_score, reverse=True)
    top = scored[:5]

    return SymptomCheckResponse(
        results=top,
        disclaimer="This is an AI-assisted preliminary assessment, not a medical diagnosis. Please consult a qualified healthcare professional for proper diagnosis and treatment.",
    )


# -------- Fitness / Exercises --------
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
async def log_workout(input: WorkoutLogCreate):
    wl = WorkoutLog(**input.dict())
    doc = wl.dict()
    doc["timestamp"] = doc["timestamp"].isoformat()
    await db.workouts.insert_one(doc)
    return wl


@api_router.get("/workouts", response_model=List[WorkoutLog])
async def list_workouts(limit: int = 20):
    docs = await db.workouts.find({}, {"_id": 0}).sort("timestamp", -1).to_list(limit)
    results = []
    for d in docs:
        # Convert isoformat string back to datetime for model
        if isinstance(d.get("timestamp"), str):
            try:
                d["timestamp"] = datetime.fromisoformat(d["timestamp"])
            except Exception:
                d["timestamp"] = datetime.now(timezone.utc)
        results.append(WorkoutLog(**d))
    return results


# -------- Healthcare Chatbot --------
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
async def chat_send(request: ChatRequest):
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=500, detail="LLM key not configured.")

    # Save user message
    user_msg = ChatMessage(session_id=request.session_id, role="user", content=request.message)
    user_doc = user_msg.dict()
    user_doc["timestamp"] = user_doc["timestamp"].isoformat()
    await db.chat_messages.insert_one(user_doc)

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

    # Save assistant reply
    ai_msg = ChatMessage(session_id=request.session_id, role="assistant", content=reply_text)
    ai_doc = ai_msg.dict()
    ai_doc["timestamp"] = ai_doc["timestamp"].isoformat()
    await db.chat_messages.insert_one(ai_doc)

    return ChatResponse(session_id=request.session_id, reply=reply_text)


@api_router.get("/chat/history/{session_id}")
async def chat_history(session_id: str):
    docs = await db.chat_messages.find(
        {"session_id": session_id}, {"_id": 0}
    ).sort("timestamp", 1).to_list(500)
    return {"session_id": session_id, "messages": docs}


# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
