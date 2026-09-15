# Computer-use capabilities

An LLM discovers a flow through a synthetic legacy servicing UI. Verified actions become a typed capability, and production replay executes that capability without an LLM.

The demo searches for a member, opens the record, reaches a read-only savings review, and returns a typed balance. It uses a real Chromium browser, an iframe, table layouts, and exact semantic targets. It includes runtime error injection, policy enforcement, redacted evidence, and operator handoff on the same browser session.

## Setup

Requires Node.js 22 or later and Chromium's system dependencies.

```sh
npm ci
npx playwright install --with-deps chromium
npm run check
```

On a desktop with Chrome already installed, `BROWSER_EXECUTABLE_PATH` can point to that binary. Headed handoff needs a graphical desktop. On restricted hosts that prevent Chromium processes, use the included Linux GitHub Actions workflow; browser launch failures are not skipped tests.

## Demo without a model key

```sh
npm run demo -- --evidence work/demo
```

This starts the local application, performs **fixture-driven** discovery, saves a capability, and replays it with a different member input. It is an offline integration demo, **not live LLM evidence**. Copy the printed capability path for subsequent commands.

## Live discovery and deterministic replay

Set `OPENAI_API_KEY` in the environment. The optional `OPENAI_MODEL` defaults to `gpt-4.1-mini`; the model must support structured outputs in the Responses API. Never put a key in a command committed to Git or in an evidence file. `.env` is ignored, but not automatically loaded; use your shell or `node --env-file=.env --import tsx src/cli.ts discover`.

```sh
npm run discover -- --member M001 \
  --goal "Find the supplied member, open savings review, and read the balance." \
  --evidence work/discovery

# Use the artifact path printed by the command above:
npm run replay -- --artifact work/discovery/RUN_ID/capability.json \
  --member M002 --evidence work/replay
```

Each command starts an isolated local application by default. `npm run app` serves it at `http://127.0.0.1:3000`; `--target http://127.0.0.1:3000` uses that existing instance. The supported profile is the included Northstar training app, not arbitrary websites. Inputs are synthetic: `M001` and `M002` exist; `M999` does not. Pass sensitive inputs as parameters, never in the goal.

The library's `replay()` returns `{status:'success', outputs:{savings_balance:...}}`, `{status:'business_outcome',code,step}`, or `{status:'failure',code,step,expected,observed,evidence}`. The CLI and saved evidence redact output values. Failure returns exit code 1; an expected business outcome is not a process failure.

## Runtime outcomes

```sh
npm run replay -- --artifact PATH/capability.json --member M999
npm run replay -- --artifact PATH/capability.json --scenario transient
npm run replay -- --artifact PATH/capability.json --scenario permission
```

| Scenario | Behavior |
| --- | --- |
| `normal` | Verified review, typed balance returned |
| `not_found` / `validation` | Expected business outcome |
| `transient` | One permitted lookup retry, then checkpoint |
| `slow` | Bounded wait for result rendering |
| `permission` / `app_error` | Explicit hard failure |
| `expired` | Intervention when enabled; otherwise failure |
| `dialog` | Dismiss unexpected dialog and stop |

## Operator handoff

```sh
npm run replay -- --artifact PATH/capability.json \
  --scenario expired --headed --operator
```

1. Open the temporary operator URL printed by the CLI.
2. Click **Claim session**. Automation is paused.
3. In the already-open training browser, click **Restore training session**.
4. Return to the operator page and click **Resume automation**.

The engine verifies the pending overview checkpoint, continues to savings review, and records control transitions and the manual action. Resume before claim returns 409. Requests expire after two minutes. The included test drives the operator actions automatically and explicitly labels them as simulated. The operator URL contains a temporary token; do not publish it.

## Evidence and verification

`npm run evidence` generates an offline discovery and four replay runs. `npm run evidence -- --live` uses the model for discovery; replay remains model-free. `EVIDENCE_ROOT` selects the destination, defaulting to `evidence/`.

The **Verify computer-use capability** workflow runs type checks, unit/browser tests, and the offline demo. **Live model discovery evidence** requires a repository Actions secret named `OPENAI_API_KEY`. Run it from Actions, or let its initial workflow-file push trigger it. Download its artifact to inspect the successful capability, response IDs, redacted action logs, output outcomes, and failure DOM evidence. The evidence index records which runs are real model runs and which are fixtures.

Tests cover parameterized replay, all listed scenarios, strict targeting, risky-action blocking, control ownership, same-page resume, premature completion, step bounds, and sensitive-value exclusion. See [REPORT.md](REPORT.md) for the seven required design sections and explicit limitations.

## Code map

- `src/schema.ts`: strict capability contract and result types
- `src/surface.ts`: Playwright adapter and structural evidence
- `src/policy.ts`, `src/profile.ts`: operator policy and app bindings
- `src/discovery.ts`, `src/planner.ts`: bounded discovery and model adapter
- `src/engine.ts`: replay, checkpoint polling, error taxonomy
- `src/handoff.ts`: operator control lease and loopback console
- `src/demo-app.ts`: synthetic legacy UI and injected failures

## References

Implementation references: [Playwright locators](https://playwright.dev/docs/locators), [frame locators](https://playwright.dev/docs/api/class-framelocator), and [OpenAI Responses API](https://platform.openai.com/docs/api-reference/responses/create). `store:false` disables response storage; it is not a guarantee of zero provider retention. Only synthetic demo data is used here.
