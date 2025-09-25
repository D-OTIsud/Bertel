async function fetchJSON(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}`);
  }
  return response.json();
}

function renderAgents(container, agents) {
  container.innerHTML = "";
  agents.forEach((agent) => {
    const wrapper = document.createElement("article");
    wrapper.classList.add("agent");
    wrapper.innerHTML = `
      <h3>${agent.name}</h3>
      <p>${agent.description}</p>
      <div>${agent.expected_fields
        .map((field) => `<span class="tag">${field}</span>`)
        .join("")}</div>
    `;
    container.appendChild(wrapper);
  });
}

function renderEvents(container, events) {
  container.innerHTML = "";
  events.forEach((event) => {
    const wrapper = document.createElement("article");
    wrapper.classList.add("event");
    wrapper.innerHTML = `
      <div class="timestamp">${new Date(event.timestamp).toLocaleString()}</div>
      <h3>${event.type}</h3>
      <pre>${JSON.stringify(event.payload, null, 2)}</pre>
    `;
    container.appendChild(wrapper);
  });
}

const eventState = [];

function maintainBuffer(event) {
  eventState.unshift(event);
  if (eventState.length > 400) {
    eventState.length = 400;
  }
  renderEvents(document.getElementById("events"), eventState);
}

function connectEventStream() {
  const source = new EventSource("/events/stream");

  source.onmessage = (evt) => {
    try {
      const payload = JSON.parse(evt.data);
      if (payload.type === "snapshot") {
        eventState.length = 0;
        if (Array.isArray(payload.events)) {
          eventState.push(...payload.events);
        }
        renderEvents(document.getElementById("events"), eventState);
      } else if (payload.type === "event" && payload.event) {
        maintainBuffer(payload.event);
      }
    } catch (error) {
      console.error("Failed to process event stream message", error);
    }
  };

  source.onerror = () => {
    console.warn("Event stream disconnected. Retrying in 2s...");
    source.close();
    setTimeout(connectEventStream, 2000);
  };
}

async function initialiseDashboard() {
  try {
    const agents = await fetchJSON("/agents");
    renderAgents(document.getElementById("agents"), agents.agents);
  } catch (error) {
    console.error("Failed to load agents", error);
  }
  connectEventStream();
}

// LLM connectivity test
async function testLLM() {
  const out = document.getElementById("llm-test-output");
  out.textContent = "Testing...";
  try {
    const res = await fetch("/llm-test", { method: "POST" });
    const data = await res.json();
    out.textContent = JSON.stringify(data, null, 2);
  } catch (err) {
    out.textContent = `Error: ${err}`;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initialiseDashboard();
  const btn = document.getElementById("llm-test-btn");
  if (btn) btn.addEventListener("click", testLLM);
});