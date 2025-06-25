const { google } = require("googleapis");
const path = require("path");
const fs = require("fs");
const { logger } = require("../utils/logger");

class GoogleSheetsService {
  constructor() {
    this.sheets = null;
    this.auth = null;
  }

  async initialize() {
    if (this.sheets) {
      return; // Already initialized
    }

    try {
      // Load service account credentials
      let credentials;

      if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
        // For GitHub Actions - decode base64 encoded key
        const keyBuffer = Buffer.from(
          process.env.GOOGLE_SERVICE_ACCOUNT_KEY,
          "base64"
        );
        credentials = JSON.parse(keyBuffer.toString("utf8"));
      } else if (process.env.GOOGLE_SERVICE_ACCOUNT_PATH) {
        // For local development - load from file
        const serviceAccountPath = path.resolve(
          process.env.GOOGLE_SERVICE_ACCOUNT_PATH
        );
        const serviceAccountJson = fs.readFileSync(serviceAccountPath, "utf8");
        credentials = JSON.parse(serviceAccountJson);
      } else {
        throw new Error(
          "No Google Service Account credentials found. Set GOOGLE_SERVICE_ACCOUNT_KEY or GOOGLE_SERVICE_ACCOUNT_PATH"
        );
      }

      // Create JWT auth client
      this.auth = new google.auth.JWT(
        credentials.client_email,
        null,
        credentials.private_key,
        ["https://www.googleapis.com/auth/spreadsheets"]
      );

      // Initialize the Sheets API
      this.sheets = google.sheets({ version: "v4", auth: this.auth });

      logger.info("Google Sheets service initialized successfully");
    } catch (error) {
      logger.error("Failed to initialize Google Sheets service:", error);
      throw error;
    }
  }

  async getCellValue(sheetId, cellAddress) {
    await this.initialize();

    try {
      // Get the second sheet's name
      const sheetInfo = await this.getSheetInfo(sheetId);

      if (!sheetInfo.sheets || sheetInfo.sheets.length < 2) {
        throw new Error(
          `Spreadsheet ${sheetId} must have at least 2 sheets. Found ${
            sheetInfo.sheets?.length || 0
          } sheets.`
        );
      }

      const secondSheetName = sheetInfo.sheets[1].title;
      const rangeWithSheet = `'${secondSheetName}'!${cellAddress}`;

      logger.debug(
        `Getting cell value from sheet ${sheetId}, second sheet "${secondSheetName}", cell ${cellAddress}`
      );

      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range: rangeWithSheet,
      });

      const values = response.data.values;

      if (
        !values ||
        values.length === 0 ||
        !values[0] ||
        values[0].length === 0
      ) {
        throw new Error(
          `No data found in cell ${cellAddress} of sheet "${secondSheetName}"`
        );
      }

      const cellValue = values[0][0];
      logger.debug(
        `Retrieved cell value from "${secondSheetName}": ${cellValue}`
      );

      return cellValue;
    } catch (error) {
      logger.error(
        `Error getting cell value from ${sheetId}:${cellAddress}:`,
        error
      );
      throw error;
    }
  }

  async updateCellValue(sheetId, cellAddress, value) {
    await this.initialize();

    try {
      // Get the second sheet's name
      const sheetInfo = await this.getSheetInfo(sheetId);

      if (!sheetInfo.sheets || sheetInfo.sheets.length < 2) {
        throw new Error(
          `Spreadsheet ${sheetId} must have at least 2 sheets. Found ${
            sheetInfo.sheets?.length || 0
          } sheets.`
        );
      }

      const secondSheetName = sheetInfo.sheets[1].title;
      const rangeWithSheet = `'${secondSheetName}'!${cellAddress}`;

      logger.debug(
        `Updating cell value in sheet ${sheetId}, second sheet "${secondSheetName}", cell ${cellAddress} to value: ${value}`
      );

      const response = await this.sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: rangeWithSheet,
        valueInputOption: "RAW",
        requestBody: {
          values: [[value]],
        },
      });

      logger.debug(
        `Successfully updated cell "${cellAddress}" in sheet "${secondSheetName}" with value: ${value}`
      );

      return response.data;
    } catch (error) {
      logger.error(
        `Error updating cell value in ${sheetId}:${cellAddress}:`,
        error
      );
      throw error;
    }
  }

  async getSheetInfo(sheetId) {
    await this.initialize();

    try {
      const response = await this.sheets.spreadsheets.get({
        spreadsheetId: sheetId,
      });

      return {
        title: response.data.properties.title,
        locale: response.data.properties.locale,
        sheets: response.data.sheets.map((sheet) => ({
          title: sheet.properties.title,
          sheetId: sheet.properties.sheetId,
        })),
      };
    } catch (error) {
      logger.error(`Error getting sheet info for ${sheetId}:`, error);
      throw error;
    }
  }
}

module.exports = { GoogleSheetsService };
