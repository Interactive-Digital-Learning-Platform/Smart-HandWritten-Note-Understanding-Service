"use strict";

const state = { expertId: "", accessKey: "", task: null, imageUrls: [] };
const byId = (id) => document.getElementById(id);
const expertUiPath = "/expert-annotation";
const expertUiIndex = window.location.pathname.indexOf(expertUiPath);
const servicePrefix = expertUiIndex >= 0
  ? window.location.pathname.slice(0, expertUiIndex).replace(/\/$/, "")
  : "";
const expertApiBase = `${servicePrefix}/api/expert-annotations`;

const api = async (path, options = {}) => {
  const response = await fetch(`${expertApiBase}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${state.accessKey}`,
      "X-Expert-Id": state.expertId,
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.success) {
    throw new Error(payload.error || `Request failed (${response.status})`);
  }
  return payload.data;
};

const setAuthenticated = (authenticated) => {
  byId("login-view").classList.toggle("hidden", authenticated);
  byId("workspace").classList.toggle("hidden", !authenticated);
  if (authenticated) byId("identity").textContent = state.expertId;
};

const loadSummary = async () => {
  const data = await api("/summary");
  const summary = byId("summary");
  summary.replaceChildren();
  for (const status of ["queued", "in_review", "submitted", "rejected"]) {
    const pill = document.createElement("span");
    pill.textContent = `${status.replace("_", " ")}: ${data.counts[status] || 0}`;
    summary.append(pill);
  }
};

const loadTasks = async () => {
  const status = byId("status-filter").value;
  const data = await api(`/tasks?status=${encodeURIComponent(status)}&limit=50`);
  const list = byId("task-list");
  list.replaceChildren();
  if (!data.tasks.length) {
    const message = document.createElement("p");
    message.className = "muted";
    message.textContent = "No tasks in this queue.";
    list.append(message);
    return;
  }
  for (const task of data.tasks) {
    const button = document.createElement("button");
    button.className = "task-card";
    button.dataset.taskId = task._id;
    const title = document.createElement("strong");
    title.textContent = task.lessonName;
    const meta = document.createElement("small");
    meta.textContent = `Grade ${task.grade} · ${task.language} · ${task.pageCount} page(s) · ${task.conceptCount} concepts`;
    const assignment = document.createElement("small");
    assignment.textContent = task.assignedExpertId
      ? `Assigned to ${task.assignedExpertId}`
      : `Priority ${task.priority}`;
    button.append(title, meta, assignment);
    button.addEventListener("click", () => openTask(task._id));
    list.append(button);
  }
};

const revokeImages = () => {
  for (const url of state.imageUrls) URL.revokeObjectURL(url);
  state.imageUrls = [];
};

const loadImages = async (task) => {
  revokeImages();
  const container = byId("page-images");
  container.replaceChildren();
  for (let page = 1; page <= task.pageCount; page += 1) {
    const response = await fetch(`${expertApiBase}/tasks/${task._id}/images/${page}`, {
      headers: {
        Authorization: `Bearer ${state.accessKey}`,
        "X-Expert-Id": state.expertId,
      },
    });
    if (!response.ok) continue;
    const url = URL.createObjectURL(await response.blob());
    state.imageUrls.push(url);
    const figure = document.createElement("figure");
    const image = document.createElement("img");
    image.src = url;
    image.alt = `Handwritten note page ${page}`;
    const caption = document.createElement("figcaption");
    caption.textContent = `Page ${page}`;
    figure.append(image, caption);
    container.append(figure);
  }
};

const conceptCard = (concept, pageCount) => {
  const card = document.createElement("article");
  card.className = "concept-card";
  card.dataset.conceptId = concept.conceptId;
  const header = document.createElement("header");
  const heading = document.createElement("h3");
  heading.textContent = concept.conceptName;
  const system = document.createElement("span");
  system.className = "system-pill";
  system.textContent = `System: ${concept.systemStatus} (${Math.round(concept.systemConfidence * 100)}%)`;
  header.append(heading, system);
  const details = document.createElement("p");
  details.className = "muted";
  details.textContent = `${concept.category} · weight ${concept.weight}${concept.learningOutcomes.length ? ` · ${concept.learningOutcomes.join("; ")}` : ""}`;
  const options = document.createElement("div");
  options.className = "label-options";
  for (const label of ["present", "partial", "missing"]) {
    const wrapper = document.createElement("label");
    const input = document.createElement("input");
    input.type = "radio";
    input.name = `verdict-${concept.conceptId}`;
    input.value = label;
    input.checked = concept.expertVerdict === label;
    wrapper.append(input, document.createTextNode(label));
    options.append(wrapper);
  }
  const evidenceGrid = document.createElement("div");
  evidenceGrid.className = "evidence-grid";
  const pageLabel = document.createElement("label");
  pageLabel.textContent = "Evidence page";
  const page = document.createElement("input");
  page.type = "number";
  page.className = "evidence-page";
  page.min = "1";
  page.max = String(pageCount);
  page.value = concept.evidencePage || "";
  pageLabel.append(page);
  const evidenceLabel = document.createElement("label");
  evidenceLabel.textContent = "Exact evidence text";
  const evidence = document.createElement("textarea");
  evidence.className = "evidence-text";
  evidence.rows = 3;
  evidence.value = concept.evidenceText || "";
  evidenceLabel.append(evidence);
  evidenceGrid.append(pageLabel, evidenceLabel);
  const notesLabel = document.createElement("label");
  notesLabel.textContent = "Reviewer notes (optional)";
  const notes = document.createElement("textarea");
  notes.className = "reviewer-notes";
  notes.rows = 2;
  notes.value = concept.reviewerNotes || "";
  notesLabel.append(notes);
  card.append(header, details, options, evidenceGrid, notesLabel);
  return card;
};

const openTask = async (id) => {
  try {
    const task = await api(`/tasks/${id}`);
    state.task = task;
    document.querySelectorAll(".task-card").forEach((card) =>
      card.classList.toggle("active", card.dataset.taskId === id)
    );
    byId("empty-state").classList.add("hidden");
    byId("review-panel").classList.remove("hidden");
    byId("task-id").textContent = task.noteGroupId;
    byId("task-title").textContent = task.lessonName;
    byId("task-meta").textContent = `Grade ${task.grade} · ${task.subject} · ${task.language} · ${task.pageCount} page(s)`;
    byId("raw-ocr").value = task.rawOcrText;
    byId("corrected-text").value = task.correctedText;
    byId("subject-confirmed").checked = Boolean(task.subjectConfirmed);
    byId("lesson-confirmed").checked = Boolean(task.lessonConfirmed);
    byId("flag-wrong-lesson").checked = Boolean(task.flags.wrongLesson);
    byId("flag-unreadable").checked = Boolean(task.flags.unreadable);
    byId("flag-duplicate").checked = Boolean(task.flags.duplicate);
    byId("flag-pii").checked = Boolean(task.flags.containsPersonalData);
    byId("overall-notes").value = task.overallNotes || "";
    const editable = task.status === "in_review" && task.assignedExpertId === state.expertId;
    byId("claim-task").disabled = editable || !["queued", "in_review"].includes(task.status);
    byId("claim-task").textContent = editable ? "Claimed by you" : "Claim task";
    byId("coverage-review-link").hidden = task.language !== "English" || task.assignedExpertId !== state.expertId || !["in_review", "submitted", "approved"].includes(task.status);
    byId("coverage-review-link").href = `${servicePrefix}/english-coverage/?taskId=${encodeURIComponent(task._id)}`;
    byId("save-draft").disabled = !editable;
    byId("submit-review").disabled = !editable;
    const concepts = byId("concept-list");
    concepts.replaceChildren(...task.concepts.map((concept) => conceptCard(concept, task.pageCount)));
    await loadImages(task);
  } catch (error) {
    byId("save-status").textContent = error.message;
  }
};

const collectPayload = () => ({
  correctedText: byId("corrected-text").value,
  subjectConfirmed: byId("subject-confirmed").checked,
  lessonConfirmed: byId("lesson-confirmed").checked,
  flags: {
    wrongLesson: byId("flag-wrong-lesson").checked,
    unreadable: byId("flag-unreadable").checked,
    duplicate: byId("flag-duplicate").checked,
    containsPersonalData: byId("flag-pii").checked,
  },
  overallNotes: byId("overall-notes").value,
  concepts: Array.from(document.querySelectorAll(".concept-card")).map((card) => {
    const verdict = card.querySelector("input[type=radio]:checked");
    const page = card.querySelector(".evidence-page").value;
    return {
      conceptId: card.dataset.conceptId,
      verdict: verdict ? verdict.value : undefined,
      evidencePage: page ? Number(page) : undefined,
      evidenceText: card.querySelector(".evidence-text").value,
      reviewerNotes: card.querySelector(".reviewer-notes").value,
    };
  }),
});

byId("login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  state.expertId = byId("expert-id").value.trim();
  state.accessKey = byId("access-key").value;
  try {
    await api("/summary");
    sessionStorage.setItem("expertId", state.expertId);
    sessionStorage.setItem("expertAccessKey", state.accessKey);
    byId("login-error").textContent = "";
    setAuthenticated(true);
    await Promise.all([loadSummary(), loadTasks()]);
  } catch (error) {
    byId("login-error").textContent = error.message;
  }
});

byId("logout").addEventListener("click", () => {
  sessionStorage.clear();
  state.expertId = "";
  state.accessKey = "";
  state.task = null;
  revokeImages();
  setAuthenticated(false);
});
byId("refresh").addEventListener("click", () => Promise.all([loadSummary(), loadTasks()]));
byId("status-filter").addEventListener("change", loadTasks);
byId("claim-task").addEventListener("click", async () => {
  if (!state.task) return;
  try {
    await api(`/tasks/${state.task._id}/claim`, { method: "POST", body: "{}" });
    await openTask(state.task._id);
    await loadTasks();
  } catch (error) { byId("save-status").textContent = error.message; }
});
byId("save-draft").addEventListener("click", async () => {
  if (!state.task) return;
  try {
    await api(`/tasks/${state.task._id}/draft`, {
      method: "PATCH",
      body: JSON.stringify(collectPayload()),
    });
    byId("save-status").textContent = "Draft saved.";
  } catch (error) { byId("save-status").textContent = error.message; }
});
byId("submit-review").addEventListener("click", async () => {
  if (!state.task || !window.confirm("Submit this expert review? It will become eligible for the next dataset release.")) return;
  try {
    const result = await api(`/tasks/${state.task._id}/submit`, {
      method: "POST",
      body: JSON.stringify(collectPayload()),
    });
    byId("save-status").textContent = `Submitted: ${result.annotations} annotations.`;
    await Promise.all([loadSummary(), loadTasks()]);
    await openTask(state.task._id);
  } catch (error) { byId("save-status").textContent = error.message; }
});

state.expertId = sessionStorage.getItem("expertId") || "";
state.accessKey = sessionStorage.getItem("expertAccessKey") || "";
if (state.expertId && state.accessKey) {
  api("/summary")
    .then(async () => {
      setAuthenticated(true);
      await Promise.all([loadSummary(), loadTasks()]);
    })
    .catch(() => setAuthenticated(false));
}
