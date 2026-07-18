# ShadowStep

**An open-source, local and serverless LLM-powered browser automation companion extension.**

Repository: [github.com/smsram/shadowstep](https://github.com/smsram/shadowstep)

---

## 📖 Overview

ShadowStep is a privacy-first, zero-telemetry browser automation extension that runs entirely inside your local browser context. It empowers power users, developers, and researchers to execute advanced multimodal browsing workflows and chat loops without compromising data security. 

By utilizing high-speed serverless inference providers (**Groq** and **Cerebras**), ShadowStep acts as both an on-demand contextual intelligence assistant and a deterministic DOM execution agent, turning tedious browser tasks into streamlined automated pipelines.

---

## 🚀 Core Features & Capabilities

### 1. Dual Engine Mode Matrix
* **Chat Context Mode:** Engage in conversational deep-dives regarding active webpage layouts. Ask complex questions, query codebase logic, or extract structured intelligence side-by-side with your working browser viewport.
* **Automation Task Matrix:** Shift the runtime engine into absolute execution control. The automation parser analyzes visible viewport bounds, targets elements using strict numeric indices, and executes programmatic interactions sequentially.

### 2. Full-Screen Workspace Continuity
* Native support for borderless and full-screen viewports. You do not need to minimize, hit `F11`, or bounce between secondary software panels to check inputs. Engage with the isolated interface overlay directly while staying completely immersed in your active screen space.

### 3. Copy/Paste Block Bypass Engine
* Implements a layout reader that extracts inner text strings directly from the active DOM. It completely bypasses hostile website restrictions that intentionally disable native mouse selections, right-clicks, or copy/paste behaviors (e.g., restricted documentation portals or academic examination engines).

### 4. Dual AI Infrastructure Engines (Groq & Cerebras)
* Connects seamlessly with **Groq** for high-throughput, context-heavy analysis, or **Cerebras** for ultra-low latency execution loops.
* **Flexible Input Array Mapping:** The API control module natively permits entering custom parameters, model routing tags, or endpoint rules separated cleanly **with or without optional commas**, adapting instantly to your text formatting style.

### 5. Precision Spatial Selection Canvas
* Isolate exactly what you want the AI to process. Trigger custom interactive overlays to slice specific document spaces using a bounding box grid or draw a free-form lasso path to bundle visual elements into the prompt context wrapper.

### 6. Host-Contamination Shield
* Built inside a strict **Shadow DOM** boundary (`mode: 'open'`) accompanied by an explicit `all: 'initial'` global CSS rule override. This completely isolates the companion container layout, ensuring erratic, malicious, or poorly structured host-page stylesheet rules never leak, warp, or corrupt the extension's user controls.

### 7. Resilient History Cache Matrix
* A robust internal session manager designed to hold up to 100 interaction threads utilizing a strict LRU (Least Recently Used) caching policy. Includes direct administrative options to inline rename, export sessions as structured `.txt` logs, delete specific threads, or clear the entire local database.

---

## 🛠️ Comprehensive Setup & Installation Guide

### Prerequisites
* A Chromium-based browser (Microsoft Edge, Google Chrome, Brave, Opera).
* **Node.js** (v18 or higher) and **npm** installed on your machine.
* A valid developer API Key from [Groq Console](https://console.groq.com/) and/or [Cerebras Dashboard](https://dashboard.cerebras.ai/).

### 1. Compilation from Source Code
Clone the repository and compile the extension directory bundle locally using your terminal:

```bash
# Clone the repository
git clone [https://github.com/smsram/shadowstep.git](https://github.com/smsram/shadowstep.git)
cd shadowstep

# Install internal infrastructure dependencies
npm install

# Build the production-ready distribution package
npm run build

```

This compilation pass automatically prepares a highly optimized, clean `/dist` folder inside your project directory.

### 2. Loading into the Browser

1. Open your browser and navigate to the extension administration view (Edge: `edge://extensions` | Chrome: `chrome://extensions`).
2. Toggle the **Developer mode** switch in the lower-left or upper-right menu array.
3. Click the **Load unpacked** button.
4. Select the freshly generated **`/dist`** folder located inside your local project path (`shadowstep/dist`).

---

## 🔧 Configuring the AI Hub (Groq & Cerebras)

Once loaded, click the **ShadowStep** icon in your extension bar to wake up the interface, then open the **Control Hub Settings Gear**:

1. **Inference Token Insertion:** Paste your authorization keys into the corresponding **Groq API Key** or **Cerebras API Key** text fields. These strings are stored strictly inside your browser's protected local vault (`chrome.storage.local`).
2. **Flexible Parameter Strings:** When targeting specific model variations or adjusting configuration flags, you can provide parameters as raw strings or as lists separated by optional commas (e.g., `llama3-70b, llama3-8b` or `llama3-70b llama3-8b`). The regex engine normalizes both configurations smoothly.

---

## 🎯 Targeted Use Cases & Practical Applications

| User Persona | Application Scenario | How ShadowStep Solves It |
| --- | --- | --- |
| **Software Developers** | Navigating heavy documentation hubs (e.g., Next.js, Prisma, React Native). | Keeps technical queries inline. Summarizes APIs, writes setup files in Chat Mode, and injects clean code logic templates directly without app-switching. |
| **Automation Engineers** | Executing form entries, database checks, or setup testing. | Action Mode converts human layout prompts into deterministic step actions (`[SYS]`, `[DOM]`, `[ACT]`) to fill out forms and click UI chains automatically. |
| **Students & Researchers** | Reading protected portals, academic sheets, or locked PDFs. | The Copy/Paste Bypass Engine extracts hidden text fields and text contents straight from the source code structure, bypassing site blocks effortlessly. |
| **Privacy Enthusiasts** | Handling secure internal keys and confidential data text. | Operates on a true zero-tracking architecture. Prompts stream directly to official endpoints; no data is logged to secondary databases or analytics companies. |

---

## 📁 Directory Architecture Mapping

```text
shadowstep/
├── dist/                         # Compiled bundle loaded directly into the browser
├── src/
│   ├── components/               # Preact UI components (ControlPanel, Canvas selectors, Hub panels)
│   ├── core/                     # Automation engines, storage state handlers, and LLM controllers
│   ├── content/                  # Injection scripts, DOM mapping structures, and Shadow DOM shields
│   └── manifest.json             # Core Extension Manifest V3 configuration definitions
├── PRIVACY.md                    # Store-compliant zero-tracking privacy assurance markdown
└── README.md                     # Comprehensive framework guidebook (This file)

```

---

## 🤝 Contributing & Extension Integrity

We highly welcome community contributions! If you map out custom node pipelines, improve DOM click targets, or implement advanced lasso tracking hooks:

1. Fork the repository layout.
2. Create a clean feature branch (`git checkout -b feature/AmazingCapability`).
3. Commit your layout updates (`git commit -m 'Add support for unique selector mechanics'`).
4. Open a formal Pull Request.

*Note: All additions must rigorously preserve the Shadow DOM style isolation framework to guarantee zero host-page CSS contamination.*

---

## 📄 License

Distributed under the official **MIT License**. See `LICENSE` inside the repository structure for deeper parameter insights.

```
🔹 *Built with precision for seamless, secure, and hyper-fast web automation operations.* 🔹