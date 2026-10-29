//! Petit serveur HTTP local utilisé par le plugin Stream Deck.
//!
//! Écoute uniquement sur 127.0.0.1. Chaque requête doit porter l'en-tête
//! `X-YTMD: 1` : un site web ouvert dans un navigateur ne peut pas l'envoyer
//! sans autorisation CORS (que l'on ne donne jamais), il ne peut donc pas
//! piloter la musique à votre place.
//!
//! - `GET  /state`  → `{"playing":true,"title":"…","artist":"…","volume":50}`
//! - `POST /toggle` → lecture / pause
//! - `POST /next`   → titre suivant
//! - `POST /prev`   → titre précédent
//! - `POST /volup`  → volume +10 %
//! - `POST /voldown`→ volume -10 %

use std::io::{BufRead, BufReader, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::Mutex;
use std::time::Duration;

use tauri::AppHandle;

pub const PORT: u16 = 48723;

/// Dernier état publié par la page (JSON).
static STATE: Mutex<String> = Mutex::new(String::new());

pub fn set_state(json: &str) {
    if let Ok(mut state) = STATE.lock() {
        state.clear();
        state.push_str(json);
    }
}

fn state() -> String {
    match STATE.lock() {
        Ok(s) if !s.is_empty() => s.clone(),
        _ => r#"{"playing":false,"title":"","artist":"","volume":null}"#.to_string(),
    }
}

pub fn start(app: AppHandle) {
    let listener = match TcpListener::bind(("127.0.0.1", PORT)) {
        Ok(l) => l,
        // Port déjà utilisé : l'application fonctionne normalement, sans Stream Deck.
        Err(_) => return,
    };
    std::thread::spawn(move || {
        for stream in listener.incoming().flatten() {
            let _ = handle(&app, stream);
        }
    });
}

fn handle(app: &AppHandle, mut stream: TcpStream) -> std::io::Result<()> {
    stream.set_read_timeout(Some(Duration::from_secs(2)))?;
    let mut reader = BufReader::new(stream.try_clone()?);

    let mut request_line = String::new();
    reader.read_line(&mut request_line)?;
    let mut parts = request_line.split_whitespace();
    let method = parts.next().unwrap_or("");
    let path = parts.next().unwrap_or("");

    let mut authorized = false;
    let mut local_host = false;
    let mut line = String::new();
    loop {
        line.clear();
        if reader.read_line(&mut line)? == 0 || line == "\r\n" || line == "\n" {
            break;
        }
        let Some((name, value)) = line.split_once(':') else { continue };
        let value = value.trim();
        if name.eq_ignore_ascii_case("x-ytmd") {
            authorized = value == "1";
        } else if name.eq_ignore_ascii_case("host") {
            local_host = value.starts_with("127.0.0.1:") || value.starts_with("localhost:");
        }
    }

    let (status, body) = if !authorized || !local_host {
        ("403 Forbidden", String::new())
    } else {
        match (method, path) {
            ("GET", "/state") => ("200 OK", state()),
            ("POST", "/toggle") => command(app, "toggle"),
            ("POST", "/next") => command(app, "next"),
            ("POST", "/prev") => command(app, "prev"),
            ("POST", "/volup") => command(app, "volup"),
            ("POST", "/voldown") => command(app, "voldown"),
            _ => ("404 Not Found", String::new()),
        }
    };

    write!(
        stream,
        "HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    )?;
    stream.flush()
}

fn command(app: &AppHandle, action: &str) -> (&'static str, String) {
    crate::run_js(app, action);
    ("204 No Content", String::new())
}
