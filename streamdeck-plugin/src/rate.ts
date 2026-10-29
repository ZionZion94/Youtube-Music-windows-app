import { action, KeyDownEvent, KeyUpEvent, SingletonAction } from "@elgato/streamdeck";
import { readFileSync } from "node:fs";

import { Command, getState, PlayerState, send } from "./ytmusic";

/** Fréquence d'interrogation de l'application. */
const POLL_MS = 1000;
/** Durée d'appui à partir de laquelle on considère un appui long (Je n'aime pas). */
const LONG_PRESS_MS = 500;

type Rating = "neutral" | "like" | "dislike";

/** Images des trois états (version @2x, 144 px), en data URI, lues à côté de bin/plugin.js. */
const IMAGES = Object.fromEntries(
	(["neutral", "like", "dislike"] as const).map((r) => [
		r,
		`data:image/png;base64,${readFileSync(new URL(`../imgs/actions/rate/${r}@2x.png`, import.meta.url)).toString("base64")}`,
	]),
) as Record<Rating, string>;

function ratingOf(player: PlayerState | null): Rating {
	switch (player?.like) {
		case "LIKE":
			return "like";
		case "DISLIKE":
			return "dislike";
		default:
			return "neutral";
	}
}

/**
 * J'aime / Je n'aime pas sur une seule touche :
 * - appui court → J'aime (ou l'annule) ;
 * - appui long (½ s) → Je n'aime pas (ou l'annule).
 * L'image suit l'avis sur le titre en cours : neutre, aimé ou pas aimé.
 */
@action({ UUID: "com.zionzion94.ytmusic.rate" })
export class RateAction extends SingletonAction {
	#pollTimer: NodeJS.Timeout | undefined;
	#shown: Rating | undefined;
	/** Appuis en cours, par touche : minuterie de l'appui long. */
	#presses = new Map<string, NodeJS.Timeout>();

	override async onWillAppear(): Promise<void> {
		this.#shown = undefined;
		this.#pollTimer ??= setInterval(() => void this.refresh(), POLL_MS);
		await this.refresh();
	}

	override onKeyDown(ev: KeyDownEvent): void {
		clearTimeout(this.#presses.get(ev.action.id));
		this.#presses.set(
			ev.action.id,
			setTimeout(() => {
				// Toujours enfoncée après ½ s : appui long, sans attendre le relâchement.
				this.#presses.delete(ev.action.id);
				void this.rate(ev, "dislike");
			}, LONG_PRESS_MS),
		);
	}

	override async onKeyUp(ev: KeyUpEvent): Promise<void> {
		const timer = this.#presses.get(ev.action.id);
		if (!timer) return; // l'appui long a déjà été traité
		clearTimeout(timer);
		this.#presses.delete(ev.action.id);
		await this.rate(ev, "like");
	}

	private async rate(ev: KeyDownEvent | KeyUpEvent, command: Command): Promise<void> {
		if (!(await send(command))) {
			await ev.action.showAlert();
			return;
		}
		// La page met à jour son état peu après le clic.
		setTimeout(() => void this.refresh(), 500);
	}

	private async refresh(): Promise<void> {
		if (!this.actions.some(() => true)) {
			// Plus aucune touche visible : on arrête d'interroger l'application.
			clearInterval(this.#pollTimer);
			this.#pollTimer = undefined;
			return;
		}
		const rating = ratingOf(await getState());
		if (rating === this.#shown) return;
		this.#shown = rating;
		await Promise.all(
			this.actions.map((a) => (a.isKey() ? a.setImage(IMAGES[rating]) : undefined)),
		);
	}
}
