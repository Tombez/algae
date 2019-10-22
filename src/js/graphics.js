const TWO_PI = 2 * Math.PI;

const getFont = size => `bold ${size}px Ubuntu`;
export const draw = (ctx, options, camera, cellList, stats, leaderboard, chat, cache, viewportScale, frameStamp) => {
	ctx.resetTransform();
	background(ctx, options.dark ? "#111" : "#F2FBFF");
	if (options.grid) {
		grid(ctx, options.dark ? "#AAA" : "#000", camera);
	}

	let lastColor;
	const midX = ctx.canvas.width / 2;
	const midY = ctx.canvas.height / 2;
	ctx.translate(midX, midY);
	ctx.scale(camera.z, camera.z);
	ctx.translate(-camera.x, -camera.y);
	for (const cur of cellList) {
		ctx.beginPath();
		ctx.translate(cur.x, cur.y);
		if (cur.dead !== Infinity) {
			ctx.globalAlpha = 1 - (frameStamp - cur.dead) / 120;
		}
		if (cur.type !== 2) {
			ctx.scale(cur.r, cur.r);
		}
		ctx.fillStyle = cur.color;
		path(ctx, cur.points);
		ctx.closePath();
		ctx.fill();
		if (cur.skin && options.skin && cur.skin.complete && cur.skin.width) {
			ctx.clip();
			ctx.drawImage(cell.skin, -1, -1, 2, 2);
		}
		if (cur.type !== 2) {
			const inverseR = 1 / cur.r;
			ctx.scale(inverseR, inverseR);
		}
		if (cur.type !== 0) {
			ctx.strokeStyle = cur.sColor;
			ctx.lineWidth = cur.r / 50 + 7;
			ctx.stroke();
		}
		if (cur.type === 3) {
			const nameSize = Math.max(cur.r * 0.3, 24);
			const nameResolution = nameSize * camera.z;
			const inverseZ = 1 / camera.z;
			ctx.scale(inverseZ, inverseZ);
			if (options.names && cur.name) {
				cachedText(ctx, cache, cur.name, nameResolution);
			}
			if (options.mass && cur.mine) {
				const y = Math.min(nameSize, cur.r / 2) * camera.z;
				ctx.translate(0, y);
				const mass = (Math.floor(cur.r * cur.r / 100)).toString();
				cachedText(ctx, cache, mass, nameResolution / 2);
				ctx.translate(0, -y);
			}
			ctx.scale(camera.z, camera.z);
		}
		ctx.globalAlpha = 1;
		ctx.translate(-cur.x, -cur.y);
	}
	ctx.translate(camera.x, camera.y);
	const inverseZ = 1 / camera.z;
	ctx.scale(inverseZ, inverseZ);
	ctx.translate(-midX, -midY);

	ctx.scale(viewportScale, viewportScale);

	ctx.fillStyle = options.dark ? "#fff" : "#000";
	ctx.textBaseline = "top";
	ctx.font = getFont(30);
	ctx.fillText("Score: " + stats.score, 0, 0);
	ctx.font = getFont(20);
	ctx.fillText("FPS: " + (stats.fps | 0), 0, 30);

	if (options.leaderboard) {
		ctx.drawImage(leaderboard.canvas, ctx.canvas.width / viewportScale - 10 - leaderboard.canvas.width, 10);
	}
    if ((document.activeElement == chat.box || chat.visible) && options.chat) {
        chat.box.style.display = "block";
        ctx.globalAlpha = document.activeElement == chat.box ? 1 : Math.max(1000 - Date.now() + chat.waitUntil, 0) / 1000;
        ctx.drawImage(
            chat.canvas,
            10 / viewportScale,
            (ctx.canvas.height - 55) / viewportScale - chat.canvas.height
        );
        ctx.globalAlpha = 1;
    } else if (options.chat) chat.box.style.display = "block";
    else if (!options.chat) chat.box.style.display = "none";
	const inverseViewportScale = 1 / viewportScale;
	ctx.scale(inverseViewportScale, inverseViewportScale);
};
const background = (ctx, color) => {
	ctx.fillStyle = color;
	ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
};
const grid = (ctx, color, {x, y, z}) => {
	ctx.lineWidth = 1;
	ctx.strokeStyle = color;
	ctx.globalAlpha = 0.2;
	const step = 50,
		cW = ctx.canvas.width / z,
		cH = ctx.canvas.height / z,
		startLeft = (cW / 2 - x) % step,
		startTop = (cH / 2 - y) % step;
	ctx.scale(z, z);
	ctx.beginPath();
	for (let n = startLeft; n < cW; n += step) {
		ctx.moveTo(n, 0);
		ctx.lineTo(n, cH);
	}
	for (let n = startTop; n < cH; n += step) {
		ctx.moveTo(0, n);
		ctx.lineTo(cW, n);
	}
	ctx.stroke();
	const inverseZ = 1 / z;
	ctx.scale(inverseZ, inverseZ);
	ctx.globalAlpha = 1;
};
const triangle = (ctx, ax, ay, bx, by, cx, cy) => {
	ctx.moveTo(ax, ay);
	ctx.lineTo(bx, by);
	ctx.lineTo(cx, cy);
	ctx.lineTo(ax, ay);
};
const triangleStrip = (ctx, points) => {
	let ax = points[0], ay = points[1];
	let bx = points[2], by = points[3];
	let cx, cy;
	let n = 2;
	while (n < points.length - 2) {
		cx = points[n++], cy = points[n++];
		triangle(ctx, ax, ay, bx, by, cx, cy);
		ax = bx, ay = by,
		bx = cx, by = cy;
	}
};
const triangleStripLoop = (ctx, points) => {
	triangleStrip(ctx, points);
	const len = points.length;
	const ax = points[len - 4], ay = points[len - 3],
	bx = points[len - 2], by = points[len - 1],
	cx = points[0], cy = points[1],
	dx = points[2], dy = points[3];
	triangle(ctx, ax, ay, bx, by, cx, cy);
	triangle(ctx, bx, by, cx, cy, dx, dy);
};
const triangleFan = (ctx, cx, cy, points) => {
	const len = points.length;
	let ax = points[0], ay = points[1];
	let bx, by;
	let n = 2;
	while (n < len) {
		bx = points[n++], by = points[n++];
		triangle(ctx, ax, ay, bx, by, cx, cy);
		ax = bx, ay = by;
	}
};
const triangleFanLoop = (ctx, cx, cy, points) => {
	const len = points.length;
	let ax = points[0], ay = points[1];
	let bx, by;
	let n = 2;
	while (n < len) {
		bx = points[n++], by = points[n++];
		ctx.moveTo(ax, ay);
		ctx.lineTo(bx, by);
		ctx.lineTo(cx, cy);
		ctx.lineTo(ax, ay);
		ax = bx, ay = by;
	}
	ax = points[len - 2], ay = points[len - 1];
	bx = points[0], by = points[1];
	ctx.moveTo(ax, ay);
	ctx.lineTo(bx, by);
	ctx.lineTo(cx, cy);
	ctx.lineTo(ax, ay);
};
const path = (ctx, points) => {
	const len = points.length;
	ctx.moveTo(points[0], points[1]);
	let n = 2;
	while (n < len) {
		ctx.lineTo(points[n++], points[n++]);
	}
};
export const updateLeaderboard = (leaderboard) => {
	if (leaderboard.items.length === 0 || !options.names) {
		return;
	}
	const canvas = leaderboard.canvas;
	const ctx = canvas.getContext("2d");
	const len = leaderboard.items.length;

	canvas.width = 200;
	canvas.height = 24 * len + 60;

	ctx.globalAlpha = .4;
	ctx.fillStyle = "#000";
	ctx.fillRect(0, 0, 200, canvas.height);

	ctx.globalAlpha = 1;
	ctx.fillStyle = "#FFF";
	ctx.font = getFont(30);
	ctx.fillText("Leaderboard", 100 - ctx.measureText("Leaderboard").width / 2, 40);

	let text, isMe = false, w, start;
	ctx.font = getFont(20);
	for (let n = 0; n < len; n++) {
		const cur = leaderboard.items[n];
		if (leaderboard.type === "text") {
			text = cur;
		} else {
			text = cur.name;
			isMe = cur.me;
		}

		// replace {skin} with empty string
		const match = /\{([\w]+)\}/.exec(text);
		if (match) {
			//text = text.replace(match[0], "").trim();
			console.warn("leaderboard name has possible skin: " + text);
		}

		ctx.fillStyle = isMe ? "#FAA" : "#FFF";
		if (leaderboard.type === "ffa") {
			text = (n + 1) + ". " + (text || "An unnamed cell");
		}
		const w = ctx.measureText(text).width;
		const start = (w > 200) ? 2 : 100 - w * 0.5;
		ctx.fillText(text, start, 70 + 24 * n);
	}
};
export const updateChat = (chat) => {
	if (chat.messages.length === 0 || !options.chat) {
		return chat.visible = false;
	}
    
    chat.visible = true;
	const canvas = chat.canvas;
	const ctx = canvas.getContext("2d");
	const latestMessages = chat.messages.slice(-15);
    const len = latestMessages.length;
    
    let width = 0;
    let height = 20 * len + 2;
    
    let lines = [];
    for (let i = 0; i < len; i++) {
        lines.push([
            {
                text: latestMessages[i].name,
                color: latestMessages[i].color
            }, {
                text: " " + latestMessages[i].message,
                color: options.dark ? "#FFF" : "#000"
            }
        ]);
    }
    
    for (let i = 0; i < len; i++) {
        let thisLineWidth = 0;
        let complexes = lines[i];
        for (let j = 0; j < complexes.length; j++) {
            ctx.font = getFont(18);
            complexes[j].width = ctx.measureText(complexes[j].text).width;
            thisLineWidth += complexes[j].width;
        }
        width = Math.max(thisLineWidth, width);
    }
    
    canvas.width = width;
    canvas.height = height;
    
    for (let i = 0; i < len; i++) {
        width = 0;
        let complexes = lines[i];
        for (var j = 0; j < complexes.length; j++) {
            ctx.font = getFont(18);
            ctx.fillStyle = complexes[j].color;
            ctx.fillText(complexes[j].text, width, 20 * (1 + i));
            width += complexes[j].width;
        }
    }
};
const cachedText = (ctx, cache, string, size, outline) => {
	const chars = cache.retrieve(string, size);
	let height = chars[0].height;
	let width = 0;
	for (let img of chars) {
		width += img.width;
	}
	let x = -width / 2;
	const y = -height / 2;
	const ratio = size / height;
	ctx.scale(ratio, ratio);
	for (let img of chars) {
		ctx.drawImage(img, x, y);
		x += img.width;
	}
	const inverseRatio = 1 / ratio;
	ctx.scale(inverseRatio, inverseRatio);
};
export const createCharacter = (char, size) => {
	const canvas = document.createElement("canvas");
	const ctx = canvas.getContext("2d");
	ctx.font = getFont(size);
	canvas.width = ctx.measureText(char).width;
	canvas.height = size;
	text(ctx, char, canvas.width / 2, canvas.height / 2, size);
	return canvas;
};
const text = (ctx, string, x, y, size) => {
	ctx.font = getFont(size);
	ctx.textBaseline = "middle";
	ctx.textAlign = "center";
	ctx.fillStyle = "#fff";
	ctx.strokeStyle = "#000";
	ctx.fillText(string, x, y);
	ctx.lineWidth = size / 30; // Math.max(Math.floor(size / 10), 2)
	ctx.strokeText(string, x, y);
};

const prettyPrintTime = (seconds) => {
	seconds = seconds | 0;
	const minutes = seconds / 60 | 0;
	if (minutes < 1) return seconds + "sec";
	const hours = minutes / 60 | 0;
	if (hours < 1) return minutes + "min";
	const days = hours / 24 | 0;
	if (days < 1) return hours + "h";
	return days + "d";
};
