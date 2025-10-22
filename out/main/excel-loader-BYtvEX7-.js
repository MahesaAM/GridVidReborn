"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const XLSX = require("xlsx");
function _interopNamespaceDefault(e) {
  const n = Object.create(null, { [Symbol.toStringTag]: { value: "Module" } });
  if (e) {
    for (const k in e) {
      if (k !== "default") {
        const d = Object.getOwnPropertyDescriptor(e, k);
        Object.defineProperty(n, k, d.get ? d : {
          enumerable: true,
          get: () => e[k]
        });
      }
    }
  }
  n.default = e;
  return Object.freeze(n);
}
const XLSX__namespace = /* @__PURE__ */ _interopNamespaceDefault(XLSX);
function parseAccountExcel(filePath) {
  const workbook = XLSX__namespace.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const data = XLSX__namespace.utils.sheet_to_json(sheet);
  return data.map((row) => ({
    email: row.email,
    password: row.password
  }));
}
exports.parseAccountExcel = parseAccountExcel;
