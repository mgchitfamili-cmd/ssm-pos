/*!
 * payments-store.js — Multi-Payment Architecture (Single Source of Truth)
 * -----------------------------------------------------------------------
 * Step 2 of the Payment System refactor.
 *
 * WHAT THIS FILE IS:
 * A data layer that lets one Order have MANY payment records instead of
 * the single set of payment fields (payStatus/payType/payCode/payAmount/
 * paySS/payDate) that currently live directly on a `sale` object in
 * salesHistory. This is the foundation the Payment Page, Index, and
 * Receipt will all eventually read/write through — but in THIS step
 * nothing in index.html / receipts.html / payments.html calls it yet.
 * No visible behavior changes. It is only loaded so it's available to
 * test in the console and to build on in the next step.
 *
 * STORAGE:
 * A new localStorage key, PAYMENTS_KEY, holds an object shaped like:
 *   { [orderNo]: [ record, record, ... ] }
 * Nothing is written here until addRecord() or ensureMigrated() is
 * called for a given order — just loading this file / calling read-only
 * getters does not touch storage.
 *
 * A record looks like:
 *   {
 *     id:        "SSM-0001-1", // unique within the order
 *     orderNo:   "SSM-0001",
 *     amount:    15000,
 *     method:    "KPay",       // id from payment-methods.js, or "Cash"
 *     code:      "123456",     // transaction code, if any
 *     screenshot:"data:image/...", // paySS, if any
 *     verified:  false,
 *     date:      "7/27/2026",
 *     createdAt: 1732... ,     // Date.now()
 *     note:      "",
 *     legacy:    true|false    // true = synthesized from old single-payment fields
 *   }
 *
 * BACKWARD COMPATIBILITY / MIGRATION:
 * Existing orders only ever had ONE payment's worth of fields sitting
 * directly on the sale object (in salesHistory). Those fields are NOT
 * removed or modified by this file — Index and Receipt still read/write
 * them exactly as before, so nothing breaks.
 *
 * Instead, this store treats those legacy fields as "payment record #1"
 * whenever there isn't yet an explicit multi-payment entry for that
 * order:
 *   - getRecords(orderNo) is a READ-ONLY view: if no records have been
 *     migrated yet, it synthesizes one record on the fly from the
 *     sale's legacy fields (or returns [] if the order has no payment
 *     at all). Nothing is persisted just from reading.
 *   - ensureMigrated(orderNo) is the one function that actually WRITES:
 *     it seeds storage with that same synthesized record (if any) so
 *     future records can be appended alongside it. It's idempotent —
 *     safe to call repeatedly, only migrates once per order.
 *   - addRecord(orderNo, data) calls ensureMigrated() first, so adding
 *     a 2nd payment to an old single-payment order automatically
 *     preserves payment #1 instead of overwriting it.
 *
 * This means: an order that only ever had one payment behaves exactly
 * as it always has (Index/Receipt read the legacy fields directly), and
 * the moment a second payment is recorded through this store, both
 * payments are tracked correctly going forward.
 *
 * FUTURE STEP (not done here):
 * Wiring index.html / receipts.html / payments.html to actually call
 * these functions instead of reading/writing the legacy fields, adding
 * the "Manage Payments" / "Add Payment" UI, and making Index/Receipt
 * read-only for payment info.
 */
(function (global) {
  "use strict";

  var PAYMENTS_KEY = "ssm_paymentRecords";

  // ── low-level storage ──────────────────────────────────────────
  function _readStore() {
    try {
      return JSON.parse(localStorage.getItem(PAYMENTS_KEY)) || {};
    } catch (e) {
      return {};
    }
  }

  function _writeStore(store) {
    localStorage.setItem(PAYMENTS_KEY, JSON.stringify(store));
  }

  // ── legacy sale lookup (read-only — never writes to salesHistory) ──
  function _findSale(orderNo) {
    var hist;
    try {
      hist = JSON.parse(localStorage.getItem("salesHistory")) || [];
    } catch (e) {
      hist = [];
    }
    for (var i = 0; i < hist.length; i++) {
      if (hist[i] && String(hist[i].orderNo) === String(orderNo)) return hist[i];
    }
    return null;
  }

  function _inferLegacyMethod(sale) {
    if (sale.payType) return sale.payType;              // online wallet type, e.g. "KPay"
    if (sale.payStatus === "Cash") return "Cash";
    if (sale.payStatus === "CashDeliFee") return "Cash";
    return sale.payStatus || "Unknown";
  }

  // Builds a single record out of a sale's legacy single-payment fields.
  // Returns null if the sale has no payment on it at all.
  function _legacyRecordFromSale(sale) {
    if (!sale) return null;
    var amount = Number(sale.payAmount || sale.deposit || 0);
    var hasCode = sale.payCode && String(sale.payCode).trim();
    if (amount <= 0 && !hasCode) return null; // nothing paid yet — no record

    return {
      id: String(sale.orderNo) + "-legacy",
      orderNo: sale.orderNo,
      amount: amount,
      method: _inferLegacyMethod(sale),
      code: sale.payCode || "",
      screenshot: sale.paySS || "",
      verified: !!sale.verified,
      date: sale.payDate || "",
      createdAt: 0, // unknown — predates this store
      note: "",
      legacy: true
    };
  }

  // ── public: read-only views ────────────────────────────────────

  // Returns the list of payment records for an order. If the order
  // hasn't been migrated into the new store yet, this synthesizes the
  // view from legacy fields WITHOUT persisting anything.
  function getRecords(orderNo) {
    var store = _readStore();
    if (store[orderNo]) return store[orderNo].slice();

    var legacy = _legacyRecordFromSale(_findSale(orderNo));
    return legacy ? [legacy] : [];
  }

  function getRecordCount(orderNo) {
    return getRecords(orderNo).length;
  }

  function getTotalPaid(orderNo) {
    return getRecords(orderNo).reduce(function (sum, r) {
      return sum + (Number(r.amount) || 0);
    }, 0);
  }

  // orderTotal must be supplied by the caller (Index/Receipt already
  // have their own, slightly different, net-total formulas depending on
  // walk-in vs delivery orders — this store doesn't duplicate that).
  function getRemainingBalance(orderNo, orderTotal) {
    return (Number(orderTotal) || 0) - getTotalPaid(orderNo);
  }

  function getSummary(orderNo, orderTotal) {
    var records = getRecords(orderNo);
    var totalPaid = records.reduce(function (sum, r) { return sum + (Number(r.amount) || 0); }, 0);
    return {
      records: records,
      totalPaid: totalPaid,
      remainingBalance: (Number(orderTotal) || 0) - totalPaid,
      count: records.length
    };
  }

  // ── public: writes ─────────────────────────────────────────────

  // Seeds the store for an order from its legacy fields, if not already
  // migrated. Idempotent — safe to call many times. Returns the (now
  // guaranteed-to-exist) records array for that order.
  function ensureMigrated(orderNo) {
    var store = _readStore();
    if (!store[orderNo]) {
      var legacy = _legacyRecordFromSale(_findSale(orderNo));
      store[orderNo] = legacy ? [legacy] : [];
      _writeStore(store);
    }
    return store[orderNo].slice();
  }

  function _genId(orderNo, store) {
    var n = (store[orderNo] || []).length + 1;
    var id = orderNo + "-" + n;
    // guard against collisions (e.g. after deletes)
    while ((store[orderNo] || []).some(function (r) { return r.id === id; })) {
      n++;
      id = orderNo + "-" + n;
    }
    return id;
  }

  // data: { amount, method, code, screenshot, note, date, verified }
  function addRecord(orderNo, data) {
    ensureMigrated(orderNo);
    var store = _readStore();
    if (!store[orderNo]) store[orderNo] = [];

    var record = {
      id: _genId(orderNo, store),
      orderNo: orderNo,
      amount: Number(data.amount) || 0,
      method: data.method || "",
      code: data.code || "",
      screenshot: data.screenshot || "",
      verified: !!data.verified,
      date: data.date || new Date().toLocaleDateString(),
      createdAt: Date.now(),
      note: data.note || "",
      legacy: false
    };

    store[orderNo].push(record);
    _writeStore(store);
    return record;
  }

  function updateRecord(orderNo, recordId, updates) {
    ensureMigrated(orderNo);
    var store = _readStore();
    var list = store[orderNo] || [];
    var idx = list.findIndex(function (r) { return r.id === recordId; });
    if (idx === -1) return null;

    var allowed = ["amount", "method", "code", "screenshot", "verified", "date", "note"];
    allowed.forEach(function (k) {
      if (Object.prototype.hasOwnProperty.call(updates, k)) {
        list[idx][k] = (k === "amount") ? (Number(updates[k]) || 0) : updates[k];
      }
    });

    store[orderNo] = list;
    _writeStore(store);
    return list[idx];
  }

  function deleteRecord(orderNo, recordId) {
    ensureMigrated(orderNo);
    var store = _readStore();
    var list = store[orderNo] || [];
    var next = list.filter(function (r) { return r.id !== recordId; });
    if (next.length === list.length) return false; // nothing removed

    store[orderNo] = next;
    _writeStore(store);
    return true;
  }

  // Removes an order's entry entirely (rarely needed — e.g. if an order
  // itself is deleted). Does not touch salesHistory.
  function clearOrder(orderNo) {
    var store = _readStore();
    if (store[orderNo]) {
      delete store[orderNo];
      _writeStore(store);
      return true;
    }
    return false;
  }

  // ── self-test (safe — uses an isolated fake order, cleans up after) ──
  function __selfTest() {
    var TEST_ORDER = "__PAYMENTSTORE_SELFTEST__";
    var results = [];
    function check(label, cond) { results.push((cond ? "PASS" : "FAIL") + " — " + label); }

    // clean slate
    clearOrder(TEST_ORDER);

    check("new order has 0 records", getRecords(TEST_ORDER).length === 0);
    check("new order total paid is 0", getTotalPaid(TEST_ORDER) === 0);

    var r1 = addRecord(TEST_ORDER, { amount: 1000, method: "KPay", code: "111111" });
    check("addRecord returns a record with id", !!r1.id);
    check("record count is 1 after first add", getRecords(TEST_ORDER).length === 1);

    var r2 = addRecord(TEST_ORDER, { amount: 500, method: "Cash" });
    check("record count is 2 after second add", getRecords(TEST_ORDER).length === 2);
    check("total paid sums both records (1500)", getTotalPaid(TEST_ORDER) === 1500);
    check("remaining balance is correct (2000-1500=500)", getRemainingBalance(TEST_ORDER, 2000) === 500);

    var updated = updateRecord(TEST_ORDER, r2.id, { amount: 700 });
    check("updateRecord changes amount", updated.amount === 700);
    check("total paid reflects update (1700)", getTotalPaid(TEST_ORDER) === 1700);

    var deleted = deleteRecord(TEST_ORDER, r1.id);
    check("deleteRecord removes a record", deleted === true && getRecords(TEST_ORDER).length === 1);

    clearOrder(TEST_ORDER);
    check("clearOrder removes the order entirely", getRecords(TEST_ORDER).length === 0);

    var pass = results.every(function (r) { return r.indexOf("PASS") === 0; });
    console.log(results.join("\n"));
    console.log(pass ? "✅ PaymentStore self-test: ALL PASSED" : "❌ PaymentStore self-test: FAILURES ABOVE");
    return pass;
  }

  global.PaymentStore = {
    getRecords: getRecords,
    getRecordCount: getRecordCount,
    getTotalPaid: getTotalPaid,
    getRemainingBalance: getRemainingBalance,
    getSummary: getSummary,
    ensureMigrated: ensureMigrated,
    addRecord: addRecord,
    updateRecord: updateRecord,
    deleteRecord: deleteRecord,
    clearOrder: clearOrder,
    __selfTest: __selfTest
  };
})(window);
