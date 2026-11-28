(() => {
  // extension/adapters/chatgpt.ts
  var chatgpt = {
    id: "chatgpt",
    label: "ChatGPT",
    assessorId: "gpt",
    provider: "openai",
    modelLabel: "ChatGPT on chatgpt.com",
    startUrl: "https://chatgpt.com/",
    origins: ["https://chatgpt.com/*"],
    pasteLimit: 28e3,
    fileCharLimit: 4e5,
    maxFiles: 5,
    comfortableTurns: 6,
    fileUpload: true,
    limits: "AIR tries a file up to about 400,000 characters, then pastes 28,000 characters at a time. Free ChatGPT accounts often refuse file upload and rate-limit long chats. A ~160k-token paper may need several turns or a paid chat. Those limits were not measured here.",
    selectors: {
      composer: ["#prompt-textarea", 'textarea[data-id="prompt-textarea"]', 'div#prompt-textarea[contenteditable="true"]'],
      submit: ['button[data-testid="send-button"]', 'button[aria-label="Send prompt"]', 'button[aria-label*="Send"]'],
      stop: ['button[data-testid="stop-button"]', 'button[aria-label*="Stop"]'],
      assistant: ['[data-message-author-role="assistant"]', '[data-testid="conversation-turn"]'],
      fileInput: ['input[type="file"]'],
      login: ['a[href*="/auth/login"]', 'button[data-testid="login-button"]', 'button[data-testid="login"]']
    }
  };

  // extension/adapters/claude.ts
  var claude = {
    id: "claude",
    label: "Claude",
    assessorId: "claude",
    provider: "anthropic",
    modelLabel: "Claude on claude.ai",
    startUrl: "https://claude.ai/new",
    origins: ["https://claude.ai/*"],
    pasteLimit: 6e4,
    fileCharLimit: 12e5,
    maxFiles: 5,
    comfortableTurns: 8,
    fileUpload: true,
    limits: "AIR attaches a paper up to about 1.2 million characters, or pastes 60,000 characters at a time. Claude's free web chat has a daily message cap. That cap was not measured here.",
    selectors: {
      composer: [
        'div[contenteditable="true"][data-testid="chat-input"]',
        "div.ProseMirror[contenteditable='true']",
        'div[contenteditable="true"][role="textbox"]'
      ],
      submit: ['button[aria-label="Send message"]', 'button[aria-label*="Send"]'],
      stop: ['button[aria-label="Stop response"]', 'button[aria-label*="Stop"]'],
      assistant: ['[data-testid="assistant-message"]', '[data-testid="assistant-turn"]'],
      fileInput: ['input[type="file"]'],
      login: ['a[href*="/login"]', 'button[data-testid="login"]']
    }
  };

  // extension/adapters/copilot.ts
  var copilot = {
    id: "copilot",
    label: "Copilot",
    assessorId: "web-chat",
    provider: "compatible",
    modelLabel: "Copilot on copilot.microsoft.com",
    startUrl: "https://copilot.microsoft.com/",
    origins: ["https://copilot.microsoft.com/*"],
    pasteLimit: 12e3,
    fileCharLimit: 0,
    maxFiles: 0,
    comfortableTurns: 4,
    fileUpload: false,
    limits: "This adapter pastes text, 12,000 characters at a time. Copilot's web composer is short, so a full paper becomes many turns and may be refused. A ~160k-token paper is a poor fit here. The rate limit was not measured.",
    selectors: {
      composer: ["textarea#userInput", 'textarea[aria-label*="Message"]', 'div[contenteditable="true"][role="textbox"]'],
      submit: ['button[aria-label="Send"]', 'button[aria-label*="Send"]', 'button[type="submit"]'],
      stop: ['button[aria-label*="Stop"]'],
      assistant: ['[data-content="ai-message"]', '[data-testid="ai-message"]'],
      fileInput: [],
      login: ['a[href*="login.microsoftonline.com"]', 'button[data-testid="login"]']
    }
  };

  // extension/adapters/deepseek.ts
  var deepseek = {
    id: "deepseek",
    label: "DeepSeek",
    assessorId: "deepseek",
    provider: "openrouter",
    modelLabel: "DeepSeek on chat.deepseek.com",
    startUrl: "https://chat.deepseek.com/",
    origins: ["https://chat.deepseek.com/*"],
    pasteLimit: 32e3,
    fileCharLimit: 0,
    maxFiles: 0,
    comfortableTurns: 8,
    fileUpload: false,
    limits: "This adapter pastes text, 32,000 characters at a time. It does not attach files. A long paper becomes many turns and can hit DeepSeek's web rate limit. That limit was not measured here.",
    selectors: {
      composer: ["textarea#chat-input", 'textarea[placeholder*="Message"]', "textarea"],
      submit: ['button[aria-label*="Send"]', 'div[role="button"][aria-label*="Send"]', 'button[type="submit"]'],
      stop: ['button[aria-label*="Stop"]'],
      assistant: ['[data-role="assistant"]', ".ds-markdown"],
      fileInput: [],
      login: ['a[href*="/sign_in"]', 'a[href*="login"]', 'button[data-testid="login"]']
    }
  };

  // extension/adapters/gemini.ts
  var gemini = {
    id: "gemini",
    label: "Gemini",
    assessorId: "gemini",
    provider: "gemini",
    modelLabel: "Gemini on gemini.google.com",
    startUrl: "https://gemini.google.com/app",
    origins: ["https://gemini.google.com/*"],
    pasteLimit: 48e3,
    fileCharLimit: 15e5,
    maxFiles: 10,
    comfortableTurns: 8,
    fileUpload: true,
    limits: "AIR attaches a paper up to about 1.5 million characters, or pastes 48,000 characters at a time. Gemini's free web app has its own file and rate limits, and a signed-in Google account. Those limits were not measured here.",
    selectors: {
      composer: [
        'div.ql-editor[contenteditable="true"]',
        'rich-textarea div[contenteditable="true"]',
        'div[contenteditable="true"][aria-label*="prompt"]',
        'div[contenteditable="true"][role="textbox"]'
      ],
      submit: ['button[aria-label="Send message"]', 'button[aria-label*="Send"]'],
      stop: ['button[aria-label="Stop response"]', 'button[aria-label*="Stop"]'],
      assistant: ["message-content", "model-response", ".model-response-text"],
      fileInput: ['input[type="file"]'],
      login: ['a[href*="accounts.google.com"]', 'a[aria-label*="Sign in"]', 'button[aria-label*="Sign in"]']
    }
  };

  // extension/adapters/grok-x.ts
  var grokX = {
    id: "grok-x",
    label: "Grok on X",
    assessorId: "grok",
    provider: "xai",
    modelLabel: "Grok on x.com",
    startUrl: "https://x.com/i/grok",
    origins: ["https://x.com/i/grok*"],
    pasteLimit: 1e5,
    fileCharLimit: 4e5,
    maxFiles: 4,
    comfortableTurns: 6,
    fileUpload: true,
    limits: "Grok on X is at x.com/i/grok. AIR sends one message when the paper and the instructions fit in about 100,000 characters, attaches a file when the site accepts one, and otherwise pastes in parts. X rate-limits long threads. That limit was not measured here.",
    selectors: {
      composer: [
        'textarea[aria-label="Ask anything"]',
        'textarea[placeholder="Ask anything"]',
        '[contenteditable="true"][aria-label="Ask anything"]',
        '[contenteditable="true"][placeholder="Ask anything"]',
        '[role="textbox"][aria-label*="Ask"]',
        '[role="textbox"][placeholder*="Ask"]',
        'textarea[aria-label="Ask Grok"]',
        'textarea[aria-label*="Ask Grok"]',
        'textarea[aria-label*="Ask"]',
        'textarea[placeholder*="Ask"]',
        'div[data-testid="grokComposer"] textarea',
        'div[contenteditable="true"][role="textbox"]'
      ],
      submit: [
        'button[aria-label="Send"]',
        'button[aria-label*="Send"]',
        'button[aria-label*="Submit"]',
        'button[aria-label*="Grok"]',
        'button[data-testid="grok-send"]'
      ],
      stop: ['button[aria-label="Stop"]', 'button[aria-label*="Stop"]', 'button[aria-label*="Stop generating"]'],
      assistant: [
        '[data-testid="grokResponse"]',
        '[data-testid="grok-response"]',
        '[data-testid="GrokResponse"]',
        '[data-testid="grok-message"]',
        '[data-testid*="grokMessage"]',
        '[data-testid="assistant-message"]',
        '[data-message-author="assistant"]',
        '[class*="assistant-message"]',
        'article[data-testid*="grok"]'
      ],
      fileInput: ['input[type="file"]'],
      login: ['a[href*="/login"]', 'a[href*="/i/flow/login"]', 'a[data-testid="login"]']
    }
  };

  // extension/adapters/grok.ts
  var grok = {
    id: "grok",
    label: "Grok",
    assessorId: "grok",
    provider: "xai",
    modelLabel: "Grok on grok.com",
    startUrl: "https://grok.com/",
    origins: ["https://grok.com/*"],
    pasteLimit: 48e3,
    fileCharLimit: 12e5,
    maxFiles: 8,
    comfortableTurns: 8,
    fileUpload: true,
    limits: "AIR attaches a paper up to about 1.2 million characters, or pastes 48,000 characters at a time. Grok's free web chat rate-limits long threads. The exact cap is set by xAI and was not measured here.",
    selectors: {
      composer: [
        'textarea[aria-label="Message Grok"]',
        'textarea[aria-label*="Message Grok"]',
        '[contenteditable="true"][aria-label="Message Grok"]',
        '[contenteditable="true"][aria-label*="Message Grok"]',
        '[role="textbox"][aria-label="Message Grok"]',
        '[role="textbox"][aria-label*="Message Grok"]',
        'textarea[aria-label="Ask Grok anything"]',
        'textarea[aria-label*="Ask Grok"]',
        'textarea[placeholder*="What do you want to know"]',
        'textarea[aria-label*="What do you want to know"]',
        'textarea[placeholder*="Ask anything"]',
        'textarea[aria-label*="Ask anything"]',
        'textarea[placeholder*="Ask"]',
        '[contenteditable="true"][placeholder*="Ask"]',
        '[contenteditable="true"][aria-label*="Ask"]',
        'div[contenteditable="true"][role="textbox"]'
      ],
      submit: ['button[aria-label="Submit"]', 'button[aria-label*="Send"]', 'button[aria-label*="Submit"]', 'button[type="submit"]'],
      stop: ['button[aria-label="Stop"]', 'button[aria-label*="Stop"]', 'button[aria-label*="Stop generating"]'],
      assistant: ['[data-testid="assistant-message"]', '[data-message-author="assistant"]', '[class*="assistant-message"]'],
      fileInput: ['input[type="file"]'],
      login: ['a[href*="accounts.x.com"]', 'a[href*="/login"]', 'button[data-testid="login"]']
    }
  };

  // extension/adapters/mistral.ts
  var mistral = {
    id: "mistral",
    label: "Mistral",
    assessorId: "mistral",
    provider: "openrouter",
    modelLabel: "Mistral on chat.mistral.ai",
    startUrl: "https://chat.mistral.ai/chat",
    origins: ["https://chat.mistral.ai/*"],
    pasteLimit: 28e3,
    fileCharLimit: 4e5,
    maxFiles: 4,
    comfortableTurns: 6,
    fileUpload: true,
    limits: "AIR tries a file up to about 400,000 characters, then pastes 28,000 characters at a time. Le Chat's free tier has its own rate limit, which was not measured here.",
    selectors: {
      composer: ['textarea[placeholder*="Chat"]', "textarea", 'div[contenteditable="true"][role="textbox"]'],
      submit: ['button[aria-label*="Send"]', 'button[type="submit"]'],
      stop: ['button[aria-label*="Stop"]'],
      assistant: ['[data-testid="assistant-message"]', '[data-message-author="assistant"]'],
      fileInput: ['input[type="file"]'],
      login: ['a[href*="/login"]', 'button[data-testid="login"]']
    }
  };

  // extension/adapters/perplexity.ts
  var perplexity = {
    id: "perplexity",
    label: "Perplexity",
    assessorId: "web-chat",
    provider: "compatible",
    modelLabel: "Perplexity on perplexity.ai",
    startUrl: "https://www.perplexity.ai/",
    origins: ["https://www.perplexity.ai/*"],
    pasteLimit: 16e3,
    fileCharLimit: 2e5,
    maxFiles: 4,
    comfortableTurns: 4,
    fileUpload: true,
    limits: "AIR tries a file up to about 200,000 characters, then pastes 16,000 characters at a time. Perplexity's free tier rate-limits searches. A ~160k-token paper is larger than one comfortable turn. That limit was not measured here.",
    selectors: {
      composer: ['textarea[placeholder*="Ask"]', "textarea", 'div[contenteditable="true"][role="textbox"]'],
      submit: ['button[aria-label="Submit"]', 'button[aria-label*="Send"]'],
      stop: ['button[aria-label*="Stop"]'],
      assistant: ['[data-testid="assistant-message"]'],
      fileInput: ['input[type="file"]'],
      login: ['a[href*="/login"]', 'button[data-testid="login"]']
    }
  };

  // extension/adapters/index.ts
  var webChatProviders = [grok, gemini, chatgpt, claude, grokX, deepseek, mistral, copilot, perplexity];
  function webChatProvider(id) {
    return webChatProviders.find((item) => item.id === id) ?? null;
  }

  // extension/browser.ts
  function lastError() {
    const message = chrome.runtime.lastError?.message;
    return message ?? null;
  }
  function tabSend(tabId, message) {
    return new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        const messageText = lastError();
        if (messageText) reject(new Error(messageText));
        else resolve(response);
      });
    });
  }
  function sessionGet(key) {
    return new Promise((resolve) => {
      chrome.storage.session.get(key, (data) => {
        if (lastError()) resolve(null);
        else resolve(data?.[key] ?? null);
      });
    });
  }
  function sessionSet(key, value) {
    return new Promise((resolve) => {
      chrome.storage.session.set({ [key]: value }, () => resolve());
    });
  }
  function sessionRemove(key) {
    return new Promise((resolve) => {
      chrome.storage.session.remove(key, () => resolve());
    });
  }
  var JOB_KEY = "air-web-chat-job";

  // src/services/webChat/protocol.ts
  var EXTENSION_SOURCE = "air-web-chat-extension";
  var PROTOCOL_VERSION = 1;
  var AIR_ORIGIN = /^(https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?|https:\/\/morgansmart-alt\.github\.io)$/;
  function originAllowed(origin) {
    return AIR_ORIGIN.test(origin);
  }
  var PACKET_CHAR_CAP = 8e6;
  function validatePacket(input) {
    if (!input || typeof input !== "object") return { ok: false, message: "The review packet was empty." };
    const packet = input;
    if (packet.version !== 1) return { ok: false, message: "This extension does not understand that packet version." };
    if (typeof packet.requestId !== "string" || !packet.requestId.trim()) return { ok: false, message: "The review packet had no request id." };
    if (typeof packet.providerId !== "string") return { ok: false, message: "Pick a chat site first." };
    const provider = webChatProvider(packet.providerId);
    if (!provider) return { ok: false, message: "That chat site is not one of the adapters." };
    if (typeof packet.system !== "string" || typeof packet.instructions !== "string" || !packet.instructions.trim()) {
      return { ok: false, message: "The review packet was missing its prompt." };
    }
    if (!Array.isArray(packet.files)) return { ok: false, message: "The review packet was missing its files." };
    let chars = packet.system.length + packet.instructions.length;
    const files = [];
    for (const file of packet.files) {
      if (!file || typeof file !== "object") return { ok: false, message: "A paper file in the packet was unreadable." };
      const filename = typeof file.filename === "string" ? file.filename : "";
      const text = typeof file.text === "string" ? file.text : "";
      if (!filename || !text) continue;
      chars += text.length;
      files.push({ filename, text });
    }
    if (chars > PACKET_CHAR_CAP) {
      return { ok: false, message: "The paper is above the extension's safety cap of 8 million characters." };
    }
    return {
      ok: true,
      provider,
      packet: {
        version: 1,
        requestId: packet.requestId,
        providerId: provider.id,
        system: packet.system,
        instructions: packet.instructions,
        files,
        ...typeof packet.criterionProfile === "string" && packet.criterionProfile.trim() ? { criterionProfile: packet.criterionProfile.trim() } : {},
        ...typeof packet.textUrl === "string" && packet.textUrl.trim() ? { textUrl: packet.textUrl.trim() } : {}
      }
    };
  }

  // src/services/webChat/relay.ts
  function airTabForRequest(sender, extensionBaseUrl) {
    const url = sender.url ?? "";
    if (extensionBaseUrl && url.startsWith(extensionBaseUrl)) return 0;
    return sender.tab?.id ?? 0;
  }
  function relayFromProvider(job, senderTabId, message) {
    if (!job || senderTabId == null || senderTabId !== job.providerTabId || message.requestId !== job.requestId) return { kind: "ignore" };
    if (message.type === "air-web-chat-progress") {
      return {
        kind: "progress",
        requestId: job.requestId,
        message: typeof message.message === "string" ? message.message : "",
        airTabId: job.airTabId,
        step: typeof message.step === "string" && message.step.trim() ? message.step.trim() : "Review",
        status: typeof message.status === "string" && message.status.trim() ? message.status.trim() : "update",
        detail: typeof message.detail === "string" ? message.detail.trim() : ""
      };
    }
    if (message.type === "air-web-chat-done") {
      if (message.ok && typeof message.text === "string" && message.text) {
        return {
          kind: "result",
          requestId: job.requestId,
          airTabId: job.airTabId,
          text: message.text,
          defendedText: message.defendedText ?? null,
          transcript: message.transcript ?? [],
          stopped: Boolean(message.stopped),
          chatModel: typeof message.chatModel === "string" && message.chatModel.trim() ? message.chatModel.trim() : "unknown (site default)",
          notice: typeof message.notice === "string" ? message.notice : ""
        };
      }
      return { kind: "error", requestId: job.requestId, airTabId: job.airTabId, message: message.message || "The chat did not return a review." };
    }
    return { kind: "ignore" };
  }
  function extensionEnvelope(decision) {
    if (decision.kind === "progress") {
      return {
        source: EXTENSION_SOURCE,
        version: PROTOCOL_VERSION,
        type: "air-web-chat-progress",
        requestId: decision.requestId,
        message: decision.message,
        step: decision.step,
        status: decision.status,
        detail: decision.detail
      };
    }
    if (decision.kind === "result") {
      return {
        source: EXTENSION_SOURCE,
        version: PROTOCOL_VERSION,
        type: "air-web-chat-result",
        requestId: decision.requestId,
        text: decision.text,
        defendedText: decision.defendedText,
        transcript: decision.transcript,
        stopped: decision.stopped,
        chatModel: decision.chatModel,
        notice: decision.notice
      };
    }
    return { source: EXTENSION_SOURCE, version: PROTOCOL_VERSION, type: "air-web-chat-error", requestId: decision.requestId, message: decision.message };
  }

  // criteria/global-goals.json
  var global_goals_default = {
    id: "global-goals",
    version: "2026.1",
    name: "Documented public goals used by AIR",
    updated: "2026-11-19",
    note: "Statements below are limited to wording checked against the linked sources. This list is editable. It is not a ranking of governments, and a project that does not touch these goals is not a failed project.",
    goals: [
      {
        id: "sdg-7",
        framework: "UN Sustainable Development Goals",
        name: "SDG 7 \u2014 Affordable and clean energy",
        statement: "Ensure access to affordable, reliable, sustainable and modern energy for all. Target 7.1: by 2030, ensure universal access to affordable, reliable and modern energy services.",
        sourceUrl: "https://sdgs.un.org/goals/goal7",
        keywords: ["energy access", "electricity", "clean energy", "renewable", "power"]
      },
      {
        id: "sdg-13",
        framework: "UN Sustainable Development Goals",
        name: "SDG 13 \u2014 Climate action",
        statement: "Take urgent action to combat climate change and its impacts.",
        sourceUrl: "https://sdgs.un.org/goals/goal13",
        keywords: ["climate", "emissions", "greenhouse", "carbon", "warming"]
      },
      {
        id: "sdg-9",
        framework: "UN Sustainable Development Goals",
        name: "SDG 9 \u2014 Industry, innovation and infrastructure",
        statement: "Build resilient infrastructure, promote inclusive and sustainable industrialization and foster innovation.",
        sourceUrl: "https://sdgs.un.org/goals/goal9",
        keywords: ["infrastructure", "industry", "innovation", "manufacturing"]
      },
      {
        id: "sdg-6",
        framework: "UN Sustainable Development Goals",
        name: "SDG 6 \u2014 Clean water and sanitation",
        statement: "Ensure availability and sustainable management of water and sanitation for all.",
        sourceUrl: "https://sdgs.un.org/goals/goal6",
        keywords: ["water", "sanitation", "irrigation", "drought"]
      },
      {
        id: "sdg-2",
        framework: "UN Sustainable Development Goals",
        name: "SDG 2 \u2014 Zero hunger",
        statement: "End hunger, achieve food security and improved nutrition and promote sustainable agriculture.",
        sourceUrl: "https://sdgs.un.org/goals/goal2",
        keywords: ["hunger", "food", "agriculture", "crop", "nutrition"]
      },
      {
        id: "sdg-11",
        framework: "UN Sustainable Development Goals",
        name: "SDG 11 \u2014 Sustainable cities and communities",
        statement: "Make cities and human settlements inclusive, safe, resilient and sustainable.",
        sourceUrl: "https://sdgs.un.org/goals/goal11",
        keywords: ["city", "cities", "urban", "housing", "shelter"]
      },
      {
        id: "sdg-12",
        framework: "UN Sustainable Development Goals",
        name: "SDG 12 \u2014 Responsible consumption and production",
        statement: "Ensure sustainable consumption and production patterns.",
        sourceUrl: "https://sdgs.un.org/goals/goal12",
        keywords: ["waste", "consumption", "recycling", "circular", "materials"]
      },
      {
        id: "paris",
        framework: "Paris Agreement",
        name: "Paris Agreement temperature goal",
        statement: "Holding the increase in the global average temperature to well below 2\xB0C above pre-industrial levels and pursuing efforts to limit the temperature increase to 1.5\xB0C (Article 2.1(a)).",
        sourceUrl: "https://unfccc.int/sites/default/files/english_paris_agreement.pdf",
        keywords: ["paris", "1.5", "2\xB0c", "2 c", "temperature", "climate"]
      },
      {
        id: "cop28-renewables",
        framework: "COP28 decision 1/CMA.5",
        name: "UAE Consensus \u2014 renewables and efficiency by 2030",
        statement: "Calls on Parties to contribute to tripling renewable energy capacity globally and doubling the global average annual rate of energy efficiency improvements by 2030 (Decision 1/CMA.5, paragraph 28(a)).",
        sourceUrl: "https://unfccc.int/sites/default/files/resource/cma2023_16a01E.pdf",
        keywords: ["renewable", "efficiency", "solar", "wind", "capacity"]
      },
      {
        id: "cop28-fossils",
        framework: "COP28 decision 1/CMA.5",
        name: "UAE Consensus \u2014 transitioning away from fossil fuels",
        statement: "Calls on Parties to contribute to transitioning away from fossil fuels in energy systems, in a just, orderly and equitable manner, so as to achieve net zero by 2050 in keeping with the science (Decision 1/CMA.5, paragraph 28(d)).",
        sourceUrl: "https://unfccc.int/sites/default/files/resource/cma2023_16a01E.pdf",
        keywords: ["fossil", "coal", "oil", "gas", "net zero", "combustion"]
      },
      {
        id: "iea-nze",
        framework: "IEA Net Zero by 2050",
        name: "IEA Net Zero by 2050 pathway",
        statement: "The IEA Net Zero by 2050 roadmap is a pathway for the global energy sector to reach net zero CO2 emissions by 2050.",
        sourceUrl: "https://www.iea.org/reports/net-zero-by-2050",
        keywords: ["net zero", "2050", "energy sector", "decarbon"]
      },
      {
        id: "methane-pledge",
        framework: "Global Methane Pledge",
        name: "Global Methane Pledge",
        statement: "Participants commit to work together to collectively reduce global anthropogenic methane emissions across all sectors by at least 30 percent below 2020 levels by 2030. This is a collective target, not a per-country quota.",
        sourceUrl: "https://www.globalmethanepledge.org/",
        keywords: ["methane", "ch4", "leak"]
      },
      {
        id: "energy-access-2030",
        framework: "UN Sustainable Development Goals",
        name: "Universal energy access by 2030",
        statement: "SDG target 7.1: by 2030, ensure universal access to affordable, reliable and modern energy services.",
        sourceUrl: "https://sdgs.un.org/goals/goal7",
        keywords: ["energy access", "universal access", "electricity access", "clean cooking"]
      }
    ]
  };

  // src/domain/goals.ts
  function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
  function parseGlobalGoals(input) {
    const errors = [];
    if (!isRecord(input)) return { ok: false, errors: ["Goals file must be a JSON object."] };
    const version = typeof input.version === "string" ? input.version.trim() : "";
    if (!version) errors.push("version is required.");
    const goalsRaw = Array.isArray(input.goals) ? input.goals : [];
    const goals = [];
    const seen = /* @__PURE__ */ new Set();
    for (const item of goalsRaw) {
      if (!isRecord(item)) continue;
      const id = typeof item.id === "string" ? item.id.trim() : "";
      const name = typeof item.name === "string" ? item.name.trim() : "";
      const statement = typeof item.statement === "string" ? item.statement.trim() : "";
      const sourceUrl = typeof item.sourceUrl === "string" ? item.sourceUrl.trim() : "";
      if (!id || !name || !statement || !sourceUrl.startsWith("https://")) {
        errors.push(`Goal ${id || name || "(missing)"} needs an id, name, statement, and https source.`);
        continue;
      }
      if (seen.has(id)) errors.push(`Duplicate goal id ${id}.`);
      seen.add(id);
      goals.push({
        id,
        framework: typeof item.framework === "string" ? item.framework : "",
        name,
        statement,
        sourceUrl,
        keywords: Array.isArray(item.keywords) ? item.keywords.filter((word) => typeof word === "string") : []
      });
    }
    if (goals.length === 0) errors.push("Add at least one goal.");
    if (errors.length) return { ok: false, errors };
    return {
      ok: true,
      file: {
        id: typeof input.id === "string" ? input.id : "global-goals",
        version,
        name: typeof input.name === "string" ? input.name : "Global goals",
        updated: typeof input.updated === "string" ? input.updated : "",
        note: typeof input.note === "string" ? input.note : "",
        goals
      }
    };
  }
  var parsed = parseGlobalGoals(global_goals_default);
  if (!parsed.ok) throw new Error(parsed.errors.join("\n"));
  var globalGoals = parsed.file;

  // src/services/webChat/paperFit.ts
  var TEXT_PAGE_LIMIT = 4e5;
  function packTextPage(full, limit = TEXT_PAGE_LIMIT) {
    if (full.length <= limit) return { body: full, total: full.length };
    const tail = Math.min(1e5, Math.floor(limit / 3));
    const head = Math.max(0, limit - tail);
    return {
      body: `${full.slice(0, head).trimEnd()}

[AIR omitted a middle stretch of this long file.]

${full.slice(-tail).trimStart()}`,
      total: full.length
    };
  }

  // extension/background.ts
  function senderOrigin(sender) {
    try {
      return new URL(sender.url ?? "").origin;
    } catch {
      return "";
    }
  }
  function fromExtensionPage(sender) {
    const url = sender.url ?? "";
    return url.startsWith(chrome.runtime.getURL(""));
  }
  function requestAllowed(sender) {
    return fromExtensionPage(sender) || originAllowed(senderOrigin(sender));
  }
  function keepAirPanel() {
    if (!chrome.sidePanel?.setOptions) return;
    void chrome.sidePanel.setOptions({ path: "review.html", enabled: true }).catch(() => void 0);
  }
  function emit(message, airTabId) {
    chrome.runtime.sendMessage(message, () => {
      void chrome.runtime.lastError;
    });
    if (airTabId > 0) void tabSend(airTabId, message).catch(() => void 0);
  }
  function emitDecision(job, senderTabId, message) {
    const decision = relayFromProvider(job, senderTabId, message);
    if (decision.kind === "ignore") return;
    const envelope = extensionEnvelope(decision);
    const targets = { panel: true, airTabId: decision.airTabId > 0 ? decision.airTabId : 0 };
    if (decision.kind === "result" || decision.kind === "error") keepAirPanel();
    emit(envelope, targets.airTabId);
  }
  function waitForLoad(tabId) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error) => {
        if (settled) return;
        settled = true;
        clearInterval(poll);
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(onUpdated);
        if (error) reject(error);
        else resolve();
      };
      const timer = setTimeout(() => finish(new Error("The chat tab did not finish loading.")), 3e4);
      const onUpdated = (id, info) => {
        if (id === tabId && info.status === "complete") finish();
      };
      const poll = setInterval(() => {
        chrome.tabs.get(tabId, (tab) => {
          if (tab?.status === "complete") finish();
        });
      }, 400);
      chrome.tabs.onUpdated.addListener(onUpdated);
    });
  }
  async function wakeRunner(tabId, message) {
    let last = "The chat page did not answer.";
    for (let attempt = 0; attempt < 15; attempt += 1) {
      try {
        const response = await tabSend(tabId, message);
        if (response?.started) return;
        last = "The chat page did not start the review.";
      } catch (error) {
        last = error instanceof Error ? error.message : last;
      }
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
    throw new Error(`${last} If the tab is asking you to sign in, sign in, then click Review my paper again.`);
  }
  async function startJob(packetInput, defenceRounds = 0, airTabId = 0) {
    const validated = validatePacket(packetInput);
    if (!validated.ok) return { ok: false, message: validated.message };
    const existing = await sessionGet(JOB_KEY);
    if (existing && Date.now() - existing.startedAt < 20 * 60 * 1e3) {
      return { ok: false, message: "A web-chat review is already running in another tab. Finish it, or cancel it from AIR, before starting another." };
    }
    const provider = webChatProvider(validated.packet.providerId);
    if (!provider) return { ok: false, message: "That chat site has no adapter." };
    const tab = await chrome.tabs.create({ url: provider.startUrl, active: true });
    if (!tab.id) return { ok: false, message: "The browser did not open a chat tab." };
    const job = {
      requestId: validated.packet.requestId,
      airTabId,
      providerTabId: tab.id,
      providerId: provider.id,
      startedAt: Date.now()
    };
    await sessionSet(JOB_KEY, job);
    emit(
      { source: EXTENSION_SOURCE, version: PROTOCOL_VERSION, type: "air-web-chat-progress", requestId: job.requestId, message: `Opened ${provider.label}. Stay on that tab. The review runs because you clicked Review my paper.` },
      airTabId
    );
    try {
      await waitForLoad(tab.id);
      await wakeRunner(tab.id, { type: "air-web-chat-run", requestId: job.requestId, providerId: provider.id, packet: validated.packet, defenceRounds });
    } catch (error) {
      await sessionRemove(JOB_KEY);
      return { ok: false, message: error instanceof Error ? error.message : "The chat tab could not start." };
    }
    return { ok: true };
  }
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === "air-web-chat-request") {
      if (!requestAllowed(sender)) {
        sendResponse({ ok: false, message: "A review can start from this extension or from the AIR site on your computer." });
        return true;
      }
      const rounds = Math.min(3, Math.max(0, Math.round(Number(message.defenceRounds) || 0)));
      const airTabId = airTabForRequest(sender, chrome.runtime.getURL(""));
      void startJob(message.packet, rounds, airTabId).then(sendResponse);
      return true;
    }
    if (message?.type === "air-web-chat-cancel") {
      if (!requestAllowed(sender)) {
        sendResponse({ ok: false, message: "A review can be cancelled from this extension or from the AIR site on your computer." });
        return true;
      }
      void sessionGet(JOB_KEY).then(async (job) => {
        if (job && job.requestId === message.requestId) {
          emit(
            extensionEnvelope({
              kind: "error",
              requestId: job.requestId,
              airTabId: job.airTabId,
              message: "Stopped. The chat tab stays open."
            }),
            job.airTabId
          );
          await tabSend(job.providerTabId, { type: "air-web-chat-abort", requestId: job.requestId }).catch(() => void 0);
          await sessionRemove(JOB_KEY);
        }
        sendResponse({ ok: true });
      });
      return true;
    }
    if (message?.type === "air-web-chat-text-page" && typeof message.url === "string") {
      const url = message.url;
      void fetch(url).then(async (response) => {
        const body = await response.text();
        const packed = packTextPage(body);
        sendResponse({ status: response.status, body: packed.body, total: packed.total });
      }).catch(() => sendResponse({ status: 0, body: "" }));
      return true;
    }
    if (message?.type === "air-web-chat-focus") {
      void sessionGet(JOB_KEY).then(async (job) => {
        const tabId = job?.providerTabId;
        if (!tabId) {
          sendResponse({ ok: false });
          return;
        }
        try {
          const tab = await chrome.tabs.get(tabId);
          await chrome.tabs.update(tabId, { active: true });
          if (tab.windowId !== void 0) await chrome.windows.update(tab.windowId, { focused: true });
          sendResponse({ ok: true });
        } catch {
          sendResponse({ ok: false });
        }
      });
      return true;
    }
    if (message?.type === "air-web-chat-progress" || message?.type === "air-web-chat-done") {
      void sessionGet(JOB_KEY).then(async (job) => {
        if (!job || sender.tab?.id !== job.providerTabId || message.requestId !== job.requestId) return;
        if (message.type === "air-web-chat-done") await sessionRemove(JOB_KEY);
        emitDecision(job, sender.tab?.id, message);
      });
      sendResponse({ ok: true });
      return true;
    }
    return void 0;
  });
  if (chrome.sidePanel?.setPanelBehavior) {
    void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  } else {
    chrome.action.onClicked.addListener(() => {
      void chrome.tabs.create({ url: chrome.runtime.getURL("review.html") });
    });
  }
})();
