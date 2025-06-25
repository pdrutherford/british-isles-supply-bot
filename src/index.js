// Load environment variables from .env file
require("dotenv").config();

const { GoogleSheetsService } = require("./services/googleSheets");
const { DiscordNotifier } = require("./services/discord");
const { loadConfig } = require("./utils/config");
const { logger } = require("./utils/logger");

async function main() {
  try {
    logger.info("Starting supply status monitor...");

    // Load configuration
    const config = await loadConfig();
    logger.info(`Loaded configuration for ${config.length} sheets`);

    // Initialize services
    const sheetsService = new GoogleSheetsService();
    const discordNotifier = new DiscordNotifier();

    // Process each sheet configuration
    for (const sheetConfig of config) {
      try {
        logger.info(`Processing sheet: ${sheetConfig.name}`);

        // Get data from Google Sheets
        const currentSupplies = await sheetsService.getCellValue(
          sheetConfig.sheetId,
          sheetConfig.currentSuppliesCell
        );

        const dailyConsumption = await sheetsService.getCellValue(
          sheetConfig.sheetId,
          sheetConfig.dailyConsumptionCell
        );

        // Calculate days remaining
        const daysRemaining = calculateDaysRemaining(
          currentSupplies,
          dailyConsumption
        );

        // Send Discord notification
        await discordNotifier.sendSupplyStatus({
          name: sheetConfig.name,
          currentSupplies,
          dailyConsumption,
          daysRemaining,
          webhookUrl: sheetConfig.webhookUrl,
        });

        logger.info(
          `Successfully processed ${sheetConfig.name}: ${daysRemaining} days remaining`
        );
      } catch (error) {
        logger.error(`Error processing sheet ${sheetConfig.name}:`, error);

        // Send error notification to Discord
        try {
          await discordNotifier.sendError({
            sheetName: sheetConfig.name,
            error: error.message,
            webhookUrl: sheetConfig.webhookUrl,
          });
        } catch (notifyError) {
          logger.error("Failed to send error notification:", notifyError);
        }
      }
    }

    logger.info("Supply status monitor completed successfully");
  } catch (error) {
    logger.error("Fatal error in supply status monitor:", error);
    process.exit(1);
  }
}

function calculateDaysRemaining(currentSupplies, dailyConsumption) {
  const current = parseFloat(currentSupplies);
  const daily = parseFloat(dailyConsumption);

  if (isNaN(current) || isNaN(daily)) {
    throw new Error("Invalid supply or consumption values - must be numbers");
  }

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
