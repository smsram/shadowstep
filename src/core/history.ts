/**
 * @file history.ts
 * @description Manages local task history and session logs for the ShadowStep extension.
 * Responsible for loading, saving, renaming, and clearing chat threads in a rate-limit resilient manner.
 *
 * @dependencies
 * - Chrome Extension Storage (chrome.storage.local) for persistence.
 *
 * @interfaces
 * - Message: Represents a single query or agent action log.
 * - ChatThread: Represents a full interaction session bounded to an LRU cache (100 max).
 */

export interface Message {
  id: string;
  role: 'user' | 'agent';
  text: string;
  logs: string[];
  status: 'idle' | 'working' | 'done' | 'aborted';
}

export interface ChatThread {
  id: string;
  title: string;
  updatedAt: number;
  messages: Message[];
}

export const HistoryManager = {
  async loadThreads(): Promise<ChatThread[]> {
    if (typeof chrome === 'undefined' || !chrome.storage) return [];
    return new Promise((resolve) => {
      chrome.storage.local.get(['shadowstep_chat_history'], (result) => {
        const data = result.shadowstep_chat_history as ChatThread[] | undefined;
        resolve(data || []);
      });
    });
  },

  async saveThread(threadId: string, messages: Message[]): Promise<ChatThread[]> {
    if (typeof chrome === 'undefined' || !chrome.storage) return [];
    if (messages.length === 0) return this.loadThreads();

    let threads = await this.loadThreads();
    const existingIndex = threads.findIndex(t => t.id === threadId);
    
    let currentThread: ChatThread;
    let title = 'New Task';
    
    const firstUser = messages.find(m => m.role === 'user');
    if (firstUser) {
      title = firstUser.text.substring(0, 35).replace(/\n/g, ' ') + (firstUser.text.length > 35 ? '...' : '');
    }

    if (existingIndex > -1) {
      currentThread = threads[existingIndex];
      currentThread.messages = messages;
      currentThread.updatedAt = Date.now();
      if (currentThread.title === 'New Task' || !currentThread.title.endsWith('(Renamed)')) {
        currentThread.title = title;
      }
      threads.splice(existingIndex, 1);
    } else {
      currentThread = { id: threadId, title, updatedAt: Date.now(), messages };
    }

    threads.unshift(currentThread);
    if (threads.length > 100) threads = threads.slice(0, 100);

    return new Promise((resolve) => {
       chrome.storage.local.set({ shadowstep_chat_history: threads }, () => resolve(threads));
    });
  },

  async deleteThread(threadId: string): Promise<ChatThread[]> {
    let threads = await this.loadThreads();
    threads = threads.filter(t => t.id !== threadId);
    return new Promise(resolve => chrome.storage.local.set({ shadowstep_chat_history: threads }, () => resolve(threads)));
  },

  async renameThread(threadId: string, newTitle: string): Promise<ChatThread[]> {
    let threads = await this.loadThreads();
    const thread = threads.find(t => t.id === threadId);
    if (thread) {
      thread.title = newTitle;
      thread.updatedAt = Date.now();
    }
    return new Promise(resolve => chrome.storage.local.set({ shadowstep_chat_history: threads }, () => resolve(threads)));
  },

  async clearAll(): Promise<ChatThread[]> {
    return new Promise(resolve => chrome.storage.local.set({ shadowstep_chat_history: [] }, () => resolve([])));
  }
};