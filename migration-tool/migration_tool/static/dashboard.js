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

async function refresh() {
  try {
    const [agents, events] = await Promise.all([
      fetchJSON("/agents"),
      fetchJSON("/events"),
    ]);

    renderAgents(document.getElementById("agents"), agents.agents);
    renderEvents(document.getElementById("events"), events.events);
  } catch (error) {
    console.error(error);
  }
}

refresh();
setInterval(refresh, 4000);
