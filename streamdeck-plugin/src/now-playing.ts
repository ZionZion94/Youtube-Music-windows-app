import { action, KeyDownEvent, SingletonAction } from "@elgato/streamdeck";

import { getState, PlayerState, send } from "./ytmusic";

/** Taille de rendu de la touche (format @2x). */
const SIZE = 144;
/** Fréquence d'interrogation de l'application. */
const POLL_MS = 1000;
/** Défilement des titres trop longs. */
const SCROLL_MS = 250;
const SCROLL_STEP = 5;
const SCROLL_PAUSE_TICKS = 6;
const TITLE_SIZE = 22;
const ARTIST_SIZE = 17;
const TEXT_LEFT = 8;
const TEXT_WIDTH = SIZE - TEXT_LEFT * 2;

function escapeXml(text: string): string {
	return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** Largeur approximative d'un texte (pas de mesure de police disponible côté plugin). */
function textWidth(text: string, fontSize: number, bold = false): number {
	return text.length * fontSize * (bold ? 0.58 : 0.52);
}

/** Demande une pochette de la taille de la touche plutôt que l'original (plus léger). */
function smallArtUrl(url: string): string {
	return /googleusercontent\.com|ggpht\.com/.test(url) ? url.replace(/=w\d+-h\d+[^/]*$/, `=w${SIZE}-h${SIZE}-l90-rj`) : url;
}

/** Pochettes déjà téléchargées, en data URI (on n'en garde que quelques-unes). */
const artCache = new Map<string, string>();

async function loadArt(url: string): Promise<string | null> {
	if (!url) return null;
	const cached = artCache.get(url);
	if (cached !== undefined) return cached;
	try {
		const res = await fetch(smallArtUrl(url), { signal: AbortSignal.timeout(4000) });
		if (!res.ok) return null;
		const type = res.headers.get("content-type") ?? "image/jpeg";
		const data = `data:${type};base64,${Buffer.from(await res.arrayBuffer()).toString("base64")}`;
		if (artCache.size >= 5) artCache.delete(artCache.keys().next().value!);
		artCache.set(url, data);
		return data;
	} catch {
		return null;
	}
}

type View = {
	title: string;
	artist: string;
	playing: boolean;
	art: string | null;
};

function render(view: View | null, offset: number): string {
	if (!view) {
		// Application fermée ou aucun titre : fond rouge et note de musique.
		return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff2846"/><stop offset="1" stop-color="#cd0028"/></linearGradient></defs>
<rect width="${SIZE}" height="${SIZE}" fill="url(#bg)"/>
<path d="M84 34 L84 88 A14 12 0 1 1 74 77 L74 48 L58 52 L58 96 A14 12 0 1 1 48 85 L48 42 Z" fill="#fff"/>
<text x="72" y="130" font-family="Segoe UI, Arial, sans-serif" font-size="15" fill="#fff" text-anchor="middle">Aucune lecture</text>
</svg>`;
	}

	const background = view.art
		? `<image href="${view.art}" xlink:href="${view.art}" x="0" y="0" width="${SIZE}" height="${SIZE}" preserveAspectRatio="xMidYMid slice"/>`
		: `<rect width="${SIZE}" height="${SIZE}" fill="#cd0028"/>`;
	const pauseBadge = view.playing
		? ""
		: `<rect x="112" y="8" width="24" height="24" rx="5" fill="#000" fill-opacity="0.6"/>
<rect x="118" y="13" width="4" height="14" fill="#fff"/><rect x="126" y="13" width="4" height="14" fill="#fff"/>`;

	return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
<defs><linearGradient id="shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.85"/></linearGradient></defs>
${background}
<rect x="0" y="62" width="${SIZE}" height="${SIZE - 62}" fill="url(#shade)"/>
${pauseBadge}
<text x="${TEXT_LEFT - offset}" y="112" font-family="Segoe UI, Arial, sans-serif" font-size="${TITLE_SIZE}" font-weight="bold" fill="#fff">${escapeXml(view.title)}</text>
<text x="${TEXT_LEFT}" y="134" font-family="Segoe UI, Arial, sans-serif" font-size="${ARTIST_SIZE}" fill="#ddd">${escapeXml(view.artist)}</text>
</svg>`;
}

/**
 * « Titre en cours » : affiche la pochette, le titre (qui défile s'il est trop long)
 * et l'artiste. Un appui met en lecture / en pause.
 */
@action({ UUID: "com.zionzion94.ytmusic.nowplaying" })
export class NowPlayingAction extends SingletonAction {
	#pollTimer: NodeJS.Timeout | undefined;
	#scrollTimer: NodeJS.Timeout | undefined;
	#view: View | null = null;
	#key = "";
	#offset = 0;
	#pauseTicks = 0;

	override async onWillAppear(): Promise<void> {
		this.#key = "\0"; // force un rendu pour la nouvelle touche
		this.#pollTimer ??= setInterval(() => void this.refresh(), POLL_MS);
		this.#scrollTimer ??= setInterval(() => void this.scroll(), SCROLL_MS);
		await this.refresh();
	}

	override async onKeyDown(ev: KeyDownEvent): Promise<void> {
		if (!(await send("toggle"))) {
			await ev.action.showAlert();
			return;
		}
		setTimeout(() => void this.refresh(), 300);
	}

	private hasKeys(): boolean {
		if (this.actions.some(() => true)) return true;
		// Plus aucune touche visible : on arrête tout.
		clearInterval(this.#pollTimer);
		clearInterval(this.#scrollTimer);
		this.#pollTimer = this.#scrollTimer = undefined;
		return false;
	}

	private async refresh(): Promise<void> {
		if (!this.hasKeys()) return;
		const state: PlayerState | null = await getState();
		const view: View | null = state?.title
			? { title: state.title, artist: state.artist, playing: state.playing, art: await loadArt(state.art ?? "") }
			: null;

		const key = JSON.stringify(view && [view.title, view.artist, view.playing, view.art?.length]);
		if (key === this.#key) return;
		if (view?.title !== this.#view?.title) {
			this.#offset = 0;
			this.#pauseTicks = SCROLL_PAUSE_TICKS;
		}
		this.#key = key;
		this.#view = view;
		await this.draw();
	}

	private async scroll(): Promise<void> {
		const view = this.#view;
		if (!view || !this.hasKeys()) return;
		const overflow = textWidth(view.title, TITLE_SIZE, true) - TEXT_WIDTH;
		if (overflow <= 0) return;
		if (this.#pauseTicks > 0) {
			this.#pauseTicks--;
			return;
		}
		this.#offset += SCROLL_STEP;
		if (this.#offset > overflow + SCROLL_STEP) {
			// Fin du titre atteinte : pause, puis retour au début.
			this.#offset = 0;
			this.#pauseTicks = SCROLL_PAUSE_TICKS;
		} else if (this.#offset >= overflow) {
			this.#pauseTicks = SCROLL_PAUSE_TICKS;
		}
		await this.draw();
	}

	private async draw(): Promise<void> {
		const image = render(this.#view, this.#offset);
		await Promise.all(this.actions.map((a) => (a.isKey() ? a.setImage(image) : undefined)));
	}
}
