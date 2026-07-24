# Feature Request Lifecycle

Each Discord forum thread under the feature-request board maps to one `FeatureRequest` row.

```
gathering_info --(Claude marks ready)--> confirming_summary
confirming_summary --(OP confirms)--> pending_approval
confirming_summary --(OP requests a change)--> confirming_summary (revised summary, asks again)
pending_approval --(approver comments "Approved")--> approved
pending_approval --(approver requests a change instead)--> confirming_summary (revised summary,
                                                                                OP reconfirms)
approved --(repository_dispatch fired)--> dev_in_progress
dev_in_progress --(feature-dev.yml opens PR)--> pr_open
pr_open --(human merges PR)--> merged

pending_approval --(approver rejects, or thread abandoned)--> rejected
```

## Status definitions

| Status               | Meaning                                                                                                                                                                                                                              |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `gathering_info`     | Bot is asking the OP clarifying questions; only OP replies advance this state.                                                                                                                                                       |
| `confirming_summary` | Claude judged the request complete; the OP is reviewing the generated summary and can confirm it as-is or ask for changes - each change produces a revised summary and asks again, looping until confirmed.                          |
| `pending_approval`   | OP confirmed the summary; waiting on `APPROVER_DISCORD_USER_ID` to comment `Approved`. Any other message from the approver is treated as a change request and sends the request back to `confirming_summary` instead of ignoring it. |
| `approved`           | Approval detected; `repository_dispatch` is about to fire (or just fired).                                                                                                                                                           |
| `dev_in_progress`    | GitHub Actions is running the coding agent.                                                                                                                                                                                          |
| `pr_open`            | PR exists; awaiting AI review + human merge.                                                                                                                                                                                         |
| `merged`             | PR merged to `main`.                                                                                                                                                                                                                 |
| `deployed`           | Reserved in the schema for a future Railway-deploy-confirmation step - **out of scope for now**; nothing currently sets this status.                                                                                                 |
| `rejected`           | Request will not be built (explicit rejection or abandoned during triage).                                                                                                                                                           |

## What gets persisted

`FeatureRequestEvent` only logs messages from the OP and from the bot itself — replies from
other server members (including the approver) are read but never stored or passed to Claude;
when the approver requests a change, their message text is used to revise the summary but is
not itself persisted as an event. This keeps the audit trail limited to what actually drove a
triage decision.
