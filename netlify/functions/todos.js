import { getStore } from "@netlify/blobs";

const TASKS_KEY = "tasks";
const HISTORY_KEY = "history";
const ALLOWED_LABELS = ["General", "Work", "Home", "Urgent"];
const MAX_HISTORY_ITEMS = 30;

function getTodoStore() {
  return getStore("shared-todo");
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function load() {
  const store = getTodoStore();
  const raw = await store.get(TASKS_KEY);
  if (!raw) return [];

  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function loadHistory() {
  const store = getTodoStore();
  const raw = await store.get(HISTORY_KEY);
  if (!raw) return [];

  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function save(tasks) {
  const store = getTodoStore();
  await store.set(TASKS_KEY, JSON.stringify(tasks));
}

async function saveHistory(history) {
  const store = getTodoStore();
  await store.set(HISTORY_KEY, JSON.stringify(history));
}

function makeId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeLabel(value) {
  const label = String(value || "").trim();
  return ALLOWED_LABELS.includes(label) ? label : "General";
}

function clipText(value) {
  const text = String(value || "").trim();
  if (text.length <= 36) return text;
  return `${text.slice(0, 33)}...`;
}

async function pushHistory(message) {
  const history = await loadHistory();
  history.unshift({
    id: makeId(),
    message,
    at: new Date().toISOString(),
  });

  if (history.length > MAX_HISTORY_ITEMS) {
    history.length = MAX_HISTORY_ITEMS;
  }

  await saveHistory(history);
}

export default async (request) => {
  try {
    if (request.method === "GET") {
      const tasks = await load();
      const history = await loadHistory();
      return json({ tasks, history });
    }

    if (request.method === "POST") {
      const body = await request.json();
      const text = String(body?.text || "").trim();
      const label = normalizeLabel(body?.label);
      if (!text) return json({ error: "Task text is required" }, 400);

      const tasks = await load();
      tasks.unshift({
        id: makeId(),
        text,
        label,
        completed: false,
        createdAt: new Date().toISOString(),
      });
      await save(tasks);
      await pushHistory(`Added \"${clipText(text)}\" [${label}]`);
      return json({ ok: true });
    }

    if (request.method === "PUT") {
      const body = await request.json();
      const id = String(body?.id || "");
      if (!id) return json({ error: "Task id is required" }, 400);

      const tasks = await load();
      const index = tasks.findIndex((task) => task.id === id);
      if (index === -1) return json({ error: "Task not found" }, 404);
      const existing = tasks[index];

      const updated = {
        ...existing,
        ...(typeof body.text === "string" ? { text: body.text.trim() } : {}),
        ...(body?.label !== undefined ? { label: normalizeLabel(body.label) } : {}),
        ...(typeof body.completed === "boolean" ? { completed: body.completed } : {}),
        updatedAt: new Date().toISOString(),
      };

      if (!updated.text) return json({ error: "Task text cannot be empty" }, 400);

      tasks[index] = updated;
      await save(tasks);

      if (existing.completed !== updated.completed) {
        await pushHistory(`${updated.completed ? "Completed" : "Reopened"} \"${clipText(updated.text)}\"`);
      }

      if (existing.text !== updated.text) {
        await pushHistory(`Renamed \"${clipText(existing.text)}\" to \"${clipText(updated.text)}\"`);
      }

      if (existing.label !== updated.label) {
        await pushHistory(`Relabeled \"${clipText(updated.text)}\" to [${updated.label}]`);
      }

      return json({ ok: true });
    }

    if (request.method === "DELETE") {
      const body = await request.json();

      if (body?.clearCompleted) {
        const tasks = await load();
        const removed = tasks.filter((task) => task.completed).length;
        const nextTasks = tasks.filter((task) => !task.completed);
        await save(nextTasks);
        if (removed > 0) {
          await pushHistory(`Cleared ${removed} completed ${removed === 1 ? "task" : "tasks"}`);
        }
        return json({ ok: true });
      }

      const id = String(body?.id || "");
      if (!id) return json({ error: "Task id is required" }, 400);

      const tasks = await load();
      const deleted = tasks.find((task) => task.id === id);
      const nextTasks = tasks.filter((task) => task.id !== id);
      if (nextTasks.length === tasks.length) {
        return json({ error: "Task not found" }, 404);
      }

      await save(nextTasks);
      if (deleted) {
        await pushHistory(`Deleted \"${clipText(deleted.text)}\"`);
      }
      return json({ ok: true });
    }

    return json({ error: "Method not allowed" }, 405);
  } catch (error) {
    return json({ error: error?.message || "Unexpected error" }, 500);
  }
};
