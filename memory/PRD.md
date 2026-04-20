# HealthMate — Product Requirements Document

## Overview
**HealthMate** is a React Expo mobile app that unifies three health-related features inspired by the user's GitHub references:
1. Symptom Checker (Health-Checkup repo)
2. AI Fitness Trainer (AI-Fitness-Trainer repo) — manual rep tracking since MediaPipe pose detection isn't feasible in Expo Go
3. Healthcare Chatbot (MediBot) powered by Claude Sonnet 4.5

## Tech Stack
- **Frontend**: Expo SDK 54 + React Native + expo-router (tabs), TypeScript
- **Backend**: FastAPI (Python) with MongoDB (motor) and `emergentintegrations` for LLM
- **LLM**: Claude Sonnet 4.5 (`claude-sonnet-4-5-20250929`) via Emergent Universal LLM Key
- **Navigation**: Bottom tabs — Home, Symptoms, Fitness, MediBot

## Features

### 1. Home Dashboard (`app/index.tsx`)
- Personalized greeting + date
- Hero card with wellness image
- Quick stats (Calories Today, Last Check-up)
- 3 feature cards linking to Symptoms, Fitness, Chat
- Disclaimer about medical advice

### 2. Symptom Checker (`app/symptoms.tsx`)
- Searchable symptom list (28+ common symptoms)
- Multi-select symptom chips
- `Analyze Symptoms` triggers `POST /api/symptoms/check`
- Results modal shows top-5 matching conditions with match score, description, recommendation, specialist, severity badge
- Rule-based engine over 12 disease profiles (common cold, flu, migraine, gastroenteritis, allergies, asthma, hypertension, diabetes, anxiety, pneumonia, UTI, anemia)

### 3. AI Fitness Trainer (`app/fitness.tsx`)
- 3 exercises (Push-Up, Pull-Up, Squat) with muscle groups, difficulty, and form tips
- Workout screen with massive rep counter (tap-to-count + haptics)
- Built-in timer (auto-starts on first tap)
- Calorie estimation (calories_per_10_reps)
- Pause/Start, Reset, Finish — `Finish` saves to `/api/workouts`
- Form-tips card per exercise

### 4. MediBot Chat (`app/chat.tsx`)
- Welcome bubble + 4 suggestion chips
- Persistent chat history per session (stored in MongoDB `chat_messages`)
- Real-time Claude Sonnet 4.5 responses via Emergent LLM key
- Typing indicator, error fallback message

## Backend API (`/api` prefix)
| Endpoint | Method | Description |
|---|---|---|
| `/` | GET | Health check |
| `/symptoms` | GET | All supported symptoms |
| `/symptoms/check` | POST | Predict diseases from symptom list |
| `/exercises` | GET | List all exercises |
| `/exercises/{id}` | GET | Exercise details |
| `/workouts` | POST | Log a workout |
| `/workouts` | GET | List recent workouts |
| `/chat/send` | POST | Send message, get AI reply |
| `/chat/history/{session_id}` | GET | Full conversation history |

## MongoDB Collections
- `status_checks`, `workouts`, `chat_messages` — all ObjectId excluded from responses

## Environment Variables
- `MONGO_URL`, `DB_NAME` (already configured)
- `EMERGENT_LLM_KEY` (added — funds Claude Sonnet 4.5 calls)

## Design System
- **Theme**: Organic & Earthy light (Deep Forest Green `#2A5C43` primary, Terracotta `#C25E46` accent, Sage `#8A9E88` secondary, Off-white `#F9F9F7` background)
- **Components**: Pill-shaped chips/buttons, rounded cards, glass-like bottom nav
- **Counter**: 120px rep counter for glanceability

## Not Included (MVP)
- Authentication (guest mode)
- Real-time pose detection (MediaPipe not supported in Expo Go — manual tap counter used instead)
- Doctor booking (shown as specialist suggestion text only)

## Business Enhancement Suggestion
Add a **weekly wellness streak** (consecutive days with any activity: chat/symptom/workout). Display on Home stats and push opt-in reminder notifications — proven to boost DAU/retention 2x in health apps.
