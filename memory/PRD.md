# HealthMate — Product Requirements Document

## Overview
**HealthMate** is a React Expo mobile app that unifies three health-related features inspired by the user's GitHub references:
1. Symptom Checker (Health-Checkup repo)
2. AI Fitness Trainer (AI-Fitness-Trainer + FormFit-AI inspired) — camera preview + motion-based rep counting
3. Healthcare Chatbot (MediBot) powered by Claude Sonnet 4.5

## Tech Stack
- **Frontend**: Expo SDK 54 + React Native + expo-router, TypeScript
- **Backend**: FastAPI + MongoDB (motor) + emergentintegrations
- **Auth**: JWT (PyJWT) + bcrypt, 7-day access token via Bearer header + AsyncStorage
- **LLM**: Claude Sonnet 4.5 (`claude-sonnet-4-5-20250929`) via Emergent Universal LLM Key
- **Navigation**: Stack with `(auth)` and `(tabs)` groups — 4 tabs (Home, Symptoms, Fitness, MediBot)
- **Sensors**: expo-camera (camera preview) + expo-sensors Accelerometer (motion rep detection)

## Features

### Authentication (Iteration 2)
- `/(auth)/login` — Email + password with demo credentials hint
- `/(auth)/register` — Name + email + password (≥6 chars) self-signup
- JWT Bearer token auth (mobile-friendly — no cookies)
- Admin seed on startup: `admin@healthmate.app` / `Admin@1234`
- Brute-force protection: 5 failed attempts/IP+email → 15-minute lockout (uses X-Forwarded-For for K8s ingress)
- Logout button on Home screen

### Home Dashboard
- Personalized greeting with first name
- Hero card + quick stats (Calories Today, Last Check-up)
- 3 feature cards linking to Symptoms, Fitness, Chat
- Logout icon (top-right)

### Symptom Checker
- 28+ selectable symptoms, searchable
- Results modal: top-5 diseases (12 profiles) with match %, description, recommendation, specialist, severity

### AI Fitness Trainer (Iteration 2 expanded)
**11 exercises**: Push-Up, Pull-Up, Squat, Sit-Up, Plank (timed), Lunges, Jumping Jacks, Bicep Curls, Shoulder Press, Burpees, Deadlift (guide).

**Workout view features**:
- **Camera Coach** — tap "Enable Camera Coach" to turn on front camera preview with live "CAMERA" badge
- **Auto-Detect Reps** — toggle accelerometer-based peak detection (motion-cycle counting, debounced 400ms). Axis per-exercise (y for push-up/squat, xyz for jumping jacks/burpees)
- **Manual tap** — Big green TAP TO COUNT button always available as reliable fallback
- **Timer** — auto-starts on first tap, pause/resume
- **Calorie estimation** per exercise
- **Form tips** — per-exercise bullet list
- Plank uses time-mode (00:00 counter, no tap button)

**Note on pose detection**: True MediaPipe pose detection requires a native dev build (react-native-vision-camera + frame processors). In Expo Go we use accelerometer-based motion cycle detection — realistic for squats/pushups/jumping-jacks when the phone is held or strapped; manual tap always works.

### MediBot Chat
- Session-persistent history, 4 suggestion chips, typing indicator
- Claude Sonnet 4.5 (Anthropic) via Emergent LLM key

## Backend API (`/api` prefix)
| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/auth/register` | POST | — | Create account |
| `/auth/login` | POST | — | Log in |
| `/auth/me` | GET | Bearer | Current user |
| `/auth/logout` | POST | Bearer | Log out |
| `/symptoms` | GET | — | All symptoms |
| `/symptoms/check` | POST | — | Predict diseases |
| `/exercises` | GET | — | List 11 exercises |
| `/exercises/{id}` | GET | — | Exercise details |
| `/workouts` | POST | Optional | Log workout (attaches user_id when authed) |
| `/workouts` | GET | — | Recent workouts |
| `/chat/send` | POST | — | Chat with MediBot |
| `/chat/history/{id}` | GET | — | Chat history |

## Environment Variables
- `MONGO_URL`, `DB_NAME`
- `EMERGENT_LLM_KEY`
- `JWT_SECRET` (64-char hex)
- `ADMIN_EMAIL`, `ADMIN_PASSWORD`

## MongoDB Collections
- `users` (unique index on email), `login_attempts` (identifier index), `workouts`, `chat_messages`, `status_checks`
- All responses exclude `_id` and `password_hash`

## Device Permissions (app.json)
- **iOS**: NSCameraUsageDescription, NSMotionUsageDescription, NSMicrophoneUsageDescription
- **Android**: CAMERA, RECORD_AUDIO, HIGH_SAMPLING_RATE_SENSORS, BODY_SENSORS

## Testing
- **Backend**: 19/19 pytest tests pass (auth, exercises, symptoms, chat, workouts, brute-force)
- **Frontend**: Playwright verified — login, home greeting, 11 exercises, plank timed view, push-up workout view with camera coach + auto-detect

## Business Enhancement
**Personalized workout streaks** — now that users have accounts, we can show a weekly streak ring per exercise type on Home, motivating return visits. Data already flows via authenticated `/api/workouts`.
