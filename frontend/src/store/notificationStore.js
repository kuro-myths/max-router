/**
 * Global notification store.
 * Toasts are transient; notification history is persisted per signed-in browser.
 */
import { create } from "zustand";

let idCounter = 0;

function readHistory() {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem("max-router-notification-history") || "[]");
    return Array.isArray(parsed) ? parsed.slice(-100) : [];
  } catch {
    return [];
  }
}

function persistHistory(history) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem("max-router-notification-history", JSON.stringify(history.slice(-100)));
  } catch {
    // Storage may be disabled or full; active toasts still work in memory.
  }
}

export const useNotificationStore = create((set, get) => ({
  notifications: [],
  history: readHistory(),

  addNotification: (notification) => {
    const id = Date.now() * 1000 + (++idCounter % 1000);
    const entry = {
      id,
      type: notification.type || "info",
      message: String(notification.message || ""),
      title: notification.title || null,
      duration: notification.duration ?? 5000,
      dismissible: notification.dismissible ?? true,
      createdAt: Date.now(),
      read: false,
    };
    const history = [...get().history, entry].slice(-100);
    persistHistory(history);
    set((state) => ({ notifications: [...state.notifications, entry], history }));

    if (entry.duration > 0) {
      setTimeout(() => get().removeNotification(id), entry.duration);
    }
    return id;
  },

  removeNotification: (id) => set((state) => ({
    notifications: state.notifications.filter((item) => item.id !== id),
  })),

  markRead: (id) => {
    const history = get().history.map((item) => item.id === id ? { ...item, read: true } : item);
    persistHistory(history);
    set({ history });
  },

  markAllRead: () => {
    const history = get().history.map((item) => ({ ...item, read: true }));
    persistHistory(history);
    set({ history });
  },

  clearHistory: () => {
    persistHistory([]);
    set({ history: [] });
  },

  clearAll: () => set({ notifications: [] }),

  success: (message, title) => get().addNotification({ type: "success", message, title }),
  error: (message, title) => get().addNotification({ type: "error", message, title, duration: 8000 }),
  warning: (message, title) => get().addNotification({ type: "warning", message, title }),
  info: (message, title) => get().addNotification({ type: "info", message, title }),
}));
