const SHEET_NAME = "kidney_kun_sync";
const SPREADSHEET_ID = "";

function doGet(e) {
  return handleRequest(e, "GET");
}

function doPost(e) {
  return handleRequest(e, "POST");
}

function handleRequest(e, method) {
  try {
    const body = parseBody(e);
    const action = body.action || "status";
    if (action === "status") {
      return output(e, {
        ok: true,
        method,
        spreadsheetName: getSpreadsheet().getName(),
        sheetName: getSheet().getName(),
        checkedAt: new Date().toISOString()
      });
    }
    if (action === "pull") {
      return output(e, { ok: true, data: readSnapshot(), checkedAt: new Date().toISOString() });
    }
    if (action === "push") {
      writeSnapshot(body.data || {});
      return output(e, { ok: true, savedAt: new Date().toISOString() });
    }
    return output(e, { ok: false, error: "unknown action: " + action });
  } catch (error) {
    return output(e, {
      ok: false,
      error: String(error && error.message ? error.message : error),
      stack: String(error && error.stack ? error.stack : "")
    });
  }
}

function parseBody(e) {
  const params = (e && e.parameter) || {};
  if (params.data || params.action) {
    return {
      action: params.action || "",
      data: params.data ? JSON.parse(params.data) : null
    };
  }
  const contents = e && e.postData && e.postData.contents;
  if (contents) return JSON.parse(contents);
  return {};
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
  const spreadsheet = getSpreadsheet();
  let sheet = spreadsheet.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = spreadsheet.insertSheet(SHEET_NAME);
  return sheet;
}

function getSpreadsheet() {
  if (SPREADSHEET_ID) return SpreadsheetApp.openById(SPREADSHEET_ID);
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) {
    throw new Error("Spreadsheetを取得できません。スプレッドシートに紐づくApps Scriptで実行するか、SPREADSHEET_IDを設定してください。");
  }
  return spreadsheet;
}

function output(e, value) {
  const callback = e && e.parameter && e.parameter.callback;
  const json = JSON.stringify(value);
  if (callback) {
    return ContentService
      .createTextOutput(callback + "(" + json + ");")
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}
