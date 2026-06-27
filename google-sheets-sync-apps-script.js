const SHEET_NAME = "kidney_kun_sync";

function doPost(e) {
  const body = JSON.parse((e && e.postData && e.postData.contents) || "{}");
  if (body.action === "pull") {
    return jsonOutput({ ok: true, data: readSnapshot() });
  }
  if (body.action === "push") {
    writeSnapshot(body.data || {});
    return jsonOutput({ ok: true, savedAt: new Date().toISOString() });
  }
  return jsonOutput({ ok: false, error: "unknown action" });
}

function readSnapshot() {
  const sheet = getSheet();
  const value = sheet.getRange("A2").getValue();
  if (!value) {
    return { version: 2, food: {}, bp: {}, settings: {}, updatedAt: "" };
  }
  return JSON.parse(value);
}

function writeSnapshot(data) {
  const sheet = getSheet();
  sheet.getRange("A1").setValue("json");
  sheet.getRange("B1").setValue("updatedAt");
  sheet.getRange("A2").setValue(JSON.stringify(data));
  sheet.getRange("B2").setValue(new Date());
}

function getSheet() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = spreadsheet.insertSheet(SHEET_NAME);
  return sheet;
}

function jsonOutput(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
