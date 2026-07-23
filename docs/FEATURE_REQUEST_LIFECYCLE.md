# Feature Request Lifecycle

Each Discord forum thread under the feature-request board maps to one `FeatureRequest` row.

```
gathering_info --(Claude marks ready)--> pending_approval
pending_approval --(approver comments "Approved")--> approved
approved --(repository_dispatch fired)--> dev_in_progress
dev_in_progress --(feature-dev.yml opens PR)--> pr_open
pr_open --(human merges PR)--> merged
merged --(Railway auto-deploy completes)--> deployed

pending_approval --(approver rejects, or thread abandoned)--> rejected
```

## Status definitions

| Status             | Meaning                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------ |
| `gathering_info`   | Bot is asking the OP clarifying questions; only OP replies advance this state.                   |
| `pending_approval` | Claude judged the request complete; waiting on `APPROVER_DISCORD_USER_ID` to comment `Approved`. |
| `approved`         | Approval detected; `repository_dispatch` is about to fire (or just fired).                       |
| `dev_in_progress`  | GitHub Actions is running the coding agent.                                                      |
| `pr_open`          | PR exists; awaiting AI review + human merge.                                                     |
| `merged`           | PR merged to `main`; Railway deploy triggered.                                                   |
| `deployed`         | Railway confirmed the new build is live; bot posts confirmation in the thread.                   |
| `rejected`         | Request will not be built (explicit rejection or abandoned during triage).                       |

## What gets persisted

`FeatureRequestEvent` only logs messages from the OP and from the bot itself — replies from
other server members are read (so the bot can tell they aren't the OP) but are never stored or
passed to Claude. This keeps the audit trail limited to what actually drove a triage decision.
