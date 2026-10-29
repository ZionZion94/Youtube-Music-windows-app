# YouTube Music pour Windows

Application de bureau **légère** pour YouTube Music : plus besoin d'ouvrir un navigateur.
Connectez-vous une fois avec votre compte Google (YouTube Premium inclus) et la session est conservée.

## Pourquoi c'est léger

- Construite avec [Tauri](https://tauri.app) : pas de Chromium embarqué comme Electron (Spotify, Discord…).
  Elle utilise **WebView2**, déjà présent dans Windows 10/11. L'installeur pèse quelques Mo.
- Quand la fenêtre est réduite ou cachée dans la zone de notification, l'application demande à
  WebView2 de passer en **mode mémoire réduite** et le rendu graphique s'arrête — la musique continue.
- Les fonctions Edge inutiles (traduction, shopping, mises à jour de composants…) sont désactivées.
- L'accélération matérielle reste active pour que l'interface reste **fluide**.

## Fonctionnalités

- Toutes les fonctions de YouTube Music (Premium : sans pub, lecture en arrière-plan, qualité élevée).
- **Touches multimédia** du clavier (Lecture/Pause, Suivant, Précédent, Stop), même quand la fenêtre est cachée.
- **Icône dans la zone de notification** : clic gauche = afficher/masquer, clic droit = menu de lecture.
- Fermer la fenêtre (✕) la cache dans la zone de notification ; *Quitter* depuis le menu de l'icône pour fermer.
- Position et taille de la fenêtre mémorisées.
- Une seule instance : relancer l'application ramène la fenêtre existante.
- Fermeture automatique du message « Vous êtes toujours là ? » qui coupe la musique.
- Les liens externes s'ouvrent dans votre navigateur par défaut.
- Le titre en cours s'affiche dans la barre des tâches et l'infobulle de l'icône.
- **Plugin Stream Deck** : boutons Lecture/Pause, Titre suivant, Titre précédent (voir plus bas).

## Installation

1. Onglet **Actions** du dépôt → dernier build « Build Windows » réussi → télécharger l'artefact
   **YouTube-Music-Setup** (ou depuis la page **Releases** si une version `v*` a été publiée).
2. Lancer `YouTube Music_x.y.z_x64-setup.exe` (installation pour l'utilisateur courant, sans droits admin).
3. Se connecter à son compte Google dans l'application.

> Windows SmartScreen peut afficher un avertissement car l'exécutable n'est pas signé :
> « Informations complémentaires » → « Exécuter quand même ».

## Plugin Stream Deck

Ajoute une catégorie **YouTube Music** dans le logiciel Stream Deck avec 3 boutons :

- **Lecture / Pause** — l'icône passe de ▶ à ❚❚ selon l'état réel du lecteur ;
- **Titre précédent** ;
- **Titre suivant**.

Si l'application n'est pas lancée, la touche affiche un triangle jaune.

**Installation** (Stream Deck 7.1 ou plus récent) :

1. Onglet **Actions** → dernier build réussi → télécharger l'artefact **StreamDeck-Plugin** et le décompresser.
2. Double-cliquer sur `com.zionzion94.ytmusic.streamDeckPlugin` : le logiciel Stream Deck l'installe.
3. Glisser les boutons de la catégorie **YouTube Music** sur vos touches.

L'application YouTube Music doit être en version 1.1.0 ou plus récente. Elle expose pour cela une petite
API locale sur `127.0.0.1:48723`, inaccessible depuis le réseau et depuis les sites web.

Pour compiler le plugin : `cd streamdeck-plugin && npm ci && npm run pack` (résultat dans `streamdeck-plugin/dist/`).

## Compiler soi-même

Prérequis : [Rust](https://rustup.rs), [Node.js](https://nodejs.org), et les
[Build Tools Visual Studio](https://visualstudio.microsoft.com/visual-cpp-build-tools/) (charge « Développement desktop en C++ »).

```powershell
npx @tauri-apps/cli@2 dev     # lancer en développement
npx @tauri-apps/cli@2 build   # créer l'installeur dans src-tauri\target\release\bundle\nsis\
```

## Structure

| Fichier | Rôle |
|---|---|
| `src-tauri/src/main.rs` | Fenêtre, icône de notification, touches multimédia, gestion mémoire |
| `src-tauri/src/inject.js` | Script injecté dans YouTube Music (contrôles de lecture, petites améliorations) |
| `src-tauri/src/api.rs` | API locale utilisée par le plugin Stream Deck |
| `src-tauri/tauri.conf.json` | Configuration de l'application et de l'installeur |
| `streamdeck-plugin/` | Plugin Stream Deck (code dans `src/`, manifeste et icônes dans `com.zionzion94.ytmusic.sdPlugin/`) |
