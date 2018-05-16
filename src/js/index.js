import * as graphics from "./graphics.js";
import GameSocket from "./GameSocket.js";
import CharacterCache from "./CharacterCache.js";

const LOAD_START = Date.now();
const SKIN_URL = "./skins/";
const USE_HTTPS = "https:" == location.protocol;
const PI_2 = Math.PI * 2;

let cells;
let leaderboard;
let minimap;
let stats;
let camera;
let target;
let mouse;
//let updTime;

let canvas;
let connecting;
let overlay;
let gamemode;
let chatBox;
let nick;

let frameStamp = Date.now();
let ws;
let ctx;
let knownSkins = new Set();
let loadedSkins = new Map();
let overlayVisible = false;
let guiScale = 1;
let cache = new CharacterCache((char, size) => graphics.createCharacter(char, size));
let options = {
	mass: true,
	names: true,
	leaderboard: true,
	grid: true,
	color: true,
	skins: true,
	dark: true
};
let pressed = new Map([
	[32, false], // space
	[87, false], // w
	[81, false], // q
	[27, false], // esc
]);

/*class Average {
	constructor() {
		this.index = 0;
		this.values = new Array(125).fill(40);
		this.avg = 40;
		this.last = Date.now();
	}
	upd(time) {
		const delta = time - this.last;
		if (delta < this.avg * 10) {
			this.values[this.index] = delta;
			this.index = (this.index + 1) % this.values.length;
			this.last = time;
			this.avg = 0;
			for (let val of this.values) {
				this.avg += val;
			}
			this.avg /= this.values.length;
		}
	}
}*/
const reset = () => {
	window.cells = cells = { // debugging purposes
		mine: [],
		byId: new Map(),
		list: []
	};
	leaderboard = {
		type: NaN,
		items: null,
		canvas: document.createElement("canvas"),
		teams: ["#F33", "#3F3", "#33F"]
	};
	stats = {
		fps: 0,
		score: 0,
		maxScore: 0
	};
	camera = {
		x: 0,
		y: 0,
		z: 1,
	};
	target = {
		x: 0,
		y: 0,
		z: 1
	};
	mouse = {
		x: 0,
		y: 0,
		z: 1
	};
	//updTime = new Average();
};
const domElements = () => {
	const elm = elem => document.getElementById(elem);
	canvas = elm("canvas");
	connecting = elm("connecting");
	overlay = elm("overlay");
	gamemode = elm("gamemode");
	nick = elm("nick");
};
const attachListeners = (target, listeners) => {
	for (let [type, handler] of Object.entries(listeners)) {
		target.addEventListener(type, handler);
	}
};
const requestSkinList = () => {
	/*fetch("checkdir.php").then(response => {
		if (response.ok) {
			response.text().then(text => {
				const skins = text.split("\0").slice(0, -1);
				knownSkins = new Set(skins);
			})
		}
	});*/
};
const loadOptions = () => {
	for (let key of Object.keys(options)) {
		const value = window.localStorage.getItem(key);
		if (value) {
			options[key] = !!parseInt(value);
		}
	}
};
const buildOptions = () => {
	let built = "";
	for (let option of Object.keys(options)) {
		built += `<label><input type="checkbox" class="checkbox" onchange="options.${option}=this.checked;"
		${options[option] ? "checked" : ""}>${option.slice(0,1).toUpperCase()+option.slice(1)}</label>`;
	}
	document.getElementById("options").innerHTML = built;
};
const hideOverlay = () => {
	overlayVisible = false;
	overlay.style.display = "none";
};
const showOverlay = () => {
	overlayVisible = true;
	overlay.style.display = "block";
	setTimeout(() => overlay.style.opacity = 1);
};
const checks = {
	getCell: id => cells.byId.get(id),
	mine: id => cells.mine.indexOf(id) !== -1,
	getSkin: (skinName) => {
		if (skinName.charAt(0) == "%") {
			console.warn("skin name with % in it");
		}
		if (knownSkins.has(skinName)) {
			let image = loadedSkins.get(skinName);
			if (!image) {
				image = new Image();
				loadedSkins.set(skinName, image);
				image.src = SKIN_URL + skinName + ".png";
			}
			return image;
		}
		console.warn("couldn't load skin " + skinName);
	}
};
const cellSort = (a, b) => a.r !== b.r ? a.r - b.r : a.id - b.id;
const destroyCell = (cell, killer) => {
	cells.byId.delete(cell.id);
	if (cell.mine) {
		cells.mine.splice(cells.mine.indexOf(cell.id), 1);
		if (!cells.mine.length && !overlayVisible) {
			overlay.style.opacity = 0;
			showOverlay();
		}
	}
	cell.dead = frameStamp;
	if (killer) {
		// move cell to killer's position
	}
};
const updateView = (delta) => {
	let x = 0, y = 0, r = 0, score = 0, len = 0;
	for (let id of cells.mine) {
		const cell = cells.byId.get(id);
		if (cell) {
			score += cell.r * cell.r;
			x += cell.x;
			y += cell.y;
			r += cell.r;
			++len;
		}
	}
	if (len) {
		target.x = x / len;
		target.y = y / len;
		target.z = Math.pow(Math.min(64 / r, 1), .4);
		//camera.x += (target.x - camera.x) / 4;
		//camera.y += (target.y - camera.y) / 4;
		camera.x = target.x;
		camera.y = target.y;
		//camera.x = (camera.x + target.x) / 2;
		//camera.y = (camera.y + target.y) / 2;
		stats.score = score / 100 | 0;
		stats.maxScore = Math.max(stats.maxScore, stats.score);
	} else {
		stats.score = 0;
		stats.maxScore = 0;
		/*camera.x += (target.x - camera.x) / 20;
		camera.y += (target.y - camera.y) / 20;*/
		camera.x += (target.x - camera.x) / 9 * delta;
		camera.y += (target.y - camera.y) / 9 * delta;
	}
	camera.z += (target.z * guiScale * mouse.z - camera.z) / 9;
};
const loop = () => {
	const now = Date.now();
	const frameDelta = (now - frameStamp) / (1e3 / 60);
	stats.fps += (1000 / Math.max(now - frameStamp, 1) - stats.fps) / 10;
	frameStamp = now;

	if (ws && ws.readyState === 1) {
		ws.sendMouse(
			(mouse.x - canvas.width / 2) / camera.z + camera.x,
			(mouse.y - canvas.height / 2) / camera.z + camera.y
		);
	}

	cells.list.sort(cellSort);
	for (let n = 0, list = cells.list; n < list.length; n++) {
		const cell = list[n];
		if (frameStamp - cell.dead > 120) {
			cells.list.splice(n--, 1);
		}
		const delta = Math.max(Math.min((now - cell.updated) / 120/*(updTime.avg * 2)*/, 1), 0);
		if (cell.type !== 0) {
			cell.move(delta);
		}
	}
	updateView(frameDelta);
	graphics.draw(ctx, options, camera, cells.list, stats, leaderboard, cache, guiScale, frameStamp);
	window.requestAnimationFrame(loop);
};
const initWs = (url) => {
	console.debug("init ws");
	ws && reset();
	connecting.style.display = "block";
	ws = new GameSocket(url, wsListeners, checks, USE_HTTPS);
};
const wsListeners = {
	onopen: () => {
		connecting.style.display = "none";
	},
	onclose: () => {
		reset();
		setTimeout(() => {
			initWs(ws.server);
		}, 5000);
	},
	removeCell: (victimID, killerID) => {
		const victim = cells.byId.get(victimID);
		const killer = cells.byId.get(killerID);
		if (victim) {
			if (victim.dead !== Infinity) {
				console.warn("victim was already dead");
			}
			destroyCell(victim, killer);
		}
	},
	newCell: (cell) => {
		cells.byId.set(cell.id, cell);
		cells.list.push(cell);
	},
	moveCamera: (x, y, z) => {
		target.x = x;
		target.y = y;
		target.z = z;
	},
	clearCells: () => {
		cells.mine = [];
		cells.list = [];
		cells.byId.clear();
	},
	clearMine: () => {
		cells.mine = [];
	},
	newMine: (id) => {
		cells.mine.push(id);
	},
	leaderboardList: (items) => {
		leaderboard.items = items;
		graphics.updateLeaderboard(leaderboard);
	},
	upd: () => {}
	//upd: time => updTime.upd(time)
};
const windowListeners = {
	keydown: (event) => {
		if (event.keyCode == 27) {// esc
			if (!pressed.esc) {
				pressed.set(event.keyCode, true);
				if (overlayVisible) {
					if (cells.mine.length) {
						hideOverlay();
					}
				} else {
					showOverlay();
				}
			}
		} else if (!overlayVisible) {
			if (pressed.has(event.keyCode) && !pressed.get(event.keyCode)) {
				ws.sendKeyEvent(event.keyCode);
				pressed.set(event.keyCode, true);
			}
		}
	},
	keyup: (event) => {
		if (pressed.get(event.keyCode)) {
			pressed.set(event.keyCode, false);
		}
	},
	beforeunload: () => {
		const storage = window.localStorage;
		const now = Date.now();
		if (now - parseInt(storage.getItem("lastUpdated") || "0") > 6048e5) { // one week in ms
			storage.clear();
			storage.setItem("lastUpdated", now.toString());
		}
		for (let key of Object.keys(options)) {
			storage.setItem(key, options[key] ? "1" : "0");
		}
	},
	resize: () => {
		requestAnimationFrame(() => {
			const cW = canvas.width = window.innerWidth;
			const cH = canvas.height = window.innerHeight;
			guiScale = Math.sqrt(Math.min(cW / 1920, cH / 1080));
		});
	}
};
const canvasListeners = {
	wheel: (event) => {
		const direction = event.deltaY > 0 ? .9 : 1.1;
		mouse.z = Math.min(Math.max(mouse.z * direction, 1), 4);
	},
	mousemove: (event) => {
		mouse.x = event.clientX;
		mouse.y = event.clientY;
	}
};
const core = {
	setserver: (url) => {
		(!ws || ws.server != url) && initWs(url);
	},
	spectate: () => {
		if (ws && ws.readyState === 1) {
			ws.sendSpectate();
			stats.maxScore = 0;
			hideOverlay();
		} else {
			gamemode.focus();
		}
	},
	play: () => {
		if (ws && ws.readyState === 1) {
			ws.sendPlay(nick.value);
			hideOverlay();
		} else {
			gamemode.focus();
		}
	},
	openSkinsList: () => {
		/*if (jQuery("#inPageModalTitle").text() != "Skins") {
			jQuery.get("include/gallery.php").then((data) => {
				jQuery("#inPageModalTitle").text("Skins");
				jQuery("#inPageModalBody").html(data);
			});
		}*/
	}
};

const init = () => {
	console.info(`page load took ${performance.now() | 0}ms`);

	reset();
	domElements();
	ctx = canvas.getContext("2d");
	document.fonts.ready.then(() => cache.clear());
	window.options = options;
	window.core = core;
	attachListeners(window, windowListeners);
	attachListeners(canvas, canvasListeners);
	windowListeners.resize();

	let serverIP = /ip=([^&]+)/.exec(window.location.search);
	serverIP && core.setserver(serverIP[1]);

	requestSkinList();
	window.requestAnimationFrame(loop);
	loadOptions();
	buildOptions();
	showOverlay();
	console.info(`init took ${Date.now() - LOAD_START}ms`);
};
window.addEventListener("DOMContentLoaded", init);
