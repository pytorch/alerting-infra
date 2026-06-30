---
name: create-grafana-alert
description: >-
  Create a new Grafana alert (querying the ClickHouse datasource) on
  pytorchci.grafana.net that routes through this alerting-infra pipeline into a
  GitHub issue in pytorch/alerting-infra (and the linked Google Chat room). Use
  when asked to "add an alert", "alert on X failing", "flag nightly/CI failures",
  or wire a ClickHouse query into Grafana alerting + alerting-infra.
---

# Create a Grafana alert that routes into alerting-infra

## How routing actually works (read first)

This repo (`alerting-infra`) is the **normalization pipeline**, not where alert
rules live. The end-to-end path is:

```
Grafana alert rule (ClickHouse query)        [pytorchci.grafana.net]
  -> notification policy
  -> "[PROD] AWS webhook alerting system" contact point
  -> SNS -> SQS -> collector Lambda (this repo)
  -> GitHub issue in pytorch/alerting-infra  (by pytorch-alerts[bot])
  -> mirrored into the Google Chat room      (room subscribes to this repo's issues)
```

Key consequences:
- You do **NOT** need a Grafana "Google Chat" contact point. The chat room is fed
  by the GitHub issues this pipeline opens. Routing to chat == landing a
  GitHub issue here.
- The default notification policy routes **everything except alerts labeled
  `type=test`** to the PROD webhook. A normal rule (no `type` label) is routed
  automatically -- no per-rule policy edit needed.
- The collector requires the alert to carry `Team` and `Priority` annotations;
  they become the `Team:<x>` / `Pri:<Px>` issue labels.

## Stable reference values (pytorchci.grafana.net)

- Grafana base URL: `https://pytorchci.grafana.net`
- ClickHouse datasource UID: `ceczcsck1b20wb` (`grafana-clickhouse-datasource`)
- Dev-infra alerts folder UID: `eecz20zkrjoxsa` (where the "HUD is broken" /
  queueing alerts live)
- PROD webhook contact point: `[PROD] AWS webhook alerting system`
  (notification-policy matcher: `type != test`)
- Good template rule to model: **"HUD is broken - 3 commits in a row"**
  (`uid eewi8oa4ccef4e`) -- a ClickHouse-table query + a `__expr__` threshold.
- Alert query SQL is version-controlled in **test-infra**
  `clickhouse_db_schema/grafana_alerts/*.sql` -- add the new query there too.

## Prerequisites

A Grafana **service-account token with Editor** scope for `pytorchci.grafana.net`
(Administration -> Users and access -> Service accounts -> add token).
Store it locally, e.g. `~/.grafana_token` (chmod 600); never paste it into chat
or commit it. Use it as `Authorization: Bearer $(cat ~/.grafana_token)`.

Confirm auth + permissions:
```bash
TK=$(tr -d '\n' < ~/.grafana_token)
curl -s -H "Authorization: Bearer $TK" https://pytorchci.grafana.net/api/user
# need alert.rules:write (check /api/access-control/user/permissions)
```

## Steps

### 1. Write + validate the ClickHouse query
The alert query must return a single numeric value (the count to threshold on),
and should self-window (the alert engine's time range is secondary). Example
(nightly binary-build failures):
```sql
SELECT count() AS failed_nightly_jobs
FROM default.workflow_job
WHERE head_branch = 'nightly'
  AND workflow_name LIKE '%-binary-%'
  AND status = 'completed'
  AND conclusion = 'failure'
  AND completed_at >= now() - INTERVAL 24 HOUR
```
Validate it against live data before wiring it into a rule:
```bash
curl -s -X POST -H "Authorization: Bearer $TK" -H "Content-Type: application/json" \
  --data '{"queries":[{"refId":"A","datasource":{"type":"grafana-clickhouse-datasource","uid":"ceczcsck1b20wb"},"format":1,"queryType":"table","rawSql":"<SQL>"}],"from":"now-24h","to":"now"}' \
  https://pytorchci.grafana.net/api/ds/query
```

### 2. Model the rule on an existing one
Fetch a working ClickHouse-backed rule and copy its `data[]` shape exactly (the
ClickHouse query model + the `__expr__` threshold are fiddly):
```bash
curl -s -H "Authorization: Bearer $TK" \
  https://pytorchci.grafana.net/api/v1/provisioning/alert-rules/eewi8oa4ccef4e | jq .
```

### 3. Build the rule payload
Two queries: the ClickHouse table query, then a `__expr__` `threshold` that
references it. Required: `Team` + `Priority` annotations. Create it
**`isPaused: true`** first so it can't fire until reviewed.

Threshold for "fire when > 0":
```json
{"type":"threshold","expression":"<query refId>",
 "conditions":[{"evaluator":{"type":"gt","params":[0]},
 "query":{"params":["<query refId>"]},"reducer":{"type":"last","params":[]},"type":"query"}]}
```
Rule essentials: `folderUID: eecz20zkrjoxsa`, `ruleGroup: "Check every minute"`,
`condition: <threshold refId>`, `for: "0s"`, `noDataState: "OK"`,
`execErrState: "Error"`, annotations `{Team, Priority, summary, description}`.

### 4. Create it (paused)
```bash
curl -s -X POST -H "Authorization: Bearer $TK" -H "Content-Type: application/json" \
  -H "X-Disable-Provenance: true" \
  --data @rule.json https://pytorchci.grafana.net/api/v1/provisioning/alert-rules
```

### 5. Unpause to go live
GET the rule, set `isPaused: false`, PUT it back:
```bash
curl -s -H "Authorization: Bearer $TK" \
  https://pytorchci.grafana.net/api/v1/provisioning/alert-rules/<uid> \
 | jq '.isPaused=false' > rule_unpause.json
curl -s -X PUT -H "Authorization: Bearer $TK" -H "Content-Type: application/json" \
  -H "X-Disable-Provenance: true" --data @rule_unpause.json \
  https://pytorchci.grafana.net/api/v1/provisioning/alert-rules/<uid>
```

### 6. Verify end to end
- Rule fires (allow one eval cycle, ~1 min):
  `GET /api/prometheus/grafana/api/v1/rules` -> state `firing`, value `1`.
- A GitHub issue appears in **pytorch/alerting-infra** by `pytorch-alerts[bot]`
  with `Source:grafana`, `Team:<x>`, `Pri:<Px>` labels.
- It shows in the Google Chat room (mirrors this repo's issues).

### 7. Commit the query to source control
Add the SQL to test-infra `clickhouse_db_schema/grafana_alerts/<name>.sql` with a
comment linking the rule (`https://pytorchci.grafana.net/alerting/grafana/<uid>/view`).

## Notes / gotchas
- `state: inactive` right after unpausing is normal -- wait one eval cycle.
- The query always returns a row (count 0 when healthy), so `noDataState: OK` is
  correct and won't false-fire.
- Don't add a `type=test` label unless you want the alert excluded from the PROD
  webhook (i.e. no GitHub issue / no chat).
- Contact points / notification policies live in the Grafana UI, not in this repo.
- Tune `Team`/`Priority`, the time window, and the workflow/branch filters per alert.
