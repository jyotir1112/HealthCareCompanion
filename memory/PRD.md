# HealthMate — PRD

## Overview
React Expo mobile app combining 3 health features inspired by user's GitHub repos:
1. **Symptom Checker** (Health-Checkup repo)
2. **AI Fitness Trainer** (AI-Fitness-Trainer + FormFit-AI inspired) — REAL MediaPipe Pose-based rep counting
3. **Healthcare Chatbot** (MediBot) powered by Claude Sonnet 4.5

## Tech Stack
- **Frontend**: Expo SDK 54 + React Native + expo-router (Stack + (auth)/(tabs) groups)
- **Pose Detection**: MediaPipe Pose (JS) running inside `react-native-webview` — angle-based rep counting mirrors the user's reference Python algorithm
- **Backend**: FastAPI + MongoDB + emergentintegrations
- **Auth**: JWT (PyJWT + bcrypt), Bearer token in AsyncStorage, brute-force lockout (X-Forwarded-For aware)
- **LLM**: Claude Sonnet 4.5 via Emergent Universal LLM Key
- **Sensors**: expo-camera + expo-sensors Accelerometer (motion fallback)

## Iteration 3 Highlights
- **Real AI Pose Detection** — Tap "AI Pose Vision" → opens a WebView running MediaPipe Pose from CDN. Computes joint angles (arm/leg/abdomen) with `angle3()` exactly like the user's body_part_angle.py reference and triggers rep cycles via state machine per exercise (push-up & pull-up via arm angle 90°→160°, squat & lunges via leg angle 110°→160°, sit-up via abdomen 80°→140°, bicep curls 50°→160° inverse, shoulder press 95°→165°, jumping jacks via wrist-shoulder Y delta, burpees & deadlift via abdomen). Posts `{type:'rep',count,exercise}` to React Native via `postMessage`.
- **Persistent stats** — Workouts now store `calories_burned`. New endpoints `/api/workouts/me/today` and `/api/symptom-checks/me/last` aggregate per-user data.
- **Home stats** wired up — Calories Today + Last Check-up refresh on tab focus via `useFocusEffect`.
- **Custom logo** — heart-circle bubble in front of "Hello, {firstName}".
- **Web fallback** — On web preview AI Pose Vision shows "Open on phone" (WebView native module not available on RN-web).

## Auth
- `/(auth)/login`, `/(auth)/register`
- Admin seed: `admin@healthmate.app` / `Admin@1234`
- Brute-force: 5 attempts/IP+email → 15-minute lockout
- 7-day JWT, AsyncStorage, no cookies

## API (`/api` prefix)
| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/auth/register|login|me|logout` | POST/GET | varies | JWT auth |
| `/symptoms` | GET | — | List symptoms |
| `/symptoms/check` | POST | Optional | Predict diseases (persists per-user when authed) |
| `/symptom-checks/me/last` | GET | Bearer | User's most recent check |
| `/exercises` | GET | — | 11 exercises with form tips |
| `/workouts` | POST | Optional | Log workout (auto-calories) |
| `/workouts/me/today` | GET | Bearer | Today's totals + workouts |
| `/chat/send|history` | POST/GET | — | Claude Sonnet 4.5 chat |

## Exercises (11)
Push-Up, Pull-Up, Squat, Sit-Up, Plank (timed), Lunges, Jumping Jacks, Bicep Curls, Shoulder Press, Burpees, Deadlift.

## MongoDB Collections
`users` (unique email index), `login_attempts`, `workouts` (with user_id + calories_burned), `chat_messages`, `symptom_checks`, `status_checks`. All responses exclude `_id` and `password_hash`.

## Permissions (app.json)
- iOS: NSCameraUsageDescription, NSMotionUsageDescription
- Android: CAMERA, RECORD_AUDIO, HIGH_SAMPLING_RATE_SENSORS, BODY_SENSORS

## Testing
- **Backend**: 26/26 pytest cases pass (auth, brute-force, exercises, workouts + per-user totals, symptoms + per-user persistence, chat)
- **Frontend**: Logo renders before greeting ✓ ; Calories Today refreshes after a workout ✓ ; Last Check-up shows date after symptom checker ✓ ; AI Pose Vision WebView mounts on native ✓.

## Business Enhancement
**Real-time form coach**: Already capturing pose angles. Next step: send live `{exercise, angle}` over WebSocket to MediaBot which can give voice cues like "knees behind toes" — turning the app into a full personal trainer.
