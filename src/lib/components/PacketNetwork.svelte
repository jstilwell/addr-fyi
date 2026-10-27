<script lang="ts">
	import type { Attachment } from 'svelte/attachments';
	import { cn } from '#lib/utils.js';

	// A drifting constellation of network nodes, linked when they come close,
	// with glowing packets hopping node to node like a traceroute. Tinted
	// ember → magenta → violet across the width. Purely decorative — paused
	// while off-screen, a single still frame for prefers-reduced-motion.
	let { class: className }: { class?: string } = $props();

	const LINK_PX = 150; // nodes closer than this are joined
	const AREA_PER_NODE = 14000; // px² of canvas per node
	const DRIFT = 10; // max node speed, px/s
	const HOP_MS = [700, 1400]; // how long a packet takes per hop
	const SPAWN_MS = 650; // average gap between new packets
	const MAX_PACKETS = 10;
	const MAX_HOPS = 5;
	const HEAD = '#ffe4d6';
	const STOPS: [number, number, number][] = [
		[255, 106, 61], // ember
		[228, 84, 140], // magenta
		[108, 79, 176] // violet
	];

	type Node = { x: number; y: number; vx: number; vy: number; r: number; flash: number };
	type Packet = { from: Node; to: Node; t: number; ms: number; hops: number };

	const between = ([lo, hi]: number[]) => lo + Math.random() * (hi - lo);

	// The palette colour (as "r g b") at position f ∈ [0, 1] across the width.
	function tint(f: number): string {
		const scaled = Math.min(1, Math.max(0, f)) * (STOPS.length - 1);
		const i = Math.min(STOPS.length - 2, Math.floor(scaled));
		const k = scaled - i;
		const [a, b] = [STOPS[i], STOPS[i + 1]];
		return a.map((c, n) => Math.round(c + (b[n] - c) * k)).join(' ');
	}

	const network: Attachment<HTMLCanvasElement> = (canvas) => {
		const ctx = canvas.getContext('2d');
		if (!ctx) return;
		const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

		let width = 0;
		let height = 0;
		let nodes: Node[] = [];
		let packets: Packet[] = [];

		const near = (a: Node, b: Node) => Math.hypot(a.x - b.x, a.y - b.y) < LINK_PX;
		const neighbours = (n: Node) => nodes.filter((m) => m !== n && near(n, m));

		function setup() {
			const dpr = window.devicePixelRatio || 1;
			({ width, height } = canvas.getBoundingClientRect());
			canvas.width = Math.round(width * dpr);
			canvas.height = Math.round(height * dpr);
			ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
			const count = Math.max(12, Math.min(110, Math.round((width * height) / AREA_PER_NODE)));
			// Jittered grid rather than pure random, so nodes spread evenly
			// instead of clumping and leaving bare patches.
			const cols = Math.max(1, Math.round(Math.sqrt((count * width) / height)));
			const rows = Math.ceil(count / cols);
			const [cw, ch] = [width / cols, height / rows];
			nodes = Array.from({ length: count }, (_, i) => ({
				x: ((i % cols) + 0.15 + Math.random() * 0.7) * cw,
				y: (Math.floor(i / cols) + 0.15 + Math.random() * 0.7) * ch,
				vx: (Math.random() * 2 - 1) * DRIFT,
				vy: (Math.random() * 2 - 1) * DRIFT,
				r: 1.2 + Math.random() * 1.2,
				flash: 0
			}));
			packets = [];
		}

		function spawn() {
			const from = nodes[Math.floor(Math.random() * nodes.length)];
			const options = neighbours(from);
			if (!options.length) return;
			const to = options[Math.floor(Math.random() * options.length)];
			packets.push({ from, to, t: 0, ms: between(HOP_MS), hops: 1 });
		}

		function update(dt: number) {
			for (const n of nodes) {
				n.x += n.vx * dt;
				n.y += n.vy * dt;
				// Bounce softly off the edges so the field stays filled.
				if (n.x < 0 || n.x > width) n.vx *= -1;
				if (n.y < 0 || n.y > height) n.vy *= -1;
				n.flash = Math.max(0, n.flash - dt * 1.5);
			}

			if (packets.length < MAX_PACKETS && Math.random() < (dt * 1000) / SPAWN_MS) spawn();

			packets = packets.flatMap((p) => {
				if (!near(p.from, p.to)) return []; // the link drifted apart mid-flight
				p.t += (dt * 1000) / p.ms;
				if (p.t < 1) return [p];
				// Arrived: light up the node, then maybe carry on to the next hop.
				p.to.flash = 1;
				if (p.hops >= MAX_HOPS || Math.random() < 0.35) return [];
				const next = neighbours(p.to).filter((n) => n !== p.from);
				if (!next.length) return [];
				const to = next[Math.floor(Math.random() * next.length)];
				return [{ from: p.to, to, t: 0, ms: between(HOP_MS), hops: p.hops + 1 }];
			});
		}

		function draw() {
			ctx!.clearRect(0, 0, width, height);

			// Links: fainter the longer they are.
			ctx!.lineWidth = 1;
			for (let i = 0; i < nodes.length; i++) {
				for (let j = i + 1; j < nodes.length; j++) {
					const [a, b] = [nodes[i], nodes[j]];
					const d = Math.hypot(a.x - b.x, a.y - b.y);
					if (d >= LINK_PX) continue;
					ctx!.strokeStyle = `rgb(${tint((a.x + b.x) / 2 / width)} / ${(1 - d / LINK_PX) * 0.5})`;
					ctx!.beginPath();
					ctx!.moveTo(a.x, a.y);
					ctx!.lineTo(b.x, b.y);
					ctx!.stroke();
				}
			}

			// Nodes, swelling briefly when a packet lands.
			for (const n of nodes) {
				const color = tint(n.x / width);
				ctx!.fillStyle = `rgb(${color} / ${0.7 + n.flash * 0.3})`;
				ctx!.shadowColor = `rgb(${color})`;
				ctx!.shadowBlur = n.flash * 12;
				ctx!.beginPath();
				ctx!.arc(n.x, n.y, n.r + n.flash * 2, 0, Math.PI * 2);
				ctx!.fill();
			}

			// Packets: a bright head with a short glowing tail along its link.
			for (const p of packets) {
				const x = p.from.x + (p.to.x - p.from.x) * p.t;
				const y = p.from.y + (p.to.y - p.from.y) * p.t;
				const back = Math.max(0, p.t - 0.25);
				const tx = p.from.x + (p.to.x - p.from.x) * back;
				const ty = p.from.y + (p.to.y - p.from.y) * back;
				const color = tint(x / width);
				const tail = ctx!.createLinearGradient(tx, ty, x, y);
				tail.addColorStop(0, `rgb(${color} / 0)`);
				tail.addColorStop(1, `rgb(${color} / 0.9)`);
				ctx!.shadowBlur = 0;
				ctx!.strokeStyle = tail;
				ctx!.lineWidth = 2;
				ctx!.beginPath();
				ctx!.moveTo(tx, ty);
				ctx!.lineTo(x, y);
				ctx!.stroke();
				ctx!.fillStyle = HEAD;
				ctx!.shadowColor = `rgb(${color})`;
				ctx!.shadowBlur = 10;
				ctx!.beginPath();
				ctx!.arc(x, y, 2, 0, Math.PI * 2);
				ctx!.fill();
			}
			ctx!.shadowBlur = 0;
		}

		const resize = new ResizeObserver(() => {
			setup();
			if (still) draw();
		});
		resize.observe(canvas);
		if (still) return () => resize.disconnect();

		let visible = true;
		const seen = new IntersectionObserver(([entry]) => (visible = entry.isIntersecting));
		seen.observe(canvas);

		let raf = 0;
		let last = performance.now();
		const tick = (now: number) => {
			raf = requestAnimationFrame(tick);
			// Clamp the step so a backgrounded tab doesn't teleport everything.
			const dt = Math.min(0.05, (now - last) / 1000);
			last = now;
			if (!visible) return;
			update(dt);
			draw();
		};
		raf = requestAnimationFrame(tick);

		return () => {
			cancelAnimationFrame(raf);
			resize.disconnect();
			seen.disconnect();
		};
	};
</script>

<canvas {@attach network} aria-hidden="true" class={cn('pointer-events-none', className)}></canvas>
