#!/usr/bin/env node
// Draws the City's building art into static/buildings/<kind>-<tier>.svg, one file per building per
// art tier. Tiers start at levels 1, 2, 4 and 6 (artTier in src/lib/game/city.ts); effect-only
// buildings never pass level 1 and get one drawing. Run with `node scripts/draw-buildings.mjs`.
//
// The look: a front elevation with a short oblique depth (side faces recede up and to the right),
// lit from the upper left, painted with per-face gradients and held by a warm umber outline. The
// materials climb the game's metals with the tiers: wood and thatch, then brick and tile, then
// stone and slate, then verdigris copper with brass trim and lit windows. Each drawing is fitted
// to the middle 75% of the tile, standing on a soft shadow.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';

const OUT = new URL('../static/buildings/', import.meta.url);
let DX = 0.62;
let DY = 0.42;
const INK = '#2a1d16';
const LIT = '#ffd36b';
const GLOW = '#ff9b3d';
const DARK = '#3b2a20';
const DOOR = '#6a4127';

/** Each material: highlight, base, shade. */
const MAT = {
	mud: ['#e8b97f', '#c99359', '#8f6235'],
	wood: ['#cf935b', '#a76d3d', '#6f4526'],
	thatch: ['#f3d473', '#d8ae4b', '#9d7b2b'],
	plaster: ['#fff6e0', '#efdfbd', '#c6ad86'],
	stone: ['#e8e2d5', '#c4bcab', '#8e8675'],
	brick: ['#df8a60', '#b9623d', '#7e3f27'],
	tile: ['#f08c60', '#cb5f37', '#8c3c21'],
	slate: ['#86a2c2', '#5c7899', '#3b5272'],
	copper: ['#8fd8c0', '#58a892', '#357867'],
	brass: ['#ffe089', '#ecb544', '#a97a22'],
	iron: ['#9ea5b3', '#6f7686', '#474d5a'],
	glass: ['#f2fbfd', '#bde2ec', '#86b6c6'],
	leaf: ['#9ed36d', '#64a444', '#3c732f'],
	canvas: ['#fffcf4', '#f0e8d6', '#c6bba4'],
	red: ['#f47560', '#cd463a', '#8e2b24'],
	blue: ['#74afee', '#4180c6', '#2a5791'],
	water: ['#ace2f5', '#69b7dc', '#3e88b2'],
	pale: ['#ffffff', '#e2e0db', '#aeaba6'],
	ore: ['#b2aec0', '#7d798e', '#504c60'],
	litglass: ['#fff3c4', '#ffd36b', '#d9a232']
};

const r = (n) => Math.round(n * 100) / 100;
const lerp = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];

function mix(a, b, t) {
	const pa = a.match(/\w\w/g).map((h) => parseInt(h, 16));
	const pb = b.match(/\w\w/g).map((h) => parseInt(h, 16));
	return '#' + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join('');
}

/** A drawing in its own units, with y growing downward and the ground at y = 0. */
class Art {
	constructor() {
		this.els = [];
		this.used = new Set();
		this.box = [Infinity, Infinity, -Infinity, -Infinity];
	}
	ext(x, y) {
		const b = this.box;
		b[0] = Math.min(b[0], x);
		b[1] = Math.min(b[1], y);
		b[2] = Math.max(b[2], x);
		b[3] = Math.max(b[3], y);
	}
	/** A gradient fill: f front, s side, t top, r roof slope, c cylinder, o sphere. Plain colours pass through. */
	paint(mat, face) {
		if (!MAT[mat]) return mat;
		this.used.add(`${mat}-${face}`);
		return `url(#${mat}-${face})`;
	}
	poly(pts, fill, attrs = '') {
		pts.forEach(([x, y]) => this.ext(x, y));
		this.els.push(`<polygon points="${pts.map(([x, y]) => `${r(x)},${r(y)}`).join(' ')}" fill="${fill}"${attrs}/>`);
	}
	path(d, fill, box, attrs = '') {
		box.forEach(([x, y]) => this.ext(x, y));
		this.els.push(`<path d="${d}" fill="${fill}"${attrs}/>`);
	}
	ellipse(cx, cy, rx, ry, fill, attrs = '') {
		this.ext(cx - rx, cy - ry);
		this.ext(cx + rx, cy + ry);
		this.els.push(`<ellipse cx="${r(cx)}" cy="${r(cy)}" rx="${r(rx)}" ry="${r(ry)}" fill="${fill}"${attrs}/>`);
	}
	/** A line; its width is in outline widths, so it looks the same however far the drawing is scaled. */
	line(x1, y1, x2, y2, w = 1, color = INK, attrs = '') {
		this.ext(x1, y1);
		this.ext(x2, y2);
		this.els.push(`<line x1="${r(x1)}" y1="${r(y1)}" x2="${r(x2)}" y2="${r(y2)}" stroke="${color}" stroke-width="SW(${w})"${attrs}/>`);
	}
	curve(d, box, w = 1, color = INK, attrs = '') {
		box.forEach(([x, y]) => this.ext(x, y));
		this.els.push(`<path d="${d}" fill="none" stroke="${color}" stroke-width="SW(${w})"${attrs}/>`);
	}
}

function defs(used) {
	return [...used]
		.map((key) => {
			const [mat, face] = key.split('-');
			const [hi, base, lo] = MAT[mat];
			if (face === 'o') {
				return `<radialGradient id="${key}" cx="0.36" cy="0.32" r="0.75"><stop offset="0" stop-color="${hi}"/><stop offset="0.55" stop-color="${base}"/><stop offset="1" stop-color="${lo}"/></radialGradient>`;
			}
			const stops = {
				f: [[0, hi], [0.55, base], [1, mix(base, lo, 0.25)]],
				s: [[0, mix(base, lo, 0.45)], [1, lo]],
				t: [[0, mix(hi, '#ffffff', 0.2)], [1, hi]],
				r: [[0, hi], [0.6, base], [1, lo]],
				c: [[0, mix(base, lo, 0.3)], [0.26, hi], [0.6, base], [1, lo]]
			}[face];
			const dir = face === 'c' ? 'x2="1" y2="0"' : 'x2="0" y2="1"';
			return `<linearGradient id="${key}" ${dir}>${stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('')}</linearGradient>`;
		})
		.join('');
}

const GLOWS = `<radialGradient id="glow"><stop offset="0" stop-color="${LIT}" stop-opacity="0.95"/><stop offset="1" stop-color="${LIT}" stop-opacity="0"/></radialGradient><radialGradient id="forge"><stop offset="0" stop-color="${GLOW}" stop-opacity="0.9"/><stop offset="1" stop-color="${GLOW}" stop-opacity="0"/></radialGradient><linearGradient id="shade" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0.18"/><stop offset="0.35" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.32"/></linearGradient>`;

/** Fits the drawing into the middle 75% of a 100-unit tile, standing on its shadow. */
function finish(a) {
	const [x0, y0, x1, y1] = a.box;
	const w = x1 - x0;
	const h = y1 - y0;
	const s = Math.min((w > h * 1.5 ? 84 : 75) / w, 75 / h);
	const tx = 50 - (s * (x0 + x1)) / 2;
	const ty = 87.5 - s * y1;
	const W = 1.25 / s;
	const body = a.els.join('').replace(/SW\(([\d.]+)\)/g, (_, f) => r(W * Number(f)));
	const rx = w * s * 0.46;
	return (
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">` +
		`<defs>${defs(a.used)}${GLOWS}</defs>` +
		`<ellipse cx="50" cy="87.5" rx="${r(rx)}" ry="${r(Math.max(2.4, rx * 0.11))}" fill="#1c140f" opacity="0.26"/>` +
		`<g transform="translate(${r(tx)} ${r(ty)}) scale(${Math.round(s * 1e4) / 1e4})" stroke="${INK}" stroke-width="${r(W)}" stroke-linejoin="round" stroke-linecap="round">${body}</g></svg>\n`
	);
}

/* ---------------------------------------------------------------- parts */

const NO = ' stroke="none"';

/** Draws with a steeper, more top-down depth: for grounds whose plan is the point (the maze, the graph). */
function looking(dx, dy, fn) {
	const was = [DX, DY];
	[DX, DY] = [dx, dy];
	fn();
	[DX, DY] = was;
}

/** A box: front face x..x+w standing on b, h tall, d deep. */
function block(a, x, b, w, h, d, mat, o = {}) {
	const ex = d * DX;
	const ey = d * DY;
	const top = b - h;
	const op = o.opacity ? ` fill-opacity="${o.opacity}"` : '';
	if (o.side !== false) a.poly([[x + w, b], [x + w, top], [x + w + ex, top - ey], [x + w + ex, b - ey]], a.paint(o.sideMat ?? mat, 's'), op);
	if (o.top !== false) a.poly([[x, top], [x + ex, top - ey], [x + w + ex, top - ey], [x + w, top]], a.paint(o.topMat ?? mat, 't'), op);
	a.poly([[x, b], [x, top], [x + w, top], [x + w, b]], a.paint(mat, 'f'), op);
	if (!o.opacity && w > 4 && h > 4) a.line(x + 0.9, top + 0.9, x + 0.9, b - 0.9, 0.5, MAT[mat]?.[0] ?? '#fff', ' opacity="0.7"');
	return { x, b, w, h, d, top, right: x + w, ex, ey };
}

/** The point at (u along the front, v deep) on a plane whose front-left corner is (x, b). */
const on = (x, b) => (u, v) => [x + u + v * DX, b - v * DY];

/** Roof courses across a slope, between its eave and ridge edges. */
function courses(a, eL, eR, rR, rL, mat, n = 3) {
	for (let i = 1; i <= n; i++) {
		const t = i / (n + 1);
		const p = lerp(eL, rL, t);
		const q = lerp(eR, rR, t);
		a.line(p[0], p[1], q[0], q[1], 0.45, MAT[mat][2], ' opacity="0.75"');
	}
}

/** A roof whose ridge runs along the front, over walls whose top is at b. */
function gable(a, x, b, w, d, rh, roof, wall, o = 2) {
	const ex = d * DX;
	const ey = d * DY;
	const apex = [x + w + ex / 2, b - ey / 2 - rh];
	a.poly([[x + w, b], [x + w + ex, b - ey], apex], a.paint(wall, 's'));
	const rL = [x + ex / 2 - o, apex[1]];
	const rR = [apex[0] + o * 0.6, apex[1]];
	a.poly([rR, [x + w + ex + o * 0.6, b - ey + o * 0.5], [x + w + ex, b - ey], apex], a.paint(roof, 's'));
	const eL = [x - o, b + o * 0.5];
	const eR = [x + w + o * 0.6, b + o * 0.5];
	a.poly([eL, eR, rR, rL], a.paint(roof, 'r'));
	courses(a, eL, eR, rR, rL, roof);
	return { ridge: [x + ex / 2, apex[1]], ridgeEnd: apex, mid: [x + w / 2 + ex / 2, apex[1]] };
}

/** A roof whose gable end faces the viewer, over walls whose top is at b. */
function frontGable(a, x, b, w, d, rh, roof, wall, o = 2) {
	const ex = d * DX;
	const ey = d * DY;
	const ap = [x + w / 2, b - rh];
	const apB = [ap[0] + ex, ap[1] - ey];
	a.poly([[x - o, b + o * 0.5], ap, apB, [x - o + ex, b + o * 0.5 - ey]], a.paint(roof, 't'));
	a.poly([ap, [x + w + o, b + o * 0.5], [x + w + o + ex, b + o * 0.5 - ey], apB], a.paint(roof, 'r'));
	courses(a, [x + w + o, b + o * 0.5], [x + w + o + ex, b + o * 0.5 - ey], apB, ap, roof, 2);
	a.poly([[x, b], ap, [x + w, b]], a.paint(wall, 'f'));
	a.poly([[x - o, b + o * 0.5], [ap[0], ap[1] - o], ap, [x, b]], a.paint(roof, 'f'));
	a.poly([[ap[0], ap[1] - o], [x + w + o, b + o * 0.5], [x + w, b], ap], a.paint(roof, 'f'));
	return { apex: [ap[0], ap[1] - o], mid: [ap[0] + ex / 2, ap[1] - ey / 2 - o] };
}

/** A four-sided pyramid roof over walls whose top is at b. */
function pyramid(a, x, b, w, d, rh, roof, o = 1.5) {
	const ex = d * DX;
	const ey = d * DY;
	const ap = [x + w / 2 + ex / 2, b - ey / 2 - rh];
	a.poly([[x + w + o, b + o * 0.5], [x + w + o + ex, b + o * 0.5 - ey], ap], a.paint(roof, 's'));
	a.poly([[x - o, b + o * 0.5], [x + w + o, b + o * 0.5], ap], a.paint(roof, 'r'));
	return ap;
}

function cyl(a, cx, b, rx, h, mat, o = {}) {
	const ry = rx * 0.3;
	a.path(`M${r(cx - rx)} ${r(b - h)}L${r(cx - rx)} ${r(b)}A${r(rx)} ${r(ry)} 0 0 0 ${r(cx + rx)} ${r(b)}L${r(cx + rx)} ${r(b - h)}Z`, a.paint(mat, 'c'), [[cx - rx, b - h], [cx + rx, b + ry]], o.opacity ? ` fill-opacity="${o.opacity}"` : '');
	if (o.top !== false) a.ellipse(cx, b - h, rx, ry, a.paint(o.topMat ?? mat, 't'), o.opacity ? ` fill-opacity="${o.opacity}"` : '');
}

/** A tapering round tower, wider at the foot. */
function taper(a, cx, b, r0, r1, h, mat) {
	a.path(`M${r(cx - r1)} ${r(b - h)}L${r(cx - r0)} ${r(b)}A${r(r0)} ${r(r0 * 0.3)} 0 0 0 ${r(cx + r0)} ${r(b)}L${r(cx + r1)} ${r(b - h)}Z`, a.paint(mat, 'c'), [[cx - r0, b - h], [cx + r0, b + r0 * 0.3]]);
}

/** A band around a tapering tower, from height t0 to t1 (fractions of h). */
function band(a, cx, b, r0, r1, h, t0, t1, mat) {
	const rad = (t) => r0 + (r1 - r0) * t;
	const y = (t) => b - h * t;
	const p0 = rad(t0);
	const p1 = rad(t1);
	a.path(`M${r(cx - p0)} ${r(y(t0))}A${r(p0)} ${r(p0 * 0.3)} 0 0 0 ${r(cx + p0)} ${r(y(t0))}L${r(cx + p1)} ${r(y(t1))}A${r(p1)} ${r(p1 * 0.3)} 0 0 1 ${r(cx - p1)} ${r(y(t1))}Z`, a.paint(mat, 'c'), [[cx - p0, y(t1)], [cx + p0, y(t0) + p0 * 0.3]]);
}

function cone(a, cx, b, rx, h, mat) {
	a.path(`M${r(cx - rx)} ${r(b)}A${r(rx)} ${r(rx * 0.3)} 0 0 0 ${r(cx + rx)} ${r(b)}L${r(cx)} ${r(b - h)}Z`, a.paint(mat, 'c'), [[cx - rx, b - h], [cx + rx, b + rx * 0.3]]);
}

function dome(a, cx, b, rx, ry, mat, o = {}) {
	a.path(`M${r(cx - rx)} ${r(b)}A${r(rx)} ${r(ry)} 0 0 1 ${r(cx + rx)} ${r(b)}A${r(rx)} ${r(rx * 0.3)} 0 0 1 ${r(cx - rx)} ${r(b)}Z`, a.paint(mat, 'c'), [[cx - rx, b - ry], [cx + rx, b + rx * 0.3]], o.opacity ? ` fill-opacity="${o.opacity}"` : '');
	if (o.ribs) {
		for (const t of [-0.55, 0, 0.55]) {
			const x0 = cx + t * rx;
			a.curve(`M${r(x0)} ${r(b + rx * 0.3 * Math.sqrt(1 - t * t))}Q${r(cx + t * rx * 1.05)} ${r(b - ry * 0.95)} ${r(cx)} ${r(b - ry)}`, [], 0.7, o.ribs);
		}
	}
}

function sphere(a, cx, cy, rad, mat) {
	a.ellipse(cx, cy, rad, rad, a.paint(mat, 'o'));
}

function win(a, x, y, w, h, lit, o = {}) {
	const fill = lit ? a.paint('litglass', 'f') : a.paint('glass', 'f');
	if (o.arch) {
		a.path(`M${r(x)} ${r(y + h)}L${r(x)} ${r(y + w / 2)}A${r(w / 2)} ${r(w / 2)} 0 0 1 ${r(x + w)} ${r(y + w / 2)}L${r(x + w)} ${r(y + h)}Z`, fill, [[x, y], [x + w, y + h]]);
	} else if (o.pointed) {
		a.path(`M${r(x)} ${r(y + h)}L${r(x)} ${r(y + w * 0.55)}Q${r(x)} ${r(y)} ${r(x + w / 2)} ${r(y - w * 0.3)}Q${r(x + w)} ${r(y)} ${r(x + w)} ${r(y + w * 0.55)}L${r(x + w)} ${r(y + h)}Z`, fill, [[x, y - w * 0.3], [x + w, y + h]]);
	} else {
		a.poly([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], fill);
	}
	if (o.cross !== false) {
		a.line(x + w / 2, y + (o.arch || o.pointed ? 0 : 0.3), x + w / 2, y + h - 0.3, 0.55);
		if (h > w * 0.9) a.line(x + 0.3, y + h * (o.arch || o.pointed ? 0.58 : 0.5), x + w - 0.3, y + h * (o.arch || o.pointed ? 0.58 : 0.5), 0.55);
	}
	if (lit && o.glow !== false) a.ellipse(x + w / 2, y + h / 2, w * 1.3, h * 1.1, 'url(#glow)', ` stroke="none" opacity="0.45"`);
}

function winRow(a, x0, y, w, h, n, gap, lit, o) {
	for (let i = 0; i < n; i++) win(a, x0 + i * (w + gap), y, w, h, lit, o);
}

function door(a, x, b, w, h, fill = DOOR) {
	a.path(`M${r(x)} ${r(b)}L${r(x)} ${r(b - h + w / 2)}A${r(w / 2)} ${r(w / 2)} 0 0 1 ${r(x + w)} ${r(b - h + w / 2)}L${r(x + w)} ${r(b)}Z`, fill, [[x, b - h], [x + w, b]]);
	if (fill === DOOR) a.line(x + w / 2, b - h + 0.8, x + w / 2, b - 0.2, 0.45, '#3d2414');
}

function opening(a, x, b, w, h, glow) {
	door(a, x, b, w, h, glow ? GLOW : DARK);
	if (glow) a.ellipse(x + w / 2, b - h * 0.45, w * 1.2, h * 0.75, 'url(#forge)', ` stroke="none" opacity="0.7"`);
}

function finial(a, x, y, rad = 1.4, mat = 'brass') {
	a.line(x, y, x, y - rad * 2.2, 0.8);
	sphere(a, x, y - rad * 2.6, rad, mat);
}

function smoke(a, x, y, s = 1) {
	for (const [dx, dy, rad] of [[0, 0, 1.8], [1.6, -3.4, 2.4], [0.4, -7.6, 3]]) a.ellipse(x + dx * s, y + dy * s, rad * s, rad * s * 0.9, '#efebe4', ` stroke="none" opacity="0.85"`);
}

function chimney(a, x, b, w, h, mat = 'brick') {
	block(a, x, b, w, h, w, mat);
	block(a, x - 0.6, b - h + 1.4, w + 1.2, 1.4, w + 0.6, mat);
	return [x + w / 2 + (w * DX) / 2, b - h - (w * DY) / 2];
}

function planks(a, x, b, w, h, mat = 'wood', step = 2.8) {
	for (let y = b - step; y > b - h + 0.8; y -= step) a.line(x + 0.6, y, x + w - 0.6, y, 0.4, MAT[mat][2], ' opacity="0.8"');
}

function bricks(a, x, b, w, h, mat = 'brick') {
	let row = 0;
	for (let y = b - 2.6; y > b - h + 1; y -= 2.6, row++) {
		a.line(x + 0.6, y, x + w - 0.6, y, 0.35, MAT[mat][2], ' opacity="0.55"');
		for (let xx = x + (row % 2 ? 2 : 4); xx < x + w - 1; xx += 4) a.line(xx, y, xx, y + 2.6, 0.3, MAT[mat][2], ' opacity="0.45"');
	}
}

function column(a, x, b, w, h, mat = 'stone') {
	a.poly([[x - 0.6, b], [x - 0.6, b - 1.2], [x + w + 0.6, b - 1.2], [x + w + 0.6, b]], a.paint(mat, 'f'));
	a.poly([[x, b - 1.2], [x, b - h + 1.2], [x + w, b - h + 1.2], [x + w, b - 1.2]], a.paint(mat, 'c'));
	a.poly([[x - 0.8, b - h + 1.2], [x - 0.8, b - h], [x + w + 0.8, b - h], [x + w + 0.8, b - h + 1.2]], a.paint(mat, 'f'));
}

function crenels(a, x, b, w, n, mh, d, mat) {
	const mw = w / (2 * n - 1);
	for (let i = 0; i < 2 * n - 1; i += 2) block(a, x + i * mw, b, mw, mh, d, mat);
}

function gear(a, cx, cy, R, n, mat) {
	const pts = [];
	for (let k = 0; k < n; k++) {
		const t = (2 * Math.PI * k) / n;
		const d2 = (Math.PI / n) * 0.62;
		const d1 = (Math.PI / n) * 0.36;
		for (const [ang, rad] of [[t - d2, R * 0.8], [t - d1, R], [t + d1, R], [t + d2, R * 0.8]]) pts.push([cx + rad * Math.cos(ang), cy + rad * Math.sin(ang)]);
	}
	a.poly(pts, a.paint(mat, 'o'));
	a.ellipse(cx, cy, R * 0.52, R * 0.52, 'none', ` stroke="${MAT[mat][2]}" stroke-width="SW(0.6)"`);
	a.ellipse(cx, cy, R * 0.2, R * 0.2, DARK);
}

function clock(a, cx, cy, R, rim = 'stone') {
	a.ellipse(cx, cy, R, R, a.paint(rim, 'o'));
	a.ellipse(cx, cy, R * 0.78, R * 0.78, a.paint('canvas', 'o'));
	for (let k = 0; k < 4; k++) {
		const t = (k * Math.PI) / 2;
		a.line(cx + Math.cos(t) * R * 0.6, cy + Math.sin(t) * R * 0.6, cx + Math.cos(t) * R * 0.74, cy + Math.sin(t) * R * 0.74, 0.5);
	}
	a.line(cx, cy, cx, cy - R * 0.58, 0.8);
	a.line(cx, cy, cx + R * 0.4, cy + R * 0.1, 0.8);
}

/** A striped awning hung from y, falling `drop`, with scalloped hem. */
function awning(a, x, y, w, drop, n, mA, mB) {
	const bx = (t) => x - 1.6 + t * (w + 3.2);
	for (let i = 0; i < n; i++) {
		const m = i % 2 ? mB : mA;
		const x0 = x + (i * w) / n;
		const x1 = x + ((i + 1) * w) / n;
		const b0 = bx(i / n);
		const b1 = bx((i + 1) / n);
		a.poly([[x0, y], [x1, y], [b1, y + drop], [b0, y + drop]], a.paint(m, 'f'));
		a.path(`M${r(b0)} ${r(y + drop)}A${r((b1 - b0) / 2)} 1.5 0 0 0 ${r(b1)} ${r(y + drop)}Z`, a.paint(m, 'f'), [[b0, y + drop], [b1, y + drop + 1.5]]);
	}
}

/** Four windmill sails turning about (cx, cy). */
function sails(a, cx, cy, L, wd, ang, mat) {
	for (let k = 0; k < 4; k++) {
		const t = ang + (k * Math.PI) / 2;
		const dx = Math.cos(t);
		const dy = Math.sin(t);
		const px = -dy;
		const py = dx;
		const P = (s, o) => [cx + dx * s + px * o, cy + dy * s + py * o];
		if (mat) a.poly([P(3, 0.4), P(L, 0.4), P(L, wd), P(3, wd)], a.paint(mat, 'f'));
		else a.poly([P(3, 0.4), P(L, 0.4), P(L, wd), P(3, wd)], 'none');
		for (let s = 3 + 2.6; s < L; s += 2.6) {
			const p = P(s, 0.4);
			const q = P(s, wd);
			a.line(p[0], p[1], q[0], q[1], 0.4, MAT.wood[2]);
		}
		const m0 = P(3, wd / 2);
		const m1 = P(L, wd / 2);
		a.line(m0[0], m0[1], m1[0], m1[1], 0.4, MAT.wood[2]);
		const e = P(L + 0.8, 0);
		a.line(cx, cy, e[0], e[1], 1.6, INK);
		a.line(cx, cy, e[0], e[1], 0.7, MAT.wood[0]);
	}
}

/** Chain links along a sagging curve from p to q. */
function chain(a, p, q, sag, n, mat) {
	const c = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2 + sag];
	const B = (t) => [(1 - t) ** 2 * p[0] + 2 * (1 - t) * t * c[0] + t * t * q[0], (1 - t) ** 2 * p[1] + 2 * (1 - t) * t * c[1] + t * t * q[1]];
	for (let i = 0; i <= n; i++) {
		const t = i / n;
		const [x, y] = B(t);
		const [x2, y2] = B(Math.min(1, t + 0.01));
		const [x1, y1] = B(Math.max(0, t - 0.01));
		const deg = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
		if (i % 2 === 0) {
			a.ellipse(x, y, 1.7, 1.05, 'none', ` transform="rotate(${r(deg)} ${r(x)} ${r(y)})" stroke-width="SW(2.4)"`);
			a.ellipse(x, y, 1.7, 1.05, 'none', ` transform="rotate(${r(deg)} ${r(x)} ${r(y)})" stroke="${MAT[mat][0]}" stroke-width="SW(1)"`);
		} else {
			const rad = (deg * Math.PI) / 180;
			a.line(x - Math.cos(rad) * 1.6, y - Math.sin(rad) * 1.6, x + Math.cos(rad) * 1.6, y + Math.sin(rad) * 1.6, 2.4);
			a.line(x - Math.cos(rad) * 1.6, y - Math.sin(rad) * 1.6, x + Math.cos(rad) * 1.6, y + Math.sin(rad) * 1.6, 1, MAT[mat][0]);
		}
	}
}

/** A heap of ore stacked like a binary heap: `rows` stones at the bottom, one at the top. */
function heap(a, cx, b, rows, rad, mat, topMat = mat, topRows = 0) {
	for (let i = 0; i < rows; i++) {
		const count = rows - i;
		const y = b - rad - i * rad * 1.6;
		for (let j = 0; j < count; j++) sphere(a, cx - (count - 1) * rad + j * rad * 2, y, rad, i >= rows - topRows ? topMat : mat);
	}
}

/** A tapering limb from p to q. */
function limb(a, p, q, w0, w1, mat = 'wood') {
	const dx = q[0] - p[0];
	const dy = q[1] - p[1];
	const L = Math.hypot(dx, dy);
	const nx = -dy / L;
	const ny = dx / L;
	a.poly([[p[0] + nx * w0, p[1] + ny * w0], [q[0] + nx * w1, q[1] + ny * w1], [q[0] - nx * w1, q[1] - ny * w1], [p[0] - nx * w0, p[1] - ny * w0]], a.paint(mat, 'c'));
}

/** A tree that branches in twos, like the trees it stands for. */
function tree(a, x, b, s = 1, mat = 'leaf') {
	const P = (dx, dy) => [x + dx * s, b + dy * s];
	limb(a, P(0, 0), P(0, -10), 2.2 * s, 1.6 * s);
	limb(a, P(0, -10), P(-6, -16), 1.3 * s, 0.9 * s);
	limb(a, P(0, -10), P(6, -16), 1.3 * s, 0.9 * s);
	for (const [cx, cy, rad] of [[0, -23, 6.5], [-7.5, -18.5, 5.6], [7.5, -18.5, 5.6], [-3.6, -16.5, 5.4], [3.8, -16, 5.4]]) a.ellipse(x + cx * s, b + cy * s, rad * s, rad * s * 0.94, a.paint(mat, 'o'));
}

function mound(a, cx, b, w, h, mat = 'stone') {
	const P = (fx, fy) => [cx + fx * w, b - fy * h];
	a.poly([P(-0.5, 0), P(-0.43, 0.42), P(-0.28, 0.8), P(-0.08, 1), P(0.14, 0.93), P(0.34, 0.62), P(0.45, 0.3), P(0.5, 0)], a.paint(mat, 'c'));
	a.line(...P(-0.26, 0.5), ...P(-0.14, 0.62), 0.5, MAT[mat][2]);
	a.line(...P(0.22, 0.42), ...P(0.3, 0.3), 0.5, MAT[mat][2]);
}

/** A tent: a striped drum under a striped cone. */
function tent(a, cx, b, rx, wh, ph, mA, mB, o = {}) {
	const n = o.stripes ?? 8;
	const ry = rx * 0.3;
	const xs = (i, R) => cx - R * Math.cos((Math.PI * i) / n);
	const yb = (xx, R, base) => base + R * 0.3 * Math.sqrt(Math.max(0, 1 - ((xx - cx) / R) ** 2));
	for (let i = 0; i < n; i++) {
		const xa = xs(i, rx);
		const xb = xs(i + 1, rx);
		const xm = (xa + xb) / 2;
		a.poly([[xa, b - wh + ry * 0], [xb, b - wh], [xb, yb(xb, rx, b)], [xm, yb(xm, rx, b)], [xa, yb(xa, rx, b)]], a.paint(i % 2 ? mB : mA, 'f'), NO);
	}
	a.path(`M${r(cx - rx)} ${r(b - wh)}L${r(cx - rx)} ${r(b)}A${r(rx)} ${r(ry)} 0 0 0 ${r(cx + rx)} ${r(b)}L${r(cx + rx)} ${r(b - wh)}Z`, 'url(#shade)', [[cx - rx, b - wh], [cx + rx, b + ry]]);
	door(a, cx - rx * 0.16, b + ry * 0.95, rx * 0.32, wh * 0.85, DARK);
	const R = rx * 1.14;
	const base = b - wh;
	const apex = [cx, base - ph];
	for (let i = 0; i < n; i++) {
		const xa = xs(i, R);
		const xb = xs(i + 1, R);
		const xm = (xa + xb) / 2;
		a.poly([apex, [xb, yb(xb, R, base)], [xm, yb(xm, R, base)], [xa, yb(xa, R, base)]], a.paint(i % 2 ? mA : mB, 'f'), NO);
	}
	a.path(`M${r(cx - R)} ${r(base)}A${r(R)} ${r(R * 0.3)} 0 0 0 ${r(cx + R)} ${r(base)}L${r(cx)} ${r(base - ph)}Z`, 'url(#shade)', [[cx - R, base - ph], [cx + R, base + R * 0.3]]);
	if (o.finial) finial(a, cx, base - ph, 1.2, o.finial);
	return apex;
}

/** A pennant on a pole. */
function flag(a, x, y, h, mat) {
	a.line(x, y, x, y - h, 0.8);
	a.poly([[x, y - h], [x + h * 0.55, y - h + h * 0.16], [x, y - h + h * 0.32]], a.paint(mat, 'f'));
}

/** A trie, drawn in a round window: root, three children, three grandchildren. */
function trie(a, cx, cy, R, lit) {
	a.ellipse(cx, cy, R, R, a.paint('stone', 'o'));
	a.ellipse(cx, cy, R * 0.8, R * 0.8, lit ? a.paint('litglass', 'o') : a.paint('glass', 'o'));
	const root = [cx, cy - R * 0.5];
	const kids = [[cx - R * 0.45, cy - R * 0.02], [cx, cy - R * 0.02], [cx + R * 0.45, cy - R * 0.02]];
	const grand = [[kids[0], [cx - R * 0.6, cy + R * 0.45]], [kids[0], [cx - R * 0.25, cy + R * 0.45]], [kids[2], [cx + R * 0.45, cy + R * 0.45]]];
	for (const k of kids) a.line(root[0], root[1], k[0], k[1], 0.6);
	for (const [p, q] of grand) a.line(p[0], p[1], q[0], q[1], 0.6);
	for (const [x, y] of [root, ...kids, ...grand.map(([, q]) => q)]) a.ellipse(x, y, R * 0.11, R * 0.11, INK, NO);
}

/** A bell-tower stage: open arch, bell, pyramid cap. */
function belfry(a, x, b, w, h, d, wall, roof, lit) {
	block(a, x, b, w, h, d, wall, { top: false });
	opening(a, x + w * 0.22, b - 1, w * 0.56, h - 2, false);
	a.path(`M${r(x + w * 0.32)} ${r(b - 2.2)}Q${r(x + w * 0.32)} ${r(b - h + 2.4)} ${r(x + w / 2)} ${r(b - h + 2.4)}Q${r(x + w * 0.68)} ${r(b - h + 2.4)} ${r(x + w * 0.68)} ${r(b - 2.2)}Z`, a.paint(lit ? 'brass' : 'iron', 'c'), []);
	return pyramid(a, x, b - h, w, d, w * 0.85, roof, 1.2);
}

/* ---------------------------------------------------------------- buildings */
// Each takes the drawing and the art tier as 0..3 (levels 1, 2–3, 4–5, 6+).

const ROOF = ['thatch', 'tile', 'slate', 'copper'];

const draw = {
	hut(a, k) {
		const lit = k === 3;
		if (k === 0) {
			cyl(a, 0, 0, 13, 11, 'mud');
			door(a, -3.2, 3.6, 6.4, 8.5);
			cone(a, 0, -9.5, 17.5, 19, 'thatch');
			for (const dx of [-10, -4, 3, 9]) a.line(0, -26, dx, -5.5, 0.45, MAT.thatch[2]);
			return;
		}
		if (k === 1) {
			block(a, -15, 0, 26, 13, 13, 'wood', { top: false });
			planks(a, -15, 0, 26, 13);
			door(a, -11, 0, 6, 9.5);
			win(a, 0, -10, 7, 5.5, false);
			gable(a, -15, -13, 26, 13, 10, 'tile', 'wood');
			return;
		}
		if (k === 2) {
			chimney(a, 4.5, -30, 4.5, 16);
			smoke(a, 8.5, -49);
			block(a, -18, 0, 30, 26, 15, 'plaster', { top: false });
			block(a, -18, 0, 30, 5, 15, 'stone', { top: false });
			for (const xx of [-18, -3, 12]) a.line(xx + (xx === 12 ? -0.6 : 0.6), -13, xx + (xx === 12 ? -0.6 : 0.6), -26, 1.1, MAT.wood[2]);
			a.line(-17.4, -13.5, 11.4, -13.5, 1.1, MAT.wood[2]);
			door(a, -14, -1, 6, 10);
			win(a, -3, -12, 6, 6, false);
			win(a, 4.5, -12, 6, 6, false);
			winRow(a, -14.5, -23.5, 6, 6, 3, 3.5, false);
			gable(a, -18, -26, 30, 15, 12, 'slate', 'plaster');
			return;
		}
		chimney(a, -6, -33, 4.5, 15);
		chimney(a, 12, -33, 4.5, 15);
		smoke(a, 16, -51);
		block(a, -34, 0, 16, 18, 13, 'plaster', { top: false });
		winRow(a, -31, -14, 4.5, 6, 2, 2.5, lit);
		gable(a, -34, -18, 16, 13, 8, 'copper', 'plaster');
		block(a, -18, 0, 36, 30, 16, 'plaster', { top: false });
		block(a, -18, 0, 36, 5, 16, 'stone', { top: false });
		winRow(a, -15.5, -26, 5, 7, 5, 2, lit);
		winRow(a, -15.5, -15, 5, 7, 2, 2, lit);
		winRow(a, 5.5, -15, 5, 7, 2, 2, lit);
		door(a, -2.8, -1, 5.6, 11, DOOR);
		const g = gable(a, -18, -30, 36, 16, 14, 'copper', 'plaster');
		finial(a, g.mid[0], g.mid[1], 1.5);
		block(a, 18, 0, 16, 18, 13, 'plaster', { top: false });
		winRow(a, 20.5, -14, 4.5, 6, 2, 2.5, lit);
		gable(a, 18, -18, 16, 13, 8, 'copper', 'plaster');
	},

	'hash-market'(a, k) {
		const lit = k === 3;
		const sign = (cx, cy, s = 1, mat = 'wood') => {
			a.poly([[cx - 3.4 * s, cy - 3 * s], [cx + 3.4 * s, cy - 3 * s], [cx + 3.4 * s, cy + 3 * s], [cx - 3.4 * s, cy + 3 * s]], a.paint(mat, 'f'));
			for (const o of [-1, 1]) {
				a.line(cx + o * 1 * s + 0.5 * s, cy - 2.1 * s, cx + o * 1 * s - 0.5 * s, cy + 2.1 * s, 0.8);
				a.line(cx - 2.1 * s, cy + o * 0.9 * s, cx + 2.1 * s, cy + o * 0.9 * s, 0.8);
			}
		};
		if (k === 0) {
			a.line(-13, -8, -13, -22, 1.6, MAT.wood[2]);
			a.line(13, -8, 13, -22, 1.6, MAT.wood[2]);
			block(a, -15, 0, 30, 9, 10, 'wood');
			planks(a, -15, 0, 30, 9);
			for (const [x, m] of [[-9, 'red'], [-5.5, 'leaf'], [-2, 'brass'], [5, 'red'], [8.5, 'leaf']]) sphere(a, x, -10.6, 1.8, m);
			awning(a, -15, -24, 30, 6, 6, 'red', 'canvas');
			sign(0, -28, 0.9);
			block(a, 16, 0, 6, 5, 5, 'wood');
			return;
		}
		if (k === 1) {
			block(a, -16, 0, 32, 20, 14, 'plaster', { top: false });
			block(a, -16, 0, 32, 3, 14, 'wood', { top: false });
			win(a, -13, -13, 14, 9, false);
			door(a, 5, -1, 7, 14);
			gable(a, -16, -20, 32, 14, 10, 'tile', 'plaster');
			awning(a, -14.5, -15.5, 17, 4.5, 5, 'red', 'canvas');
			sign(8.5, -24, 0.85);
			return;
		}
		const roof = k === 2 ? 'slate' : 'copper';
		block(a, -26, 0, 52, 22, 16, 'stone', { top: false });
		for (const x of [-21, -7, 7]) {
			opening(a, x, 0, 10, 15, lit);
			if (!lit) for (const [cx, m] of [[x + 3, 'brass'], [x + 7, 'red']]) sphere(a, cx, -2, 1.6, m);
		}
		for (const x of [-22.2, -8.2, 5.8]) awning(a, x, -17, 12.4, 3.5, 4, 'red', 'canvas');
		if (k === 3) win(a, 18.5, -16, 5, 9, lit, { arch: true });
		else win(a, 18.5, -16, 5, 9, false, { arch: true });
		const g = gable(a, -26, -22, 52, 16, 12, roof, 'stone');
		if (k === 2) {
			sign(g.mid[0] - 5, -26.5, 1.1, 'stone');
			return;
		}
		const cx = g.mid[0];
		cyl(a, cx, g.mid[1] + 6, 9, 7, 'stone');
		winRow(a, cx - 6.5, g.mid[1] + 0.5, 3, 4.5, 3, 2, true, { cross: false, glow: false });
		dome(a, cx, g.mid[1] - 1, 10, 11, 'copper', { ribs: MAT.copper[2] });
		finial(a, cx, g.mid[1] - 12, 1.6);
		sign(-19, -27, 1, 'brass');
	},

	'pointer-bridge'(a, k) {
		const lit = k === 3;
		// The two pointers: a post at each bank, each pointing in toward the other.
		const pointers = (x0, deck, mat, lamp) => {
			for (const [x, dir] of [[x0 + 0.6, 1], [-x0 - 4.6, -1]]) {
				block(a, x, deck, 4, 16, 3, mat, { top: true });
				const y = deck - 11;
				const tip = x + 2 + dir * 9;
				a.poly([[x + 2, y - 1.8], [tip - dir * 2.4, y - 1.8], [tip, y], [tip - dir * 2.4, y + 1.8], [x + 2, y + 1.8]], a.paint(mat === 'wood' ? 'canvas' : 'brass', 'f'));
				if (lamp) {
					const lx = x + 2 + 1.5 * DX;
					const ly = deck - 16 - 1.5 * DY;
					a.line(lx, ly, lx, ly - 3, 0.9);
					a.ellipse(lx, ly - 4.6, 1.7, 2, lit ? LIT : a.paint('glass', 'o'));
					if (lit) a.ellipse(lx, ly - 4.6, 4.5, 4.5, 'url(#glow)', NO);
				}
			}
		};
		a.poly([[-40, -1], [40, -1], [40, 2.2], [-40, 2.2]], a.paint('water', 'f'), NO);
		for (const x of [-30, -6, 18]) a.line(x, 0.6, x + 8, 0.6, 0.6, MAT.water[0]);
		if (k === 0) {
			for (const x of [-26, -10, 6, 22]) block(a, x, 1.5, 2.2, 11, 2.2, 'wood');
			block(a, -34, -9, 68, 2.4, 10, 'wood');
			for (let x = -32; x < 34; x += 4) a.line(x, -9, x, -11.4, 0.4, MAT.wood[2]);
			for (const x of [-17, 0, 17]) a.line(x, -11.4, x, -17, 1.2, MAT.wood[2]);
			a.line(-31, -16, 31, -16, 1.2, MAT.wood[2]);
			pointers(-34, -9, 'wood');
			return;
		}
		const n = k === 1 ? 1 : k === 2 ? 2 : 3;
		const x0 = -34;
		const w = 68;
		const h = 17;
		const d = 10;
		const ex = d * DX;
		const ey = d * DY;
		a.poly([[x0 + w, 1], [x0 + w, -h], [x0 + w + ex, -h - ey], [x0 + w + ex, 1 - ey]], a.paint('stone', 's'));
		a.poly([[x0, -h], [x0 + ex, -h - ey], [x0 + w + ex, -h - ey], [x0 + w, -h]], a.paint('stone', 't'));
		const span = (w - 8) / n;
		let dd = `M${x0} 1L${x0} ${-h}L${x0 + w} ${-h}L${x0 + w} 1`;
		for (let i = n - 1; i >= 0; i--) {
			const ax = x0 + 4 + i * span + 2;
			const bx = ax + span - 4;
			dd += `L${r(bx)} 1L${r(bx)} ${r(-h * 0.35)}A${r((bx - ax) / 2)} ${r(h * 0.5)} 0 0 0 ${r(ax)} ${r(-h * 0.35)}L${r(ax)} 1`;
		}
		a.path(dd + 'Z', a.paint('stone', 'f'), [[x0, -h], [x0 + w, 1]]);
		for (let x = x0 + 3; x < x0 + w; x += 5) a.line(x, -h + 0.8, x, -h + 3, 0.4, MAT.stone[2]);
		a.line(x0 + 0.6, -h + 3, x0 + w - 0.6, -h + 3, 0.5, MAT.stone[2]);
		block(a, x0, -h, w, 2.4, 2, k === 3 ? 'stone' : 'stone');
		if (k < 3) pointers(x0, -h - 2.4, 'stone', k === 2);
		if (k === 3) {
			for (const x of [x0 - 3, x0 + w - 8]) {
				block(a, x, 1, 11, h + 15, 9, 'stone', { top: false });
				win(a, x + 3.5, -h - 9, 4, 6, true, { arch: true });
				const pointerTip = x < 0 ? x + 15 : x - 4;
				const dir = x < 0 ? 1 : -1;
				a.poly([[x + 5.5, -h - 3.2], [pointerTip - dir * 2.4, -h - 3.2], [pointerTip, -h - 1.4], [pointerTip - dir * 2.4, -h + 0.4], [x + 5.5, -h + 0.4]], a.paint('brass', 'f'));
				const ap = pyramid(a, x, -h - 14, 11, 9, 11, 'copper');
				finial(a, ap[0], ap[1], 1.3);
			}
		}
	},

	'stack-tower'(a, k) {
		const lit = k === 3;
		const n = [2, 3, 4, 5][k];
		let b = 0;
		const D0 = 14;
		for (let i = 0; i < n; i++) {
			const w = k === 0 ? 16 - i * 2 : 24 - i * 3.2;
			const d = D0 - i * 1.6;
			const shift = (D0 - d) / 2;
			const x = -w / 2 + shift * DX + (i % 2 ? 0.8 : -0.8);
			const bb = b - shift * DY;
			const h = k === 0 ? 11 : 8.5;
			const mat = k === 0 ? 'wood' : i % 2 ? (k >= 2 ? 'stone' : 'brick') : k >= 2 ? 'plaster' : 'stone';
			block(a, x, bb, w, h, d, mat);
			if (k === 0) {
				a.line(x + 0.8, bb - 0.8, x + w - 0.8, bb - h + 0.8, 0.8, MAT.wood[2]);
				a.line(x + 0.8, bb - h + 0.8, x + w - 0.8, bb - 0.8, 0.8, MAT.wood[2]);
			} else {
				const nw = Math.max(1, Math.floor(w / 7));
				const ww = 3;
				const gap = (w - nw * ww) / (nw + 1);
				for (let j = 0; j < nw; j++) win(a, x + gap + j * (ww + gap), bb - h + 2, ww, 4.5, lit, { cross: false });
				block(a, x - 1, bb - h, w + 2, 1.6, d + 0.6, k === 3 ? 'brass' : 'stone');
			}
			b = bb - h - (k === 0 ? 0 : 1.6) + shift * DY;
			if (i === n - 1) {
				const topD = d;
				const topX = x;
				const topW = w;
				const topB = b - shift * DY;
				if (k === 0) flag(a, topX + topW / 2, topB - (topD * DY) / 2, 9, 'red');
				else if (k === 1) crenels(a, topX - 1, topB, topW + 2, 3, 2.4, topD + 0.6, 'stone');
				else {
					const ap = pyramid(a, topX - 1, topB, topW + 2, topD + 0.6, k === 2 ? 9 : 12, ROOF[k]);
					if (k === 3) finial(a, ap[0], ap[1], 1.5);
				}
			}
		}
	},

	'search-lighthouse'(a, k) {
		const lit = k === 3;
		if (k === 0) {
			a.line(-10, 0, -4, -24, 1.8, MAT.wood[2]);
			a.line(10, 0, 4, -24, 1.8, MAT.wood[2]);
			a.line(-8, -6, 8, -6, 1.1, MAT.wood[2]);
			a.line(-6.5, -13, 6.5, -13, 1.1, MAT.wood[2]);
			a.line(-8, -6, 6.5, -13, 0.9, MAT.wood[2]);
			a.line(8, -6, -6.5, -13, 0.9, MAT.wood[2]);
			block(a, -7, -24, 14, 2.4, 7, 'wood');
			a.ellipse(0 + 2, -31, 8, 8, 'url(#forge)', NO);
			cyl(a, 2.2, -26.4, 3.6, 3.2, 'iron', { topMat: 'iron' });
			a.path(`M-1 -29.6Q0.5 -36 2.2 -38Q3.2 -33.5 5.4 -29.6Z`, GLOW, [[-1, -38], [5.4, -29.6]]);
			a.path(`M0.8 -29.6Q1.8 -33 2.4 -34.5Q3 -32 4 -29.6Z`, LIT, [], NO);
			return;
		}
		const H = [0, 24, 36, 42][k];
		const R0 = [0, 9, 10, 10.5][k];
		const R1 = [0, 6.5, 6.5, 7][k];
		if (k === 3) {
			block(a, -26, 0, 14, 10, 10, 'plaster', { top: false });
			win(a, -21, -7.5, 4.5, 4.5, true);
			gable(a, -26, -10, 14, 10, 6, 'copper', 'plaster');
		}
		taper(a, 0, 0, R0, R1, H, k === 1 ? 'stone' : 'pale');
		if (k >= 2) for (const [t0, t1] of [[0.12, 0.26], [0.45, 0.59], [0.78, 0.92]]) band(a, 0, 0, R0, R1, H, t0, t1, 'red');
		door(a, -2.4, R0 * 0.3 - 0.4, 4.8, 7);
		win(a, -1.2, -H * 0.5, 2.4, 4, lit, { cross: false, glow: false });
		cyl(a, 0, -H, R1 + 2, 1.8, k === 1 ? 'stone' : 'iron');
		if (k >= 2) {
			for (let x = -R1 - 1.4; x <= R1 + 1.6; x += 2.2) a.line(x, -H - 1.8, x, -H - 4.2, 0.45);
			a.line(-R1 - 1.6, -H - 4.2, R1 + 1.6, -H - 4.2, 0.6);
		}
		const lh = k === 1 ? 5 : 6.5;
		a.ellipse(0, -H - 1.8 - lh / 2, 9, 7, 'url(#glow)', NO);
		cyl(a, 0, -H - 1.8, R1 - 1.6, lh, 'litglass', { top: false });
		a.line(0, -H - 1.8, 0, -H - 1.8 - lh, 0.5);
		const capMat = k === 1 ? 'red' : k === 2 ? 'red' : 'brass';
		dome(a, 0, -H - 1.8 - lh, R1 - 0.8, 5, capMat);
		finial(a, 0, -H - 1.8 - lh - 4.8, 1, k === 3 ? 'brass' : 'iron');
		if (k === 3) {
			const cy = -H - 1.8 - lh / 2;
			a.poly([[5, cy - 1.5], [30, cy - 8], [30, cy + 4], [5, cy + 1.5]], LIT, ' stroke="none" opacity="0.38"');
			a.poly([[-5, cy - 1.5], [-22, cy - 6], [-22, cy + 3], [-5, cy + 1.5]], LIT, ' stroke="none" opacity="0.25"');
		}
	},

	'window-mill'(a, k) {
		const lit = k === 3;
		if (k === 0) {
			a.line(-7, 0, 0, -9, 1.6, MAT.wood[2]);
			a.line(7, 0, 0, -9, 1.6, MAT.wood[2]);
			a.line(0, 0, 0, -9, 1.6, MAT.wood[2]);
			block(a, -6.5, -8, 13, 14, 8, 'wood', { top: false });
			planks(a, -6.5, -8, 13, 14);
			gable(a, -6.5, -22, 13, 8, 4, 'wood', 'wood', 1);
			sails(a, 0, -18, 17, 4.2, -0.35, 'canvas');
			sphere(a, 0, -18, 1.6, 'wood');
			return;
		}
		const H = [0, 22, 28, 30][k];
		const R0 = [0, 9.5, 11.5, 12][k];
		const R1 = [0, 6.5, 8, 8.5][k];
		const tower = k === 1 ? 'stone' : k === 2 ? 'plaster' : 'plaster';
		if (k === 3) {
			block(a, 9, 0, 16, 10, 10, 'brick', { top: false });
			bricks(a, 9, 0, 16, 10);
			win(a, 17, -7.5, 4.5, 4.5, true);
			gable(a, 9, -10, 16, 10, 6, 'copper', 'brick');
		}
		taper(a, 0, 0, R0, R1, H, tower);
		door(a, -2.6, R0 * 0.3 - 0.5, 5.2, 8);
		win(a, -1.8, -H * 0.55, 3.6, 4.6, lit);
		if (k >= 2) {
			cyl(a, 0, -H * 0.42, R0 * 0.82 + 3, 1.4, 'wood');
			for (let x = -R0 * 0.82 - 2.4; x <= R0 * 0.82 + 2.6; x += 2.4) a.line(x, -H * 0.42 - 1.4, x, -H * 0.42 - 3.8, 0.45);
		}
		dome(a, 0, -H, R1 + 1.4, 7, k === 1 ? 'wood' : k === 2 ? 'slate' : 'copper');
		if (k === 3) finial(a, 0, -H - 7, 1.2);
		const L = [0, 20, 25, 28][k];
		sails(a, 0, -H - 2.5, L, k === 1 ? 4.6 : 5.6, -0.3, 'canvas');
		sphere(a, 0, -H - 2.5, 2, k === 3 ? 'brass' : 'wood');
	},

	'chain-foundry'(a, k) {
		const lit = k === 3;
		if (k === 0) {
			for (const [x, y] of [[-17, -18], [15, -15]]) a.line(x, 0, x, y, 1.8, MAT.wood[2]);
			a.poly([[-20, -19.5], [18, -15.5], [18 + 7 * DX, -15.5 - 7 * DY], [-20 + 7 * DX, -19.5 - 7 * DY]], a.paint('wood', 't'));
			a.poly([[-20, -19.5], [18, -15.5], [18, -13.8], [-20, -17.8]], a.paint('wood', 'f'));
			block(a, -3, 0, 13, 7, 9, 'stone');
			a.ellipse(3.5 + 4.5 * DX, -7 - 4.5 * DY, 6, 4, 'url(#forge)', NO);
			a.path('M0.5 -8.4Q3.5 -15 4.8 -16Q6 -12 8.6 -8.4Z', GLOW, [[0.5, -16], [8.6, -8.4]]);
			a.poly([[-15, 0], [-13.5, -3.5], [-16, -3.5], [-16, -5.6], [-8, -5.6], [-6, -4.4], [-10, -3.5], [-11.5, 0]], a.paint('iron', 'f'));
			chain(a, [-9, -17], [-8.6, -8], 0.2, 6, 'iron');
			return;
		}
		const roof = k === 1 ? 'tile' : k === 2 ? 'slate' : 'copper';
		const w = k === 1 ? 26 : 44;
		const x0 = -w / 2;
		const chimneys = k === 1 ? [x0 + w - 8] : k === 2 ? [x0 + 6, x0 + w - 11] : [x0 + 4, x0 + w / 2 - 2.5, x0 + w - 10];
		const tops = chimneys.map((x, i) => chimney(a, x, -14, 5, k === 3 && i === 1 ? 22 : 18));
		for (const t of tops) smoke(a, t[0], t[1] - 3, 0.9);
		block(a, x0, 0, w, 16, 14, 'brick', { top: false });
		bricks(a, x0, 0, w, 16);
		const doors = k === 1 ? [x0 + 4] : [x0 + 5, x0 + w / 2 - 4, x0 + w - 13];
		for (const x of doors) opening(a, x, 0, 8, 12, true);
		if (k === 1) win(a, x0 + 16, -11, 5, 5, false);
		gable(a, x0, -16, w, 14, 9, roof, 'brick');
		if (k >= 2) for (let i = 0; i + 1 < tops.length; i++) chain(a, [tops[i][0] + 1, tops[i][1] + 3], [tops[i + 1][0] - 1, tops[i + 1][1] + 3], 6, 12, k === 3 ? 'brass' : 'iron');
		else chain(a, [x0 + 15, -14], [x0 + 15, -8], 0, 4, 'iron');
		if (lit) for (const x of doors) a.ellipse(x + 4, -6, 9, 7, 'url(#forge)', ' stroke="none" opacity="0.5"');
	},

	arboretum(a, k) {
		const lit = k === 3;
		if (k === 0) {
			tree(a, 0, -4, 1.15);
			cyl(a, 0, 0, 11, 4, 'stone', { topMat: 'mud' });
			return;
		}
		if (k === 1) {
			tree(a, -1 + 6 * DX, -3 - 6 * DY, 0.85);
			block(a, -14, 0, 28, 3, 12, 'stone');
			block(a, -14, -3, 28, 13, 12, 'glass', { top: false, opacity: 0.45 });
			frontGable(a, -14, -16, 28, 12, 9, 'glass', 'glass', 0.8);
			for (const x of [-7, 0, 7]) a.line(x, -3, x, -16, 0.7, MAT.wood[2]);
			a.line(-14, -16, 14, -16, 0.9, MAT.wood[2]);
			return;
		}
		const rib = k === 3 ? MAT.brass[2] : MAT.iron[2];
		if (k === 3) {
			for (const x of [-34, 18]) {
				block(a, x, -3, 16, 12, 11, 'glass', { top: false, opacity: 0.5 });
				block(a, x, 0, 16, 3, 11, 'stone', { top: false });
				for (const xx of [x + 4, x + 8, x + 12]) a.line(xx, -3, xx, -15, 0.6, rib);
				gable(a, x, -15, 16, 11, 6, 'glass', 'glass', 1);
			}
		}
		tree(a, 0 + 8 * DX, -3 - 8 * DY, k === 2 ? 1.1 : 1.3);
		block(a, -18, 0, 36, 3, 16, 'stone');
		block(a, -18, -3, 36, 14, 16, 'glass', { top: false, opacity: 0.45 });
		for (const x of [-12, -6, 0, 6, 12]) a.line(x, -3, x, -17, 0.7, rib);
		const cx = 0 + 8 * DX;
		const cb = -17 - 8 * DY;
		a.poly([[-18, -17], [18, -17], [18 + 16 * DX, -17 - 16 * DY], [-18 + 16 * DX, -17 - 16 * DY]], a.paint('glass', 't'), ' fill-opacity="0.5"');
		if (lit) a.ellipse(cx, cb - 6, 16, 12, 'url(#glow)', ' stroke="none" opacity="0.6"');
		dome(a, cx, cb, k === 2 ? 13 : 15, k === 2 ? 13 : 16, 'glass', { opacity: 0.5, ribs: rib });
		finial(a, cx, cb - (k === 2 ? 13 : 16), 1.3, k === 3 ? 'brass' : 'iron');
	},

	'trie-library'(a, k) {
		const lit = k === 3;
		if (k === 0) {
			block(a, -10, 0, 20, 13, 10, 'wood', { top: false });
			planks(a, -10, 0, 20, 13);
			door(a, -3, 0, 6, 9);
			frontGable(a, -10, -13, 20, 10, 9, 'tile', 'wood', 1.5);
			a.poly([[-4.4, -18.4], [0, -17.4], [0, -13.8], [-4.4, -14.8]], a.paint('canvas', 'f'));
			a.poly([[4.4, -18.4], [0, -17.4], [0, -13.8], [4.4, -14.8]], a.paint('canvas', 's'));
			block(a, 11, 0, 7, 6, 5, 'wood');
			for (const [x, m] of [[12, 'red'], [13.6, 'blue'], [15.2, 'leaf']]) a.poly([[x, -6], [x + 1.3, -6], [x + 1.3, -10], [x, -10]], a.paint(m, 'f'));
			return;
		}
		const roof = ROOF[k];
		const H = k === 1 ? 22 : 26;
		const W = k === 1 ? 24 : 26;
		if (k >= 2) {
			block(a, -W / 2 - 10, 0, 10, 13, 14, 'stone', { top: false });
			win(a, -W / 2 - 7, -10, 4, 7, lit, { pointed: true });
			a.poly([[-W / 2 - 11, -13], [-W / 2, -13], [-W / 2, -19], [-W / 2 - 11 + 14 * DX * 0.3, -18]], a.paint(roof, 'r'));
		}
		if (k === 3) {
			for (const x of [-W / 2 - 4, W / 2 - 4]) {
				block(a, x, 0, 8, 38, 8, 'stone', { top: false });
				win(a, x + 2.5, -33, 3, 6, lit, { pointed: true });
				const ap = pyramid(a, x, -38, 8, 8, 12, 'copper', 1);
				finial(a, ap[0], ap[1], 1.2);
			}
		}
		block(a, -W / 2, 0, W, H, 18, 'stone', { top: false });
		winRow(a, -W / 2 + 3, -H + 5, 4, 12, 2, W - 14, lit, { pointed: true });
		door(a, -3.5, 0, 7, 11);
		const g = frontGable(a, -W / 2, -H, W, 18, 16, roof, 'stone');
		trie(a, 0, -H - 6, 5, lit);
		if (k >= 2) {
			const sx = g.mid[0];
			const sy = g.mid[1] + 3;
			a.poly([[sx - 1.8, sy], [sx + 1.8, sy], [sx, sy - 16]], a.paint(roof, 'c'));
			finial(a, sx, sy - 16, 1.1, k === 3 ? 'brass' : 'iron');
		}
		if (k >= 2 && k < 3) {
			block(a, W / 2, 0, 10, 13, 14, 'stone', { top: false });
			win(a, W / 2 + 3, -10, 4, 7, lit, { pointed: true });
			gable(a, W / 2, -13, 10, 14, 5, roof, 'stone', 1);
		} else if (k === 1) {
			// a reading bench at the door
			block(a, W / 2 + 2, 0, 8, 2.6, 4, 'wood');
		}
	},

	'heap-forge'(a, k) {
		const lit = k === 3;
		if (k >= 1) {
			const hx = -2;
			const top = k === 1 ? -36 : -40;
			a.line(hx - 8, -16, hx, top, 1.8, k === 1 ? MAT.wood[2] : INK);
			a.line(hx + 8, -16, hx, top, 1.8, k === 1 ? MAT.wood[2] : INK);
			a.line(hx - 5, -24, hx + 5, -24, 1.1, k === 1 ? MAT.wood[2] : INK);
			a.ellipse(hx, top, 4, 4, a.paint(k === 1 ? 'wood' : 'iron', 'o'));
			for (let i = 0; i < 4; i++) {
				const t = (i * Math.PI) / 4;
				a.line(hx - Math.cos(t) * 3.4, top - Math.sin(t) * 3.4, hx + Math.cos(t) * 3.4, top + Math.sin(t) * 3.4, 0.5);
			}
			a.line(hx + 3.8, top + 1, hx + 9, -14, 0.5);
		}
		mound(a, 0, 0, 44, 22, 'stone');
		if (k >= 2) {
			const roof = k === 2 ? 'slate' : 'copper';
			const t = chimney(a, -27, -12, 4, 16);
			smoke(a, t[0], t[1] - 3, 0.9);
			block(a, -32, 0, 14, 14, 10, 'stone', { top: false });
			win(a, -29, -10, 4, 6, lit, { arch: true });
			gable(a, -32, -14, 14, 10, 7, roof, 'stone');
		}
		door(a, -6, 0, 12, 14, DARK);
		a.line(-6.6, 0, -6.6, -11, 2.2, MAT.wood[2]);
		a.line(6.6, 0, 6.6, -11, 2.2, MAT.wood[2]);
		block(a, -8.4, -11, 16.8, 2.4, 3, 'wood');
		if (k >= 1) {
			a.line(-4, 0.6, -4, 4, 0.6, MAT.iron[2]);
			a.line(4, 0.6, 4, 4, 0.6, MAT.iron[2]);
		}
		if (lit) {
			for (const x of [-9.5, 9.5]) {
				a.ellipse(x, -12.5, 3.2, 3.2, 'url(#glow)', NO);
				a.ellipse(x, -12.5, 1.1, 1.3, LIT);
			}
		}
		const rows = [2, 3, 4, 5][k];
		const rad = 2.1;
		const hx = 17 + (rows - 2) * 1.2;
		if (k === 0) {
			block(a, 9, -2, 10, 5, 5, 'iron');
			for (const x of [11, 17]) a.ellipse(x, -1.4, 1.6, 1.6, a.paint('iron', 'o'));
			heap(a, 14 + 2.5, -7 - 1, 2, 1.8, 'ore');
		} else {
			heap(a, hx, 0, rows, rad, 'ore', 'brass', k === 3 ? 2 : 0);
		}
	},

	maze(a, k) {
		looking(0.3, 0.72, () => this.mazePlan(a, k));
	},

	mazePlan(a, k) {
		const n = [3, 4, 5, 6][k];
		const c = 6;
		const t = 1.7;
		const H = 3.6;
		const pad = 2.5;
		const W = n * c;
		// Carved by backtracking, like the problems it stands for, from a fixed seed so it never changes.
		let seed = 7 + k * 101;
		const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
		const right = Array.from({ length: n }, () => Array(n).fill(true));
		const down = Array.from({ length: n }, () => Array(n).fill(true));
		const seen = Array.from({ length: n }, () => Array(n).fill(false));
		const stack = [[0, 0]];
		seen[0][0] = true;
		while (stack.length) {
			const [x, y] = stack[stack.length - 1];
			const next = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [x + dx, y + dy, dx, dy]).filter(([nx, ny]) => nx >= 0 && ny >= 0 && nx < n && ny < n && !seen[ny][nx]);
			if (!next.length) {
				stack.pop();
				continue;
			}
			const [nx, ny, dx, dy] = next[Math.floor(rnd() * next.length)];
			if (dx === 1) right[y][x] = false;
			if (dx === -1) right[y][nx] = false;
			if (dy === 1) down[y][x] = false;
			if (dy === -1) down[ny][x] = false;
			seen[ny][nx] = true;
			stack.push([nx, ny]);
		}
		const x0 = -W / 2 - pad - (W * DX) / 2;
		block(a, x0, 0, W + 2 * pad, 3, W + 2 * pad, k >= 2 ? 'stone' : 'mud', { topMat: k >= 2 ? 'pale' : 'mud' });
		const P = on(x0 + pad, -3 - pad * DY);
		// Row y = 0 is the back, so v = (n - y) * c at its front edge.
		const items = [];
		const hedge = (u, v, w, d) => items.push({ v, u, f: () => block(a, ...P(u, v), w, H, d, 'leaf') });
		const entrance = Math.floor(n / 2);
		for (let x = 0; x < n; x++) {
			hedge(x * c - t / 2, n * c - t / 2, c + t, t);
			if (x !== entrance) hedge(x * c - t / 2, -t / 2, c + t, t);
		}
		for (let y = 0; y < n; y++) {
			const v = (n - 1 - y) * c;
			hedge(-t / 2, v, t, c);
			hedge(n * c - t / 2, v, t, c);
			for (let x = 0; x < n; x++) {
				if (x < n - 1 && right[y][x]) hedge((x + 1) * c - t / 2, v, t, c);
				if (y < n - 1 && down[y][x]) hedge(x * c - t / 2, v - t / 2, c + t, t);
			}
		}
		// The heart of the maze, which grows with the tiers: topiary, sundial, fountain, gazebo.
		const m = Math.floor(n / 2);
		const cu = m * c + c / 2;
		const cv = (n - 1 - m) * c + c / 2;
		items.push({
			v: cv - c / 2 + 0.01,
			u: cu,
			f: () => {
				const [x, b] = P(cu, cv);
				if (k === 0) {
					limb(a, [x, b], [x, b - 6], 0.8, 0.6);
					sphere(a, x, b - 9, 3.6, 'leaf');
				} else if (k === 1) {
					block(a, x - 2, b, 4, 1.6, 3, 'stone');
					a.poly([[x - 1, b - 1.6], [x - 0.5, b - 12], [x + 0.5, b - 12], [x + 1, b - 1.6]], a.paint('stone', 'c'));
					a.poly([[x - 0.5, b - 12], [x + 0.5, b - 12], [x, b - 13.6]], a.paint('stone', 'f'));
				} else if (k === 2) {
					cyl(a, x, b, 2.8, 2, 'stone', { topMat: 'water' });
					a.poly([[x - 0.5, b - 2.2], [x - 0.3, b - 9], [x + 0.3, b - 9], [x + 0.5, b - 2.2]], a.paint('stone', 'c'));
					a.ellipse(x, b - 9.4, 1.8, 0.8, a.paint('water', 't'));
					a.path(`M${r(x)} ${r(b - 9.6)}Q${r(x - 1.2)} ${r(b - 14)} ${r(x - 2.4)} ${r(b - 10)}M${r(x)} ${r(b - 9.6)}Q${r(x + 1.2)} ${r(b - 14)} ${r(x + 2.4)} ${r(b - 10)}`, 'none', [[x - 2.4, b - 14], [x + 2.4, b - 9]], ` stroke="${MAT.water[0]}" stroke-width="SW(1.2)"`);
				} else {
					cyl(a, x, b, 3.4, 1.6, 'stone');
					for (const dx of [-2.4, 2.4]) a.line(x + dx, b - 1.6, x + dx, b - 10, 0.9, INK);
					a.ellipse(x, b - 6, 4, 4, 'url(#glow)', NO);
					dome(a, x, b - 10, 4, 4.4, 'copper');
					finial(a, x, b - 14.4, 1.1);
				}
			}
		});
		items.sort((p, q) => q.v - p.v || p.u - q.u).forEach((i) => i.f());
		if (k >= 1) {
			for (const u of [entrance * c - t / 2 - 0.4, entrance * c + c - t / 2 - 0.2]) {
				const [x, b] = P(u, -t / 2);
				block(a, x, b, 2.2, H + 2.6, 2.2, k >= 2 ? 'stone' : 'wood');
				if (k === 3) {
					a.ellipse(x + 1.1, b - H - 4.6, 3, 3, 'url(#glow)', NO);
					sphere(a, x + 1.1, b - H - 3.8, 1.2, 'brass');
				}
			}
		}
	},

	'graph-roads'(a) {
		looking(0.3, 0.72, () => this.graphPlan(a));
	},

	graphPlan(a) {
		const W = 46;
		const D = 30;
		const x0 = -W / 2 - (D * DX) / 2;
		block(a, x0, 0, W, 2.6, D, 'stone', { topMat: 'leaf' });
		const P = on(x0, -2.6);
		const nodes = { a: [6, 5], b: [23, 3], c: [40, 7], d: [9, 23], e: [34, 25], f: [22, 14] };
		const edges = ['ab', 'bc', 'ad', 'bf', 'fd', 'fe', 'ce', 'de'];
		for (const [p, q] of edges.map((e) => [nodes[e[0]], nodes[e[1]]])) {
			const du = q[0] - p[0];
			const dv = q[1] - p[1];
			const L = Math.hypot(du, dv);
			const nu = (-dv / L) * 1.5;
			const nv = (du / L) * 1.5;
			a.poly([P(p[0] + nu, p[1] + nv), P(q[0] + nu, q[1] + nv), P(q[0] - nu, q[1] - nv), P(p[0] - nu, p[1] - nv)], a.paint('mud', 't'), ` stroke="${MAT.mud[2]}" stroke-width="SW(0.5)"`);
		}
		const order = Object.entries(nodes).sort((p, q) => q[1][1] - p[1][1]);
		for (const [id, [u, v]] of order) {
			const [x, b] = P(u, v);
			if (id === 'f') {
				block(a, x - 1.1, b, 2.2, 22, 2.2, 'wood');
				for (const [y, dir] of [[-20, 1], [-16, -1], [-12, 1]]) {
					const x1 = x + dir * 10;
					a.poly([[x, y - 1.4], [x1 - dir * 1.8, y - 1.4], [x1, y], [x1 - dir * 1.8, y + 1.4], [x, y + 1.4]], a.paint('canvas', 'f'));
				}
				sphere(a, x + 0.2, b - 23.4, 1.6, 'brass');
			} else {
				cyl(a, x, b, 3, 6.5, 'stone');
				sphere(a, x, b - 8, 2, 'brass');
			}
		}
	},

	'dp-academy'(a, k) {
		const lit = k === 3;
		if (k === 0) {
			block(a, -12, 0, 24, 13, 13, 'wood', { top: false });
			planks(a, -12, 0, 24, 13);
			door(a, -3, 0, 6, 9.5);
			win(a, -10, -10, 5, 5, false);
			win(a, 5, -10, 5, 5, false);
			const g = frontGable(a, -12, -13, 24, 13, 9, 'tile', 'wood', 1.6);
			belfry(a, g.mid[0] - 2.6, g.mid[1] + 3.5, 5.2, 6, 4.5, 'wood', 'tile', false);
			return;
		}
		const roof = ROOF[k];
		const wall = 'brick';
		const H = k === 1 ? 16 : 26;
		const W = 40;
		if (k === 3) {
			for (const x of [-W / 2 - 14]) {
				block(a, x, 0, 14, 16, 13, wall, { top: false });
				bricks(a, x, 0, 14, 16);
				winRow(a, x + 2.5, -12, 3.5, 7, 2, 2.4, lit);
				gable(a, x, -16, 14, 13, 7, roof, wall);
			}
		}
		block(a, -W / 2, 0, W, H, 15, wall, { top: false });
		bricks(a, -W / 2, 0, W, H);
		block(a, -W / 2, -H + 2, W, 2, 15, 'stone', { top: false, side: false });
		const rows = k === 1 ? [-12.5] : [-12, -23];
		for (const y of rows) {
			winRow(a, -W / 2 + 3.5, y, 4, 7, 3, 3, lit);
			winRow(a, W / 2 - 3.5 - 4 * 3 - 3 * 2, y, 4, 7, 3, 3, lit);
		}
		block(a, -5, 0, 10, 1.5, 4, 'stone');
		door(a, -3, -1.5, 6, 10);
		if (k >= 2) {
			column(a, -5, -1.5, 1.6, 12);
			column(a, 3.4, -1.5, 1.6, 12);
			frontGable(a, -6, -13.5, 12, 3, 4, roof, 'stone', 0.8);
		}
		const g = gable(a, -W / 2, -H, W, 15, 11, roof, wall);
		if (k < 3) {
			belfry(a, g.mid[0] - 3.5, g.mid[1] + 4, 7, 8, 6, k === 1 ? 'wood' : 'stone', roof, false);
		} else {
			cyl(a, g.mid[0], g.mid[1] + 4.5, 5, 8, 'plaster');
			opening(a, g.mid[0] - 1.8, g.mid[1] + 4.5 + 1.4, 3.6, 6.5, false);
			a.path(`M${r(g.mid[0] - 1.4)} ${r(g.mid[1] + 3)}Q${r(g.mid[0] - 1.4)} ${r(g.mid[1] - 0.6)} ${r(g.mid[0])} ${r(g.mid[1] - 0.6)}Q${r(g.mid[0] + 1.4)} ${r(g.mid[1] - 0.6)} ${r(g.mid[0] + 1.4)} ${r(g.mid[1] + 3)}Z`, a.paint('brass', 'c'), []);
			dome(a, g.mid[0], g.mid[1] - 3.5, 6, 6, 'copper');
			finial(a, g.mid[0], g.mid[1] - 9.5, 1.3);
			const x = W / 2;
			block(a, x, 0, 14, 16, 13, wall, { top: false });
			bricks(a, x, 0, 14, 16);
			winRow(a, x + 2.5, -12, 3.5, 7, 2, 2.4, lit);
			gable(a, x, -16, 14, 13, 7, roof, wall);
		}
	},

	'dp-observatory'(a, k) {
		const lit = k === 3;
		const scope = (x0, y0, x1, y1, w, mat) => {
			limb(a, [x0, y0], [x1, y1], w * 0.8, w, mat);
			a.ellipse(x1, y1, w * 0.5, w * 1.05, a.paint('glass', 'o'), ` transform="rotate(${r((Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI)} ${r(x1)} ${r(y1)})"`);
		};
		if (k === 0) {
			block(a, -14, 0, 28, 5, 12, 'wood');
			planks(a, -14, 0, 28, 5);
			const cx = 1 + 6 * DX;
			const cb = -5 - 6 * DY;
			a.line(cx - 5, cb, cx, cb - 11, 1.2, MAT.wood[2]);
			a.line(cx + 5, cb, cx, cb - 11, 1.2, MAT.wood[2]);
			a.line(cx, cb, cx, cb - 11, 1.2, MAT.wood[2]);
			scope(cx - 9, cb - 6, cx + 12, cb - 21, 2.2, 'brass');
			for (const x of [-13, 13]) a.line(x, -5, x, -10, 0.9, MAT.wood[2]);
			a.line(-13, -10, 13, -10, 0.9, MAT.wood[2]);
			return;
		}
		const R = [0, 12, 14, 15][k];
		const Hc = [0, 12, 15, 16][k];
		if (k === 3) {
			block(a, -22, 0, 44, 3, 18, 'stone');
			cyl(a, 18, -3 - 6, 7, 8, 'stone');
			dome(a, 18, -3 - 6 - 8, 7.4, 7, 'copper');
			win(a, 16.6, -3 - 6 - 6, 2.8, 4, true, { cross: false });
		}
		const b = k === 3 ? -3 : 0;
		if (k >= 2) {
			block(a, -26, b, 13, 10, 10, 'stone', { top: false });
			win(a, -22.5, b - 7.5, 4, 5, lit);
			gable(a, -26, b - 10, 13, 10, 6, k === 2 ? 'slate' : 'copper', 'stone');
		}
		cyl(a, 0, b, R, Hc, 'stone', { top: false });
		door(a, -2.8, b + R * 0.3 - 0.4, 5.6, 8);
		win(a, -R * 0.66, b - Hc + 4, 3, 4.5, lit, { cross: false });
		win(a, R * 0.45, b - Hc + 4, 3, 4.5, lit, { cross: false });
		const dm = k === 1 ? 'pale' : k === 2 ? 'pale' : 'copper';
		dome(a, 0, b - Hc, R + 1, R * 0.92, dm);
		a.path(`M${r(-1.8)} ${r(b - Hc + R * 0.3 + 0.5)}L${r(-1.4)} ${r(b - Hc - R * 0.9)}Q0 ${r(b - Hc - R * 0.95)} ${r(1.4)} ${r(b - Hc - R * 0.9)}L${r(1.8)} ${r(b - Hc + R * 0.3 + 0.5)}Z`, DARK, []);
		if (k >= 2) scope(-0.5, b - Hc - R * 0.35, 13, b - Hc - R * 1.25, 2.4, 'brass');
		if (k === 3) finial(a, -6, b - Hc - R * 0.78, 1.2);
	},

	'greedy-market'(a, k) {
		const lit = k === 3;
		if (k === 0) {
			tent(a, 0, 0, 12, 7, 13, 'blue', 'canvas');
			flag(a, 0, -20, 6, 'brass');
			return;
		}
		if (k === 1) {
			const ap1 = tent(a, -8 + 6 * DX, -6 * DY, 12, 8, 15, 'blue', 'canvas');
			flag(a, ap1[0], ap1[1], 6, 'brass');
			tent(a, 9, 0, 9, 6, 10, 'canvas', 'blue');
			return;
		}
		const side = k === 2 ? 9 : 10;
		const L = tent(a, -18 + 6 * DX, -6 * DY, side, 6, 11, 'canvas', 'blue', { finial: lit ? 'brass' : null });
		const Rt = tent(a, 18 + 6 * DX, -6 * DY, side, 6, 11, 'canvas', 'blue', { finial: lit ? 'brass' : null });
		const C = tent(a, 0, 0, k === 2 ? 15 : 17, 9, k === 2 ? 19 : 22, 'blue', lit ? 'brass' : 'canvas', { stripes: 10, finial: lit ? 'brass' : null });
		if (!lit) {
			flag(a, C[0], C[1], 7, 'red');
			flag(a, L[0], L[1], 5, 'brass');
			flag(a, Rt[0], Rt[1], 5, 'brass');
		} else {
			for (const [p, q] of [[L, C], [C, Rt]]) {
				const P0 = [p[0], p[1] + 1];
				const Q0 = [q[0], q[1] + 1];
				const mid = [(P0[0] + Q0[0]) / 2, Math.max(P0[1], Q0[1]) + 7];
				a.curve(`M${r(P0[0])} ${r(P0[1])}Q${r(mid[0])} ${r(mid[1])} ${r(Q0[0])} ${r(Q0[1])}`, [P0, Q0], 0.6);
				for (const t of [0.25, 0.5, 0.75]) {
					const x = (1 - t) ** 2 * P0[0] + 2 * (1 - t) * t * mid[0] + t * t * Q0[0];
					const y = (1 - t) ** 2 * P0[1] + 2 * (1 - t) * t * mid[1] + t * t * Q0[1];
					a.ellipse(x, y + 1.3, 3, 3, 'url(#glow)', NO);
					a.ellipse(x, y + 1.3, 1.1, 1.4, LIT);
				}
			}
		}
	},

	'interval-clock'(a, k) {
		const lit = k === 3;
		if (k === 0) {
			block(a, -4, 0, 8, 3, 6, 'stone');
			a.poly([[-1.4, -3], [-0.9, -26], [0.9, -26], [1.4, -3]], a.paint('iron', 'c'));
			cyl(a, 0, -26, 6.4, 2, 'iron');
			clock(a, 0, -33.5, 5.6, 'iron');
			a.poly([[-2, -39], [2, -39], [0, -43]], a.paint('iron', 'f'));
			for (const x of [-9, 9]) {
				a.line(0, -14, x, -16, 0.8);
				a.ellipse(x, -14.6, 1.4, 1.8, a.paint('glass', 'o'));
			}
			return;
		}
		const roof = ROOF[k];
		const H = [0, 26, 38, 44][k];
		const W = [0, 14, 16, 16][k];
		if (k === 3) {
			for (const x of [-W / 2 - 14]) {
				block(a, x, 0, 14, 14, 11, 'stone', { top: false });
				winRow(a, x + 2.5, -11, 3.5, 7, 2, 2.4, lit, { arch: true });
				gable(a, x, -14, 14, 11, 7, roof, 'stone');
			}
		}
		block(a, -W / 2, 0, W, H, W * 0.85, 'stone', { top: false });
		door(a, -2.6, 0, 5.2, 8.5);
		if (H > 30) win(a, -1.6, -H * 0.42, 3.2, 6, lit, { arch: true });
		if (k >= 2) {
			block(a, -W / 2 - 0.8, -H + 10, W + 1.6, 1.4, W * 0.85 + 0.4, 'stone', { top: false });
			for (const x of [-W / 2 + 2.2, W / 2 - 5.8]) opening(a, x, -H + 1.2, 3.6, 7.2, false);
		}
		clock(a, 0, -H + (k >= 2 ? 15.5 : 7), k === 1 ? 4.6 : 5.6, lit ? 'brass' : 'stone');
		const ap = pyramid(a, -W / 2, -H, W, W * 0.85, [0, 10, 20, 24][k], roof);
		finial(a, ap[0], ap[1], 1.2, k === 3 ? 'brass' : 'iron');
		if (k === 3) {
			const x = W / 2;
			block(a, x, 0, 14, 14, 11, 'stone', { top: false });
			winRow(a, x + 2.5, -11, 3.5, 7, 2, 2.4, lit, { arch: true });
			gable(a, x, -14, 14, 11, 7, roof, 'stone');
		}
	},

	'bit-workshop'(a, k) {
		const lit = k === 3;
		const bits = (x0, y, s) => {
			const w = s.length * 3.2 + 1.6;
			a.poly([[x0 - 0.8, y - 2.2], [x0 - 0.8 + w, y - 2.2], [x0 - 0.8 + w, y + 2.2], [x0 - 0.8, y + 2.2]], a.paint('wood', 's'));
			[...s].forEach((ch, i) => {
				const cx = x0 + 1 + i * 3.2;
				if (ch === '1') a.ellipse(cx, y, 2.6, 2.6, 'url(#glow)', NO);
				a.ellipse(cx, y, 1.15, 1.15, ch === '1' ? LIT : DARK);
			});
		};
		if (k === 0) {
			block(a, -10, 0, 22, 12, 12, 'wood', { top: false });
			planks(a, -10, 0, 22, 12);
			door(a, 3, 0, 6, 9);
			gable(a, -10, -12, 22, 12, 6, 'wood', 'wood', 1.5);
			gear(a, -12, -7, 7, 10, 'iron');
			block(a, 14, 0, 9, 5, 5, 'wood');
			return;
		}
		if (k === 1) {
			block(a, -16, 0, 32, 16, 13, 'brick', { top: false });
			bricks(a, -16, 0, 32, 16);
			door(a, -13, 0, 7, 11);
			gear(a, 5, -8.5, 5.5, 10, 'iron');
			gear(a, 11.6, -4, 3.4, 8, 'iron');
			bits(-3.5, -13, '1011');
			gable(a, -16, -16, 32, 13, 9, 'tile', 'brick');
			return;
		}
		const roof = ROOF[k];
		const W = 44;
		const x0 = -W / 2;
		const D = 15;
		const ex = D * DX;
		const ey = D * DY;
		if (k === 3) {
			const t = chimney(a, x0 + 2, -14, 4.5, 20);
			smoke(a, t[0], t[1] - 3, 0.9);
		}
		block(a, x0, 0, W, 16, D, 'brick', { top: false });
		bricks(a, x0, 0, W, 16);
		const teeth = 3;
		const tw = W / teeth;
		const rh = 8;
		for (let i = 0; i < teeth; i++) {
			const xa = x0 + i * tw;
			const xb = xa + tw;
			a.poly([[xa, -16], [xb, -16 - rh], [xb + ex, -16 - rh - ey], [xa + ex, -16 - ey]], a.paint(roof, 'r'));
			a.poly([[xb, -16], [xb, -16 - rh], [xb + ex, -16 - rh - ey], [xb + ex, -16 - ey]], lit ? a.paint('litglass', 's') : a.paint('glass', 's'));
			for (let j = 1; j < 4; j++) a.line(xb + (ex * j) / 4, -16 - (ey * j) / 4, xb + (ex * j) / 4, -16 - rh - (ey * j) / 4, 0.45);
		}
		for (let i = 0; i < teeth; i++) {
			const xa = x0 + i * tw;
			const xb = xa + tw;
			a.poly([[xa, -16], [xb, -16], [xb, -16 - rh]], a.paint('brick', 'f'));
		}
		door(a, x0 + 3, 0, 8, 12, k === 3 ? DOOR : DOOR);
		win(a, x0 + 14, -12, 6, 7, lit);
		gear(a, 10, -8.5, 6, 12, k === 3 ? 'brass' : 'iron');
		gear(a, 17.4, -4.2, 3.8, 9, k === 3 ? 'brass' : 'iron');
		bits(x0 + 13, -2.8, k === 2 ? '101101' : '10110101');
	},

	'geometry-hall'(a, k) {
		const lit = k === 3;
		if (k === 0) {
			block(a, -18, 0, 36, 3, 14, 'stone');
			pyramid(a, -2 + 3 * DX, -3 - 3 * DY, 12, 9, 14, 'tile');
			block(a, -14, -3, 9, 9, 8, 'slate');
			sphere(a, 13, -8.5, 5.2, 'brass');
			return;
		}
		const roof = ROOF[k];
		const W = 38;
		const H = k === 1 ? 16 : 18;
		block(a, -W / 2, 0, W, 2, 16, 'stone');
		block(a, -W / 2 + 1, -2, W - 2, H, 15, 'stone', { top: false });
		winRow(a, -W / 2 + 4, -2 - H + 4, 3.6, 9, 4, 5.8, lit);
		const ncol = 4;
		for (let i = 0; i < ncol; i++) column(a, -W / 2 + 3 + (i * (W - 8)) / (ncol - 1), -2, 2, H - 1);
		door(a, -2.8, -2, 5.6, 10);
		if (k === 1) {
			const g = frontGable(a, -W / 2 + 1, -2 - H, W - 2, 15, 7, roof, 'stone', 1.4);
			a.poly([[-2.2, -2 - H - 1], [2.2, -2 - H - 1], [0, -2 - H - 4.6]], 'none', ' stroke-width="SW(0.7)"');
			for (const x of [-W / 2 + 1, W / 2 - 1]) sphere(a, x, -2 - H - 1.6, 1.6, 'brass');
			sphere(a, g.apex[0], g.apex[1] - 1.6, 1.6, 'brass');
			return;
		}
		block(a, -W / 2, -2 - H, W, 2, 16, 'stone');
		const base = -4 - H;
		const cx = 0;
		const D = 14;
		if (k === 2) {
			for (let i = 0; i < 3; i++) {
				const w = 26 - i * 7;
				const d = D - i * 3.5;
				const sh = (D - d) / 2;
				block(a, cx - w / 2 + sh * DX + 0.6, base - i * 4.5 - sh * DY, w, 4.5, d, 'stone');
			}
			return;
		}
		const w = 26;
		const ap = pyramid(a, cx - w / 2 + 1.2 * DX, base - 0.4, w, D, 20, 'glass', 0.6);
		const fl = [cx - w / 2 + 1.2 * DX - 0.6, base + 0.3];
		const fr = [cx + w / 2 + 1.2 * DX + 0.6, base + 0.3];
		for (const t of [0.25, 0.5, 0.75]) {
			const p = lerp(fl, ap, t);
			const q = lerp(fr, ap, t);
			a.line(p[0], p[1], q[0], q[1], 0.6, MAT.brass[2]);
			const s = lerp(fl, fr, t);
			a.line(s[0], s[1], ap[0], ap[1], 0.6, MAT.brass[2]);
		}
		a.ellipse(ap[0], base - 7, 12, 8, 'url(#glow)', ' stroke="none" opacity="0.55"');
		sphere(a, ap[0], ap[1] - 2.2, 2.4, 'brass');
	},

	granary(a) {
		cyl(a, 14 + 6 * DX, -6 * DY, 7, 26, 'stone', { top: false });
		dome(a, 14 + 6 * DX, -26 - 6 * DY, 7.4, 6, 'tile');
		block(a, -22, 0, 26, 15, 14, 'wood', { top: false });
		planks(a, -22, 0, 26, 15);
		door(a, -13, 0, 9, 12);
		a.line(-13, -0.4, -4, -7.5, 0.6, '#3d2414');
		a.line(-4, -0.4, -13, -7.5, 0.6, '#3d2414');
		gable(a, -22, -15, 26, 14, 10, 'tile', 'wood');
		cyl(a, 18, 0, 6.5, 22, 'stone', { top: false });
		for (const y of [-6, -12, -18]) a.curve(`M11.5 ${y}A6.5 1.95 0 0 0 24.5 ${y}`, [], 0.5, MAT.stone[2]);
		dome(a, 18, -22, 6.9, 5.5, 'tile');
		for (const [dx, rot] of [[-2, -12], [0, 0], [2, 12]]) a.poly([[-28 + dx, 0], [-27 + dx, 0], [-27.5 + dx + rot * 0.25, -9]], a.paint('thatch', 'f'));
		a.ellipse(-27.5, -9.5, 3.2, 2.6, a.paint('thatch', 'o'));
	},

	walls(a) {
		block(a, -36, 0, 20, 18, 7, 'stone', { top: true });
		crenels(a, -36, -18, 20, 4, 2.8, 7, 'stone');
		block(a, 16, 0, 20, 18, 7, 'stone');
		crenels(a, 16, -18, 20, 4, 2.8, 7, 'stone');
		for (const x of [-17, 5]) {
			block(a, x, 0, 12, 36, 11, 'stone', { top: true });
			crenels(a, x - 0.6, -36, 13.2, 3, 3.2, 11.4, 'stone');
			win(a, x + 4.5, -30, 3, 5.5, false, { arch: true, cross: false });
			win(a, x + 4.5, -19, 3, 5.5, false, { arch: true, cross: false });
			flag(a, x + 6 + 5.5 * DX, -39.2 - 5.5 * DY, 9, 'red');
		}
		block(a, -5, 0, 10, 22, 9, 'stone', { top: true });
		a.path('M-4 0L-4 -9A4 4 0 0 1 4 -9L4 0Z', DARK, [[-4, -13], [4, 0]]);
		for (const x of [-2.4, 0, 2.4]) a.line(x, -12.4, x, -2.4, 0.6, MAT.iron[0]);
		for (const y of [-10, -6.5, -3]) a.line(-3.6, y, 3.6, y, 0.6, MAT.iron[0]);
		a.poly([[-3, -19], [3, -19], [3, -13], [0, -11.4], [-3, -13]], a.paint('red', 'f'));
		a.line(-1.6, -17.5, 1.6, -15, 0.6, MAT.brass[0]);
		a.line(1.6, -17.5, -1.6, -15, 0.6, MAT.brass[0]);
	},

	monument(a) {
		block(a, -16, 0, 32, 4, 16, 'stone');
		block(a, -12 + 2 * DX, -4 - 2 * DY, 24, 4, 12, 'stone');
		block(a, -8 + 4 * DX, -8 - 4 * DY, 16, 5, 8, 'stone');
		const cx = 0 + 6 * DX;
		const b = -13 - 6 * DY;
		const ex = 3 * DX;
		const ey = 3 * DY;
		a.poly([[cx + 4, b], [cx + 2.6, b - 34], [cx + 2.6 + ex, b - 34 - ey], [cx + 4 + ex, b - ey]], a.paint('brass', 's'));
		a.poly([[cx - 4, b], [cx - 2.6, b - 34], [cx + 2.6, b - 34], [cx + 4, b]], a.paint('brass', 'f'));
		a.poly([[cx + 2.6, b - 34], [cx + 2.6 + ex, b - 34 - ey], [cx + ex / 2, b - 39 - ey / 2]], a.paint('brass', 's'));
		a.poly([[cx - 2.6, b - 34], [cx + 2.6, b - 34], [cx + ex / 2, b - 39 - ey / 2]], a.paint('brass', 'r'));
		a.line(cx - 2, b - 6, cx + 2, b - 6, 0.5, MAT.brass[2]);
		a.poly([[-4, -2.6], [4, -2.6], [4, -0.8], [-4, -0.8]], a.paint('brass', 'f'));
	}
};

const KINDS = {
	hut: 4, 'hash-market': 4, 'pointer-bridge': 4, 'stack-tower': 4, 'search-lighthouse': 4, 'window-mill': 4,
	'chain-foundry': 4, arboretum: 4, 'trie-library': 4, 'heap-forge': 4, maze: 4, 'graph-roads': 1,
	'dp-academy': 4, 'dp-observatory': 4, 'greedy-market': 4, 'interval-clock': 4, 'bit-workshop': 4,
	'geometry-hall': 4, granary: 1, walls: 1, monument: 1
};
const TIERS = [1, 2, 4, 6];

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
let count = 0;
for (const [kind, n] of Object.entries(KINDS)) {
	for (let k = 0; k < n; k++) {
		const a = new Art();
		draw[kind](a, k);
		writeFileSync(new URL(`${kind}-${TIERS[k]}.svg`, OUT), finish(a));
		count++;
	}
}
console.log(`drew ${count} buildings into static/buildings/`);
