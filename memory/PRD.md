# HealthMate — PRD

## Overview
React Expo mobile app combining 3 health features:
1. **Symptom Checker** — 29 conditions, 67 symptoms, AI-style match scoring
2. **AI Fitness Trainer** — MediaPipe Pose camera-based rep counting (11 exercises)
3. **MediBot Chatbot** — Claude Sonnet 4.5 with **voice input + voice output**

Plus: **History dashboard**, **JWT auth with remembered email**, **personalized stats** on Home.

## Stack
- **Frontend**: Expo SDK 54 + RN + expo-router (Stack with `(auth)`, `(tabs)`, `history` routes)
- **Voice**: expo-speech (TTS, native+web) + Web Speech API (STT, web only)
- **Pose**: MediaPipe Pose (JS) in react-native-webview, angle-based rep counter
- **Backend**: FastAPI + MongoDB + emergentintegrations + bcrypt + PyJWT
- **LLM**: Claude Sonnet 4.5 via Emergent Universal Key

## Iteration 4 Highlights
- **🎤 Voice MediBot** — Mic button (Web Speech API) records speech → fills input → auto-sends. Speaker toggle (`expo-speech`) reads bot replies aloud while bot text bubble still renders normally.
- **🕒 History dashboard** — Home gains a 4th card. Dedicated `/history` screen with 3 tabs (Workouts / Checkups / Chats) — all per-user.
- **📧 Remembered email** — On login/register, email saved to AsyncStorage. After logout, login form pre-fills email (with "remembered" badge); password is never cached for security.
- **🩺 +17 conditions, +39 symptoms** — Symptom DB now covers: Common Cold, Flu, Migraine, Tension Headache, Gastroenteritis, Acid Reflux, Allergies, Asthma, Bronchitis, Hypertension, Diabetes, Hypothyroidism, Hyperthyroidism, Anxiety, Depression, Pneumonia, **COVID-19**, UTI, Kidney Stones, Anemia, Sinusitis, Conjunctivitis, Eczema, Iron Deficiency, Heart Disease, **Stroke (emergency)**, Arthritis, Insomnia, Dehydration.
- **Chat persists per user** — Chat sessions tied to `user_id` so they appear in History.

## Auth (unchanged behavior + remembered email)
- JWT 7-day Bearer token + bcrypt + brute-force lockout (5 attempts → 15min)
- Admin seed: `admin@healthmate.app` / `Admin@1234`
- Logout removes token, keeps last email

## API
| Endpoint | Auth | Description |
|---|---|---|
| `/auth/{register,login,me,logout}` | varies | JWT auth |
| `/symptoms` | — | 67 symptoms |
| `/symptoms/check` | optional | Predict conditions; persists for auth user |
| `/symptom-checks/me{,/last}` | Bearer | History + last check |
| `/exercises` | — | 11 exercises |
| `/workouts` | optional | Log workout (auto-calories) |
| `/workouts/me{,/today}` | Bearer | All / today's workouts |
| `/chat/send` | optional | Claude reply, persists user_id when authed |
| `/chat/history/{session_id}` | — | Single session messages |
| `/chat/sessions/me` | Bearer | All user sessions with last preview |

## Testing
- **Backend**: 37/37 pytest cases pass
- **Frontend**: All Iter-4 flows verified — 4 home cards, history 3 tabs, voice mic + speaker toggle, remembered-email pre-fill

## Permissions (app.json)
- Camera, Motion, Microphone — declared per platform

## Business Enhancement
**Voice + History** unlocks accessibility (visually-impaired users, hands-free workouts) AND retention (users see their progress timeline). Next layer: predictive nudges — "You haven't done a check-up in 14 days" or "Try a quick chat about your sleep".
