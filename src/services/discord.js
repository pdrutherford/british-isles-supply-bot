const https = require("https");
const { logger } = require("../utils/logger");
const { format } = require("date-fns");
const { formatInTimeZone } = require("date-fns-tz");

class DiscordNotifier {
  // Get current day in New York timezone
  getCurrentDayNY() {
    const now = new Date();
    return formatInTimeZone(now, "America/New_York", "EEEE, MMMM do");
  }

  // Calculate the date when supplies will reach zero
  getZeroSuppliesDate(daysRemaining) {
    const now = new Date();
    const zeroDate = new Date(
      now.getTime() + daysRemaining * 24 * 60 * 60 * 1000
    );
    return formatInTimeZone(zeroDate, "America/New_York", "EEEE, MMMM do");
  }

  async sendSupplyStatus({
    name,
    currentSupplies,
    dailyConsumption,
    daysRemaining,
    webhookUrl,
    totalCarried,
    carryingCapacity,
    overCapacity,
    ownedAndCarriedLoot,
    paidAndCarriedLoot,
    currentMorale,
    restingMorale,
    armyLength,
    forcedMarchDays,
    shippingStatus,
    supplyShipsCount,
    sheetUrl,
  }) {
    const color = this.getStatusColor(daysRemaining);
    const statusEmoji = this.getStatusEmoji(daysRemaining);

    const mkSpacer = () => ({ name: "\u200B", value: "\u200B", inline: true });
    const fields = [];
    const addRow = (row, pad = true) => {
      if (!row.length) return;
      const inlineCount = row.filter(f => f.inline).length;
      if (pad && inlineCount > 0 && inlineCount < 3) {
        while (row.filter(f => f.inline).length < 3) row.push(mkSpacer());
      }
      fields.push(...row);
    };

    // Row 1
    addRow([
      { name: "📅 Current Day", value: this.getCurrentDayNY(), inline: true },
      ...(sheetUrl ? [{ name: "🔗 Sheet", value: `[Open Sheet](${sheetUrl})`, inline: true }] : [])
    ]);

    // Row 2
    addRow([
      { name: "📦 Current Supplies", value: `${currentSupplies}`, inline: true },
      { name: "📉 Daily Consumption", value: `${dailyConsumption}`, inline: true },
      { name: "⏰ Days Remaining", value: `${daysRemaining} days`, inline: true },
    ], false); // already 3

    // Row 3
    fields.push({ name: "🚨 Zero Supplies Date", value: this.getZeroSuppliesDate(daysRemaining), inline: false });

    // Row 4
    addRow([
      ...(ownedAndCarriedLoot !== undefined && ownedAndCarriedLoot !== null && ownedAndCarriedLoot !== "" ? [{ name: "💰 Owned & Carried Loot", value: `${ownedAndCarriedLoot}`, inline: true }] : []),
      ...(paidAndCarriedLoot !== undefined && paidAndCarriedLoot !== null && paidAndCarriedLoot !== "" ? [{ name: "🪙 Paid & Carried Loot", value: `${paidAndCarriedLoot}`, inline: true }] : []),
    ]);

    // Row 5
    addRow([
      { name: "🧺 Total Carried", value: `${totalCarried}`, inline: true },
      { name: "💪 Carrying Capacity", value: `${carryingCapacity}`, inline: true },
    ]);

    // Row 6
    addRow([
      ...(currentMorale !== undefined && currentMorale !== null && currentMorale !== "" ? [{ name: "😀 Current Morale", value: `${currentMorale}`, inline: true }] : []),
      ...(restingMorale !== undefined && restingMorale !== null && restingMorale !== "" ? [{ name: "😴 Resting Morale", value: `${restingMorale}`, inline: true }] : []),
    ]);

    // Row 7
    addRow([
      ...(armyLength !== undefined && armyLength !== null && armyLength !== "" ? [{ name: "🪖 Army Length", value: `${armyLength}`, inline: true }] : []),
      ...(forcedMarchDays !== undefined && forcedMarchDays !== null && forcedMarchDays !== "" ? [{ name: "🏃 Forced March Days", value: `${forcedMarchDays}`, inline: true }] : []),
    ]);

    // Row 8
    addRow([
      ...(shippingStatus !== undefined && shippingStatus !== null && shippingStatus !== "" ? [{ name: "🚢 Shipping?", value: `${shippingStatus}`, inline: true }] : []),
      ...(supplyShipsCount !== undefined && supplyShipsCount !== null && supplyShipsCount !== "" ? [{ name: "🛳️ # of Supply Ships", value: `${supplyShipsCount}`, inline: true }] : []),
    ]);

    if (overCapacity) {
      fields.push({ name: "⚠️ Capacity Alert", value: `Total carried (${totalCarried}) exceeds carrying capacity (${carryingCapacity}). Reduce load!`, inline: false });
    }

    const embed = { title: `${statusEmoji} Status: ${name}`, color, fields, timestamp: new Date().toISOString() };
    const payload = { embeds: [embed] };
    if (daysRemaining <= 3) payload.content = `🚨 **URGENT**: ${name} supplies are critically low! Only ${daysRemaining} days remaining.`; else if (daysRemaining <= 7) payload.content = `⚠️ **WARNING**: ${name} supplies are running low. ${daysRemaining} days remaining.`;
    if (overCapacity) payload.content = (payload.content ? payload.content + "\n" : "") + `⚠️ **OVER CAPACITY**: Carried ${totalCarried} / Capacity ${carryingCapacity}`;
    await this.sendWebhook(webhookUrl, payload);
    logger.info(`Sent supply status notification for ${name}`);
  }

  async sendError({ sheetName, error, webhookUrl, sheetUrl }) {
    const embed = {
      title: "❌ Supply Monitor Error",
      color: 0xff0000, // Red
      fields: [
        {
          name: "Sheet",
          value: sheetName,
          inline: true,
        },
        {
          name: "Error",
          value: error,
          inline: false,
        },
      ],
      timestamp: new Date().toISOString(),
    };

    if (sheetUrl) {
      embed.fields.push({
        name: "🔗 Sheet",
        value: `[Open Sheet](${sheetUrl})`,
        inline: false,
      });
    }

    const payload = {
      content: "🚨 **ERROR**: Failed to process supply status",
      embeds: [embed],
    };

    await this.sendWebhook(webhookUrl, payload);
    logger.info(`Sent error notification for ${sheetName}`);
  }

  async sendZeroSupplies({
    name,
    suppliesWereAlreadyZero,
    dailyConsumption,
    webhookUrl,
    totalCarried,
    carryingCapacity,
    overCapacity,
    ownedAndCarriedLoot,
    paidAndCarriedLoot,
    currentMorale,
    restingMorale,
    armyLength,
    forcedMarchDays,
    shippingStatus,
    supplyShipsCount,
    sheetUrl,
  }) {
    const mkSpacer = () => ({ name: "\u200B", value: "\u200B", inline: true });
    const fields = [];
    const addRow = (row, pad = true) => {
      if (!row.length) return;
      const inlineCount = row.filter(f => f.inline).length;
      if (pad && inlineCount > 0 && inlineCount < 3) {
        while (row.filter(f => f.inline).length < 3) row.push(mkSpacer());
      }
      fields.push(...row);
    };

    // Row 1
    addRow([
      { name: "📅 Current Day", value: this.getCurrentDayNY(), inline: true },
      ...(sheetUrl ? [{ name: "🔗 Sheet", value: `[Open Sheet](${sheetUrl})`, inline: true }] : []),
    ]);

    // Row 2
    addRow([
      { name: "📦 Current Supplies", value: "**0** (OUT OF STOCK)", inline: true },
      { name: "📉 Daily Consumption", value: `${dailyConsumption}`, inline: true },
      { name: "⏰ Days Remaining", value: "**0 days**", inline: true },
    ], false);

    // Row 3
    fields.push({ name: "🚨 Zero Supplies Date", value: this.getCurrentDayNY(), inline: false });

    // Row 4
    addRow([
      ...(ownedAndCarriedLoot !== undefined && ownedAndCarriedLoot !== null && ownedAndCarriedLoot !== "" ? [{ name: "💰 Owned & Carried Loot", value: `${ownedAndCarriedLoot}`, inline: true }] : []),
      ...(paidAndCarriedLoot !== undefined && paidAndCarriedLoot !== null && paidAndCarriedLoot !== "" ? [{ name: "🪙 Paid & Carried Loot", value: `${paidAndCarriedLoot}`, inline: true }] : []),
    ]);

    // Row 5
    addRow([
      { name: "🧺 Total Carried", value: `${totalCarried}`, inline: true },
      { name: "💪 Carrying Capacity", value: `${carryingCapacity}`, inline: true },
    ]);

    // Row 6
    addRow([
      ...(currentMorale !== undefined && currentMorale !== null && currentMorale !== "" ? [{ name: "😀 Current Morale", value: `${currentMorale}`, inline: true }] : []),
      ...(restingMorale !== undefined && restingMorale !== null && restingMorale !== "" ? [{ name: "😴 Resting Morale", value: `${restingMorale}`, inline: true }] : []),
    ]);

    // Row 7
    addRow([
      ...(armyLength !== undefined && armyLength !== null && armyLength !== "" ? [{ name: "🪖 Army Length", value: `${armyLength}`, inline: true }] : []),
      ...(forcedMarchDays !== undefined && forcedMarchDays !== null && forcedMarchDays !== "" ? [{ name: "🏃 Forced March Days", value: `${forcedMarchDays}`, inline: true }] : []),
    ]);

    // Row 8
    addRow([
      ...(shippingStatus !== undefined && shippingStatus !== null && shippingStatus !== "" ? [{ name: "🚢 Shipping?", value: `${shippingStatus}`, inline: true }] : []),
      ...(supplyShipsCount !== undefined && supplyShipsCount !== null && supplyShipsCount !== "" ? [{ name: "🛳️ # of Supply Ships", value: `${supplyShipsCount}`, inline: true }] : []),
    ]);

    if (overCapacity) fields.push({ name: "⚠️ Capacity Alert", value: `Total carried (${totalCarried}) exceeds carrying capacity (${carryingCapacity}). Reduce load!`, inline: false });

    const urgentMessage = suppliesWereAlreadyZero ? `🚨 **CRITICAL**: ${name} supplies are STILL at ZERO! No supplies available for consumption.` : `🚨 **CRITICAL**: ${name} supplies have reached ZERO today! Immediate restocking required.`;
    const embed = { title: `🚨 ZERO SUPPLIES ALERT: ${name}`, color: 0x8b0000, fields, timestamp: new Date().toISOString() };
    const payload = { content: urgentMessage + (overCapacity ? `\n⚠️ **OVER CAPACITY**: Carried ${totalCarried} / Capacity ${carryingCapacity}` : ""), embeds: [embed] };
    await this.sendWebhook(webhookUrl, payload);
    logger.info(`Sent zero supplies alert for ${name}`);
  }

  getStatusColor(daysRemaining) {
    if (daysRemaining === 0) {
      return 0x8b0000; // Dark red - Zero supplies
    } else if (daysRemaining <= 3) {
      return 0xff0000; // Red - Critical
    } else if (daysRemaining <= 7) {
      return 0xff8c00; // Orange - Warning
    } else if (daysRemaining <= 14) {
      return 0xffff00; // Yellow - Caution
    } else {
      return 0x00ff00; // Green - Good
    }
  }

  getStatusEmoji(daysRemaining) {
    if (daysRemaining === 0) {
      return "🚨";
    } else if (daysRemaining <= 3) {
      return "🚨";
    } else if (daysRemaining <= 7) {
      return "⚠️";
    } else if (daysRemaining <= 14) {
      return "⚡";
    } else {
      return "✅";
    }
  }

  async sendWebhook(webhookUrl, payload) {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify(payload);

      const url = new URL(webhookUrl);
      const options = {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname + url.search,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data),
          "User-Agent": "Supply-Status-Monitor/1.0",
        },
      };

      const req = https.request(options, (res) => {
        let responseBody = "";

        res.on("data", (chunk) => {
          responseBody += chunk;
        });

        res.on("end", () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(responseBody);
          } else {
            reject(
              new Error(
                `Discord webhook failed with status ${res.statusCode}: ${responseBody}`
              )
            );
          }
        });
      });

      req.on("error", (error) => {
        reject(new Error(`Discord webhook request failed: ${error.message}`));
      });

      req.write(data);
      req.end();
    });
  }
}

module.exports = { DiscordNotifier };
