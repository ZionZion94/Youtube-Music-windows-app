import { action, KeyDownEvent, SingletonAction } from "@elgato/streamdeck";

import { loadPluginPng, renderVolumeKey } from "./key-image";
import { Command, getState, send } from "./ytmusic";

/** Fréquence d'interrogation de l'application. */
const POLL_MS = 1000;

/**
 * Bouton de volume : affiche en permanence le volume actuel (pourcentage + jauge), y compris
 * quand il est changé depuis l'application ou Windows. Un appui le change de 5 %.
 */
abstract class VolumeAction extends SingletonAction {
	protected abstract readonly command: Command;
	/** Image de base de la touche (dans imgs/actions/…), sur laquelle on dessine le volume. */
	protected abstract readonly baseImage: string;

	#base: ReturnType<typeof loadPluginPng> | undefined;
	#timer: NodeJS.Timeout | undefined;
	#shown: number | null | undefined;

	override async onWillAppear(): Promise<void> {
		this.#shown = undefined;
		this.#timer ??= setInterval(() => void this.refresh(), POLL_MS);
		await this.refresh();
	}

	override async onKeyDown(ev: KeyDownEvent): Promise<void> {
		if (!(await send(this.command))) {
			// Application fermée : triangle jaune sur la touche.
			await ev.action.showAlert();
			return;
		}
		// Laisse le temps à l'application de publier le nouveau volume.
		setTimeout(() => void this.refresh(), 150);
	}

	private async refresh(): Promise<void> {
		if (!this.actions.some(() => true)) {
			// Plus aucune touche visible : on arrête d'interroger l'application.
			clearInterval(this.#timer);
			this.#timer = undefined;
			return;
		}
		const volume = (await getState())?.volume ?? null;
		if (volume === this.#shown) return;
		this.#shown = volume;

		// Volume inconnu (application fermée…) : `undefined` remet l'image du manifeste.
		this.#base ??= loadPluginPng(this.baseImage);
		const image = volume === null ? undefined : await renderVolumeKey(await this.#base, volume);
		await Promise.all(this.actions.map((a) => (a.isKey() ? a.setImage(image) : undefined)));
	}
}

@action({ UUID: "com.zionzion94.ytmusic.volumeup" })
export class VolumeUpAction extends VolumeAction {
	protected readonly command = "volup";
	protected readonly baseImage = "imgs/actions/volumeup/key@2x.png";
}

@action({ UUID: "com.zionzion94.ytmusic.volumedown" })
export class VolumeDownAction extends VolumeAction {
	protected readonly command = "voldown";
	protected readonly baseImage = "imgs/actions/volumedown/key@2x.png";
}
