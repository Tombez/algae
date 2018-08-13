import Reader from "./Reader.js";
import Writer from "./Writer.js";
import {Pellet, Ejected, Virus, Cell} from "./CellTypes.js";
import * as colorUtils from "./colorUtils.js";

const KEY_TO_UINT = new Map([
	[32, new Uint8Array([17])], // space, split
	[87, new Uint8Array([21])], // w, eject
	[81, new Uint8Array([18])], // q, toggle free spectate
]);

export default class GameSocket extends WebSocket {
	constructor(url, listeners, checks, https) {
		super(`ws${https ? "s" : ""}://${url}`);
		this.server = url;
		this.listeners = listeners;
		this.checks = checks;
		this.binaryType = "arraybuffer";
		this.onopen = this.open.bind(this);
		this.onerror = this.error.bind(this);
		this.onclose = this.close.bind(this);
		this.onmessage = this.message.bind(this);
	}
	open(event) {
		console.log(event);
		this.listeners.onopen();
		this.sendConnect();
	}
	error(error) {
		console.error(error);
	}
	close(event) {
		this.listeners.onclose();
		console.log(`ws disconnected ${event.code} '${event.reason}'`);
	}
	message(event) {
		const msgStamp = Date.now();
		this.listeners.upd(msgStamp);
		let reader = new Reader(event.data, 0, true);
		const opcode = reader.getUint8();
		switch(opcode) {
			case 16: // update
				// consume records
				const consumeCount = reader.getUint16();
				for (let n = 0; n < consumeCount; n++) {
					const killerID = reader.getUint32();
					const victimID = reader.getUint32();
					this.listeners.removeCell(victimID, killerID);
				}
				// update records
				let id;
				while (id = reader.getUint32()) {
					const x = reader.getInt32();
					const y = reader.getInt32();
					const r = reader.getUint16();

					const flags = reader.getUint8();
					const isVirus = flags & 1;
					const readColor = flags & 2;
					const readSkin = flags & 4;
					const readName = flags & 8;
					const isAgitated = flags & 16;
					const isMyEjected = flags & 32;
					const isOtherEjected = flags & 64;
					const readExtended = flags & 128;

					const extended = readExtended ? reader.getUint8() : 0;
					const isPellet = extended & 1;
					const isFriend = extended & 2;
					const readAccountId = extended & 4;

					let colorBytes;
					const color = readColor ? colorUtils.bytesToHex(colorBytes = reader.getRGB()) : null;
					const skinName = readSkin ? reader.getStringUTF8() : null;
					const name = readName ? reader.getStringUTF8() : null;
					const accountId = readAccountId ? reader.getUint32() : null;

					if (/\{([\w\W]+)\}/.exec(name)) {
						console.warn("possible skin in name: " + name);
					}

					const sColor = readColor ? colorUtils.bytesToHex(colorUtils.scaleBytes(colorBytes, 0.5)) : null;
					const isMine = this.checks.mine(id);
					const skin = readSkin && skinName ? this.checks.getSkin(skinName) : null;

					let cell = this.checks.getCell(id);
					if (cell) {
						cell.update(x, y, r);
						cell.updated = msgStamp;
					} else {
						if (isPellet || r < 31) {
							cell = new Pellet(id, x, y, r, color, Math.random() * 4 | 0 + 6);
						} else {
							if (isMyEjected || isOtherEjected) {
								cell = new Ejected(id, x, y, r, color, 20, sColor);
							} else if (isVirus || isAgitated) {
								cell = new Virus(id, x, y, r, color, sColor);
							} else {
								cell = new Cell(id, x, y, r, color, 50, sColor, name, skin, isMine);
							}
							cell.updated = msgStamp;
						}
						//console.log(cell);
						this.listeners.newCell(cell);
					}
				}
				// disappear records
				const disappearCount = reader.getUint16();
				for (let n = 0; n < disappearCount; n++) {
					this.listeners.removeCell(reader.getUint32());
				}
				break;
			case 17: // update camera
				console.debug("update pos");
				this.listeners.moveCamera(reader.getFloat32(), reader.getFloat32(), reader.getFloat32());
				break;
			case 18: // clear all
				console.debug("clear all");
				this.listeners.clearCells();
				break;
			case 20: // clear my cells
				console.debug("clear my cells");
				this.listeners.clearMine();
				break;
			case 32: // new my cell
				console.debug("new my cell");
				// this happens before client gets cell data
				this.listeners.newMine(reader.getUint32());
				break;
			case 49: // ffa list
				let items = [];
				const ffaCount = reader.getUint32();
				for (let n = 0; n < ffaCount; n++) {
					items.push({
						me: reader.getUint32(),
						name: reader.getStringUTF8() || "An unnamed cell"
					});
				}
				this.listeners.leaderboardList(items);
				break;
		}
	}
	sendConnect() {
		console.debug("send connect");
		this.send(new Uint8Array([254, 6, 0, 0, 0]));
		this.send(new Uint8Array([255, 1, 0, 0, 0]));
	}
	sendPlay(name) {
		let writer = new Writer(true);
		writer.setUint8(0x00);
		writer.setStringUTF8(name);
		this.send(writer.pack());
	}
	sendMouse(x, y) {
		let writer = new Writer(true);
		writer.setUint8(0x10);
		writer.setUint32(x);
		writer.setUint32(y);
		writer._b.push(0, 0, 0, 0);
		this.send(writer.pack());
	}
	sendKeyEvent(keycode) {
		const uint = KEY_TO_UINT.get(keycode);
		if (uint) {
			this.send(uint);
		}
	}
	sendSpectate() {
		this.send(new Uint8Array([1]));
	}
}
