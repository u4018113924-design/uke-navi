/* ═══════════════════════════════════════════════════════════════════
   UKE Campus Navigation — app.js
   Full interactive campus navigation with:
     • Animated neural-network background canvas
     • SVG campus map rendering from uke-map.json
     • Dijkstra shortest-path routing
     • Live search with fuzzy matching
     • Pan & zoom on the SVG map
     • Responsive, accessible interactions
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  /* ──────────────────────────────────────────────────────────────── *
   *  1.  NEURAL NETWORK BACKGROUND CANVAS
   * ──────────────────────────────────────────────────────────────── */

  const neuralCanvas = document.getElementById("neuralBg");
  const ctx = neuralCanvas.getContext("2d");

  let netWidth, netHeight;
  const NET_NODE_COUNT = 90;
  const CONNECTION_DIST = 180;
  const PULSE_SPEED = 0.003;

  const netNodes = [];

  function initNetCanvas() {
    netWidth = neuralCanvas.width = window.innerWidth;
    netHeight = neuralCanvas.height = window.innerHeight;
  }

  function createNetNodes() {
    netNodes.length = 0;
    for (let i = 0; i < NET_NODE_COUNT; i++) {
      netNodes.push({
        x: Math.random() * netWidth,
        y: Math.random() * netHeight,
        vx: (Math.random() - 0.5) * 0.35,
        vy: (Math.random() - 0.5) * 0.35,
        r: 1.5 + Math.random() * 2,
        pulse: Math.random() * Math.PI * 2,
      });
    }
  }

  function drawNet(time) {
    ctx.clearRect(0, 0, netWidth, netHeight);

    // connections
    for (let i = 0; i < netNodes.length; i++) {
      for (let j = i + 1; j < netNodes.length; j++) {
        const a = netNodes[i],
          b = netNodes[j];
        const dx = a.x - b.x,
          dy = a.y - b.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < CONNECTION_DIST) {
          const alpha = (1 - dist / CONNECTION_DIST) * 0.18;
          const pulse =
            0.5 + 0.5 * Math.sin(time * PULSE_SPEED + (i + j) * 0.3);
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.strokeStyle = `rgba(0,80,170,${alpha * (0.12 + pulse * 0.18)})`;
          ctx.lineWidth = 0.8;
          ctx.stroke();
        }
      }
    }

    // nodes
    for (const n of netNodes) {
      n.pulse += 0.015;
      const glow = 0.35 + 0.65 * Math.abs(Math.sin(n.pulse));
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r * glow + 1, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(0,90,190,${0.06 + glow * 0.1})`;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r * 0.6, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(40,120,210,${0.12 + glow * 0.18})`;
      ctx.fill();

      // move
      n.x += n.vx;
      n.y += n.vy;
      if (n.x < -20) n.x = netWidth + 20;
      if (n.x > netWidth + 20) n.x = -20;
      if (n.y < -20) n.y = netHeight + 20;
      if (n.y > netHeight + 20) n.y = -20;
    }

    requestAnimationFrame(drawNet);
  }

  window.addEventListener("resize", () => {
    initNetCanvas();
    // nodes stay — they'll drift into the new viewport
  });

  initNetCanvas();
  createNetNodes();
  requestAnimationFrame(drawNet);

  /* ──────────────────────────────────────────────────────────────── *
   *  2.  DATA LOADING & PARSING
   * ──────────────────────────────────────────────────────────────── */

  const statusPill = document.getElementById("dataStatus");

  let mapData = null;
  let adjacency = {};       // adjacency list for Dijkstra
  let nodeById = {};        // quick lookup
  let buildingById = {};
  let externalById = {};

  async function loadData() {
    try {
      const resp = await fetch("assets/data/uke-map.json");
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      mapData = await resp.json();
      prepareGraph();
      initGeoReference();
      renderMap();
      populateSelects();
      statusPill.innerHTML = '<span class="status-dot"></span> Bereit';
      statusPill.classList.add("ok");
    } catch (err) {
      statusPill.innerHTML = `<span class="status-dot"></span> Fehler`;
      statusPill.classList.add("error");
    }
  }

  function prepareGraph() {
    adjacency = {};
    nodeById = {};
    buildingById = {};
    externalById = {};

    for (const n of mapData.nodes) {
      nodeById[n.id] = n;
      adjacency[n.id] = [];
    }
    for (const e of mapData.edges) {
      adjacency[e.from]?.push({ to: e.to, meters: e.meters, instruction: e.instruction });
      adjacency[e.to]?.push({ to: e.from, meters: e.meters, instruction: reverseInstruction(e.instruction) });
    }
    for (const b of mapData.buildings) buildingById[b.id] = b;
    for (const ext of mapData.externalDestinations) externalById[ext.id] = ext;
  }

  function reverseInstruction(text) {
    // simple heuristic — just return the same text since we don't have reverse instructions
    return text;
  }

  /* ──────────────────────────────────────────────────────────────── *
   *  3.  DIJKSTRA SHORTEST PATH
   * ──────────────────────────────────────────────────────────────── */

  function dijkstra(startId, endId) {
    const dist = {};
    const prev = {};
    const visited = new Set();
    for (const id of Object.keys(adjacency)) {
      dist[id] = Infinity;
      prev[id] = null;
    }
    dist[startId] = 0;

    // simple priority queue via array (fine for < 200 nodes)
    const pq = [{ id: startId, d: 0 }];

    while (pq.length) {
      pq.sort((a, b) => a.d - b.d);
      const { id: u } = pq.shift();
      if (visited.has(u)) continue;
      visited.add(u);
      if (u === endId) break;

      for (const edge of adjacency[u] || []) {
        const alt = dist[u] + edge.meters;
        if (alt < dist[edge.to]) {
          dist[edge.to] = alt;
          prev[edge.to] = { from: u, instruction: edge.instruction };
          pq.push({ id: edge.to, d: alt });
        }
      }
    }

    if (dist[endId] === Infinity) return null;

    // reconstruct path
    const path = [];
    let current = endId;
    while (current) {
      path.unshift(current);
      current = prev[current]?.from || null;
    }

    // collect instructions
    const instructions = [];
    for (let i = 1; i < path.length; i++) {
      instructions.push(prev[path[i]].instruction);
    }

    return { path, totalMeters: dist[endId], instructions };
  }

  /* ──────────────────────────────────────────────────────────────── *
   *  4.  SVG MAP RENDERING
   * ──────────────────────────────────────────────────────────────── */

  const svg = document.getElementById("campusMap");
  const svgRoot = document.getElementById("svgRoot");

  const TYPE_COLORS = {
    clinic: "#1a73e8",
    research: "#7c4dff",
    service: "#0d9e5a",
    education: "#e8710a",
    admin: "#8d6e3f",
    building: "#5f8ca8",
  };

  function renderMap() {
    svgRoot.innerHTML = ""; // clear previous

    // 4a) Sectors
    const gSectors = createSVGGroup("sectors-layer");
    for (const s of mapData.sectors) {
      const pts = s.polygon.map((p) => p.join(",")).join(" ");
      const poly = svgEl("polygon", {
        points: pts,
        fill: s.color,
        class: "sector",
      });
      gSectors.appendChild(poly);

      const lbl = svgEl("text", {
        x: s.labelPosition[0],
        y: s.labelPosition[1],
        fill: s.labelColor,
        "font-size": "22",
        class: "sector-label",
      });
      lbl.textContent = s.label;
      gSectors.appendChild(lbl);
    }
    svgRoot.appendChild(gSectors);

    // 4b) Road labels
    const gRoads = createSVGGroup("roads-layer");
    for (const r of mapData.roads) {
      const lbl = svgEl("text", {
        x: r.position[0],
        y: r.position[1],
        class: "road-label",
        transform: r.rotation
          ? `rotate(${r.rotation},${r.position[0]},${r.position[1]})`
          : "",
      });
      lbl.textContent = r.label;
      gRoads.appendChild(lbl);
    }
    svgRoot.appendChild(gRoads);

    // 4c) Edges (path lines)
    const gEdges = createSVGGroup("edges-layer");
    for (const e of mapData.edges) {
      const a = nodeById[e.from],
        b = nodeById[e.to];
      if (!a || !b) continue;
      const line = svgEl("line", {
        x1: a.x, y1: a.y,
        x2: b.x, y2: b.y,
        class: "path-line",
      });
      gEdges.appendChild(line);
    }
    svgRoot.appendChild(gEdges);

    // 4d) Route layer (initially empty)
    const gRoute = createSVGGroup("route-layer");
    gRoute.id = "routeLayer";
    svgRoot.appendChild(gRoute);

    // 4e) Buildings
    const gBuildings = createSVGGroup("buildings-layer");
    for (const b of mapData.buildings) {
      const color = TYPE_COLORS[b.type] || TYPE_COLORS.building;
      const rect = svgEl("rect", {
        x: b.x, y: b.y, width: b.w, height: b.h,
        rx: 8, ry: 8,
        fill: color,
        class: "building",
        "data-building": b.id,
      });
      rect.addEventListener("click", () => pickBuilding(b));
      gBuildings.appendChild(rect);

      // label
      const labelParts = (b.label ? [b.id] : [b.id]).concat(
        b.name !== b.id ? [b.name] : []
      );
      const lbl = svgEl("text", {
        x: b.label[0],
        y: b.label[1],
        class: "building-label",
        "font-size": b.w < 60 ? "11" : "14",
      });
      lbl.textContent = b.id;
      gBuildings.appendChild(lbl);

      // smaller name label below
      if (b.name && b.name !== b.id) {
        const nameLbl = svgEl("text", {
          x: b.label[0],
          y: b.label[1] + 16,
          class: "building-label",
          "font-size": "10",
        });
        nameLbl.textContent = truncate(b.name, 22);
        gBuildings.appendChild(nameLbl);
      }
    }
    svgRoot.appendChild(gBuildings);

    // 4f) Nodes (with invisible touch targets for mobile)
    const gNodes = createSVGGroup("nodes-layer");
    for (const n of mapData.nodes) {
      const isExit = n.kind === "exit";
      const isParking = n.kind === "parking";

      // Invisible larger touch target (rendered first = behind visible node)
      const touchTarget = svgEl("circle", {
        cx: n.x, cy: n.y,
        r: 22,
        class: "node-touch-target",
        "data-node-touch": n.id,
      });
      touchTarget.addEventListener("click", () => pickNode(n));
      gNodes.appendChild(touchTarget);

      // Visible node circle
      const nodeClass = isParking ? "node parking" : isExit ? "node external" : "node";
      const circle = svgEl("circle", {
        cx: n.x, cy: n.y,
        r: isParking ? 10 : isExit ? 9 : 7,
        class: nodeClass,
        "data-node": n.id,
      });

      // tooltip via title
      const title = svgEl("title", {});
      title.textContent = n.label;
      circle.appendChild(title);

      circle.addEventListener("click", () => pickNode(n));
      gNodes.appendChild(circle);
    }
    svgRoot.appendChild(gNodes);

    // 4g) Map labels (badges, bus stops, parking)
    const gLabels = createSVGGroup("labels-layer");
    for (const ml of mapData.mapLabels) {
      const isParking = ml.type === "parking";
      const lines = ml.label.split("\\n");
      const bgW = Math.max(...lines.map((l) => l.length * 8.5)) + (isParking ? 36 : 24);
      const bgH = (isParking ? 30 : 24) + (lines.length - 1) * 16;

      // Parking glow circle behind the badge
      if (isParking) {
        const glow = svgEl("circle", {
          cx: ml.position[0],
          cy: ml.position[1],
          r: Math.max(bgW, bgH) * 0.8,
          fill: "rgba(52,211,153,0.08)",
          class: "parking-glow",
        });
        gLabels.appendChild(glow);
      }

      const bgRect = svgEl("rect", {
        x: ml.position[0] - bgW / 2,
        y: ml.position[1] - bgH / 2,
        width: bgW, height: bgH,
        rx: isParking ? 10 : 8,
        ry: isParking ? 10 : 8,
        class: isParking ? "parking-badge" : "map-badge",
      });
      gLabels.appendChild(bgRect);

      lines.forEach((line, idx) => {
        const t = svgEl("text", {
          x: ml.position[0],
          y: ml.position[1] - (lines.length - 1) * 8 + idx * 16 + 5,
          class: isParking ? "parking-text" : "badge-text",
          "font-size": isParking ? "13" : "12",
        });
        t.textContent = (ml.type === "bus" ? "🚌 " : isParking ? "🅿️ " : "") + line;
        gLabels.appendChild(t);
      });
    }
    svgRoot.appendChild(gLabels);

    // 4h) External destinations cards
    const gExternals = createSVGGroup("externals-layer");
    let extY = 45;
    for (const ext of mapData.externalDestinations) {
      const cardX = 10;
      const bg = svgEl("rect", {
        x: cardX, y: extY, width: 210, height: 42,
        rx: 10, ry: 10,
        class: "external-card",
      });
      gExternals.appendChild(bg);

      const titleText = svgEl("text", {
        x: cardX + 12, y: extY + 18,
        class: "external-title",
        "font-size": "12",
      });
      titleText.textContent = `📍 ${ext.name}`;
      gExternals.appendChild(titleText);

      const addr = svgEl("text", {
        x: cardX + 12, y: extY + 34,
        class: "external-text",
        "font-size": "10",
      });
      addr.textContent = truncate(ext.address, 32);
      gExternals.appendChild(addr);

      extY += 50;
    }
    svgRoot.appendChild(gExternals);

    // 4i) Legend
    const gLegend = createSVGGroup("legend-layer");
    const legendItems = [
      { color: TYPE_COLORS.clinic, label: "Klinik" },
      { color: TYPE_COLORS.research, label: "Forschung" },
      { color: TYPE_COLORS.service, label: "Service" },
      { color: TYPE_COLORS.education, label: "Lehre" },
      { color: TYPE_COLORS.admin, label: "Verwaltung" },
      { color: "#34d399", label: "🅿️ Parken" },
    ];
    const lx = 1050, ly = 110;
    legendItems.forEach((item, i) => {
      const r = svgEl("rect", {
        x: lx, y: ly + i * 22, width: 14, height: 14, rx: 3,
        fill: item.color,
      });
      gLegend.appendChild(r);
      const t = svgEl("text", {
        x: lx + 20, y: ly + i * 22 + 12,
        class: "legend text",
        "font-size": "12",
      });
      t.textContent = item.label;
      gLegend.appendChild(t);
    });
    svgRoot.appendChild(gLegend);

    // 4j) Location layer (populated by geolocation — always topmost)
    const gLocation = createSVGGroup("location-layer");
    gLocation.id = "locationLayer";
    svgRoot.appendChild(gLocation);
  }

  /* SVG utility helpers */
  function svgEl(tag, attrs) {
    const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v !== undefined && v !== "") el.setAttribute(k, v);
    }
    return el;
  }

  function createSVGGroup(className) {
    const g = svgEl("g", { class: className });
    return g;
  }

  function truncate(s, max) {
    return s.length > max ? s.slice(0, max - 1) + "…" : s;
  }

  /* ──────────────────────────────────────────────────────────────── *
   *  5.  SEARCHABLE COMBOBOXES (Von / Nach)
   * ──────────────────────────────────────────────────────────────── */

  const startHidden = document.getElementById("startSelect");
  const targetHidden = document.getElementById("targetSelect");

  let selectedStart = null;
  let selectedTarget = null;
  let allDestinations = [];

  /** Reusable combobox controller */
  class Combobox {
    constructor(inputId, listId, hiddenId, onSelect) {
      this.input = document.getElementById(inputId);
      this.list = document.getElementById(listId);
      this.hidden = document.getElementById(hiddenId);
      this.onSelect = onSelect;
      this.value = "";        // nodeId
      this.label = "";        // display text
      this.activeIdx = -1;

      this.input.addEventListener("input", () => this.onInput());
      this.input.addEventListener("focus", () => this.onInput());
      this.input.addEventListener("keydown", (e) => this.onKey(e));

      // close on outside click — attached once
      document.addEventListener("click", (e) => {
        if (!this.input.contains(e.target) && !this.list.contains(e.target)) {
          this.close();
        }
      });
    }

    onInput() {
      const q = this.input.value.trim().toLowerCase();
      this.list.innerHTML = "";
      this.activeIdx = -1;

      const items = allDestinations.filter((it) => {
        if (!q) return true; // show all when empty
        const haystack = (it.label + " " + it.aliases.join(" ")).toLowerCase();
        return haystack.includes(q);
      });

      if (!items.length) {
        this.close();
        return;
      }

      for (let i = 0; i < Math.min(items.length, 10); i++) {
        const m = items[i];
        const btn = document.createElement("button");
        btn.type = "button";
        btn.innerHTML = `<strong>${m.label}</strong>`;
        btn.addEventListener("click", () => this.select(m));
        this.list.appendChild(btn);
      }
      this.list.classList.add("open");
    }

    onKey(e) {
      const buttons = this.list.querySelectorAll("button");
      if (!buttons.length) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        this.activeIdx = Math.min(this.activeIdx + 1, buttons.length - 1);
        this.highlightActive(buttons);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        this.activeIdx = Math.max(this.activeIdx - 1, 0);
        this.highlightActive(buttons);
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (this.activeIdx >= 0 && buttons[this.activeIdx]) {
          buttons[this.activeIdx].click();
        }
      } else if (e.key === "Escape") {
        this.close();
      }
    }

    highlightActive(buttons) {
      buttons.forEach((b, i) => {
        b.classList.toggle("active", i === this.activeIdx);
      });
      if (buttons[this.activeIdx]) {
        buttons[this.activeIdx].scrollIntoView({ block: "nearest" });
      }
    }

    select(item) {
      this.value = item.nodeId;
      this.label = item.label;
      this.hidden.value = item.nodeId;
      this.input.value = item.label;
      this.input.classList.add("has-value");
      this.close();
      if (this.onSelect) this.onSelect(item.nodeId);
    }

    setValue(nodeId) {
      const item = allDestinations.find((d) => d.nodeId === nodeId);
      if (item) {
        this.select(item);
      } else {
        // fallback for raw nodes not in destinations list
        const node = nodeById[nodeId];
        this.value = nodeId;
        this.label = node ? node.label : nodeId;
        this.hidden.value = nodeId;
        this.input.value = this.label;
        this.input.classList.add("has-value");
      }
    }

    getValue() {
      return this.hidden.value || "";
    }

    close() {
      this.list.classList.remove("open");
      this.activeIdx = -1;
    }

    clear() {
      this.value = "";
      this.label = "";
      this.hidden.value = "";
      this.input.value = "";
      this.input.classList.remove("has-value");
    }
  }

  const startCombo = new Combobox("startInput", "startList", "startSelect", (nodeId) => {
    selectedStart = nodeId;
    updateNodeHighlights();
  });
  const targetCombo = new Combobox("targetInput", "targetList", "targetSelect", (nodeId) => {
    selectedTarget = nodeId;
    updateNodeHighlights();
  });

  function populateSelects() {
    allDestinations = getAllDestinations();

    // defaults
    if (mapData.defaultRoute) {
      startCombo.setValue(mapData.defaultRoute.start);
      const defTarget = mapData.buildings.find(
        (b) => b.id === mapData.defaultRoute.target
      );
      if (defTarget) targetCombo.setValue(defTarget.node);
    }
  }

  function getAllDestinations() {
    const items = [];
    for (const b of mapData.buildings) {
      items.push({
        nodeId: b.node,
        label: `${b.id} — ${b.name}`,
        aliases: b.aliases || [],
        type: "building",
      });
    }
    for (const ext of mapData.externalDestinations) {
      items.push({
        nodeId: ext.node,
        label: `🌍 ${ext.name}`,
        aliases: [],
        type: "external",
      });
    }
    for (const n of mapData.nodes) {
      if (n.kind === "transport" || n.kind === "parking") {
        items.push({
          nodeId: n.id,
          label: `🚉 ${n.label}`,
          aliases: [],
          type: "infra",
        });
      }
    }
    return items;
  }

  /* ──────────────────────────────────────────────────────────────── *
   *  6.  NODE / BUILDING PICK (MAP CLICK)
   * ──────────────────────────────────────────────────────────────── */

  let wasDragged = false;
  let dragStartPos = { x: 0, y: 0 };
  let currentActiveBuilding = null;
  let currentActiveNode = null; // for node popup (mobile)
  const isMobile = () => window.innerWidth < 1050;

  function pickNode(node) {
    if (wasDragged) return;

    if (isMobile()) {
      // On mobile: always show info popup with "Als Start" / "Als Ziel"
      showNodeInfo(node);
    } else {
      // On desktop: use radio-button mode (existing behavior)
      const mode = document.querySelector(
        'input[name="pickMode"]:checked'
      ).value;
      if (mode === "start") {
        startCombo.setValue(node.id);
        selectedStart = node.id;
      } else {
        targetCombo.setValue(node.id);
        selectedTarget = node.id;
      }
      updateNodeHighlights();
    }
  }

  function pickBuilding(building) {
    if (wasDragged) return;
    // Touch feedback flash
    const rect = document.querySelector(`[data-building="${building.id}"]`);
    if (rect) {
      rect.classList.add("tap-flash");
      setTimeout(() => rect.classList.remove("tap-flash"), 300);
    }
    showBuildingInfo(building);
  }

  /* Building Info Popup */
  const TYPE_LABELS = {
    clinic: "🏥 Krankenhaus / Klinik",
    research: "🔬 Forschung / Universität",
    service: "🔧 Service / Infrastruktur",
    education: "🎓 Lehre / Universität",
    admin: "🏛️ Verwaltung",
    building: "🏢 Gebäude",
  };

  const infoPanel = document.getElementById("buildingInfo");
  const infoClose = document.getElementById("buildingInfoClose");
  const infoType = document.getElementById("buildingInfoType");
  const infoName = document.getElementById("buildingInfoName");
  const infoId = document.getElementById("buildingInfoId");
  const infoAliases = document.getElementById("buildingInfoAliases");

  const NODE_KIND_LABELS = {
    crossing: "🔀 Wegkreuzung",
    exit: "🚪 Ausgang / Eingang",
    transport: "🚉 Haltestelle / Transport",
    parking: "🅿️ Parkplatz",
    path: "🚶 Wegpunkt",
  };

  function showBuildingInfo(b) {
    currentActiveBuilding = b;
    currentActiveNode = null;
    infoType.textContent = TYPE_LABELS[b.type] || TYPE_LABELS.building;
    infoType.className = `building-info-type t-${b.type}`;
    infoName.textContent = b.name;
    infoId.textContent = `Gebäude ${b.id} · Bereich ${b.sector === "south" ? "Süd" : b.sector === "north" ? "Nord" : b.sector === "east" ? "Ost" : "West"}`;
    const aliases = (b.aliases || []).filter((a) => a !== b.id && a !== b.name);
    infoAliases.textContent = aliases.length
      ? `Auch bekannt als: ${aliases.join(", ")}`
      : "";
    infoPanel.hidden = false;
  }

  function showNodeInfo(node) {
    currentActiveNode = node;
    currentActiveBuilding = null;
    infoType.textContent = NODE_KIND_LABELS[node.kind] || "📍 Kartenknoten";
    infoType.className = "building-info-type t-service";
    infoName.textContent = node.label;
    infoId.textContent = `Knoten ${node.id}`;
    infoAliases.textContent = "";
    infoPanel.hidden = false;
  }

  infoClose.addEventListener("click", () => {
    infoPanel.hidden = true;
  });

  document.getElementById("popupStartBtn").addEventListener("click", () => {
    let nodeId = null;
    let displayName = "";
    if (currentActiveBuilding) {
      nodeId = currentActiveBuilding.node;
      displayName = currentActiveBuilding.id;
    } else if (currentActiveNode) {
      nodeId = currentActiveNode.id;
      displayName = currentActiveNode.label;
    }
    if (nodeId) {
      startCombo.setValue(nodeId);
      selectedStart = nodeId;
      updateNodeHighlights();
      showToast(`Start gesetzt: ${displayName}`);
      infoPanel.hidden = true;
    }
  });

  document.getElementById("popupTargetBtn").addEventListener("click", () => {
    let nodeId = null;
    let displayName = "";
    if (currentActiveBuilding) {
      nodeId = currentActiveBuilding.node;
      displayName = currentActiveBuilding.id;
    } else if (currentActiveNode) {
      nodeId = currentActiveNode.id;
      displayName = currentActiveNode.label;
    }
    if (nodeId) {
      targetCombo.setValue(nodeId);
      selectedTarget = nodeId;
      updateNodeHighlights();
      showToast(`Ziel gesetzt: ${displayName}`);
      infoPanel.hidden = true;
    }
  });

  function updateNodeHighlights() {
    document.querySelectorAll(".node").forEach((c) => {
      c.classList.remove("selected-start", "selected-target");
    });
    const startId = startCombo.getValue();
    const targetId = targetCombo.getValue();
    if (startId) {
      const el = document.querySelector(`[data-node="${startId}"]`);
      if (el) el.classList.add("selected-start");
    }
    if (targetId) {
      const el = document.querySelector(`[data-node="${targetId}"]`);
      if (el) el.classList.add("selected-target");
    }
  }

  /* ──────────────────────────────────────────────────────────────── *
   *  7.  ROUTE CALCULATION & DISPLAY
   * ──────────────────────────────────────────────────────────────── */

  const routeBtn = document.getElementById("routeBtn");
  const swapBtn = document.getElementById("swapBtn");
  const distMetric = document.getElementById("distanceMetric");
  const timeMetric = document.getElementById("timeMetric");
  const dirList = document.getElementById("directionsList");

  routeBtn.addEventListener("click", computeRoute);
  const mobileRouteBtn = document.getElementById("mobileRouteBtn");
  if (mobileRouteBtn) {
    mobileRouteBtn.addEventListener("click", computeRoute);
  }

  swapBtn.addEventListener("click", () => {
    const tmpId = startCombo.getValue();
    const tmpLabel = startCombo.label;
    startCombo.setValue(targetCombo.getValue());
    if (tmpId) targetCombo.setValue(tmpId);
    else targetCombo.clear();
    selectedStart = startCombo.getValue();
    selectedTarget = targetCombo.getValue();
    updateNodeHighlights();
  });

  function computeRoute() {
    const from = startCombo.getValue();
    const to = targetCombo.getValue();
    if (!from || !to) {
      showToast("Bitte Start und Ziel auswählen.");
      return;
    }
    if (from === to) {
      showToast("Start und Ziel sind identisch.");
      return;
    }

    const result = dijkstra(from, to);
    if (!result) {
      showToast("Keine Route gefunden.");
      return;
    }

    drawRoute(result.path);
    displayDirections(result);
    updateNodeHighlights();
  }

  function drawRoute(path) {
    const routeLayer = document.getElementById("routeLayer");
    routeLayer.innerHTML = "";

    if (path.length < 2) return;

    // Build polyline points
    const points = path
      .map((id) => {
        const n = nodeById[id];
        return n ? `${n.x},${n.y}` : null;
      })
      .filter(Boolean)
      .join(" ");

    // Animated route glow
    const glow = svgEl("polyline", {
      points,
      class: "route-glow",
      fill: "none",
      stroke: "rgba(0,87,184,0.25)",
      "stroke-width": "18",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    });
    routeLayer.appendChild(glow);

    // Main route line
    const line = svgEl("polyline", {
      points,
      class: "route-line",
    });
    routeLayer.appendChild(line);

    // Animated dash
    const totalLen = estimatePolylineLength(path);
    line.style.strokeDasharray = totalLen;
    line.style.strokeDashoffset = totalLen;
    line.style.animation = `routeDraw 1.4s ease forwards`;

    // Start pin
    const startNode = nodeById[path[0]];
    if (startNode) {
      addPinLabel(routeLayer, startNode.x, startNode.y, "START", "#0057b8");
    }
    // End pin
    const endNode = nodeById[path[path.length - 1]];
    if (endNode) {
      addPinLabel(routeLayer, endNode.x, endNode.y, "ZIEL", "#d5231f");
    }
  }

  function addPinLabel(parent, x, y, text, color) {
    const lbl = svgEl("text", {
      x: x,
      y: y - 16,
      class: "pin-label",
      fill: color,
      "text-anchor": "middle",
    });
    lbl.textContent = text;
    parent.appendChild(lbl);
  }

  function estimatePolylineLength(path) {
    let len = 0;
    for (let i = 1; i < path.length; i++) {
      const a = nodeById[path[i - 1]],
        b = nodeById[path[i]];
      if (a && b) {
        len += Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
      }
    }
    return len;
  }

  function displayDirections(result) {
    distMetric.textContent = `${result.totalMeters} m`;
    const walkMin = Math.ceil(result.totalMeters / 75); // ~75 m/min
    timeMetric.textContent = `~${walkMin} Min`;

    dirList.innerHTML = "";
    for (const instr of result.instructions) {
      const li = document.createElement("li");
      li.textContent = instr;
      dirList.appendChild(li);
    }

    // scroll directions into view on mobile
    if (window.innerWidth < 1050) {
      dirList.closest(".route-summary")?.scrollIntoView({ behavior: "smooth" });
    }
  }

  /* ──────────────────────────────────────────────────────────────── *
   *  8.  ZOOM / PAN
   * ──────────────────────────────────────────────────────────────── */

  const viewport = document.getElementById("mapViewport");
  const zoomInBtn = document.getElementById("zoomIn");
  const zoomOutBtn = document.getElementById("zoomOut");
  const resetBtn = document.getElementById("resetView");

  let currentScale = 1;
  const MIN_SCALE = 0.5;
  const MAX_SCALE = 3;

  let isPanning = false;
  let panStart = { x: 0, y: 0 };
  let panOffset = { x: 0, y: 0 };
  let currentOffset = { x: 0, y: 0 };

  function applyTransform() {
    svgRoot.setAttribute(
      "transform",
      `translate(${currentOffset.x}, ${currentOffset.y}) scale(${currentScale})`
    );
  }

  zoomInBtn.addEventListener("click", () => {
    currentScale = Math.min(MAX_SCALE, currentScale * 1.25);
    applyTransform();
  });

  zoomOutBtn.addEventListener("click", () => {
    currentScale = Math.max(MIN_SCALE, currentScale / 1.25);
    applyTransform();
  });

  resetBtn.addEventListener("click", () => {
    currentScale = 1;
    currentOffset = { x: 0, y: 0 };
    applyTransform();
  });

  // Mouse pan
  svg.addEventListener("mousedown", (e) => {
    wasDragged = false;
    dragStartPos = { x: e.clientX, y: e.clientY };
    if (e.target.closest(".building, .node")) return; // don't pan when clicking interactive elements
    isPanning = true;
    panStart = { x: e.clientX - currentOffset.x, y: e.clientY - currentOffset.y };
    svg.style.cursor = "grabbing";
  });

  window.addEventListener("mousemove", (e) => {
    if (!isPanning) {
      if (dragStartPos.x !== 0 && dragStartPos.y !== 0) {
        const dx = e.clientX - dragStartPos.x;
        const dy = e.clientY - dragStartPos.y;
        if (dx * dx + dy * dy > 16) {
          wasDragged = true;
        }
      }
      return;
    }
    const dx = e.clientX - (panStart.x + currentOffset.x);
    const dy = e.clientY - (panStart.y + currentOffset.y);
    if (dx * dx + dy * dy > 16) {
      wasDragged = true;
    }
    currentOffset.x = e.clientX - panStart.x;
    currentOffset.y = e.clientY - panStart.y;
    applyTransform();
  });

  window.addEventListener("mouseup", () => {
    isPanning = false;
    dragStartPos = { x: 0, y: 0 };
    svg.style.cursor = "";
  });

  // Touch gesture support (Pan & Pinch-to-zoom) for iOS/Android
  let touchStartDist = 0;
  let touchStartScale = 1;

  svg.addEventListener("touchstart", (e) => {
    wasDragged = false;
    if (e.touches.length === 1) {
      dragStartPos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      if (e.target.closest(".building, .node")) return;
      isPanning = true;
      panStart.x = e.touches[0].clientX - currentOffset.x;
      panStart.y = e.touches[0].clientY - currentOffset.y;
    } else if (e.touches.length === 2) {
      isPanning = false;
      dragStartPos = { x: 0, y: 0 };
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      touchStartDist = Math.sqrt(dx * dx + dy * dy);
      touchStartScale = currentScale;
    }
  }, { passive: true });

  window.addEventListener("touchmove", (e) => {
    if (isPanning && e.touches.length === 1) {
      const dx = e.touches[0].clientX - dragStartPos.x;
      const dy = e.touches[0].clientY - dragStartPos.y;
      if (dx * dx + dy * dy > 36) {
        wasDragged = true;
      }
      currentOffset.x = e.touches[0].clientX - panStart.x;
      currentOffset.y = e.touches[0].clientY - panStart.y;
      applyTransform();
    } else if (e.touches.length === 2) {
      wasDragged = true;
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (touchStartDist > 0) {
        const factor = dist / touchStartDist;
        currentScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, touchStartScale * factor));
        applyTransform();
      }
    } else {
      if (e.touches.length === 1 && dragStartPos.x !== 0) {
        const dx = e.touches[0].clientX - dragStartPos.x;
        const dy = e.touches[0].clientY - dragStartPos.y;
        if (dx * dx + dy * dy > 36) {
          wasDragged = true;
        }
      }
    }
  }, { passive: true });

  window.addEventListener("touchend", () => {
    isPanning = false;
    dragStartPos = { x: 0, y: 0 };
  });

  // Mouse wheel zoom
  viewport.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      currentScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, currentScale * factor));
      applyTransform();
    },
    { passive: false }
  );

  /* ──────────────────────────────────────────────────────────────── *
   *  9.  GEOLOCATION — "Mein Standort"
   * ──────────────────────────────────────────────────────────────── */

  let affineCoeffs = null;
  let pxPerMeter = 1.7;           // recalculated from reference data
  let geoWatchId = null;
  let locationActive = false;
  let currentGeoSvgPos = null;    // stores current GPS position as SVG coords
  const locateBtn = document.getElementById("locateBtn");

  /** Solve 3×3 determinant */
  function det3(m) {
    return (
      m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
      m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
      m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
    );
  }

  /**
   * Compute affine transformation coefficients from 3 anchor points.
   * svgX = a·lng + b·lat + c
   * svgY = d·lng + e·lat + f
   */
  function computeAffineTransform(anchors) {
    const [p1, p2, p3] = anchors;
    const M = [
      [p1.lng, p1.lat, 1],
      [p2.lng, p2.lat, 1],
      [p3.lng, p3.lat, 1],
    ];
    const D = det3(M);
    if (Math.abs(D) < 1e-12) return null;

    function solveCol(vals) {
      return [
        det3([[vals[0], M[0][1], M[0][2]], [vals[1], M[1][1], M[1][2]], [vals[2], M[2][1], M[2][2]]]) / D,
        det3([[M[0][0], vals[0], M[0][2]], [M[1][0], vals[1], M[1][2]], [M[2][0], vals[2], M[2][2]]]) / D,
        det3([[M[0][0], M[0][1], vals[0]], [M[1][0], M[1][1], vals[1]], [M[2][0], M[2][1], vals[2]]]) / D,
      ];
    }

    const [a, b, c] = solveCol([p1.svgX, p2.svgX, p3.svgX]);
    const [d, e, f] = solveCol([p1.svgY, p2.svgY, p3.svgY]);
    return { a, b, c, d, e, f };
  }

  /** Convert GPS lat/lng → SVG x/y */
  function gpsToSvg(lat, lng) {
    if (!affineCoeffs) return null;
    const { a, b, c, d, e, f } = affineCoeffs;
    return { x: a * lng + b * lat + c, y: d * lng + e * lat + f };
  }

  /** Haversine distance in meters between two GPS points */
  function haversineMeters(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  /** Called once after mapData is loaded — sets up transform + scale */
  function initGeoReference() {
    if (!mapData.geoReference || !mapData.geoReference.anchors ||
        mapData.geoReference.anchors.length < 3) return;
    const anchors = mapData.geoReference.anchors;
    affineCoeffs = computeAffineTransform(anchors);

    // calibrate px-per-meter from first two anchors
    const [r1, r2] = anchors;
    const meters = haversineMeters(r1.lat, r1.lng, r2.lat, r2.lng);
    const dx = r2.svgX - r1.svgX;
    const dy = r2.svgY - r1.svgY;
    const svgDist = Math.sqrt(dx * dx + dy * dy);
    if (meters > 0) pxPerMeter = svgDist / meters;
  }

  /** Draw pulsing red dot + accuracy circle on the SVG */
  function renderLocationDot(svgX, svgY, accuracyMeters) {
    const layer = document.getElementById("locationLayer");
    if (!layer) return;
    layer.innerHTML = "";

    const accR = Math.max(14, Math.min(accuracyMeters * pxPerMeter, 250));

    // accuracy circle
    layer.appendChild(svgEl("circle", {
      cx: svgX, cy: svgY, r: accR, class: "location-accuracy",
    }));
    // outer glow ring
    layer.appendChild(svgEl("circle", {
      cx: svgX, cy: svgY, r: 18, class: "location-glow",
    }));
    // main dot
    layer.appendChild(svgEl("circle", {
      cx: svgX, cy: svgY, r: 9, class: "location-dot",
    }));
    // white centre highlight
    layer.appendChild(svgEl("circle", {
      cx: svgX, cy: svgY, r: 4, class: "location-center",
    }));
  }

  function removeLocationDot() {
    const layer = document.getElementById("locationLayer");
    if (layer) layer.innerHTML = "";
  }

  function startGeolocation() {
    if (!("geolocation" in navigator)) {
      showToast("Geolocation wird von diesem Browser nicht unterstützt.");
      return;
    }
    if (!affineCoeffs) {
      showToast("Geo-Referenzierung nicht verfügbar.");
      return;
    }

    locationActive = true;
    locateBtn.classList.add("active");
    showToast("Standort wird gesucht …");

    geoWatchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        const svgPos = gpsToSvg(latitude, longitude);
        if (!svgPos) return;

        // out-of-bounds check (generous margin around 0-1200 / 0-820)
        if (svgPos.x < -150 || svgPos.x > 1350 || svgPos.y < -150 || svgPos.y > 970) {
          showToast("Sie befinden sich außerhalb des UKE-Geländes.");
          removeLocationDot();
          return;
        }
        renderLocationDot(svgPos.x, svgPos.y, accuracy);
        currentGeoSvgPos = { x: svgPos.x, y: svgPos.y };
        const locBtn = document.getElementById("useLocationBtn");
        if (locBtn) locBtn.hidden = false;
      },
      (err) => {
        let msg = "Standort konnte nicht ermittelt werden.";
        if (err.code === 1) msg = "Standortzugriff wurde verweigert.";
        else if (err.code === 2) msg = "Standort nicht verfügbar.";
        else if (err.code === 3) msg = "Zeitüberschreitung bei Standortabfrage.";
        showToast(msg);
        stopGeolocation();
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );
  }

  function stopGeolocation() {
    if (geoWatchId !== null) {
      navigator.geolocation.clearWatch(geoWatchId);
      geoWatchId = null;
    }
    locationActive = false;
    locateBtn.classList.remove("active");
    removeLocationDot();
    currentGeoSvgPos = null;
    const locBtn = document.getElementById("useLocationBtn");
    if (locBtn) locBtn.hidden = true;
  }

  locateBtn.addEventListener("click", () => {
    if (locationActive) stopGeolocation();
    else startGeolocation();
  });

  /** Find nearest graph node to given SVG coordinates */
  function findNearestNode(svgX, svgY) {
    let bestId = null, bestDist = Infinity;
    for (const n of mapData.nodes) {
      const dx = n.x - svgX, dy = n.y - svgY;
      const d = dx * dx + dy * dy;
      if (d < bestDist) { bestDist = d; bestId = n.id; }
    }
    return bestId;
  }

  document.getElementById("useLocationBtn").addEventListener("click", () => {
    if (!currentGeoSvgPos) {
      showToast("Standort noch nicht verfügbar.");
      return;
    }
    const nearestId = findNearestNode(currentGeoSvgPos.x, currentGeoSvgPos.y);
    if (nearestId) {
      startCombo.setValue(nearestId);
      selectedStart = nearestId;
      updateNodeHighlights();
      const node = nodeById[nearestId];
      showToast(`Start gesetzt: ${node ? node.label : nearestId}`);
    }
  });

  /* ──────────────────────────────────────────────────────────────── *
   *  10. TOAST NOTIFICATIONS
   * ──────────────────────────────────────────────────────────────── */

  function showToast(msg) {
    const existing = document.querySelector(".toast");
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = msg;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add("show"));
    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => toast.remove(), 400);
    }, 3000);
  }

  /* ──────────────────────────────────────────────────────────────── *
   *  11. INIT
   * ──────────────────────────────────────────────────────────────── */

  loadData();
})();
