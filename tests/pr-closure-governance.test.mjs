import assert from "node:assert/strict";
import test from "node:test";

import { classifyPullRequestClosure, closurePolicy } from "../scripts/verify-pr-closure-governance.mjs";

const pullRequest = ({ body = "", labels = [] } = {}) => ({
  pull_request: {
    body,
    labels: labels.map((name) => ({ name })),
  },
});

const completionChecklist = ({ parentIssue = 64, layers = [] } = {}) => `
<!-- vector-completion-review
${JSON.stringify({
  parentIssue,
  acceptanceCriteria: closurePolicy.governedParents
    .find((parent) => parent.number === parentIssue)
    .requiredAcceptanceCriteria.map((id) => ({ id, evidence: "review record" })),
  testLayers: layers.map((name) => ({ name, result: "passed", evidence: "test artifact" })),
  omittedLayers: [],
})}
-->
`;

test("a feature slice may reference a governed parent without closing it", () => {
  assert.deepEqual(
    classifyPullRequestClosure(pullRequest({ body: "Refs #64\n\nRemaining acceptance criteria: route following." })),
    { kind: "slice", governedParentIssues: [] },
  );
});

test("a feature slice cannot close a governed parent", () => {
  assert.throws(
    () => classifyPullRequestClosure(pullRequest({ body: "Fixes #64" })),
    /cannot close governed parent issue #64.*completion-review/i,
  );
});

test("a feature slice cannot close every governed capability parent", () => {
  assert.throws(
    () => classifyPullRequestClosure(pullRequest({ body: "Fixes #67" })),
    /cannot close governed parent issue #67.*completion-review/i,
  );
});

test("a documentation example does not close a governed parent", () => {
  assert.deepEqual(
    classifyPullRequestClosure(pullRequest({ body: "Write `Fixes #67` only as a policy example." })),
    { kind: "slice", governedParentIssues: [] },
  );
});

test("a completion-review label without a machine-readable checklist cannot close a parent", () => {
  assert.throws(
    () =>
      classifyPullRequestClosure(
        pullRequest({ body: "Resolves #41", labels: ["completion-review"] }),
      ),
    /machine-readable completion checklist/i,
  );
});

test("an insufficient completion checklist cannot close a governed parent", () => {
  assert.throws(
    () =>
      classifyPullRequestClosure(
        pullRequest({
          body: `Closes #64${completionChecklist({ parentIssue: 64, layers: ["unit-numerical"] })}`,
          labels: ["completion-review"],
        }),
      ),
    /missing required test layers.*lifecycle-conservation/i,
  );
});

test("a guarded completion review must identify exactly the closed governed parent", () => {
  const layers = [
    "unit-numerical",
    "lifecycle-conservation",
    "configuration-contrast",
    "contract",
    "parity",
    "worker",
    "browser",
    "performance",
    "regression",
  ];
  assert.throws(
    () =>
      classifyPullRequestClosure(
        pullRequest({
          body: `Closes #64 and Fixes #41${completionChecklist({ parentIssue: 64, layers })}`,
          labels: ["completion-review"],
        }),
      ),
    /exactly one governed parent/i,
  );
});

test("a complete guarded checklist is exposed as a completion review", () => {
  const layers = [
    "unit-numerical",
    "lifecycle-conservation",
    "configuration-contrast",
    "contract",
    "parity",
    "worker",
    "browser",
    "performance",
    "regression",
  ];
  assert.deepEqual(
    classifyPullRequestClosure(
      pullRequest({
        body: `Closes #64${completionChecklist({ parentIssue: 64, layers })}`,
        labels: ["completion-review"],
      }),
    ),
    { kind: "completion-review", governedParentIssues: [64] },
  );
});

test("non-pull-request events are not classified as pull-request closure reviews", () => {
  assert.deepEqual(classifyPullRequestClosure({ ref: "refs/heads/main" }), {
    kind: "not-applicable",
    governedParentIssues: [],
  });
});
