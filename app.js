const listEl = document.getElementById("todo-list");
const formEl = document.getElementById("todo-form");
const inputEl = document.getElementById("todo-input");
const refreshBtn = document.getElementById("refresh-btn");
const clearCompletedBtn = document.getElementById("clear-completed-btn");
const counterEl = document.getElementById("counter");
const statusEl = document.getElementById("status");
const template = document.getElementById("todo-item-template");
const filterButtons = document.querySelectorAll(".filter-btn");

let tasks = [];
let activeFilter = "all";
let loadInFlight = false;
let pollHandle;

function setStatus(message) {
  statusEl.textContent = message;
}

function taskCountLabel(count) {
  return `${count} ${count === 1 ? "task" : "tasks"}`;
}

function getVisibleTasks() {
  if (activeFilter === "active") {
    return tasks.filter((task) => !task.completed);
  }

  if (activeFilter === "done") {
    return tasks.filter((task) => task.completed);
  }

  return tasks;
}

function render() {
  listEl.textContent = "";
  const visibleTasks = getVisibleTasks();

  for (const task of visibleTasks) {
    const node = template.content.firstElementChild.cloneNode(true);
    const toggle = node.querySelector(".toggle");
    const text = node.querySelector(".todo-text");
    const deleteBtn = node.querySelector(".delete-btn");

    node.dataset.id = task.id;
    node.classList.toggle("done", task.completed);

    toggle.checked = task.completed;
    text.value = task.text;

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

    deleteBtn.addEventListener("click", async () => {
      await deleteTask(task.id);
    });

    listEl.append(node);
  }

  const doneCount = tasks.filter((task) => task.completed).length;
  counterEl.textContent = `${taskCountLabel(tasks.length)} | ${doneCount} done`;

  clearCompletedBtn.disabled = doneCount === 0;

  for (const button of filterButtons) {
    button.classList.toggle("is-active", button.dataset.filter === activeFilter);
  }
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

async function loadTasks() {
  if (loadInFlight) return;
  loadInFlight = true;
  setStatus("Loading...");
  try {
    const payload = await request("/.netlify/functions/todos");
    tasks = payload.tasks;
    render();
    setStatus("Synced");
  } finally {
    loadInFlight = false;
  }
}

async function addTask(text) {
  await request("/.netlify/functions/todos", {
    method: "POST",
    body: JSON.stringify({ text }),
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
  if (!text) return;

  inputEl.disabled = true;
  try {
    await addTask(text);
    inputEl.value = "";
    setStatus("Task added");
  } catch (error) {
    setStatus(error.message);
  } finally {
    inputEl.disabled = false;
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

function startAutoRefresh() {
  pollHandle = window.setInterval(async () => {
    try {
      await loadTasks();
    } catch {
      // Keep app usable if a polling request fails.
    }
  }, 5000);
}

loadTasks().catch((error) => {
  setStatus(error.message);
});

startAutoRefresh();
