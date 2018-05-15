export const bytesToHex = ([r, g, b]) => "#" + (1 << 24 | r << 16 | g << 8 | b).toString(16).slice(1);
export const hexToBytes = (hexColor) => {
	const sliced = hexColor.startsWith("#") ? hexColor.slice(1) : hexColor;
	const b16 = sliced.length === 3 ? sliced.split("").map(a => a + a).join("") : sliced;
	const b2 = parseInt(b16, 16);
	return [b2 >> 16 & 255, b2 >> 8 & 255, b2 & 255];
};
// https://en.wikipedia.org/wiki/Relative_luminance
export const srgbLuminance = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
// https://en.wikipedia.org/wiki/SRGB
export const srgbToLinear = c => c > .04045 ? Math.pow((c + 0.055) / (1 + 0.055), 2.4) : c / 12.92;
// https://en.wikipedia.org/wiki/SRGB
export const linearToSrgb = c => c > .0031308 ? (1 + 0.055) * Math.pow(c, 1 / 2.4) - 0.055 : 12.92 * c;
export const scaleBytes = (color, m) => color.map(c => Math.round(linearToSrgb(srgbToLinear(c / 255) * m) * 255));
export const saturation = ([r, g, b]) => {
	const max = Math.max(r, g, b);
	return max ? (max - Math.min(r, g, b)) / max : 0;
};
