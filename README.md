# Alfa AI Studio

A personal AI video generation studio built with Next.js 16. It currently integrates **Seedance** through **BytePlus ModelArk**.

The whole app runs in **Mock Mode** out of the box. Mock Mode needs no BytePlus model activation, makes no network calls, and costs nothing. The real BytePlus provider is already implemented and only runs when you explicitly turn it on.

---

## Contents

- [Features](#features)
- [Quick start](#quick-start)
- [Environment variables](#environment-variables)
- [Mock Mode](#mock-mode)
- [Testing a generation](#testing-a-generation)
- [Enabling real BytePlus generation](#enabling-real-byteplus-generation)
- [Configuring model IDs](#configuring-model-ids)
- [Supported model capabilities](#supported-model-capabilities)
- [Architecture](#architecture)
- [API](#api)
- [Local persistence](#local-persistence)
- [Security & reliability](#security--reliability)
- [Scripts](#scripts)
- [Known limitations](#known-limitations)

---

## Features

- **Text to Video**: prompt, model, duration, aspect ratio (16:9 / 9:16 / 1:1), resolution, watermark, audio, fixed camera and seed. Each control appears only when the selected model supports it.
- **Image to Video**: first-frame upload, plus an optional last-frame upload on models that support it. Images are previewed and validated on the client, then validated again on the server.
- **Async task handling**: submit, get a task ID, then poll queued → running → succeeded or failed. Polling uses backoff, has a hard time limit, and stops when the page goes away.
- **Preview & download**: inline player, download with a proper filename, and open in a new tab.
- **Generation history**: filters, search, video previews, a details dialog, error details for failed tasks, and delete.
- **Settings**: provider mode, whether the API key is set (the key itself is never shown), model capability table, storage backends, and Mock testing controls.
- **Provider status in the sidebar**: shows Mock Mode or BytePlus, and the model's availability (for example "Not activated" after a `ModelNotOpen` error).
- **Mock Mode**: simulated task lifecycle, a clearly labeled demo clip, simulated failures, and persistence across workers and page refreshes.
- **Dark, responsive UI**: shadcn/ui components, Tailwind v4, loading skeletons, toasts, and actionable error messages.

## Quick start

Requirements: **Node.js ≥ 20.9** (tested with Node 22) and npm.

```bash
npm install
```

```bash
cp .env.example .env.local
```

```bash
npm run dev
```

Open <http://localhost:3000>. No database, API key or BytePlus activation is needed.

## Environment variables

All variables are read **on the server only** and validated with Zod at startup (`src/lib/env.ts`). If a value is invalid, the API returns a `CONFIG_ERROR` and the server log explains the problem. Secrets are never sent to the browser.

| Variable | Default | Description |
| --- | --- | --- |
| `VIDEO_PROVIDER` | `mock` | `mock` or `byteplus`. Real generation happens **only** when this is `byteplus`. |
| `ARK_API_KEY` | – | BytePlus ModelArk API key. Required for `byteplus`. |
| `ARK_BASE_URL` | `https://ark.ap-southeast.bytepluses.com/api/v3` | ModelArk API base URL. Must be https. |
| `ARK_MODEL` | `seedance-1-5-pro-251215` | Default model ID, or an endpoint ID. |
| `ARK_EXTRA_MODELS` | – | Optional comma-separated list of extra model IDs to show in the model picker. |
| `ARK_REQUEST_TIMEOUT_MS` | `30000` | Timeout for each BytePlus HTTP request. |
| `MONGODB_URI` | – | Optional. If set, history is stored in MongoDB. If empty, it uses local JSON files. |
| `DATA_DIR` | `.data` | Folder for local data (mock tasks, history, uploads). |
| `MOCK_QUEUE_MS` | `3000` | Length of the simulated queued phase. |
| `MOCK_RUN_MS` | `9000` | Length of the simulated running phase. |

`.env.local` and every other `.env*` file is git-ignored, except `.env.example`.

## Mock Mode

Mock Mode is the default (`VIDEO_PROVIDER=mock`). It:

- Accepts any request that passes validation, using the same validation and capability checks as real mode.
- Creates a unique task ID (`mock-<uuid>`) and saves it to `DATA_DIR/mock-tasks/`.
- Simulates **queued → running → succeeded**, with real progress percentages. The status is calculated from the creation timestamp on every read, so it stays correct across route-handler workers, hot reloads and page refreshes. It does not depend on an in-memory map.
- Returns a bundled demo clip (`public/demo/demo-{16x9,9x16,1x1}.mp4`) that matches the aspect ratio. These clips were rendered locally with ffmpeg for this project, so there are no licensing concerns. Each clip reads "DEMO VIDEO · Not AI Generated", and the UI always overlays a **"Demo Video — Not AI Generated"** badge.
- Lets you download the demo clip.
- Never calls BytePlus and never costs money. This is checked by tests.
- **Simulates failures** in two ways:
  - Put `#fail` anywhere in the prompt, or
  - Turn on **Settings → Mock testing → Simulate failures**. This setting is per browser.

## Testing a generation

1. Run `npm run dev` and open <http://localhost:3000>.
2. Type a prompt, or click **Inspire me**. Pick a duration, aspect ratio and resolution, then click **Generate video** (or press ⌘/Ctrl + Enter).
3. Watch the status go Submitted → Queued → Generating → Ready, with an elapsed timer and progress bar.
4. The labeled demo clip plays. Use **Download demo** to save it.
5. Refresh the page while a task is running. The studio restores the active task and keeps polling.
6. Open **Generation History** to see every task, filter by status, open the details dialog and download.
7. To test a failure, add `#fail` to the prompt.
8. To test **Image to Video**, switch tabs and upload a PNG, JPEG or WebP image (300–6000 px per side, at most 10 MB). The last-frame slot unlocks once a first frame is uploaded, on models that support last frames.

## Enabling real BytePlus generation

> Real generations are billed by BytePlus. The app never switches to real mode by itself.

1. In the **BytePlus ModelArk console**, activate the Seedance model you want under Model activation. Until you do this, the API answers `ModelNotOpen`, and the studio shows *"This Seedance model is not activated for your BytePlus account"*.
2. Create an API key in the console and add it to `.env.local`:
   ```bash
   ARK_API_KEY=your-key-here
   ```
3. Check that `ARK_MODEL` exactly matches the model ID shown in the console, for example `seedance-1-5-pro-251215`.
4. Switch the provider:
   ```bash
   VIDEO_PROVIDER=byteplus
   ```
5. Restart `npm run dev`. The sidebar should now show **BytePlus**.
6. Start with a short, low-resolution clip (5 s, 480p/720p) to confirm everything works. After the first successful task, the model availability indicator changes to **Available**.

To go back to free testing, set `VIDEO_PROVIDER=mock` and restart.

Mock records stay viewable after you switch to BytePlus mode. BytePlus records are **not** refreshed while you're in Mock Mode, because Mock Mode must never call the API.

## Configuring model IDs

- `ARK_MODEL` is the default model. `ARK_EXTRA_MODELS` adds more entries to the model picker:
  ```bash
  ARK_EXTRA_MODELS=seedance-1-0-pro-250528,seedance-1-0-pro-fast-251015
  ```
- Each ID is matched to a **capability profile** by its prefix, in `src/lib/video/capabilities.ts`. The longest matching prefix wins.
- If an ID doesn't match any profile (for example a custom endpoint ID like `ep-2026…`), the app uses a **conservative** profile: text-to-video and first frame only, 5 s, 720p, no audio, last frame, seed or fixed camera. To unlock more options, add a profile.
- The server rejects requests for models that aren't listed in `ARK_MODEL` or `ARK_EXTRA_MODELS`.

Adding a future model, such as Seedance 2.x, is a single new entry in `PROFILES`. The UI, validation and payload builder all adapt automatically.

## Supported model capabilities

| Profile (ID prefix) | Text→Video | First frame | Last frame | Audio | Durations | Resolutions |
| --- | :-: | :-: | :-: | :-: | --- | --- |
| `seedance-1-5-pro` | ✓ | ✓ | ✓ | ✓ | 4, 5, 6, 8, 10, 12 s | 480p, 720p, 1080p |
| `seedance-1-0-pro` | ✓ | ✓ | ✓ | – | 5, 10 s | 480p, 720p, 1080p |
| `seedance-1-0-pro-fast` | ✓ | ✓ | – | – | 5, 10 s | 480p, 720p, 1080p |
| `seedance-1-0-lite-t2v` | ✓ | – | – | – | 5, 10 s | 480p, 720p |
| `seedance-1-0-lite-i2v` | – | ✓ | ✓ | – | 5, 10 s | 480p, 720p |
| *(unrecognized)* | ✓ | ✓ | – | – | 5 s | 720p |

- Aspect ratios offered: 16:9, 9:16 and 1:1. Image-to-video also offers **Adaptive**, which follows the first frame's aspect ratio.
- All profiles support watermark control.
- Recognized profiles also support `seed` and `camera_fixed`.

> **Verify before enabling a new model.** The request and response field names were checked against BytePlus's official `byteplussdkarkruntime` SDK (v3.0.64, `content_generation.tasks`). `docs.byteplus.com` could not be reached from the environment this was built in, so the per-model values above (durations, resolutions, last-frame and audio support) come from ModelArk documentation as known at the time of writing. Check them against the ModelArk console or docs for your account and adjust `capabilities.ts` if needed. That file is the single source of truth.

## Architecture

```
src/
├── app/
│   ├── api/
│   │   ├── health/route.ts            # non-secret runtime config + provider status
│   │   ├── uploads/route.ts           # POST reference image (multipart)
│   │   ├── uploads/[id]/route.ts      # GET image preview by opaque id
│   │   ├── videos/route.ts            # GET history, POST create generation
│   │   ├── videos/[id]/route.ts       # GET status (refreshes from provider), DELETE
│   │   └── videos/[id]/download/route.ts
│   ├── page.tsx                       # Create Video studio
│   ├── history/page.tsx
│   └── settings/page.tsx
├── components/
│   ├── layout/                        # sidebar, mobile header, provider status, logo
│   ├── video/                         # studio form, dropzones, preview stage, player
│   ├── history/  settings/
│   └── ui/                            # shadcn/ui primitives (new-york style)
├── hooks/                             # config context, polling, preferences, clock
├── lib/
│   ├── video/
│   │   ├── provider.ts                # VideoProvider interface
│   │   ├── mock-provider.ts           # Mock Mode (file-persisted, time-derived state)
│   │   ├── byteplus-provider.ts       # ModelArk REST client (native fetch)
│   │   ├── byteplus-payload.ts        # request body builder, status mapping
│   │   ├── byteplus-errors.ts         # ModelArk error → AppError normalization
│   │   ├── capabilities.ts            # per-model capability profiles
│   │   ├── model-status.ts            # last known model availability
│   │   └── factory.ts                 # strict provider selection (no fallback)
│   ├── services/generation-service.ts # orchestration: validate → create → persist → refresh
│   ├── db/                            # repository interface, file + MongoDB implementations
│   ├── storage/                       # JSON document store, image storage
│   ├── uploads/image-validation.ts    # magic bytes, size, dimensions
│   ├── validations/video.ts           # Zod schema + capability cross-check
│   ├── env.ts  errors.ts  http.ts  rate-limit.ts  app-config.ts
│   └── client/                        # browser API client & formatting
├── models/generation.ts               # Mongoose schema
└── types/
tests/                                 # Vitest suites (all network calls mocked)
```

The shared provider contract:

```ts
interface VideoProvider {
  readonly name: "mock" | "byteplus";
  createTask(input: VideoRequest): Promise<VideoTask>;
  getTask(id: string): Promise<VideoTask>;
}
```

### BytePlus request format

`POST {ARK_BASE_URL}/contents/generations/tasks` with `Authorization: Bearer <ARK_API_KEY>`:

```json
{
  "model": "seedance-1-5-pro-251215",
  "content": [
    { "type": "text", "text": "A fox running through snow" },
    { "type": "image_url", "image_url": { "url": "data:image/png;base64,…" }, "role": "first_frame" },
    { "type": "image_url", "image_url": { "url": "data:image/png;base64,…" }, "role": "last_frame" }
  ],
  "ratio": "16:9",
  "duration": 5,
  "resolution": "720p",
  "watermark": false,
  "generate_audio": false
}
```

- `generate_audio`, `camera_fixed` and `seed` are sent only for models that support them.
- Image entries are sent only for image-to-video.
- `GET {ARK_BASE_URL}/contents/generations/tasks/{id}` returns `status` (`queued | running | succeeded | failed | cancelled`), plus `content.video_url` or `error.{code,message}`.

### Error normalization

| ModelArk | App code | User sees |
| --- | --- | --- |
| `ModelNotOpen` | `MODEL_NOT_OPEN` | Activate the model in the ModelArk console, or switch to Mock Mode |
| `InvalidEndpointOrModel.*` | `MODEL_NOT_FOUND` | Check `ARK_MODEL` |
| `AuthenticationError` / 401 | `AUTH_ERROR` | Check `ARK_API_KEY` |
| 429 / `RateLimitExceeded*` / `ServerOverloaded` | `RATE_LIMITED` (retryable) | Wait and retry |
| `*SensitiveContent*` | `CONTENT_REJECTED` | Rephrase |
| `QuotaExceeded` / `AccountOverdue*` | `QUOTA_EXCEEDED` | No balance or quota |
| `InvalidParameter*` / 400 | `PROVIDER_BAD_REQUEST` | Provider's message |
| 5xx | `PROVIDER_UNAVAILABLE` (retryable) | Try again shortly |
| fetch timeout | `PROVIDER_TIMEOUT` (retryable) | – |
| network failure | `NETWORK_ERROR` (retryable) | – |

## API

| Method & path | Purpose |
| --- | --- |
| `GET /api/health` | Provider mode, models + capabilities, availability, storage, limits. Never calls the provider. |
| `POST /api/uploads` | Upload a reference image (`multipart/form-data`, field `file`). Returns `{ image: { id, mimeType, width, height, sizeBytes } }`. |
| `GET /api/uploads/:id` | Image preview. |
| `POST /api/videos` | Create a generation. The JSON body is validated by `createVideoSchema`. Returns `201` for a new task, or `200` with `duplicate: true` for a repeated `clientRequestId`. |
| `GET /api/videos?limit=` | History, newest first. In-flight tasks are refreshed (up to 10 per request). |
| `GET /api/videos/:id` | One generation. Refreshes from the provider while the task is running (at most once per 1.5 s). |
| `DELETE /api/videos/:id` | Remove from history. This doesn't affect the task at the provider. |
| `GET /api/videos/:id/download` | Download the finished video as an attachment. |

Errors always have this shape: `{ "error": { "code", "message", "retryable", "issues?", "providerCode?", "requestId?" } }`.

## Local persistence

When `MONGODB_URI` is empty, everything lives under `DATA_DIR` (default `./.data`, git-ignored):

```
.data/
├── generations/<id>.json      # history records
├── mock-tasks/<task-id>.json  # mock task creation records
├── uploads/files/<id>.<ext>   # reference image bytes
├── uploads/meta/<id>.json     # image metadata
└── provider-status/byteplus.json  # last known model availability
```

- **One file per document**, written atomically (temp file, then rename). Concurrent workers never see a half-written record, and writes to different records never conflict.
- Mock task status is calculated from timestamps, so mock tasks and history stay consistent across processes and restarts.
- Delete `.data/` to reset everything.
- With `MONGODB_URI` set, history goes to MongoDB (`generations` collection). Mock tasks, uploads and model status stay on local disk. Image bytes are **never** stored in MongoDB, only their IDs.

## Security & reliability

- **The API key stays on the server.** It's read only in server modules (`import "server-only"`), never included in `/api/health`, and never logged. Tests check that it doesn't leak into error messages.
- **No automatic switching to real mode.** A misconfigured `byteplus` setup returns `CONFIG_ERROR`. It never silently falls back to mock, and mock never escalates to real.
- **Validation** happens at every boundary: Zod schemas for the environment and request bodies, a capability cross-check on both client and server, and a JSON body cap (32 KB).
- **Uploads:**
  - Type is detected from magic bytes; the browser's MIME type is not trusted.
  - Only PNG, JPEG and WebP are accepted (no SVG).
  - Max 10 MB, 300–6000 px per side, aspect ratio between 0.4 and 2.5.
  - Files are stored outside `/public` under random UUIDs. IDs are pattern-checked before any filesystem access, which prevents path traversal.
  - Previews are served with `nosniff` and a sandbox CSP.
- **No SSRF.** The app never fetches a URL that came from the client. Images go to BytePlus as base64 data URIs. Downloads only fetch the `video_url` that the provider returned, stored server-side, and only over https.
- **Timeouts:** every provider call uses `AbortSignal.timeout`, and the browser client times out too.
- **Polling:**
  - Starts at 1.2 s in mock mode or 4 s in real mode, and backs off to 3 s or 15 s.
  - Stops after 5 min (mock) or 20 min (real), or after 5 consecutive errors.
  - Cleans up on unmount.
  - The server limits provider checks to one per 1.5 s per task, however many tabs are polling.
- **Duplicate protection:**
  - The submit button is locked while a request is in flight.
  - Each submission carries a `clientRequestId`. The server deduplicates both concurrent and repeated requests.
  - After a retryable failure, the same ID is reused, so a retry can't create a second paid task.
- **Rate limiting** (per process, in memory): 8 generation requests and 30 uploads per minute per client.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` / `npm start` | Production build / serve |
| `npm run lint` | ESLint (Next.js core-web-vitals + TypeScript + React Compiler rules) |
| `npm run typecheck` | `tsc --noEmit` (strict) |
| `npm test` | Vitest suites. All BytePlus requests are mocked, so no live calls are made. |

The test suites cover:

- Request validation
- Capability checks and unsupported combinations
- Mock task creation, status transitions, failure simulation and on-disk persistence
- BytePlus payload construction
- BytePlus error normalization, timeouts and network failures
- Provider selection and environment parsing
- Deduplication, throttling and refresh behavior in the generation service
- Image validation
- Local storage

## Known limitations

- **Model capability values must be verified.** See the note under [Supported model capabilities](#supported-model-capabilities).
- **BytePlus video URLs expire** (typically after about 24 hours). History keeps the URL, so old real generations may stop playing or downloading. Cloud storage for outputs is planned (see `ImageStorage` for the pattern to follow).
- **Local storage is for one machine.** `.data/` doesn't work on serverless or ephemeral hosting. Use `MONGODB_URI` for history there; uploads would also need a cloud `ImageStorage` implementation.
- **Uploads are not cleaned up automatically.** Delete `.data/uploads` to reclaim space.
- **Rate limiting is in memory and per process.** It protects against accidental floods, but it isn't a security boundary for a public deployment.
- **Deleting a history item** doesn't cancel or delete the task at BytePlus.
- **Model availability is learned from real requests.** The app never probes BytePlus just to check status, because a probe could incur costs. The indicator shows "Not verified yet" until your first real request.
- **This is a single-user MVP.** There is no authentication. Don't expose it to the internet as is.
- **The shadcn/ui components were added by hand** (the registry was unreachable during setup). They follow the standard new-york source, and `components.json` is included, so `npx shadcn add …` works normally afterwards.
