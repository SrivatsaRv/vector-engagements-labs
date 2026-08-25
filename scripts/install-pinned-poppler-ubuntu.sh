#!/usr/bin/env bash

set -euo pipefail

readonly poppler_version="26.05.0"
readonly poppler_sha256="6fef27ff04f37db43054c86bcdff6128c9fb1f6af4ef3c8b369a7e9abd68d0bb"
readonly poppler_url="https://poppler.freedesktop.org/poppler-${poppler_version}.tar.xz"
readonly ubuntu_image="ubuntu:24.04@sha256:33ceb71981b602c1a7443a53469e4dba065f7503eab3078a2d7a57a2ab987517"
readonly image_tag="vector-poppler:${poppler_version}-ubuntu24-amd64"

if [[ "$(uname -s)" != "Linux" || "$(uname -m)" != "x86_64" ]]; then
  echo "the hosted Poppler bootstrap supports Linux x86_64 only" >&2
  exit 1
fi

if [[ -z "${RUNNER_TEMP:-}" || -z "${RUNNER_TOOL_CACHE:-}" || -z "${GITHUB_PATH:-}" || -z "${GITHUB_WORKSPACE:-}" ]]; then
  echo "RUNNER_TEMP, RUNNER_TOOL_CACHE, GITHUB_PATH, and GITHUB_WORKSPACE must be supplied by GitHub Actions" >&2
  exit 1
fi

readonly cache_root="${RUNNER_TOOL_CACHE}/vector-poppler-${poppler_version}-ubuntu24-amd64"
readonly image_archive="${cache_root}/image.tar"
readonly image_archive_digest="${cache_root}/image.tar.sha256"
readonly bin_dir="${cache_root}/bin"
mkdir -p "${cache_root}" "${bin_dir}"

if [[ -f "${image_archive}" && -f "${image_archive_digest}" ]]; then
  (cd "${cache_root}" && sha256sum --check --strict "$(basename "${image_archive_digest}")")
  docker load --input "${image_archive}" >/dev/null
else
  readonly build_root="${RUNNER_TEMP}/vector-poppler-build-${poppler_version}"
  readonly source_archive="${build_root}/poppler-${poppler_version}.tar.xz"
  mkdir -p "${build_root}"
  curl --proto '=https' --tlsv1.2 --fail --location --silent --show-error \
    "${poppler_url}" --output "${source_archive}"
  printf '%s  %s\n' "${poppler_sha256}" "${source_archive}" | sha256sum --check --strict -
  sed \
    -e "s|@@UBUNTU_IMAGE@@|${ubuntu_image}|" \
    -e "s|@@POPPLER_SHA256@@|${poppler_sha256}|" \
    "${GITHUB_WORKSPACE}/scripts/pinned-poppler-ubuntu.Dockerfile" > "${build_root}/Dockerfile"
  docker build --platform linux/amd64 --tag "${image_tag}" "${build_root}"
  docker save --output "${image_archive}" "${image_tag}"
  (cd "${cache_root}" && sha256sum "$(basename "${image_archive}")" > "$(basename "${image_archive_digest}")")
fi

sed \
  -e "s|@@IMAGE_TAG@@|${image_tag}|" \
  -e "s|@@GITHUB_WORKSPACE@@|${GITHUB_WORKSPACE}|" \
  "${GITHUB_WORKSPACE}/scripts/pinned-pdftoppm-wrapper.sh.in" > "${bin_dir}/pdftoppm"
chmod 0755 "${bin_dir}/pdftoppm"
"${bin_dir}/pdftoppm" -v 2>&1 | grep -F "pdftoppm version ${poppler_version}"
printf '%s\n' "${bin_dir}" >> "${GITHUB_PATH}"
