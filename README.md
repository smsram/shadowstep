# ShadowStep

**High-Performance, Privacy-First Browser Automation Companion & Autonomous Agent**

[![Version](https://img.shields.io/badge/version-1.1.0-00FFC2?style=flat-square)](https://github.com/smsram/shadowstep/releases)
[![Manifest V3](https://img.shields.io/badge/manifest-v3-blue?style=flat-square)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![Framework](https://img.shields.io/badge/Preact-10-673ab8?style=flat-square&logo=preact)](https://preactjs.com/)
[![Language](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/license-MIT-green?style=flat-square)](./LICENSE)
[![Install from Microsoft Edge Add-ons](https://img.shields.io/badge/Microsoft_Edge_Add--ons-Install_Now-0078D4?logo=microsoftedge&logoColor=white&style=flat-square)](https://microsoftedge.microsoft.com/addons/detail/shadowstep/iehelgmcldkldibjabnngfgfehegomgh)

Repository: [github.com/smsram/shadowstep](https://github.com/smsram/shadowstep)

---

## 📖 Executive Overview

**ShadowStep** is an open-source, zero-telemetry Chromium extension engineered for deterministic web automation, real-time contextual intelligence, and multi-step browser execution. Operating strictly within your local browser context via Chrome Extension Manifest V3, ShadowStep eliminates intermediary servers and proprietary proxy clouds to ensure absolute privacy for developers, security researchers, and power users.

By orchestrating high-velocity serverless inference across **Google Gemini**, **Groq**, and **Cloudflare Workers AI**, ShadowStep functions simultaneously as an analytical copilot and an autonomous DOM interaction agent capable of completing complex, multi-action workflows directly on live webpages.

---

## ⚡ What's New in v1.1.0

The **v1.1.0** release delivers significant architectural enhancements, intelligent search grounding, enhanced agent state machines, and a refined user interface:

### 🌐 Real-Time Web Search Grounding
- **Gemini Search Grounding:** Dynamic on-demand Google Search integration powered by the Gemini API (`gemini-2.5-flash`), delivering real-time factual lookups, current external documentation, and live data retrieval.
- **Interactive Citation Chips:** Grounded responses automatically present clean, clickable citation badges that link directly to authoritative search sources.

### 🧠 Intelligent Context-Aware Search Fallback
- **Three-Tier Execution Gating:** Web search operates conditionally—it evaluates the local page DOM and base model knowledge first, only dispatching external search queries when the active page context is insufficient.
- **Cross-Provider Search Fallback:** Automatically fetches and injects real-time Google Search context even when your primary inference route is configured to Groq or Cloudflare Workers AI.

### 📝 Persistent Multi-Step Agent Scratchpad
- **Stateful Task Planning:** Action Mode now features an intelligent, persistent scratchpad that tracks multi-step objectives across page navigations and iterative DOM operations.
- **Semantic Cycle Tracking:** Tracks `[OBSERVE]`, `[THINK]`, and `[ACT]` cycles across execution loops without loss of intent or context degradation.

### 🛡️ Action Loop Interceptor & Guardrails
- **Cycle Detection Engine:** Automatically intercepts repetitive actions executed against identical DOM target elements.
- **Autonomous Trajectory Correction:** Forces the model to evaluate alternative interaction strategies when an element fails to produce state changes, preventing infinite loops and token exhaustion.

### 🔄 Resilient Execution Flow ("Proceed with Task")
- **Formal State Machine:** Strict execution state transitions: `COMPLETED`, `MANUAL_ABORT`, `API_FAILURE`, and `STEP_LIMIT_REACHED`.
- **1-Click Continuation Control:** When long-horizon operations reach safe step thresholds, an inline **"Proceed with Task"** action button allows one-click continuation from the exact point of pause without resetting history or scratchpad context.

### 🎨 Refined Settings Interface
- **Human-Centric Design:** Completely redesigned settings dashboard replacing technical jargon with clear, intuitive labels and helpful inline guidance.
- **Comma-Separated Key Rotation:** Native support for comma-separated API keys across all providers with automatic round-robin failover upon HTTP 429 rate limit triggers.
- **Visual Design Alignment:** Styled with custom neon-teal accents (`#00FFC2`) directly matching `/public/icon.svg`.

### 🔗 Code-Safe Markdown Link Rendering
- **Protected Code Blocks:** Links and URIs rendered within AI responses are fully interactive without disrupting inline code spans (`` `code` ``) or fenced code blocks (` ``` `).

---

## 🏗️ Architecture & Technology Stack

ShadowStep is engineered using a modular, decoupled architecture tailored for high performance and strict encapsulation:

```
┌─────────────────────────────────────────────────────────────┐
│                     Host Webpage Context                     │
│  ┌───────────────────────────────────────────────────────┐  │
│  │             Shadow DOM Isolation Boundary             │  │
│  │   Preact 10 UI • CSS Custom Properties (all: initial) │  │
│  │   Control Panel • Spatial Canvas • Chat Tray          │  │
│  └───────────────────────────┬───────────────────────────┘  │
│                              │ Message Port                 │
│  ┌───────────────────────────▼───────────────────────────┐  │
│  │               Content Script Controller               │  │
│  │   DOM Indexing Matrix • Input Readers • Action Exec   │  │
│  └───────────────────────────┬───────────────────────────┘  │
└──────────────────────────────┼──────────────────────────────┘
                               │ chrome.runtime.sendMessage
┌──────────────────────────────▼──────────────────────────────┐
│             Background Service Worker (MV3)                 │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                 Inference Router                      │  │
│  │  • Gemini 2.5 Flash (Search Grounding & Inference)    │  │
│  │  • Groq LPU (Ultra-Fast Qwen 3.8-27b Execution)       │  │
│  │  • Cloudflare Workers AI (1:1 Edge GPU Failover)      │  │
│  └───────────────────────────────────────────────────────┘  │
│  Background CORS Fetch Relay • Rate-Limit Failover Engine    │
└─────────────────────────────────────────────────────────────┘
```

- **Frontend Framework:** Preact 10 with TypeScript and Vite.
- **Style Isolation:** Full **Shadow DOM** encapsulation (`mode: 'open'`, `all: initial`) ensuring zero CSS leakage into or out of the host webpage.
- **Extension Architecture:** Chrome Extension Manifest V3 compliant service worker with background CORS request relaying to bypass host-page CSP and CORS restrictions.
- **Multi-Tier Provider Hierarchy:**
  1. **Groq LPU:** Primary ultra-fast inference for rapid DOM reasoning and automation tasks.
  2. **Cloudflare Workers AI:** 1-to-1 paired Account ID and API Token array for automated edge fallback.
  3. **Google Gemini:** High-capability reasoning and dynamic Google Search Grounding across all routes.

---

## 🚀 Setup & Installation Guide

### Prerequisites
- A Chromium-based browser (Google Chrome, Microsoft Edge, Brave, Opera, Arc).
- **Node.js** (v18.0 or higher) and **npm**.
- At least one API key from [Google AI Studio](https://aistudio.google.com/), [Groq Console](https://console.groq.com/), or [Cloudflare Dashboard](https://dash.cloudflare.com/).

---

### Option A: Direct Store Install (Recommended)
Install ShadowStep directly from the official Microsoft Edge Add-ons Store:

👉 **[Install ShadowStep from Microsoft Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/shadowstep/iehelgmcldkldibjabnngfgfehegomgh)**

---

### Option B: Build from Source

1. **Clone the repository:**
   ```bash
   git clone https://github.com/smsram/shadowstep.git
   cd shadowstep
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Build the extension:**
   ```bash
   npm run build
   ```
   This generates an optimized, production-ready `dist/` directory.

4. **Package to `.zip` (Optional):**
   ```bash
   npm run pack
   ```
   Compiles the project and exports a clean `shadowstep.zip` directly into your `Downloads/` directory, automatically excluding `.vite/` build artifacts for seamless store submission.

5. **Load Unpacked Extension into Browser:**
   - Navigate to `chrome://extensions` or `edge://extensions`.
   - Enable **Developer mode** (toggle in upper right or bottom left).
   - Click **Load unpacked**.
   - Select the `shadowstep/dist` folder.

---

## ⚙️ Configuration Guide

Click the **ShadowStep** icon in your browser toolbar or click the **Settings (Gear)** button in the panel to configure your preferences:

### 1. Provider Credentials
- **Gemini API Keys:**
  - Enter one or more Google Gemini API keys separated by commas (`AIzaSy..., AIzaSy...`).
  - Acts as the unified credential for both Gemini model inference and real-time **Google Search Grounding**.
  - Automatically cycles keys if a request encounters HTTP 429 rate limits.
- **Groq API Keys:**
  - Enter your Groq API keys separated by commas (`gsk_..., gsk_...`).
  - Powers ultra-fast browser actions with `qwen/qwen3.8-27b`.
- **Cloudflare Workers AI (Backup & Fallback):**
  - **Account IDs:** Your Cloudflare Account ID(s), separated by commas.
  - **API Tokens:** Your Cloudflare Workers AI API Token(s), separated by commas.
  - Paired 1-to-1 with Account IDs for automatic edge failover.

### 2. General Preferences
- **Theme:** Select between **Dark** (default), **Light**, or **System** preference.
- **Display Name:** Personalize your agent greeting (e.g., `Operator`).

### 3. Chat Tray `+` Menu Features
Click the `+` icon in the input tray to toggle advanced capabilities:
- **Web Search (Toggle):** Enables real-time Google Search Grounding for current prompts (requires a configured Gemini API key).
- **Include Page Images in Context (Toggle):** Sends visual screenshot captures of the viewport for multimodal layout queries.
- **File Attachments:** Attach local images or text documents (`.pdf`, `.txt`, `.docx`) directly into the agent context.

---

## 🎮 Core Operating Modes

### 1. Chat Intelligence Mode
Ask complex questions about the active webpage, compare information across open tabs, analyze layout logic, or extract clean structured data side-by-side with your browsing viewport.

### 2. Action Mode (Autonomous Agent)
Switch from conversational mode to execution mode. ShadowStep scans the visible viewport, assigns numeric indices to interactive DOM elements, and executes atomic browser operations:
- **`[OBSERVE]`**: Evaluates active page layout, input fields, and interactive targets.
- **`[THINK]`**: Maintains structured task planning within the persistent scratchpad.
- **`[ACT]`**: Issues discrete browser commands (`CLICK #12`, `TYPE #4 "text"`, `SCROLL down`, `WAIT 2000`).
- **`[DONE]`**: Synthesizes a completion summary once all task criteria are met.

### 3. Spatial Selection Canvas
Isolate visual elements with pixel precision. Trigger the interactive selection overlay to select document sections using a rectangular bounding box or freeform lasso tool to focus the agent's attention on specific regions.

### 4. Copy/Paste Block Bypass
Extracts raw text strings directly from the DOM tree, bypassing aggressive website blockers that prevent selection, right-clicking, or copying on protected documentation portals and testing software.

---

## 🎯 Target Use Cases

| Persona | Scenario | How ShadowStep Solves It |
| :--- | :--- | :--- |
| **Software Engineers** | Navigating complex documentation hubs (Next.js, Tailwind, AWS). | Inline technical lookup, live Google Web Search grounding for latest API changes, and direct code extraction without tab switching. |
| **QA & DevOps** | Repetitive form filling, verification loops, and smoke testing. | Action Mode converts natural-language instructions into deterministic multi-step UI interaction chains with built-in loop guardrails. |
| **Researchers & Analysts** | Fact-checking live data, market stats, or breaking news. | Combines active webpage text with real-time Google Search grounding to cross-reference facts with verified citation links. |
| **Security & Privacy** | Working with sensitive internal portals and private APIs. | Zero telemetry, zero external logging. All requests dispatch strictly from local service workers directly to provider endpoints. |

---

## 📁 Repository Structure

```text
shadowstep/
├── dist/                         # Compiled extension bundle (Load unpacked)
├── public/                       # Static icons, vector assets, and brand tokens
│   ├── icon.svg                  # Source theme token (#00FFC2)
│   └── icon.png                  # Multi-resolution raster icon
├── scripts/                      # Build automation & packaging utilities
│   └── pack.js                   # Cross-platform zip archiver (excludes .vite artifacts)
├── src/
│   ├── background/               # MV3 service worker & background fetch relay
│   │   └── background.ts
│   ├── components/               # Preact UI components (Shadow DOM encapsulated)
│   │   ├── ControlPanel.tsx      # Main agent interface & execution console
│   │   ├── CustomDropdown.tsx    # Accessible floating dropdown menus
│   │   ├── FloatingMenu.tsx      # Quick-launch viewport bubble
│   │   └── SelectionOverlay.tsx  # Canvas bounding-box and lasso selector
│   ├── content/                  # DOM injection, style isolation & input scripts
│   │   └── content.ts
│   ├── core/                     # Agent execution loops, LLM client routers & tools
│   │   ├── engine.ts             # State machine, loop detector & task scheduler
│   │   ├── fileParser.ts         # Multi-credential & parameter normalization
│   │   ├── history.ts            # LRU session management & export engine
│   │   └── tools.ts              # DOM inspection & automation utilities
│   ├── app.tsx                   # Settings dashboard & provider credential hub
│   └── index.html                # Settings page HTML entry point
├── LICENSE                       # MIT License definitions
├── manifest.json                 # Extension Manifest V3 source definitions
├── package.json                  # Scripts, dependencies & build configuration
├── vite.config.ts                # Vite build configuration with @crxjs/vite-plugin
├── PRIVACY.md                    # Zero-telemetry privacy policy
└── README.md                     # Framework documentation (This file)
```

---

## 🤝 Contributing

We welcome community contributions, bug reports, and feature proposals!

1. Fork the repository.
2. Create your feature branch (`git checkout -b feature/NewCapability`).
3. Commit your changes (`git commit -m 'feat: Add support for enhanced DOM selectors'`).
4. Ensure the project builds cleanly (`npm run build`).
5. Push to the branch (`git push origin feature/NewCapability`).
6. Open a Pull Request.

> **Note:** All UI additions must strictly adhere to Preact, TypeScript, and Shadow DOM style isolation (`all: initial`) standards to guarantee zero host-page CSS contamination.

---

## 📄 License

Distributed under the **MIT License**. See [LICENSE](./LICENSE) for details.

---

<p align="center">
  <sub>Built with precision for seamless, secure, and hyper-fast web automation operations.</sub>
</p>