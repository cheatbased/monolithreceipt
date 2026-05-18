/**

 * Billing → PDF helper for Google Workspace.

 *

 * Script properties :

 * - DRIVE_FOLDER_ID (required)

 * - DRIVE_ORGANIZATION = ISO_MONTH | FY_TRIMESTRES_FR | NONE

 *     blank ⇒ ISO_MONTH when ORGANIZE_BY_MONTH defaults true

 *

 * FY layout :

 * - FY_LEAF_COUNTER = FISCAL (default, n runs 1=AVRIL … 12=MARS) | QUARTER (n restarts 1..3 per trimester)

 * - FY_TRIMESTRE_FOLDER_TEMPLATE (default Trimestre {{t}})

 * - FY_MONTH_LEAF_FOLDER_TEMPLATE (default {{n}}. {{MONTH_FR}})

 *

 * ISO layout :

 * - ORGANIZE_BY_MONTH, MONTH_FOLDER_FORMAT (default yyyy-MM)

 */



var BILLING_LABEL = "Billing";

var PROCESSED_LABEL = "Billing Processed";

var THREADS_PER_RUN = 50;



var FR_MONTH_UPPER = ["", "JANVIER", "FEVRIER", "MARS", "AVRIL", "MAI", "JUIN", "JUILLET", "AOUT", "SEPTEMBRE", "OCTOBRE", "NOVEMBRE", "DECEMBRE"];



function setupOnceFromEditor() {

  requireDriveFolderId_();



  var props = PropertiesService.getScriptProperties();



  getOrCreateUserLabel(PROCESSED_LABEL);



  GmailApp.getUserLabelByName(BILLING_LABEL);



  DriveApp.getFolderById(props.getProperty("DRIVE_FOLDER_ID"));

  logLayoutPreview_(props);



  Logger.log("Ready.");

}



function syncBillingInvoices() {

  requireDriveFolderId_();



  var rootFolder = DriveApp.getFolderById(PropertiesService.getScriptProperties().getProperty("DRIVE_FOLDER_ID"));

  var processed = getOrCreateUserLabel(PROCESSED_LABEL);



  var query =

    "label:" +

    quoteLabel_(BILLING_LABEL) +

    " -label:" +

    quoteLabel_(PROCESSED_LABEL) +

    " has:attachment";



  var threads = GmailApp.search(query, 0, THREADS_PER_RUN);



  var idx;



  for (idx = 0; idx < threads.length; idx++) {

    try {

      var thread = threads[idx];

      var messages = thread.getMessages();

      var uploads = 0;

      var j;

      for (j = 0; j < messages.length; j++) uploads += persistPdfs_(rootFolder, messages[j]);

      if (uploads > 0) thread.addLabel(processed);

    } catch (error) {



      Logger.log(error && error.stack ? error.stack : error);



    }

  }

}







function logLayoutPreview_(props) {







  switch (organizationMode_(props)) {









    case "FY": {







      var fy = fyBundle_(props);







      var sample = fyTitles_(new Date(), fy);









      Logger.log('FY ▸ "%s" ▸ "%s" (counter=%s)', sample.trimName, sample.monthLeaf, fy.counterKind);









      break;







    }





    case "NONE":





      Logger.log("NONE ▸ flat uploads.");









      break;







    default:







      Logger.log(





        'ISO ▸ template %s ▸ "%s"',





        isoPattern_(props),





        Utilities.formatDate(new Date(), Session.getScriptTimeZone(), isoPattern_(props)),





      );





  }





}











function persistPdfs_(rootFolder, message) {







  var pdfs = [];





  var attachments = message.getAttachments({ includeInlineImages: false });





  var i;





  for (i = 0; i < attachments.length; i++) {





    if (/^application\/pdf(;|$)/i.test(String(attachments[i].getContentType() || ""))) pdfs.push(attachments[i]);





  }







  var destination = targetFolder_(rootFolder, message.getDate());





  var day = Utilities.formatDate(message.getDate(), Session.getScriptTimeZone(), "yyyy-MM-dd");





  var subject = sanitizeName_(message.getSubject() || "invoice");





  var total = 0;





  for (i = 0; i < pdfs.length; i++) {







    var baseName = sanitizeName_(String(pdfs[i].getName() || "attachment")).replace(/\.pdf$/i, "");





    var suffix = pdfs.length > 1 ? "_part" + (i + 1) : "";





    destination.createFile(pdfs[i].copyBlob()).setName(day + "_" + subject + suffix + "_" + baseName + ".pdf");





    total++;





  }





  return total;





}











function organizationMode_(props) {







  var token = normalizeFlag_(props.getProperty("DRIVE_ORGANIZATION"));





  if (!token) return organizeMonth_(props) ? "ISO" : "NONE";





  if (token === "FY_TRIMESTRES_FR" || token === "FY_TRIMESTERS_FR" || token === "FR_FY_TRIMESTERS") return "FY";





  if (token === "NONE" || token === "ROOT") return "NONE";





  if (token === "ISO_MONTH" || token === "ISO") return "ISO";





  throw new Error("Unknown DRIVE_ORGANIZATION");





}











function fyCounterKind_(props) {







  var token = normalizeFlag_(props.getProperty("FY_LEAF_COUNTER"));





  if (!token || token === "FISCAL" || token === "FY" || token === "YEAR" || token === "ANNEE") return "FISCAL";





  if (token === "QUARTER" || token === "TRIM" || token === "SLOT") return "QUARTER";





  throw new Error("FY_LEAF_COUNTER must be FISCAL or QUARTER");





}











function fyBundle_(props) {







  return {





    timezone: Session.getScriptTimeZone(),





    trimTpl: firstNonEmpty_(props.getProperty("FY_TRIMESTRE_FOLDER_TEMPLATE"), "Trimestre {{t}}"),





    leafTpl: firstNonEmpty_(props.getProperty("FY_MONTH_LEAF_FOLDER_TEMPLATE"), "{{n}}. {{MONTH_FR}}"),





    counterKind: fyCounterKind_(props),





  };





}











function firstNonEmpty_(value, fallback) {







  return value && String(value).trim() ? String(value).trim() : fallback;





}











function tokenize_(template, map) {







  var output = template;





  var key;





  for (key in map) {







    if (!Object.prototype.hasOwnProperty.call(map, key)) continue;





    var pattern = "{{\\s*" + key + "\\s*}}";





    output = output.replace(new RegExp(pattern, "gi"), map[key]);





  }





  return output;





}











function fyQuarter_(calendarMonth) {







  var m = Number(calendarMonth);





  if (m >= 4 && m <= 6) return { quarter: 1, slot: m - 3 };





  if (m >= 7 && m <= 9) return { quarter: 2, slot: m - 6 };





  if (m >= 10 && m <= 12) return { quarter: 3, slot: m - 9 };





  if (m >= 1 && m <= 3) return { quarter: 4, slot: m };





  throw new Error("Month out of range");





}











function fyRunningNumber_(calendarMonth) {







  var month = Number(calendarMonth);





  var table = { 4: 1, 5: 2, 6: 3, 7: 4, 8: 5, 9: 6, 10: 7, 11: 8, 12: 9, 1: 10, 2: 11, 3: 12 };





  if (!Object.prototype.hasOwnProperty.call(table, month)) throw new Error("FY counter missing");





  return table[month];





}











function fyTitles_(dateValue, fy) {







  var calMonth = Number(Utilities.formatDate(dateValue, fy.timezone, "M"));





  if (!calMonth || calMonth < 1 || calMonth > 12) throw new Error("Cannot read calendar month");





  var quarter = fyQuarter_(calMonth);





  var french = FR_MONTH_UPPER[calMonth];





  if (!french) throw new Error("FR label missing");



  var seq = fy.counterKind === "QUARTER" ? quarter.slot : fyRunningNumber_(calMonth);



  var ctx = {



    t: String(quarter.quarter),







    n: String(seq),

    MONTH_FR: french,

  };



  return {

    trimName: tokenize_(fy.trimTpl, ctx),

    monthLeaf: tokenize_(fy.leafTpl, ctx),

  };

}







function targetFolder_(rootFolder, mailDate) {

  var props = PropertiesService.getScriptProperties();



  var mode = organizationMode_(props);





  if (mode === "FY") {

    var fy = fyBundle_(props);





    var path = fyTitles_(mailDate, fy);





    var trimFolder = ensureChild_(rootFolder, path.trimName);





    return ensureChild_(trimFolder, path.monthLeaf);

  }











  if (mode === "NONE") return rootFolder;





  if (!organizeMonth_(props)) return rootFolder;





  var leaf = Utilities.formatDate(mailDate, Session.getScriptTimeZone(), isoPattern_(props));





  return ensureChild_(rootFolder, leaf);

}











function organizeMonth_(props) {







  var flag = String(props.getProperty("ORGANIZE_BY_MONTH") || "true").toLowerCase();





  return !(flag === "false" || flag === "0" || flag === "no");





}











function isoPattern_(props) {







  var manual = props.getProperty("MONTH_FOLDER_FORMAT");



  return manual && String(manual).trim() ? String(manual).trim() : "yyyy-MM";

}



function normalizeFlag_(value) {



  var text = String(value || "").trim().toUpperCase();



  return text.replace(/-/g, "_");

}











function ensureChild_(parentFolder, childName) {







  var iterator = parentFolder.getFoldersByName(childName);





  return iterator.hasNext() ? iterator.next() : parentFolder.createFolder(childName);





}











function requireDriveFolderId_(



) {







  var folderId = PropertiesService.getScriptProperties().getProperty("DRIVE_FOLDER_ID");





  if (!folderId || String(folderId).trim() === "") throw new Error("Set DRIVE_FOLDER_ID");







}











function getOrCreateUserLabel(name) {







  var existing = GmailApp.getUserLabelByName(name);





  return existing ? existing : GmailApp.createLabel(name);





}











function quoteLabel_(labelName) {







  var safe = String(labelName || "").trim().replace(/"/g, "");





  return /\s/.test(safe) ? '"' + safe + '"' : safe;





}











function sanitizeName_(value) {







  return String(value || "")





    .replace(/\s+/g, " ")





    .trim()





    .replace(/[\\/:*?"<>|\u0000-\u001F]/g, "_")





    .slice(0, 120);





}




