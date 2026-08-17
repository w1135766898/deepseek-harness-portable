#!/bin/sh

set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
TEST_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/dsh-install-test.XXXXXX")

cleanup() {
  case "$TEST_ROOT" in
    "${TMPDIR:-/tmp}"/dsh-install-test.*) rm -rf -- "$TEST_ROOT" ;;
  esac
}
trap cleanup 0 HUP INT TERM

fail() {
  printf '%s\n' "install-unix.test.sh: $*" >&2
  exit 1
}

FAKE_BIN=$TEST_ROOT/bin
mkdir -p "$FAKE_BIN"

cat > "$FAKE_BIN/uname" <<'EOF'
#!/bin/sh
case "$1" in
  -s) printf '%s\n' "$DSH_TEST_UNAME_S" ;;
  -m) printf '%s\n' "$DSH_TEST_UNAME_M" ;;
  *) exit 2 ;;
esac
EOF
chmod +x "$FAKE_BIN/uname"

cat > "$FAKE_BIN/update-desktop-database" <<'EOF'
#!/bin/sh
exit 0
EOF
chmod +x "$FAKE_BIN/update-desktop-database"

cat > "$FAKE_BIN/hdiutil" <<'EOF'
#!/bin/sh
command=$1
shift
case "$command" in
  attach)
    mountpoint=
    while [ "$#" -gt 0 ]; do
      if [ "$1" = '-mountpoint' ]; then
        mountpoint=$2
        shift 2
      else
        shift
      fi
    done
    [ -n "$mountpoint" ] || exit 2
    mkdir -p "$mountpoint"
    cp -R "$DSH_TEST_APP_SOURCE" "$mountpoint/DeepSeek Harness.app"
    ;;
  detach) ;;
  *) exit 2 ;;
esac
EOF
chmod +x "$FAKE_BIN/hdiutil"

checksum_file() {
  input=$1
  output=$2
  hash=$(sha256sum "$input" | awk '{ print toupper($1) }')
  printf '%s *%s\n' "$hash" "${input##*/}" > "$output"
}

LINUX_HOME=$TEST_ROOT/linux-home
LINUX_ARTIFACT=$TEST_ROOT/DeepSeek-Harness-1.3.0-linux-x64.AppImage
LINUX_CHECKSUM=$TEST_ROOT/SHA256SUMS-linux-x64.txt
mkdir -p "$LINUX_HOME"
printf '%s\n' '#!/bin/sh' '[ "$1" = --probe ]' > "$LINUX_ARTIFACT"
checksum_file "$LINUX_ARTIFACT" "$LINUX_CHECKSUM"

env \
  HOME="$LINUX_HOME" \
  PATH="$FAKE_BIN:$PATH" \
  DSH_TEST_UNAME_S=Linux \
  DSH_TEST_UNAME_M=x86_64 \
  sh "$ROOT/install.sh" \
    --artifact "$LINUX_ARTIFACT" \
    --checksum "$LINUX_CHECKSUM" \
    --install-dir "$LINUX_HOME/apps with spaces"

[ -x "$LINUX_HOME/apps with spaces/DeepSeek-Harness.AppImage" ] || fail 'Linux AppImage was not installed executable'
[ -x "$LINUX_HOME/.local/bin/deepseek-harness" ] || fail 'Linux launcher was not installed'
[ -f "$LINUX_HOME/.local/share/applications/deepseek-harness.desktop" ] || fail 'Linux desktop entry was not installed'
grep -F "$LINUX_HOME/apps with spaces/DeepSeek-Harness.AppImage" "$LINUX_HOME/.local/bin/deepseek-harness" >/dev/null \
  || fail 'Linux launcher does not target the installed AppImage'
"$LINUX_HOME/.local/bin/deepseek-harness" --probe || fail 'Linux launcher did not preserve a spaced AppImage path'

BAD_CHECKSUM=$TEST_ROOT/bad-checksum.txt
printf '%064d *%s\n' 0 "${LINUX_ARTIFACT##*/}" > "$BAD_CHECKSUM"
if env \
  HOME="$TEST_ROOT/bad-home" \
  PATH="$FAKE_BIN:$PATH" \
  DSH_TEST_UNAME_S=Linux \
  DSH_TEST_UNAME_M=x86_64 \
  sh "$ROOT/install.sh" \
    --artifact "$LINUX_ARTIFACT" \
    --checksum "$BAD_CHECKSUM" \
    --install-dir "$TEST_ROOT/must-not-exist" >/dev/null 2>&1; then
  fail 'checksum mismatch was accepted'
fi
[ ! -e "$TEST_ROOT/must-not-exist" ] || fail 'checksum failure changed the install directory'

MAC_HOME=$TEST_ROOT/mac-home
MAC_ARTIFACT=$TEST_ROOT/DeepSeek-Harness-1.3.0-darwin-arm64.dmg
MAC_CHECKSUM=$TEST_ROOT/SHA256SUMS-darwin-arm64.txt
MAC_SOURCE=$TEST_ROOT/source/DeepSeek\ Harness.app
mkdir -p "$MAC_HOME" "$MAC_SOURCE/Contents/MacOS"
printf '%s\n' 'fake DMG' > "$MAC_ARTIFACT"
printf '%s\n' '#!/bin/sh' 'exit 0' > "$MAC_SOURCE/Contents/MacOS/DeepSeek Harness"
chmod +x "$MAC_SOURCE/Contents/MacOS/DeepSeek Harness"
checksum_file "$MAC_ARTIFACT" "$MAC_CHECKSUM"

env \
  HOME="$MAC_HOME" \
  PATH="$FAKE_BIN:$PATH" \
  DSH_TEST_UNAME_S=Darwin \
  DSH_TEST_UNAME_M=arm64 \
  DSH_TEST_APP_SOURCE="$MAC_SOURCE" \
  sh "$ROOT/install.sh" \
    --artifact "$MAC_ARTIFACT" \
    --checksum "$MAC_CHECKSUM" \
    --install-dir "$MAC_HOME/Applications"

[ -x "$MAC_HOME/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness" ] \
  || fail 'macOS app was not installed from the mounted DMG'

if env \
  HOME="$TEST_ROOT/unsupported-home" \
  PATH="$FAKE_BIN:$PATH" \
  DSH_TEST_UNAME_S=Linux \
  DSH_TEST_UNAME_M=aarch64 \
  sh "$ROOT/install.sh" --version 1.3.0 --dry-run >/dev/null 2>&1; then
  fail 'unsupported Linux architecture was accepted'
fi

WRONG_TARGET=$TEST_ROOT/DeepSeek-Harness-1.3.0-darwin-arm64.dmg
cp "$LINUX_ARTIFACT" "$WRONG_TARGET"
checksum_file "$WRONG_TARGET" "$TEST_ROOT/wrong-target-checksum.txt"
if env \
  HOME="$TEST_ROOT/wrong-target-home" \
  PATH="$FAKE_BIN:$PATH" \
  DSH_TEST_UNAME_S=Linux \
  DSH_TEST_UNAME_M=x86_64 \
  sh "$ROOT/install.sh" \
    --version 1.3.0 \
    --artifact "$WRONG_TARGET" \
    --checksum "$TEST_ROOT/wrong-target-checksum.txt" >/dev/null 2>&1; then
  fail 'artifact for the wrong native target was accepted'
fi

printf '%s\n' 'install-unix.test.sh: all tests passed'
