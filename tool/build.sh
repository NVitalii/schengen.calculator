#!/usr/bin/env bash
# Builds the site's pages (tool/build_pages.cjs) in a throwaway Docker
# container and puts the result into this folder.
#
#   bash tool/build.sh           build: writes index.html, schengen-calculator.html,
#                                <language>/..., sitemap.xml
#   bash tool/build.sh --check   only says whether the pages on disk are current
#
# Why a container: the owner's rule (2026-11-10) - builds and checks never run
# on the machine itself. Nothing is installed: the generator has no
# dependencies, the image must already be on the machine, the network is off.
# The files travel through stdin and stdout, not through a shared folder:
# Docker Desktop here shares only the folders on its own list, and a mount of
# any other folder makes `docker run` wait silently for a click.
#
# The container gets a snapshot of the working tree (uncommitted and
# untracked files included; the real git index is not touched).
set -u
IMAGE="node:24-bookworm-slim"
mode="${1:-build}"

repo="$(git rev-parse --show-toplevel)" || exit 1
cd "$repo" || exit 1 # git archive and tar take paths relative to the repo

if ! docker info >/dev/null 2>&1; then
  echo "build: Docker is not running - start Docker Desktop and try again." >&2
  exit 2
fi
if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  echo "build: the image $IMAGE is not on this machine. Pulling it is the owner's decision." >&2
  exit 2
fi

index="$(git rev-parse --path-format=absolute --git-path index)" || exit 1
idx="$(mktemp)" || exit 1
tarball="$(mktemp)" || exit 1
trap 'rm -f "$idx" "$tarball"' EXIT
cp "$index" "$idx" || exit 1
if ! GIT_INDEX_FILE="$idx" git add -A -- . >/dev/null 2>&1; then
  echo "build: snapshot failed (git add to a temporary index)" >&2
  exit 1
fi
tree="$(GIT_INDEX_FILE="$idx" git write-tree)" || exit 1

if [ "$mode" = "--check" ]; then
  # The sources plus everything the generator writes: the pages at the root,
  # the two-letter language folders, the sitemap. Not the videos in assets/.
  paths="$(git ls-tree --name-only "$tree" | grep -E '^(src|tool|sitemap\.xml|index\.html|schengen-calculator\.html|[a-z]{2})$' | tr '\n' ' ')"
  # shellcheck disable=SC2086
  git -c core.autocrlf=false archive --format=tar "$tree" $paths \
    | MSYS_NO_PATHCONV=1 docker run --rm -i --network none "$IMAGE" \
        sh -c 'mkdir -p /w && tar -xf - -C /w && cd /w && node tool/build_pages.cjs --check'
  st=("${PIPESTATUS[@]}")
  [ "${st[0]}" -ne 0 ] && { echo "build: packing the files failed (rc=${st[0]})" >&2; exit 1; }
  exit "${st[1]}"
fi

# The container prints only the archive of the result on stdout; the
# generator's own messages go to stderr.
git -c core.autocrlf=false archive --format=tar "$tree" src tool \
  | MSYS_NO_PATHCONV=1 docker run --rm -i --network none "$IMAGE" \
      sh -c 'mkdir -p /w /out && tar -xf - -C /w && cd /w && node tool/build_pages.cjs --out /out && tar -cf - -C /out .' \
  > "$tarball"
st=("${PIPESTATUS[@]}")
[ "${st[0]}" -ne 0 ] && { echo "build: packing the files failed (rc=${st[0]})" >&2; exit 1; }
if [ "${st[1]}" -ne 0 ]; then
  echo "build: the generator failed (rc=${st[1]}); nothing was written" >&2
  exit "${st[1]}"
fi
tar -xf "$tarball" -C . || { echo "build: unpacking the result failed" >&2; exit 1; }
echo "build: written $(tar -tf "$tarball" | grep -vc '/$') files" >&2
