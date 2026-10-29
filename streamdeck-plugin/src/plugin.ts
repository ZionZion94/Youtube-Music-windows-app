import streamDeck, { action, KeyDownEvent, SingletonAction } from "@elgato/streamdeck";

import { NowPlayingAction } from "./now-playing";
import { Command, getState, send } from "./ytmusic";

/** Intervalle de rafraîchissement de l'icône Lecture/Pause. */
const POLL_MS = 1000;
/** Durée d'affichage du volume sur la touche après un appui. */
const VOLUME_TITLE_MS = 2000;

/** Bouton qui envoie une commande à l'application. */
abstract class CommandAction extends SingletonAction {
	protected abstract readonly command: Command;

	override async onKeyDown(ev: KeyDownEvent): Promise<void> {
		if (!(await send(this.command))) {
			// Application fermée : triangle jaune sur la touche.
			await ev.action.showAlert();
		}
	}
}

@action({ UUID: "com.zionzion94.ytmusic.next" })
class NextAction extends CommandAction {
	protected readonly command = "next";
}

@action({ UUID: "com.zionzion94.ytmusic.previous" })
class PreviousAction extends CommandAction {
	protected readonly command = "prev";
}

/** Bouton de volume : affiche le nouveau volume (ex. « 60 % ») quelques secondes sur la touche. */
abstract class VolumeAction extends CommandAction {
	#clearTimer: NodeJS.Timeout | undefined;

	override async onKeyDown(ev: KeyDownEvent): Promise<void> {
		await super.onKeyDown(ev);
		// Laisse le temps à l'application de publier le nouveau volume.
		await new Promise((resolve) => setTimeout(resolve, 250));
		const volume = (await getState())?.volume;
		if (volume == null || !ev.action.isKey()) return;

		const key = ev.action;
		await key.setTitle(`${volume} %`);
		clearTimeout(this.#clearTimer);
		this.#clearTimer = setTimeout(() => void key.setTitle(""), VOLUME_TITLE_MS);
	}
}

@action({ UUID: "com.zionzion94.ytmusic.volumeup" })
class VolumeUpAction extends VolumeAction {
	protected readonly command = "volup";
}

@action({ UUID: "com.zionzion94.ytmusic.volumedown" })
class VolumeDownAction extends VolumeAction {
	protected readonly command = "voldown";
}

/**
 * Lecture / Pause. L'icône suit l'état réel du lecteur :
 * état 0 = en pause (icône ▶), état 1 = en lecture (icône ❚❚).
 */
@action({ UUID: "com.zionzion94.ytmusic.playpause" })
class PlayPauseAction extends CommandAction {
	protected readonly command = "toggle";
	#timer: NodeJS.Timeout | undefined;
	#playing: boolean | undefined;

	override async onWillAppear(): Promise<void> {
		this.#playing = undefined;
		this.#timer ??= setInterval(() => void this.refresh(), POLL_MS);
		await this.refresh();
	}

	override async onKeyDown(ev: KeyDownEvent): Promise<void> {
		await super.onKeyDown(ev);
		setTimeout(() => void this.refresh(), 300);
	}

	private async refresh(): Promise<void> {
		if (!this.actions.some(() => true)) {
			// Plus aucune touche visible : on arrête d'interroger l'application.
			clearInterval(this.#timer);
			this.#timer = undefined;
			return;
		}
		const state = await getState();
		const playing = state?.playing ?? false;
		if (playing === this.#playing) return;
		this.#playing = playing;
		await Promise.all(
			this.actions.map(async (a) => {
				if (a.isKey()) await a.setState(playing ? 1 : 0);
			}),
		);
	}
}

streamDeck.actions.registerAction(new PlayPauseAction());
streamDeck.actions.registerAction(new NextAction());
streamDeck.actions.registerAction(new PreviousAction());
streamDeck.actions.registerAction(new VolumeUpAction());
streamDeck.actions.registerAction(new VolumeDownAction());
streamDeck.actions.registerAction(new NowPlayingAction());

streamDeck.connect();
