# MaiCoach maintainer handoff

MaiCoach is a standalone AI portfolio project for Harvey Christian Pacleb: a maimai DX International practice planner with browser-local score tracking and bring-your-own-key coaching. The requested app, BYOK support, HTTPS deployment, and DXRating-inspired theme are complete. This handoff records the verified state on **2026-11-11**; no implementation request is outstanding.

## Start here

| Item                           | Value                                                      |
| ------------------------------ | ---------------------------------------------------------- |
| Live app                       | https://maicoach.harveypacleb.com/                         |
| Public repository              | https://github.com/hpacleb/maicoach                        |
| Local checkout                 | `/Users/hcpacleb/PhpstormProjects/maicoach`                |
| Last deployed app commit       | `4be2b2dce0a9f9af3328d5bc79fb1c47db4b6147`                 |
| Active release at verification | `/var/www/maicoach/releases/20261111T100932Z-4be2b2dce0a9` |
| API readiness                  | `GET /api/health`, returns `aiMode: "byok"`                |

The correct hostname includes the **y** in **harvey**. The earlier spelling `maicoach.harvepacleb.com` did not resolve.

Use **`hpacleb`** for GitHub ownership and commit attribution. The final user correction explicitly selected this account. The checkout has repository-local Git settings:

```text
user.name = Harvey Christian Pacleb
user.email = 24486552+hpacleb@users.noreply.github.com
```

The OS username and workspace path contain `hcpacleb`; that is distinct from the requested GitHub identity. Preserve these local settings rather than changing global Git configuration.

The separately cloned `/Users/hcpacleb/PhpstormProjects/harvey-portfolio` is not this application. No portfolio integration was requested or implemented.

## Product state

- Overview with an explicitly labeled demo profile using real chart identities and synthetic achievements.
- Personal score logging, local persistence, native MaiCoach JSON import/export, and a recorded B50 breakdown. Switching profiles does not overwrite personal scores.
- International chart search with difficulty, type, and level filters.
- Session planning for 1–12 credits, three tracks per credit, a constant range, goals, and a self-selected focus. Sessions contain warmups, achievement targets, and exploration charts.
- Optional LangChain coaching using the computed plan and a small exercise library, with visible fallback guidance and sources.
- BYOK settings for OpenAI or a custom OpenAI-compatible endpoint, model ID, and output mode.
- A light mint canvas, teal accents, translucent light panels, rounded controls, self-hosted Nunito, and matching favicon. The user clarified that the DXRating request concerned the **theme**; the existing layout and functionality were preserved.

Recent app commits:

| Commit    | Change                                                                         |
| --------- | ------------------------------------------------------------------------------ |
| `10eeb91` | Initial app, international catalog, rating math, planner, deployment and tests |
| `66065e4` | BYOK, compatible endpoints, guarded HTTPS relay and provider tests             |
| `4be2b2d` | DXRating-inspired mint and teal theme                                          |

## Development and source map

Use Node 24 to match CI and production; the package declares Node 22 or later.

```bash
cd /Users/hcpacleb/PhpstormProjects/maicoach
npm ci
npm run build
npm start
```

The production-style local app serves at `http://127.0.0.1:3107`. For hot reload, run `npm run dev` and `npm run dev:web` in separate terminals; Vite proxies `/api` to Node.

| Files                                                         | Responsibility                                            |
| ------------------------------------------------------------- | --------------------------------------------------------- |
| `src/App.tsx`                                                 | Views, profiles, score editor, planning and coaching UI   |
| `src/storage.ts`                                              | Score storage, import validation, exports and demo scores |
| `src/ProviderSettings.tsx`, `src/provider.css`                | Provider dialog and non-secret preferences                |
| `src/styles.css`, `public/fonts/`, `public/favicon.svg`       | Theme, font assets and favicon                            |
| `shared/rating.ts`, `shared/planner.ts`                       | B50 math, chart selection and sequential projections      |
| `shared/normalize.ts`, `scripts/sync-catalog.ts`              | International catalog normalization and refresh           |
| `shared/validation.ts`, `shared/types.ts`, `shared/drills.ts` | Contracts, input validation and exercise notes            |
| `server/app.ts`, `server/coach.ts`, `server/provider.ts`      | API, LangChain chain and restricted provider transport    |
| `data/catalog.json`                                           | Checked-in catalog snapshot and provenance                |
| `tests/`, `.github/workflows/ci.yml`                          | Core/API/provider tests, browser journeys and CI          |

Additional references: [README](README.md), [API contract](docs/api.yaml), [deployment and rollback guide](docs/deployment.md), and [third-party notices](THIRD_PARTY_NOTICES.md).

## International data and rating rules

The snapshot contains **6,288 charts / 1,465 songs** for **CiRCLE PLUS**, with region `intl`. Its source update time is `2026-11-11T09:00:26.510755231+00:00`; it was fetched at `2026-11-11T09:28:53.346Z`.

Source: `https://miruku.dxrating.net/api/v1/dxdata`. The snapshot records a checksum and the upstream revision used to verify release and rating behavior: `8d82f8d997a5d31664c4cd0f0c9a7d86c809ebfc`. That revision identifies the rule verification, not the live catalog publication.

- Include only sheets whose `serverIds` contain `intl`; exclude special/Utage charts.
- Resolve constants by international override, then selected-version value, then base value.
- B50 selects 35 old and 15 recent charts. From CiRCLE onward, upstream includes the selected release and its immediate predecessor in B15. For CiRCLE PLUS, both CiRCLE and CiRCLE PLUS belong to the recent pool; later Japanese-release charts already available internationally also belong there.
- Rating uses integer arithmetic, achievement boundary coefficients, a 100.5% cap for rating, and the AP bonus.
- Plan deltas are sequential hypothetical B50 replacements. They assume targets are achieved and must not be presented as guaranteed gains.
- Fewer than 50 selected entries produces an explicitly partial recorded total, not a verified account rating. Unplayed charts use a provisional 97% target, not an ability prediction.

Refresh manually with `npm run sync:data`. Before changing release, verify DXRating's current international version, then set `DXRATING_INTL_VERSION` for the refresh. The selected release does not update automatically. Failed fetches, invalid data or implausibly small catalogs preserve the old snapshot. Run relevant tests and rebuild before deploying refreshed data.

## BYOK and privacy boundaries

There is **no shared server API key** and no owner credential setup pending. Visitors configure their own provider in **AI settings**. Legacy server `OPENAI_API_KEY`, `AI_MODEL`, and `AI_BASE_URL` values are ignored.

Keys live in React memory for the current tab. Reloading, closing the tab, or choosing **Forget key** clears the app's key. Changing the endpoint clears the draft key. Only endpoint, model, and output-mode preferences are saved in browser storage. Keys are excluded from score/session exports.

Coaching requests relay the supplied key over HTTPS through the stateless server to the selected provider. The app does not persist or log keys or coaching payloads. Provider usage charges and data handling belong to the visitor's selected provider. Nginx access logs contain ordinary connection metadata, including IP addresses.

Standard mode uses Chat Completions, requests JSON in the prompt, and validates the response without requiring `response_format`. Optional strict mode uses JSON-schema output for models that support it. The model explains a deterministic plan; it does not select arbitrary tools or alter computed rating values. Invalid provider responses visibly fall back to exercise-library guidance.

The relay permits public HTTPS endpoints on port 443. It rejects URL credentials, query parameters, fragments, local/private/link-local/reserved addresses, and mixed public/private DNS answers. Connections use a checked IP while retaining TLS hostname verification; redirects are blocked. Local Ollama/LM Studio endpoints are not supported through this hosted relay.

Operational limits: 30 planning requests/minute per IP; 10 coaching requests/hour per IP; two concurrent provider requests; five-second DNS deadline; 25-second provider timeout; no SDK retries; 128 KiB upstream request and 256 KiB upstream response bounds. The app's general JSON body limit is 2 MB. Cloudflare real-IP trust is scoped to MaiCoach's Nginx host.

## Deployment and operations

SSH access authorized by the user: `ssh root@ssh.food21services.com`. Origin IPv4: `168.144.128.161`. This is a small shared VPS with the existing portfolio and Food21 websites; builds run locally and deployment affects MaiCoach's dedicated service and host.

| Resource             | Location                                                  |
| -------------------- | --------------------------------------------------------- |
| App listener         | `127.0.0.1:3107`                                          |
| Current release link | `/var/www/maicoach/current`                               |
| Release history      | `/var/www/maicoach/releases/`                             |
| systemd unit         | `/etc/systemd/system/maicoach.service`                    |
| Runtime environment  | `/etc/maicoach.env`, root-only; normally just `PORT`      |
| Nginx host           | `/etc/nginx/sites-available/maicoach.harveypacleb.com`    |
| Cloudflare IP trust  | `/etc/nginx/snippets/maicoach-cloudflare-realip.conf`     |
| Logs                 | `/var/log/nginx/maicoach.*.log`, `journalctl -u maicoach` |
| TLS certificate      | `/etc/letsencrypt/live/maicoach.harveypacleb.com/`        |

Cloudflare has a proxied A record for `maicoach`. The existing firewall permits web traffic only from Cloudflare, so DNS-only access would not work for ordinary external visitors. Preserve the other hosts' DNS, TLS and firewall behavior.

HTTPS is active, HTTP redirects to HTTPS, and `certbot.timer` is active. The certificate observed at handoff expires on **2027-02-09**, with automatic renewal configured. Do not put certificate private keys or visitor credentials in the repository or handoff.

The service uses a dynamic unprivileged user, read-only filesystem, a 128 MB V8 heap setting, 160 MB memory-high threshold, 192 MB memory ceiling, and 50% CPU quota.

For intended, committed changes:

```bash
npm run test:e2e
bash deploy/deploy.sh
```

The deployment script runs core tests and a local build, uploads production artifacts, installs production dependencies remotely, switches the release symlink, and checks app and Nginx health. It preserves Certbot's existing host configuration. `bash deploy/deploy.sh --prebuilt` is available only when current artifacts have already been built and checked. Pushes run CI but do **not** deploy automatically. Documentation-only changes do not need an app deployment.

The script restores the prior app release on an app health failure where one exists. Nginx configuration and environment files are outside app rollback; use the detailed [operations guide](docs/deployment.md) for manual rollback and diagnostics. Leave old releases available until intentionally cleaning them up.

## Verification and limits

The deployed app commit passed [CI run 43001233432](https://github.com/hpacleb/maicoach/actions/runs/43001233432): **14 core/API/provider tests**, **five browser journeys**, TypeScript/build checks, and the production dependency audit. The last full dependency audit also found zero vulnerabilities.

Live checks at handoff confirmed the health endpoint, active service with no restarts, active certificate renewal timer, and HTTP 200 for MaiCoach, `harveypacleb.com`, and `food21services.com`. The deployed theme and BYOK dialog were also checked in a browser.

Provider tests exercise the real LangChain chain with deterministic transport fixtures for both output modes, request isolation, and secret redaction. A real OpenAI HTTPS transport check with an intentionally invalid key returned 401. **Successful paid inference with a real visitor key has not been verified**; do not mistake the fixture results or `aiMode: "byok"` for proof that a particular provider/model/account works.

Existing product limits, not outstanding requests:

- Scores are browser-local; there is no account system, server score database, or cross-device sync.
- Imports support native MaiCoach JSON, not arbitrary screenshots or third-party B50 formats.
- Practice notes are general exercises, not a reviewed chart-pattern database. Achievement percentages and note counts cannot diagnose technique.
- The catalog and selected international release require manual maintenance.
- The UI currently uses one light theme; a theme switcher was not requested.

For the next session, inspect `git status` and current production/CI state before editing. This handoff is an operational snapshot, not a request to start additional work.
