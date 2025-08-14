// Load environment variables from .env file
require("dotenv").config();

const { GoogleSheetsService } = require("./services/googleSheets");
const { DiscordNotifier } = require("./services/discord");
const { loadConfig } = require("./utils/config");
const { logger } = require("./utils/logger");

/**
 * Parse a numeric value that may contain commas as thousands separators
 * @param {string|number} value - The value to parse
 * @returns {number} - The parsed numeric value
 */
function parseNumericValue(value) {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value !== "string") {
    throw new Error(
      `Invalid value type: expected string or number, got ${typeof value}`
    );
  }

  // Remove commas and parse as float
  const cleanedValue = value.replace(/,/g, "");
  const parsed = parseFloat(cleanedValue);

  if (isNaN(parsed)) {
    throw new Error(`Invalid numeric value: "${value}"`);
  }

  return parsed;
}

/**
 * Sleep for the specified number of milliseconds
 * @param {number} ms - Milliseconds to sleep
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  try {
    logger.info("Starting supply status monitor...");

    // Load configuration
    const config = await loadConfig();
    logger.info(`Loaded configuration for ${config.length} sheets`);

    // Initialize services
    const sheetsService = new GoogleSheetsService();
    const discordNotifier = new DiscordNotifier();

    // Process each sheet configuration with rate limiting
    for (let i = 0; i < config.length; i++) {
      const sheetConfig = config[i];
      const sheetUrl = `https://docs.google.com/spreadsheets/d/${sheetConfig.sheetId}/edit`; // Link to the spreadsheet

      // Add delay between sheets to avoid quota limits
      if (i > 0) {
        logger.info(
          "⏱️  Waiting 3 seconds between sheets to avoid rate limits..."
        );
        await sleep(3000);
      }
      try {
        logger.info(`Processing sheet: ${sheetConfig.name}`);

        // Build list of cells to fetch
        const cellsToFetch = [
          sheetConfig.currentSuppliesCell,
          sheetConfig.dailyConsumptionCell,
          sheetConfig.totalCarriedCell,
          sheetConfig.currentCarryingCapacityCell,
        ];
        if (sheetConfig.restingStatusCell) {
          cellsToFetch.push(sheetConfig.restingStatusCell);
        }
        // Optional cells for extended reporting
        const optionalCellKeys = [
          "ownedAndCarriedLootCell",
          "paidAndCarriedLootCell",
          "currentMoraleCell",
          "restingMoraleCell",
          "armyLengthCell",
          "effectiveArmySizeCell",
          "forcedMarchDaysCell",
          "shippingStatusCell",
          "supplyShipsCountCell",
        ];
        optionalCellKeys.forEach((key) => {
          if (sheetConfig[key]) cellsToFetch.push(sheetConfig[key]);
        });

        // Get data from Google Sheets using batch API to reduce quota usage
        const cellValues = await sheetsService.getCellValuesBatch(
          sheetConfig.sheetId,
          cellsToFetch,
          sheetConfig.sheetName
        );

        const currentSupplies = cellValues[sheetConfig.currentSuppliesCell];
        const dailyConsumption = cellValues[sheetConfig.dailyConsumptionCell];
        const totalCarriedRaw = cellValues[sheetConfig.totalCarriedCell];
        const carryingCapacityRaw =
          cellValues[sheetConfig.currentCarryingCapacityCell];
        const restingStatusRaw = sheetConfig.restingStatusCell
          ? cellValues[sheetConfig.restingStatusCell]
          : null;

        // Extract optional values
        const ownedAndCarriedLootRaw = sheetConfig.ownedAndCarriedLootCell
          ? cellValues[sheetConfig.ownedAndCarriedLootCell]
          : null;
        const paidAndCarriedLootRaw = sheetConfig.paidAndCarriedLootCell
          ? cellValues[sheetConfig.paidAndCarriedLootCell]
          : null;
        const currentMoraleRaw = sheetConfig.currentMoraleCell
          ? cellValues[sheetConfig.currentMoraleCell]
          : null;
        const restingMoraleRaw = sheetConfig.restingMoraleCell
          ? cellValues[sheetConfig.restingMoraleCell]
          : null;
        const armyLengthRaw = sheetConfig.armyLengthCell
          ? cellValues[sheetConfig.armyLengthCell]
          : null;
        const effectiveArmySizeRaw = sheetConfig.effectiveArmySizeCell
          ? cellValues[sheetConfig.effectiveArmySizeCell]
          : null;
        const forcedMarchDaysRaw = sheetConfig.forcedMarchDaysCell
          ? cellValues[sheetConfig.forcedMarchDaysCell]
          : null;
        const shippingStatusRaw = sheetConfig.shippingStatusCell
          ? cellValues[sheetConfig.shippingStatusCell]
          : null;
        const supplyShipsCountRaw = sheetConfig.supplyShipsCountCell
          ? cellValues[sheetConfig.supplyShipsCountCell]
          : null;

        // Determine resting status if provided (Google Sheets boolean checkboxes often return TRUE/FALSE)
        const isResting = (() => {
          if (restingStatusRaw === null || restingStatusRaw === undefined) {
            return false;
          }
          if (typeof restingStatusRaw === "boolean") return restingStatusRaw;
          if (typeof restingStatusRaw === "string") {
            const normalized = restingStatusRaw.trim().toLowerCase();
            return ["true", "yes", "y", "1"].includes(normalized);
          }
          return false;
        })();

        if (isResting) {
          logger.info(
            `${sheetConfig.name} is resting today (restingStatusCell=${sheetConfig.restingStatusCell}). Skipping supply deduction.`
          );
        }

        // Validate that we got values
        if (currentSupplies === null || currentSupplies === undefined) {
          throw new Error(
            `No data found in current supplies cell ${sheetConfig.currentSuppliesCell}`
          );
        }
        if (dailyConsumption === null || dailyConsumption === undefined) {
          throw new Error(
            `No data found in daily consumption cell ${sheetConfig.dailyConsumptionCell}`
          );
          ko;
        }
        if (totalCarriedRaw === null || totalCarriedRaw === undefined) {
          throw new Error(
            `No data found in total carried cell ${sheetConfig.totalCarriedCell}`
          );
        }
        if (carryingCapacityRaw === null || carryingCapacityRaw === undefined) {
          throw new Error(
            `No data found in carrying capacity cell ${sheetConfig.currentCarryingCapacityCell}`
          );
        }

        // Calculate new supply value after daily consumption (if not resting)
        const currentSuppliesFloat = parseNumericValue(currentSupplies);
        const dailyConsumptionFloat = parseNumericValue(dailyConsumption);
        const totalCarried = parseNumericValue(totalCarriedRaw);
        const carryingCapacity = parseNumericValue(carryingCapacityRaw);

        if (
          isNaN(currentSuppliesFloat) ||
          isNaN(dailyConsumptionFloat) ||
          isNaN(totalCarried) ||
          isNaN(carryingCapacity)
        ) {
          throw new Error(
            "Invalid supply, consumption, carried, or capacity values - must be numbers"
          );
        }

        if (dailyConsumptionFloat <= 0) {
          throw new Error("Daily consumption must be greater than 0");
        }

        const newSupplyValue = isResting
          ? currentSuppliesFloat // no change while resting
          : Math.max(0, currentSuppliesFloat - dailyConsumptionFloat);

        // Check if supplies are already at zero or will hit zero (only relevant if not resting)
        const suppliesWereZero = currentSuppliesFloat === 0;
        const suppliesHitZero =
          !isResting && currentSuppliesFloat > 0 && newSupplyValue === 0;

        // Calculate how much supply weight was actually consumed today (could be partial if we hit zero)
        const suppliesConsumedToday = isResting
          ? 0
          : Math.max(0, currentSuppliesFloat - newSupplyValue);

        // Adjust total carried to reflect the deduction of supplies already consumed today.
        // Rationale: The sheet's total carried value represents the state *before* today's automated deduction.
        // For reporting (capacity %, over-capacity alerts, etc.) we want the post-consumption carrying state.
        const adjustedTotalCarried = Math.max(
          0,
          totalCarried - suppliesConsumedToday
        );

        logger.info(
          `${sheetConfig.name}: Current supplies: ${currentSuppliesFloat}, Daily consumption: ${dailyConsumptionFloat}, Consumed today: ${suppliesConsumedToday}, New supply value: ${newSupplyValue}, Resting: ${isResting}, Total carried (raw): ${totalCarried}, Total carried (adjusted): ${adjustedTotalCarried}, Carrying capacity: ${carryingCapacity}`
        );

        // Only update the sheet if supplies weren't already at zero and not resting
        if (!suppliesWereZero && !isResting) {
          // Update the current supplies in the Google Sheet
          await sheetsService.updateCellValue(
            sheetConfig.sheetId,
            sheetConfig.currentSuppliesCell,
            newSupplyValue,
            sheetConfig.sheetName
          );

          logger.info(
            `Updated ${sheetConfig.name} current supplies from ${currentSuppliesFloat} to ${newSupplyValue}`
          );
        } else if (isResting) {
          logger.info(
            `${sheetConfig.name} is resting - no supply update performed`
          );
        } else {
          logger.info(
            `${sheetConfig.name} supplies were already at zero - no update needed`
          );
        }

        // Parse optional numeric-ish values safely
        const ownedAndCarriedLoot =
          ownedAndCarriedLootRaw != null &&
          ownedAndCarriedLootRaw !== "" &&
          !isNaN(parseFloat((ownedAndCarriedLootRaw + "").replace(/,/g, "")))
            ? parseNumericValue(ownedAndCarriedLootRaw)
            : ownedAndCarriedLootRaw;
        const paidAndCarriedLoot =
          paidAndCarriedLootRaw != null &&
          paidAndCarriedLootRaw !== "" &&
          !isNaN(parseFloat((paidAndCarriedLootRaw + "").replace(/,/g, "")))
            ? parseNumericValue(paidAndCarriedLootRaw)
            : paidAndCarriedLootRaw;
        const currentMorale =
          currentMoraleRaw != null ? currentMoraleRaw : null;
        const restingMorale =
          restingMoraleRaw != null ? restingMoraleRaw : null;
        const armyLength =
          armyLengthRaw != null &&
          armyLengthRaw !== "" &&
          !isNaN(parseFloat((armyLengthRaw + "").replace(/,/g, "")))
            ? parseNumericValue(armyLengthRaw)
            : armyLengthRaw;
        const effectiveArmySize =
          effectiveArmySizeRaw != null &&
          effectiveArmySizeRaw !== "" &&
          !isNaN(parseFloat((effectiveArmySizeRaw + "").replace(/,/g, "")))
            ? parseNumericValue(effectiveArmySizeRaw)
            : effectiveArmySizeRaw;
        const forcedMarchDays =
          forcedMarchDaysRaw != null &&
          forcedMarchDaysRaw !== "" &&
          !isNaN(parseFloat((forcedMarchDaysRaw + "").replace(/,/g, "")))
            ? parseNumericValue(forcedMarchDaysRaw)
            : forcedMarchDaysRaw;
        const shippingStatus =
          shippingStatusRaw != null ? shippingStatusRaw : null;
        const supplyShipsCount =
          supplyShipsCountRaw != null &&
          supplyShipsCountRaw !== "" &&
          !isNaN(parseFloat((supplyShipsCountRaw + "").replace(/,/g, "")))
            ? parseNumericValue(supplyShipsCountRaw)
            : supplyShipsCountRaw;

        // Send appropriate Discord notification based on supply status
        // (sheetUrl declared above)
        if (!isResting && (suppliesWereZero || suppliesHitZero)) {
          await discordNotifier.sendZeroSupplies({
            name: sheetConfig.name,
            suppliesWereAlreadyZero: suppliesWereZero,
            dailyConsumption: dailyConsumptionFloat,
            webhookUrl: sheetConfig.webhookUrl,
            totalCarried: adjustedTotalCarried,
            carryingCapacity,
            overCapacity: adjustedTotalCarried > carryingCapacity,
            ownedAndCarriedLoot,
            paidAndCarriedLoot,
            currentMorale,
            restingMorale,
            armyLength,
            effectiveArmySize,
            forcedMarchDays,
            shippingStatus,
            supplyShipsCount,
            sheetUrl,
          });
        } else {
          const daysRemaining = calculateDaysRemaining(
            newSupplyValue,
            dailyConsumptionFloat
          );

          await discordNotifier.sendSupplyStatus({
            name: sheetConfig.name + (isResting ? " (Resting)" : ""),
            currentSupplies: newSupplyValue,
            dailyConsumption: dailyConsumptionFloat,
            daysRemaining,
            webhookUrl: sheetConfig.webhookUrl,
            totalCarried: adjustedTotalCarried,
            carryingCapacity,
            overCapacity: adjustedTotalCarried > carryingCapacity,
            ownedAndCarriedLoot,
            paidAndCarriedLoot,
            currentMorale,
            restingMorale,
            armyLength,
            effectiveArmySize,
            forcedMarchDays,
            shippingStatus,
            supplyShipsCount,
            sheetUrl,
          });
        }
      } catch (error) {
        logger.error(`Error processing sheet ${sheetConfig.name}:`, error);

        // Send error notification to Discord
        try {
          await discordNotifier.sendError({
            sheetName: sheetConfig.name,
            error: error.message,
            webhookUrl: sheetConfig.webhookUrl,
            sheetUrl,
          });
        } catch (notifyError) {
          logger.error("Failed to send error notification:", notifyError);
        }
      }

      // Sleep to avoid hitting rate limits
      await sleep(2000); // Sleep for 2 seconds (2000 milliseconds)
    }

    logger.info("Supply status monitor completed successfully");
  } catch (error) {
    logger.error("Fatal error in supply status monitor:", error);
    process.exit(1);
  }
}

function calculateDaysRemaining(currentSupplies, dailyConsumption) {
  const current = parseNumericValue(currentSupplies);
  const daily = parseNumericValue(dailyConsumption);

  if (daily <= 0) {
    throw new Error("Daily consumption must be greater than 0");
  }

  return Math.floor(current / daily);
}

// Run the main function
if (require.main === module) {
  main().catch((error) => {
    logger.error("Unhandled error:", error);
    process.exit(1);
  });
}

module.exports = { main, calculateDaysRemaining };
