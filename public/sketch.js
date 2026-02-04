//client-side sketch for Shared Windowsill
//Keep inside public folder!

//this sketch connects to the app.js server that owns the "world state".
//the client just does the following:
// 1. recieves states from the server
// 2. sends requests for actions
// 3. visualises what the server says is happening

//btw, planting a seed also counts as watering, so you don't need to water it on the first "day" cycle of your plant-life :)

const socket = io();

//full shared world state sent by the server, so this will be null until server responds
let world = null;

// interaction state 
//these aren't shared values, they only affect how THIS user interacts
let mode = "plant"; // "plant" | "water" | "clear"
const seeds = ["fern", "flower", "moss"];
let seedIndex = 0;

// this is a refnerece to the log text/UI stuff in the index.html file (also in public folder)
let logEl;


function setup() {
  createCanvas(windowWidth, windowHeight);
  
  //grab the log element from the DOM
  logEl = document.getElementById("log");

  //server sends teh full world state whenver it changes, so it all gets updated
  socket.on("state", (state) => {
    //we overwrite our own local copy with the server's version, which prevents things falling out of sync
    world = state;
  });

  //server tells us whether our requested actions were sucessful
  socket.on("actionResult", (res) => {
    if (res.ok) {
      setLog(`${res.action}: ok`);
    } else {
      setLog(`${res.action}: ${res.reason}`);
    }
  });

  setLog("Connected.");
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}


function draw() {
  //lighter background so the space feels airy
  background(245);

  //this is just the static environemnt 
  drawRoom();

  //if server hasn't sent the state yet, then we can't draw anything meaningful, so loading text will have to suffice!
  if (!world) {
    fill(40);
    textAlign(CENTER, CENTER);
    text("Waiting for world…", width / 2, height / 2);
    return;
  }

  //draw all shared pots using the state from the server
  drawPots(world.pots);

  // some UI feedback for the user
  fill(40);
  textSize(14);
  textAlign(LEFT, BOTTOM);
  let label = `Mode: ${mode.toUpperCase()}`;
  if (mode === "plant") label += ` (${seeds[seedIndex]})`;
  text(label, 14, height - 14);
}

//>>environemntal visuals<<
//this is all purely aesthetic, and could be prettier and clearer
//nothing here affects the shared state
function drawRoom() {
  noStroke();
  fill(248);
  rect(0, 0, width, height);
  fill(230);
  rect(0, height * 0.73, width, 12);
  const wx = width * 0.58;
  const wy = height * 0.12;
  const ww = width * 0.32;
  const wh = height * 0.46;
  fill(190, 215, 245);
  rect(wx + 18, wy + 18, ww - 36, wh - 36, 12);
}

//draw the pots that will hold the plants and lay them out evenly across the window sill
function drawPots(pots) {

  const potsPerRow = 10;

  const windowSillY= height * 0.62; // align pots with the new shelf
  const rowOffset = 70; //disntance between rows
  const rows = Math.ceil(pots.length/potsPerRow);

  const left = width * 0.14;
  const right = width * 0.86;
  const step = (right - left) /(potsPerRow-1);

  const size = width <800? 42:48; //smaller on smaller screens

  for(let i =0; i< pots.length; i++){
    const row = Math.floor(i/potsPerRow);
    const col = i% potsPerRow;

    const x = left + col * step;

    //push lower rows down a bit so they don't crowd the shelf
    const y = windowSillY + row * rowOffset + row * 15;

    drawPot(x,y,size,pots[i]);
  }
  }


//draw an individual pot. 
function drawPot(x, y, size, pot) {
  rectMode(CENTER);
  noStroke();

  //pastel palette for pots (varies per pot id)
  const pastel = [
    [173, 216, 230], // baby blue
    [255, 192, 203], // baby pink
    [216, 191, 216], // pastel purple
    [255, 236, 179], // pastel yellow
    [255, 210, 161]  // pastel orange/peach
  ];
  const c = pastel[(pot.id || 0) % pastel.length];

  // soft drop shadow (makes it feel less flat)
  fill(0, 0, 0, 20);
  ellipse(x, y + size * 0.32, size * 1.0, size * 0.28);

  // pot body (pastel)
  fill(c[0], c[1], c[2]);
  rect(x, y - size * 0.25, size * 0.9, size * 0.7, 12);

  // pot rim slightly darker (tiny contrast)
  fill(c[0] - 12, c[1] - 12, c[2] - 12);
  rect(x, y + size * 0.05, size, size * 0.25, 12);

  // soil
  fill(120, 95, 70);
  ellipse(x, y - size * 0.6, size * 0.9, size * 0.3);

  // labels (name + caretaker of the plant and its owner)
  if (pot.status !== "empty") {
    fill(40);
    textAlign(CENTER, BOTTOM);
    textSize(11);
    text(pot.name || "Unnamed plant", x, y - size * 1.35);

    textSize(9);
    fill(90);
    text(`by ${pot.caretaker || "Anonymous"}`, x, y - size * 1.18);

    //show how long it's been since this plant was watered.
    drawWaterInfo(x, y, size, pot);
  }

  // plant visuals depend on the state of the server!
  if (pot.status === "empty") {
    fill(120);
    textAlign(CENTER, CENTER);
    textSize(10);
    text("empty", x, y - size * 1.05);
    return;
  }

  if (pot.status === "withered") {
    drawWitheredPlant(x, y - size * 0.7);
    return;
  }

  drawPlant(x, y - size * 0.7, size, pot);
}

//draw the plants themselves 
function drawPlant(x, y, size, pot) {
  //growth is a value between 0 and 1, and this comes from the server.
  const g = pot.growth || 0;
  //map the growth to visible height
  const h = map(g, 0, 1, 6, 46);

  // stem
  fill(90, 170, 110);
  rect(x, y - h / 2, 6, h, 4);

  // different plants look a bit different, and here is where that is being drawn
  if (pot.seedType === "fern") {
    fill(100, 190, 120);
    ellipse(x - 10, y - h * 0.7, 16 * g, 8);
    ellipse(x + 10, y - h * 0.8, 16 * g, 8);
  } else if (pot.seedType === "flower") {
    fill(220, 120, 160);
    ellipse(x, y - h, 12 + 10 * g);
  } else if (pot.seedType === "moss") {
    fill(110, 180, 100);
    ellipse(x, y - 4, 26 * g, 10 * g);
  }
}

//what should dying plants look like
function drawWitheredPlant(x, y) {
  stroke(120, 90, 70);
  strokeWeight(2);
  line(x, y, x, y + 30);
  noStroke();
}

//>>Time & Care visualisation<<
function drawWaterInfo(x, y, size, pot) {
  if (!pot.lastWateredAt) return;

  const days = daysSince(pot.lastWateredAt);
  let label = "";

  if (days < 1) label = "watered today";
  else if (days < 2) label = "1 day dry";
  else label = `${Math.floor(days)} days dry`;

  fill(120);
  textSize(9);
  textAlign(CENTER, TOP);
  text(label, x, y + size * 0.45);
}

//this MUST match the server's definition of a "day".
//if you uncomment the full 24 hours for a day, you need to update this too!
function daysSince(timestamp) {
  const ONE_DAY_MS = 1000 * 60 * 5; // must match server
  return (Date.now() - timestamp) / ONE_DAY_MS;
}

//>>interactions<<
function mousePressed() {
  if (!world) return;

  const pot = potAt(mouseX, mouseY);
  if (!pot) return;

  //we never directly change pot data here
  //we just ask the server to do it!
  if (mode === "plant") {
    const name = prompt("Name your plant:");
    if (name === null) return;

    const caretaker = prompt("Your name (or leave blank):") || "";

    socket.emit("plant", {
      potId: pot.id,
      seedType: seeds[seedIndex],
      name,
      caretaker
    });
  }

  if (mode === "water") {
    socket.emit("water", { potId: pot.id });
  }

  if (mode === "clear") {
    socket.emit("clear", { potId: pot.id });
  }
}

//interacting with the plants
function keyPressed() {
  if (key === "p" || key === "P") mode = "plant";
  if (key === "w" || key === "W") mode = "water";
  if (key === "c" || key === "C") mode = "clear";

  if (mode === "plant" && keyCode === RIGHT_ARROW) {
    seedIndex = (seedIndex + 1) % seeds.length;
  }
}

//>helper functions<<
//clicking on pots
function potAt(mx, my) {
  const potsPerRow = 10;

  const sillY = height * 0.62;
  const rowOffset = 70;

  const left = width * 0.14;
  const right = width * 0.86;
  const step = (right - left) / (potsPerRow - 1);

  const size = width < 800 ? 42 : 48;
  const hitRadius = size * 0.7;

  for (let i = 0; i < world.pots.length; i++) {
    const row = Math.floor(i / potsPerRow);
    const col = i % potsPerRow;

    const x = left + col * step;

    //must match drawPots layout so clicking works correctly
    const y = sillY + row * rowOffset + row * 15;

    if (dist(mx, my, x, y) < hitRadius) return world.pots[i];
  }
  return null;
}

//update smal text in corner of the screen to say things like "nothing to water"
function setLog(msg) {
  if (logEl) logEl.textContent = msg;
}
