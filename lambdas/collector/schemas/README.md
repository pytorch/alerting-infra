# AlertEvent JSON Schema

This directory contains the formal JSON Schema definitions for the PyTorch Test Infrastructure Alerting System.

## 📋 Schema Files

### `alert-event.schema.json`

- **Purpose**: Canonical AlertEvent schema for normalized alert messages
- **Schema ID**: `https://schemas.pytorch.org/alerting/alert-event.schema.json`
- **Version**: 1.0 (corresponds to `schema_version: 1` in alert messages)
- **Standard**: JSON Schema Draft 07

## 🔧 Usage

### For Custom Alert Emitters

If you want to send alerts directly to the alerting system without transformation:

1. **Validate your alert payload** against the schema before sending
2. **Set message attribute**: `source = "normalized"`
3. **Send to webhook endpoint** with proper authentication

### Validation Examples

**JavaScript/Node.js:**

```javascript
const Ajv = require("ajv");
const addFormats = require("ajv-formats");
const schema = require("./alert-event.schema.json");

const ajv = new Ajv();
addFormats(ajv);
const validate = ajv.compile(schema);

const alert = {
  schema_version: 1,
  source: "myapp",
  state: "FIRING",
  title: "High CPU Usage",
  priority: "P1",
  occurred_at: "2024-01-15T10:30:00.000Z",
  team: "platform-team",
  identity: { account_id: "123456789012", rule_id: "cpu-high" },
  links: { runbook_url: "https://wiki.company.com/cpu-runbook" },
};

if (validate(alert)) {
  console.log("Alert is valid!");
} else {
  console.error("Validation errors:", validate.errors);
}
```

**Python:**

```python
import json
import jsonschema

# Load schema
with open('alert-event.schema.json') as f:
    schema = json.load(f)

# Your alert
alert = {
    "schema_version": 1,
    "source": "myapp",
    "state": "FIRING",
    "title": "High CPU Usage",
    "priority": "P1",
    "occurred_at": "2024-01-15T10:30:00.000Z",
    "team": "platform-team",
    "identity": {"account_id": "123456789012", "rule_id": "cpu-high"},
    "links": {"runbook_url": "https://wiki.company.com/cpu-runbook"}
}

try:
    jsonschema.validate(alert, schema)
    print("Alert is valid!")
except jsonschema.ValidationError as e:
    print(f"Validation error: {e.message}")
```

**Go:**

```go
package main

import (
    "encoding/json"
    "fmt"
    "github.com/xeipuuv/gojsonschema"
)

func main() {
    schemaLoader := gojsonschema.NewReferenceLoader("file://./alert-event.schema.json")

    alert := map[string]interface{}{
        "schema_version": 1,
        "source":         "myapp",
        "state":          "FIRING",
        "title":          "High CPU Usage",
        "priority":       "P1",
        "occurred_at":    "2024-01-15T10:30:00.000Z",
        "team":           "platform-team",
        "identity":       map[string]interface{}{"account_id": "123456789012", "rule_id": "cpu-high"},
        "links":          map[string]interface{}{"runbook_url": "https://wiki.company.com/cpu-runbook"},
    }

    documentLoader := gojsonschema.NewGoLoader(alert)

    result, err := gojsonschema.Validate(schemaLoader, documentLoader)
    if err != nil {
        panic(err)
    }

    if result.Valid() {
        fmt.Println("Alert is valid!")
    } else {
        for _, desc := range result.Errors() {
            fmt.Printf("Validation error: %s\n", desc)
        }
    }
}
```

## 📖 Schema Reference

### Required Fields

| Field            | Type    | Description                  |
| ---------------- | ------- | ---------------------------- |
| `schema_version` | integer | Schema version (currently 1) |
| `source`         | string  | Alert source identifier      |
| `state`          | enum    | "FIRING" or "RESOLVED"       |
| `title`          | string  | Alert title (max 500 chars)  |
| `priority`       | enum    | "P0", "P1", "P2", or "P3"    |
| `occurred_at`    | string  | ISO8601 timestamp            |
| `team`           | string  | Owning team identifier       |
| `identity`       | object  | Identity for fingerprinting  |
| `links`          | object  | Navigation links             |

### Optional Fields

| Field          | Type   | Description                                        |
| -------------- | ------ | -------------------------------------------------- |
| `description`  | string | Detailed description (max 4000 chars)              |
| `summary`      | string | High-level summary (max 1000 chars)                |
| `reason`       | string | Provider-specific reason (max 2000 chars)          |
| `raw_provider` | any    | Original payload for debugging                     |

### Validation Rules

- **URLs**: Must be valid HTTP/HTTPS URLs (max 2048 chars)
- **Account ID**: Alphanumeric, hyphens, underscores only (max 100 chars)
- **CloudWatch ARN**: Must start with "arn:aws:cloudwatch:"
- **Source/Team**: Alphanumeric, hyphens, underscores only

## 🔄 Schema Evolution

When updating the schema:

1. **Increment `schema_version`** for breaking changes
2. **Update examples** in the schema file
3. **Test compatibility** with existing alerts
4. **Document changes** in this README
5. **Update collector validation** logic if needed

## 🚀 Getting Started

1. **Download the schema**:

   ```bash
   curl -O https://raw.githubusercontent.com/pytorch/test-infra-alerting/main/lambdas/collector/schemas/alert-event.schema.json
   ```

2. **Install a JSON Schema validator** for your language
3. **Validate your alerts** before sending to the webhook
4. **Set up automated validation** in your CI/CD pipeline

## 📞 Support

For questions about the schema or alert integration:

- **Documentation**: [Main README](../../../README.md)
- **Issues**: [GitHub Issues](https://github.com/pytorch/test-infra-alerting/issues)
- **Architecture**: See the main README for system architecture details
