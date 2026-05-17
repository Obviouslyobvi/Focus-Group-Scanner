// Runs at document_start in the MAIN world on recruiter pages, before any
// of the page's own scripts execute. Forces visibility-API getters to
// report "visible" / not-hidden, so sites that gate content behind tab
// visibility (anti-bot) don't redirect background-tab loads to a signup
// page. This is why opening becomeathinker.com/studies/ from an active
// tab worked but from chrome.tabs.create({active:false}) bounced to the
// database-sign-up page.

(() => {
  try {
    const protoDoc = Object.getPrototypeOf(document);
    Object.defineProperty(protoDoc, "visibilityState", {
      get() {
        return "visible";
      },
      configurable: true,
    });
    Object.defineProperty(protoDoc, "hidden", {
      get() {
        return false;
      },
      configurable: true,
    });
    document.hasFocus = () => true;
  } catch (e) {
    // Some pages may have already locked the descriptor. Best-effort only.
  }
})();
