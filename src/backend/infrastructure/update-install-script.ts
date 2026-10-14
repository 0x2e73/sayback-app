// The install script, launched DETACHED right before the app quits, as `/bin/sh -c <script>`:
// it is never written to disk. Its text is FIXED; everything that varies arrives as arguments
// passed by `spawn` without a shell, and each argument is read between double quotes. No path is
// ever interpolated into shell text.

/** `$0` of the script, shown by `ps`. */
export const INSTALL_SCRIPT_LABEL = 'sayback-install';
export const INSTALL_SHELL = '/bin/sh';
/** `PATH` of the script: the system only. */
export const INSTALL_PATH = '/usr/bin:/bin';
export const OPEN_PROGRAM = '/usr/bin/open';
export const DITTO_PROGRAM = '/usr/bin/ditto';

export const INSTALL_EXIT = {
  /** The new version is in place and relaunched. */
  Installed: 0,
  /** The app was still running after the delay: nothing touched, nothing relaunched. */
  Timeout: 3,
  /** Copy failed (or the staged bundle vanished): the previous version is back and relaunched. */
  CopyFailed: 4,
  /** The copy does not have the checked hash: the previous version is back and relaunched. */
  HashMismatch: 5,
  /** The running version could not be set aside: nothing changed, it is relaunched. */
  BackupFailed: 6,
  /** Unexpected arguments: nothing touched. */
  Usage: 64,
} as const;

const exit = (code: number) => `exit ${String(code)}`;

/**
 * 1. wait for the app process to end (`kill -0`), `$6` seconds at most — beyond, touch nothing;
 * 2. keep the running version as `<Name>.previous.app` next to it (a single backup);
 * 3. copy the staged bundle in its place (`ditto`), then recompute the hash of its app.asar;
 * 4. on copy failure or unexpected hash: remove the partial copy, put the backup back;
 * 5. relaunch the app (`open`), new or restored. Every step is logged to `$5`.
 */
export const INSTALL_SCRIPT = `#!/bin/sh
# SayBack : installation d'une mise à jour locale. Lancé détaché par l'app (sh -c) juste avant qu'elle quitte.
# Ce texte est fixe : tout ce qui varie arrive en arguments.
#   $1 pid de l'app            $2 paquet en attente        $3 paquet à remplacer (chemin réel)
#   $4 SHA-256 de app.asar     $5 journal                  $6 attente maximale, en secondes
#   $7 programme « open »      $8 programme « ditto »
set -u
PATH=${INSTALL_PATH}
export PATH

[ "$#" -eq 8 ] || ${exit(INSTALL_EXIT.Usage)}
pid="$1"
staged="$2"
target="$3"
sha="$4"
log="$5"
wait_max="$6"
open_bin="$7"
ditto_bin="$8"

# Never write through a link put in place of the log.
if [ -L "$log" ]; then
  log=/dev/null
fi

say() {
  printf '%s [%s] %s\\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$$" "$*" >>"$log" 2>/dev/null
}

case "$pid" in '' | *[!0-9]*) ${exit(INSTALL_EXIT.Usage)} ;; esac
case "$wait_max" in '' | *[!0-9]*) ${exit(INSTALL_EXIT.Usage)} ;; esac
case "$staged" in /*.app) ;; *) ${exit(INSTALL_EXIT.Usage)} ;; esac
case "$target" in /*.app) ;; *) ${exit(INSTALL_EXIT.Usage)} ;; esac
case "$open_bin" in /*) ;; *) ${exit(INSTALL_EXIT.Usage)} ;; esac
case "$ditto_bin" in /*) ;; *) ${exit(INSTALL_EXIT.Usage)} ;; esac
[ "$staged" != "$target" ] || ${exit(INSTALL_EXIT.Usage)}

previous="\${target%.app}.previous.app"

relaunch() {
  if "$open_bin" "$target" >>"$log" 2>&1; then
    say "relance : $1"
    return 0
  fi
  sleep 1
  if "$open_bin" "$target" >>"$log" 2>&1; then
    say "relance (second essai) : $1"
    return 0
  fi
  say "relance impossible : ouvrez $target à la main"
  return 1
}

restore() {
  rm -rf "$target"
  if mv "$previous" "$target" >>"$log" 2>&1; then
    say "sauvegarde restaurée"
  else
    say "RESTAURATION IMPOSSIBLE : la version précédente est restée dans $previous"
  fi
}

say "mise à jour demandée : $target, depuis $staged (app : pid $pid)"

ticks="$((wait_max * 5))"
while kill -0 "$pid" 2>/dev/null; do
  if [ "$ticks" -le 0 ]; then
    say "abandon : l'app tourne encore après $wait_max s, rien n’est touché"
    ${exit(INSTALL_EXIT.Timeout)}
  fi
  sleep 0.2
  ticks="$((ticks - 1))"
done

if [ -L "$staged" ] || [ ! -d "$staged" ]; then
  say "abandon : le paquet en attente a disparu, rien n’est touché"
  relaunch "version en place, inchangée"
  ${exit(INSTALL_EXIT.CopyFailed)}
fi
if [ -L "$target" ] || [ ! -d "$target" ]; then
  say "abandon : l'app à remplacer n'est plus à sa place, rien n’est touché"
  ${exit(INSTALL_EXIT.BackupFailed)}
fi

rm -rf "$previous"
if [ -e "$previous" ] || [ -L "$previous" ] || ! mv "$target" "$previous" >>"$log" 2>&1; then
  say "abandon : la version en place n'a pas pu être mise de côté, rien n’est touché"
  relaunch "version en place, inchangée"
  ${exit(INSTALL_EXIT.BackupFailed)}
fi

if ! "$ditto_bin" "$staged" "$target" >>"$log" 2>&1; then
  say "échec de la copie : restauration de la version précédente"
  restore
  relaunch "version précédente, restaurée"
  ${exit(INSTALL_EXIT.CopyFailed)}
fi

actual=$(shasum -a 256 "$target/Contents/Resources/app.asar" 2>/dev/null)
actual="\${actual%% *}"
if [ "$actual" != "$sha" ]; then
  say "empreinte inattendue après la copie : restauration de la version précédente"
  restore
  relaunch "version précédente, restaurée"
  ${exit(INSTALL_EXIT.HashMismatch)}
fi

say "installée : $target (version précédente gardée dans $previous)"
relaunch "nouvelle version"
${exit(INSTALL_EXIT.Installed)}
`;
