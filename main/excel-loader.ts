import XLSX from "xlsx";

export function parseAccountExcel(
  filePath: string
): { email: string; password: string }[] {
  try {
    console.log("Reading Excel file:", filePath);
    const workbook = XLSX.readFile(filePath);
    console.log("Workbook loaded:", workbook ? "success" : "failed");

    if (!workbook) {
      throw new Error(
        "Could not read the Excel file. Please ensure it's a valid Excel file."
      );
    }

    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      throw new Error(
        "Excel file has no sheets. Please ensure the file has at least one sheet."
      );
    }

    const sheetName = workbook.SheetNames[0];
    console.log("Using sheet:", sheetName);
    const sheet = workbook.Sheets[sheetName];

    if (!sheet) {
      throw new Error(`Sheet '${sheetName}' is empty or invalid.`);
    }

    // Parse as array of arrays (rows)
    const data = XLSX.utils.sheet_to_json(sheet, { defval: "", header: 1 });
    console.log("Raw data length:", data ? data.length : "undefined");

    if (!Array.isArray(data)) {
      throw new Error("Could not parse sheet data.");
    }

    if (data.length === 0) {
      throw new Error(
        "Excel file appears to be empty. Please ensure it contains data."
      );
    }

    console.log("First few rows:", data.slice(0, 3));

    const validAccounts: { email: string; password: string }[] = [];

    // Skip header row if it exists (check if first row contains column names)
    let startIndex = 0;
    const firstRow = data[0];
    if (Array.isArray(firstRow) && firstRow.length >= 2) {
      const firstCell = String(firstRow[0] || "")
        .toLowerCase()
        .trim();
      const secondCell = String(firstRow[1] || "")
        .toLowerCase()
        .trim();

      // If first row looks like headers, skip it
      if (
        (firstCell.includes("email") || firstCell.includes("mail")) &&
        (secondCell.includes("password") || secondCell.includes("pass"))
      ) {
        console.log("Detected header row, skipping it");
        startIndex = 1;
      }
    }

    for (let index = startIndex; index < data.length; index++) {
      const row = data[index];
      console.log(`Processing row ${index + 1}:`, row);

      if (!Array.isArray(row) || row.length < 2) {
        console.warn(`Skipping row ${index + 1}: invalid format`);
        continue;
      }

      const email = String(row[0] || "").trim();
      const password = String(row[1] || "").trim();

      console.log(
        `Row ${index + 1} - Email: '${email}', Password: '${
          password ? "***" : ""
        }'`
      );

      if (!email || !password) {
        console.warn(`Skipping row ${index + 1}: missing email or password`);
        continue;
      }

      // Basic email validation
      if (!email.includes("@") || !email.includes(".")) {
        console.warn(
          `Skipping row ${index + 1}: invalid email format '${email}'`
        );
        continue;
      }

      validAccounts.push({ email, password });
    }

    console.log("Valid accounts found:", validAccounts.length);

    if (validAccounts.length === 0) {
      throw new Error(
        "No valid accounts found. Please ensure the Excel file has columns for email and password, with data starting from the first or second row."
      );
    }

    return validAccounts;
  } catch (error: any) {
    console.error("Error parsing Excel file:", error);
    throw new Error(`Failed to parse Excel file: ${error.message}`);
  }
}
