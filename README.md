# ShadowStep

**An open-source, local and serverless LLM-powered browser automation companion extension.**

Repository: [github.com/smsram/shadowstep](https://github.com/smsram/shadowstep)

## Overview

ShadowStep is a privacy-first, serverless browser automation extension that runs entirely on your local machine. It empowers operators to execute advanced, multimodal browsing workflows without compromising data security. 

With its dual-mode capabilities, ShadowStep acts both as an on-demand intelligent assistant and a precise DOM manipulation engine, turning complex browsing tasks into simple, automated workflows.

## Core Utilities & Niche Application

ShadowStep is designed to assist power users, researchers, and developers who need both robust page analysis and deterministic workflow automation:
- **Analyze & Query:** Instantly query page text contents or ask general questions in a side-by-side chat view without ever leaving your active tab.
- **Automate & Dispatch:** Seamlessly switch to an action-driven layout engine that calculates DOM structures and dispatches interactions (like clicks and automated form-fills) across multiple frames.
- **Privacy-First Footprint:** Being completely serverless, ShadowStep keeps your data strictly on your machine. Your interactions and session history never touch an external cloud database.

## Feature Highlights

* **Dual Engine Mode Matrix:** Execute tasks smoothly with our hybrid approach—use *Chat Context Mode* for reading and reasoning over page data, or switch to *Automation Task Matrix Execution* for direct DOM control and dynamic interaction.
* **Full-Screen Workspace Continuity:** Both Chat and Action modes are fully operational within native full-screen viewports. There is absolutely no need to toggle out of full screen or switch apps to interact with the AI; you engage with the interface directly within the browser view.
* **Copy/Paste Block Bypass Engine:** Seamlessly read, parse, and interact with text or input field data even on hostile websites that intentionally disable standard right-click copy/paste behaviors. The internal layout scanner pulls text at the DOM layer directly.
* **Precision Extraction Canvas:** Precisely capture data with visual target selectors. Use bounding boxes or free-form lasso clips to explicitly define the exact spatial boundaries for the LLM to process.
* **Host-Contamination Shield:** Features an advanced isolated CSS Reset Shield layer (built using a secure Shadow DOM boundary), guaranteeing that complex host-page styles never pollute, break, or misalign the extension's panels and controls.
* **LRU Resilient Task Logs:** A robust local session history manager designed to safely hold up to 100 threads in an LRU (Least Recently Used) cache. Includes manual management tools for renaming, exporting to `.txt`, targeted deletion, or full history wipe.

## Directory Mapping Layout

The ShadowStep source code is functionally split for clarity and performance:

* `src/components/` — Houses the React/Preact UI interfaces. This includes the floating menus, control hubs, and our highly isolated spatial selection canvases.
* `src/core/` — Contains the background infrastructure. Here you'll find the state engines, robust history managers, and DOM action dispatchers that drive the automation mechanics.
* `src/content/` — Handles runtime script injections, Shadow DOM layer attachments, viewport text parsing, and programmatic click/input event execution loops.

## Local Setup & Build Pipelines

Ready to run ShadowStep on your local machine? Clone the repository and run the following pipeline to build the unpacked extension:

```bash
# 1. Install infrastructure dependencies
npm install

# 2. Run the production bundling script for unpackaged extension compilation
npm run build

```

Once built, you can load the `/dist` output directory into your browser's extension developer mode.

## Contributing & License

We welcome contributions from the open-source community! Whether you're fixing bugs, adding new features, or improving documentation, please feel free to open an issue or submit a pull request.

Please ensure that your code adheres to our strict architectural guidelines—especially regarding zero CSS host-pollution and keeping logic modular.

*Licensed under the MIT License.*