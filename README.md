# Computer-use capabilities

TypeScript implementation of a goal-driven discovery and deterministic replay system for a synthetic legacy servicing UI.

Implementation is being delivered in tested increments. Setup: Node.js 22+, `npm ci`, `npx playwright install chromium`, `npm run check`.

The initial milestone defines the capability contract, operator-owned policy, and local iframe-based demo app. The schema and policy tests pass. Browser runtime, discovery, handoff and full documentation follow in subsequent commits.
