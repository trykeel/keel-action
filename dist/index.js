"use strict";
var fs = require("fs");
var path = require("path");

function getInput(name) {
  return process.env[`INPUT_${name.replace(/ /g, "_").toUpperCase()}`] || "";
}

// Pure Node.js recursive glob — no external deps
function findFiles(pattern) {
  const results = [];
  const cwd = process.cwd();
  const normalized = pattern.replace(/^\.\//, "").replace(/\\/g, "/");
  const segments = normalized.split("/");

  function walk(dir, segs) {
    if (!fs.existsSync(dir)) return;
    const seg = segs[0];
    const rest = segs.slice(1);

    if (seg === "**") {
      // Try consuming ** (match zero dirs) and recursing into subdirs
      if (rest.length > 0) walk(dir, rest);
      try {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          if (entry.isDirectory()) {
            walk(path.join(dir, entry.name), segs);
            if (rest.length > 0) walk(path.join(dir, entry.name), rest);
          }
        }
      } catch (_) {}
    } else if (rest.length === 0) {
      // Last segment — match files
      const re = new RegExp(
        "^" + seg.replace(/\./g, "\\.").replace(/\*/g, "[^/]*") + "$"
      );
      try {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          if (entry.isFile() && re.test(entry.name)) {
            results.push(path.resolve(path.join(dir, entry.name)));
          }
        }
      } catch (_) {}
    } else if (seg === "*") {
      try {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          if (entry.isDirectory()) walk(path.join(dir, entry.name), rest);
        }
      } catch (_) {}
    } else {
      walk(path.join(dir, seg), rest);
    }
  }

  walk(cwd, segments);
  // Deduplicate
  return [...new Set(results)];
}

// Pure Node.js JUnit XML parser — no external deps
function parseJUnitXML(filePath) {
  const content = fs.readFileSync(filePath, "utf-8");
  const tests = [];

  // Handle both <testsuites><testsuite> and bare <testsuite>
  const suiteRe = /<testsuite([^>]*)>([\s\S]*?)<\/testsuite>/g;
  let suiteMatch;

  while ((suiteMatch = suiteRe.exec(content)) !== null) {
    const suiteAttrs = suiteMatch[1];
    const suiteBody = suiteMatch[2];
    const suiteNameMatch = suiteAttrs.match(/name="([^"]*)"/);
    const suiteName = suiteNameMatch ? suiteNameMatch[1] : "";

    // Match self-closing and wrapped testcase elements
    const caseRe = /<testcase([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g;
    let caseMatch;

    while ((caseMatch = caseRe.exec(suiteBody)) !== null) {
      const attrs = caseMatch[1] || "";
      const body = caseMatch[2] || "";

      const nameMatch = attrs.match(/name="([^"]*)"/);
      const name = nameMatch ? nameMatch[1] : "unknown";

      const timeMatch = attrs.match(/time="([^"]*)"/);
      const durationMs = timeMatch
        ? Math.round(parseFloat(timeMatch[1]) * 1000)
        : undefined;

      let status = "passed";
      let failureMessage;

      if (/<failure/.test(body)) {
        status = "failed";
        const msgAttr = body.match(/<failure[^>]*message="([^"]*)"/);
        const msgText = body.match(/<failure[^>]*>([\s\S]*?)<\/failure>/);
        failureMessage =
          (msgAttr && msgAttr[1]) ||
          (msgText && msgText[1].trim()) ||
          "Test failed";
      } else if (/<error/.test(body)) {
        status = "failed";
        const msgAttr = body.match(/<error[^>]*message="([^"]*)"/);
        const msgText = body.match(/<error[^>]*>([\s\S]*?)<\/error>/);
        failureMessage =
          (msgAttr && msgAttr[1]) ||
          (msgText && msgText[1].trim()) ||
          "Test errored";
      } else if (/<skipped/.test(body)) {
        status = "skipped";
      }

      tests.push({ name, suite: suiteName, status, durationMs, failureMessage });
    }
  }

  return tests;
}

async function run() {
  const apiKey = getInput("api-key");
  const testResultsPath =
    getInput("test-results-path") || "./test-results/**/*.xml";
  const apiUrl =
    getInput("api-url") || "https://keel-api-c4xp.onrender.com";

  if (!apiKey) {
    console.error("❌ Keel: api-key input is required");
    process.exit(0);
  }

  const runId = process.env.GITHUB_RUN_ID || `local-${Date.now()}`;
  const branch = process.env.GITHUB_REF_NAME || "unknown";
  const commitSha = process.env.GITHUB_SHA || "unknown";
  const runnerOs = process.env.RUNNER_OS || "unknown";

  console.log(`🔍 Keel: scanning for test results at ${testResultsPath}`);
  const files = findFiles(testResultsPath);

  if (files.length === 0) {
    console.log("⚠️  Keel: no test result files found — skipping");
    process.exit(0);
  }

  console.log(`📊 Keel: found ${files.length} result file(s)`);
  const allTests = [];

  for (const file of files) {
    try {
      const tests = parseJUnitXML(file);
      allTests.push(...tests);
    } catch (err) {
      console.warn(`⚠️  Keel: could not parse ${path.basename(file)}: ${err}`);
    }
  }

  console.log(`✅ Keel: parsed ${allTests.length} test results`);

  const payload = { runId, branch, commitSha, runnerOs, tests: allTests };

  try {
    const response = await fetch(`${apiUrl}/ingest/results`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });
    if (response.ok) {
      console.log("✅ Keel: results reported successfully");
    } else {
      const body = await response.text();
      console.warn(`⚠️  Keel: server returned ${response.status}: ${body}`);
    }
  } catch (err) {
    console.warn(`⚠️  Keel: failed to reach API (${err}) — continuing CI`);
  }

  process.exit(0);
}

run();
