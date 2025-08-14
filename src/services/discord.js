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
    effectiveArmySize,
    sheetUrl,
  }) {
    const color = this.getStatusColor(daysRemaining);
    const statusEmoji = this.getStatusEmoji(daysRemaining);

    // Build a compact description string instead of many fields
    const lines = [];
    const dayLine = `📅 ${this.getCurrentDayNY()}${
      sheetUrl ? ` • [Open Sheet](${sheetUrl})` : ""
    }`;
    lines.push(dayLine);

    // Supplies summary with labels
    lines.push(
      `📦 Supplies ${currentSupplies} • 📉 Cons ${dailyConsumption}/d • ⏰ Days ${daysRemaining}`
    );
    lines.push(`🚨 Zero Date ${this.getZeroSuppliesDate(daysRemaining)}`);

    // Capacity summary
    const pct = carryingCapacity
      ? Math.round((totalCarried / carryingCapacity) * 100)
      : null;
    lines.push(
      `🧺 Carry ${totalCarried} / ${carryingCapacity}${
        pct !== null && isFinite(pct) ? ` (${pct}%)` : ""
      }`
    );

    // Loot (optional)
    const lootTokens = [];
    if (
      ownedAndCarriedLoot !== undefined &&
      ownedAndCarriedLoot !== null &&
      ownedAndCarriedLoot !== ""
    )
      lootTokens.push(`Owned ${ownedAndCarriedLoot}`);
    if (
      paidAndCarriedLoot !== undefined &&
      paidAndCarriedLoot !== null &&
      paidAndCarriedLoot !== ""
    )
      lootTokens.push(`Paid ${paidAndCarriedLoot}`);
    if (lootTokens.length) lines.push(`💰 Loot ${lootTokens.join(" • ")}`);

    // Morale (optional)
    const moraleTokens = [];
    if (
      currentMorale !== undefined &&
      currentMorale !== null &&
      currentMorale !== ""
    )
      moraleTokens.push(`Cur ${currentMorale}`);
    if (
      restingMorale !== undefined &&
      restingMorale !== null &&
      restingMorale !== ""
    )
      moraleTokens.push(`Rest ${restingMorale}`);
    if (moraleTokens.length)
      lines.push(`😀 Morale ${moraleTokens.join(" • ")}`);

    // Army and movement (optional)
    const armyTokens = [];
    if (armyLength !== undefined && armyLength !== null && armyLength !== "")
      armyTokens.push(`Len ${armyLength}`);
    if (
      effectiveArmySize !== undefined &&
      effectiveArmySize !== null &&
      effectiveArmySize !== ""
    )
      armyTokens.push(`Eff ${effectiveArmySize}`);
    if (
      forcedMarchDays !== undefined &&
      forcedMarchDays !== null &&
      forcedMarchDays !== ""
    )
      armyTokens.push(`Forced ${forcedMarchDays}`);
    if (armyTokens.length) lines.push(`🪖 Army ${armyTokens.join(" • ")}`);

    // Shipping (optional)
    const shipTokens = [];
    if (
      shippingStatus !== undefined &&
      shippingStatus !== null &&
      shippingStatus !== ""
    )
      shipTokens.push(`Status ${shippingStatus}`);
    if (
      supplyShipsCount !== undefined &&
      supplyShipsCount !== null &&
      supplyShipsCount !== ""
    )
      shipTokens.push(`Ships ${supplyShipsCount}`);
    if (shipTokens.length) lines.push(`🚢 Ship ${shipTokens.join(" • ")}`);

    if (overCapacity)
      lines.push(
        `⚠️ Capacity Alert: carried ${totalCarried} > capacity ${carryingCapacity}`
      );

    const embed = {
      title: `${statusEmoji} Status: ${name}`,
      color,
      description: lines.join("\n"),
      timestamp: new Date().toISOString(),
    };
    const payload = { embeds: [embed] };
    if (daysRemaining <= 3)
      payload.content = `🚨 **URGENT**: ${name} supplies are critically low! Only ${daysRemaining} days remaining.`;
    else if (daysRemaining <= 7)
      payload.content = `⚠️ **WARNING**: ${name} supplies are running low. ${daysRemaining} days remaining.`;
    if (overCapacity)
      payload.content =
        (payload.content ? payload.content + "\n" : "") +
        `⚠️ **OVER CAPACITY**: Carried ${totalCarried} / Capacity ${carryingCapacity}`;
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
    effectiveArmySize,
    sheetUrl,
  }) {
    // Build compact description for zero supplies
    const lines = [];
    lines.push(
      `📅 ${this.getCurrentDayNY()}${
        sheetUrl ? ` • [Open Sheet](${sheetUrl})` : ""
      }`
    );
    lines.push(
      `📦 Supplies **0 (OUT)** • 📉 Cons ${dailyConsumption}/d • ⏰ Days **0**`
    );
    lines.push(`🚨 Zero Date ${this.getCurrentDayNY()}`);

    const pctZero = carryingCapacity
      ? Math.round((totalCarried / carryingCapacity) * 100)
      : null;
    lines.push(
      `🧺 Carry ${totalCarried} / ${carryingCapacity}${
        pctZero !== null && isFinite(pctZero) ? ` (${pctZero}%)` : ""
      }`
    );

    const lootTokensZ = [];
    if (
      ownedAndCarriedLoot !== undefined &&
      ownedAndCarriedLoot !== null &&
      ownedAndCarriedLoot !== ""
    )
      lootTokensZ.push(`Owned ${ownedAndCarriedLoot}`);
    if (
      paidAndCarriedLoot !== undefined &&
      paidAndCarriedLoot !== null &&
      paidAndCarriedLoot !== ""
    )
      lootTokensZ.push(`Paid ${paidAndCarriedLoot}`);
    if (lootTokensZ.length) lines.push(`💰 Loot ${lootTokensZ.join(" • ")}`);

    const moraleTokensZ = [];
    if (
      currentMorale !== undefined &&
      currentMorale !== null &&
      currentMorale !== ""
    )
      moraleTokensZ.push(`Cur ${currentMorale}`);
    if (
      restingMorale !== undefined &&
      restingMorale !== null &&
      restingMorale !== ""
    )
      moraleTokensZ.push(`Rest ${restingMorale}`);
    if (moraleTokensZ.length)
      lines.push(`😀 Morale ${moraleTokensZ.join(" • ")}`);

    const armyTokensZ = [];
    if (armyLength !== undefined && armyLength !== null && armyLength !== "")
      armyTokensZ.push(`Len ${armyLength}`);
    if (
      effectiveArmySize !== undefined &&
      effectiveArmySize !== null &&
      effectiveArmySize !== ""
    )
      armyTokensZ.push(`Eff ${effectiveArmySize}`);
    if (
      forcedMarchDays !== undefined &&
      forcedMarchDays !== null &&
      forcedMarchDays !== ""
    )
      armyTokensZ.push(`Forced ${forcedMarchDays}`);
    if (armyTokensZ.length) lines.push(`🪖 Army ${armyTokensZ.join(" • ")}`);

    const shipTokensZ = [];
    if (
      shippingStatus !== undefined &&
      shippingStatus !== null &&
      shippingStatus !== ""
    )
      shipTokensZ.push(`Status ${shippingStatus}`);
    if (
      supplyShipsCount !== undefined &&
      supplyShipsCount !== null &&
      supplyShipsCount !== ""
    )
      shipTokensZ.push(`Ships ${supplyShipsCount}`);
    if (shipTokensZ.length) lines.push(`🚢 Ship ${shipTokensZ.join(" • ")}`);

    if (overCapacity)
      lines.push(
        `⚠️ Capacity Alert: carried ${totalCarried} > capacity ${carryingCapacity}`
      );

    const urgentMessage = suppliesWereAlreadyZero
      ? `🚨 **CRITICAL**: ${name} supplies are STILL at ZERO! No supplies available for consumption.`
      : `🚨 **CRITICAL**: ${name} supplies have reached ZERO today! Immediate restocking required.`;
    const embed = {
      title: `🚨 ZERO SUPPLIES ALERT: ${name}`,
      color: 0x8b0000,
      description: lines.join("\n"),
      timestamp: new Date().toISOString(),
    };
    const payload = {
      content:
        urgentMessage +
        (overCapacity
          ? `\n⚠️ **OVER CAPACITY**: Carried ${totalCarried} / Capacity ${carryingCapacity}`
          : ""),
      embeds: [embed],
    };
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
