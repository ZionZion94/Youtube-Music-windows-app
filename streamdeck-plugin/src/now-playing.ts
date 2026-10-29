import streamDeck, { action, KeyDownEvent, SingletonAction } from "@elgato/streamdeck";

import { decodeArt, hasFonts, renderBackground, renderKey, SIZE, titleWidth, View } from "./key-image";
import { getState, PlayerState, send } from "./ytmusic";

/** Fréquence d'interrogation de l'application. */
const POLL_MS = 1000;
/** Défilement des titres trop longs. */
const SCROLL_MS = 250;
const SCROLL_STEP = 5;
const SCROLL_PAUSE_TICKS = 6;
const TEXT_WIDTH = SIZE - 16;

/** Demande une pochette de la taille de la touche, en JPEG, plutôt que l'original (plus léger). */
function smallArtUrl(url: string): string {
	return /googleusercontent\.com|ggpht\.com/.test(url) ? url.replace(/=w\d+-h\d+[^/]*$/, `=w${SIZE}-h${SIZE}-l90-rj`) : url;
}

type Art = NonNullable<View["art"]>;

/** Pochettes déjà téléchargées et décodées (on n'en garde que quelques-unes). */
const artCache = new Map<string, Art | null>();

async function loadArt(url: string): Promise<Art | null> {
	if (!url) return null;
	if (artCache.has(url)) return artCache.get(url)!;
	let art: Art | null = null;
	try {
		const res = await fetch(smallArtUrl(url), {
			headers: { Accept: "image/jpeg,image/png" },
			signal: AbortSignal.timeout(4000),
		});
		if (res.ok) {
			art = await decodeArt(Buffer.from(await res.arrayBuffer()));
			if (!art) streamDeck.logger.warn(`Pochette dans un format non pris en charge (${res.headers.get("content-type")}) : ${url}`);
		} else {
			streamDeck.logger.warn(`Pochette indisponible (HTTP ${res.status}) : ${url}`);
		}
	} catch (e) {
		streamDeck.logger.warn(`Pochette indisponible (${e instanceof Error ? e.message : String(e)}) : ${url}`);
	}
	if (artCache.size >= 5) artCache.delete(artCache.keys().next().value!);
	artCache.set(url, art);
	return art;
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
	/** Fond (pochette, dégradé, badge) du titre en cours, calculé une fois par changement. */
	#background: ReturnType<typeof renderBackground> | null = null;
	#titleWidth = 0;
	#key = "";
	#offset = 0;
	#pauseTicks = 0;

	override async onWillAppear(): Promise<void> {
		if (!hasFonts) streamDeck.logger.warn("Aucune police trouvée : le texte ne sera pas affiché sur la touche.");
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

		const key = JSON.stringify(view && [view.title, view.artist, view.playing, state?.art, !!view.art]);
		if (key === this.#key) return;
		if (view?.title !== this.#view?.title) {
			streamDeck.logger.info(
				view ? `Titre en cours : ${view.title} — ${view.artist} (pochette : ${view.art ? "oui" : "non"})` : "Aucune lecture",
			);
			this.#offset = 0;
			this.#pauseTicks = SCROLL_PAUSE_TICKS;
		}
		this.#key = key;
		this.#view = view;
		this.#background = view && renderBackground(view);
		this.#titleWidth = view ? titleWidth(view.title) : 0;
		await this.draw();
	}

	private async scroll(): Promise<void> {
		const view = this.#view;
		if (!view || !this.hasKeys()) return;
		const overflow = this.#titleWidth - TEXT_WIDTH;
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
		// Sans lecture : `undefined` remet l'image du manifeste (note de musique).
		const image =
			this.#view && this.#background ? await renderKey(this.#background, this.#view, this.#offset) : undefined;
		await Promise.all(this.actions.map((a) => (a.isKey() ? a.setImage(image) : undefined)));
	}
}
