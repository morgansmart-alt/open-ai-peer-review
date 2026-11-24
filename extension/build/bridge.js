(() => {
  // src/services/webChat/protocol.ts
  var PAGE_SOURCE = "open-ai-peer-review";
  var EXTENSION_SOURCE = "air-web-chat-extension";
  var PROTOCOL_VERSION = 1;
  var AIR_ORIGIN = /^(https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?|https:\/\/morgansmart-alt\.github\.io)$/;
  function originAllowed(origin) {
    return AIR_ORIGIN.test(origin);
  }

  // extension/browser.ts
  function lastError() {
    const message = chrome.runtime.lastError?.message;
    return message ?? null;
  }

  // extension/bridge.ts
  function postToPage(message) {
    window.postMessage(message, window.location.origin);
  }
  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    if (!originAllowed(event.origin)) return;
    const data = event.data;
    if (!data || data.source !== PAGE_SOURCE || data.version !== PROTOCOL_VERSION) return;
    if (data.type === "air-web-chat-ping") {
      postToPage({ source: EXTENSION_SOURCE, type: "air-web-chat-pong", version: PROTOCOL_VERSION });
      return;
    }
    if (data.type !== "air-web-chat-request" && data.type !== "air-web-chat-cancel") return;
    chrome.runtime.sendMessage(data, (response) => {
      const failed = lastError();
      if (failed) {
        postToPage({
          source: EXTENSION_SOURCE,
          type: "air-web-chat-error",
          version: PROTOCOL_VERSION,
          requestId: data.requestId,
          message: "The AIR extension did not answer. Reload this page after loading the extension."
        });
        return;
      }
      if (response && response.ok === false) {
        postToPage({
          source: EXTENSION_SOURCE,
          type: "air-web-chat-error",
          version: PROTOCOL_VERSION,
          requestId: data.requestId,
          message: response.message || "The extension refused this review."
        });
      }
    });
  });
  chrome.runtime.onMessage.addListener((message) => {
    if (!message || message.source !== EXTENSION_SOURCE) return;
    postToPage(message);
  });
})();
