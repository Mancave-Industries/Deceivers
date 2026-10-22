# Alfred → Claude: one-click approval design (REVIEW ONLY)

**Status:** design only. No GitHub Actions workflow enabled, no secrets, no Anthropic API calls, no spending, no merges, no deployment.

## User experience

1. Mark asks Alfred to do work. Alfred creates a scoped GitHub task and a draft run proposal with task ID, repository, branch, scope, estimated maximum cost and expiry.
2. Alfred presents a single **Approve this run** control. The control must invoke a trusted, authenticated approval endpoint; it must not merely copy a prompt or toggle a GitHub issue label.
3. On approval, the trusted service verifies Mark's identity and the exact proposal, consumes the approval **once**, then queues **one** Claude Code run. No approval means no run.
4. Claude reads the GitHub issue, codes on the approved development branch, posts test evidence and a draft PR; Alfred reads results from GitHub and reports DONE/PARTIAL/FAILED.
5. Mark separately approves merge and deployment. Any new chargeable run, retry or follow-up requires another one-click approval.

## Key limitation to resolve

**This ChatGPT conversation cannot currently register a custom button that invokes GitHub Actions or Claude.** A ChatGPT display button without a connected, authorised action cannot perform a trusted paid run. Until a suitable action/connector or hosted approval endpoint exists, the nearest supported one-click control is GitHub's **Review deployments → Approve and deploy** on a protected environment, with deployment here meaning *permission to run a job*, NOT publication of the game. The wording may be confusing and must be explained before use.

GitHub environment approval is a useful human gate, but it is not a complete payment authorisation system: reviewers must see the specific estimated cost, and each execution (including re-runs) must require fresh approval. Test whether repository plan/settings support required reviewers and prevent self-approval; if not, do not enable paid execution.

## Proposed implementation phases (no costs authorised)

**Phase A — design and free checks:** inspect repository Actions policies and existing deployments; decide whether a secure approval action can be surfaced in ChatGPT or whether GitHub's approval UI is required; define per-run authorization record and cost estimate, replay protection and audit logging. No API credentials entered.

**Phase B — approval gate:** configure a protected GitHub environment and a workflow that cannot reach a chargeable Claude step until an exact-run, one-use approval is validated. Require bounded max turns, timeout, concurrency 1, no automated retries, allowlisted user, repository and branch. No untrusted issue text as executable instructions. Workflow should be pinned to reviewed immutable action SHAs.

**Phase C — test:** no-cost dry-run first. Before *each* potentially chargeable test, Alfred displays task, price estimate/upper bound, and one Approve action; explicit approval required. A £5 pilot ceiling is NOT standing approval and must not be consumed automatically.

**Phase D — production use:** Alfred submits approved issue; user presses Approve once for each individual paid run; Claude produces draft PR; Alfred reviews; separate merge/deploy consent.

## Controls and acceptance tests

- [ ] A task cannot run without a one-use approval tied to its immutable proposal ID.
- [ ] Clicking approval twice cannot start a second run.
- [ ] Reruns/retries require fresh explicit approval.
- [ ] Expired or changed tasks cannot execute under old approval.
- [ ] No secrets printed in logs or passed via issues.
- [ ] No paid action starts on label/comment/push/schedule alone.
- [ ] Branch protection prevents merge/deploy.
- [ ] Test run cannot exceed authorised scope; budget/cost estimate is disclosed before approval.
- [ ] Job Done evidence in GitHub and Alfred can read it without user copy/paste.

## Pending decisions for technical validation

1. Can a trusted ChatGPT action be connected to a one-use approval endpoint? If not, use GitHub approval UI and keep all reports in this chat.
2. Does the repo's GitHub plan support protected environments and reviewers for the chosen branch?
3. Which Anthropic auth/billing path is available and can per-run cost be estimated and bounded? No setup without separate permission.

**Existing links:** [P0 engineering task #2](https://github.com/Mancave-Industries/Deceivers/issues/2), [integration tracking #3](https://github.com/Mancave-Industries/Deceivers/issues/3).

**Approval scope:** Mark authorised *preparation only*. This document cannot be treated as authorisation to activate, incur charges, merge or deploy.
