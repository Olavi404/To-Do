import { getStore } from "@netlify/blobs";

const store = getStore("shared-todo");
const TASKS_KEY = "tasks";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function load() {
  return (await store.getJSON(TASKS_KEY)) || [];
}

async function save(tasks) {
  await store.setJSON(TASKS_KEY, tasks);
}

function makeId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default async (request) => {
  try {
    if (request.method === "GET") {
      const tasks = await load();
      return json({ tasks });
    }

    if (request.method === "POST") {
      const body = await request.json();
      const text = String(body?.text || "").trim();
      if (!text) return json({ error: "Task text is required" }, 400);

      const tasks = await load();
      tasks.unshift({
        id: makeId(),
        text,
        completed: false,
        createdAt: new Date().toISOString(),
      });
      await save(tasks);
      return json({ ok: true });
    }

    if (request.method === "PUT") {
      const body = await request.json();
      const id = String(body?.id || "");
      if (!id) return json({ error: "Task id is required" }, 400);

      const tasks = await load();
      const index = tasks.findIndex((task) => task.id === id);
      if (index === -1) return json({ error: "Task not found" }, 404);

      const updated = {
        ...tasks[index],
        ...(typeof body.text === "string" ? { text: body.text.trim() } : {}),
        ...(typeof body.completed === "boolean" ? { completed: body.completed } : {}),
        updatedAt: new Date().toISOString(),
      };

      if (!updated.text) return json({ error: "Task text cannot be empty" }, 400);

      tasks[index] = updated;
      await save(tasks);
      return json({ ok: true });
    }

    if (request.method === "DELETE") {
      const body = await request.json();

      if (body?.clearCompleted) {
        const tasks = await load();
        const nextTasks = tasks.filter((task) => !task.completed);
        await save(nextTasks);
        return json({ ok: true });
      }

      const id = String(body?.id || "");
      if (!id) return json({ error: "Task id is required" }, 400);

      const tasks = await load();
      const nextTasks = tasks.filter((task) => task.id !== id);
      if (nextTasks.length === tasks.length) {
        return json({ error: "Task not found" }, 404);
      }

      await save(nextTasks);
      return json({ ok: true });
    }

    return json({ error: "Method not allowed" }, 405);
  } catch (error) {
    return json({ error: error?.message || "Unexpected error" }, 500);
  }
};
