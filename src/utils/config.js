const fs = require("fs").promises;
const path = require("path");
const { logger } = require("./logger");

async function loadConfig() {
  try {
    // Check if we're running in GitHub Actions with environment variable config
    if (process.env.SHEETS_CONFIG) {
      logger.info("Loading configuration from environment variable");
      return JSON.parse(process.env.SHEETS_CONFIG);
    }

    // Load from config file
    const configPath = process.env.SHEETS_CONFIG_PATH || "./config/sheets.json";
    const fullPath = path.resolve(configPath);

    logger.info(`Loading configuration from file: ${fullPath}`);

    const configFile = await fs.readFile(fullPath, "utf8");
    const config = JSON.parse(configFile);

    // Validate configuration
    validateConfig(config);

    return config;
  } catch (error) {
    logger.error("Failed to load configuration:", error);
    throw new Error(`Configuration loading failed: ${error.message}`);
  }
}

function validateConfig(config) {
  if (!Array.isArray(config)) {
    throw new Error("Configuration must be an array of sheet configurations");
  }

  if (config.length === 0) {
    throw new Error(
      "Configuration must contain at least one sheet configuration"
    );
  }

  config.forEach((sheetConfig, index) => {
    const requiredFields = [
      "name",
      "sheetId",
      "webhookUrl",
      "currentSuppliesCell",
      "dailyConsumptionCell",
    ];

    for (const field of requiredFields) {
      if (!sheetConfig[field]) {
        throw new Error(
          `Sheet configuration ${index} is missing required field: ${field}`
        );
      }
    }

    // Validate webhook URL format
    try {
      new URL(sheetConfig.webhookUrl);
    } catch (error) {
      throw new Error(
        `Sheet configuration ${index} has invalid webhook URL: ${sheetConfig.webhookUrl}`
      );
    }

    // Validate cell addresses (basic validation)
    if (!isValidCellAddress(sheetConfig.currentSuppliesCell)) {
      throw new Error(
        `Sheet configuration ${index} has invalid currentSuppliesCell: ${sheetConfig.currentSuppliesCell}`
      );
    }

    if (!isValidCellAddress(sheetConfig.dailyConsumptionCell)) {
      throw new Error(
        `Sheet configuration ${index} has invalid dailyConsumptionCell: ${sheetConfig.dailyConsumptionCell}`
      );
    }

    // Optional resting status cell
    if (sheetConfig.restingStatusCell) {
      if (!isValidCellAddress(sheetConfig.restingStatusCell)) {
        throw new Error(
          `Sheet configuration ${index} has invalid restingStatusCell: ${sheetConfig.restingStatusCell}`
        );
      }
    }
  });

  logger.info(`Configuration validation passed for ${config.length} sheets`);
}

function isValidCellAddress(cellAddress) {
  // Basic validation for cell addresses like A1, B2, AA10, etc.
  return /^[A-Z]+[1-9][0-9]*$/.test(cellAddress);
}

module.exports = {
  loadConfig,
  validateConfig,
  isValidCellAddress,
};
