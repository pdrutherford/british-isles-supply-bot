# Cataphracts Supply Status Monitor

Automated supply tracking for Cataphracts campaigns. Monitors Google Sheets for army supply levels and sends daily Discord notifications.

## What it does

- Reads current supplies, daily consumption, total carried weight, and carrying capacity from Google Sheets (plus optional extended stats)
- Optionally detects "resting" days (no consumption applied) via a boolean/checkbox cell
- Subtracts daily consumption from current supplies (unless resting or already zero)
- Updates the sheet with new supply levels
- Calculates days remaining & zero-supplies date
- Highlights over-capacity situations
- Sends Discord embeds (normal / warning / critical / zero) with rich field rows & sheet link
- Sends error embeds on failures
- Runs automatically once per day (configurable - see below)

## Recent Enhancements

- Added required fields: `totalCarriedCell`, `currentCarryingCapacityCell`
- Optional `restingStatusCell` to skip daily deduction when TRUE / checked
- Extended optional metrics (all independent):
  - `ownedAndCarriedLootCell`
  - `paidAndCarriedLootCell`
  - `currentMoraleCell`, `restingMoraleCell`
  - `armyLengthCell`
  - `forcedMarchDaysCell`
  - `shippingStatusCell`
  - `supplyShipsCountCell`
- Capacity alert row if total carried > capacity
- Sheet hyperlink added to embeds
- Enhanced private logging sanitization for tactical security

## Setup

### 1. Google Cloud Setup

Create a Google Cloud project (free):

1. Go to [console.cloud.google.com](https://console.cloud.google.com/)
2. Create new project
3. Enable Google Sheets API (APIs & Services > Library)
4. Create Service Account (APIs & Services > Credentials)
5. Download the JSON key file
6. Share your Google Sheets with the service account email (Editor permissions)

### 2. Google Sheets Format

Your sheet must have at least these cells (you choose addresses):

- Current Supplies (e.g., B2: `150`)
- Daily Consumption (e.g., B3: `5`)
- Total Carried (e.g., B4)
- Current Carrying Capacity (e.g., B5)

Optional (any or none): Resting Status checkbox (TRUE/FALSE), Loot, Morale, Army Length, Forced March Days, Shipping Status, Supply Ships Count.

Example minimal layout:

```
A1: Army                       B1: Saraian 1st Army
A2: Current Supplies           B2: 150
A3: Daily Consumption          B3: 5
A4: Total Carried              B4: 420
A5: Current Carrying Capacity  B5: 400
A6: Resting Today? (checkbox)  B6: FALSE
```

Names & positions do not need to match; you supply the cell references in config.

### 3. Discord Webhooks

Create webhooks for notifications:

**Channel webhook:**

```
https://discord.com/api/webhooks/{webhook_id}/{token}
```

**Thread webhook:**

```
https://discord.com/api/webhooks/{webhook_id}/{token}?thread_id={thread_id}
```

To create: Right-click channel > Edit Channel > Integrations > Create Webhook > Copy URL

To get thread id:

1. User Settings > Advanced > Enable Developer Mode
2. Right-click thread > Copy Thread ID

### 4. GitHub Repository

1. Fork this repository
2. Add these secrets (Settings > Secrets and variables > Actions):
   - `GOOGLE_SERVICE_ACCOUNT_KEY`: Base64-encoded service account JSON
   - `SHEETS_CONFIG`: JSON configuration (see below)

### 5. Configuration

Set `SHEETS_CONFIG` secret to JSON like this (FULL example):

```json
[
  {
    "name": "Saraian 1st Army",
    "sheetId": "1AbCdEfGhIjKlMnOpQrStUvWxYz1234567890",
    "sheetName": "Supply Tracker",
    "webhookUrl": "https://discord.com/api/webhooks/123/abc?thread_id=456",
    "currentSuppliesCell": "B2",
    "dailyConsumptionCell": "B3",
    "totalCarriedCell": "B4",
    "currentCarryingCapacityCell": "B5",
    "restingStatusCell": "B6",
    "ownedAndCarriedLootCell": "B7",
    "paidAndCarriedLootCell": "B8",
    "currentMoraleCell": "B9",
    "restingMoraleCell": "B10",
    "armyLengthCell": "B11",
    "forcedMarchDaysCell": "B12",
    "shippingStatusCell": "B13",
    "supplyShipsCountCell": "B14"
  }
]
```

Minimal REQUIRED fields example:

```json
[
  {
    "name": "Saraian 1st Army",
    "sheetId": "1AbCdEf...",
    "webhookUrl": "https://discord.com/api/webhooks/111/aaa",
    "currentSuppliesCell": "B2",
    "dailyConsumptionCell": "B3",
    "totalCarriedCell": "B4",
    "currentCarryingCapacityCell": "B5"
  }
]
```

**Required fields:**

- `name` – Army name for notifications
- `sheetId` – Google Sheet ID (`/d/{id}/edit`)
- `webhookUrl` – Discord webhook (optionally with `thread_id`)
- `currentSuppliesCell` – Current supplies value
- `dailyConsumptionCell` – Daily consumption value (> 0)
- `totalCarriedCell` – Total carried weight/units
- `currentCarryingCapacityCell` – Carrying capacity value

**Optional fields:**

- `sheetName` – Sheet tab name
- `restingStatusCell` – Boolean/checkbox cell; when TRUE, no consumption (name in embed gains "(Resting)")
- Extended metric cells listed above (appear only if present & non-empty)

## Timing Configuration

The system runs daily at **midnight EST** (5 AM UTC). To change this:

1. Edit `.github/workflows/supply-monitor.yml`
2. Modify the cron schedule: `- cron: "0 5 * * *"`

Cron examples (UTC):

- `0 5 * * *` = 5 AM UTC daily (midnight EST/1 AM EDT)
- `0 12 * * *` = noon UTC daily
- `0 0 * * 1` = midnight UTC every Monday

## Example Output

### Normal Status (15+ days remaining)

```
✅ Status: Saraian 1st Army
📅 Current Day: Monday, June 25th
📦 Current Supplies: 150
📉 Daily Consumption: 5
⏰ Days Remaining: 30 days
🚨 Zero Supplies Date: Wednesday, July 25th
🧺 Total Carried: 420
💪 Carrying Capacity: 400
⚠️ Capacity Alert (if over capacity)
```

### Warning (4-7 days remaining)

```
⚠️ **WARNING**: Saraian 1st Army supplies are running low. 5 days remaining.
⚠️ Status: Saraian 1st Army
... (fields as above with updated values)
```

### Critical (1-3 days remaining)

```
🚨 **URGENT**: Saraian 1st Army supplies are critically low! Only 2 days remaining.
🚨 Status: Saraian 1st Army
... (fields)
```

### Zero Supplies (new formatting)

```
🚨 **CRITICAL**: Saraian 1st Army supplies have reached ZERO today! Immediate restocking required.
🚨 ZERO SUPPLIES ALERT: Saraian 1st Army
📦 Current Supplies: 0 (OUT OF STOCK)
⏰ Days Remaining: 0 days
(Other optional fields if configured)
```

### Resting Day Example

```
✅ Status: Saraian 1st Army (Resting)
📦 Current Supplies: 150  (unchanged)
📉 Daily Consumption: 5
⏰ Days Remaining: 30 days
(Note: Supply not decremented due to rest)
```

## Alert Thresholds

- **Green** (✅): 15+ days remaining
- **Yellow** (⚡): 8-14 days remaining
- **Orange** (⚠️): 4-7 days remaining
- **Red** (🚨): 1-3 days remaining
- **Critical** (🚨): 0 days remaining

Capacity alert triggers if `totalCarried > carryingCapacity`.

## Multiple Army Examples

Separate minimal configs:

```json
[
  {
    "name": "Saraian 1st Army",
    "sheetId": "1AbCdEf...",
    "webhookUrl": "https://discord.com/api/webhooks/111/aaa",
    "currentSuppliesCell": "B2",
    "dailyConsumptionCell": "B3",
    "totalCarriedCell": "B4",
    "currentCarryingCapacityCell": "B5"
  },
  {
    "name": "Keltic Raiders",
    "sheetId": "1ZyXwVu...",
    "webhookUrl": "https://discord.com/api/webhooks/222/bbb",
    "currentSuppliesCell": "B2",
    "dailyConsumptionCell": "B3",
    "totalCarriedCell": "B4",
    "currentCarryingCapacityCell": "B5"
  }
]
```

Multiple tabs in one sheet (threaded):

```json
[
  {
    "name": "Saraian 1st Army",
    "sheetId": "1AbCdEf...",
    "sheetName": "1st Army",
    "webhookUrl": "https://discord.com/api/webhooks/111/aaa?thread_id=333",
    "currentSuppliesCell": "B2",
    "dailyConsumptionCell": "B3",
    "totalCarriedCell": "B4",
    "currentCarryingCapacityCell": "B5"
  },
  {
    "name": "Saraian 2nd Army",
    "sheetId": "1AbCdEf...",
    "sheetName": "2nd Army",
    "webhookUrl": "https://discord.com/api/webhooks/111/aaa?thread_id=444",
    "currentSuppliesCell": "B2",
    "dailyConsumptionCell": "B3",
    "totalCarriedCell": "B4",
    "currentCarryingCapacityCell": "B5"
  }
]
```

## Resting Days

If `restingStatusCell` evaluates to TRUE (checkbox checked / value TRUE / yes / y / 1), daily consumption is skipped and the embed title appends "(Resting)". Zero-supply alerts are not triggered on resting days unless supplies were already zero.

## Security & Privacy

This project uses **targeted private logging** to protect sensitive supply data and tactical intelligence while maintaining full debugging capabilities.

See [Private Logging Documentation](docs/PRIVATE_LOGGING.md) for full details.

## Testing

Validate configuration (no sheet mutations, reads & logging only):

```bash
npm install
npm run validate
```

Functional run (updates sheets and sends Discord embeds):

```bash
npm start
```

Manual GitHub Actions run: Actions tab > Supply Status Monitor > Run workflow

## Troubleshooting

- "No data found in cell" – Check cell address & ensure value present
- "Daily consumption must be greater than 0" – Provide positive numeric value
- "Authentication failed" – Re-encode service account JSON / enable Sheets API
- "Discord webhook failed" – Verify webhook URL not deleted / correct thread id
- Wrong timing – Adjust cron in `.github/workflows/supply-monitor.yml`
- Over capacity message – Review `totalCarriedCell` & `currentCarryingCapacityCell` values

## License

MIT
