"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// src/index.ts
var fs = __toESM(require("fs"));
var path = __toESM(require("path"));
var import_glob = require("glob");
var import_fast_xml_parser = require("fast-xml-parser");
function getInput(name) {
  return process.env[`INPUT_${name.toUpperCase().replace(/-/g, "_")}`] || "";
}
function parseJUnitXML(filePath) {
  const content = fs.readFileSync(filePath, "utf-8");
  const parser = new import_fast_xml_parser.XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
  const result = parser.parse(content);
  const tests = [];
  const suites = result.testsuites?.testsuite || result.testsuite;
  const suiteArray = Array.isArray(suites) ? suites : [suites];
  for (const suite of suiteArray) {
    if (!suite) continue;
    const suiteName = suite["@_name"] || "";
    const cases = suite.testcase;
    if (!cases) continue;
    const caseArray = Array.isArray(cases) ? cases : [cases];
    for (const tc of caseArray) {
      if (!tc) continue;
      const name = tc["@_name"] || "unknown";
      const durationMs = tc["@_time"] ? Math.round(parseFloat(tc["@_time"]) * 1e3) : void 0;
      let status = "passed";
      let failureMessage;
      if (tc.failure) {
        status = "failed";
        failureMessage = typeof tc.failure === "string" ? tc.failure : tc.failure["@_message"] || tc.failure["#text"] || "Test failed";
      } else if (tc.error) {
        status = "failed";
        failureMessage = typeof tc.error === "string" ? tc.error : tc.error["@_message"] || tc.error["#text"] || "Test errored";
      } else if (tc.skipped !== void 0) {
        status = "skipped";
      }
      tests.push({
        name,
        suite: suiteName,
        status,
        durationMs,
        failureMessage
      });
    }
  }
  return tests;
}
async function run() {
  const apiKey = getInput("api-key");
  const testResultsPath = getInput("test-results-path") || "./test-results/**/*.xml";
  const apiUrl = getInput("api-url") || "https://api.keel.dev";
  if (!apiKey) {
    console.error("\u274C Keel: api-key input is required");
    process.exit(0);
  }
  const runId = process.env.GITHUB_RUN_ID || `local-${Date.now()}`;
  const branch = process.env.GITHUB_REF_NAME || "unknown";
  const commitSha = process.env.GITHUB_SHA || "unknown";
  const runnerOs = process.env.RUNNER_OS || "unknown";
  console.log(`\u{1F50D} Keel: scanning for test results at ${testResultsPath}`);
  const files = await (0, import_glob.glob)(testResultsPath, { absolute: true });
  if (files.length === 0) {
    console.log("\u26A0\uFE0F  Keel: no test result files found \u2014 skipping");
    process.exit(0);
  }
  console.log(`\u{1F4CA} Keel: found ${files.length} result file(s)`);
  const allTests = [];
  for (const file of files) {
    try {
      const tests = parseJUnitXML(file);
      allTests.push(...tests);
    } catch (err) {
      console.warn(`\u26A0\uFE0F  Keel: could not parse ${path.basename(file)}: ${err}`);
    }
  }
  console.log(`\u2705 Keel: parsed ${allTests.length} test results`);
  const payload = {
    runId,
    branch,
    commitSha,
    runnerOs,
    tests: allTests
  };
  try {
    const response = await fetch(`${apiUrl}/ingest/results`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload)
    });
    if (response.ok) {
      console.log("\u2705 Keel: results reported successfully");
    } else {
      const body = await response.text();
      console.warn(`\u26A0\uFE0F  Keel: server returned ${response.status}: ${body}`);
    }
  } catch (err) {
    console.warn(`\u26A0\uFE0F  Keel: failed to reach API (${err}) \u2014 continuing CI`);
  }
  process.exit(0);
}
run();
