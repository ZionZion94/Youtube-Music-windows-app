import streamDeck, { action, KeyDownEvent, SingletonAction } from "@elgato/streamdeck";

import { NowPlayingAction } from "./now-playing";
import { Command, getState, PlayerState, send } from "./ytmusic";

/** Intervalle de rafraîchissement des touches à deux états (Lecture/Pause, J'aime…). */
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
 * Bouton à deux états (0 ou 1) qui suit l'état réel du lecteur, interrogé chaque seconde
 * tant qu'une de ses touches est visible.
 */
abstract class StatusAction extends CommandAction {
	#timer: NodeJS.Timeout | undefined;
	#shown: 0 | 1 | undefined;

	/** État à afficher pour l'état du lecteur donné (`null` : application injoignable). */
	protected abstract stateFor(player: PlayerState | null): 0 | 1;

	override async onWillAppear(): Promise<void> {
		this.#shown = undefined;
		this.#timer ??= setInterval(() => void this.refresh(), POLL_MS);
		await this.refresh();
	}

	override async onKeyDown(ev: KeyDownEvent): Promise<void> {
		await super.onKeyDown(ev);
		// La page met à jour son état peu après le clic.
		setTimeout(() => void this.refresh(), 500);
	}

	private async refresh(): Promise<void> {
		if (!this.actions.some(() => true)) {
			// Plus aucune touche visible : on arrête d'interroger l'application.
			clearInterval(this.#timer);
			this.#timer = undefined;
			return;
		}
		const state = this.stateFor(await getState());
		if (state === this.#shown) return;
		this.#shown = state;
		await Promise.all(
			this.actions.map(async (a) => {
				if (a.isKey()) await a.setState(state);
			}),
		);
	}
}

/**
 * Lecture / Pause. L'icône suit l'état réel du lecteur :
 * état 0 = en pause (icône ▶), état 1 = en lecture (icône ❚❚).
 */
@action({ UUID: "com.zionzion94.ytmusic.playpause" })
class PlayPauseAction extends StatusAction {
	protected readonly command = "toggle";

	protected stateFor(player: PlayerState | null): 0 | 1 {
		return player?.playing ? 1 : 0;
	}
}

/** J'aime : la touche s'allume (état 1) quand le titre en cours est aimé. Réappuyer annule. */
@action({ UUID: "com.zionzion94.ytmusic.like" })
class LikeAction extends StatusAction {
	protected readonly command = "like";

	protected stateFor(player: PlayerState | null): 0 | 1 {
		return player?.like === "LIKE" ? 1 : 0;
	}
}

/** Je n'aime pas : la touche s'allume (état 1) quand le titre en cours est marqué « Je n'aime pas ». */
@action({ UUID: "com.zionzion94.ytmusic.dislike" })
class DislikeAction extends StatusAction {
	protected readonly command = "dislike";

	protected stateFor(player: PlayerState | null): 0 | 1 {
		return player?.like === "DISLIKE" ? 1 : 0;
	}
}

streamDeck.actions.registerAction(new PlayPauseAction());
streamDeck.actions.registerAction(new NextAction());
streamDeck.actions.registerAction(new PreviousAction());
streamDeck.actions.registerAction(new VolumeUpAction());
streamDeck.actions.registerAction(new VolumeDownAction());
streamDeck.actions.registerAction(new NowPlayingAction());
streamDeck.actions.registerAction(new LikeAction());
streamDeck.actions.registerAction(new DislikeAction());

streamDeck.connect();
