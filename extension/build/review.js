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
      assistant: ['[data-testid="assistant-message"]', '[data-testid="grok-message"]', '[class*="assistant-message"]', '[data-message-author="assistant"]'],
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
  var primaryWebChatIds = ["grok", "gemini", "claude", "grok-x"];
  var webChatProviders = [grok, gemini, chatgpt, claude, grokX, deepseek, mistral, copilot, perplexity];
  function webChatProvider(id) {
    return webChatProviders.find((item) => item.id === id) ?? null;
  }

  // criteria/air-v0.1.json
  var air_v0_1_default = {
    id: "air",
    version: "0.1.0",
    name: "AIR Peer Review Criteria",
    principles: [
      "Assess the work on its own logic and evidence. Do not score author credentials, institutional affiliation, reputation, or identity.",
      "Be constructive, specific, and actionable. Every criticism should say what would resolve it.",
      "Label evidence and speculation separately. Do not treat a confident tone as support.",
      "Quote the record. A score without a passage is an unsupported score.",
      "This reading is an AI assessment against a public criteria set. It is not a formal journal peer review and it is not an endorsement."
    ],
    scale: {
      min: 1,
      max: 5,
      labels: {
        "1": "Serious concerns \u2014 the criterion is largely unmet",
        "2": "Weak \u2014 present in part, with important gaps",
        "3": "Adequate \u2014 a fair attempt, still thin in places",
        "4": "Strong \u2014 clear, supported, and usable",
        "5": "Exemplary \u2014 careful, complete, and easy to check"
      }
    },
    recommendationCategories: [
      {
        id: "encourage",
        label: "Encourage further development",
        meaning: "The core idea is clear and the support is strong enough to build on, with only modest gaps."
      },
      {
        id: "revise",
        label: "Promising, needs revision",
        meaning: "Worth continued work. Specific gaps should be closed before a reader relies on the claims."
      },
      {
        id: "major-revision",
        label: "Major revision required",
        meaning: "The record has a real subject, but evidence, method, or consistency is not yet strong enough."
      },
      {
        id: "not-ready",
        label: "Not ready for reliance",
        meaning: "Central claims are unclear, unsupported, or contradicted by the record's own numbers."
      }
    ],
    ideaCriterionIds: ["novelty-context", "potential-impact"],
    criteria: [
      {
        id: "clarity",
        name: "Clarity of claims",
        description: "A reader can point to what is being claimed, for whom, and under which conditions.",
        weight: 1.2,
        guidance: "Look for an explicit claim, scope, and what would count as the claim being wrong. Vague aspiration without a proposition scores low. Quote the sentences that state the claim."
      },
      {
        id: "novelty-context",
        name: "Novelty and context",
        description: "The work says what is new and how that sits against prior public work.",
        weight: 1.1,
        guidance: "Credit a clear delta from prior work. Do not require famous citations, but do expect the record to locate itself. Prior-work silence is a gap, not proof of originality."
      },
      {
        id: "potential-impact",
        name: "Potential impact",
        description: "If the claims held, the change for practice, knowledge, or design would matter.",
        weight: 1,
        guidance: "Score the stated impact pathway, not the prestige of the field. Grand impact with no mechanism connecting claim to consequence should not score as high as a smaller, traceable one."
      },
      {
        id: "methodology",
        name: "Methodology and reproducibility",
        description: "Someone else could retrace the method: materials, steps, assumptions, and what was measured.",
        weight: 1.3,
        guidance: "Reward procedures, parameters, and data paths that a stranger could follow. Penalise missing steps that the conclusion depends on. Code or a worked example counts when the claim is computational."
      },
      {
        id: "consistency",
        name: "Internal consistency",
        description: "Numbers, units, and derivations agree with each other across the record.",
        weight: 1.3,
        guidance: "Check units, orders of magnitude, and whether a later section contradicts an earlier equation. Cite both passages when they disagree. If the record has no quantities, say so and score the consistency of its qualitative claims."
      },
      {
        id: "evidence-labelling",
        name: "Evidence and speculation",
        description: "Observations, calculations, and speculation are labelled as what they are.",
        weight: 1.2,
        guidance: "High scores mean a reader can tell a measurement from a hypothesis from a hope. Penalise results language used for unrun experiments or unverified models."
      },
      {
        id: "availability",
        name: "Data and code availability",
        description: "The artefacts needed to check the work are public, or their absence is justified.",
        weight: 1,
        guidance: "Use the Zenodo files and the text. A public file that does not match the claim is not availability. Private data with a clear reason can still score adequately."
      },
      {
        id: "limitations",
        name: "Limitations and falsifiability",
        description: "The record says how it could fail and what it does not show.",
        weight: 1.1,
        guidance: "Look for limits, alternative explanations, and a check that could falsify the central claim. A limitation section that only asks for more funding scores low."
      },
      {
        id: "ethics",
        name: "Ethics and safety",
        description: "Foreseeable harm, dual use, and effects on people or environments are faced directly.",
        weight: 0.9,
        guidance: "Scale the bar to the claim. A methods note on a harmless dataset needs less than a proposal for medical, environmental, or high-stakes deployment. Do not invent harms the work does not imply."
      },
      {
        id: "presentation",
        name: "Presentation",
        description: "Structure, language, figures, and file organisation let a reader check the work.",
        weight: 0.7,
        guidance: "Score navigability and precision of language. Do not score prestige or polish that does not affect understanding. Note which file holds which part of the argument when the record has several files."
      }
    ]
  };

  // criteria/air-v0.2.json
  var air_v0_2_default = {
    id: "air",
    version: "0.2.0",
    name: "AIR criteria",
    reportSchema: "0.2",
    principles: [
      "Assess the work on its own logic and evidence. Do not score author credentials, institutional affiliation, reputation, or identity.",
      "Untested is not the same as wrong. Physics defines what works. Absence of prior testing is not evidence of failure.",
      "A result that challenges a known law is not an automatic fail. Score how well the work itself accounts for the clash, and open an issue so the account can be checked.",
      "Logical and philosophical works are not penalised for being non-physical. Judge them on the rigour of the reasoning inside their class.",
      "Quote the record. A score without a passage is an unsupported score. State your confidence on every criterion.",
      "Estimated money figures are AI estimates with explicit assumptions. They are not facts and not investment advice.",
      "This reading is an AI assessment. It can be wrong. It is not a formal journal peer review, not a certification, and not an endorsement."
    ],
    scale: {
      min: 0,
      max: 100,
      labels: {
        "0": "0\u201320: the criterion is largely unmet",
        "50": "50\u201360: a fair attempt, still thin",
        "90": "90\u2013100: careful, complete, and easy to check"
      }
    },
    recommendationCategories: [
      {
        id: "accept",
        label: "Accept / sound",
        meaning: "Sound as it stands. A reader can rely on the claims the record actually makes, without treating the work as a funding proposal that still needs a build."
      },
      {
        id: "encourage",
        label: "Encourage further development",
        meaning: "The core idea is clear and the support is strong enough to build on, with only modest gaps."
      },
      {
        id: "revise",
        label: "Promising, needs revision",
        meaning: "Worth continued work. Specific gaps should be closed before a reader relies on the claims."
      },
      {
        id: "major-revision",
        label: "Major revision required",
        meaning: "The record has a real subject, but evidence, feasibility, or consistency is not yet strong enough."
      },
      {
        id: "not-ready",
        label: "Not ready for reliance",
        meaning: "Central claims are unclear, untested in a way the text hides, or contradicted by the record's own account."
      }
    ],
    ideaCriterionIds: [
      "impact",
      "global-goals"
    ],
    criteria: [
      {
        id: "impact",
        name: "Impact",
        description: "Scale and breadth of benefit for markets, society, or the public interest, if the claims held.",
        weight: 1.4,
        guidance: "Score the pathway from the claim to a benefit someone can name. A grand benefit with no connecting mechanism scores below a smaller benefit the text actually traces. Quote the sentence that states who benefits.",
        bands: [
          {
            min: 0,
            max: 20,
            label: "No stated benefit, or a benefit with no link to the claim."
          },
          {
            min: 30,
            max: 40,
            label: "A narrow or vague benefit."
          },
          {
            min: 50,
            max: 60,
            label: "A plausible benefit for a defined group."
          },
          {
            min: 70,
            max: 80,
            label: "A wide benefit with a traceable pathway."
          },
          {
            min: 90,
            max: 100,
            label: "A broad public or market benefit, scoped and connected to the claim."
          }
        ]
      },
      {
        id: "feasibility",
        name: "Feasibility",
        description: "Whether a stranger could see a path to build, run, or test the claim with the materials, steps, and constraints the record gives.",
        weight: 1.3,
        guidance: "Weigh this beside impact. Do not treat a hard problem as a failed one. Score the path that is written down: parts, skills, cost drivers, and the next experiment. Missing steps that the conclusion depends on lower the score.",
        bands: [
          {
            min: 0,
            max: 20,
            label: "No path from claim to a build or a test."
          },
          {
            min: 30,
            max: 40,
            label: "A sketch with essential steps missing."
          },
          {
            min: 50,
            max: 60,
            label: "A partial path a specialist could continue."
          },
          {
            min: 70,
            max: 80,
            label: "Steps, constraints, and a next test are written down."
          },
          {
            min: 90,
            max: 100,
            label: "A stranger could follow the path with the public record."
          }
        ]
      },
      {
        id: "world-class",
        name: "Physical or metaphysical class",
        description: "What kind of claim this is, and how viable and testable it is inside that class.",
        weight: 1,
        guidance: "Classify as physical-testable, physical-not-yet-testable, logical-mathematical, or metaphysical-philosophical. Then score rigour inside that class. A proof is not marked down for lacking a laboratory. A physical device is not marked up for using philosophical language. State the class in ontologyClass.",
        bands: [
          {
            min: 0,
            max: 20,
            label: "The class is unclear, or the reasoning inside it does not hold."
          },
          {
            min: 30,
            max: 40,
            label: "Class is named but the standard for that class is barely met."
          },
          {
            min: 50,
            max: 60,
            label: "Class is clear and the reasoning is adequate for it."
          },
          {
            min: 70,
            max: 80,
            label: "The work meets the usual standard of its class."
          },
          {
            min: 90,
            max: 100,
            label: "The class is explicit and the reasoning is tight enough to check."
          }
        ]
      },
      {
        id: "testability",
        name: "Objective viability and testability",
        description: "Whether there is a clear test, measurement, derivation, or observation that would prove or falsify the claim.",
        weight: 1.3,
        guidance: "Untested is not the same as wrong. Score the presence of a decisive check, not whether that check has already been run. A logical claim is testable by counterexample or derivation. Quote the passage that says what would count as failure.",
        bands: [
          {
            min: 0,
            max: 20,
            label: "Nothing in the record could show the claim to be wrong."
          },
          {
            min: 30,
            max: 40,
            label: "A check is hinted at but not specified."
          },
          {
            min: 50,
            max: 60,
            label: "A check is described, with gaps in measure or stopping rule."
          },
          {
            min: 70,
            max: 80,
            label: "A reader could run or follow a decisive check."
          },
          {
            min: 90,
            max: 100,
            label: "The falsifier is explicit, measurable, and matched to the claim."
          }
        ]
      },
      {
        id: "simulation",
        name: "Simulation evidence",
        description: "Quality and quantity of reported simulations: how many, how many passed, methods and tools, and whether inputs or code are public.",
        weight: 0.9,
        guidance: "Count only simulations the record reports. If the work is not the kind that uses simulation, say so, score the honesty of that choice, and do not invent runs. Fill simulation.reported, simulation.passed, methods, and inputsAvailable. Unknown counts are null, not zero.",
        bands: [
          {
            min: 0,
            max: 20,
            label: "Simulations are claimed with no count, method, or result."
          },
          {
            min: 30,
            max: 40,
            label: "A run is mentioned without enough detail to judge it."
          },
          {
            min: 50,
            max: 60,
            label: "Some runs, tools, or results are described."
          },
          {
            min: 70,
            max: 80,
            label: "Counts, outcomes, and tools are stated, with partial inputs."
          },
          {
            min: 90,
            max: 100,
            label: "Counts, pass results, tools, and inputs or code are public."
          }
        ]
      },
      {
        id: "physics",
        name: "Physics consistency",
        description: "How the account sits against known laws and current understanding, and how well the work addresses any clash.",
        weight: 1.3,
        guidance: "Name the laws you actually used, such as conservation of energy, momentum, thermodynamics, or electromagnetism. Classify as CONSISTENT, EXTENDS, or CHALLENGES. CHALLENGES is not an automatic fail: score how completely the work accounts for the clash, for example by identifying the energy source. Quote both the claim and the accounting. Put the class in physics.classification.",
        bands: [
          {
            min: 0,
            max: 20,
            label: "A clash with a named law is left unaddressed."
          },
          {
            min: 30,
            max: 40,
            label: "A possible clash is noted weakly, or units and laws are muddled."
          },
          {
            min: 50,
            max: 60,
            label: "Consistent enough, or a challenge with a partial account."
          },
          {
            min: 70,
            max: 80,
            label: "Laws are named and the account matches them, or a challenge is met with a clear accounting."
          },
          {
            min: 90,
            max: 100,
            label: "A careful match to named laws, with the passages a physicist can check."
          }
        ]
      },
      {
        id: "estimated-value",
        name: "Estimated project value",
        description: "An AI estimate of market disruption, addressable market, units that could be sold, value per unit, and overall financial benefit.",
        weight: 0.7,
        guidance: "Always label this as an AI estimate. Give low, central, and high ranges. List the assumptions. Default confidence is low. If the record has no market facts, say the figures are not grounded and keep the ranges wide or mark them as not estimated. Never present a figure as a fact or as investment advice.",
        bands: [
          {
            min: 0,
            max: 20,
            label: "A money claim with no assumption a reader can see."
          },
          {
            min: 30,
            max: 40,
            label: "A vague market story."
          },
          {
            min: 50,
            max: 60,
            label: "A benefit is scoped, with thin market evidence."
          },
          {
            min: 70,
            max: 80,
            label: "Ranges and assumptions are explicit and tied to the record."
          },
          {
            min: 90,
            max: 100,
            label: "Ranges, units, and assumptions are public and easy to revise."
          }
        ]
      },
      {
        id: "global-goals",
        name: "Global goals alignment",
        description: "Which documented public goals the work addresses, how directly, and what contribution the record itself supports.",
        weight: 1.1,
        guidance: "Use only the goals in criteria/global-goals.json. For each goal set a level: none, indirect, partial, or direct. Quote the passage that creates the link. Do not award direct alignment for a slogan. A work that addresses none of these goals can still score well on other criteria; say that plainly.",
        bands: [
          {
            min: 0,
            max: 20,
            label: "A goal is claimed with no link in the text."
          },
          {
            min: 30,
            max: 40,
            label: "A loose or indirect link to one goal."
          },
          {
            min: 50,
            max: 60,
            label: "One goal is addressed in part, with a passage."
          },
          {
            min: 70,
            max: 80,
            label: "One or more goals are addressed directly and the limit of that claim is stated."
          },
          {
            min: 90,
            max: 100,
            label: "Direct links, with a bounded estimate of contribution a reader can check."
          }
        ]
      },
      {
        id: "clarity",
        name: "Clarity of claims",
        description: "A reader can point to what is claimed, for whom, and under which conditions.",
        weight: 0.4,
        guidance: "Look for an explicit claim and what would count as it being wrong. Quote that sentence.",
        bands: [
          {
            min: 0,
            max: 20,
            label: "No proposition a reader can restate."
          },
          {
            min: 30,
            max: 40,
            label: "The claim is cloudy or unbounded."
          },
          {
            min: 50,
            max: 60,
            label: "The claim can be restated, with fuzzy edges."
          },
          {
            min: 70,
            max: 80,
            label: "Claim, scope, and conditions are clear."
          },
          {
            min: 90,
            max: 100,
            label: "A stranger can point to the sentence that carries the claim."
          }
        ]
      },
      {
        id: "consistency",
        name: "Internal consistency",
        description: "Numbers, units, and derivations agree with each other across the record.",
        weight: 0.5,
        guidance: "Check units and whether a later section contradicts an earlier one. If there are no quantities, score the consistency of the qualitative claims and say so.",
        bands: [
          {
            min: 0,
            max: 20,
            label: "The record contradicts itself on a point the conclusion needs."
          },
          {
            min: 30,
            max: 40,
            label: "Units or steps conflict and are not resolved."
          },
          {
            min: 50,
            max: 60,
            label: "Mostly consistent, with a loose end."
          },
          {
            min: 70,
            max: 80,
            label: "Numbers and claims agree across the files you read."
          },
          {
            min: 90,
            max: 100,
            label: "Units, derivations, and later sections match."
          }
        ]
      },
      {
        id: "evidence-labelling",
        name: "Evidence and speculation",
        description: "Observations, calculations, and speculation are labelled as what they are.",
        weight: 0.5,
        guidance: "A reader should be able to tell a measurement from a hypothesis from a hope. Penalise results language used for unrun experiments.",
        bands: [
          {
            min: 0,
            max: 20,
            label: "Hope is written as a result."
          },
          {
            min: 30,
            max: 40,
            label: "Labels slip on claims the conclusion needs."
          },
          {
            min: 50,
            max: 60,
            label: "Most claims are labelled, with one blur."
          },
          {
            min: 70,
            max: 80,
            label: "Evidence and speculation are easy to separate."
          },
          {
            min: 90,
            max: 100,
            label: "Every strong conclusion is marked as measured, derived, or still open."
          }
        ]
      },
      {
        id: "availability",
        name: "Data and code availability",
        description: "The artefacts needed to check the work are public, or their absence is explained.",
        weight: 0.4,
        guidance: "Use the Zenodo files and the text. A public file that does not match the claim is not availability.",
        bands: [
          {
            min: 0,
            max: 20,
            label: "The check depends on artefacts that are missing and unexplained."
          },
          {
            min: 30,
            max: 40,
            label: "Files exist but do not match the claim."
          },
          {
            min: 50,
            max: 60,
            label: "Some of the needed files are public."
          },
          {
            min: 70,
            max: 80,
            label: "A reader can find the data or code the claim uses."
          },
          {
            min: 90,
            max: 100,
            label: "Data, code, or a justified absence is public and identified."
          }
        ]
      },
      {
        id: "limitations",
        name: "Limitations",
        description: "The record says how it could fail and what it does not show.",
        weight: 0.4,
        guidance: "Look for limits and alternative explanations. A limitation that only asks for more funding scores low.",
        bands: [
          {
            min: 0,
            max: 20,
            label: "No limit is stated where the claim is strong."
          },
          {
            min: 30,
            max: 40,
            label: "A limit is decorative."
          },
          {
            min: 50,
            max: 60,
            label: "A real limit is named, without a consequence."
          },
          {
            min: 70,
            max: 80,
            label: "Limits are specific and tied to the claim."
          },
          {
            min: 90,
            max: 100,
            label: "The record says what it does not show and what would falsify it."
          }
        ]
      }
    ]
  };

  // src/domain/criteria.ts
  function round2(n) {
    return Math.round(n * 100) / 100;
  }
  function clamp(n, min, max) {
    return Math.min(max, Math.max(min, n));
  }
  function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
  function stringList(value, errors, path) {
    if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) {
      errors.push(`${path} must be a list of non-empty strings.`);
      return null;
    }
    return value;
  }
  function parseCriteria(input) {
    const errors = [];
    if (!isRecord(input)) return { ok: false, errors: ["Criteria must be a JSON object."] };
    const id = typeof input.id === "string" ? input.id.trim() : "";
    const version = typeof input.version === "string" ? input.version.trim() : "";
    const name = typeof input.name === "string" ? input.name.trim() : "";
    if (!id) errors.push("id is required.");
    if (!version) errors.push("version is required.");
    if (!name) errors.push("name is required.");
    const principles = stringList(input.principles, errors, "principles") ?? [];
    if (principles.length === 0) errors.push("Add at least one principle.");
    if (!isRecord(input.scale)) {
      errors.push("scale must be an object.");
    }
    const scaleMin = isRecord(input.scale) ? Number(input.scale.min) : NaN;
    const scaleMax = isRecord(input.scale) ? Number(input.scale.max) : NaN;
    if (!Number.isInteger(scaleMin) || !Number.isInteger(scaleMax) || scaleMax <= scaleMin) {
      errors.push("scale.min and scale.max must be integers with max greater than min.");
    }
    const labels = isRecord(input.scale) && isRecord(input.scale.labels) ? Object.fromEntries(
      Object.entries(input.scale.labels).filter((entry) => typeof entry[1] === "string")
    ) : {};
    const categoriesRaw = Array.isArray(input.recommendationCategories) ? input.recommendationCategories : [];
    const recommendationCategories = categoriesRaw.flatMap((item) => {
      if (!isRecord(item) || typeof item.id !== "string" || typeof item.label !== "string") {
        errors.push("Each recommendation category needs an id and a label.");
        return [];
      }
      return [{ id: item.id.trim(), label: item.label.trim(), meaning: typeof item.meaning === "string" ? item.meaning : "" }];
    });
    if (recommendationCategories.length === 0) errors.push("Add at least one recommendation category.");
    const ideaCriterionIds = stringList(input.ideaCriterionIds, errors, "ideaCriterionIds") ?? [];
    const criteriaRaw = Array.isArray(input.criteria) ? input.criteria : [];
    const criteria = [];
    const seen = /* @__PURE__ */ new Set();
    for (const item of criteriaRaw) {
      if (!isRecord(item)) {
        errors.push("Each criterion must be an object.");
        continue;
      }
      const cid = typeof item.id === "string" ? item.id.trim() : "";
      const cname = typeof item.name === "string" ? item.name.trim() : "";
      const description = typeof item.description === "string" ? item.description.trim() : "";
      const guidance = typeof item.guidance === "string" ? item.guidance.trim() : "";
      const weight = Number(item.weight);
      if (!cid || !cname || !description || !guidance) errors.push(`Criterion ${cid || "(missing id)"} needs id, name, description, and guidance.`);
      if (!Number.isFinite(weight) || weight <= 0) errors.push(`Criterion ${cid || cname} needs a weight above 0.`);
      if (cid && seen.has(cid)) errors.push(`Duplicate criterion id ${cid}.`);
      seen.add(cid);
      const bands = Array.isArray(item.bands) ? item.bands.flatMap((band) => {
        if (!isRecord(band) || typeof band.label !== "string") return [];
        const min = Number(band.min);
        const max = Number(band.max);
        if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
        return [{ min, max, label: band.label.trim() }];
      }) : void 0;
      criteria.push({ id: cid, name: cname, description, weight, guidance, bands });
    }
    if (criteria.length === 0) errors.push("Add at least one criterion.");
    for (const ideaId of ideaCriterionIds) {
      if (!seen.has(ideaId)) errors.push(`ideaCriterionIds refers to unknown criterion ${ideaId}.`);
    }
    const schemaRaw = typeof input.reportSchema === "string" ? input.reportSchema : "0.1";
    if (schemaRaw !== "0.1" && schemaRaw !== "0.2") errors.push("reportSchema must be 0.1 or 0.2.");
    if (errors.length) return { ok: false, errors };
    return {
      ok: true,
      criteria: {
        id,
        version,
        name,
        principles,
        scale: { min: scaleMin, max: scaleMax, labels },
        recommendationCategories,
        ideaCriterionIds,
        criteria,
        reportSchema: schemaRaw === "0.2" ? "0.2" : "0.1"
      }
    };
  }
  function weightedMean(scores, criteria, ids) {
    const wanted = new Set(ids ?? criteria.criteria.map((item) => item.id));
    let weight = 0;
    let total = 0;
    for (const criterion of criteria.criteria) {
      if (!wanted.has(criterion.id)) continue;
      const found = scores.find((item) => item.criterionId === criterion.id);
      if (!found) return null;
      weight += criterion.weight;
      total += criterion.weight * found.score;
    }
    if (weight <= 0) return null;
    return round2(total / weight);
  }

  // src/domain/officialCriteria.ts
  function load(raw, label) {
    const parsed2 = parseCriteria(raw);
    if (!parsed2.ok) throw new Error(`${label} is invalid:
${parsed2.errors.join("\n")}`);
    return parsed2.criteria;
  }
  var airCriteriaV01 = load(air_v0_1_default, "AIR v0.1");
  var airCriteriaV02 = load(air_v0_2_default, "AIR v0.2");
  var officialCriteria = airCriteriaV02;

  // src/domain/profiles.ts
  var NO_PROJECT_VALUE_PRINCIPLE = "Estimated project value is not scored for this profile. Do not invent a market figure. Accept means the work is sound as it stands.";
  var CRITERION_PROFILES = [
    {
      id: "device",
      label: "Device or engineering",
      summary: "A device, prototype, or funding proposal. Estimated project value is scored. This is the historical default when a reading has no profile.",
      proposal: true
    },
    {
      id: "theory",
      label: "Theory",
      summary: "A proof, derivation, or theoretical argument. Soundness is the reasoning, not a build path or a market.",
      proposal: false,
      weights: {
        clarity: 1.4,
        "world-class": 1.3,
        testability: 1.3,
        consistency: 1.2,
        "evidence-labelling": 1,
        limitations: 0.9,
        physics: 0.8,
        impact: 0.7
      },
      ideaCriterionIds: ["clarity", "world-class"],
      guidance: {
        impact: "Score the intellectual consequence if the argument holds, not a market. Quote the sentence that says what changes.",
        testability: "A theory is testable by derivation, counterexample, or a stated observation. Score that check, not a laboratory the claim does not need.",
        physics: "If the claim is not physical, say so and score how clearly the text stays inside its class. Do not mark a proof down for lacking a device."
      }
    },
    {
      id: "data",
      label: "Data or reference paper",
      summary: "A dataset, corpus, catalogue, or reference work. The question is whether someone else can find and check the artefact.",
      proposal: false,
      weights: {
        availability: 1.5,
        clarity: 1.3,
        consistency: 1.1,
        "evidence-labelling": 1.1,
        limitations: 1,
        testability: 0.8,
        impact: 0.6,
        "global-goals": 0.4
      },
      ideaCriterionIds: ["availability", "clarity"],
      guidance: {
        availability: "Score whether the data, code, or reference file is public and matches the claim. Figures that were not read are not missing data unless the claim depends on the image itself.",
        impact: "Score who can use the dataset or reference, not a product market."
      }
    },
    {
      id: "roadmap",
      label: "Roadmap or report",
      summary: "A roadmap, survey, or report. Judge the map that is written, not a device that has not been proposed.",
      proposal: false,
      weights: {
        clarity: 1.3,
        impact: 1.2,
        limitations: 1.1,
        "evidence-labelling": 1,
        feasibility: 0.9,
        consistency: 0.8,
        testability: 0.7,
        "global-goals": 0.8,
        availability: 0.5
      },
      ideaCriterionIds: ["impact", "clarity"],
      guidance: {
        feasibility: "Score whether a reader can follow the path the report describes. A missing prototype is not a fail when the work is a map, not a build.",
        impact: "Score the benefit the report itself traces, not an estimated sale price."
      }
    },
    {
      id: "empirical",
      label: "Empirical study",
      summary: "A measurement, experiment, or observational study. The question is the check that was run and what it can show.",
      proposal: false,
      weights: {
        testability: 1.4,
        "evidence-labelling": 1.3,
        consistency: 1.1,
        clarity: 1.1,
        limitations: 1,
        availability: 1,
        physics: 0.7,
        simulation: 0.5,
        impact: 0.6,
        "world-class": 0.6
      },
      ideaCriterionIds: ["testability", "evidence-labelling"],
      guidance: {
        testability: "Score the measurement, stopping rule, and what would count as a failed check. Untested is not the same as wrong, but a result claim needs the check that was run.",
        impact: "Score what the study changes for a reader, not a funding total."
      }
    }
  ];
  var PROFILE_BY_ID = new Map(CRITERION_PROFILES.map((profile) => [profile.id, profile]));
  function profileById(id) {
    if (id && PROFILE_BY_ID.has(id)) return PROFILE_BY_ID.get(id);
    return CRITERION_PROFILES[0];
  }
  function withGuidance(criterion, guidance) {
    if (!guidance) return { ...criterion };
    return { ...criterion, guidance };
  }
  function applyCriterionProfile(base, profileId2) {
    const profile = profileById(profileId2);
    if (profile.proposal || !profile.weights) return base;
    const weights = profile.weights;
    const criteria = base.criteria.flatMap((criterion) => {
      const weight = weights[criterion.id];
      if (weight === void 0) return [];
      return [withGuidance({ ...criterion, weight }, profile.guidance?.[criterion.id])];
    });
    const ideaCriterionIds = (profile.ideaCriterionIds ?? base.ideaCriterionIds).filter((id) => criteria.some((criterion) => criterion.id === id));
    return {
      ...base,
      criteria,
      ideaCriterionIds,
      principles: base.principles.includes(NO_PROJECT_VALUE_PRINCIPLE) ? base.principles : [...base.principles, NO_PROJECT_VALUE_PRINCIPLE]
    };
  }
  function readingCriteria(base, profileId2, custom) {
    if (custom) return base;
    return applyCriterionProfile(base, profileId2);
  }

  // src/domain/scoring.ts
  var BOARD_MAX = 100;
  var MISMATCH_POINTS = 10;
  function criteriaForReview(review) {
    if (review.criteriaVersion.startsWith("0.1")) return airCriteriaV01;
    if (review.customCriteria) return officialCriteria;
    return applyCriterionProfile(officialCriteria, review.criterionProfile);
  }
  function storedScale(report, criteriaVersion) {
    if (report.scale === 100 || report.scale === 10 || report.scale === 5) return report.scale;
    if (criteriaVersion.startsWith("0.1")) return 5;
    return 10;
  }
  function toBoard(score, scale) {
    if (scale >= 100) return round2(score);
    if (scale <= 5) return round2((score - 1) / 4 * BOARD_MAX);
    return round2(score * (BOARD_MAX / scale));
  }
  function expectedVerdict(board) {
    if (board >= 80) return "encourage";
    if (board >= 60) return "revise";
    if (board >= 40) return "major-revision";
    return "not-ready";
  }
  function recommendationMatchesBand(recommendation, board) {
    const expected = expectedVerdict(Math.round(board));
    if (recommendation === expected) return true;
    return recommendation === "accept" && expected === "encourage";
  }
  function describeScoring(input) {
    const scale = input.criteria.scale.max >= 100 ? 100 : input.criteria.scale.max <= 5 ? 5 : 10;
    const internalRaw = weightedMean(input.scores, input.criteria);
    const internal = internalRaw === null ? null : toBoard(internalRaw, scale);
    const stated = input.statedOverall === null ? null : toBoard(input.statedOverall, scale);
    const reasons = [];
    if (internal !== null && stated !== null && Math.abs(stated - internal) > MISMATCH_POINTS) {
      reasons.push(`Stated overall ${stated} differs from the weighted score ${internal} by more than ${MISMATCH_POINTS}.`);
    }
    if (internal !== null && input.recommendation && !recommendationMatchesBand(input.recommendation, internal)) {
      reasons.push(`Verdict ${input.recommendation} does not match the score band for ${internal} (expected ${expectedVerdict(internal)}).`);
    }
    return {
      scale,
      statedOverall: input.statedOverall,
      scoringCheck: {
        internal: internal ?? 0,
        statedOverall: stated,
        mismatch: reasons.length > 0,
        reason: reasons.join(" ") || null
      }
    };
  }
  function scoringMismatch(review) {
    const criteria = criteriaForReview(review);
    const internalRaw = weightedMean(review.report.scores, criteria);
    if (internalRaw === null) return { mismatch: false, reason: null, internal: null };
    const scale = storedScale(review.report, review.criteriaVersion);
    const internal = toBoard(internalRaw, scale);
    const statedSource = review.report.statedOverall != null ? review.report.statedOverall : review.report.overallScore;
    const stated = toBoard(statedSource, scale);
    const reasons = [];
    if (Math.abs(stated - internal) > MISMATCH_POINTS) {
      reasons.push(`Stated overall ${stated} differs from the weighted score ${internal} by more than ${MISMATCH_POINTS}.`);
    }
    const expected = expectedVerdict(internal);
    if (review.report.recommendation && !recommendationMatchesBand(review.report.recommendation, internal)) {
      reasons.push(`Verdict ${review.report.recommendation} does not match the score band for ${internal} (expected ${expected}).`);
    }
    const reason = reasons.join(" ");
    return { mismatch: reasons.length > 0, reason: reason || null, internal };
  }

  // src/services/airFeedback.ts
  var ALIASES = {
    criteria: "criteria",
    criterion: "criteria",
    profile: "profile",
    missingContext: "missingContext",
    missing_context: "missingContext",
    missing: "missingContext",
    files: "missingContext",
    prompt: "prompt",
    rubric: "rubric",
    scoringProcess: "scoringProcess",
    scoring_process: "scoringProcess",
    scoring: "scoringProcess"
  };
  function clip(value) {
    if (typeof value !== "string") return "";
    return value.trim().replace(/https?:\/\/(?:www\.)?(?:share\.google\/aimode|chatgpt\.com\/share|chat\.openai\.com\/share|claude\.ai\/share|grok\.com\/share)\/\S+/gi, "[private link]").slice(0, 1e3);
  }
  function parseAirFeedback(input) {
    if (input == null || input === "") return void 0;
    if (typeof input === "string") {
      const note = clip(input);
      return note ? { scoringProcess: note } : void 0;
    }
    if (typeof input !== "object" || Array.isArray(input)) return void 0;
    const feedback = {};
    for (const [key, value] of Object.entries(input)) {
      const field = ALIASES[key];
      const text2 = clip(value);
      if (!field || !text2) continue;
      feedback[field] = text2;
    }
    return Object.keys(feedback).length > 0 ? feedback : void 0;
  }
  function hasAirFeedback(feedback) {
    return Boolean(feedback && Object.values(feedback).some((item) => item && item.trim()));
  }

  // node_modules/jsonrepair/lib/esm/utils/JSONRepairError.js
  var JSONRepairError = class extends Error {
    constructor(message, position) {
      super(`${message} at position ${position}`);
      this.position = position;
    }
  };

  // node_modules/jsonrepair/lib/esm/utils/stringUtils.js
  var codeSpace = 32;
  var codeNewline = 10;
  var codeTab = 9;
  var codeReturn = 13;
  var codeNonBreakingSpace = 160;
  var codeMongolianVowelSeparator = 6158;
  var codeEnQuad = 8192;
  var codeZeroWidthSpace = 8203;
  var codeNarrowNoBreakSpace = 8239;
  var codeMediumMathematicalSpace = 8287;
  var codeIdeographicSpace = 12288;
  var codeZeroWidthNoBreakSpace = 65279;
  function isHex(char) {
    return /^[0-9A-Fa-f]$/.test(char);
  }
  function isDigit(char) {
    return char >= "0" && char <= "9";
  }
  function isValidStringCharacter(char) {
    return char >= " ";
  }
  function isDelimiter(char) {
    return ",:[]/{}()\n+".includes(char);
  }
  function isFunctionNameCharStart(char) {
    return char >= "a" && char <= "z" || char >= "A" && char <= "Z" || char === "_" || char === "$";
  }
  function isFunctionNameChar(char) {
    return char >= "a" && char <= "z" || char >= "A" && char <= "Z" || char === "_" || char === "$" || char >= "0" && char <= "9";
  }
  var regexUrlStart = /^(http|https|ftp|mailto|file|data|irc):\/\/$/;
  var regexUrlChar = /^[A-Za-z0-9-._~:/?#@!$&'()*+;=]$/;
  function isUnquotedStringDelimiter(char) {
    return ",[]/{}\n+".includes(char);
  }
  function isStartOfValue(char) {
    return isQuote(char) || regexStartOfValue.test(char);
  }
  var regexStartOfValue = /^[[{\w-]$/;
  function isControlCharacter(char) {
    return char === "\n" || char === "\r" || char === "	" || char === "\b" || char === "\f";
  }
  function isWhitespace(text2, index) {
    const code = text2.charCodeAt(index);
    return code === codeSpace || code === codeNewline || code === codeTab || code === codeReturn;
  }
  function isWhitespaceExceptNewline(text2, index) {
    const code = text2.charCodeAt(index);
    return code === codeSpace || code === codeTab || code === codeReturn;
  }
  function isSpecialWhitespace(text2, index) {
    const code = text2.charCodeAt(index);
    return code === codeNonBreakingSpace || code === codeMongolianVowelSeparator || code >= codeEnQuad && code <= codeZeroWidthSpace || code === codeNarrowNoBreakSpace || code === codeMediumMathematicalSpace || code === codeIdeographicSpace || code === codeZeroWidthNoBreakSpace;
  }
  function isQuote(char) {
    return isDoubleQuoteLike(char) || isSingleQuoteLike(char);
  }
  function isDoubleQuoteLike(char) {
    return char === '"' || char === "\u201C" || char === "\u201D";
  }
  function isDoubleQuote(char) {
    return char === '"';
  }
  function isSingleQuoteLike(char) {
    return char === "'" || char === "\u2018" || char === "\u2019" || char === "`" || char === "\xB4";
  }
  function isSingleQuote(char) {
    return char === "'";
  }
  function stripLastOccurrence(text2, textToStrip) {
    let stripRemainingText = arguments.length > 2 && arguments[2] !== void 0 ? arguments[2] : false;
    const index = text2.lastIndexOf(textToStrip);
    return index !== -1 ? text2.substring(0, index) + (stripRemainingText ? "" : text2.substring(index + 1)) : text2;
  }
  function insertBeforeLastWhitespace(text2, textToInsert) {
    let index = text2.length;
    if (!isWhitespace(text2, index - 1)) {
      return text2 + textToInsert;
    }
    while (isWhitespace(text2, index - 1)) {
      index--;
    }
    return text2.substring(0, index) + textToInsert + text2.substring(index);
  }
  function removeAtIndex(text2, start, count) {
    return text2.substring(0, start) + text2.substring(start + count);
  }
  function endsWithCommaOrNewline(text2) {
    return /[,\n][ \t\r]*$/.test(text2);
  }
  var namedHtmlEntities = {
    "&quot;": '"',
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&apos;": "'"
  };
  var maxHtmlEntityLength = 12;
  function matchHtmlEntity(fragment) {
    if (fragment.charAt(0) !== "&") {
      return null;
    }
    const semicolon = fragment.indexOf(";");
    if (semicolon === -1) {
      return null;
    }
    const entity = fragment.substring(0, semicolon + 1);
    const named = namedHtmlEntities[entity];
    if (named !== void 0) {
      return {
        char: named,
        length: entity.length
      };
    }
    if (fragment.charAt(1) === "#") {
      const body = fragment.substring(2, semicolon);
      const hex = body.charAt(0) === "x" || body.charAt(0) === "X";
      const digits = hex ? body.substring(1) : body;
      if (digits.length > 0) {
        const code = Number.parseInt(digits, hex ? 16 : 10);
        if (!Number.isNaN(code) && code >= 0 && code <= 1114111) {
          return {
            char: String.fromCodePoint(code),
            length: entity.length
          };
        }
      }
    }
    return null;
  }
  function isDoubleQuoteEntity(match) {
    return match !== null && match.char === '"';
  }
  function isSingleQuoteEntity(match) {
    return match !== null && match.char === "'";
  }
  function countOccurrences(text2, char) {
    let count = 0;
    for (let i = 0; i < text2.length; i++) {
      if (text2.charAt(i) === char) {
        count++;
      }
    }
    return count;
  }
  function isInsideUnclosedBracket(text2, closeChar) {
    switch (closeChar) {
      case ")":
        return countOccurrences(text2, "(") > countOccurrences(text2, ")");
      case "]":
        return countOccurrences(text2, "[") > countOccurrences(text2, "]");
      case "}":
        return countOccurrences(text2, "{") > countOccurrences(text2, "}");
      default:
        return false;
    }
  }

  // node_modules/jsonrepair/lib/esm/regular/jsonrepair.js
  var controlCharacters = {
    "\b": "\\b",
    "\f": "\\f",
    "\n": "\\n",
    "\r": "\\r",
    "	": "\\t"
  };
  var escapeCharacters = {
    '"': '"',
    "\\": "\\",
    "/": "/",
    b: "\b",
    f: "\f",
    n: "\n",
    r: "\r",
    t: "	"
    // note that \u is handled separately in parseString()
  };
  function jsonrepair(text2) {
    let i = 0;
    let output = "";
    parseMarkdownCodeBlock(["```", "[```", "{```"]);
    const processed = parseValue();
    if (!processed) {
      throwUnexpectedEnd();
    }
    parseMarkdownCodeBlock(["```", "```]", "```}"]);
    const processedComma = parseCharacter(",");
    if (processedComma) {
      parseWhitespaceAndSkipComments();
    }
    if (isStartOfValue(text2[i]) && endsWithCommaOrNewline(output)) {
      if (!processedComma) {
        output = insertBeforeLastWhitespace(output, ",");
      }
      parseNewlineDelimitedJSON();
    } else if (processedComma) {
      output = stripLastOccurrence(output, ",");
    }
    while (text2[i] === "}" || text2[i] === "]") {
      i++;
      parseWhitespaceAndSkipComments();
    }
    if (i >= text2.length) {
      return output;
    }
    throwUnexpectedCharacter();
    function parseValue() {
      parseWhitespaceAndSkipComments();
      const processed2 = parseObject() || parseArray() || parseString() || parseNumber() || parseKeywords() || parseUnquotedString(false) || parseRegex();
      parseWhitespaceAndSkipComments();
      return processed2;
    }
    function parseWhitespaceAndSkipComments() {
      let skipNewline = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : true;
      const start = i;
      let changed = parseWhitespace(skipNewline);
      do {
        changed = parseComment();
        if (changed) {
          changed = parseWhitespace(skipNewline);
        }
      } while (changed);
      return i > start;
    }
    function parseWhitespace(skipNewline) {
      const _isWhiteSpace = skipNewline ? isWhitespace : isWhitespaceExceptNewline;
      let whitespace = "";
      while (true) {
        if (_isWhiteSpace(text2, i)) {
          whitespace += text2[i];
          i++;
        } else if (isSpecialWhitespace(text2, i)) {
          whitespace += " ";
          i++;
        } else {
          break;
        }
      }
      if (whitespace.length > 0) {
        output += whitespace;
        return true;
      }
      return false;
    }
    function parseComment() {
      if (text2[i] === "/" && text2[i + 1] === "*") {
        while (i < text2.length && !atEndOfBlockComment(text2, i)) {
          i++;
        }
        i += 2;
        return true;
      }
      if (text2[i] === "/" && text2[i + 1] === "/") {
        while (i < text2.length && text2[i] !== "\n") {
          i++;
        }
        return true;
      }
      return false;
    }
    function parseMarkdownCodeBlock(blocks) {
      if (skipMarkdownCodeBlock(blocks)) {
        if (isFunctionNameCharStart(text2[i])) {
          while (i < text2.length && isFunctionNameChar(text2[i])) {
            i++;
          }
        }
        parseWhitespaceAndSkipComments();
        return true;
      }
      return false;
    }
    function skipMarkdownCodeBlock(blocks) {
      parseWhitespace(true);
      for (const block of blocks) {
        const end = i + block.length;
        if (text2.slice(i, end) === block) {
          i = end;
          return true;
        }
      }
      return false;
    }
    function parseCharacter(char) {
      if (text2[i] === char) {
        output += text2[i];
        i++;
        return true;
      }
      return false;
    }
    function skipCharacter(char) {
      if (text2[i] === char) {
        i++;
        return true;
      }
      return false;
    }
    function skipEscapeCharacter() {
      return skipCharacter("\\");
    }
    function skipEllipsis() {
      parseWhitespaceAndSkipComments();
      if (text2[i] === "." && text2[i + 1] === "." && text2[i + 2] === ".") {
        i += 3;
        parseWhitespaceAndSkipComments();
        skipCharacter(",");
        return true;
      }
      return false;
    }
    function parseObject() {
      if (text2[i] === "{") {
        output += "{";
        i++;
        parseWhitespaceAndSkipComments();
        if (skipCharacter(",")) {
          parseWhitespaceAndSkipComments();
        }
        let initial = true;
        while (i < text2.length && text2[i] !== "}") {
          let processedComma2;
          if (!initial) {
            processedComma2 = parseCharacter(",");
            if (!processedComma2) {
              output = insertBeforeLastWhitespace(output, ",");
            }
            parseWhitespaceAndSkipComments();
          } else {
            processedComma2 = true;
          }
          skipEllipsis();
          const processedKey = parseString() || parseUnquotedString(true);
          if (!processedKey) {
            if (text2[i] === "}" || text2[i] === "{" || text2[i] === "]" || text2[i] === "[" || text2[i] === void 0) {
              if (!initial) {
                output = stripLastOccurrence(output, ",");
              }
            } else {
              throwObjectKeyExpected();
            }
            break;
          }
          parseWhitespaceAndSkipComments();
          const processedColon = parseCharacter(":");
          const truncatedText = i >= text2.length;
          if (!processedColon) {
            if (isStartOfValue(text2[i]) || truncatedText) {
              output = insertBeforeLastWhitespace(output, ":");
            } else {
              throwColonExpected();
            }
          }
          const processedValue = parseValue();
          if (!processedValue) {
            if (processedColon || truncatedText) {
              output += "null";
            } else {
              throwColonExpected();
            }
          }
          initial = false;
        }
        if (text2[i] === "}") {
          output += "}";
          i++;
        } else {
          output = insertBeforeLastWhitespace(output, "}");
        }
        return true;
      }
      return false;
    }
    function parseArray() {
      if (text2[i] === "[") {
        output += "[";
        i++;
        parseWhitespaceAndSkipComments();
        if (skipCharacter(",")) {
          parseWhitespaceAndSkipComments();
        }
        let initial = true;
        while (i < text2.length && text2[i] !== "]") {
          if (!initial) {
            const processedComma2 = parseCharacter(",");
            if (!processedComma2) {
              output = insertBeforeLastWhitespace(output, ",");
            }
          }
          skipEllipsis();
          const processedValue = parseValue();
          if (!processedValue) {
            if (!initial) {
              output = stripLastOccurrence(output, ",");
            }
            break;
          }
          initial = false;
        }
        if (text2[i] === "]") {
          output += "]";
          i++;
        } else {
          output = insertBeforeLastWhitespace(output, "]");
        }
        return true;
      }
      return false;
    }
    function parseNewlineDelimitedJSON() {
      let initial = true;
      let processedValue = true;
      while (processedValue) {
        if (!initial) {
          const processedComma2 = parseCharacter(",");
          if (!processedComma2) {
            output = insertBeforeLastWhitespace(output, ",");
          }
        } else {
          initial = false;
        }
        processedValue = parseValue();
      }
      if (!processedValue) {
        output = stripLastOccurrence(output, ",");
      }
      output = `[
${output}
]`;
    }
    function parseString() {
      let stopAtDelimiter = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : false;
      let stopAtIndex = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : -1;
      const skipEscapeChars = text2[i] === "\\";
      if (skipEscapeChars) {
        i++;
        if (!isQuote(text2[i])) {
          throwUnexpectedCharacter();
        }
      }
      const openEntity = text2[i] === "&" ? matchHtmlEntity(text2.slice(i, i + maxHtmlEntityLength)) : null;
      const openedByEntity = isDoubleQuoteEntity(openEntity) || isSingleQuoteEntity(openEntity);
      if (isQuote(text2[i]) || openedByEntity) {
        const isEndQuote = isDoubleQuote(text2[i]) ? isDoubleQuote : isSingleQuote(text2[i]) ? isSingleQuote : isSingleQuoteLike(text2[i]) ? isSingleQuoteLike : isDoubleQuoteLike;
        const iBefore = i;
        const oBefore = output.length;
        let str = '"';
        i += openedByEntity && openEntity ? openEntity.length : 1;
        while (true) {
          if (i >= text2.length) {
            const iPrev = prevNonWhitespaceIndex(i - 1);
            if (!stopAtDelimiter && isDelimiter(text2.charAt(iPrev))) {
              i = iBefore;
              output = output.substring(0, oBefore);
              return parseString(true);
            }
            str = insertBeforeLastWhitespace(str, '"');
            output += str;
            return true;
          }
          if (i === stopAtIndex) {
            str = insertBeforeLastWhitespace(str, '"');
            output += str;
            return true;
          }
          const entity = openedByEntity && text2[i] === "&" ? matchHtmlEntity(text2.slice(i, i + maxHtmlEntityLength)) : null;
          const isEnd = entity && openEntity ? entity.char === openEntity.char : isEndQuote(text2[i]);
          if (isEnd) {
            const iQuote = i;
            const oQuote = str.length;
            str += '"';
            i += entity ? entity.length : 1;
            output += str;
            parseWhitespaceAndSkipComments(false);
            if (stopAtDelimiter || i >= text2.length || isDelimiter(text2[i]) && // only count the brackets inside the string when actually needed,
            // i.e. when the quote is directly followed by a closing bracket
            !isInsideUnclosedBracket(str, text2[i]) || isQuote(text2[i]) && !nextQuoteIsEndQuote(i) || isDigit(text2[i])) {
              parseConcatenatedString();
              return true;
            }
            if (text2[i] === "\\") {
              throwUnexpectedCharacter();
            }
            const iPrevChar = prevNonWhitespaceIndex(iQuote - 1);
            const prevChar = text2.charAt(iPrevChar);
            if (prevChar === ",") {
              i = iBefore;
              output = output.substring(0, oBefore);
              return parseString(false, iPrevChar);
            }
            if (isDelimiter(prevChar)) {
              i = iBefore;
              output = output.substring(0, oBefore);
              return parseString(true);
            }
            output = output.substring(0, oBefore);
            i = iQuote + (entity ? entity.length : 1);
            str = `${str.substring(0, oQuote)}\\${str.substring(oQuote)}`;
          } else if (stopAtDelimiter && isUnquotedStringDelimiter(text2[i])) {
            if (text2[i - 1] === ":" && regexUrlStart.test(text2.substring(iBefore + 1, i + 2))) {
              while (i < text2.length && regexUrlChar.test(text2[i])) {
                str += text2[i];
                i++;
              }
            }
            str = insertBeforeLastWhitespace(str, '"');
            output += str;
            parseConcatenatedString();
            return true;
          } else if (entity) {
            const char = entity.char;
            if (char === '"') {
              str += '\\"';
            } else if (isControlCharacter(char)) {
              str += controlCharacters[char];
            } else {
              str += char;
            }
            i += entity.length;
          } else if (text2[i] === "\\") {
            const char = text2.charAt(i + 1);
            const escapeChar = escapeCharacters[char];
            if (escapeChar !== void 0) {
              str += text2.slice(i, i + 2);
              i += 2;
            } else if (char === "u") {
              let j = 2;
              while (j < 6 && isHex(text2[i + j])) {
                j++;
              }
              if (j === 6) {
                str += text2.slice(i, i + 6);
                i += 6;
              } else if (i + j >= text2.length) {
                i = text2.length;
              } else {
                throwInvalidUnicodeCharacter();
              }
            } else if (char === "\n") {
              str += "\\n";
              i += 2;
            } else {
              str += char;
              i += 2;
            }
          } else {
            const char = text2.charAt(i);
            if (char === '"' && text2[i - 1] !== "\\") {
              str += `\\${char}`;
              i++;
            } else if (isControlCharacter(char)) {
              str += controlCharacters[char];
              i++;
            } else {
              if (!isValidStringCharacter(char)) {
                throwInvalidCharacter(char);
              }
              str += char;
              i++;
            }
          }
          if (skipEscapeChars) {
            skipEscapeCharacter();
          }
        }
      }
      return false;
    }
    function parseConcatenatedString() {
      let processed2 = false;
      parseWhitespaceAndSkipComments();
      while (text2[i] === "+") {
        processed2 = true;
        i++;
        parseWhitespaceAndSkipComments();
        output = stripLastOccurrence(output, '"', true);
        const start = output.length;
        const parsedStr = parseString();
        if (parsedStr) {
          output = removeAtIndex(output, start, 1);
        } else {
          output = insertBeforeLastWhitespace(output, '"');
        }
      }
      return processed2;
    }
    function parseNumber() {
      const start = i;
      let num = "";
      let invalid = false;
      if (text2[i] === "-") {
        num += text2[i];
        i++;
        if (!isDigit(text2[i]) && atEndOfNumber()) {
          num += "0";
        }
      }
      if (text2[i] === "0" && isDigit(text2[i + 1])) {
        invalid = true;
      }
      while (isDigit(text2[i])) {
        num += text2[i];
        i++;
      }
      if (text2[i] === ".") {
        if (num === "" || num === "-") {
          num += "0";
        }
        num += text2[i];
        i++;
        if (!isDigit(text2[i])) {
          num += "0";
        }
        while (isDigit(text2[i])) {
          num += text2[i];
          i++;
        }
      }
      if (i > start) {
        if (text2[i] === "e" || text2[i] === "E") {
          if (num === "-") {
            invalid = true;
          }
          num += text2[i];
          i++;
          if (text2[i] === "-" || text2[i] === "+") {
            num += text2[i];
            i++;
          }
          if (!isDigit(text2[i])) {
            num += "0";
          }
          while (isDigit(text2[i])) {
            num += text2[i];
            i++;
          }
        }
        if (!atEndOfNumber()) {
          i = start;
          return false;
        }
        output += invalid ? `"${text2.substring(start, i)}"` : num;
        return true;
      }
      return false;
    }
    function parseKeywords() {
      return parseKeyword("true", "true") || parseKeyword("false", "false") || parseKeyword("null", "null") || // repair Python keywords True, False, None
      parseKeyword("True", "true") || parseKeyword("False", "false") || parseKeyword("None", "null");
    }
    function parseKeyword(name, value) {
      if (text2.slice(i, i + name.length) === name && !isFunctionNameChar(text2[i + name.length])) {
        output += value;
        i += name.length;
        return true;
      }
      return false;
    }
    function parseUnquotedString(isKey) {
      const start = i;
      if (isFunctionNameCharStart(text2[i])) {
        while (i < text2.length && isFunctionNameChar(text2[i])) {
          i++;
        }
        let j = i;
        while (isWhitespace(text2, j)) {
          j++;
        }
        if (text2[j] === "(") {
          i = j + 1;
          parseValue();
          if (text2[i] === ")") {
            i++;
            if (text2[i] === ";") {
              i++;
            }
          }
          return true;
        }
      }
      while (i < text2.length && !isUnquotedStringDelimiter(text2[i]) && !isQuote(text2[i]) && (!isKey || text2[i] !== ":")) {
        i++;
      }
      if (text2[i - 1] === ":" && regexUrlStart.test(text2.substring(start, i + 2))) {
        while (i < text2.length && regexUrlChar.test(text2[i])) {
          i++;
        }
      }
      if (i > start) {
        while (isWhitespace(text2, i - 1) && i > 0) {
          i--;
        }
        const symbol = text2.slice(start, i);
        output += symbol === "undefined" ? "null" : JSON.stringify(symbol);
        if (text2[i] === '"') {
          i++;
        }
        return true;
      }
    }
    function parseRegex() {
      if (text2[i] === "/") {
        const start = i;
        i++;
        while (i < text2.length && (text2[i] !== "/" || text2[i - 1] === "\\")) {
          i++;
        }
        i++;
        output += JSON.stringify(text2.substring(start, i));
        return true;
      }
    }
    function prevNonWhitespaceIndex(start) {
      let prev = start;
      while (prev > 0 && isWhitespace(text2, prev)) {
        prev--;
      }
      return prev;
    }
    function nextQuoteIsEndQuote(index) {
      let next = index + 1;
      while (next < text2.length && isWhitespace(text2, next)) {
        next++;
      }
      return next >= text2.length || isDelimiter(text2[next]);
    }
    function atEndOfNumber() {
      return i >= text2.length || isDelimiter(text2[i]) || isWhitespace(text2, i);
    }
    function throwInvalidCharacter(char) {
      throw new JSONRepairError(`Invalid character ${JSON.stringify(char)}`, i);
    }
    function throwUnexpectedCharacter() {
      throw new JSONRepairError(`Unexpected character ${JSON.stringify(text2[i])}`, i);
    }
    function throwUnexpectedEnd() {
      throw new JSONRepairError("Unexpected end of json string", text2.length);
    }
    function throwObjectKeyExpected() {
      throw new JSONRepairError("Object key expected", i);
    }
    function throwColonExpected() {
      throw new JSONRepairError("Colon expected", i);
    }
    function throwInvalidUnicodeCharacter() {
      const chars = text2.slice(i, i + 6);
      throw new JSONRepairError(`Invalid unicode character "${chars}"`, i);
    }
  }
  function atEndOfBlockComment(text2, i) {
    return text2[i] === "*" && text2[i + 1] === "/";
  }

  // src/services/jsonText.ts
  function fenced(raw) {
    const trimmed = raw.trim();
    const match = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    return (match?.[1] ?? trimmed).trim();
  }
  function objectSlice(body) {
    const start = body.indexOf("{");
    const end = body.lastIndexOf("}");
    if (start >= 0 && end > start) return body.slice(start, end + 1);
    return body;
  }
  function parseModelJson(raw) {
    const slice = objectSlice(fenced(raw));
    if (!slice.includes("{")) return { ok: false, error: "No JSON object found in the model output." };
    try {
      return { ok: true, value: JSON.parse(slice), text: slice, repaired: false };
    } catch (strictError) {
      try {
        const repaired = jsonrepair(slice);
        return { ok: true, value: JSON.parse(repaired), text: repaired, repaired: true };
      } catch {
        const message = strictError instanceof Error ? strictError.message : "The JSON could not be parsed.";
        return { ok: false, error: message };
      }
    }
  }

  // src/services/validateReport.ts
  function isRecord2(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
  function extractJsonValue(raw) {
    const parsed2 = parseModelJson(raw);
    if (!parsed2.ok) throw new Error(parsed2.error);
    return parsed2.value;
  }
  function clip2(value, max) {
    return typeof value === "string" ? value.trim().slice(0, max) : "";
  }
  function citationsFrom(value, errors, path) {
    if (!Array.isArray(value)) {
      errors.push(`${path} needs a citations array.`);
      return [];
    }
    return value.flatMap((item) => {
      if (typeof item === "string") return [{ quote: item.slice(0, 500), location: "Record" }];
      if (!isRecord2(item)) return [];
      const quote = clip2(item.quote ?? item.passage ?? item.text, 500);
      if (!quote) return [];
      return [{ quote, location: clip2(item.location ?? item.where ?? "Record", 160) || "Record" }];
    });
  }
  function stringArray(value, maxItems, maxLen) {
    if (!Array.isArray(value)) return [];
    return value.map((item) => clip2(item, maxLen)).filter(Boolean).slice(0, maxItems);
  }
  function validateReport(input, criteria) {
    const errors = [];
    if (!isRecord2(input)) return { ok: false, errors: ["The model output was not a JSON object."] };
    const summary = clip2(input.summary, 4e3);
    if (summary.length < 40) errors.push("summary must be at least 40 characters.");
    const scoresRaw = Array.isArray(input.scores) ? input.scores : [];
    const scores = criteria.criteria.map((criterion) => {
      const found = scoresRaw.find((item) => isRecord2(item) && clip2(item.criterionId ?? item.id, 80) === criterion.id);
      if (!isRecord2(found)) {
        errors.push(`Missing score for ${criterion.id}.`);
        return null;
      }
      const score = Number(found.score);
      if (!Number.isInteger(score) || score < criteria.scale.min || score > criteria.scale.max) {
        errors.push(`${criterion.id} score must be an integer from ${criteria.scale.min} to ${criteria.scale.max}.`);
      }
      const rationale = clip2(found.rationale ?? found.reason, 2e3);
      if (rationale.length < 20) errors.push(`${criterion.id} rationale is too short.`);
      const citations = citationsFrom(found.citations ?? found.quotes, errors, criterion.id);
      if (citations.length === 0) errors.push(`${criterion.id} needs at least one citation.`);
      const confidenceRaw = clip2(found.confidence, 16).toLowerCase();
      const confidence = confidenceRaw === "low" || confidenceRaw === "med" || confidenceRaw === "medium" || confidenceRaw === "high" ? confidenceRaw : "";
      if (criteria.reportSchema === "0.2" && !confidence) errors.push(`${criterion.id} needs a confidence of low, medium, or high.`);
      const normalizedConfidence = confidence === "high" ? "high" : confidence === "medium" || confidence === "med" ? "medium" : confidence === "low" ? "low" : void 0;
      return { criterionId: criterion.id, score, rationale, citations, confidence: normalizedConfidence };
    });
    const recommendationRaw = clip2(input.recommendation, 120).toLowerCase();
    const recommendation = criteria.recommendationCategories.find(
      (item) => item.id.toLowerCase() === recommendationRaw || item.label.toLowerCase() === recommendationRaw
    )?.id ?? "";
    if (!recommendation) errors.push("recommendation must be one of the criteria category ids.");
    const strengths = stringArray(input.strengths, 6, 400);
    const questions = stringArray(input.questionsForAuthors ?? input.questions, 6, 400);
    const nextSteps = stringArray(input.suggestedNextSteps ?? input.nextSteps, 6, 400);
    const minorIssues = stringArray(input.minorIssues ?? input.minor_issues, 8, 400);
    if (strengths.length === 0) errors.push("Add at least one strength.");
    if (questions.length === 0) errors.push("Add at least one question for the authors.");
    if (nextSteps.length === 0) errors.push("Add at least one suggested next step.");
    const majorRaw = Array.isArray(input.majorIssues) ? input.majorIssues : Array.isArray(input.major_issues) ? input.major_issues : [];
    const known = new Set(criteria.criteria.map((item) => item.id));
    const majorIssues = majorRaw.slice(0, 6).flatMap((item) => {
      if (typeof item === "string") {
        return [{ criterionId: criteria.criteria[0]?.id ?? "clarity", claim: item.slice(0, 500), quotedPassage: "", reason: item.slice(0, 800) }];
      }
      if (!isRecord2(item)) return [];
      const criterionId = clip2(item.criterionId ?? item.criterion, 80);
      if (criterionId && !known.has(criterionId)) errors.push(`Unknown criterion on a major issue: ${criterionId}.`);
      const claim = clip2(item.claim ?? item.summary ?? item.issue, 500);
      if (!claim) return [];
      return [
        {
          criterionId: known.has(criterionId) ? criterionId : criteria.criteria[0]?.id ?? "clarity",
          claim,
          quotedPassage: clip2(item.quotedPassage ?? item.quote ?? "", 500),
          reason: clip2(item.reason ?? item.why ?? claim, 800)
        }
      ];
    });
    const includeValue = criteria.criteria.some((criterion) => criterion.id === "estimated-value");
    const v2 = criteria.reportSchema === "0.2" ? readV2(input, errors, includeValue) : {};
    if (errors.length || scores.some((score) => score === null)) return { ok: false, errors };
    const ready = scores.filter((score) => score !== null);
    const overall = weightedMean(ready, criteria);
    const idea = weightedMean(ready, criteria, criteria.ideaCriterionIds);
    if (overall === null || idea === null) return { ok: false, errors: ["Could not weight the scores."] };
    const statedRaw = Number(input.overallScore);
    const airFeedback = parseAirFeedback(input.air_feedback ?? input.airFeedback);
    const check = describeScoring({
      scores: ready,
      statedOverall: Number.isFinite(statedRaw) ? statedRaw : null,
      recommendation,
      criteria
    });
    return {
      ok: true,
      report: {
        summary,
        scores: ready.map((score) => ({ ...score, score: clamp(score.score, criteria.scale.min, criteria.scale.max) })),
        overallScore: overall,
        statedOverall: Number.isFinite(statedRaw) ? statedRaw : null,
        ideaScore: idea,
        recommendation,
        scale: check.scale,
        scoringCheck: check.scoringCheck,
        strengths,
        majorIssues,
        minorIssues,
        questionsForAuthors: questions,
        suggestedNextSteps: nextSteps,
        ...airFeedback ? { airFeedback } : {},
        ...v2
      }
    };
  }
  var ontologyClasses = /* @__PURE__ */ new Set(["physical-testable", "physical-not-yet-testable", "logical-mathematical", "metaphysical-philosophical"]);
  var physicsClasses = /* @__PURE__ */ new Set(["CONSISTENT", "EXTENDS", "CHALLENGES"]);
  var goalLevels = /* @__PURE__ */ new Set(["none", "indirect", "partial", "direct"]);
  function rangeFrom(value, fallbackUnit) {
    const record = isRecord2(value) ? value : {};
    return {
      low: clip2(record.low, 80) || "not estimated",
      central: clip2(record.central, 80) || "not estimated",
      high: clip2(record.high, 80) || "not estimated",
      unit: clip2(record.unit, 40) || fallbackUnit
    };
  }
  function readV2(input, errors, includeValue) {
    const ontologyClass = clip2(input.ontologyClass, 80);
    if (!ontologyClasses.has(ontologyClass)) errors.push("ontologyClass must be one of the four AIR classes.");
    const physicsRaw = isRecord2(input.physics) ? input.physics : null;
    const classification = clip2(physicsRaw?.classification, 20).toUpperCase();
    if (!physicsClasses.has(classification)) errors.push("physics.classification must be CONSISTENT, EXTENDS, or CHALLENGES.");
    const physics = {
      classification: physicsClasses.has(classification) ? classification : "CONSISTENT",
      laws: stringArray(physicsRaw?.laws, 8, 120),
      howAddressed: clip2(physicsRaw?.howAddressed, 800)
    };
    if (physics.laws.length === 0) errors.push("physics.laws needs at least one named law or an explicit 'none used'.");
    const simulationRaw = isRecord2(input.simulation) ? input.simulation : null;
    const reported = simulationRaw ? Number(simulationRaw.reported) : NaN;
    const passed = simulationRaw ? Number(simulationRaw.passed) : NaN;
    const simulation = {
      reported: Number.isInteger(reported) ? reported : null,
      passed: Number.isInteger(passed) ? passed : null,
      methods: clip2(simulationRaw?.methods, 400),
      inputsAvailable: Boolean(simulationRaw?.inputsAvailable)
    };
    if (!simulation.methods) errors.push("simulation.methods must say what was run, or that simulation does not apply.");
    const valueRaw = isRecord2(input.valueEstimate) ? input.valueEstimate : null;
    const valueEstimate = {
      confidence: "low",
      assumptions: stringArray(valueRaw?.assumptions, 8, 240),
      marketDisruption: clip2(valueRaw?.marketDisruption, 400) || "Not estimated from the record.",
      addressableMarket: rangeFrom(valueRaw?.addressableMarket, "not estimated"),
      units: rangeFrom(valueRaw?.units, "units"),
      valuePerUnit: rangeFrom(valueRaw?.valuePerUnit, "per unit"),
      overallBenefit: rangeFrom(valueRaw?.overallBenefit, "not estimated"),
      disclaimer: "AI estimate. Not a fact and not investment advice."
    };
    if (includeValue && valueEstimate.assumptions.length === 0) errors.push("valueEstimate.assumptions needs at least one assumption.");
    const goals = Array.isArray(input.goals) ? input.goals.flatMap((item) => {
      if (!isRecord2(item)) return [];
      const level = clip2(item.level, 20);
      if (!goalLevels.has(level)) return [];
      const goalId = clip2(item.goalId, 80);
      if (!goalId) return [];
      return [{ goalId, level, note: clip2(item.note, 300) }];
    }) : [];
    if (goals.length === 0) errors.push("goals must list a level for the documented public goals you considered.");
    return {
      ontologyClass: ontologyClasses.has(ontologyClass) ? ontologyClass : void 0,
      physics,
      simulation,
      ...includeValue ? { valueEstimate } : {},
      goals
    };
  }

  // src/services/webChat/protocol.ts
  var PAGE_SOURCE = "open-ai-peer-review";
  var EXTENSION_SOURCE = "air-web-chat-extension";
  var PROTOCOL_VERSION = 1;
  var WEB_CHAT_TIER = "free-web-chat";
  var WEB_CHAT_LABEL = "free web-chat, uncalibrated";
  var UNCALIBRATED_WEB_CHAT_TIER = "uncalibrated web-chat";
  var WEB_CHAT_SOURCE = "web-chat extension";

  // src/services/webChat/accept.ts
  function acceptWebChatResult(raw, criteria) {
    let parsed2;
    try {
      parsed2 = extractJsonValue(raw);
    } catch (error2) {
      return { ok: false, errors: [error2 instanceof Error ? error2.message : "No JSON object was found in the chat reply."] };
    }
    return validateReport(parsed2, criteria);
  }
  function scrubPrivateUrls(value, urls) {
    const needles = [...new Set(urls.map((url) => url.trim()).filter((url) => url.length > 8))];
    if (needles.length === 0) return value;
    const scrub = (text2) => needles.reduce((current, url) => current.split(url).join("[private link]"), text2);
    const walk = (item) => {
      if (typeof item === "string") return scrub(item);
      if (Array.isArray(item)) return item.map(walk);
      if (item && typeof item === "object") {
        return Object.fromEntries(Object.entries(item).map(([key, child]) => [key, walk(child)]));
      }
      return item;
    };
    return walk(value);
  }
  function draftWebChatReview(options) {
    const provider = webChatProvider(options.packet.providerId);
    return {
      id: options.id,
      sample: false,
      mock: false,
      doi: options.record.doi,
      recordId: options.record.id,
      conceptRecordId: options.record.conceptId,
      recordVersion: options.record.recordVersion,
      title: options.record.title,
      creators: options.record.creators,
      keywords: options.record.keywords,
      publicationDate: options.record.publicationDate,
      license: options.record.license,
      assessorId: provider?.assessorId ?? "web-chat",
      modelId: `${provider?.modelLabel ?? options.packet.providerId} (web chat, uncalibrated)`,
      provider: provider?.provider ?? "compatible",
      criteriaId: options.criteria.id,
      criteriaVersion: options.criteria.version,
      customCriteria: options.customCriteria,
      tier: WEB_CHAT_TIER,
      criterionProfile: options.packet.criterionProfile,
      report: scrubPrivateUrls(options.report, options.privateUrls),
      outputHash: options.outputHash,
      createdAt: options.createdAt,
      privateContextCount: options.privateContextCount
    };
  }

  // src/services/webChat/chatModel.ts
  var UNKNOWN_CHAT_MODEL = "unknown (site default)";
  function webChatModelId(siteLabel, detected) {
    const mode = (detected ?? "").trim() || UNKNOWN_CHAT_MODEL;
    return `${siteLabel} \xB7 ${mode} (web chat, uncalibrated)`;
  }

  // src/domain/conversationLinks.ts
  function conversationPromptBlock(links) {
    if (!links || links.length === 0) return "Private AI context links: none.";
    return [
      "Private AI context links supplied for this assessment only (unverified, not fetched by AIR).",
      "Do not score them. They do not change the ranking. They are not peer review.",
      "If you cannot open a link, say so. Never invent what a conversation said.",
      "A chat link cannot make an issue ADDRESSED. Only a quotation from the publication itself can do that.",
      ...links.map((link2) => `- ${link2.provider}: ${link2.url}${link2.note ? ` \u2014 ${link2.note}` : ""}`)
    ].join("\n");
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
  function isRecord3(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
  function parseGlobalGoals(input) {
    const errors = [];
    if (!isRecord3(input)) return { ok: false, errors: ["Goals file must be a JSON object."] };
    const version = typeof input.version === "string" ? input.version.trim() : "";
    if (!version) errors.push("version is required.");
    const goalsRaw = Array.isArray(input.goals) ? input.goals : [];
    const goals = [];
    const seen = /* @__PURE__ */ new Set();
    for (const item of goalsRaw) {
      if (!isRecord3(item)) continue;
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

  // src/services/zenodo.ts
  var ZenodoError = class extends Error {
    status;
    constructor(message, status2) {
      super(message);
      this.name = "ZenodoError";
      this.status = status2;
    }
  };
  function stripHtml(html) {
    return html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n\n").replace(/<\/(div|li|h[1-6]|tr)>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code))).replace(/\n{3,}/g, "\n\n").trim();
  }
  function extensionOf(name) {
    const match = name.toLowerCase().match(/\.([a-z0-9]+)$/);
    return match?.[1] ?? "";
  }
  function parseRecordRef(input) {
    const raw = input.trim().replace(/[)>.,]+$/, "");
    if (!raw) return null;
    const fromUrl = raw.match(/zenodo\.org\/(?:records|record|doi)\/(\d+)/i);
    if (fromUrl?.[1]) return { recordId: fromUrl[1], doi: `10.5281/zenodo.${fromUrl[1]}` };
    const fromDoi = raw.match(/10\.5281\/zenodo\.(\d+)/i);
    if (fromDoi?.[1]) return { recordId: fromDoi[1], doi: `10.5281/zenodo.${fromDoi[1]}` };
    const short = raw.match(/^zenodo\.(\d+)$/i);
    if (short?.[1]) return { recordId: short[1] };
    if (/^\d{5,}$/.test(raw)) return { recordId: raw };
    return null;
  }
  function asRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value) ? value : null;
  }
  function text(value) {
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    return typeof value === "string" ? value.trim() : "";
  }
  function orcidFrom(value) {
    const direct = text(value);
    if (direct) return direct.replace(/^https?:\/\/orcid\.org\//i, "");
    return void 0;
  }
  function creatorFrom(value) {
    const record = asRecord(value);
    if (!record) return null;
    const person = asRecord(record.person_or_org);
    if (person) {
      const identifiers = [...Array.isArray(person.identifiers) ? person.identifiers : [], ...Array.isArray(record.identifiers) ? record.identifiers : []];
      const orcid = identifiers.map((item) => asRecord(item)).find((item) => item && text(item.scheme).toLowerCase() === "orcid");
      const affiliations = Array.isArray(record.affiliations) ? record.affiliations.map((item) => text(asRecord(item)?.name)).filter(Boolean).join(", ") : "";
      const name2 = text(person.name) || [text(person.given_name), text(person.family_name)].filter(Boolean).join(" ");
      if (!name2) return null;
      return { name: name2, affiliation: affiliations || void 0, orcid: orcid ? orcidFrom(orcid.identifier) : void 0 };
    }
    const name = text(record.name);
    if (!name) return null;
    return {
      name,
      affiliation: text(record.affiliation) || void 0,
      orcid: orcidFrom(record.orcid)
    };
  }
  function fileFrom(value, recordId) {
    const record = asRecord(value);
    if (!record) return null;
    const key = text(record.key) || text(record.filename);
    if (!key) return null;
    const links = asRecord(record.links);
    const downloadUrl = text(links?.self) || text(links?.content) || `https://zenodo.org/api/records/${encodeURIComponent(recordId)}/files/${encodeURIComponent(key)}/content`;
    const size = Number(record.size ?? record.filesize ?? 0);
    return {
      key,
      size: Number.isFinite(size) ? size : 0,
      checksum: text(record.checksum) || void 0,
      downloadUrl,
      extension: extensionOf(key)
    };
  }
  function filesFrom(data, recordId) {
    const files = data.files;
    if (Array.isArray(files)) {
      return files.map((item) => fileFrom(item, recordId)).filter((item) => item !== null);
    }
    const modern = asRecord(files);
    const entries = modern ? asRecord(modern.entries) ?? modern : null;
    if (!entries) return [];
    return Object.values(entries).map((item) => fileFrom(item, recordId)).filter((item) => item !== null);
  }
  function normalizeZenodoRecord(input) {
    const data = asRecord(input);
    if (!data) throw new ZenodoError("Zenodo returned a record AIR could not read.", 500);
    const metadata = asRecord(data.metadata) ?? {};
    const id = text(data.id) || text(data.recid);
    if (!id) throw new ZenodoError("Zenodo returned a record without an id.", 500);
    const conceptId = text(data.conceptrecid) || text(asRecord(data.parent)?.id) || id;
    const doi = text(data.doi) || text(metadata.doi) || `10.5281/zenodo.${id}`;
    const conceptDoi = text(data.conceptdoi) || `10.5281/zenodo.${conceptId}`;
    const descriptionHtml = text(metadata.description);
    const creators = (Array.isArray(metadata.creators) ? metadata.creators : []).map(creatorFrom).filter((item) => item !== null);
    const keywords = [
      ...Array.isArray(metadata.keywords) ? metadata.keywords.map(text) : [],
      ...Array.isArray(metadata.subjects) ? metadata.subjects.map((item) => text(asRecord(item)?.title) || text(item)) : []
    ].filter(Boolean);
    const version = text(metadata.version);
    const publicationDate = text(metadata.publication_date) || text(data.created).slice(0, 10);
    const license = text(asRecord(metadata.license)?.id) || text(asRecord(Array.isArray(metadata.rights) ? metadata.rights[0] : void 0)?.id) || text(asRecord(Array.isArray(metadata.rights) ? metadata.rights[0] : void 0)?.title);
    const relatedRaw = Array.isArray(metadata.related_identifiers) ? metadata.related_identifiers : [];
    const related = relatedRaw.flatMap((item) => {
      const record = asRecord(item);
      if (!record || !text(record.identifier)) return [];
      return [{ identifier: text(record.identifier), relation: text(record.relation) || "related", scheme: text(record.scheme) || void 0 }];
    });
    const resource = asRecord(metadata.resource_type);
    const accessModern = asRecord(data.access);
    const accessRight = text(metadata.access_right);
    const access = accessModern ? { record: text(accessModern.record) || "public", files: text(accessModern.files) || "public" } : { record: accessRight === "closed" ? "restricted" : "public", files: accessRight && accessRight !== "open" ? accessRight : "public" };
    const links = asRecord(data.links);
    const files = filesFrom(data, id).sort((a, b) => a.key.localeCompare(b.key));
    return {
      id,
      conceptId,
      doi,
      conceptDoi,
      title: text(metadata.title) || text(data.title) || "Untitled Zenodo record",
      creators,
      descriptionHtml,
      description: stripHtml(descriptionHtml),
      keywords: [...new Set(keywords)],
      version,
      recordVersion: version || `${id}@${publicationDate || text(data.modified).slice(0, 10) || "undated"}`,
      license,
      publicationDate,
      related,
      resourceType: text(resource?.title) || text(metadata.resource_type) || "Record",
      access,
      files,
      htmlUrl: text(links?.self_html) || text(links?.html) || `https://zenodo.org/records/${id}`,
      modified: text(data.modified) || void 0
    };
  }

  // src/services/prompts.ts
  function reviewSystemPrompt(criteria) {
    return [
      "You are an AIR reviewer. Return one JSON object and nothing else.",
      "Judge the work on its logic and evidence. Do not score author credentials, affiliations, reputation, or identity. If those appear, ignore them.",
      "Be specific and kind. Every criticism needs a way to resolve it.",
      "Quote only passages that appear in the text you were given. Do not invent page numbers, results, or citations.",
      `Score every criterion with an integer from ${criteria.scale.min} to ${criteria.scale.max}.`,
      'Include air_feedback about AIR itself. Give at least one concrete, honest item: an unclear or misfitting criterion, a profile that does not fit, missing context or files, a prompt problem, a rubric suggestion, or a correction to your own scoring. If a field does not apply, write "none" and the reason, for example "none: the data profile matched this record". Never use an empty string. This note must not change any score.',
      criteria.scale.max >= 100 ? "The board is out of 100. AIR weights the criterion scores itself. If you include overallScore, keep it within 10 points of that weighted total. recommendation must match the band: accept or encourage from 80 (accept means sound as it stands; encourage means the idea is ready to build on), revise from 60, major-revision from 40, otherwise not-ready." : "",
      criteria.criteria.some((criterion) => criterion.id === "estimated-value") ? "" : "This profile does not score estimated project value. Omit valueEstimate. Use accept when the work is sound as it stands.",
      "Image pixels are not read. When the text says Figures not read, say so on availability. Do not treat an unseen figure as missing data unless the claim needs the image itself.",
      criteria.reportSchema === "0.2" ? [
        "On every score set confidence to low, medium, or high. Untested is not the same as wrong. A CHALLENGES physics class is not an automatic fail.",
        'A simulation or verification run means a named script, an audit table, or a numerical cross-check. Say which of those the record contains. A sentence that only claims "we simulated" is not a completed run.',
        "Mark a global goal direct only when the record gives a bounded quantitative contribution, with a number and a unit or a range. A TRL 1\u20133 concept without that estimate is at most partial.",
        "Under consistency, look for numbers carried over from an earlier version, an erratum, or a supplement after the text changed. Flag a stale figure.",
        "Quote only text marked as the paper or as VERBATIM EXCERPTS. A block labelled AI SECTION SUMMARIES is not the paper. Do not present a summary sentence as a quotation."
      ].join("\n") : "",
      "Principles:",
      ...criteria.principles.map((principle) => `- ${principle}`)
    ].join("\n");
  }
  function publicDoiUrl(doi) {
    const cleaned = (doi ?? "").trim().replace(/^https?:\/\/doi\.org\//i, "").replace(/^doi:/i, "");
    if (!/^10\.\S+/.test(cleaned)) return null;
    return `https://doi.org/${cleaned}`;
  }
  function zenodoRecordsUrl(id) {
    const cleaned = (id ?? "").trim();
    if (!/^\d+$/.test(cleaned)) return null;
    return `https://zenodo.org/records/${cleaned}`;
  }
  function sourceRecordBlock(record) {
    const versionUrl = zenodoRecordsUrl(record.id) || (record.htmlUrl.startsWith("https://zenodo.org/records/") ? record.htmlUrl : "");
    const doiUrl = publicDoiUrl(record.doi);
    const conceptUrl = zenodoRecordsUrl(record.conceptId);
    const conceptDoiUrl = publicDoiUrl(record.conceptDoi);
    const lines = [
      "Source record. These are the public record links. Cite them and use them to cross-check versions. They are not private chat links."
    ];
    if (versionUrl) lines.push(`This version: ${versionUrl}`);
    if (doiUrl) lines.push(`DOI: ${doiUrl}`);
    if (conceptUrl) lines.push(`Concept record (all versions): ${conceptUrl}`);
    if (conceptDoiUrl && conceptDoiUrl !== doiUrl) lines.push(`Concept DOI: ${conceptDoiUrl}`);
    if (lines.length === 1) return "";
    return lines.join("\n");
  }
  function reviewUserPrompt(record, criteria, packet, conversations = []) {
    const schema = {
      summary: "string, 80-180 words",
      scores: criteria.criteria.map((criterion) => ({
        criterionId: criterion.id,
        score: `${criteria.scale.min}-${criteria.scale.max}`,
        rationale: "string citing the record",
        citations: [{ quote: "verbatim", location: "file or section" }],
        ...criteria.reportSchema === "0.2" ? { confidence: "low | medium | high" } : {}
      })),
      ...criteria.reportSchema === "0.2" ? {
        ontologyClass: "physical-testable | physical-not-yet-testable | logical-mathematical | metaphysical-philosophical",
        physics: { classification: "CONSISTENT | EXTENDS | CHALLENGES", laws: ["named law"], howAddressed: "string" },
        simulation: { reported: "integer or null", passed: "integer or null", methods: "string", inputsAvailable: false },
        ...criteria.criteria.some((criterion) => criterion.id === "estimated-value") ? {
          valueEstimate: {
            assumptions: ["string"],
            marketDisruption: "string",
            addressableMarket: { low: "string", central: "string", high: "string", unit: "string" },
            units: { low: "string", central: "string", high: "string", unit: "string" },
            valuePerUnit: { low: "string", central: "string", high: "string", unit: "string" },
            overallBenefit: { low: "string", central: "string", high: "string", unit: "string" }
          }
        } : {},
        goals: globalGoals.goals.map((goal) => ({ goalId: goal.id, level: "none | indirect | partial | direct", note: "string" }))
      } : {},
      overallScore: criteria.scale.max >= 100 ? "integer 0-100, within 10 of the weighted criterion total" : `number from ${criteria.scale.min} to ${criteria.scale.max}`,
      recommendation: criteria.recommendationCategories.map((item) => item.id).join(" | "),
      strengths: ["string"],
      majorIssues: [{ criterionId: "id", claim: "what is wrong", quotedPassage: "verbatim or empty", reason: "why it matters and how to fix it" }],
      minorIssues: ["string"],
      questionsForAuthors: ["string"],
      suggestedNextSteps: ["string"],
      air_feedback: {
        criteria: 'A concrete note, or "none" with a reason. Never an empty string.',
        profile: 'A concrete note, or "none" with a reason. Never an empty string.',
        missingContext: 'A concrete note, or "none" with a reason. Never an empty string.',
        prompt: 'A concrete note, or "none" with a reason. Never an empty string.',
        rubric: 'A concrete note, or "none" with a reason. Never an empty string.',
        scoringProcess: 'A concrete note, or "none" with a reason. Never an empty string. Do not change the scores to match this note.'
      }
    };
    const guide = criteria.criteria.map((criterion) => {
      const bands = criterion.bands?.map((band) => `${band.min}-${band.max}: ${band.label}`).join(" ") ?? "";
      return `${criterion.id} (weight ${criterion.weight}): ${criterion.name}. ${criterion.description} Guidance: ${criterion.guidance} ${bands}`;
    }).join("\n");
    const goalsGuide = criteria.reportSchema === "0.2" ? ["Documented goals you may score against. Do not add goals that are not in this list.", ...globalGoals.goals.map((goal) => `- ${goal.id}: ${goal.statement} (${goal.sourceUrl})`)].join("\n") : "";
    return [
      `Record: ${record.title}`,
      `DOI: ${record.doi}`,
      `Version: ${record.recordVersion}`,
      `Date: ${record.publicationDate}`,
      `License: ${record.license || "unspecified"}`,
      `Keywords: ${record.keywords.join(", ") || "none"}`,
      "",
      sourceRecordBlock(record),
      "",
      "Criteria:",
      guide,
      goalsGuide,
      "",
      "Return JSON with this shape:",
      JSON.stringify(schema),
      "",
      conversationPromptBlock(conversations),
      "",
      "Use majorIssues only for failure modes a reviser must face. Leave it empty if nothing rises to that level.",
      'Fill air_feedback. At least one field must be a concrete observation, or "none" plus a reason. Do not return empty strings.',
      "",
      "Record text:",
      packet
    ].join("\n");
  }

  // src/services/webChat/paperText.ts
  var PAPER_TEXT_ORIGIN = "https://morgansmart-alt.github.io/open-ai-peer-review";
  function paperTextRecordId(record) {
    const id = (record.id ?? "").trim();
    if (/^\d+$/.test(id)) return id;
    const doi = (record.doi ?? "").replace(/^https?:\/\/doi\.org\//i, "");
    return doi.match(/zenodo\.(\d+)$/i)?.[1] ?? "";
  }
  function paperTextPath(recordId) {
    return `/paper/${encodeURIComponent(recordId)}/text`;
  }
  function paperTextUrl(recordId, origin = PAPER_TEXT_ORIGIN) {
    const base = origin.replace(/\/$/, "");
    return `${base}${paperTextPath(recordId)}`;
  }
  function isPublicPaperTextUrl(url) {
    try {
      const parsed2 = new URL(url);
      if (parsed2.origin !== "https://morgansmart-alt.github.io") return false;
      return /\/open-ai-peer-review\/paper\/[^/]+\/text\/?$/.test(parsed2.pathname);
    } catch {
      return false;
    }
  }

  // src/services/webChat/packet.ts
  var WEB_CHAT_PDF_PAGES = 400;
  var WEB_CHAT_FILE_CHARS = 15e5;
  function buildWebChatPacket(options) {
    const criteria = readingCriteria(options.criteria, options.criterionProfile, options.customCriteria ?? false);
    const files = options.documents.filter((document2) => document2.text.trim()).map((document2) => ({
      filename: document2.filename,
      text: document2.text.length > WEB_CHAT_FILE_CHARS ? `${document2.text.slice(0, WEB_CHAT_FILE_CHARS)}

[AIR stopped this file at ${WEB_CHAT_FILE_CHARS.toLocaleString("en-US")} characters.]` : document2.text
    }));
    if (files.length === 0 && options.record.description.trim()) {
      files.push({ filename: "description.txt", text: options.record.description.slice(0, WEB_CHAT_FILE_CHARS) });
    }
    const publicId = paperTextRecordId(options.record);
    const textUrl = options.textUrl ?? (options.useTextPage && publicId ? paperTextUrl(publicId) : "");
    return {
      version: 1,
      requestId: options.requestId,
      providerId: options.providerId,
      system: reviewSystemPrompt(criteria),
      instructions: reviewUserPrompt(
        options.record,
        criteria,
        "The paper is supplied separately as attached files or as earlier messages labelled AIR PAPER PART. Score that text. If a file is missing, say so. Do not invent passages.",
        options.conversations ?? []
      ),
      files,
      ...options.criterionProfile ? { criterionProfile: options.criterionProfile } : {},
      ...textUrl && isPublicPaperTextUrl(textUrl) ? { textUrl } : {}
    };
  }

  // src/services/webChat/reviewView.ts
  var SITE_LINKS = [
    { href: "https://grok.com/", label: "Grok" },
    { href: "https://gemini.google.com/app", label: "Gemini" },
    { href: "https://claude.ai/new", label: "Claude" },
    { href: "https://x.com/i/grok", label: "Grok on X" }
  ];
  function el(parent, tag, text2, className) {
    const node = document.createElement(tag);
    if (text2) node.textContent = text2;
    if (className) node.className = className;
    parent.append(node);
    return node;
  }
  function providerOptions(select, selected2) {
    const primary = new Set(primaryWebChatIds);
    const main = document.createElement("optgroup");
    main.label = "Start here";
    const more = document.createElement("optgroup");
    more.label = "Other chats";
    for (const provider of webChatProviders) {
      const option = document.createElement("option");
      option.value = provider.id;
      option.textContent = provider.label;
      option.selected = provider.id === selected2;
      (primary.has(provider.id) ? main : more).append(option);
    }
    select.append(main, more);
  }
  function renderReviewApp(root2, model, actions) {
    root2.replaceChildren();
    if (model.showOnboarding) {
      const welcome = el(root2, "section");
      el(welcome, "h1", "Review a paper");
      el(welcome, "p", "Two steps. You do the first one once.");
      const list = el(welcome, "ol");
      const signIn = el(list, "li");
      el(signIn, "p", "Sign in to a chat you already use. Open one of these and sign in there. This panel never sees your password.");
      const links = el(signIn, "p", void 0, "links");
      for (const site of SITE_LINKS) {
        const anchor = el(links, "a", site.label);
        anchor.href = site.href;
        anchor.target = "_blank";
        anchor.rel = "noopener noreferrer";
      }
      const second = el(list, "li");
      el(second, "p", "Come back here. Choose that chat, add your paper, and click Review my paper.");
      const done = el(welcome, "button", "I'm signed in", "primary");
      done.type = "button";
      done.id = "onboard-done";
      done.addEventListener("click", () => actions.onDismissOnboarding());
      return;
    }
    const form = el(root2, "section");
    el(form, "h1", "Review a paper");
    el(form, "p", "Pick a chat you are signed into. Add a PDF or a text file, or paste a Zenodo, DOI, or arXiv link. A chat tab opens in front of you.");
    const chatLabel = el(form, "label", "Chat");
    const select = document.createElement("select");
    select.id = "provider";
    providerOptions(select, model.providerId);
    select.addEventListener("change", () => actions.onProvider(select.value));
    chatLabel.append(select);
    const profileLabel = el(form, "label", "Paper type");
    const profile = document.createElement("select");
    profile.id = "criterion-profile";
    const selectedProfile = model.profileId || "device";
    for (const item of CRITERION_PROFILES) {
      const option = document.createElement("option");
      option.value = item.id;
      option.textContent = item.label;
      option.selected = item.id === selectedProfile;
      profile.append(option);
    }
    profile.addEventListener("change", () => actions.onProfile?.(profile.value));
    profileLabel.append(profile);
    const profileNote = CRITERION_PROFILES.find((item) => item.id === selectedProfile);
    if (profileNote) el(form, "p", profileNote.summary, "note");
    const fileLabel = el(form, "label", "Paper");
    const input = document.createElement("input");
    input.id = "paper";
    input.type = "file";
    input.accept = ".pdf,.txt,.md,.markdown,.text,application/pdf,text/plain";
    input.addEventListener("change", () => {
      const file2 = input.files?.[0];
      if (file2) actions.onFile(file2);
    });
    fileLabel.append(input);
    if (model.fileName) el(form, "p", model.fileName, "file-name");
    const linkLabel = el(form, "label", "Publication link");
    const link2 = document.createElement("input");
    link2.id = "publication-link";
    link2.type = "url";
    link2.placeholder = "https://zenodo.org/records/\u2026";
    link2.value = model.link;
    link2.addEventListener("input", () => actions.onLink(link2.value));
    linkLabel.append(link2);
    const lookup2 = el(form, "button", "Look up this link", "quiet");
    lookup2.type = "button";
    lookup2.id = "lookup";
    lookup2.disabled = model.busy;
    lookup2.addEventListener("click", () => actions.onLookup());
    if (model.publication) {
      const preview = el(form, "div", void 0, "preview");
      preview.id = "publication-preview";
      el(preview, "p", model.publication.title, "score");
      el(preview, "p", model.publication.authors.join(", ") || "Authors were not listed");
      el(preview, "p", [model.publication.doi, model.publication.url].filter(Boolean).join(" \xB7 "), "note");
    }
    const defendLabel = el(form, "label", "Defend my paper");
    const defend2 = document.createElement("input");
    defend2.id = "defend";
    defend2.type = "checkbox";
    defend2.checked = model.defend;
    defend2.addEventListener("change", () => actions.onDefend(defend2.checked));
    defendLabel.prepend(defend2);
    const roundsLabel = el(form, "label", "Defence rounds");
    const rounds = document.createElement("select");
    rounds.id = "defence-rounds";
    for (const count of [1, 2, 3]) {
      const option = document.createElement("option");
      option.value = String(count);
      option.textContent = String(count);
      option.selected = count === model.defenceRounds;
      rounds.append(option);
    }
    rounds.addEventListener("change", () => actions.onRounds(Number(rounds.value)));
    roundsLabel.append(rounds);
    const ready = Boolean(model.fileName || model.publication);
    const run2 = el(form, "button", model.busy ? "Working\u2026" : "Review my paper", "primary");
    run2.type = "button";
    run2.id = "review";
    run2.disabled = model.busy || !ready;
    run2.addEventListener("click", () => actions.onReview());
    if (model.busy) {
      const stop = el(form, "button", "Stop", "quiet");
      stop.type = "button";
      stop.id = "stop";
      stop.addEventListener("click", () => actions.onStop());
    }
    if (model.status) {
      const status2 = el(form, "p", model.status, "status");
      status2.id = "status";
      status2.setAttribute("role", "status");
    }
    if (model.error) {
      const error2 = el(form, "p", model.error, "error");
      error2.setAttribute("role", "alert");
    }
    if (model.result) {
      const card = el(form, "article", void 0, "result");
      card.id = "result";
      el(card, "p", model.result.label, "label");
      el(card, "h2", model.result.title);
      el(card, "p", `Blind score ${Math.round(model.result.overall)} out of 100 \xB7 ${model.result.recommendation}`, "score");
      if (model.result.model) {
        const line = el(card, "p", `Model: ${model.result.model}`, "note");
        line.id = "chat-model";
      }
      if (model.result.defendedOverall != null) {
        el(card, "p", `${model.result.defendedLabel || "after author defence"} ${Math.round(model.result.defendedOverall)} out of 100`, "score");
      }
      if (model.result.notice) {
        const note = el(card, "p", model.result.notice, "mismatch");
        note.id = "text-page-note";
      }
      if (model.result.mismatch) el(card, "p", model.result.mismatch, "mismatch");
      el(card, "p", model.result.summary);
      if (model.result.scores && model.result.scores.length > 0) {
        const list = el(card, "ul");
        list.id = "criterion-scores";
        for (const score of model.result.scores) {
          el(list, "li", `${score.criterionId}: ${Math.round(score.score)}`);
        }
      }
      if (model.result.feedback && model.result.feedback.length > 0) {
        const details = el(card, "details");
        details.id = "air-feedback";
        const summary = el(details, "summary", "Feedback on AIR");
        summary.id = "air-feedback-summary";
        for (const note of model.result.feedback) {
          el(details, "p", `${note.label}: ${note.text}`);
        }
      }
      el(card, "p", "This score stays in this browser until you send it. It is labelled free web-chat, uncalibrated.", "note");
    }
    if (model.history.length > 0) {
      el(form, "h2", "Saved on this browser");
      const history = el(form, "ul");
      history.id = "results";
      for (const item of model.history) {
        const row = el(history, "li");
        const box = document.createElement("input");
        box.type = "checkbox";
        box.checked = Boolean(item.selected);
        box.disabled = Boolean(item.mismatch);
        box.setAttribute("aria-label", `Select ${item.title}`);
        box.addEventListener("change", () => actions.onToggle(item.id));
        row.append(box, document.createTextNode(` ${item.title}`));
        const detail = [item.doi || item.url, item.site, item.model, item.createdAt ? item.createdAt.slice(0, 16).replace("T", " ") : "", `${Math.round(item.overall)} / 100`].filter(Boolean).join(" \xB7 ");
        el(row, "p", detail, "note");
        if (item.mismatch) el(row, "p", "Scoring mismatch, needs re-check. Not sent.", "mismatch");
        const send2 = el(row, "button", "Send to Global Good Idea leaderboard", "quiet");
        send2.type = "button";
        send2.disabled = Boolean(item.mismatch) || model.busy;
        send2.addEventListener("click", () => actions.onSend(item.id));
      }
      const sendSelected = el(form, "button", "Send selected", "quiet");
      sendSelected.type = "button";
      sendSelected.id = "send-selected";
      sendSelected.disabled = model.busy || !model.history.some((item) => item.selected && !item.mismatch);
      sendSelected.addEventListener("click", () => actions.onSendSelected());
      const save = el(form, "button", "Save a copy", "quiet");
      save.type = "button";
      save.id = "export";
      save.addEventListener("click", () => actions.onExport());
    }
  }

  // src/services/webChat/defence.ts
  var DEFENDED_LABEL = "after author defence";
  function defendedFromReply(raw) {
    const accepted = acceptWebChatResult(raw, officialCriteria);
    if (!accepted.ok) return { ok: false, error: accepted.errors[0] || "The defended score was not usable JSON." };
    const describedOk = accepted.report.scoringCheck?.mismatch !== true;
    if (!describedOk) return { ok: false, error: "The defended score clashes with its own weighted total." };
    return {
      ok: true,
      defended: {
        label: DEFENDED_LABEL,
        overallScore: accepted.report.overallScore,
        recommendation: accepted.report.recommendation,
        summary: accepted.report.summary,
        scores: accepted.report.scores.map((score) => ({ criterionId: score.criterionId, score: score.score }))
      }
    };
  }

  // src/services/webChat/publication.ts
  function classifyPublication(input) {
    const raw = input.trim();
    if (!raw) return { kind: "unknown" };
    const zenodo = parseRecordRef(raw);
    if (zenodo && /zenodo/i.test(raw)) {
      return { kind: "zenodo", recordId: zenodo.recordId, url: `https://zenodo.org/records/${zenodo.recordId}` };
    }
    const arxiv = raw.match(/arxiv\.org\/(?:abs|pdf)\/([0-9]{4}\.[0-9]{4,5})(?:v\d+)?(?:\.pdf)?/i) || raw.match(/^arxiv:([0-9]{4}\.[0-9]{4,5})(?:v\d+)?$/i);
    if (arxiv?.[1]) {
      const id = arxiv[1];
      return { kind: "arxiv", id, absUrl: `https://arxiv.org/abs/${id}`, pdfUrl: `https://arxiv.org/pdf/${id}.pdf` };
    }
    if (/^https?:\/\/doi\.org\/10\./i.test(raw) || /^10\.\d{4,}\/\S+$/i.test(raw)) {
      const doi = raw.replace(/^https?:\/\/doi\.org\//i, "");
      return { kind: "doi", doi, url: `https://doi.org/${doi}` };
    }
    if (/^https?:\/\/\S+\.pdf(?:\?\S*)?$/i.test(raw)) return { kind: "pdf", pdfUrl: raw };
    return { kind: "unknown" };
  }
  function previewFromZenodo(record) {
    const pdf = record.files.find((file2) => file2.extension === "pdf") ?? record.files.find((file2) => file2.downloadUrl);
    const filename = pdf?.key || "paper.pdf";
    return {
      title: record.title,
      authors: record.creators.map((creator) => creator.name).filter(Boolean),
      doi: record.doi,
      url: record.htmlUrl || `https://zenodo.org/records/${record.id}`,
      pdfUrl: pdf?.downloadUrl ?? "",
      filename,
      source: record
    };
  }
  function filenameFrom(url) {
    try {
      const name = decodeURIComponent(new URL(url).pathname.split("/").pop() || "");
      return name || "paper.pdf";
    } catch {
      return "paper.pdf";
    }
  }
  async function readJson(fetcher, url) {
    const response = await fetcher(url);
    if (!response.ok) throw new Error(`Could not open ${url} (${response.status}).`);
    return response.json();
  }
  function arxivPreview(xml, id) {
    const title = xml.match(/<entry>[\s\S]*?<title>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim() || `arXiv ${id}`;
    const authors = [...xml.matchAll(/<author>[\s\S]*?<name>([\s\S]*?)<\/name>/gi)].map((match) => match[1]?.replace(/\s+/g, " ").trim() || "").filter(Boolean);
    return {
      title,
      authors,
      doi: "",
      url: `https://arxiv.org/abs/${id}`,
      pdfUrl: `https://arxiv.org/pdf/${id}.pdf`,
      filename: `${id}.pdf`
    };
  }
  async function resolvePublication(input, fetcher) {
    const ref = classifyPublication(input);
    if (ref.kind === "unknown") throw new Error("Paste a Zenodo link, a DOI, an arXiv link, or a direct PDF link.");
    if (ref.kind === "zenodo") {
      const data = await readJson(fetcher, `https://zenodo.org/api/records/${encodeURIComponent(ref.recordId)}`);
      const preview = previewFromZenodo(normalizeZenodoRecord(data));
      if (!preview.pdfUrl) throw new Error("That Zenodo record has no file to read.");
      return preview;
    }
    if (ref.kind === "arxiv") {
      const response = await fetcher(`https://export.arxiv.org/api/query?id_list=${encodeURIComponent(ref.id)}`);
      if (!response.ok) throw new Error(`arXiv returned ${response.status}.`);
      return arxivPreview(await response.text(), ref.id);
    }
    if (ref.kind === "pdf") {
      return { title: filenameFrom(ref.pdfUrl), authors: [], doi: "", url: ref.pdfUrl, pdfUrl: ref.pdfUrl, filename: filenameFrom(ref.pdfUrl) };
    }
    const landed = await fetcher(ref.url, { redirect: "follow" });
    if (!landed.ok && landed.status !== 302 && landed.status !== 301) throw new Error(`doi.org returned ${landed.status}.`);
    const finalUrl = landed.url || ref.url;
    const next = classifyPublication(finalUrl);
    if (next.kind === "doi") throw new Error("That DOI did not lead to a Zenodo record, an arXiv paper, or a PDF.");
    return resolvePublication(finalUrl, fetcher);
  }

  // src/services/hash.ts
  function fnv(text2) {
    let hash = 2166136261;
    for (let index = 0; index < text2.length; index += 1) {
      hash ^= text2.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }
  async function sha256Hex(text2) {
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) return `fnv:${fnv(text2)}`;
    const digest = await subtle.digest("SHA-256", new TextEncoder().encode(text2));
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  function uid(prefix) {
    const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${fnv(String(Math.random()))}`;
    return `${prefix}_${random}`;
  }

  // src/services/webChat/standalone.ts
  var RESULT_STORAGE_KEY = "air-web-chat-results";
  var ONBOARD_STORAGE_KEY = "air-web-chat-seen";
  var EXPORT_SOURCE = "air-web-chat-extension";
  var RESULT_CAP = 30;
  var CHAT_SHARE = /https?:\/\/(?:www\.)?(?:share\.google\/aimode\/[^\s)"']+|chatgpt\.com\/share\/[^\s)"']+|chat\.openai\.com\/share\/[^\s)"']+|claude\.ai\/share\/[^\s)"']+|grok\.com\/share\/[^\s)"']+)/gi;
  function localPaperRecord(filename) {
    const title = filename.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim() || "Local paper";
    const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    return {
      id: "local",
      conceptId: "local",
      doi: "local-file",
      conceptDoi: "local-file",
      title,
      creators: [],
      description: "",
      descriptionHtml: "",
      keywords: [],
      version: "local",
      recordVersion: "local",
      license: "",
      publicationDate: today,
      related: [],
      resourceType: "publication",
      access: { record: "open", files: "open" },
      files: [],
      htmlUrl: ""
    };
  }
  function sourceRecordFromText(filename, text2) {
    const base = localPaperRecord(filename);
    const withoutChats = text2.replace(/https?:\/\/(?:www\.)?(?:share\.google|chatgpt\.com\/share|claude\.ai\/share|grok\.com\/share)\S+/gi, "");
    const recordIds = [...withoutChats.matchAll(/zenodo\.org\/records\/(\d+)/gi)].map((match) => match[1] ?? "").filter(Boolean);
    const dois = [...withoutChats.matchAll(/\b(10\.5281\/zenodo\.(\d+))\b/gi)].map((match) => ({ doi: match[1] ?? "", id: match[2] ?? "" }));
    const versionId = recordIds[0] || dois[0]?.id || "";
    const doi = dois[0]?.doi || (versionId ? `10.5281/zenodo.${versionId}` : "");
    if (!versionId && !doi) return null;
    const concept = withoutChats.match(/concept(?:recid|doi)?[:\s]+(?:10\.5281\/zenodo\.)?(\d{5,})/i)?.[1] ?? "";
    const conceptId = concept || versionId;
    return {
      ...base,
      id: versionId || base.id,
      conceptId: conceptId || base.conceptId,
      doi: doi || base.doi,
      conceptDoi: conceptId ? `10.5281/zenodo.${conceptId}` : doi || base.conceptDoi,
      htmlUrl: versionId ? `https://zenodo.org/records/${versionId}` : "",
      title: base.title
    };
  }
  function packetForLocalPaper(options) {
    const record = options.source ?? sourceRecordFromText(options.filename, options.text) ?? localPaperRecord(options.filename);
    return buildWebChatPacket({
      requestId: options.requestId,
      providerId: options.providerId,
      criteria: options.criteria,
      criterionProfile: options.criterionProfile,
      record,
      documents: [{ filename: options.filename, text: options.text }],
      useTextPage: Boolean(paperTextRecordId(record))
    });
  }
  function stripChatShareLinks(value) {
    const scrub = (text2) => text2.replace(CHAT_SHARE, "[private link]");
    const walk = (item) => {
      if (typeof item === "string") return scrub(item);
      if (Array.isArray(item)) return item.map(walk);
      if (item && typeof item === "object") {
        return Object.fromEntries(Object.entries(item).map(([key, child]) => [key, walk(child)]));
      }
      return item;
    };
    return walk(value);
  }
  async function storedLocalReview(options) {
    const record = localPaperRecord(options.filename);
    const report = stripChatShareLinks(scrubPrivateUrls(options.report, options.privateUrls ?? []));
    const modelHint = `${options.providerId} (web chat, uncalibrated)`;
    const review = draftWebChatReview({
      id: uid("review"),
      packet: {
        version: 1,
        requestId: "local",
        providerId: options.providerId,
        system: "",
        instructions: "local",
        files: []
      },
      report,
      record: {
        doi: record.doi,
        id: record.id,
        conceptId: record.conceptId,
        recordVersion: record.recordVersion,
        title: record.title,
        creators: [],
        keywords: [],
        publicationDate: record.publicationDate,
        license: record.license
      },
      criteria: options.criteria,
      customCriteria: false,
      outputHash: await sha256Hex(`${modelHint}
${JSON.stringify(report)}`),
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      privateUrls: [],
      privateContextCount: 0
    });
    return {
      ...review,
      tier: "uncalibrated web-chat",
      source: "web-chat extension",
      criterionProfile: options.criterionProfile || review.criterionProfile,
      doi: options.publication?.doi || review.doi,
      title: options.publication?.title || review.title,
      creators: options.publication?.authors ?? review.creators,
      paperUrl: options.publication?.url || review.paperUrl
    };
  }
  function appendResult(existing, next, cap = RESULT_CAP) {
    const key = `${(next.doi || next.paperUrl || "").toLowerCase()}|${next.modelId.toLowerCase()}`;
    const without = existing.filter((item) => item.id !== next.id && `${(item.doi || item.paperUrl || "").toLowerCase()}|${item.modelId.toLowerCase()}` !== key);
    return [next, ...without].slice(0, cap);
  }
  function exportBundle(reviews2) {
    const body = {
      source: EXPORT_SOURCE,
      version: 1,
      label: WEB_CHAT_LABEL,
      reviews: reviews2.map((review) => stripChatShareLinks(review))
    };
    return JSON.stringify(body, null, 2);
  }
  function resultCard(review) {
    const check = scoringMismatch(review);
    const feedback = hasAirFeedback(review.report.airFeedback) ? review.report.airFeedback : void 0;
    const labels = [
      { key: "criteria", label: "Criteria" },
      { key: "profile", label: "Profile" },
      { key: "missingContext", label: "Missing context or files" },
      { key: "prompt", label: "Prompt" },
      { key: "rubric", label: "Rubric" },
      { key: "scoringProcess", label: "Scoring process" }
    ];
    return {
      title: review.title,
      overall: review.report.overallScore,
      recommendation: review.report.recommendation,
      summary: review.report.summary,
      mismatch: check.mismatch ? `Scoring mismatch, needs re-check. ${check.reason ?? ""}`.trim() : null,
      label: WEB_CHAT_LABEL,
      defendedOverall: review.defended?.overallScore ?? null,
      defendedLabel: review.defended?.label ?? "",
      model: review.modelId,
      scores: review.report.scores.map((score) => ({ criterionId: score.criterionId, score: score.score })),
      feedback: feedback ? labels.map((item) => ({ label: item.label, text: feedback[item.key]?.trim() || "none" })) : [],
      notice: review.sourceNote ?? ""
    };
  }
  async function textFromPdfDocument(pdf, pageCap) {
    const cap = Math.max(1, pageCap);
    const limit = Math.min(pdf.numPages, cap);
    const parts = [];
    for (let pageNumber = 1; pageNumber <= limit; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const line = content.items.map((item) => item.str ?? "").join(" ").replace(/[ \t]{2,}/g, " ").trim();
      if (line) parts.push(line);
    }
    return {
      text: parts.join("\n\n"),
      note: pdf.numPages > cap ? `Read the first ${cap} of ${pdf.numPages} pages.` : void 0
    };
  }

  // src/services/webChat/submission.ts
  var SUBMIT_WINDOW_MS = 10 * 60 * 1e3;
  var WEB_CHAT_SUBMIT_URL = "https://lotswxboafsenmszijpf.supabase.co/functions/v1/submit-web-chat";
  var TOP_KEYS = /* @__PURE__ */ new Set(["source", "tier", "paper", "site", "model", "criteriaVersion", "criterionProfile", "scores", "summary", "overallScore", "recommendation", "createdAt", "defended", "airFeedback"]);
  var DEFENDED_KEYS = /* @__PURE__ */ new Set(["label", "overallScore", "recommendation", "summary", "scores"]);
  var PAPER_KEYS = /* @__PURE__ */ new Set(["title", "doi", "url"]);
  function isRecord4(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
  function clip3(value, max) {
    return typeof value === "string" ? value.trim().slice(0, max) : "";
  }
  function submissionFromReview(review, site) {
    const criteria = criteriaForReview(review);
    const checkScores = review.report.scores.map((score) => ({ criterionId: score.criterionId, score: score.score }));
    const described = describeScoring({
      scores: checkScores,
      statedOverall: review.report.overallScore,
      recommendation: review.report.recommendation,
      criteria
    });
    if (described.scoringCheck.mismatch) {
      return { ok: false, error: "Scoring mismatch, needs re-check. This score stays on this browser until the chat is run again." };
    }
    const paperKey = review.doi && review.doi !== "local-file" ? review.doi : review.paperUrl || review.doi;
    if (!paperKey) return { ok: false, error: "Add a DOI or a link before sending this score." };
    const summary = stripChatShareLinks(review.report.summary);
    const submission = {
      source: WEB_CHAT_SOURCE,
      tier: UNCALIBRATED_WEB_CHAT_TIER,
      paper: { title: review.title, doi: review.doi === "local-file" ? "" : review.doi, url: review.paperUrl || "" },
      site,
      model: review.modelId,
      criteriaVersion: review.criteriaVersion,
      ...review.criterionProfile ? { criterionProfile: review.criterionProfile } : {},
      scores: checkScores,
      summary,
      overallScore: review.report.overallScore,
      recommendation: review.report.recommendation,
      createdAt: review.createdAt,
      ...review.defended ? { defended: review.defended } : {},
      ...review.report.airFeedback ? { airFeedback: review.report.airFeedback } : {}
    };
    const checked = validateWebChatSubmission(submission, criteria);
    if (checked.ok) return { ok: true, submission: checked.submission };
    if (submission.defended) {
      const { defended: dropped, ...blind } = submission;
      void dropped;
      const retry = validateWebChatSubmission(blind, criteria);
      if (retry.ok) return { ok: true, submission: retry.submission };
    }
    return checked;
  }
  function validateWebChatSubmission(input, criteria = officialCriteria) {
    if (!isRecord4(input)) return { ok: false, error: "The score was not a JSON object." };
    for (const key of Object.keys(input)) {
      if (!TOP_KEYS.has(key)) return { ok: false, error: "The score included a field the board does not accept." };
    }
    if (input.source !== WEB_CHAT_SOURCE || input.tier !== UNCALIBRATED_WEB_CHAT_TIER) {
      return { ok: false, error: "Only an uncalibrated web-chat score can use this path." };
    }
    if (!isRecord4(input.paper)) return { ok: false, error: "The paper title and link are missing." };
    for (const key of Object.keys(input.paper)) {
      if (!PAPER_KEYS.has(key)) return { ok: false, error: "The paper field included extra text." };
    }
    const title = clip3(input.paper.title, 300);
    const doi = clip3(input.paper.doi, 300);
    const url = clip3(input.paper.url, 500);
    if (!title) return { ok: false, error: "The paper needs a title." };
    if (!doi && !url) return { ok: false, error: "The paper needs a DOI or a link." };
    const site = clip3(input.site, 80);
    const model = clip3(input.model, 160);
    if (!site || !model) return { ok: false, error: "The chat site and model name are missing." };
    const criteriaVersion = clip3(input.criteriaVersion, 40);
    if (!criteriaVersion.startsWith("0.2")) return { ok: false, error: "The board accepts AIR v0.2 scores." };
    const criterionProfile = clip3(input.criterionProfile, 40);
    if (!Array.isArray(input.scores)) return { ok: false, error: "The criterion scores are missing." };
    const scores = input.scores.map((item) => {
      if (!isRecord4(item)) return null;
      if (Object.keys(item).some((key) => key !== "criterionId" && key !== "score")) return null;
      const criterionId = clip3(item.criterionId, 80);
      const score = Number(item.score);
      return { criterionId, score };
    });
    if (scores.some((item) => item === null)) return { ok: false, error: "A criterion score had extra text." };
    const ready = scores.filter((item) => item !== null);
    const wanted = new Set(criteria.criteria.map((item) => item.id));
    if (ready.length !== wanted.size || ready.some((item) => !wanted.has(item.criterionId) || !Number.isInteger(item.score))) {
      return { ok: false, error: "Every criterion in this profile needs an integer score." };
    }
    const summary = stripChatShareLinks(clip3(input.summary, 4e3));
    if (summary.length < 40) return { ok: false, error: "The summary is too short." };
    if (/https?:\/\/(?:share\.google|chatgpt\.com\/share|claude\.ai\/share|grok\.com\/share)/i.test(summary)) {
      return { ok: false, error: "A private chat link was still in the summary." };
    }
    const overallScore = Number(input.overallScore);
    if (!Number.isInteger(overallScore)) return { ok: false, error: "The overall score must be an integer." };
    const recommendation = clip3(input.recommendation, 80);
    const described = describeScoring({ scores: ready, statedOverall: overallScore, recommendation, criteria });
    if (described.scoringCheck.mismatch) {
      return { ok: false, error: "Scoring mismatch, needs re-check. This score was not sent." };
    }
    const createdAt = clip3(input.createdAt, 40);
    if (!Number.isFinite(Date.parse(createdAt))) return { ok: false, error: "The score needs a timestamp." };
    const defended = readDefended(input.defended, criteria);
    if (!defended.ok) return defended;
    const airFeedback = parseAirFeedback(input.airFeedback);
    return {
      ok: true,
      submission: {
        source: WEB_CHAT_SOURCE,
        tier: UNCALIBRATED_WEB_CHAT_TIER,
        paper: { title, doi, url },
        site,
        model,
        criteriaVersion,
        ...criterionProfile ? { criterionProfile } : {},
        scores: ready,
        summary,
        overallScore,
        recommendation,
        createdAt,
        ...defended.score ? { defended: defended.score } : {},
        ...airFeedback ? { airFeedback } : {}
      }
    };
  }
  function readDefended(input, criteria) {
    if (input === void 0 || input === null) return { ok: true, score: null };
    if (!isRecord4(input)) return { ok: false, error: "The defended score was not a JSON object." };
    for (const key of Object.keys(input)) {
      if (!DEFENDED_KEYS.has(key)) return { ok: false, error: "The defended score included a field the board does not accept." };
    }
    if (input.label !== "after author defence") return { ok: false, error: "The second score must be labelled after author defence." };
    if (!Array.isArray(input.scores)) return { ok: false, error: "The defended score is missing its criterion scores." };
    const scores = input.scores.flatMap((item) => {
      if (!isRecord4(item) || Object.keys(item).some((key) => key !== "criterionId" && key !== "score")) return [];
      const criterionId = clip3(item.criterionId, 80);
      const score = Number(item.score);
      return Number.isInteger(score) && criterionId ? [{ criterionId, score }] : [];
    });
    const wanted = new Set(criteria.criteria.map((item) => item.id));
    if (scores.length !== wanted.size || scores.some((item) => !wanted.has(item.criterionId))) {
      return { ok: false, error: "The defended score needs every criterion in this profile." };
    }
    const summary = stripChatShareLinks(clip3(input.summary, 4e3));
    if (summary.length < 40) return { ok: false, error: "The defended summary is too short." };
    if (/https?:\/\/(?:share\.google|chatgpt\.com\/share|claude\.ai\/share|grok\.com\/share)/i.test(summary)) {
      return { ok: false, error: "A private chat link was still in the defended summary." };
    }
    const overallScore = Number(input.overallScore);
    if (!Number.isInteger(overallScore)) return { ok: false, error: "The defended score must be an integer." };
    const recommendation = clip3(input.recommendation, 80);
    const described = describeScoring({ scores, statedOverall: overallScore, recommendation, criteria });
    if (described.scoringCheck.mismatch) return { ok: false, error: "The defended score clashes with its own weighted total, so it was not sent." };
    return { ok: true, score: { label: "after author defence", overallScore, recommendation, summary, scores } };
  }

  // src/services/webChat/submit.ts
  function webChatSubmitHeaders() {
    const anon = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxvdHN3eGJvYWZzZW5tc3ppanBmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUxMTM0MDEsImV4cCI6MjExMDY4OTQwMX0.K0zYMdv3vkBMXiL4PePWemwodcDactb8rcZJc2cmi5w";
    const key = typeof anon === "string" ? anon.trim() : "";
    return {
      "content-type": "application/json",
      ...key ? { apikey: key, authorization: `Bearer ${key}` } : {}
    };
  }
  async function postWebChatSubmission(body) {
    const response = await fetch(WEB_CHAT_SUBMIT_URL, {
      method: "POST",
      headers: webChatSubmitHeaders(),
      body: JSON.stringify(body)
    });
    const payload = await response.json().catch(() => null);
    return { ok: response.ok, status: response.status, error: payload?.error, duplicate: payload?.duplicate };
  }

  // extension/review.ts
  var root = document.querySelector("#app");
  if (!root || !(root instanceof HTMLElement)) throw new Error("Missing panel root");
  var providerId = "grok";
  var profileId = "device";
  var file = null;
  var link = "";
  var publication = null;
  var defend = true;
  var defenceRounds = 2;
  var selected = /* @__PURE__ */ new Set();
  var showOnboarding = true;
  var status = "";
  var error = "";
  var busy = false;
  var reviews = [];
  var requestId = "";
  var pendingPaper = null;
  function storageGet(key) {
    return new Promise((resolve) => {
      chrome.storage.local.get(key, (data) => resolve(data?.[key]));
    });
  }
  function storageSet(key, value) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [key]: value }, () => resolve());
    });
  }
  function historyItem(review) {
    const card = resultCard(review);
    return {
      id: review.id,
      title: review.title,
      overall: review.report.overallScore,
      doi: review.doi === "local-file" ? "" : review.doi,
      url: review.paperUrl,
      site: review.modelId,
      model: review.modelId,
      createdAt: review.createdAt,
      mismatch: Boolean(card.mismatch),
      selected: selected.has(review.id)
    };
  }
  function paint() {
    const latest = reviews[0];
    renderReviewApp(
      root,
      {
        showOnboarding,
        providerId,
        profileId,
        fileName: file?.name ?? "",
        link,
        publication: publication ? { title: publication.title, authors: publication.authors, doi: publication.doi, url: publication.url } : null,
        defend,
        defenceRounds,
        status,
        error,
        busy,
        result: latest ? resultCard(latest) : null,
        history: reviews.map(historyItem)
      },
      {
        onDismissOnboarding() {
          showOnboarding = false;
          void storageSet(ONBOARD_STORAGE_KEY, true);
          paint();
        },
        onProvider(id) {
          providerId = id;
          paint();
        },
        onProfile(id) {
          profileId = id;
          paint();
        },
        onFile(next) {
          file = next;
          error = "";
          paint();
        },
        onLink(value) {
          link = value;
          publication = null;
        },
        onLookup() {
          void lookup();
        },
        onDefend(on) {
          defend = on;
          paint();
        },
        onRounds(rounds) {
          defenceRounds = Math.min(3, Math.max(1, rounds));
          paint();
        },
        onStop() {
          void send({ type: "air-web-chat-cancel", requestId });
          status = "Stopping. The chat tab stays open.";
          paint();
        },
        onReview() {
          void run();
        },
        onExport() {
          const blob = new Blob([exportBundle(reviews)], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const anchor = document.createElement("a");
          anchor.href = url;
          anchor.download = "air-web-chat.json";
          anchor.click();
          URL.revokeObjectURL(url);
        },
        onToggle(id) {
          if (selected.has(id)) selected.delete(id);
          else selected.add(id);
          paint();
        },
        onSend(id) {
          void sendScores([id]);
        },
        onSendSelected() {
          void sendScores([...selected]);
        }
      }
    );
  }
  async function readPaper(next) {
    const filename = next.name || "paper.txt";
    if (/\.pdf$/i.test(filename) || next.type === "application/pdf") {
      return readPdfBytes(filename, await next.arrayBuffer());
    }
    if (!/\.(txt|md|markdown|text)$/i.test(filename) && next.type && !next.type.startsWith("text/")) {
      throw new Error("Choose a PDF or a text file.");
    }
    return { filename, text: await next.text() };
  }
  function send(message) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ source: PAGE_SOURCE, version: PROTOCOL_VERSION, ...message }, (response) => {
        const failed = chrome.runtime.lastError?.message;
        if (failed) resolve({ ok: false, message: "The extension did not answer. Reload it from chrome://extensions." });
        else resolve(response ?? { ok: false, message: "The extension did not answer." });
      });
    });
  }
  async function lookup() {
    if (!link.trim() || busy) return;
    busy = true;
    error = "";
    status = "Looking up that publication\u2026";
    paint();
    try {
      publication = await resolvePublication(link.trim(), (url, init) => fetch(url, init));
      status = "Check the title and authors, then click Review my paper.";
      error = "";
    } catch (caught) {
      publication = null;
      error = caught instanceof Error ? caught.message : "That link could not be read.";
      status = "";
    } finally {
      busy = false;
      paint();
    }
  }
  async function paperFromPublication(preview) {
    const response = await fetch(preview.pdfUrl);
    if (!response.ok) throw new Error("The paper file could not be downloaded. You can save the PDF and choose the file instead.");
    const type = response.headers.get("content-type") || "";
    if (/\.pdf$/i.test(preview.filename) || type.includes("pdf")) {
      const bytes = await response.arrayBuffer();
      return readPdfBytes(preview.filename, bytes);
    }
    return { filename: preview.filename, text: await response.text() };
  }
  async function readPdfBytes(filename, bytes) {
    const pdfjs = await import(chrome.runtime.getURL("vendor/pdf.min.mjs"));
    pdfjs.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL("vendor/pdf.worker.min.mjs");
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise;
    const extracted = await textFromPdfDocument(pdf, WEB_CHAT_PDF_PAGES);
    return { filename, text: extracted.text, note: extracted.note };
  }
  async function run() {
    if (busy) return;
    if (!file && !publication) return;
    const provider = webChatProvider(providerId);
    if (!provider) return;
    busy = true;
    error = "";
    status = "Reading the paper\u2026";
    paint();
    try {
      const paper = file ? await readPaper(file) : await paperFromPublication(publication);
      if (!paper.text.trim()) {
        throw new Error(paper.note || "That file has no text to review. A scanned PDF needs a text file instead.");
      }
      pendingPaper = paper;
      requestId = uid("web");
      const packet = packetForLocalPaper({
        requestId,
        providerId,
        criteria: officialCriteria,
        criterionProfile: profileId,
        filename: paper.filename,
        text: paper.text,
        source: publication?.source ?? null
      });
      status = paper.note ? `${paper.note} Opening ${provider.label}. Stay on that tab.` : `Opening ${provider.label}. Stay on that tab.`;
      paint();
      const started = await send({ type: "air-web-chat-request", requestId, packet, defenceRounds: defend ? defenceRounds : 0 });
      if (started.ok === false) throw new Error(started.message || "The review did not start.");
    } catch (caught) {
      busy = false;
      status = "";
      error = caught instanceof Error ? caught.message : "The review did not start.";
      paint();
    }
  }
  chrome.runtime.onMessage.addListener((message) => {
    if (!message || message.source !== EXTENSION_SOURCE || message.requestId !== requestId) return;
    if (message.type === "air-web-chat-progress" && message.message) {
      status = message.message;
      paint();
      return;
    }
    if (message.type === "air-web-chat-error") {
      busy = false;
      status = "";
      error = message.message || "The chat did not finish.";
      paint();
      return;
    }
    if (message.type === "air-web-chat-result") {
      void finish(message.text ?? "", message.defendedText ?? null, message.transcript ?? [], Boolean(message.stopped), message.chatModel, message.notice);
    }
  });
  async function finish(raw, defendedRaw, transcript, stopped, chatModel, notice) {
    const accepted = acceptWebChatResult(raw, readingCriteria(officialCriteria, profileId, false));
    if (!accepted.ok) {
      busy = false;
      status = "";
      error = `The chat replied, but it was not a score AIR can keep. ${accepted.errors.slice(0, 2).join(" ")}`;
      paint();
      return;
    }
    const defended = defendedRaw ? defendedFromReply(defendedRaw) : null;
    const stored = await storedLocalReview({
      providerId,
      criteria: officialCriteria,
      filename: pendingPaper?.filename || file?.name || publication?.filename || "paper",
      report: accepted.report,
      criterionProfile: profileId,
      publication: publication ? { title: publication.title, doi: publication.doi, url: publication.url, authors: publication.authors } : void 0
    });
    stored.defenceTranscript = transcript;
    if (defended?.ok) stored.defended = defended.defended;
    const provider = webChatProvider(providerId);
    stored.modelId = webChatModelId(provider?.modelLabel ?? providerId, chatModel);
    if (notice?.trim()) stored.sourceNote = notice.trim();
    reviews = appendResult(reviews, stored);
    await storageSet(RESULT_STORAGE_KEY, reviews);
    busy = false;
    status = stopped ? "Stopped. The blind score is kept. The chat tab stays open." : defended?.ok ? "Done. The blind score and the score after author defence are below." : "Done. The blind score is below.";
    error = "";
    paint();
  }
  async function sendScores(ids) {
    const chosen = reviews.filter((review) => ids.includes(review.id));
    if (chosen.length === 0) return;
    busy = true;
    error = "";
    status = "Sending the selected scores\u2026";
    paint();
    const notes = [];
    for (const review of chosen) {
      const built = submissionFromReview(review, review.modelId);
      if (!built.ok) {
        notes.push(`${review.title}: ${built.error}`);
        continue;
      }
      try {
        const response = await postWebChatSubmission(built.submission);
        if (response.status === 404 || response.status === 405) {
          notes.push("The leaderboard is not accepting web-chat scores yet. The submission service still has to be deployed. Your score stays on this browser.");
          break;
        }
        if (!response.ok) notes.push(response.error || `The board returned ${response.status}.`);
        else notes.push(response.duplicate ? `${review.title} was already on the board.` : `${review.title} was sent. It is labelled uncalibrated web-chat.`);
      } catch {
        notes.push("The browser could not reach the leaderboard. Your score stays on this browser.");
        break;
      }
    }
    busy = false;
    status = notes.join(" ");
    error = "";
    paint();
  }
  function restoreSaved() {
    return storageGet(ONBOARD_STORAGE_KEY).then((seen) => {
      showOnboarding = seen !== true;
      return storageGet(RESULT_STORAGE_KEY);
    }).then((saved) => {
      reviews = Array.isArray(saved) ? saved : [];
      paint();
    });
  }
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void restoreSaved();
  });
  void restoreSaved();
})();
