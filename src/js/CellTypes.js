//import {parse} from "./TemplateClassParser.js";

const TWO_PI = 2 * Math.PI;

const generatePoints = (num) => {
	const twiceNum = num * 2;
	let points = new Float32Array(twiceNum);
	const increment = TWO_PI / num;
	let n = 0;
	let angle;
	while (n < twiceNum) {
		angle = (n / 2 | 0) * increment;
		points[n++] = Math.cos(angle),
		points[n++] = Math.sin(angle);
	}
	return points;
};
const getPoints = (num) => {
	const numPoints = Math.min(num, sample);
	const twiceNumPoints = numPoints * 2;
	const points = new Float32Array(twiceNumPoints);
	const increment = sample / numPoints;
	const offset = Math.random() * increment;
	let n = 0;
	let index;
	while (n < twiceNumPoints) {
		index = (n * increment + offset) | 0;
		index -= index % 2;
		points[n++] = pointCache[index],
		points[n++] = pointCache[index + 1];
	}
	return points;
};
const adjustPoints = (radius) => {
	const twiceSample = sample * 2;
	const points = new Float32Array(twiceSample);
	let n = 0;
	let r;
	while (n < twiceSample) {
		r = radius + (n % 4 ? 3 : -3);
		points[n] = pointCache[n++] * r,
		points[n] = pointCache[n++] * r;
	}
	return points;
};

const sample = 120;
let pointCache = generatePoints(sample);
window.pointCache = pointCache;

class Basic {
	constructor(id, x, y, r, color) {
		this.id = id;
		this.ox = this.nx = this.x = x;
		this.oy = this.ny = this.y = y;
		this.or = this.nr = this.r = r;
		this.color = color;
		this.updated = 0;
		this.dead = Infinity;
	}
	move(delta) {
		this.x = this.ox + (this.nx - this.ox) * delta;
		this.y = this.oy + (this.ny - this.oy) * delta;
		this.r = this.or + (this.nr - this.or) * delta;
	}
	update(x, y, r, time) {
		this.ox = this.x;
		this.oy = this.y;
		this.or = this.r;
		this.nx = x;
		this.ny = y;
		this.nr = r;
		this.updated = time;
	}
}
class Detailed extends Basic {
	constructor(id, x, y, r, color, detail) {
		super(id, x, y, r, color);
		this.points = getPoints(detail);
	}
}
export class Pellet extends Detailed {
	constructor(id, x, y, r, color, detail) {
		super(id, x, y, r, color, detail);
		this.type = 0;
	}
}
export class Ejected extends Detailed {
	constructor(id, x, y, r, color, detail, sColor) {
		super(id, x, y, r, color, detail);
		this.sColor = sColor;
		this.type = 1;
	}
}
export class Virus extends Basic {
	constructor(id, x, y, r, color, sColor) {
		super(id, x, y, r, color);
		this.points = adjustPoints(r);
		this.sColor = sColor;
		this.resized = true;
		this.type = 2;
	}
	move(delta) {
		this.x = this.ox + (this.nx - this.ox) * delta;
		this.y = this.oy + (this.ny - this.oy) * delta;
		this.r = this.or + (this.nr - this.or) * delta;
		if (this.r != this.nr || !this.resized) {
			this.r == this.nr && (this.resized = true);
			this.points = adjustPoints(this.r);
		}
	}
	update(x, y, r, time) {
		Basic.prototype.update.call(this, x, y, r, time);
		this.resized = false;
	}
}
export class Cell extends Detailed {
	constructor(id, x, y, r, color, detail, sColor, name, skin, mine) {
		super(id, x, y, r, color, detail);
		this.sColor = sColor;
		this.name = name;
		this.skin = skin;
		this.mine = mine;
		this.type = 3;
	}
}
