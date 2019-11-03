import * as graphics from "./graphics.js";
import GameSocket from "./GameSocket.js";
import CharacterCache from "./CharacterCache.js";

const LOAD_START = performance.now();
const SKIN_URL = "./skins/";
const USE_HTTPS = "https:" == location.protocol;
const PI_2 = Math.PI * 2;
const ANIMATION_DELAY = 120;

let cells;
let leaderboard;
let chat;
let minimap;
let stats;
let camera;
let target;
let mouse;
let updTime;

let canvas;
let connecting;
let overlay;
let gamemode;
let nick;

let frameStamp;
let ws;
let ctx;
let knownSkins = new Set();
let loadedSkins = new Map();
let overlayVisible = false;
let viewportScale = 1;
let cache = new CharacterCache((char, size) => graphics.createCharacter(char, size));
let options = {
    mass: true,
    names: true,
    leaderboard: true,
    grid: true,
    color: true,
    skins: true,
    dark: true,
    chat: true
};
let pressed = new Map([
	[" ", false],
	["w", false],
	["q", false],
	["escape", false],
	["enter", false],
]);

class Average {
    constructor() {
        this.index = 0;
        this.values = new Array(125).fill(40);
        this.avg = 40;
        this.last = performance.now();
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
}
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
    chat = {
        messages: [],
        waitUntil: 0,
        canvas: document.createElement("canvas"),
        box: document.getElementById("chat_textbox"),
        visible: false
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
        },
        updTime = new Average();
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
const sortCellsBySize = (a, b) => a.r !== b.r ? a.r - b.r : a.id - b.id;
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
        cell.update(killer.nx, killer.ny, cell.r, frameStamp);
    }
};
const updateView = (delta) => {
    let x = 0,
        y = 0,
        r = 0,
        score = 0,
        len = 0;
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
        target.z = Math.pow(Math.min(64 / r, 1), .4) * viewportScale * mouse.z;
        stats.score = score / 100 | 0;
        stats.maxScore = Math.max(stats.maxScore, stats.score);
    } else {
        stats.score = 0;
        stats.maxScore = 0;
    }
    const percent = (1 - (1 / (len ? 2 : 20)) ** delta);
    camera.x += (target.x - camera.x) * percent;
    camera.y += (target.y - camera.y) * percent;
    camera.z += (target.z - camera.z) * (1 - (9 / 10) ** delta);
};
const loop = (now) => {
    const frameDelta = (now - frameStamp) / (1e3 / 60);
    stats.fps += (1e3 / Math.max(now - frameStamp, 1) - stats.fps) / 30;
    frameStamp = now;

    if (ws && ws.readyState === 1) {
        ws.sendMouse(
            (mouse.x - canvas.width / 2) / camera.z + camera.x,
            (mouse.y - canvas.height / 2) / camera.z + camera.y
        );
    }
    cells.list.sort(sortCellsBySize);
    for (let n = 0, list = cells.list; n < list.length; n++) {
        const cell = list[n];
        if (frameStamp - cell.dead > ANIMATION_DELAY) {
            cells.list.splice(n--, 1);
            continue;
        }
        const delta = Math.max(Math.min((now - cell.updated) / ANIMATION_DELAY, 1), 0);
        cell.move(delta);
    }
    updateView(frameDelta);
    graphics.draw(ctx, options, camera, cells.list, stats, leaderboard, chat, cache, viewportScale, frameStamp);
    window.requestAnimationFrame(loop);
};
const initWs = (url) => {
    if (ws && ws.server == url && ws.readyState <= 1) return;
    console.debug("init ws");
    ws && WebSocket.prototype.close.call(ws);
    connecting.style.display = "block";
    ws = new GameSocket(url, wsListeners, checks, USE_HTTPS);
};
const wsListeners = {
    onopen: () => {
        connecting.style.display = "none";
    },
    onclose: () => {
        reset();
        setTimeout(() => initWs(ws.server), 5000);
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
        target.z = z * viewportScale * mouse.z;
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
        leaderboard.type = "ffa";
        graphics.updateLeaderboard(leaderboard);
    },
    chatList: (mes) => {
        const wait = Math.max(3000, 1000 + chat.messages.length * 150);
        chat.waitUntil = Date.now() - chat.waitUntil > 1000 ? Date.now() + wait : chat.waitUntil + wait;
        chat.messages.push(mes);
        graphics.updateChat(chat);
    },
    upd: time => updTime.upd(time)
};
const windowListeners = {
    keydown: ({key}) => {
        key = key.toLowerCase();
        if (key == "enter") {
            if (!options.chat) return;
            if (document.activeElement == chat.box) {
                chat.box.blur();
                const txt = chat.box.value;
                if (txt.length > 0) ws.sendChat(txt);
                chat.box.value = "";
            } else chat.box.focus();
        } else if (key == "escape") {
            pressed.set(key, true);
            if (overlayVisible) {
                if (cells.mine.length) {
                    hideOverlay();
                }
            } else {
                showOverlay();
            }
        } else if (!overlayVisible && document.activeElement != chat.box) {
            if (pressed.has(key) && !pressed.get(key)) {
                ws.sendKeyEvent(key);
                pressed.set(key, true);
            }
        }
    },
    keyup: ({key}) => {
        key = key.toLowerCase();
        if (pressed.get(key)) {
            pressed.set(key, false);
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
        const w = canvas.width = window.innerWidth;
        const h = canvas.height = window.innerHeight;
        viewportScale = Math.max(w / 1920, h / 1080);
    }
};
const canvasListeners = {
    wheel: (event) => {
        const direction = event.deltaY > 0 ? 0.8 : Math.pow(0.8, -1);
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
    windowListeners.resize();

    ctx = canvas.getContext("2d");
    document.fonts.ready.then(() => cache.clear());
    window.options = options;
    window.core = core;
    attachListeners(window, windowListeners);
    attachListeners(canvas, canvasListeners);

    let serverIP = /ip=([^&]+)/.exec(window.location.search);
    serverIP && core.setserver(serverIP[1]);

    requestSkinList();
    frameStamp = performance.now();
    window.requestAnimationFrame(loop);
    loadOptions();
    buildOptions();
    showOverlay();
    console.info(`init took ${performance.now() - LOAD_START}ms`);
};
window.addEventListener("DOMContentLoaded", init);
