const listEl = document.getElementById("todo-list");
const formEl = document.getElementById("todo-form");
const inputEl = document.getElementById("todo-input");
const labelEl = document.getElementById("todo-label");
const refreshBtn = document.getElementById("refresh-btn");
const clearCompletedBtn = document.getElementById("clear-completed-btn");
const counterEl = document.getElementById("counter");
const statusEl = document.getElementById("status");
const lastUpdatedEl = document.getElementById("last-updated");
const historyListEl = document.getElementById("history-list");
const template = document.getElementById("todo-item-template");
const filterButtons = document.querySelectorAll(".filter-btn");
const labelFilterButtons = document.querySelectorAll(".label-filter-btn");

const ALLOWED_LABELS = ["General", "Work", "Home", "Urgent"];

let tasks = [];
let historyItems = [];
let activeFilter = "active";
let activeLabelFilter = "all";
let loadInFlight = false;
let lastSyncedAt = null;
let pollHandle;
let relativeTimeHandle;

function setStatus(message) {
  statusEl.textContent = message;
}

function taskCountLabel(count) {
  return `${count} ${count === 1 ? "task" : "tasks"}`;
}

function normalizeLabel(value) {
  const label = String(value || "").trim();
  return ALLOWED_LABELS.includes(label) ? label : "General";
}

function relativeTime(fromDate) {
  if (!fromDate) return "not yet";

  const diffSeconds = Math.max(0, Math.floor((Date.now() - fromDate.getTime()) / 1000));
  if (diffSeconds < 10) return "just now";
  if (diffSeconds < 60) return `${diffSeconds}s ago`;

  const minutes = Math.floor(diffSeconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

function updateLastUpdatedText() {
  lastUpdatedEl.textContent = `Last updated: ${relativeTime(lastSyncedAt)}`;
}

function renderHistory() {
  historyListEl.textContent = "";

  if (historyItems.length === 0) {
    const item = document.createElement("li");
    item.className = "history-item";
    item.textContent = "No activity yet";
    historyListEl.append(item);
    return;
  }

  for (const event of historyItems) {
    const item = document.createElement("li");
    item.className = "history-item";

    const message = document.createElement("span");
    message.textContent = event.message;

    const when = document.createElement("span");
    when.className = "history-time";
    const eventDate = event.at ? new Date(event.at) : null;
    when.textContent = relativeTime(eventDate);

    item.append(message, when);
    historyListEl.append(item);
  }
}

function getRenderableTasks() {
  return tasks;
}

function getVisibleTasks() {
  let filtered = getRenderableTasks();

  if (activeFilter === "active") {
    filtered = filtered.filter((task) => !task.completed);
  }

  if (activeFilter === "done") {
    filtered = filtered.filter((task) => task.completed);
  }

  if (activeLabelFilter !== "all") {
    filtered = filtered.filter((task) => normalizeLabel(task.label) === activeLabelFilter);
  }

  return filtered;
}

function render() {
  listEl.textContent = "";
  const visibleTasks = getVisibleTasks();

  for (const task of visibleTasks) {
    const node = template.content.firstElementChild.cloneNode(true);
    const toggle = node.querySelector(".toggle");
    const text = node.querySelector(".todo-text");
    const taskLabel = node.querySelector(".task-label");
    const deleteBtn = node.querySelector(".delete-btn");

    node.dataset.id = task.id;
    node.classList.toggle("done", task.completed);

    toggle.checked = task.completed;
    text.value = task.text;
    taskLabel.value = normalizeLabel(task.label);

    toggle.addEventListener("change", async () => {
      await updateTask(task.id, { completed: toggle.checked });
    });

    text.addEventListener("change", async () => {
      const value = text.value.trim();
      if (!value) {
        text.value = task.text;
        return;
      }
      await updateTask(task.id, { text: value });
    });

    taskLabel.addEventListener("change", async () => {
      await updateTask(task.id, { label: taskLabel.value });
    });

    deleteBtn.addEventListener("click", async () => {
      await deleteTask(task.id);
      setStatus("Task deleted");
    });

    listEl.append(node);
  }

  const renderable = getRenderableTasks();
  const doneCount = renderable.filter((task) => task.completed).length;
  counterEl.textContent = `${taskCountLabel(renderable.length)} | ${doneCount} done`;

  clearCompletedBtn.disabled = doneCount === 0;

  for (const button of filterButtons) {
    button.classList.toggle("is-active", button.dataset.filter === activeFilter);
  }

  for (const button of labelFilterButtons) {
    button.classList.toggle("is-active", button.dataset.labelFilter === activeLabelFilter);
  }

  renderHistory();
}

async function request(path, options = {}) {
  const response = await fetch(path, {
    headers: { "content-type": "application/json" },
    ...options,
  });

  if (!response.ok) {
    let details = "Request failed";
    try {
      const payload = await response.json();
      details = payload.error || details;
    } catch {
      // Keep default message if body is not JSON.
    }
    throw new Error(details);
  }

  return response.json();
}

async function loadTasks({ silent = false } = {}) {
  if (loadInFlight) return;
  loadInFlight = true;
  if (!silent) setStatus("Loading...");
  try {
    const payload = await request("/.netlify/functions/todos");
    tasks = payload.tasks.map((task) => ({
      ...task,
      label: normalizeLabel(task.label),
    }));
    historyItems = Array.isArray(payload.history) ? payload.history : [];
    lastSyncedAt = new Date();
    render();
    if (!silent) setStatus("Synced");
    updateLastUpdatedText();
  } finally {
    loadInFlight = false;
  }
}

async function addTask(text, label) {
  await request("/.netlify/functions/todos", {
    method: "POST",
    body: JSON.stringify({ text, label }),
  });
  await loadTasks();
}

async function updateTask(id, patch) {
  await request("/.netlify/functions/todos", {
    method: "PUT",
    body: JSON.stringify({ id, ...patch }),
  });
  await loadTasks();
}

async function deleteTask(id) {
  await request("/.netlify/functions/todos", {
    method: "DELETE",
    body: JSON.stringify({ id }),
  });
  await loadTasks();
}

async function clearCompleted() {
  await request("/.netlify/functions/todos", {
    method: "DELETE",
    body: JSON.stringify({ clearCompleted: true }),
  });
  await loadTasks();
}

formEl.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = inputEl.value.trim();
  const label = normalizeLabel(labelEl.value);
  if (!text) return;

  inputEl.disabled = true;
  labelEl.disabled = true;
  try {
    await addTask(text, label);
    inputEl.value = "";
    labelEl.value = "General";
    setStatus("Task added");
  } catch (error) {
    setStatus(error.message);
  } finally {
    inputEl.disabled = false;
    labelEl.disabled = false;
    inputEl.focus();
  }
});

refreshBtn.addEventListener("click", async () => {
  try {
    await loadTasks();
  } catch (error) {
    setStatus(error.message);
  }
});

clearCompletedBtn.addEventListener("click", async () => {
  clearCompletedBtn.disabled = true;
  try {
    await clearCompleted();
    setStatus("Completed tasks cleared");
  } catch (error) {
    setStatus(error.message);
  }
});

for (const button of filterButtons) {
  button.addEventListener("click", () => {
    activeFilter = button.dataset.filter || "all";
    render();
  });
}

for (const button of labelFilterButtons) {
  button.addEventListener("click", () => {
    activeLabelFilter = button.dataset.labelFilter || "all";
    render();
  });
}

function startAutoRefresh() {
  pollHandle = window.setInterval(async () => {
    try {
      await loadTasks({ silent: true });
    } catch {
      // Keep app usable if a polling request fails.
    }
  }, 5000);
}

function startRelativeTimeTicker() {
  relativeTimeHandle = window.setInterval(() => {
    updateLastUpdatedText();
    renderHistory();
  }, 30000);
}

loadTasks().catch((error) => {
  setStatus(error.message);
});

startAutoRefresh();
startRelativeTimeTicker();
