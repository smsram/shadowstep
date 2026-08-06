# Privacy Policy for ShadowStep

**Last Updated:** July 2026

ShadowStep ("we", "our", or "the extension") is an open-source, local and serverless LLM-powered browser automation companion built with privacy as a foundational principle. This Privacy Policy details our commitment to zero tracking, local data sovereignty, and security compliance under the Microsoft Edge Add-ons developer policies.

---

## 1. Core Privacy Philosophy: Zero Data Collection
ShadowStep operates on a strict **zero-collection data framework**. 
* **No Analytics:** We do not include tracking pixels, telemetry frameworks, analytical scripts (such as Google Analytics), or any remote profiling code within the extension bundle.
* **No External Servers:** We do not operate secondary databases or data-collection web servers to gather user metrics. 
* **No Monitization Tracking:** The extension is entirely free and open-source; we have no commercial interest in compiling or exploiting your digital footprints.

## 2. Information Processing and Data Storage
To fulfill its single purpose as a browsing companion, the extension interacts with technical context layers. Here is how that information is handled safely:

### A. Webpage and State Context
* **How it works:** When you initiate a query in "Chat Mode" or map workflows in "Action Mode", the extension processes the visible text or DOM elements of your current active tab. 
* **Sovereignty:** This processing is highly volatile and ephemeral. The raw page content is utilized strictly to formulate context prompt structures dispatched directly to your configured AI node cluster. It is never permanently saved or cached on any device outside your active runtime environment.

### B. LLM Credentials (API Keys)
* **How it works:** To connect with computing infrastructure clusters (like Groq or Cerebras), you manually input your own individual API keys into the Control Hub dashboard.
* **Sovereignty:** These credential strings are saved purely on your machine inside the browser's protected local sandbox environment using the `chrome.storage.local` API. They are never transmitted to us or any unauthorized third party. They are only sent directly to the official endpoints of the respective infrastructure provider during active query dispatches.

### C. Local Activity Logs (Session History)
* **How it works:** ShadowStep keeps a local running history queue of your recent operational session chains (up to 100 historical log threads) for user convenience.
* **Sovereignty:** This history log is managed entirely by a local storage mechanism resident inside your browser profile. You retain full administrative control over this data. You can manually rename individual logs, export session sequences into standard `.txt` files locally, delete specific entries, or execute a comprehensive cache wipe directly through the Control Panel user interface.

## 3. Third-Party API Node Handshakes
When executing prompts, ShadowStep establishes direct, secure HTTPS streaming links to the official API endpoints of your selected computing node provider (Groq or Cerebras). 
* Data payloads passed during these handshakes are governed entirely by the enterprise privacy terms of those respective providers. 
* We highly encourage you to review the developer terms of service for Groq and Cerebras regarding their individual standard text retention intervals for automated execution loops.

## 4. Source Code and Verification
Because ShadowStep is fully open-source, its entire execution structure, packaging definitions, and CSS isolation layers are auditable by the global engineering community. You can inspect the compilation logic line-by-line at any time at our official public repository:
[github.com/smsram/shadowstep](https://github.com/smsram/shadowstep)

## 5. Contact and Open Support
If you have questions regarding the local storage models utilized by this application, or wish to review security mechanisms, please open an engineering ticket directly through our public issues pipeline at:
[github.com/smsram/shadowstep/issues](https://github.com/smsram/shadowstep/issues)