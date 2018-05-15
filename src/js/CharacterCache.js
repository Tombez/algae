export default class CharacterCache {
	constructor(callback) {
		this.callback = callback;
		this.sizes = new Map();
	}
	retrieve(string, size) {
		const key = Math.max(Math.ceil(Math.sqrt(size)) ** 2, 8);
		let chars = this.sizes.get(key);
		if (!chars) {
			chars = new Map();
			this.sizes.set(key, chars);
		}
		let result = [];
		for (let n = 0, len = string.length; n < len; ++n) {
			const char = string.charCodeAt(n);
			let img = chars.get(char);
			if (!img) {
				img = this.callback(String.fromCharCode(char), key);
				chars.set(char, img);
			}
			result.push(img);
		}
		return result;
	}
	clear() {
		this.sizes.clear();
	}
}
