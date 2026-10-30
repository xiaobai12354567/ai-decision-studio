#!/usr/bin/env bash
set -euo pipefail

project=aiweb-review
project_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
env_file=.env.review
prepare_only=false
temporary_file=

usage() {
  printf 'Usage: bash scripts/review.sh [--prepare-only] [--env-file PATH]\n'
}

while (($#)); do
  case "$1" in
    --prepare-only) prepare_only=true; shift ;;
    --env-file)
      if (($# < 2)) || [[ -z "$2" ]]; then
        printf 'Error: --env-file requires a path.\n' >&2
        exit 2
      fi
      env_file=$2
      shift 2
      ;;
    -h|--help) usage; exit 0 ;;
    *) usage >&2; exit 2 ;;
  esac
done

cd -- "$project_dir"
compose=(docker compose -p "$project" --env-file "$env_file")

show_logs() {
  printf 'From the project directory, inspect logs with:\n' >&2
  printf '  docker compose -p %q --env-file %q logs --tail=100 app postgres\n' "$project" "$env_file" >&2
}

cleanup() {
  if [[ -n "$temporary_file" && -f "$temporary_file" ]]; then
    rm -f -- "$temporary_file"
  fi
}
trap cleanup EXIT

if ! "$prepare_only"; then
  if ! command -v docker >/dev/null 2>&1; then
    printf 'Error: Docker CLI is required. Install Docker Desktop or Docker Engine first.\n' >&2
    exit 1
  fi
  if ! docker compose version >/dev/null 2>&1; then
    printf 'Error: Docker Compose is required. Check docker compose version.\n' >&2
    exit 1
  fi
  if ! docker info >/dev/null 2>&1; then
    printf 'Error: Docker engine is unavailable. Start Docker Desktop or the Docker service, then retry.\n' >&2
    exit 1
  fi
fi

if [[ -e "$env_file" || -L "$env_file" ]]; then
  if [[ ! -f "$env_file" ]]; then
    printf 'Error: The environment path must be a regular file.\n' >&2
    exit 1
  fi
  printf 'Using existing %s without changes.\n' "$env_file"
else
  if [[ ! -d "$(dirname -- "$env_file")" ]]; then
    printf 'Error: The environment file parent directory does not exist.\n' >&2
    exit 1
  fi
  password=$(od -An -N24 -tx1 /dev/urandom | tr -d ' \n')
  if [[ ! "$password" =~ ^[0-9a-f]{48}$ ]]; then
    printf 'Error: Could not generate a database password.\n' >&2
    exit 1
  fi
  api_key=
  if [[ -t 0 && -t 1 ]]; then
    IFS= read -r -s -p 'DeepSeek API key (optional; Enter for manual editing only): ' api_key || api_key=
    printf '\n' >&2
  fi
  if [[ "$api_key" == *\\* ]]; then
    printf 'Error: The key prompt does not support backslashes. Prepare without a key and edit the environment file instead.\n' >&2
    exit 1
  fi
  escaped_key=${api_key//\'/\\\'}
  umask 077
  temporary_file=$(mktemp "$env_file.tmp.XXXXXX")
  while IFS= read -r line || [[ -n "$line" ]]; do
    line=${line%$'\r'}
    case "$line" in
      POSTGRES_PASSWORD=*) printf 'POSTGRES_PASSWORD=%s\n' "$password" ;;
      DEEPSEEK_API_KEY=*) printf "DEEPSEEK_API_KEY='%s'\n" "$escaped_key" ;;
      *) printf '%s\n' "$line" ;;
    esac
  done < .env.docker.example > "$temporary_file"
  # Linking a file in the same directory preserves any concurrently created config.
  if ! ln -- "$temporary_file" "$env_file"; then
    printf 'Error: Could not create the environment file. Existing files were preserved.\n' >&2
    exit 1
  fi
  unset password api_key escaped_key
  printf 'Created %s with a random database password.\n' "$env_file"
  printf 'AI generation needs a valid DeepSeek key; an empty key enables manual editing only.\n'
fi

if "$prepare_only"; then
  printf 'Configuration ready. No Docker services were started.\n'
  exit 0
fi

if "${compose[@]}" up -d --build --wait --wait-timeout 180; then
  if binding=$("${compose[@]}" port app 3000 2>/dev/null) && [[ "${binding##*:}" =~ ^[0-9]+$ ]]; then
    printf 'Ready: http://localhost:%s\n' "${binding##*:}"
  else
    printf 'Error: Services started, but the application port could not be determined.\n' >&2
    show_logs
    exit 1
  fi
else
  status=$?
  printf 'Error: Review startup failed.\n' >&2
  show_logs
  exit "$status"
fi
