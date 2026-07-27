/*!
 * payment-methods.js — Single Source of Truth for "Online Payment Type"
 * -----------------------------------------------------------------------
 * Step 1 of the Payment System refactor.
 *
 * WHAT THIS FILE IS:
 * The list of online payment methods (KPay, Wave Pay, AYA Pay, CB Pay,
 * Mobile Banking) used to be hand-typed as <option> tags in BOTH
 * index.html (#depPayType) and receipts.html (#payType). Editing the
 * list meant editing it twice and hoping the values stayed identical.
 * This file is now the one place that list lives.
 *
 * WHAT THIS FILE IS NOT (yet):
 * This step does NOT touch how/where payments are saved, the payment
 * status flow (COD/Partial/Prepaid/...), deposit calculations, or the
 * duplicate-code checks. Those are unchanged and still live in
 * index.html / receipts.html / payments.html exactly as before.
 *
 * BACKWARD COMPATIBILITY:
 * Each method's `id` is exactly the string that has always been saved
 * in sale.payType / receipt.payType (e.g. "KPay", "Wave Pay"). Old
 * orders and old localStorage data need zero migration — they already
 * match these ids.
 *
 * FUTURE EXTENSIBILITY (why it's shaped this way):
 * Adding a new payment method later (e.g. "CB Pay QR", "Bank Transfer")
 * is a single new entry in METHODS below — no other file needs to
 * change. The `category` field is unused today but is there so a
 * future multi-payment refactor can group/filter methods (e.g. mobile
 * wallet vs. bank vs. cash) without another rewrite of this list.
 */
(function (global) {
  "use strict";

  // id === legacy stored value (sale.payType). Do not change existing
  // ids — that would silently break old saved orders.
  var METHODS = [
    { id: "KPay",           label: "KPay",           category: "wallet" },
    { id: "Wave Pay",       label: "Wave Pay",       category: "wallet" },
    { id: "AYA Pay",        label: "AYA Pay",        category: "wallet" },
    { id: "CB Pay",         label: "CB Pay",         category: "wallet" },
    { id: "Mobile Banking", label: "Mobile Banking", category: "bank" }
  ];

  function list() {
    return METHODS.slice(); // copy — callers shouldn't mutate the source list
  }

  function find(value) {
    var v = String(value == null ? "" : value).trim();
    if (!v) return null;
    for (var i = 0; i < METHODS.length; i++) {
      if (METHODS[i].id === v) return METHODS[i];
    }
    return null;
  }

  function isValid(value) {
    return !!find(value);
  }

  // Returns a display label for a stored value. Falls back to the raw
  // stored value if it's something unrecognized, so old/odd data still
  // displays as something rather than blank.
  function getLabel(value) {
    var m = find(value);
    return m ? m.label : (value || "");
  }

  // Populates a <select> element with the standard option list.
  // options.placeholder — text for the empty first option (default matches
  //   the existing UI copy). Pass `null` to omit the placeholder entirely.
  // options.selected — value to pre-select after rendering.
  function renderOptions(selectEl, options) {
    if (!selectEl) return;
    options = options || {};
    var placeholder = (options.placeholder !== undefined) ? options.placeholder : "— ရွေးပါ —";
    var selected = options.selected || "";

    var html = "";
    if (placeholder !== null) {
      html += '<option value="">' + placeholder + "</option>";
    }
    METHODS.forEach(function (m) {
      html += '<option value="' + m.id + '">' + m.label + "</option>";
    });
    selectEl.innerHTML = html;

    if (selected) selectEl.value = selected;
  }

  global.PaymentMethods = {
    list: list,
    find: find,
    isValid: isValid,
    getLabel: getLabel,
    renderOptions: renderOptions
  };
})(window);
