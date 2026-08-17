#!/bin/sh

# Verified user-local installer for the native Linux x64 and macOS arm64
# release artifacts. The installer never bypasses macOS Gatekeeper and never
# installs an artifact that is absent from its target-specific checksum file.

set -eu

REPOSITORY_URL=${DSH_REPOSITORY_URL:-https://github.com/wsnxxxs/deepseek-harness-portable}
VERSION=
INSTALL_DIR=
ARTIFACT=
CHECKSUM=
NO_DESKTOP_ENTRY=0
DRY_RUN=0
TEMP_ROOT=
MOUNT_DIR=
MOUNTED=0

usage() {
  cat <<'EOF'
Usage: sh install.sh [options]

Options:
  --version VERSION       Install a specific release (default: latest).
  --install-dir DIR       Linux AppImage directory or macOS Applications directory.
  --artifact PATH         Install an already-downloaded AppImage or DMG.
  --checksum PATH         Checksum file for --artifact (both options are required).
  --no-desktop-entry      Linux: do not create a launcher or desktop entry.
  --dry-run               Print the selected target and paths without changing files.
  --help                  Show this help.

Supported targets: Linux x86_64 and macOS Apple Silicon (arm64).
EOF
}

fail() {
  printf '%s\n' "install.sh: $*" >&2
  exit 1
}

cleanup() {
  if [ "$MOUNTED" -eq 1 ] && [ -n "$MOUNT_DIR" ]; then
    hdiutil detach -quiet "$MOUNT_DIR" >/dev/null 2>&1 || true
    MOUNTED=0
  fi
  if [ -n "$TEMP_ROOT" ] && [ -d "$TEMP_ROOT" ]; then
    case "$TEMP_ROOT" in
      "${TMPDIR:-/tmp}"/dsh-install.*) rm -rf -- "$TEMP_ROOT" ;;
    esac
  fi
}

on_signal() {
  cleanup
  exit 1
}

trap cleanup 0
trap on_signal HUP INT TERM

while [ "$#" -gt 0 ]; do
  case "$1" in
    --version)
      [ "$#" -ge 2 ] || fail '--version requires a value'
      VERSION=$2
      shift 2
      ;;
    --install-dir)
      [ "$#" -ge 2 ] || fail '--install-dir requires a value'
      INSTALL_DIR=$2
      shift 2
      ;;
    --artifact)
      [ "$#" -ge 2 ] || fail '--artifact requires a value'
      ARTIFACT=$2
      shift 2
      ;;
    --checksum)
      [ "$#" -ge 2 ] || fail '--checksum requires a value'
      CHECKSUM=$2
      shift 2
      ;;
    --no-desktop-entry)
      NO_DESKTOP_ENTRY=1
      shift
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *) fail "unknown option: $1" ;;
  esac
done

if { [ -n "$ARTIFACT" ] && [ -z "$CHECKSUM" ]; } || { [ -z "$ARTIFACT" ] && [ -n "$CHECKSUM" ]; }; then
  fail '--artifact and --checksum must be supplied together'
fi

OS_NAME=$(uname -s)
MACHINE=$(uname -m)
case "$OS_NAME:$MACHINE" in
  Linux:x86_64|Linux:amd64)
    TARGET=linux-x64
    EXTENSION=AppImage
    [ -n "$INSTALL_DIR" ] || INSTALL_DIR="$HOME/.local/opt/deepseek-harness"
    ;;
  Darwin:arm64|Darwin:aarch64)
    TARGET=darwin-arm64
    EXTENSION=dmg
    [ -n "$INSTALL_DIR" ] || INSTALL_DIR="$HOME/Applications"
    ;;
  *) fail "unsupported host $OS_NAME $MACHINE; supported targets are Linux x86_64 and macOS arm64" ;;
esac

case "$INSTALL_DIR" in
  ''|/) fail 'refusing an empty or filesystem-root install directory' ;;
  /*) ;;
  *) INSTALL_DIR=$(pwd)/$INSTALL_DIR ;;
esac

discover_latest_version() {
  command -v curl >/dev/null 2>&1 || fail 'curl is required to discover and download releases'
  latest_url=$(curl -fsSL -o /dev/null -w '%{url_effective}' "$REPOSITORY_URL/releases/latest") \
    || fail 'could not resolve the latest GitHub release'
  latest_url=${latest_url%/}
  latest_tag=${latest_url##*/}
  case "$latest_tag" in v*) latest_tag=${latest_tag#v} ;; esac
  printf '%s\n' "$latest_tag"
}

if [ -z "$VERSION" ]; then
  if [ -n "$ARTIFACT" ]; then
    artifact_name=${ARTIFACT##*/}
    VERSION=$(printf '%s\n' "$artifact_name" | sed -n 's/^DeepSeek-Harness-\([0-9][0-9A-Za-z.-]*\)-\(linux-x64\.AppImage\|darwin-arm64\.dmg\)$/\1/p')
    [ -n "$VERSION" ] || fail 'could not infer a release version from the local artifact name; pass --version'
  else
    VERSION=$(discover_latest_version)
  fi
fi

case "$VERSION" in
  ''|*[!0-9A-Za-z.-]*) fail "invalid release version: $VERSION" ;;
esac

ASSET_NAME=DeepSeek-Harness-$VERSION-$TARGET.$EXTENSION
CHECKSUM_NAME=SHA256SUMS-$TARGET.txt

if [ "$DRY_RUN" -eq 1 ]; then
  printf '%s\n' "target=$TARGET" "version=$VERSION" "asset=$ASSET_NAME" "install_dir=$INSTALL_DIR"
  exit 0
fi

TEMP_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/dsh-install.XXXXXX") || fail 'could not create a temporary directory'

if [ -z "$ARTIFACT" ]; then
  command -v curl >/dev/null 2>&1 || fail 'curl is required to download releases'
  RELEASE_URL=$REPOSITORY_URL/releases/download/v$VERSION
  ARTIFACT=$TEMP_ROOT/$ASSET_NAME
  CHECKSUM=$TEMP_ROOT/$CHECKSUM_NAME
  printf '%s\n' "Downloading $ASSET_NAME..."
  curl -fL --retry 3 --output "$ARTIFACT" "$RELEASE_URL/$ASSET_NAME" \
    || fail "could not download $RELEASE_URL/$ASSET_NAME"
  curl -fL --retry 3 --output "$CHECKSUM" "$RELEASE_URL/$CHECKSUM_NAME" \
    || fail "could not download $RELEASE_URL/$CHECKSUM_NAME"
else
  [ -f "$ARTIFACT" ] || fail "artifact does not exist: $ARTIFACT"
  [ -f "$CHECKSUM" ] || fail "checksum file does not exist: $CHECKSUM"
  [ "${ARTIFACT##*/}" = "$ASSET_NAME" ] \
    || fail "local artifact must be named $ASSET_NAME for target $TARGET"
fi

artifact_basename=${ARTIFACT##*/}
EXPECTED_HASH=$(awk -v name="$artifact_basename" '
  {
    hash = $1
    file = $2
    sub(/^\*/, "", file)
    if (file == name) {
      print tolower(hash)
      exit
    }
  }
' "$CHECKSUM")

printf '%s\n' "$EXPECTED_HASH" | grep -Eq '^[0-9a-f]{64}$' \
  || fail "checksum file has no trusted SHA-256 entry for $artifact_basename"

if command -v sha256sum >/dev/null 2>&1; then
  ACTUAL_HASH=$(sha256sum "$ARTIFACT" | awk '{ print tolower($1) }')
elif command -v shasum >/dev/null 2>&1; then
  ACTUAL_HASH=$(shasum -a 256 "$ARTIFACT" | awk '{ print tolower($1) }')
else
  fail 'sha256sum or shasum is required to verify the release artifact'
fi

[ "$ACTUAL_HASH" = "$EXPECTED_HASH" ] \
  || fail "SHA-256 mismatch for $artifact_basename (expected $EXPECTED_HASH, got $ACTUAL_HASH)"
printf '%s\n' "Verified $artifact_basename ($ACTUAL_HASH)."

shell_quote() {
  quoted=$(printf '%s' "$1" | sed "s/'/'\\\\''/g")
  printf "'%s'" "$quoted"
}

desktop_escape() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g; s/`/\\`/g; s/\$/\\$/g'
}

install_linux() {
  target_path=$INSTALL_DIR/DeepSeek-Harness.AppImage
  staged_path=$INSTALL_DIR/.DeepSeek-Harness.AppImage.new.$$
  mkdir -p "$INSTALL_DIR"
  if ! cp "$ARTIFACT" "$staged_path" || ! chmod 0755 "$staged_path"; then
    rm -f -- "$staged_path"
    fail 'could not stage the Linux AppImage'
  fi
  mv -f "$staged_path" "$target_path"

  if [ "$NO_DESKTOP_ENTRY" -eq 0 ]; then
    bin_dir=${XDG_BIN_HOME:-"$HOME/.local/bin"}
    data_dir=${XDG_DATA_HOME:-"$HOME/.local/share"}
    launcher=$bin_dir/deepseek-harness
    desktop_dir=$data_dir/applications
    desktop_file=$desktop_dir/deepseek-harness.desktop
    launcher_tmp=$bin_dir/.deepseek-harness.new.$$
    desktop_tmp=$desktop_dir/.deepseek-harness.desktop.new.$$
    mkdir -p "$bin_dir" "$desktop_dir"
    {
      printf '%s\n' '#!/bin/sh'
      printf 'exec %s "$@"\n' "$(shell_quote "$target_path")"
    } > "$launcher_tmp"
    chmod 0755 "$launcher_tmp"
    mv -f "$launcher_tmp" "$launcher"
    {
      printf '%s\n' '[Desktop Entry]'
      printf '%s\n' 'Type=Application'
      printf '%s\n' 'Name=DeepSeek Harness'
      printf 'Exec="%s"\n' "$(desktop_escape "$launcher")"
      printf 'TryExec=%s\n' "$(desktop_escape "$launcher")"
      printf '%s\n' 'Terminal=false'
      printf '%s\n' 'Categories=Development;Utility;'
      printf '%s\n' 'StartupNotify=true'
    } > "$desktop_tmp"
    chmod 0644 "$desktop_tmp"
    mv -f "$desktop_tmp" "$desktop_file"
    if command -v update-desktop-database >/dev/null 2>&1; then
      update-desktop-database "$desktop_dir" >/dev/null 2>&1 || true
    fi
    printf '%s\n' "Launcher: $launcher" "Desktop entry: $desktop_file"
  fi
  printf '%s\n' "Installed DeepSeek Harness AppImage: $target_path"
}

install_macos() {
  command -v hdiutil >/dev/null 2>&1 || fail 'hdiutil is required to install the macOS DMG'
  MOUNT_DIR=$TEMP_ROOT/mount
  mkdir -p "$MOUNT_DIR"
  hdiutil attach "$ARTIFACT" -readonly -nobrowse -mountpoint "$MOUNT_DIR" >/dev/null \
    || fail "could not mount $artifact_basename"
  MOUNTED=1
  source_app=$MOUNT_DIR/DeepSeek\ Harness.app
  [ -d "$source_app" ] || fail 'DMG does not contain DeepSeek Harness.app'

  mkdir -p "$INSTALL_DIR"
  destination=$INSTALL_DIR/DeepSeek\ Harness.app
  staged=$INSTALL_DIR/.DeepSeek\ Harness.app.install.$$
  backup=$INSTALL_DIR/.DeepSeek\ Harness.app.previous.$$
  rm -rf -- "$staged" "$backup"
  if command -v ditto >/dev/null 2>&1; then
    if ! ditto "$source_app" "$staged"; then
      rm -rf -- "$staged"
      fail 'could not copy the app from the mounted DMG'
    fi
  else
    if ! cp -R "$source_app" "$staged"; then
      rm -rf -- "$staged"
      fail 'could not copy the app from the mounted DMG'
    fi
  fi
  if [ ! -x "$staged/Contents/MacOS/DeepSeek Harness" ]; then
    rm -rf -- "$staged"
    fail 'installed app copy is missing its executable'
  fi

  if [ -e "$destination" ]; then
    mv "$destination" "$backup"
  fi
  if ! mv "$staged" "$destination"; then
    rm -rf -- "$staged"
    [ ! -e "$backup" ] || mv "$backup" "$destination"
    fail 'could not activate the installed macOS app'
  fi
  rm -rf -- "$backup"
  hdiutil detach -quiet "$MOUNT_DIR" >/dev/null
  MOUNTED=0
  printf '%s\n' "Installed DeepSeek Harness: $destination"
  printf '%s\n' 'The release is currently unsigned and not notarized; Gatekeeper remains enabled.'
}

case "$TARGET" in
  linux-x64) install_linux ;;
  darwin-arm64) install_macos ;;
esac
