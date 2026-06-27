const SHEET_NAME = "kidney_kun_sync";
const SPREADSHEET_ID = "";
const DATA_CELL = "B2";

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
    writeDebugRows(body, method);
    Logger.log("kidney_kun_sync body summary: " + JSON.stringify(bodySummary(body)));
    if (body && body.data) {
      Logger.log("kidney_kun_sync body.data: " + JSON.stringify(body.data));
    }
    if (action === "status") {
      return output(e, {
        ok: true,
        method,
        spreadsheetName: getSpreadsheet().getName(),
        spreadsheetUrl: getSpreadsheet().getUrl(),
        sheetName: getSheet().getName(),
        dataCell: DATA_CELL,
        checkedAt: new Date().toISOString()
      });
    }
    if (action === "pull") {
      return output(e, { ok: true, data: readSnapshot(), checkedAt: new Date().toISOString() });
    }
    if (action === "push") {
      writeSnapshot(body.data || {});
      return output(e, { ok: true, savedAt: new Date().toISOString(), summary: bodySummary(body) });
    }
    return output(e, { ok: false, error: "unknown action: " + action, summary: bodySummary(body) });
  } catch (error) {
    try {
      writeErrorRows(error);
    } catch (debugError) {
      Logger.log("kidney_kun_sync debug write failed: " + debugError);
    }
    return output(e, {
      ok: false,
      error: String(error && error.message ? error.message : error),
      stack: String(error && error.stack ? error.stack : "")
    });
  }
}

function parseBody(e) {
  const params = (e && e.parameter) || {};
  const parameterKeys = Object.keys(params);
  Logger.log("kidney_kun_sync raw parameter keys: " + parameterKeys.join(","));
  if (params.data || params.action) {
    const rawData = String(params.data || "");
    Logger.log("kidney_kun_sync raw params.data length: " + rawData.length);
    Logger.log("kidney_kun_sync raw params.data preview: " + rawData.slice(0, 1000));
    return {
      action: params.action || "",
      data: rawData ? JSON.parse(rawData) : null,
      _rawDataLength: rawData.length,
      _rawDataPreview: rawData.slice(0, 1000),
      _source: "parameter",
      _parameterKeys: parameterKeys
    };
  }
  const contents = e && e.postData && e.postData.contents;
  const rawPostData = String(contents || "");
  Logger.log("kidney_kun_sync raw postData length: " + rawPostData.length);
  Logger.log("kidney_kun_sync raw postData preview: " + rawPostData.slice(0, 1000));
  if (rawPostData) {
    const parsed = JSON.parse(rawPostData);
    parsed._rawDataLength = rawPostData.length;
    parsed._rawDataPreview = rawPostData.slice(0, 1000);
    parsed._source = "postData";
    parsed._parameterKeys = parameterKeys;
    return parsed;
  }
  return { action: "", data: null, _rawDataLength: 0, _rawDataPreview: "", _source: "empty", _parameterKeys: parameterKeys };
}

function bodySummary(body) {
  const data = body && body.data;
  return {
    action: body && body.action,
    source: body && body._source,
    parameterKeys: body && body._parameterKeys,
    rawDataLength: body && body._rawDataLength,
    hasData: Boolean(data),
    foodCount: data && data.food ? Object.keys(data.food).length : 0,
    bpCount: data && data.bp ? Object.keys(data.bp).length : 0,
    hasSettings: Boolean(data && data.settings),
    jsonLength: data ? JSON.stringify(data).length : 0
  };
}

function writeDebugRows(body, method) {
  const sheet = getSheet();
  const summary = bodySummary(body);
  const preview = body && body.data ? JSON.stringify(body.data).slice(0, 3000) : (body && body._rawDataPreview) || "";
  sheet.getRange("A1").setValue("action: " + (summary.action || "") + " / method: " + method + " / source: " + (summary.source || ""));
  sheet.getRange("A2").setValue("params.data length: " + (summary.rawDataLength || 0));
  sheet.getRange("A3").setValue("foodCount: " + summary.foodCount);
  sheet.getRange("A4").setValue("bpCount: " + summary.bpCount);
  sheet.getRange("A5").setValue("JSON preview: " + preview);
  sheet.getRange("B1").setValue("lastDebugAt: " + new Date().toISOString());
  sheet.getRange("C1").setValue("spreadsheetUrl: " + getSpreadsheet().getUrl());
}

function writeErrorRows(error) {
  const sheet = getSheet();
  sheet.getRange("A1").setValue("error");
  sheet.getRange("A2").setValue(String(error && error.message ? error.message : error));
  sheet.getRange("A3").setValue(String(error && error.stack ? error.stack : ""));
  sheet.getRange("B1").setValue("lastErrorAt: " + new Date().toISOString());
}

function readSnapshot() {
  const sheet = getSheet();
  const value = sheet.getRange(DATA_CELL).getValue();
  if (value) return JSON.parse(value);

  const legacyValue = sheet.getRange("A2").getValue();
  if (legacyValue && String(legacyValue).trim().charAt(0) === "{") return JSON.parse(legacyValue);

  return { version: 2, food: {}, bp: {}, settings: {}, updatedAt: "" };
}

function writeSnapshot(data) {
  Logger.log("kidney_kun_sync writeSnapshot summary: " + JSON.stringify(bodySummary({ action: "push", data: data })));
  const sheet = getSheet();
  sheet.getRange(DATA_CELL).setValue(JSON.stringify(data || {}));
  sheet.getRange("B3").setValue("savedAt: " + new Date().toISOString());
  sheet.getRange("B4").setValue("jsonLength: " + JSON.stringify(data || {}).length);
  sheet.getRange("B5").setValue("dataCell: " + DATA_CELL);
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
