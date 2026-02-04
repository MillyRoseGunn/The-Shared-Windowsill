// server.js (ES Modules)

import express from "express";
import http from "http";
import { Server } from "socket.io";

//"fs" is the Node file system to save the world state to a disk 
//it works in local development! but on cloud platforms (like Render), the file system is ephemeral.So it wont maintain.
//This means files might be lost if the server on Render goes to sleep
//it's a bit like soft persistence rather than guaranteed long-term storage. 
import fs from "fs"; 
//"fs" lets the server remember the state by writing it to a file

import path from "path";
import { fileURLToPath } from "url";

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STATE_PATH = path.join(__dirname, "state.json");

// >>variables for things like growth and time stuff!<<

// Number of pots on our windowsill
const NUM_POTS = 20;
//how often the server updates the world (for growth/wither progression)
const TICK_MS = 15_000; // 15 seconds (or 15 milliseconds in this case) for now!

// save state periodically
const SAVE_EVERY_MS = 15_000; // 15 seconds 

//  time scale! Below is commented out as its a full 24 hours, and that will not demonstrate my point in the lecture, 
//but feel free to uncomment and delete the shorter time scale for a real 24 hour cycle!
// const ONE_DAY_MS = 1000 * 60 * 60 * 24;
const ONE_DAY_MS = 1000 * 60 * 5;

// how many "days" without water before the plant is withered
const WITHER_AFTER_DAYS = 3;

// growth and decay rates per tick (not per day)
// (Tick happens every TICK_MS, so these are small)
const GROWTH_PER_TICK = 0.02;
const DECAY_PER_TICK = 0.015;

// >>server-owned world state<<
let worldState = {
  lastTick: Date.now(),
  pots: []
};

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

function defaultPot(id) {
  return {
    id,
    seedType: null,          // "fern" | "flower" | "moss"
    status: "empty",         // "empty" | "growing" | "grown" | "withered"
    growth: 0,               // 0..1
    plantedAt: null,         // timestamp
    lastWateredAt: null,     // timestamp

    // social things, name of the plant (like a pet!) and name of the planter
    name: "",                // plant name (user-defined)
    caretaker: ""            // who planted it / named it
  };
}

function initNewWorld() {
  worldState = {
    lastTick: Date.now(),
    pots: Array.from({ length: NUM_POTS }, (_, i) => defaultPot(i))
  };
}

function loadWorld() {
  try {
    if (fs.existsSync(STATE_PATH)) {
      const raw = fs.readFileSync(STATE_PATH, "utf8");
      const parsed = JSON.parse(raw);

      if (parsed && Array.isArray(parsed.pots) && typeof parsed.lastTick === "number") {
        worldState = parsed;

        // ensures pot count matches config (safe if NUM_POTS changes)
        const existing = new Map(worldState.pots.map(p => [p.id, p]));
        worldState.pots = Array.from({ length: NUM_POTS }, (_, i) => existing.get(i) ?? defaultPot(i));

        //debugging
        console.log("Loaded state.json");
        return;
      }
    }
  } catch (e) {
    console.warn("Failed to load state.json, starting fresh:", e.message);
  }

  initNewWorld();
}

function saveWorld() {
  try {
    fs.writeFileSync(STATE_PATH, JSON.stringify(worldState, null, 2), "utf8");
  } catch (e) {
    console.warn("Failed to save state.json:", e.message);
  }
}

function broadcastState() {
  io.emit("state", worldState);
}

//>>daily watering stuff/logic below!<<

function daysSince(ts) {
  if (!ts) return Infinity;
  return (Date.now() - ts) / ONE_DAY_MS;
}

function isWateredRecently(pot) {
  // "recently" means within 1 day
  return daysSince(pot.lastWateredAt) < 1;
}

function tick() {
  worldState.lastTick = Date.now();

  for (const pot of worldState.pots) {
    if (pot.status === "empty") continue;

    const d = daysSince(pot.lastWateredAt);

    // if left too long, wither :(
    if (d >= WITHER_AFTER_DAYS) {
      pot.status = "withered";
      continue;
    }

    // growth or decay depends on whether it's been watered recently
    if (pot.status === "growing" || pot.status === "grown") {
      if (isWateredRecently(pot)) {
        pot.growth = clamp01(pot.growth + GROWTH_PER_TICK);
      } else {
        pot.growth = clamp01(pot.growth - DECAY_PER_TICK);
      }

      if (pot.growth >= 1) pot.status = "grown";

      // if it decays too far, mark as withered (even before WITHER_AFTER_DAYS)
      if (pot.growth <= 0.05 && !isWateredRecently(pot)) {
        pot.status = "withered";
      }
    }
  }

  // only broadcast when someone is connected (keeps logs quieter)
  if (io.engine.clientsCount > 0) broadcastState();
}

//>>actions<<
function plantPot(potId, seedType, name, caretaker) {
  const pot = worldState.pots.find(p => p.id === potId);
  if (!pot) return { ok: false, reason: "no such pot" };
  if (pot.status !== "empty") return { ok: false, reason: "pot not empty" };

  const allowed = ["fern", "flower", "moss"];
  if (!allowed.includes(seedType)) return { ok: false, reason: "invalid seed type" };

  pot.seedType = seedType;
  pot.name = (name ?? "").trim().slice(0, 24) || "Unnamed plant";
  pot.caretaker = (caretaker ?? "").trim().slice(0, 24) || "Anonymous";

  pot.plantedAt = Date.now();
  pot.lastWateredAt = Date.now();
  pot.growth = 0.15;
  pot.status = "growing";

  return { ok: true };
}

function waterPot(potId) {
  const pot = worldState.pots.find(p => p.id === potId);
  if (!pot) return { ok: false, reason: "no such pot" };
  if (pot.status === "empty") return { ok: false, reason: "nothing to water" };
  if (pot.status === "withered") return { ok: false, reason: "withered pot" };

  pot.lastWateredAt = Date.now();
  return { ok: true };
}

function clearPot(potId) {
  const pot = worldState.pots.find(p => p.id === potId);
  if (!pot) return { ok: false, reason: "no such pot" };
  if (pot.status === "empty") return { ok: false, reason: "already empty" };

  Object.assign(pot, defaultPot(pot.id));
  return { ok: true };
}


//>>express & socket handlers<<
app.use(express.static(path.join(__dirname, "public")));

io.on("connection", (socket) => {
  console.log("user connected", socket.id);

  socket.emit("state", worldState);

  socket.on("plant", ({ potId, seedType, name, caretaker }) => {
    const res = plantPot(potId, seedType, name, caretaker);
    socket.emit("actionResult", { action: "plant", ...res });
    if (res.ok) broadcastState();
  });

  socket.on("water", ({ potId }) => {
    const res = waterPot(potId);
    socket.emit("actionResult", { action: "water", ...res });
    if (res.ok) broadcastState();
  });

  socket.on("clear", ({ potId }) => {
    const res = clearPot(potId);
    socket.emit("actionResult", { action: "clear", ...res });
    if (res.ok) broadcastState();
  });

  socket.on("disconnect", () => {
    console.log("user disconnected", socket.id);
  });
});

//>>loading and booting up stuff<<
loadWorld();
setInterval(tick, TICK_MS);
setInterval(saveWorld, SAVE_EVERY_MS);

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`“One day” is currently: ${Math.round(ONE_DAY_MS / 1000)} seconds`);
});
