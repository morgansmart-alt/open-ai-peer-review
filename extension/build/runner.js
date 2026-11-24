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
    pasteLimit: 32e3,
    fileCharLimit: 4e5,
    maxFiles: 4,
    comfortableTurns: 6,
    fileUpload: true,
    limits: "Grok on X is at x.com/i/grok. AIR tries a file up to about 400,000 characters, then pastes 32,000 characters at a time. X rate-limits long threads. That limit was not measured here.",
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
    const parsed = parseCriteria(raw);
    if (!parsed.ok) throw new Error(`${label} is invalid:
${parsed.errors.join("\n")}`);
    return parsed.criteria;
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
  function applyCriterionProfile(base, profileId) {
    const profile = profileById(profileId);
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
  function readingCriteria(base, profileId, custom) {
    if (custom) return base;
    return applyCriterionProfile(base, profileId);
  }

  // src/domain/scoring.ts
  var BOARD_MAX = 100;
  var MISMATCH_POINTS = 10;
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
      const text = clip(value);
      if (!field || !text) continue;
      feedback[field] = text;
    }
    return Object.keys(feedback).length > 0 ? feedback : void 0;
  }

  // src/services/validateReport.ts
  function isRecord2(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
  function extractJsonValue(raw) {
    const trimmed = raw.trim();
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const body = (fenced?.[1] ?? trimmed).trim();
    try {
      return JSON.parse(body);
    } catch {
      const start = body.indexOf("{");
      const end = body.lastIndexOf("}");
      if (start >= 0 && end > start) return JSON.parse(body.slice(start, end + 1));
      throw new Error("No JSON object found in the model output.");
    }
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
  var EXTENSION_SOURCE = "air-web-chat-extension";
  var PROTOCOL_VERSION = 1;

  // src/services/webChat/accept.ts
  function acceptWebChatResult(raw, criteria) {
    let parsed;
    try {
      parsed = extractJsonValue(raw);
    } catch (error) {
      return { ok: false, errors: [error instanceof Error ? error.message : "No JSON object was found in the chat reply."] };
    }
    return validateReport(parsed, criteria);
  }

  // src/services/webChat/defence.ts
  var DEFENCE_DEFAULT_ROUNDS = 2;
  var DEFENCE_MAX_ROUNDS = 3;
  var DEFENCE_PAUSE_MS = 4e3;
  function clampDefenceRounds(value) {
    if (!Number.isFinite(value)) return DEFENCE_DEFAULT_ROUNDS;
    return Math.min(DEFENCE_MAX_ROUNDS, Math.max(1, Math.round(value)));
  }
  function critiquesFromReport(report2) {
    const issues = (report2.majorIssues ?? []).flatMap((issue) => {
      const claim = issue.claim?.trim();
      if (!claim) return [];
      return [{ criterionId: issue.criterionId, claim, reason: issue.reason?.trim() || "", quotedPassage: issue.quotedPassage?.trim() || "" }];
    });
    if (issues.length > 0) return issues.slice(0, 6);
    const summary = report2.summary?.trim();
    return summary ? [{ criterionId: "summary", claim: summary.slice(0, 500), reason: "", quotedPassage: "" }] : [];
  }
  function rebuttalPrompt(options) {
    const excerpt = options.paperText.replace(/\s+/g, " ").trim().slice(0, 6e3);
    const lines = options.critiques.map((critique, index) => {
      const quote = critique.quotedPassage ? ` Quoted passage: "${critique.quotedPassage}"` : "";
      const reason = critique.reason ? ` Why it was raised: ${critique.reason}` : "";
      return `${index + 1}. [${critique.criterionId}] ${critique.claim}${reason}${quote}`;
    });
    return [
      `Author defence, round ${options.round} of ${options.rounds}.`,
      "Answer only from the paper text already in this chat and the excerpt below.",
      "Quote a section or a page when the paper itself states one. If a criticism is fair, say so plainly.",
      "Do not invent data, experiments, citations, or page numbers.",
      "",
      "Criticisms to answer:",
      ...lines,
      "",
      "Paper excerpt:",
      excerpt || "(The paper text is in the earlier messages.)"
    ].join("\n");
  }
  function rescorePrompt() {
    return [
      "Score the paper again with the same AIR v0.2 rubric.",
      "The first score stays the official blind score. This second score is after author defence.",
      "Use only the paper text in this chat. Do not invent data. Return one JSON object and nothing else.",
      "Keep the same fields as the first review: summary, scores for every criterion, overallScore, and recommendation."
    ].join("\n");
  }
  async function runDefenceLoop(options) {
    const rounds = clampDefenceRounds(options.rounds);
    const transcript = [];
    const pause = options.pause ?? (async () => void 0);
    for (let round = 1; round <= rounds; round += 1) {
      if (options.aborted()) return { transcript, defendedText: null, stopped: true };
      options.onProgress?.(`Defence round ${round} of ${rounds}. Stay on the chat tab.`);
      const prompt2 = rebuttalPrompt({ round, rounds, critiques: options.critiques, paperText: options.paperText });
      transcript.push({ round, kind: "rebuttal", text: prompt2 });
      const reply = await options.send(prompt2);
      if (options.aborted()) return { transcript, defendedText: null, stopped: true };
      transcript.push({ round, kind: "reply", text: reply });
      await pause();
    }
    if (options.aborted()) return { transcript, defendedText: null, stopped: true };
    options.onProgress?.("Asking for the score after author defence.");
    const prompt = rescorePrompt();
    transcript.push({ round: rounds, kind: "rescore", text: prompt });
    const defendedText = await options.send(prompt);
    if (options.aborted()) return { transcript, defendedText: null, stopped: true };
    transcript.push({ round: rounds, kind: "rescore-reply", text: defendedText });
    return { transcript, defendedText, stopped: false };
  }

  // src/services/webChat/deliver.ts
  function splitText(text, size) {
    const clean = text.replace(/\r\n/g, "\n");
    if (!clean.trim()) return [];
    const limit = Math.max(500, size);
    if (clean.length <= limit) return [clean];
    const parts = [];
    let cursor = 0;
    while (cursor < clean.length) {
      let end = Math.min(clean.length, cursor + limit);
      if (end < clean.length) {
        const paragraph = clean.lastIndexOf("\n\n", end);
        const sentence = clean.lastIndexOf(". ", end);
        const splitAt = paragraph > cursor + limit * 0.5 ? paragraph : sentence > cursor + limit * 0.5 ? sentence + 1 : end;
        end = Math.max(cursor + 1, splitAt);
      }
      const piece = clean.slice(cursor, end).trim();
      if (piece) parts.push(piece);
      cursor = end;
    }
    return parts;
  }
  function paperBody(files) {
    return files.map((file) => `## ${file.filename}
${file.text}`).join("\n\n");
  }
  function numberSteps(steps) {
    const total = steps.length;
    return steps.map((step, index) => ({ ...step, index: index + 1, total }));
  }
  function paperPart(index, total, chunk) {
    return [
      `AIR PAPER PART ${index} of ${total}.`,
      "Read this part and remember it.",
      `Reply with exactly: RECEIVED ${index}`,
      "Do not review yet.",
      "",
      chunk
    ].join("\n");
  }
  var PAPER_HEADER = 220;
  function instructionSteps(text, pasteLimit) {
    if (text.length <= pasteLimit) {
      return [{ kind: "paste", text, files: [], index: 1, total: 1, final: true }];
    }
    const parts = splitText(text, Math.max(500, pasteLimit - PAPER_HEADER));
    return parts.map((part, index) => {
      const final = index === parts.length - 1;
      return {
        kind: "paste",
        text: final ? part : [`AIR INSTRUCTIONS PART ${index + 1} of ${parts.length}.`, "Remember this.", `Reply with exactly: RECEIVED INSTRUCTIONS ${index + 1}`, "Do not review yet.", "", part].join("\n"),
        files: [],
        index: index + 1,
        total: parts.length,
        final
      };
    });
  }
  function filePieces(files, fileCharLimit) {
    const pieces = [];
    for (const file of files) {
      if (file.text.length <= fileCharLimit) {
        pieces.push(file);
        continue;
      }
      const parts = splitText(file.text, fileCharLimit);
      parts.forEach((part, index) => {
        const base = file.filename.replace(/[^\w.\- ]+/g, "_").slice(0, 60) || "paper";
        pieces.push({ filename: `${base}.part${index + 1}.txt`, text: part });
      });
    }
    return pieces;
  }
  function fileBatches(files, fileCharLimit, maxFiles) {
    const pieces = filePieces(files, fileCharLimit);
    const batches = [];
    let current = [];
    let size = 0;
    for (const piece of pieces) {
      const overflow = current.length > 0 && (current.length >= maxFiles || size + piece.text.length > fileCharLimit);
      if (overflow) {
        batches.push(current);
        current = [];
        size = 0;
      }
      current.push(piece);
      size += piece.text.length;
    }
    if (current.length) batches.push(current);
    return batches;
  }
  function uploadNote(index, total) {
    return [`AIR PAPER FILES ${index} of ${total} are attached.`, "Read the attached files and remember them.", `Reply with exactly: RECEIVED FILES ${index}`, "Do not review yet."].join("\n");
  }
  function planDelivery(packet, provider) {
    const files = packet.files.filter((file) => file.text.trim());
    const finalText = [packet.system, packet.instructions].filter(Boolean).join("\n\n");
    const closing = files.length ? `${finalText}

The paper is in the attached files or in the earlier messages labelled AIR PAPER. Score that text. Return one JSON object and nothing else.` : finalText;
    const canUpload = provider.fileUpload && provider.fileCharLimit > 0 && provider.maxFiles > 0 && files.length > 0;
    if (canUpload) {
      const batches = fileBatches(files, provider.fileCharLimit, provider.maxFiles);
      const instructionsFit = closing.length <= provider.pasteLimit;
      const steps2 = [];
      batches.forEach((batch, index) => {
        const lastBatch = index === batches.length - 1;
        if (lastBatch && instructionsFit) {
          steps2.push({ kind: "upload", text: closing, files: batch, index: 1, total: 1, final: true });
          return;
        }
        steps2.push({
          kind: "upload",
          text: uploadNote(index + 1, batches.length),
          files: batch,
          index: 1,
          total: 1,
          final: false
        });
      });
      if (!instructionsFit || steps2.every((step) => !step.final)) {
        steps2.push(...instructionSteps(closing, provider.pasteLimit).map((step) => ({ ...step, final: step.final })));
      }
      const numbered = numberSteps(steps2).map((step, index, all) => ({ ...step, final: index === all.length - 1 }));
      return { steps: numbered, warning: warn(provider, numbered.length, files) };
    }
    const paper = paperBody(files);
    const chunkSize = Math.max(500, provider.pasteLimit - PAPER_HEADER);
    const chunks = paper ? splitText(paper, chunkSize) : [];
    const paperSteps = chunks.map((chunk, index) => ({
      kind: "paste",
      text: paperPart(index + 1, chunks.length, chunk),
      files: [],
      index: 1,
      total: 1,
      final: false
    }));
    const steps = numberSteps([...paperSteps, ...instructionSteps(closing, provider.pasteLimit)]).map((step, index, all) => ({
      ...step,
      final: index === all.length - 1
    }));
    return { steps, warning: warn(provider, steps.length, files) };
  }
  function warn(provider, turns, files) {
    const notes = [];
    if (!provider.fileUpload && files.some((file) => file.text.length > provider.pasteLimit)) {
      notes.push(`${provider.label} is pasted in parts on this adapter.`);
    }
    if (turns > provider.comfortableTurns) {
      notes.push(`${provider.label} will receive ${turns} messages. A thread that long can hit the site's rate limit. The tab stays in front of you.`);
    }
    return notes.join(" ") || null;
  }

  // src/services/webChat/dom.ts
  function queryDeep(root, selector) {
    const direct = root.querySelector(selector);
    if (direct) return direct;
    for (const el of root.querySelectorAll("*")) {
      if (el.shadowRoot) {
        const found = queryDeep(el.shadowRoot, selector);
        if (found) return found;
      }
    }
    return null;
  }
  function queryAllDeep(root, selector) {
    const found = [...root.querySelectorAll(selector)];
    for (const el of root.querySelectorAll("*")) {
      if (el.shadowRoot) found.push(...queryAllDeep(el.shadowRoot, selector));
    }
    return found;
  }
  function queryFirst(root, selectors) {
    for (const selector of selectors) {
      if (!selector) continue;
      try {
        const found = queryDeep(root, selector);
        if (found) return found;
      } catch {
      }
    }
    return null;
  }
  var COMPOSER_HINTS = ["message grok", "ask", "what do you want to know", "message"];
  var SEND_WORDS = ["send", "submit", "grok", "ask"];
  function isIgnoredRegion(el) {
    let node = el;
    while (node) {
      const id = (node.id || "").toLowerCase();
      const className = classNameOf(node).toLowerCase();
      if (id === "air-web-chat-banner" || node.hasAttribute("data-air-ignore") || id.includes("stl-forge") || id.includes("stlforge") || className.includes("stl-forge") || className.includes("stlforge") || (node.getAttribute("data-extension") || "").toLowerCase().includes("stl")) {
        return true;
      }
      node = node.parentElement;
    }
    return false;
  }
  function isHiddenControl(el) {
    if (el.hasAttribute("hidden")) return true;
    if (el.getAttribute("aria-hidden") === "true") return true;
    if (el.getAttribute("aria-disabled") === "true") return true;
    const style = el.style;
    if (style?.display === "none" || style?.visibility === "hidden") return true;
    if ("disabled" in el && Boolean(el.disabled)) return true;
    return false;
  }
  function classNameOf(el) {
    return typeof el.className === "string" ? el.className : "";
  }
  function isComposerCandidate(el) {
    if (isIgnoredRegion(el) || isHiddenControl(el)) return false;
    const tag = el.tagName;
    if (tag === "TEXTAREA") return true;
    if (tag === "INPUT") {
      const type = (el.type || "text").toLowerCase();
      return type === "text" || type === "search";
    }
    if (el.getAttribute("contenteditable") === "true" || el.getAttribute("contenteditable") === "") return true;
    if (el.getAttribute("role") === "textbox") return true;
    return false;
  }
  function hintText(el) {
    return `${el.getAttribute("aria-label") ?? ""} ${el.getAttribute("placeholder") ?? ""}`.toLowerCase();
  }
  function matchesHint(el) {
    const text = hintText(el);
    return COMPOSER_HINTS.some((hint) => text.includes(hint));
  }
  function chatRegion(root) {
    const scope = root instanceof Document ? root.body ?? root : root;
    if (scope instanceof Element || scope instanceof Document) {
      const main = scope.querySelector("main, [role='main']");
      if (main) return main;
    }
    return scope;
  }
  function firstUsable(nodes, accept) {
    return nodes.find((el) => accept(el)) ?? null;
  }
  function findComposer(root, selectors) {
    for (const selector of selectors) {
      let nodes = [];
      try {
        nodes = queryAllDeep(root, selector);
      } catch {
        continue;
      }
      const found = firstUsable(nodes, isComposerCandidate);
      if (found) return found;
    }
    const region = chatRegion(root);
    let pool = [];
    try {
      pool = queryAllDeep(region, "textarea, input, [contenteditable='true'], [contenteditable=''], [role='textbox']");
    } catch {
      pool = [];
    }
    const usable = pool.filter(isComposerCandidate);
    return usable.find(matchesHint) ?? usable.find((el) => el.tagName === "TEXTAREA") ?? usable.find((el) => el.getAttribute("contenteditable") === "true" || el.getAttribute("contenteditable") === "") ?? usable.find((el) => el.getAttribute("role") === "textbox") ?? null;
  }
  function buttonLabel(el) {
    return `${el.getAttribute("aria-label") ?? ""} ${el.getAttribute("title") ?? ""} ${(el.textContent ?? "").replace(/\s+/g, " ")}`.toLowerCase();
  }
  function isSendControl(el) {
    if (isIgnoredRegion(el) || isHiddenControl(el)) return false;
    const tag = el.tagName;
    if (tag !== "BUTTON" && el.getAttribute("role") !== "button" && el.type !== "submit") return false;
    const label = buttonLabel(el);
    if (/add files|voice mode|select a model|model auto/.test(label)) return false;
    return true;
  }
  function nearest(origin, options) {
    if (options.length === 0) return null;
    const doc = origin.ownerDocument;
    if (!doc) return options[0] ?? null;
    const order = [...doc.querySelectorAll("body *")];
    const index = new Map(order.map((el, position) => [el, position]));
    const originIndex = index.get(origin) ?? 0;
    let best = options[0] ?? null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const option of options) {
      const distance = Math.abs((index.get(option) ?? 0) - originIndex);
      if (distance < bestDistance) {
        best = option;
        bestDistance = distance;
      }
    }
    return best;
  }
  function uniqueElements(nodes) {
    return [...new Set(nodes)];
  }
  function findSubmit(root, selectors, composer) {
    const matches = [];
    for (const selector of selectors) {
      try {
        matches.push(...queryAllDeep(root, selector).filter(isSendControl));
      } catch {
      }
    }
    const listed = uniqueElements(matches);
    if (listed.length) return composer ? nearest(composer, listed) : listed[listed.length - 1] ?? null;
    const region = chatRegion(root);
    let buttons = [];
    try {
      buttons = queryAllDeep(region, "button, [role='button'], input[type='submit']").filter(isSendControl);
    } catch {
      buttons = [];
    }
    const hinted = [];
    for (const word of SEND_WORDS) hinted.push(...buttons.filter((button) => buttonLabel(button).includes(word)));
    const hintedUnique = uniqueElements(hinted);
    if (hintedUnique.length) return composer ? nearest(composer, hintedUnique) : hintedUnique[hintedUnique.length - 1] ?? null;
    const submits = buttons.filter((button) => button.getAttribute("type") === "submit" || button.type === "submit");
    if (composer) return nearest(composer, submits);
    return submits[submits.length - 1] ?? null;
  }
  function describeButtons(root, limit = 6) {
    let nodes = [];
    try {
      nodes = queryAllDeep(root, "button, [role='button'], input[type='submit']");
    } catch {
      nodes = [];
    }
    if (nodes.length === 0) return "Buttons: none.";
    const text = nodes.slice(0, limit).map((el) => {
      const tag = el.tagName.toLowerCase();
      const type = el.getAttribute("type") ?? "";
      const label = el.getAttribute("aria-label") ?? "";
      const state = isHiddenControl(el) ? "disabled" : "enabled";
      return [tag, type && `type=${type}`, label && `aria-label=${label}`, state].filter(Boolean).join(" ");
    }).join("; ");
    return `Buttons: ${text}.`;
  }
  function describeCandidates(root, limit = 6) {
    let nodes = [];
    try {
      nodes = queryAllDeep(root, "textarea, input, [contenteditable='true'], [contenteditable=''], [role='textbox']");
    } catch {
      nodes = [];
    }
    const candidates = nodes.filter((el) => {
      if (el.tagName === "INPUT") {
        const type = (el.type || "").toLowerCase();
        if (type === "file" || type === "hidden" || type === "password" || type === "checkbox" || type === "radio") return false;
      }
      return el.tagName === "TEXTAREA" || el.tagName === "INPUT" || el.getAttribute("contenteditable") != null || el.getAttribute("role") === "textbox";
    });
    if (candidates.length === 0) return "none";
    return candidates.slice(0, limit).map((el) => {
      const tag = el.tagName.toLowerCase();
      const role = el.getAttribute("role") ?? "";
      const label = el.getAttribute("aria-label") ?? "";
      const placeholder = el.getAttribute("placeholder") ?? "";
      return [tag, role && `role=${role}`, label && `aria-label=${label}`, placeholder && `placeholder=${placeholder}`].filter(Boolean).join(" ");
    }).join("; ");
  }
  function elementText(el) {
    const element = el;
    const text = typeof element.innerText === "string" && element.innerText.trim() ? element.innerText : el.textContent ?? "";
    return text.trim();
  }
  function looksLikeAssistant(el) {
    const blob = `${el.getAttribute("data-testid") ?? ""} ${el.getAttribute("data-message-author") ?? ""} ${el.getAttribute("data-message-author-role") ?? ""} ${classNameOf(el)}`.toLowerCase();
    return /assistant|grok-message|model-response|response-message/.test(blob);
  }
  function assistantText(root, selectors, composer) {
    const seen = /* @__PURE__ */ new Set();
    const consider = (nodes) => {
      const usable = nodes.filter((el) => {
        if (seen.has(el) || isIgnoredRegion(el)) return false;
        seen.add(el);
        if (!composer) return true;
        if (el === composer || composer.contains(el) || el.contains(composer)) return false;
        return true;
      });
      const last = usable[usable.length - 1];
      return last ? elementText(last) : "";
    };
    for (const selector of selectors) {
      let nodes = [];
      try {
        nodes = queryAllDeep(root, selector);
      } catch {
        continue;
      }
      const text2 = consider(nodes);
      if (text2) return text2;
    }
    let pool = [];
    try {
      pool = queryAllDeep(root, "[data-testid], [data-message-author], [data-message-author-role], [class*='assistant'], [class*='response']");
    } catch {
      pool = [];
    }
    const text = consider(pool.filter(looksLikeAssistant));
    return text;
  }
  function stopControlActive(root, selectors) {
    const extra = ["button", "[role='button']"];
    const found = [];
    for (const selector of [...selectors, ...extra]) {
      try {
        found.push(...queryAllDeep(root, selector));
      } catch {
      }
    }
    return found.some((el) => {
      if (isIgnoredRegion(el) || !isActiveStop(el)) return false;
      const fromAdapter = selectors.some((selector) => {
        try {
          return el.matches(selector);
        } catch {
          return false;
        }
      });
      if (fromAdapter) return true;
      return /stop/.test(buttonLabel(el));
    });
  }
  function isActiveStop(el) {
    if (el.hasAttribute("hidden")) return false;
    if (el.getAttribute("aria-hidden") === "true") return false;
    if ("disabled" in el && Boolean(el.disabled)) return false;
    return true;
  }
  function textFilename(filename) {
    const base = filename.replace(/[^\w.\- ]+/g, "_").slice(0, 80) || "paper";
    return /\.(txt|md|csv|json)$/i.test(base) ? base : `${base}.txt`;
  }
  function dispatchInput(el, text) {
    try {
      el.dispatchEvent(new InputEvent("input", { bubbles: true, data: text, inputType: "insertText" }));
    } catch {
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }
  function containsStart(el, text) {
    if (!text) return true;
    const probe = text.slice(0, Math.min(16, text.length));
    const value = "value" in el ? String(el.value ?? "") : "";
    return value.includes(probe) || (el.textContent ?? "").includes(probe);
  }
  function pasteText(el, text) {
    try {
      const transfer = new DataTransfer();
      transfer.setData("text/plain", text);
      const event = new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: transfer });
      el.dispatchEvent(event);
    } catch {
      return false;
    }
    return containsStart(el, text);
  }
  function writeComposer(el, text) {
    const tag = el.tagName;
    if (tag === "TEXTAREA" || tag === "INPUT") {
      const control = el;
      const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(control), "value")?.set;
      if (typeof setter === "function") setter.call(control, text);
      else control.value = text;
      dispatchInput(control, text);
      control.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }
    const editable = el;
    if (typeof editable.focus === "function") editable.focus();
    const doc = el.ownerDocument;
    let inserted = false;
    try {
      const selection = doc.getSelection?.();
      const range = doc.createRange();
      range.selectNodeContents(el);
      selection?.removeAllRanges();
      selection?.addRange(range);
      inserted = Boolean(doc.execCommand?.("insertText", false, text));
    } catch {
      inserted = false;
    }
    if (!inserted || !containsStart(editable, text)) inserted = pasteText(editable, text);
    if (!inserted || !containsStart(editable, text)) {
      editable.textContent = text;
      dispatchInput(editable, text);
    }
  }
  var clickLock = /* @__PURE__ */ new WeakMap();
  function pressEnterSequence(el) {
    if (clickLock.has(el)) return false;
    clickLock.set(el, 1);
    queueMicrotask(() => {
      setTimeout(() => clickLock.delete(el), 0);
    });
    const init = {
      key: "Enter",
      code: "Enter",
      keyCode: 13,
      which: 13,
      bubbles: true,
      cancelable: true
    };
    el.dispatchEvent(new KeyboardEvent("keydown", init));
    el.dispatchEvent(new KeyboardEvent("keypress", init));
    el.dispatchEvent(new KeyboardEvent("keyup", init));
    return true;
  }
  function pointerClick(el) {
    if (typeof el.focus === "function") el.focus();
    const view = el.ownerDocument?.defaultView ?? void 0;
    const common = { bubbles: true, cancelable: true, view };
    try {
      el.dispatchEvent(new PointerEvent("pointerdown", common));
    } catch {
    }
    el.dispatchEvent(new MouseEvent("mousedown", common));
    try {
      el.dispatchEvent(new PointerEvent("pointerup", common));
    } catch {
    }
    el.dispatchEvent(new MouseEvent("mouseup", common));
    el.dispatchEvent(new MouseEvent("click", common));
  }
  function requestSubmitButton(button) {
    const control = button;
    const form = control.form;
    if (!form || typeof form.requestSubmit !== "function") return false;
    try {
      form.requestSubmit(control);
      return true;
    } catch {
      return false;
    }
  }
  function composerText(el) {
    if ("value" in el && typeof el.value === "string") return el.value;
    return el.textContent ?? "";
  }
  function sendLanded(doc, composer, beforeAssistant, previousComposer) {
    const now = composerText(composer).trim();
    const placeholder = (composer.getAttribute("placeholder") ?? "").toLowerCase();
    if (/ask, create images, or build anything/.test(placeholder) && now.length < 12) return true;
    if (previousComposer.trim().length > 12 && now.length < previousComposer.trim().length * 0.25) return true;
    const reply = assistantText(doc, [], composer);
    if (reply && reply !== beforeAssistant) return true;
    if (ackReply(doc, composer)) return true;
    if (stopControlActive(doc, [])) return true;
    const probe = previousComposer.trim().slice(0, 24);
    if (probe.length > 8 && userTurnHas(doc, composer, probe)) return true;
    return false;
  }
  function userTurnHas(doc, composer, probe) {
    let nodes = [];
    try {
      nodes = queryAllDeep(doc, "div, p, span, article");
    } catch {
      return false;
    }
    return nodes.some((el) => {
      if (el === composer || composer.contains(el) || el.contains(composer) || isIgnoredRegion(el)) return false;
      const text = (el.textContent ?? "").trim();
      return text.length < 8e3 && text.includes(probe);
    });
  }
  function ackReply(root, composer) {
    let nodes = [];
    try {
      nodes = queryAllDeep(root, "div, p, span");
    } catch {
      return "";
    }
    const hits = nodes.filter((el) => {
      if (isIgnoredRegion(el) || composer && (el === composer || composer.contains(el))) return false;
      const text = (el.textContent ?? "").trim();
      return text.length < 40 && /^RECEIVED \d+$/i.test(text);
    });
    return hits[hits.length - 1]?.textContent?.trim() ?? "";
  }
  function replyActionsVisible(root) {
    let nodes = [];
    try {
      nodes = queryAllDeep(root, "button, [role='button']");
    } catch {
      return false;
    }
    return nodes.some((el) => {
      if (isIgnoredRegion(el) || isHiddenControl(el)) return false;
      return /\b(copy|regenerate|retry|rewrite)\b/i.test(buttonLabel(el));
    });
  }
  function describeMessages(root, limit = 4) {
    let nodes = [];
    try {
      nodes = queryAllDeep(root, "div, p, article");
    } catch {
      return "Messages: none.";
    }
    const lines = nodes.filter((el) => !isIgnoredRegion(el)).map((el) => (el.textContent ?? "").trim().replace(/\s+/g, " ")).filter((text) => text.length > 2 && text.length < 180).slice(-limit);
    if (lines.length === 0) return "Messages: none.";
    return `Messages: ${lines.join(" | ")}.`;
  }
  var ATTACHMENT_SELECTORS = [
    '[data-attachment-state="ready"]',
    '[data-attachment-state="complete"]',
    '[data-testid*="attachment"]',
    '[data-testid*="file-thumbnail"]',
    '[aria-label*="Attached"]',
    '[aria-label*="Remove file"]'
  ];
  function attachmentNames(files) {
    const names = /* @__PURE__ */ new Set();
    for (const file of files) {
      const raw = file.filename.trim().toLowerCase();
      const named = textFilename(file.filename).toLowerCase();
      if (raw.length > 2) names.add(raw);
      if (named.length > 2) names.add(named);
      const stem = named.replace(/\.txt$/i, "");
      if (stem.length > 2) names.add(stem);
    }
    return [...names];
  }
  function attachmentState(el) {
    return `${el.getAttribute("data-attachment-state") ?? ""} ${el.getAttribute("data-state") ?? ""}`.toLowerCase();
  }
  function isPendingAttachment(el) {
    return /\b(pending|uploading|processing)\b/.test(attachmentState(el));
  }
  function attachmentReady(root, files, selectors = ATTACHMENT_SELECTORS) {
    const names = attachmentNames(files);
    const seen = /* @__PURE__ */ new Set();
    const list = selectors.length > 0 ? selectors : ATTACHMENT_SELECTORS;
    const consider = (node) => {
      if (seen.has(node) || isIgnoredRegion(node)) return false;
      if (node.tagName === "INPUT" || node.tagName === "TEXTAREA" || node.tagName === "SCRIPT" || node.tagName === "STYLE") return false;
      if (node.getAttribute("contenteditable") === "true" || node.getAttribute("role") === "textbox") return false;
      seen.add(node);
      if (isPendingAttachment(node)) return false;
      const state = attachmentState(node);
      if (/\b(ready|complete|uploaded|attached)\b/.test(state)) return true;
      const label = (node.getAttribute("aria-label") ?? "").toLowerCase();
      const text = (node.textContent ?? "").trim().toLowerCase();
      const short = text.length > 0 && text.length < 180;
      return names.some((name) => label.includes(name) || short && text.includes(name));
    };
    for (const selector of [...list, "[data-attachment-state]", "[class*='file']", "[class*='chip']", "[aria-label*='Remove']"]) {
      let nodes = [];
      try {
        nodes = queryAllDeep(root, selector);
      } catch {
        continue;
      }
      if (nodes.some(consider)) return true;
    }
    let all = [];
    try {
      all = queryAllDeep(root, "div, span, li, button, p");
    } catch {
      all = [];
    }
    return all.some(consider);
  }
  function attachTextFiles(input, files) {
    if (input.tagName !== "INPUT") return false;
    try {
      const transfer = new DataTransfer();
      for (const file of files) {
        transfer.items.add(new File([file.text], textFilename(file.filename), { type: "text/plain" }));
      }
      const target = input;
      target.files = transfer.files;
      target.dispatchEvent(new Event("change", { bubbles: true }));
      return (target.files?.length ?? 0) === files.length;
    } catch {
      return false;
    }
  }

  // src/services/webChat/runTurn.ts
  var TurnError = class extends Error {
    code;
    constructor(code, message) {
      super(message);
      this.code = code;
      this.name = "TurnError";
    }
  };
  function signedOut(provider) {
    return `${provider.label} is showing a sign-in page. Sign in on this tab, then click Run again in AIR. AIR does not see your password.`;
  }
  function selectorMiss(provider, diagnostic) {
    const detail = diagnostic && diagnostic !== "none" ? ` Candidates: ${diagnostic}.` : " Candidates: none.";
    return `AIR could not find the message box on ${provider.label}. The page may still be loading, or the site changed its layout. Reload the tab and run again.${detail} The selectors for this site are in extension/adapters/${provider.id}.ts.`;
  }
  async function waitForComposer(doc, provider, hooks) {
    const timeoutMs = hooks.composerTimeoutMs ?? 2e4;
    const pollMs = hooks.pollMs ?? 200;
    const start = Date.now();
    let found = findComposer(doc, provider.selectors.composer);
    while (!found && Date.now() - start <= timeoutMs) {
      if (hooks.aborted()) throw new TurnError("cancelled", "Cancelled. The provider tab stays open.");
      await hooks.sleep(pollMs);
      found = findComposer(doc, provider.selectors.composer);
    }
    return found;
  }
  function stepDiagnostic(doc) {
    return `${describeButtons(doc)} ${describeCandidates(doc)}`;
  }
  async function waitForReply(doc, provider, before, hooks, composer) {
    const pollMs = hooks.pollMs ?? 400;
    const stableMs = hooks.stableMs ?? 2e3;
    const timeoutMs = hooks.stepTimeoutMs ?? 4 * 60 * 1e3;
    const startLimit = hooks.replyStartTimeoutMs ?? 2e4;
    const start = Date.now();
    let last = before;
    let stableFor = 0;
    let started = false;
    while (Date.now() - start < timeoutMs) {
      if (hooks.aborted()) throw new TurnError("cancelled", "Cancelled. The provider tab stays open.");
      const text = assistantText(doc, provider.selectors.assistant, composer) || ackReply(doc, composer);
      const stopping = stopControlActive(doc, provider.selectors.stop);
      const finishedAck = /^RECEIVED \d+$/i.test(text.trim());
      if (text && text !== before) started = true;
      if (started && !stopping && (finishedAck || replyActionsVisible(doc))) return text;
      if (!started && !stopping && Date.now() - start >= startLimit) {
        const send = findSubmit(doc, provider.selectors.submit, composer);
        if (send) {
          throw new TurnError(
            "send-timeout",
            `Send step on ${provider.label} did not start a reply. The Send button was still enabled. ${stepDiagnostic(doc)}`
          );
        }
      }
      if (text && text !== before && text === last && !stopping && stableFor >= stableMs) return text;
      if (text !== last) {
        last = text;
        stableFor = 0;
      } else {
        stableFor += pollMs;
      }
      await hooks.sleep(pollMs);
    }
    throw new TurnError("timeout", `Reply step on ${provider.label} did not finish in time. ${stepDiagnostic(doc)} ${describeMessages(doc)}`);
  }
  async function waitForEnabledSubmit(doc, provider, composer, hooks) {
    const timeoutMs = hooks.submitReadyMs ?? 5e3;
    const stableMs = hooks.submitStableMs ?? 300;
    const pollMs = hooks.pollMs ?? 200;
    const start = Date.now();
    let last = null;
    let stableFor = 0;
    while (Date.now() - start <= timeoutMs) {
      if (hooks.aborted()) throw new TurnError("cancelled", "Cancelled. The provider tab stays open.");
      const button = findSubmit(doc, provider.selectors.submit, composer);
      if (button && button === last && stableFor >= stableMs) return button;
      if (button && button === last) stableFor += pollMs;
      else {
        last = button;
        stableFor = button ? pollMs : 0;
      }
      if (button && stableMs <= 0) return button;
      await hooks.sleep(pollMs);
    }
    return last;
  }
  async function verifySend(doc, composer, beforeAssistant, previousComposer, hooks) {
    const timeoutMs = hooks.sendVerifyMs ?? 3e3;
    const pollMs = hooks.pollMs ?? 200;
    const start = Date.now();
    while (Date.now() - start <= timeoutMs) {
      if (hooks.aborted()) throw new TurnError("cancelled", "Cancelled. The provider tab stays open.");
      if (sendLanded(doc, composer, beforeAssistant, previousComposer)) return true;
      await hooks.sleep(pollMs);
    }
    return sendLanded(doc, composer, beforeAssistant, previousComposer);
  }
  async function commitSend(doc, provider, composer, beforeAssistant, hooks) {
    const previousComposer = composerText(composer);
    const button = await waitForEnabledSubmit(doc, provider, composer, hooks);
    let primary = "none";
    if (button) {
      primary = requestSubmitButton(button) ? "requestSubmit" : "pointer";
      if (primary === "pointer") pointerClick(button);
      hooks.onProgress?.(`Send step on ${provider.label}. Tried ${primary}.`);
      if (await verifySend(doc, composer, beforeAssistant, previousComposer, hooks)) return primary;
      if (sendLanded(doc, composer, beforeAssistant, previousComposer)) return primary;
    }
    if (sendLanded(doc, composer, beforeAssistant, previousComposer)) return primary;
    const entered = pressEnterSequence(composer);
    hooks.onProgress?.(`Send step on ${provider.label}. Tried Enter after ${primary} did not send.`);
    if (!entered) return primary;
    if (await verifySend(doc, composer, beforeAssistant, previousComposer, hooks)) return "enter";
    const still = findSubmit(doc, provider.selectors.submit, composer);
    throw new TurnError(
      "send-timeout",
      `Send step on ${provider.label} did not start a reply. Tried ${primary}, then Enter. ${still ? "The Send button was still enabled." : "Send was not enabled."} ${stepDiagnostic(doc)} ${describeMessages(doc)}`
    );
  }
  async function waitForAttachment(doc, provider, files, hooks) {
    const timeoutMs = hooks.attachmentTimeoutMs ?? 2e4;
    const chipWindow = hooks.attachmentChipMs ?? 3e3;
    const pollMs = hooks.pollMs ?? 200;
    const selectors = provider.selectors.attachment?.length ? provider.selectors.attachment : ATTACHMENT_SELECTORS;
    const start = Date.now();
    while (Date.now() - start <= timeoutMs) {
      if (hooks.aborted()) throw new TurnError("cancelled", "Cancelled. The provider tab stays open.");
      if (attachmentReady(doc, files, selectors)) return;
      if (Date.now() - start >= chipWindow) {
        const composer = findComposer(doc, provider.selectors.composer);
        const send = composer ? findSubmit(doc, provider.selectors.submit, composer) : null;
        if (send) return;
      }
      await hooks.sleep(pollMs);
    }
    throw new TurnError(
      "upload-timeout",
      `Attachment step on ${provider.label} timed out. The file chip never showed as ready, and Send was not enabled. ${stepDiagnostic(doc)}`
    );
  }
  async function sendStep(doc, provider, step, hooks) {
    if (step.kind === "upload") {
      hooks.onProgress?.(`Attachment step on ${provider.label}. Waiting for the file chip, or for Send to become enabled.`);
      const input = queryFirst(doc, provider.selectors.fileInput);
      const attached = input ? attachTextFiles(input, step.files) : false;
      if (!attached) throw new TurnError("upload-miss", "file upload was not accepted");
      await waitForAttachment(doc, provider, step.files, hooks);
    }
    const composer = findComposer(doc, provider.selectors.composer);
    if (!composer) throw new TurnError("selector-miss", selectorMiss(provider, describeCandidates(doc)));
    const before = assistantText(doc, provider.selectors.assistant, composer);
    writeComposer(composer, step.text);
    const method = await commitSend(doc, provider, composer, before, hooks);
    hooks.onProgress?.(`Send step on ${provider.label}. Method that sent: ${method}.`);
    return waitForReply(doc, provider, before, hooks, composer);
  }
  async function sendFollowUp(doc, provider, text, hooks) {
    const step = { kind: "paste", text, files: [], index: 1, total: 1, final: true };
    return sendStep(doc, provider, step, hooks);
  }
  async function runTurn(doc, provider, packet, hooks) {
    try {
      const composer = await waitForComposer(doc, provider, hooks);
      if (!composer) {
        if (queryFirst(doc, provider.selectors.login)) return { ok: false, code: "signed-out", message: signedOut(provider) };
        return { ok: false, code: "selector-miss", message: selectorMiss(provider, describeCandidates(doc)) };
      }
      let providerForPlan = provider;
      let planned = planDelivery(packet, providerForPlan);
      if (planned.warning) hooks.onProgress?.(planned.warning);
      let steps = planned.steps;
      let fellBack = false;
      for (let index = 0; index < steps.length; index += 1) {
        const step = steps[index];
        if (!step) continue;
        hooks.onProgress?.(`Sending part ${step.index} of ${step.total} on ${provider.label}. Stay on this tab.`);
        try {
          const reply = await sendStep(doc, provider, step, hooks);
          if (step.final) return { ok: true, text: reply, steps: steps.length };
        } catch (error) {
          if (error instanceof TurnError && error.code === "upload-miss" && !fellBack) {
            fellBack = true;
            hooks.onProgress?.(`${provider.label} did not accept the file. Pasting the paper in parts instead.`);
            providerForPlan = { ...provider, fileUpload: false };
            planned = planDelivery(packet, providerForPlan);
            steps = planned.steps;
            if (planned.warning) hooks.onProgress?.(planned.warning);
            index = -1;
            continue;
          }
          throw error;
        }
      }
      return { ok: false, code: "empty", message: `${provider.label} finished without a final reply. The tab stays open.` };
    } catch (error) {
      if (error instanceof TurnError) return { ok: false, code: error.code, message: error.message };
      const message = error instanceof Error ? error.message : "The web chat run failed.";
      return { ok: false, code: "error", message };
    }
  }

  // extension/runner.ts
  var aborted = false;
  function showBanner(label) {
    document.getElementById("air-web-chat-banner")?.remove();
    const bar = document.createElement("div");
    bar.id = "air-web-chat-banner";
    bar.setAttribute("role", "status");
    bar.style.cssText = "position:fixed;z-index:2147483646;top:0;left:0;right:0;padding:10px 14px;background:#0f3d3a;color:#f4f7f4;font:14px/1.4 sans-serif;";
    bar.append(document.createTextNode(`AIR is using this ${label} tab because you clicked Run. Stay and watch. AIR does not read your password or cookies. `));
    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "Hide";
    close.style.cssText = "margin-left:8px;background:#fff;color:#0f3d3a;border:0;border-radius:999px;padding:4px 10px;cursor:pointer;";
    close.addEventListener("click", () => bar.remove());
    bar.append(close);
    (document.body ?? document.documentElement).append(bar);
  }
  function report(message) {
    chrome.runtime.sendMessage({ source: EXTENSION_SOURCE, version: PROTOCOL_VERSION, ...message });
  }
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "air-web-chat-abort") {
      aborted = true;
      sendResponse({ ok: true });
      return true;
    }
    if (message?.type !== "air-web-chat-run" || !message.requestId || !message.packet) return;
    const provider = webChatProvider(message.providerId ?? message.packet.providerId);
    if (!provider) {
      sendResponse({ ok: false, started: false });
      report({ type: "air-web-chat-done", requestId: message.requestId, ok: false, message: "That chat site has no adapter." });
      return true;
    }
    aborted = false;
    showBanner(provider.label);
    sendResponse({ ok: true, started: true });
    const hooks = {
      aborted: () => aborted,
      onProgress: (text) => report({ type: "air-web-chat-progress", requestId: message.requestId, message: text }),
      sleep: (ms) => new Promise((resolve) => window.setTimeout(resolve, ms))
    };
    void runTurn(document, provider, message.packet, hooks).then(async (result) => {
      if (!result.ok) {
        report({ type: "air-web-chat-done", requestId: message.requestId, ok: false, message: result.message, code: result.code });
        return;
      }
      const rounds = Math.min(3, Math.max(0, Math.round(Number(message.defenceRounds) || 0)));
      const criteria = readingCriteria(officialCriteria, message.packet.criterionProfile, false);
      if (!rounds) {
        report({ type: "air-web-chat-done", requestId: message.requestId, ok: true, text: result.text });
        return;
      }
      const accepted = acceptWebChatResult(result.text, criteria);
      if (!accepted.ok) {
        report({ type: "air-web-chat-done", requestId: message.requestId, ok: true, text: result.text, defendedText: null, transcript: [], stopped: false });
        return;
      }
      const paperText = message.packet.files.map((file) => file.text).join("\n\n");
      try {
        const defence = await runDefenceLoop({
          rounds,
          critiques: critiquesFromReport(accepted.report),
          paperText,
          aborted: () => aborted,
          pause: () => new Promise((resolve) => window.setTimeout(resolve, DEFENCE_PAUSE_MS)),
          onProgress: (text) => report({ type: "air-web-chat-progress", requestId: message.requestId, message: text }),
          send: (prompt) => sendFollowUp(document, provider, prompt, hooks)
        });
        report({
          type: "air-web-chat-done",
          requestId: message.requestId,
          ok: true,
          text: result.text,
          defendedText: defence.defendedText,
          transcript: defence.transcript,
          stopped: defence.stopped
        });
      } catch (error) {
        report({
          type: "air-web-chat-done",
          requestId: message.requestId,
          ok: true,
          text: result.text,
          message: error instanceof Error ? error.message : "The defence stopped early."
        });
      }
    });
    return true;
  });
})();
