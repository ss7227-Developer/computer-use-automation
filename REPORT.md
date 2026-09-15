# Architecture

A single TypeScript process owns one isolated browser context. Playwright drives a local, synthetic servicing application through an iframe, table layouts, labels, and visible roles; there are no test IDs or application-data API calls. This provides a small end-to-end slice without queues or distributed infrastructure. `Surface` separates observation, action, checkpoint verification, extraction, and evidence from the orchestration. The browser adapter currently uses accessibility semantics; a weakly labeled desktop surface needs another adapter, not a different replay loop.

Discovery supplies a natural-language goal, a redacted observation, and bounded action history to the OpenAI Responses API. The model chooses one currently visible control and predicts a checkpoint. The executor checks policy, performs the UI action, verifies the checkpoint, and records the verified step. A model's claim of completion is insufficient: the engine independently checks the declared success state and output types. Replay imports no planner and makes no model requests. The offline planner is explicitly labeled and is only a reproducible test fixture. It is not evidence of live model discovery.

# Artifact schema

`schemaVersion` governs parsing; `revision` identifies a capability change. The contract declares product/version/entry point, typed inputs and outputs, ordered actions, targets, per-step checkpoints, a final success predicate, and provenance. Strict Zod schemas reject extra fields, duplicate identifiers, unsupported schema versions, and undeclared input references. Fill actions contain an input name, never a recorded value. Outputs are extracted from the final UI and returned in memory; persisted results redact values.

A target contains an explicit frame name and exact role/name, label, or text. The browser adapter requires exactly one match. It does not silently choose the first element or fall back to coordinates when a semantic target fails. Runtime input values and the target origin belong to invocation/configuration, not the artifact. Operator-owned policy remains separate: an artifact cannot grant itself permission. The demonstrated contract is intentionally narrow: look up a member, open savings review, return a numeric USD balance.

# Determinism & error handling

Determinism means a fixed sequence of actions, target resolution, bounded waits, and checks; runtime timing is not identical. Each action is followed by a checkpoint. Not-found and invalid member IDs return `business_outcome`. Known transient failure permits one safe lookup retry; slow rendering gets a bounded polling window. Permission denial, session expiry, application failure, ambiguous targets, unrecognized dialogs, denied navigation, and checkpoint timeout return explicit failures with step, expectation, observed classification, and a redacted structural DOM snapshot. Raw Playwright exceptions can contain sensitive text, so they are never persisted.

The executor never retries an arbitrary click after a timeout: the application may already have applied it. Instead, a human restores the paused step's postcondition. After resume the checkpoint is re-evaluated before later steps execute. Success additionally requires valid output conversion. Browser tests exercise actual Chromium pages, both synthetic member inputs, business outcomes, recovery, hard failures, ambiguity, premature model completion, and live-session control transfer.

# Heterogeneity & multi-tenant

The schema identifies intent separately from browser objects. An accessibility adapter can map role/name targets into native OS accessibility nodes. For a legacy surface with no usable semantics, extend the target union with a reviewed visual-anchor recipe and region-relative offsets; require unique anchor matches, window/version checks, and a visual postcondition. Blind absolute coordinates are not a safe fallback. The implemented iframe/table app demonstrates weak layout coupling, but not arbitrary inaccessible applications.

At scale, use a vendor/product/version capability family plus a tenant binding for origin, frame mapping, permitted routes, locale, and reviewed target overrides. Bindings should only narrow policy. Persist the effective artifact/binding revision and hash for each run; canary replay against synthetic records gates rollout. A mismatch should quarantine that tenant/version, not trigger automatic model repair in production. Fleet orchestration, binding resolution, visual targeting, and drift canaries are design seams, not claimed implementations. Current replay explicitly rejects another product/version.

# Escalation & handoff

Control states are `automation -> pending -> human -> automation` or terminal `closed`. The engine awaits an intervention promise; automation actions fail unless automation owns the lease. A loopback operator page requires a random per-intervention token, validates Host/Origin, supports explicit claim/resume/abort, and expires after a timeout. The operator acts on the same open browser page and context. UI events record action kind and only reviewed public control names; input values are omitted. Evidence records the request, state, ownership transitions, and manual actions. The CLI uses a headed browser for a person; tests simulate the operator and label that simulation.

Resuming cannot skip a checkpoint or imply that a risky action was authorized for future automation. Risky controls remain blocked by policy. This is a single-process lease and an operator protocol, not a tamper-proof remote-control service: a person with desktop access can physically interfere before claiming. Production needs authenticated operators, session isolation, durable leases, audit integrity, and a controlled streaming/input proxy.

# Safety

An exact origin/route allowlist checks initial navigation, frame access, and browser HTTP requests. Unknown controls and risky controls are blocked; WebSockets, popups, downloads, and unexpected dialogs stop the run. The model cannot alter policy or execute code. The local application contains only synthetic records. Model observations expose reviewed public states and control names, not account values. Parameters are resolved locally; known parameter values are removed from the goal before a model call. Goals must still contain only the intended task, with sensitive data passed as parameters.

Logs use controlled event fields and omit raw prompts, model prose, browser exceptions, credentials, and extracted values. Failure evidence stores a structural DOM tree without text/attributes plus reviewed state names. The API request sets `store:false`; this is not a claim of zero provider retention. A regulated deployment also needs approved model data controls, retention limits, transport/host isolation, authentication, and output handling at the caller. UI policy cannot prove what an arbitrary site's click does; the reviewed adapter and app version are part of the trust boundary.

# Cuts

Implemented one application profile, one contract, a small operator page, one recovery rule, and a serial executor. Omitted visual perception, desktop control, tenant bindings, approval workflows, distributed workers, and generic self-healing. These would add breadth before improving this slice. Priorities next: enforce signed reviewed artifacts/bindings, stronger transaction identity assertions, operator authentication and durable control leases, then a second vendor/version adapter. The most important deliverable is verified live-model evidence; offline fixture output alone does not satisfy that requirement.
