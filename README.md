# Keel == Flaky Test Tracker

> Stop firefighting flaky tests. Keel detects, scores, and auto-quarantines flaky tests across every CI run — so your team ships faster with confidence.

[![GitHub Marketplace](https://img.shields.io/badge/Marketplace-Keel%20Flaky%20Test%20Tracker-blue?logo=github)](https://github.com/marketplace/actions/keel-flaky-test-tracker)

---

## What it does

`trykeel/keel-action` reads your JUnit XML test results after every CI run and sends them to Keel. Keel's backend detects flaky tests (same commit, pass + fail), scores them by severity, runs AI root cause analysis, and can automatically open a quarantine PR.

It **never fails your pipeline** — if the Keel API is unreachable, the action exits cleanly.

---

## Quickstart

```yaml
# .github/workflows/test.yml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run tests
        run: npm test -- --reporter=junit --outputFile=test-results/results.xml

      - name: Report to Keel
        if: always()   # run even when tests fail
        uses: trykeel/keel-action@v1
        with:
          api-key: ${{ secrets.KEEL_API_KEY }}
```

> **Tip:** Add `if: always()` so Keel receives results even on a failing run — those failures are exactly what Keel needs to detect flakiness.

---

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `api-key` | Yes | — | Your Keel API key (from app settings → API Keys) |
| `test-results-path` | No | `./test-results/**/*.xml` | Glob path to your JUnit XML files |
| `framework` | No | `auto` | Test framework hint: `jest`, `pytest`, `rspec`, `cypress`, or `auto` |
| `api-url` | No | `https://keel-api-c4xp.onrender.com` | Override for self-hosted deployments |

---

## Outputs

| Output | Description |
|--------|-------------|
| `flaky-tests-found` | Number of flaky tests detected in this run |

---

## Framework examples

### Jest
```yaml
- name: Run tests
  run: npx jest --reporters=default --reporters=jest-junit
  env:
    JEST_JUNIT_OUTPUT_DIR: test-results

- uses: trykeel/keel-action@v1
  if: always()
  with:
    api-key: ${{ secrets.KEEL_API_KEY }}
    test-results-path: './test-results/*.xml'
    framework: jest
```

### pytest
```yaml
- name: Run tests
  run: pytest --junitxml=test-results/results.xml

- uses: trykeel/keel-action@v1
  if: always()
  with:
    api-key: ${{ secrets.KEEL_API_KEY }}
    test-results-path: './test-results/results.xml'
    framework: pytest
```

### RSpec
```yaml
- name: Run tests
  run: bundle exec rspec --format RspecJunitFormatter --out test-results/results.xml

- uses: trykeel/keel-action@v1
  if: always()
  with:
    api-key: ${{ secrets.KEEL_API_KEY }}
    test-results-path: './test-results/results.xml'
    framework: rspec
```

### Cypress
```yaml
- name: Run tests
  run: npx cypress run --reporter junit --reporter-options "mochaFile=test-results/[hash].xml"

- uses: trykeel/keel-action@v1
  if: always()
  with:
    api-key: ${{ secrets.KEEL_API_KEY }}
    test-results-path: './test-results/*.xml'
    framework: cypress
```

---

## Getting your API key

1. Sign in at [trykeel.com](https://trykeel.com)
2. Complete onboarding — connect your repo
3. Go to **Settings → API Keys** → create a new key
4. Add it to your repo: **Settings → Secrets → Actions** → `KEEL_API_KEY`

---

## How flakiness is detected

Keel tracks every test result by commit SHA. When the same test **passes on one run and fails on another run at the same commit**, it's flagged as flaky. Keel then:

1. Scores severity based on flakiness rate (flaky commits / total commits)
2. Runs AI root cause analysis (async) to suggest likely causes
3. Optionally opens a quarantine PR to skip the test until it's fixed

---

## Privacy & security

- Only test **names, pass/fail status, and duration** are sent — no source code
- All data is scoped to your organisation and never shared
- API keys are per-org and can be revoked at any time

---

## License

MIT — see [LICENSE](./LICENSE)
