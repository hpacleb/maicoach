# MaiCoach

**Make every credit count.** A personal practice companion for maimai DX International, built by Harvey Pacleb with React, TypeScript, and LangChain.

MaiCoach turns recorded scores and a credit budget into a session of warmups, focused achievement targets, and discovery charts. The planner owns the numbers. Optional AI explains the session using a small, traceable exercise library.

![MaiCoach dashboard](docs/screenshots/overview.png)

## Try it

The intended deployment is **https://maicoach.harveypacleb.com**. DNS and a host-specific certificate must be configured before that URL is available.

No account is needed. The default demo uses real international charts with clearly labeled synthetic scores. Switch to **Start my profile** to record your own results. Demo scores never overwrite your personal profile.

## Features

- **International-only library:** 6,288 playable charts across 1,465 songs in the initial DXRating snapshot, selected for CiRCLE PLUS. International overrides take precedence over version-specific and base constants.
- **Session planner:** 1–12 credits, three tracks per credit, a constant range, a goal, and a self-selected practice focus. No duplicate chart identities within a plan.
- **B50 calculations:** best 35 old charts and 15 current-version charts; achievement boundary coefficients, integer arithmetic, AP bonus, and sequential replacement projections.
- **Score tracking:** local browser persistence, manual logging, validated JSON import/export, best-result merging, and a B50 breakdown.
- **Grounded coaching:** a LangChain prompt chain, retrieval of relevant exercise notes, and schema-validated model output. The computed plan stays read-only to the model.
- **Honest fallback:** a usable deterministic planner and exercise guidance when no provider is configured. The UI never describes this fallback as live AI.
- **Small VPS deployment:** prebuilt React assets and one Node process behind an isolated Nginx host; systemd memory limits and atomic release switching.

## Local development

Node 22+ is required; CI uses Node 24.

```bash
npm ci
npm run build
npm start
```

Open http://127.0.0.1:3107. For hot reload, use two terminals:

```bash
npm run dev
npm run dev:web
```

Vite proxies `/api` to the local Node service. A catalog snapshot is checked in, so starting the app requires no upstream API call.

## Enable AI coaching

Copy `.env.example` to `.env` locally. Set `OPENAI_API_KEY` privately and select an available model with `AI_MODEL`. The default is `gpt-4o-mini`. Never commit credentials. For the VPS, edit the root-only `/etc/maicoach.env` and restart `maicoach.service`.

`AI_BASE_URL` optionally selects an OpenAI-compatible provider supporting strict JSON-schema output. Provider compatibility and a live model call must be checked after configuring credentials. Without them, the initial deployment intentionally stays in planner mode; a paid live-model call was not verified during initial setup.

The AI path is intentionally bounded:

1. Validate scores, international chart identities, and settings.
2. Compute chart selection, achievement targets, and sequential B50 deltas in TypeScript.
3. Retrieve exercise notes by the selected focus and session phases.
4. Pass a bounded plan summary, those sources, and the question to a LangChain prompt/model chain.
5. Parse structured `summary`, `tips`, and `answer` fields; display the retrieved sources.
6. Fall back visibly to exercise-library guidance on provider failure.

The model cannot change rating data or write scores. Scores and note counts cannot diagnose specific technique weaknesses. Prompt instructions and structured output reduce errors but cannot guarantee factual prose; check answers against the displayed sources.

AI requests have a per-IP limit of 10/hour, a concurrency cap of two, a 25-second provider timeout, and a default process-local budget of 100 attempted calls per UTC day. The budget resets on service restart. Set provider-side spending controls if enabling public paid inference. Request contents and upstream errors are not logged by the application. If using Cloudflare proxying, see the real-IP note in [deployment documentation](docs/deployment.md).

## Data and rating provenance

Data from [DXRating](https://dxrating.net), fetched from [its public catalog](https://miruku.dxrating.net/api/v1/dxdata). Each chart has a source link, and the app exposes the snapshot timestamp and SHA-256 checksum.

The international version and rating behavior were checked against [DXRating revision `8d82f8d`](https://github.com/gekichumai/dxrating/tree/8d82f8d997a5d31664c4cd0f0c9a7d86c809ebfc). Only sheets with `serverIds` containing `intl` are retained. Special/Utage charts are excluded. Constants resolve in this order: international override, selected-version value, base value. From CiRCLE onward, upstream's B15 pool includes the selected version and its immediate predecessor: CiRCLE PLUS therefore includes CiRCLE and CiRCLE PLUS. Available charts from a newer Japanese version also count in the recent international bucket, following upstream's current-region rule.

To refresh the snapshot:

```bash
npm run sync:data
```

Before changing release, verify DXRating's current international region version, then run:

```bash
DXRATING_INTL_VERSION='CiRCLE PLUS' npm run sync:data
npm test
npm run build
```

Refresh is explicit rather than a production cron. Failed fetches, invalid schemas, duplicate chart IDs, or implausibly small catalogs leave the previous snapshot intact. A refresh does not silently change the selected international release. `sourceCommit` records the revision used to verify the release/rating behavior, not the live catalog publication's Git revision.

## Score import

Use an exported MaiCoach file or an array in this format:

```json
{
  "region": "intl",
  "scores": [
    { "chartId": "dsht_REPLACE_ME", "achievement": 99.4321, "combo": "fc" }
  ]
}
```

Get a real chart ID from an export or the app's downloadable example. Achievement must be 0–101 with at most four decimal places. Bad JSON, another region, oversized files, and unknown international chart IDs reject the entire import. Existing profile results are merged by highest chart rating, with achievement as a tiebreaker. Native MaiCoach JSON is supported; arbitrary B50 screenshots and third-party export formats are not parsed in this version.

Scores stay in `localStorage`. Export before clearing browser data or moving devices. Planning sends scores to the stateless server; live AI additionally sends selected plan details and the player's question to the provider. There is no server-side score database.

## Verification

```bash
npm test                  # Node tests: rating math, normalization, planner, imports, API
npm run build             # Strict TypeScript check + production builds
npx playwright install chromium
npm run test:e2e          # Desktop/mobile journeys and screenshots
npm audit
```

Tests cover B35/B15 limits, AP and boundary values, international overrides, Japan-only exclusion, exact sequential gain projections, malformed inputs, profile isolation, persistence, import failure, search, responsive layout, and truthful fallback mode. CI runs these checks on pushes and pull requests. The live paid-provider path needs configured credentials and a provider smoke test.

See [the API contract](docs/api.yaml), [deployment guide](docs/deployment.md), and [third-party notices](THIRD_PARTY_NOTICES.md).

## Project layout

```text
src/              React UI and browser-local score storage
shared/           Types, validation, rating math, planner, exercise library
server/           Express API and LangChain coaching
scripts/          International catalog refresh
data/             Verified, normalized catalog snapshot
tests/            Unit/API tests and Playwright journeys
deploy/           Nginx host, systemd unit, atomic deployment script
docs/             API contract, operations, screenshots
```

MIT for MaiCoach code. Game content belongs to SEGA and its respective rights holders. This is an independent fan project, unaffiliated with SEGA or DXRating.
