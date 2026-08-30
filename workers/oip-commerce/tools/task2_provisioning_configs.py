#!/usr/bin/env python3
"""Generate and safely switch Task 2 Wrangler configs without secret material."""

from __future__ import annotations

import argparse
import json
import os
import re
import stat
import subprocess
import sys
from pathlib import Path
from typing import Any, BinaryIO, Callable, Mapping, Sequence


ACTION_ID = "PLATFORM-OIP-COMMERCE-INFRA-001-R3"
MARKER = "# OIP_TASK2_GENERATED_CONFIG_V1"
COMPATIBILITY_DATE = "2026-08-01"
CONSUMER_COMPATIBILITY_FLAGS = ("global_fetch_strictly_public",)
STAGING_DIRNAME = ".task2-provisioning"
PRIVATE_CONFIG_RELATIVE = Path("commerce-infrastructure") / ACTION_ID / "wrangler-configs"
ACTIVE_PAGES_NAME = "wrangler.toml"
ACTIVE_CONSUMER_NAME = "wrangler.consumer.toml"
ACTIVE_BOOTSTRAP_NAME = "wrangler.consumer.bootstrap.toml"
D1_ID_RE = re.compile(
    r"^(?:[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$"
)
TOML_KEY_RE = re.compile(r"^[A-Za-z0-9_.-]+$")
D1_BINDING_SCHEMA_VERSION = "1.0"
D1_BINDING_MAX_STDIN_BYTES = 1024
D1_BINDING_KEYS = frozenset(
    {"schema_version", "environment", "database_name", "database_id"}
)
SENSITIVE_FIELD_RE = re.compile(
    r"(?:secret|token|password|credential|api[_-]?key|access[_-]?key)",
    re.IGNORECASE,
)

SHARED_NONSECRET = (
    "SQUARE_API_BASE_URL",
    "SQUARE_API_VERSION",
    "DOWNLOAD_BASE_URL",
    "DOWNLOAD_EMAIL_FROM",
    "DOWNLOAD_EMAIL_REPLY_TO",
    "REQUIRE_EPUB_US_COUNTRY_PROOF",
    "EPUB_ENABLED_SKUS",
    "SQUARE_EPUB_CATALOG_VARIATION_IDS",
    "FL_SALES_TAX_RATE_ROOT_SHA256",
    "FL_SALES_TAX_RATE_VERSION",
    "POINTMATCH_DATASET_VERSION",
    "POINTMATCH_INDEX_ROOT_SHA256",
    "POINTMATCH_SCHEMA_VERSION",
    "POINTMATCH_SHARD_PREFIX",
    "USPS_ADDRESSES_API_BASE_URL",
    "USPS_ADDRESSES_API_VERSION",
    "USPS_OAUTH_TOKEN_URL",
    "US_ZIP_STATE_PROVIDER",
)
PAGES_ONLY_NONSECRET = (
    "PUBLIC_HOST",
    "ALLOWED_ORIGINS",
    "SQUARE_WEBHOOK_NOTIFICATION_URL",
    "SQUARE_REDIRECT_URL",
    "SQUARE_EPUB_REDIRECT_URL",
    "SUPPORT_CHECKOUT_ENABLED",
    "CUSTOM_MONTHLY_ENABLED",
    "PAPERBACK_ENABLED_SKUS",
    "SQUARE_PAPERBACK_CATALOG",
)
CONSUMER_ONLY_NONSECRET = (
    "SQUARE_INVENTORY_TRANSACTION_ID_KIND",
    "OPERATIONAL_ENVIRONMENT",
    "OPERATIONAL_HEALTHCHECK_URL",
    "OPERATIONAL_PRIMARY_QUEUE",
    "OPERATIONAL_DLQ_QUEUE",
    "OPERATIONAL_CANARY_STALE_SECONDS",
    "OPERATIONAL_FULFILLMENT_STALE_SECONDS",
    "OPERATIONAL_ALERT_REPEAT_SECONDS",
    "OPERATIONS_MONITORING_ENABLED",
)

FORBIDDEN_BINDINGS = frozenset(
    {
        "SQUARE_ACCESS_TOKEN",
        "SQUARE_LOCATION_ID",
        "SQUARE_MONTHLY_PLAN_VARIATION_ID",
        "SQUARE_WEBHOOK_SIGNATURE_KEY",
        "RESEND_API_KEY",
        "OPERATIONAL_ALERT_EMAIL",
        "EMAIL_HASH_PEPPER",
        "DOWNLOAD_TOKEN_SECRET",
        "RATE_LIMIT_SALT",
        "ADDRESS_LOOKUP_HMAC_SECRET",
        "CF_ACCESS_ISSUER",
        "CF_ACCESS_AUD",
        "ADMIN_EMAILS",
        "USPS_API_CLIENT_ID",
        "USPS_API_CLIENT_SECRET",
    }
)

EXPECTED_RESOURCES = {
    "SANDBOX": {
        "pages_project": "oip-commerce-sandbox",
        "consumer_worker": "oip-commerce-consumer-sandbox",
        "d1_database": "oip-commerce-sandbox",
        "epub_r2_bucket": "oip-private-epubs-sandbox",
        "jurisdiction_r2_bucket": "oip-private-jurisdiction-sandbox",
        "event_queue": "oip-commerce-events-sandbox",
        "dead_letter_queue": "oip-commerce-events-sandbox-dlq",
    },
    "PRODUCTION": {
        "pages_project": "oip-commerce",
        "consumer_worker": "oip-commerce-consumer",
        "d1_database": "oip-commerce",
        "epub_r2_bucket": "oip-private-epubs",
        "jurisdiction_r2_bucket": "oip-private-jurisdiction",
        "event_queue": "oip-commerce-events",
        "dead_letter_queue": "oip-commerce-events-dlq",
    },
}

EXPECTED_FIXED = {
    "SANDBOX": {
        "ALLOWED_ORIGINS": "https://oip-commerce-sandbox.pages.dev",
        "DOWNLOAD_BASE_URL": "https://oip-commerce-sandbox.pages.dev",
        "DOWNLOAD_EMAIL_FROM": "Outside In Print <downloads@outsideinprint.org>",
        "DOWNLOAD_EMAIL_REPLY_TO": "support@outsideinprint.org",
        "FL_SALES_TAX_RATE_ROOT_SHA256": "",
        "FL_SALES_TAX_RATE_VERSION": "",
        "POINTMATCH_DATASET_VERSION": "",
        "POINTMATCH_INDEX_ROOT_SHA256": "",
        "POINTMATCH_SCHEMA_VERSION": "",
        "POINTMATCH_SHARD_PREFIX": "pointmatch",
        "PUBLIC_HOST": "oip-commerce-sandbox.pages.dev",
        "REQUIRE_EPUB_US_COUNTRY_PROOF": "true",
        "SQUARE_API_BASE_URL": "https://connect.squareupsandbox.com",
        "SQUARE_API_VERSION": "2026-07-15",
        "SQUARE_EPUB_REDIRECT_URL": "https://oip-commerce-sandbox.pages.dev/health",
        "SQUARE_REDIRECT_URL": "https://oip-commerce-sandbox.pages.dev/health",
        "SQUARE_WEBHOOK_NOTIFICATION_URL": "https://oip-commerce-sandbox.pages.dev/api/square/webhook",
        "USPS_ADDRESSES_API_BASE_URL": "",
        "USPS_ADDRESSES_API_VERSION": "",
        "USPS_OAUTH_TOKEN_URL": "",
        "US_ZIP_STATE_PROVIDER": "",
    },
    "PRODUCTION": {
        "ALLOWED_ORIGINS": "https://outsideinprint.org",
        "DOWNLOAD_BASE_URL": "https://downloads.outsideinprint.org",
        "DOWNLOAD_EMAIL_FROM": "Outside In Print <downloads@outsideinprint.org>",
        "DOWNLOAD_EMAIL_REPLY_TO": "support@outsideinprint.org",
        "FL_SALES_TAX_RATE_ROOT_SHA256": "",
        "FL_SALES_TAX_RATE_VERSION": "",
        "POINTMATCH_DATASET_VERSION": "",
        "POINTMATCH_INDEX_ROOT_SHA256": "",
        "POINTMATCH_SCHEMA_VERSION": "",
        "POINTMATCH_SHARD_PREFIX": "pointmatch",
        "PUBLIC_HOST": "downloads.outsideinprint.org",
        "REQUIRE_EPUB_US_COUNTRY_PROOF": "true",
        "SQUARE_API_BASE_URL": "https://connect.squareup.com",
        "SQUARE_API_VERSION": "2026-07-15",
        "SQUARE_EPUB_REDIRECT_URL": "https://outsideinprint.org/shop/",
        "SQUARE_REDIRECT_URL": "https://outsideinprint.org/support/thanks/",
        "SQUARE_WEBHOOK_NOTIFICATION_URL": "https://downloads.outsideinprint.org/api/square/webhook",
        "USPS_ADDRESSES_API_BASE_URL": "",
        "USPS_ADDRESSES_API_VERSION": "",
        "USPS_OAUTH_TOKEN_URL": "",
        "US_ZIP_STATE_PROVIDER": "",
    },
}

EXPECTED_CLOSED = {
    "CUSTOM_MONTHLY_ENABLED": "false",
    "EPUB_ENABLED_SKUS": "",
    "PAPERBACK_ENABLED_SKUS": "",
    "SQUARE_EPUB_CATALOG_VARIATION_IDS": "{}",
    "SQUARE_INVENTORY_TRANSACTION_ID_KIND": "",
    "SQUARE_PAPERBACK_CATALOG": "{}",
    "SUPPORT_CHECKOUT_ENABLED": "false",
}


def expected_consumer_nonsecret(environment: str) -> dict[str, str]:
    resources = EXPECTED_RESOURCES[environment]
    healthcheck_url = (
        "https://oip-commerce-sandbox.pages.dev/health"
        if environment == "SANDBOX"
        else "https://downloads.outsideinprint.org/health"
    )
    return {
        "OPERATIONAL_ALERT_REPEAT_SECONDS": "21600",
        "OPERATIONAL_CANARY_STALE_SECONDS": "600",
        "OPERATIONAL_DLQ_QUEUE": resources["dead_letter_queue"],
        "OPERATIONAL_ENVIRONMENT": environment,
        "OPERATIONAL_FULFILLMENT_STALE_SECONDS": "900",
        "OPERATIONAL_HEALTHCHECK_URL": healthcheck_url,
        "OPERATIONAL_PRIMARY_QUEUE": resources["event_queue"],
        "OPERATIONS_MONITORING_ENABLED": "true",
        "SQUARE_INVENTORY_TRANSACTION_ID_KIND": "",
    }


def expected_monitoring_controls(environment: str) -> dict[str, Any]:
    values = expected_consumer_nonsecret(environment)
    return {
        "alert_repeat_seconds": 21600,
        "alert_target_binding": "OPERATIONAL_ALERT_EMAIL",
        "bootstrap_enabled": False,
        "canary_producer_binding": "OPERATIONAL_CANARY_QUEUE",
        "canary_stale_seconds": 600,
        "dead_letter_queue": EXPECTED_RESOURCES[environment]["dead_letter_queue"],
        "environment": environment,
        "final_enabled": True,
        "fulfillment_stale_seconds": 900,
        "healthcheck_url": values["OPERATIONAL_HEALTHCHECK_URL"],
        "primary_queue": EXPECTED_RESOURCES[environment]["event_queue"],
        "workers_logs_enabled": True,
        "workers_logs_head_sampling_rate": 1,
    }


def expected_queue_controls(environment: str) -> dict[str, Any]:
    resources = EXPECTED_RESOURCES[environment]
    primary = {
        "dead_letter_queue": resources["dead_letter_queue"],
        "max_batch_size": 1,
        "max_batch_timeout": 1,
        "max_concurrency": 1,
        "max_retries": 10,
        "queue": resources["event_queue"],
    }
    return {
        "consumer_canary_producer_binding": {
            "binding_name": "OPERATIONAL_CANARY_QUEUE",
            "queue": resources["event_queue"],
        },
        "dead_letter_consumer": {
            "dead_letter_queue": None,
            "max_batch_size": 1,
            "max_batch_timeout": 1,
            "max_concurrency": 1,
            "max_retries": 10,
            "queue": resources["dead_letter_queue"],
        },
        "delivery_delay_seconds": 0,
        "max_batch_size": 1,
        "max_batch_timeout": 1,
        "max_concurrency": 1,
        "max_retries": 10,
        "message_retention_seconds": 86400,
        "pages_producer_binding": {
            "binding_name": "WEBHOOK_QUEUE",
            "queue": resources["event_queue"],
        },
        "primary_consumer": primary,
        "scheduled_trigger": "*/5 * * * *",
    }


class ConfigError(RuntimeError):
    pass


class SafeArgumentParser(argparse.ArgumentParser):
    """Fail with a fixed code so rejected stdin material is never reflected."""

    def error(self, message: str) -> None:
        del message
        fail("ARGUMENTS_INVALID")


def fail(code: str) -> None:
    raise ConfigError(code)


def _absolute_without_resolving(path: Path) -> Path:
    return Path(os.path.abspath(os.fspath(path)))


def _is_within(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
    except ValueError:
        return False
    return True


def assert_no_reparse_points(path: Path) -> None:
    """Reject symlinks and Windows junctions in every existing path component."""

    absolute = _absolute_without_resolving(path)
    current = Path(absolute.anchor)
    for part in absolute.parts[1:]:
        current /= part
        try:
            metadata = os.lstat(current)
        except FileNotFoundError:
            break
        except OSError:
            fail("PRIVATE_PATH_INSPECTION_FAILED")
        attributes = getattr(metadata, "st_file_attributes", 0)
        reparse_flag = getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0)
        if stat.S_ISLNK(metadata.st_mode) or (attributes & reparse_flag):
            fail("PRIVATE_PATH_REPARSE_POINT")


def _git_root_containing(path: Path) -> Path | None:
    current = path if path.is_dir() else path.parent
    for candidate in (current, *current.parents):
        if (candidate / ".git").exists():
            return candidate.resolve()
    return None


def validate_private_storage(
    project_dir: Path,
    private_root: Path,
    *,
    config_path: Path | None = None,
) -> Path:
    assert_no_reparse_points(private_root)
    try:
        canonical_private = private_root.resolve(strict=True)
        canonical_project = project_dir.resolve(strict=True)
    except OSError:
        fail("PRIVATE_ROOT_UNAVAILABLE")
    if not canonical_private.is_dir():
        fail("PRIVATE_ROOT_UNAVAILABLE")
    if _git_root_containing(canonical_private) is not None:
        fail("PRIVATE_ROOT_GIT_CONTAINMENT_INVALID")
    protected_roots = {canonical_project}
    project_git_root = _git_root_containing(canonical_project)
    if project_git_root is not None:
        protected_roots.add(project_git_root)
    if config_path is not None:
        config_git_root = _git_root_containing(config_path.resolve())
        if config_git_root is not None:
            protected_roots.add(config_git_root)
    for protected_root in protected_roots:
        if _is_within(canonical_private, protected_root) or _is_within(
            protected_root, canonical_private
        ):
            fail("PRIVATE_ROOT_GIT_CONTAINMENT_INVALID")
    return canonical_private


def assert_private_target(private_root: Path, target: Path) -> None:
    assert_no_reparse_points(private_root)
    assert_no_reparse_points(target.parent)
    try:
        canonical_root = private_root.resolve(strict=True)
        canonical_target = target.resolve(strict=False)
    except OSError:
        fail("PRIVATE_PATH_INSPECTION_FAILED")
    if not _is_within(canonical_target, canonical_root):
        fail("PRIVATE_PATH_OUTSIDE_ROOT")


def atomic_write(
    path: Path,
    text: str,
    *,
    containment_root: Path | None = None,
) -> None:
    if containment_root is not None:
        assert_private_target(containment_root, path)
    path.parent.mkdir(parents=True, exist_ok=True)
    if containment_root is not None:
        assert_private_target(containment_root, path)
    temporary = path.with_name(f".{path.name}.tmp")
    if temporary.exists():
        temporary.unlink()
    try:
        with temporary.open("x", encoding="utf-8", newline="\n") as handle:
            handle.write(text)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    finally:
        if temporary.exists():
            temporary.unlink()


def transactional_update(
    changes: Mapping[Path, str | None],
    *,
    containment_root: Path | None = None,
    containment_roots: Mapping[Path, Path] | None = None,
    validate_after: Callable[[], None] | None = None,
) -> None:
    if containment_root is not None and containment_roots is not None:
        fail("CONFIG_TRANSACTION_CONTAINMENT_INVALID")
    if containment_roots is not None and set(containment_roots) != set(changes):
        fail("CONFIG_TRANSACTION_CONTAINMENT_INVALID")

    def root_for(path: Path) -> Path | None:
        if containment_roots is not None:
            return containment_roots[path]
        return containment_root

    snapshots: dict[Path, bytes | None] = {}
    for path in changes:
        root = root_for(path)
        if root is not None:
            assert_private_target(root, path)
        try:
            snapshots[path] = path.read_bytes() if path.exists() else None
        except OSError:
            fail("CONFIG_TRANSACTION_SNAPSHOT_FAILED")

    applied: list[Path] = []
    try:
        for path, content in changes.items():
            if content is None:
                path.unlink(missing_ok=True)
            else:
                atomic_write(path, content, containment_root=root_for(path))
            applied.append(path)
        if validate_after is not None:
            validate_after()
    except (ConfigError, OSError) as original_error:
        try:
            for path in reversed(applied):
                snapshot = snapshots[path]
                if snapshot is None:
                    path.unlink(missing_ok=True)
                else:
                    atomic_write(
                        path,
                        snapshot.decode("utf-8"),
                        containment_root=root_for(path),
                    )
        except (OSError, UnicodeError, ConfigError):
            fail("CONFIG_TRANSACTION_ROLLBACK_FAILED")
        if isinstance(original_error, ConfigError):
            raise
        fail("CONFIG_TRANSACTION_FAILED")


def json_string(value: str) -> str:
    return json.dumps(value, ensure_ascii=False)


def project_dir_from_script() -> Path:
    return Path(__file__).resolve().parents[1]


def load_maps(map_root: Path) -> dict[str, dict[str, Any]]:
    paths = {
        "SANDBOX": map_root / "sandbox-resource-map-v1.json",
        "PRODUCTION": map_root / "production-resource-map-v1.json",
    }
    maps: dict[str, dict[str, Any]] = {}
    for environment, path in paths.items():
        try:
            value = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, UnicodeError, json.JSONDecodeError):
            fail("RESOURCE_MAP_READ_FAILED")
        if not isinstance(value, dict):
            fail("RESOURCE_MAP_INVALID")
        if value.get("action_id") != ACTION_ID or value.get("environment") != environment:
            fail("RESOURCE_MAP_IDENTITY_INVALID")
        if value.get("resources") != EXPECTED_RESOURCES[environment]:
            fail("RESOURCE_MAP_NAMES_INVALID")
        if value.get("fixed_nonsecret_values") != EXPECTED_FIXED[environment]:
            fail("RESOURCE_MAP_NONSECRET_VALUES_INVALID")
        if value.get("closed_gate_values") != EXPECTED_CLOSED:
            fail("RESOURCE_MAP_CLOSED_GATES_INVALID")
        if value.get("consumer_nonsecret_values") != expected_consumer_nonsecret(environment):
            fail("RESOURCE_MAP_CONSUMER_NONSECRET_VALUES_INVALID")
        if value.get("monitoring_controls") != expected_monitoring_controls(environment):
            fail("RESOURCE_MAP_MONITORING_CONTROLS_INVALID")
        if value.get("queue_controls") != expected_queue_controls(environment):
            fail("RESOURCE_MAP_QUEUE_CONTROLS_INVALID")
        maps[environment] = value
    return maps


def environment_dir(private_root: Path, environment: str) -> Path:
    return private_root / PRIVATE_CONFIG_RELATIVE / environment.casefold()


def stored_path(private_root: Path, environment: str, role: str) -> Path:
    filename = ACTIVE_PAGES_NAME if role == "pages" else ACTIVE_CONSUMER_NAME
    return environment_dir(private_root, environment) / filename


def bootstrap_path(private_root: Path, environment: str) -> Path:
    return environment_dir(private_root, environment) / ACTIVE_BOOTSTRAP_NAME


def active_path(project_dir: Path, role: str) -> Path:
    filename = ACTIVE_PAGES_NAME if role == "pages" else ACTIVE_CONSUMER_NAME
    return project_dir / filename


def variables_for(
    resource_map: Mapping[str, Any],
    role: str,
    *,
    monitoring_enabled: bool = False,
) -> dict[str, str]:
    all_values = {
        **resource_map["fixed_nonsecret_values"],
        **resource_map["closed_gate_values"],
    }
    try:
        if role == "pages":
            names = (*SHARED_NONSECRET, *PAGES_ONLY_NONSECRET)
            return {name: all_values[name] for name in names}
        if role == "consumer":
            consumer_values = dict(resource_map["consumer_nonsecret_values"])
            consumer_values["OPERATIONS_MONITORING_ENABLED"] = (
                "true" if monitoring_enabled else "false"
            )
            return {
                **{name: all_values[name] for name in SHARED_NONSECRET},
                **{name: consumer_values[name] for name in CONSUMER_ONLY_NONSECRET},
            }
        fail("ROLE_INVALID")
    except KeyError:
        fail("RESOURCE_MAP_BINDING_CONTRACT_INVALID")


def render_config(
    project_dir: Path,
    resource_map: Mapping[str, Any],
    role: str,
    d1_database_id: str | None = None,
    *,
    monitoring_enabled: bool = False,
) -> str:
    environment = str(resource_map["environment"])
    resources = resource_map["resources"]
    lines = [MARKER, f"# Task 2 environment: {environment}"]
    if role == "pages":
        lines.extend(
            [
                f'name = {json_string(resources["pages_project"])}',
                f'compatibility_date = {json_string(COMPATIBILITY_DATE)}',
                'pages_build_output_dir = "public"',
            ]
        )
    elif role == "consumer":
        lines.extend(
            [
                f'name = {json_string(resources["consumer_worker"])}',
                'main = "consumer/index.js"',
                f'compatibility_date = {json_string(COMPATIBILITY_DATE)}',
                f"compatibility_flags = {json.dumps(CONSUMER_COMPATIBILITY_FLAGS)}",
                "workers_dev = false",
                "preview_urls = false",
            ]
        )
    else:
        fail("ROLE_INVALID")

    if role == "consumer":
        lines.extend(
            [
                "",
                "[observability]",
                "enabled = true",
                "head_sampling_rate = 1",
            ]
        )

    lines.extend(["", "[vars]"])
    for name, value in variables_for(
        resource_map,
        role,
        monitoring_enabled=monitoring_enabled,
    ).items():
        lines.append(f"{name} = {json_string(value)}")

    if role == "consumer":
        lines.extend(["", "[triggers]", 'crons = ["*/5 * * * *"]'])

    if d1_database_id is not None:
        if not D1_ID_RE.fullmatch(d1_database_id):
            fail("D1_DATABASE_ID_INVALID")
        lines.extend(
            [
                "",
                "[[d1_databases]]",
                'binding = "DB"',
                f'database_name = {json_string(resources["d1_database"])}',
                f"database_id = {json_string(d1_database_id)}",
                f'migrations_dir = {json_string((project_dir / "migrations").resolve().as_posix())}',
            ]
        )

    lines.extend(
        [
            "",
            "[[r2_buckets]]",
            'binding = "EPUB_BUCKET"',
            f'bucket_name = {json_string(resources["epub_r2_bucket"])}',
            "",
            "[[r2_buckets]]",
            'binding = "JURISDICTION_BUCKET"',
            f'bucket_name = {json_string(resources["jurisdiction_r2_bucket"])}',
        ]
    )
    if role == "pages":
        lines.extend(
            [
                "",
                "[[queues.producers]]",
                'binding = "WEBHOOK_QUEUE"',
                f'queue = {json_string(resources["event_queue"])}',
            ]
        )
    else:
        lines.extend(
            [
                "",
                "[[queues.producers]]",
                'binding = "OPERATIONAL_CANARY_QUEUE"',
                f'queue = {json_string(resources["event_queue"])}',
                "",
                "[[queues.consumers]]",
                f'queue = {json_string(resources["event_queue"])}',
                "max_batch_size = 1",
                "max_batch_timeout = 1",
                "max_retries = 10",
                f'dead_letter_queue = {json_string(resources["dead_letter_queue"])}',
                "max_concurrency = 1",
                "",
                "[[queues.consumers]]",
                f'queue = {json_string(resources["dead_letter_queue"])}',
                "max_batch_size = 1",
                "max_batch_timeout = 1",
                "max_retries = 10",
                "max_concurrency = 1",
            ]
        )
    return "\n".join(lines) + "\n"


def render_bootstrap(resource_map: Mapping[str, Any]) -> str:
    resources = resource_map["resources"]
    return "\n".join(
        [
            MARKER,
            f'# Task 2 environment: {resource_map["environment"]}',
            "# Unbound Worker shell only; replace with the final consumer config after migrations.",
            f'name = {json_string(resources["consumer_worker"])}',
            'main = "consumer/index.js"',
            f'compatibility_date = {json_string(COMPATIBILITY_DATE)}',
            f"compatibility_flags = {json.dumps(CONSUMER_COMPATIBILITY_FLAGS)}",
            "workers_dev = false",
            "preview_urls = false",
            "",
        ]
    )


def r3_config_without_consumer_public_fetch(source: str) -> str:
    flag_line = (
        f"compatibility_flags = {json.dumps(CONSUMER_COMPATIBILITY_FLAGS)}\n"
    )
    if source.count(flag_line) != 1:
        fail("R4_UPGRADE_RENDER_CONTRACT_INVALID")
    return source.replace(flag_line, "", 1)


def parse_toml(source: str) -> dict[str, Any]:
    """Parse only the deterministic scalar/table subset emitted by this tool."""

    result: dict[str, Any] = {}
    current: dict[str, Any] = result
    for raw_line in source.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("[[") and line.endswith("]]" ):
            path = line[2:-2].strip().split(".")
            if not path or any(not TOML_KEY_RE.fullmatch(item) for item in path):
                fail("CONFIG_PARSE_FAILED")
            parent = result
            for item in path[:-1]:
                child = parent.setdefault(item, {})
                if not isinstance(child, dict):
                    fail("CONFIG_PARSE_FAILED")
                parent = child
            records = parent.setdefault(path[-1], [])
            if not isinstance(records, list):
                fail("CONFIG_PARSE_FAILED")
            record: dict[str, Any] = {}
            records.append(record)
            current = record
            continue
        if line.startswith("[") and line.endswith("]"):
            path = line[1:-1].strip().split(".")
            if not path or any(not TOML_KEY_RE.fullmatch(item) for item in path):
                fail("CONFIG_PARSE_FAILED")
            current = result
            for item in path:
                child = current.setdefault(item, {})
                if not isinstance(child, dict):
                    fail("CONFIG_PARSE_FAILED")
                current = child
            continue
        if "=" not in line:
            fail("CONFIG_PARSE_FAILED")
        key, encoded = (part.strip() for part in line.split("=", 1))
        if not TOML_KEY_RE.fullmatch(key) or key in current:
            fail("CONFIG_PARSE_FAILED")
        try:
            if encoded.startswith('"') or encoded.startswith("["):
                value = json.loads(encoded)
            elif re.fullmatch(r"-?[0-9]+", encoded):
                value = int(encoded)
            elif encoded in {"true", "false"}:
                value = encoded == "true"
            else:
                fail("CONFIG_PARSE_FAILED")
        except (ValueError, json.JSONDecodeError):
            fail("CONFIG_PARSE_FAILED")
        current[key] = value
    return result


def read_toml(path: Path) -> tuple[str, dict[str, Any]]:
    try:
        raw = path.read_text(encoding="utf-8")
        value = parse_toml(raw)
    except (OSError, UnicodeError):
        fail("CONFIG_READ_FAILED")
    if not isinstance(value, dict):
        fail("CONFIG_INVALID")
    return raw, value


def assert_no_forbidden(raw: str) -> None:
    if any(name in raw for name in FORBIDDEN_BINDINGS):
        fail("PROTECTED_OR_RESERVED_BINDING_PRESENT")


def read_d1_binding_stdin(stream: BinaryIO) -> dict[str, Any]:
    """Read one small, strict JSON binding document without echoing its contents."""

    try:
        raw = stream.read(D1_BINDING_MAX_STDIN_BYTES + 1)
    except OSError:
        fail("D1_BINDING_STDIN_READ_FAILED")
    if not isinstance(raw, bytes):
        fail("D1_BINDING_STDIN_BINARY_REQUIRED")
    if not raw:
        fail("D1_BINDING_STDIN_EMPTY")
    if len(raw) > D1_BINDING_MAX_STDIN_BYTES:
        fail("D1_BINDING_STDIN_TOO_LARGE")
    try:
        source = raw.decode("utf-8", errors="strict")
    except UnicodeDecodeError:
        fail("D1_BINDING_STDIN_ENCODING_INVALID")
    if source.startswith("\ufeff") or "\x00" in source:
        fail("D1_BINDING_STDIN_ENCODING_INVALID")

    def strict_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
        result: dict[str, Any] = {}
        for key, value in pairs:
            if key in result:
                fail("D1_BINDING_JSON_DUPLICATE_KEY")
            result[key] = value
        return result

    def reject_constant(_: str) -> None:
        fail("D1_BINDING_JSON_INVALID")

    try:
        value = json.loads(
            source,
            object_pairs_hook=strict_object,
            parse_constant=reject_constant,
        )
    except (json.JSONDecodeError, RecursionError):
        fail("D1_BINDING_JSON_INVALID")
    if not isinstance(value, dict):
        fail("D1_BINDING_JSON_INVALID")
    return value


def validate_d1_binding_document(
    value: Mapping[str, Any],
    environment: str,
) -> str:
    keys = set(value)
    unexpected = keys - D1_BINDING_KEYS
    if any(
        not isinstance(key, str)
        or key in FORBIDDEN_BINDINGS
        or SENSITIVE_FIELD_RE.search(key)
        for key in unexpected
    ):
        fail("D1_BINDING_SECRET_MATERIAL_REJECTED")
    if keys != D1_BINDING_KEYS:
        fail("D1_BINDING_KEYS_INVALID")
    if any(not isinstance(value[key], str) for key in D1_BINDING_KEYS):
        fail("D1_BINDING_VALUE_TYPE_INVALID")
    if value["schema_version"] != D1_BINDING_SCHEMA_VERSION:
        fail("D1_BINDING_SCHEMA_VERSION_INVALID")
    if value["environment"] != environment:
        fail("D1_BINDING_ENVIRONMENT_MISMATCH")
    if value["database_name"] != EXPECTED_RESOURCES[environment]["d1_database"]:
        fail("D1_BINDING_DATABASE_NAME_MISMATCH")
    database_id = value["database_id"]
    if not D1_ID_RE.fullmatch(database_id):
        fail("D1_DATABASE_ID_INVALID")
    return database_id


def d1_id_from_config(
    value: Mapping[str, Any],
    environment: str,
    *,
    expected_migrations_dir: str,
    allow_missing_migrations_dir: bool = False,
) -> str | None:
    records = value.get("d1_databases")
    if records is None:
        return None
    if not isinstance(records, list) or len(records) != 1:
        fail("D1_BINDING_INVALID")
    record = records[0]
    if not isinstance(record, dict):
        fail("D1_BINDING_INVALID")
    expected = {
        "binding": "DB",
        "database_name": EXPECTED_RESOURCES[environment]["d1_database"],
        "database_id": record.get("database_id"),
    }
    if "migrations_dir" in record:
        expected["migrations_dir"] = expected_migrations_dir
    elif not allow_missing_migrations_dir:
        fail("D1_BINDING_INVALID")
    if record != expected or not isinstance(record.get("database_id"), str):
        fail("D1_BINDING_INVALID")
    database_id = record["database_id"]
    if not D1_ID_RE.fullmatch(database_id):
        fail("D1_DATABASE_ID_INVALID")
    return database_id


def expected_data(
    project_dir: Path,
    resource_map: Mapping[str, Any],
    role: str,
    d1_database_id: str | None,
    *,
    monitoring_enabled: bool = False,
) -> dict[str, Any]:
    resources = resource_map["resources"]
    if role == "pages":
        result: dict[str, Any] = {
            "name": resources["pages_project"],
            "compatibility_date": COMPATIBILITY_DATE,
            "pages_build_output_dir": "public",
            "vars": variables_for(resource_map, role),
        }
    else:
        result = {
            "name": resources["consumer_worker"],
            "main": "consumer/index.js",
            "compatibility_date": COMPATIBILITY_DATE,
            "compatibility_flags": list(CONSUMER_COMPATIBILITY_FLAGS),
            "workers_dev": False,
            "preview_urls": False,
            "observability": {
                "enabled": True,
                "head_sampling_rate": 1,
            },
            "vars": variables_for(
                resource_map,
                role,
                monitoring_enabled=monitoring_enabled,
            ),
            "triggers": {"crons": ["*/5 * * * *"]},
        }
    if d1_database_id is not None:
        result["d1_databases"] = [
            {
                "binding": "DB",
                "database_name": resources["d1_database"],
                "database_id": d1_database_id,
                "migrations_dir": (project_dir / "migrations").resolve().as_posix(),
            }
        ]
    result["r2_buckets"] = [
        {"binding": "EPUB_BUCKET", "bucket_name": resources["epub_r2_bucket"]},
        {
            "binding": "JURISDICTION_BUCKET",
            "bucket_name": resources["jurisdiction_r2_bucket"],
        },
    ]
    if role == "pages":
        result["queues"] = {
            "producers": [
                {"binding": "WEBHOOK_QUEUE", "queue": resources["event_queue"]}
            ]
        }
    else:
        result["queues"] = {
            "producers": [
                {
                    "binding": "OPERATIONAL_CANARY_QUEUE",
                    "queue": resources["event_queue"],
                }
            ],
            "consumers": [
                {
                    "queue": resources["event_queue"],
                    "max_batch_size": 1,
                    "max_batch_timeout": 1,
                    "max_retries": 10,
                    "dead_letter_queue": resources["dead_letter_queue"],
                    "max_concurrency": 1,
                },
                {
                    "queue": resources["dead_letter_queue"],
                    "max_batch_size": 1,
                    "max_batch_timeout": 1,
                    "max_retries": 10,
                    "max_concurrency": 1,
                },
            ]
        }
    return result


def validate_one(
    project_dir: Path,
    path: Path,
    resource_map: Mapping[str, Any],
    role: str,
    *,
    require_d1: bool,
    require_marker: bool = True,
    required_monitoring_enabled: bool | None = None,
) -> str | None:
    raw, value = read_toml(path)
    assert_no_forbidden(raw)
    if require_marker and not raw.startswith(MARKER + "\n"):
        fail("GENERATED_MARKER_MISSING")
    environment = str(resource_map["environment"])
    database_id = d1_id_from_config(
        value,
        environment,
        expected_migrations_dir=(project_dir / "migrations").resolve().as_posix(),
    )
    if require_d1 and database_id is None:
        fail("D1_BINDING_NOT_READY")
    monitoring_enabled = False
    if role == "consumer":
        encoded = value.get("vars", {}).get("OPERATIONS_MONITORING_ENABLED")
        if encoded not in {"false", "true"}:
            fail("MONITORING_STATE_INVALID")
        monitoring_enabled = encoded == "true"
        if (
            required_monitoring_enabled is not None
            and monitoring_enabled is not required_monitoring_enabled
        ):
            fail("MONITORING_STATE_INVALID")
    if value != expected_data(
        project_dir,
        resource_map,
        role,
        database_id,
        monitoring_enabled=monitoring_enabled,
    ):
        fail("CONFIG_CONTRACT_INVALID")
    return database_id


def validate_ignore(project_dir: Path) -> None:
    try:
        lines = {
            line.strip()
            for line in (project_dir / ".gitignore").read_text(encoding="utf-8").splitlines()
        }
    except (OSError, UnicodeError):
        fail("GITIGNORE_READ_FAILED")
    required = {
        STAGING_DIRNAME + "/",
        ACTIVE_PAGES_NAME,
        ACTIVE_CONSUMER_NAME,
        ACTIVE_BOOTSTRAP_NAME,
    }
    if not required.issubset(lines):
        fail("GITIGNORE_CONTRACT_INVALID")

    try:
        repository_check = subprocess.run(
            ["git", "rev-parse", "--is-inside-work-tree"],
            cwd=project_dir,
            check=False,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
        )
    except OSError:
        fail("GIT_GUARD_UNAVAILABLE")
    if repository_check.returncode != 0 or repository_check.stdout.strip() != "true":
        fail("GIT_GUARD_NOT_A_REPOSITORY")

    guarded_paths = (
        ACTIVE_PAGES_NAME,
        ACTIVE_CONSUMER_NAME,
        ACTIVE_BOOTSTRAP_NAME,
        f"{STAGING_DIRNAME}/guard-probe",
    )
    try:
        for relative_path in guarded_paths:
            tracked = subprocess.run(
                ["git", "ls-files", "--error-unmatch", "--", relative_path],
                cwd=project_dir,
                check=False,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            if tracked.returncode == 0:
                fail("GIT_GUARD_PATH_TRACKED")
            if tracked.returncode not in {0, 1}:
                fail("GIT_GUARD_FAILED")
            ignored = subprocess.run(
                [
                    "git",
                    "check-ignore",
                    "--quiet",
                    "--no-index",
                    "--",
                    relative_path,
                ],
                cwd=project_dir,
                check=False,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            if ignored.returncode == 1:
                fail("GIT_GUARD_PATH_NOT_IGNORED")
            if ignored.returncode != 0:
                fail("GIT_GUARD_FAILED")
    except OSError:
        fail("GIT_GUARD_UNAVAILABLE")


def generate(
    project_dir: Path,
    private_root: Path,
    maps: Mapping[str, Mapping[str, Any]],
) -> None:
    private_root = validate_private_storage(project_dir, private_root)
    validate_ignore(project_dir)
    for environment in ("SANDBOX", "PRODUCTION"):
        for role in ("pages", "consumer"):
            path = stored_path(private_root, environment, role)
            if path.exists():
                raw, value = read_toml(path)
                assert_no_forbidden(raw)
                if not raw.startswith(MARKER + "\n"):
                    fail("GENERATED_MARKER_MISSING")
                if "d1_databases" in value:
                    validate_one(
                        project_dir, path, maps[environment], role, require_d1=True
                    )
                else:
                    atomic_write(
                        path,
                        render_config(project_dir, maps[environment], role),
                        containment_root=private_root,
                    )
                    validate_one(
                        project_dir, path, maps[environment], role, require_d1=False
                    )
            else:
                atomic_write(
                    path,
                    render_config(project_dir, maps[environment], role),
                    containment_root=private_root,
                )
                validate_one(
                    project_dir, path, maps[environment], role, require_d1=False
                )
        bootstrap = bootstrap_path(private_root, environment)
        content = render_bootstrap(maps[environment])
        if bootstrap.exists():
            raw, value = read_toml(bootstrap)
            assert_no_forbidden(raw)
            if not raw.startswith(MARKER + "\n"):
                fail("BOOTSTRAP_CONFIG_INVALID")
            atomic_write(bootstrap, content, containment_root=private_root)
        else:
            atomic_write(bootstrap, content, containment_root=private_root)


def configured_monitoring_enabled(value: Mapping[str, Any]) -> bool:
    encoded = value.get("vars", {}).get("OPERATIONS_MONITORING_ENABLED")
    if encoded not in {"false", "true"}:
        fail("MONITORING_STATE_INVALID")
    return encoded == "true"


def validate_active_contract(
    project_dir: Path,
    path: Path,
    maps: Mapping[str, Mapping[str, Any]],
    role: str,
) -> tuple[str, str | None]:
    raw, value = read_toml(path)
    assert_no_forbidden(raw)
    if not raw.startswith(MARKER + "\n"):
        fail("ACTIVE_CONFIG_NOT_OWNED")
    resource_key = "pages_project" if role == "pages" else "consumer_worker"
    matches = [
        environment
        for environment in ("SANDBOX", "PRODUCTION")
        if value.get("name") == EXPECTED_RESOURCES[environment][resource_key]
    ]
    if len(matches) != 1:
        fail("ACTIVE_CONFIG_CONTRACT_INVALID")
    environment = matches[0]
    database_id = validate_one(
        project_dir,
        path,
        maps[environment],
        role,
        require_d1=True,
    )
    return environment, database_id


def validate_active_bootstrap(
    path: Path,
    maps: Mapping[str, Mapping[str, Any]],
) -> str:
    raw, value = read_toml(path)
    assert_no_forbidden(raw)
    if not raw.startswith(MARKER + "\n"):
        fail("ACTIVE_CONFIG_NOT_OWNED")
    matches = [
        environment
        for environment in ("SANDBOX", "PRODUCTION")
        if value == parse_toml(render_bootstrap(maps[environment]))
    ]
    if len(matches) != 1:
        fail("ACTIVE_CONFIG_CONTRACT_INVALID")
    return matches[0]


def upgrade_r3_consumer_public_fetch(
    project_dir: Path,
    private_root: Path,
    maps: Mapping[str, Mapping[str, Any]],
) -> None:
    """Atomically add the R4 public-fetch flag to exact R3 consumer configs."""

    private_root = validate_private_storage(project_dir, private_root)
    validate_ignore(project_dir)
    changes: dict[Path, str | None] = {}
    containment_roots: dict[Path, Path] = {}
    pages_snapshots: dict[Path, bytes] = {}
    environment_ids: dict[str, str] = {}

    def snapshot_pages(path: Path) -> None:
        try:
            pages_snapshots[path] = path.read_bytes()
        except OSError:
            fail("R4_UPGRADE_PAGES_SNAPSHOT_FAILED")

    def consumer_upgrade(
        path: Path,
        environment: str,
        *,
        containment: Path,
    ) -> str:
        assert_private_target(containment, path)
        raw, value = read_toml(path)
        assert_no_forbidden(raw)
        if not raw.startswith(MARKER + "\n"):
            fail("R4_UPGRADE_CONSUMER_NOT_OWNED")
        database_id = d1_id_from_config(
            value,
            environment,
            expected_migrations_dir=(project_dir / "migrations").resolve().as_posix(),
        )
        if database_id is None:
            fail("R4_UPGRADE_D1_BINDING_NOT_READY")
        monitoring_enabled = configured_monitoring_enabled(value)
        current = render_config(
            project_dir,
            maps[environment],
            "consumer",
            database_id,
            monitoring_enabled=monitoring_enabled,
        )
        legacy = r3_config_without_consumer_public_fetch(current)
        if raw not in {legacy, current}:
            fail("R4_UPGRADE_CONSUMER_DRIFT")
        if raw != current:
            changes[path] = current
            containment_roots[path] = containment
        return database_id

    def bootstrap_upgrade(
        path: Path,
        environment: str,
        *,
        containment: Path,
    ) -> None:
        assert_private_target(containment, path)
        raw, _ = read_toml(path)
        assert_no_forbidden(raw)
        if not raw.startswith(MARKER + "\n"):
            fail("R4_UPGRADE_BOOTSTRAP_NOT_OWNED")
        current = render_bootstrap(maps[environment])
        legacy = r3_config_without_consumer_public_fetch(current)
        if raw not in {legacy, current}:
            fail("R4_UPGRADE_BOOTSTRAP_DRIFT")
        if raw != current:
            changes[path] = current
            containment_roots[path] = containment

    for environment in ("SANDBOX", "PRODUCTION"):
        pages = stored_path(private_root, environment, "pages")
        assert_private_target(private_root, pages)
        snapshot_pages(pages)
        pages_id = validate_one(
            project_dir,
            pages,
            maps[environment],
            "pages",
            require_d1=True,
        )
        assert pages_id is not None
        consumer_id = consumer_upgrade(
            stored_path(private_root, environment, "consumer"),
            environment,
            containment=private_root,
        )
        if consumer_id != pages_id:
            fail("D1_BINDING_ENVIRONMENT_MISMATCH")
        environment_ids[environment] = pages_id
        bootstrap_upgrade(
            bootstrap_path(private_root, environment),
            environment,
            containment=private_root,
        )

    if len(set(environment_ids.values())) != len(environment_ids):
        fail("D1_ID_REUSED_ACROSS_ENVIRONMENTS")

    active_pages = active_path(project_dir, "pages")
    active_consumer = active_path(project_dir, "consumer")
    if active_pages.exists() is not active_consumer.exists():
        fail("R4_UPGRADE_ACTIVE_PAIR_INVALID")
    active_environment: str | None = None
    if active_pages.exists():
        assert_private_target(project_dir, active_pages)
        snapshot_pages(active_pages)
        active_environment, active_pages_id = validate_active_contract(
            project_dir,
            active_pages,
            maps,
            "pages",
        )
        active_consumer_id = consumer_upgrade(
            active_consumer,
            active_environment,
            containment=project_dir,
        )
        if (
            active_pages_id != active_consumer_id
            or active_consumer_id != environment_ids[active_environment]
        ):
            fail("R4_UPGRADE_ACTIVE_PAIR_INVALID")

    active_bootstrap = project_dir / ACTIVE_BOOTSTRAP_NAME
    if active_bootstrap.exists():
        raw, _ = read_toml(active_bootstrap)
        bootstrap_matches = [
            environment
            for environment in ("SANDBOX", "PRODUCTION")
            if raw
            in {
                render_bootstrap(maps[environment]),
                r3_config_without_consumer_public_fetch(
                    render_bootstrap(maps[environment])
                ),
            }
        ]
        if len(bootstrap_matches) != 1:
            fail("R4_UPGRADE_ACTIVE_BOOTSTRAP_INVALID")
        bootstrap_environment = bootstrap_matches[0]
        if (
            active_environment is not None
            and bootstrap_environment != active_environment
        ):
            fail("R4_UPGRADE_ACTIVE_BOOTSTRAP_INVALID")
        bootstrap_upgrade(
            active_bootstrap,
            bootstrap_environment,
            containment=project_dir,
        )

    def validate_upgrade() -> None:
        for path, expected in pages_snapshots.items():
            try:
                actual = path.read_bytes()
            except OSError:
                fail("R4_UPGRADE_PAGES_VERIFICATION_FAILED")
            if actual != expected:
                fail("R4_UPGRADE_PAGES_CHANGED")
        for environment in ("SANDBOX", "PRODUCTION"):
            consumer_id = validate_one(
                project_dir,
                stored_path(private_root, environment, "consumer"),
                maps[environment],
                "consumer",
                require_d1=True,
            )
            if consumer_id != environment_ids[environment]:
                fail("R4_UPGRADE_D1_BINDING_CHANGED")
            bootstrap_raw, _ = read_toml(bootstrap_path(private_root, environment))
            if bootstrap_raw != render_bootstrap(maps[environment]):
                fail("R4_UPGRADE_BOOTSTRAP_VERIFICATION_FAILED")
        if active_environment is not None:
            upgraded_environment, upgraded_id = validate_active_contract(
                project_dir,
                active_consumer,
                maps,
                "consumer",
            )
            if (
                upgraded_environment != active_environment
                or upgraded_id != environment_ids[active_environment]
            ):
                fail("R4_UPGRADE_ACTIVE_PAIR_INVALID")
        if active_bootstrap.exists():
            validate_active_bootstrap(active_bootstrap, maps)

    transactional_update(
        changes,
        containment_roots=containment_roots,
        validate_after=validate_upgrade,
    )


def assert_all_environment_d1_ids_unique(
    project_dir: Path,
    private_root: Path,
    maps: Mapping[str, Mapping[str, Any]],
) -> None:
    ids: dict[str, str] = {}
    for environment in ("SANDBOX", "PRODUCTION"):
        for role in ("pages", "consumer"):
            path = stored_path(private_root, environment, role)
            if not path.exists():
                continue
            database_id = validate_one(
                project_dir,
                path,
                maps[environment],
                role,
                require_d1=False,
            )
            if database_id is None:
                continue
            prior = ids.setdefault(environment, database_id)
            if prior != database_id:
                fail("D1_BINDING_ENVIRONMENT_MISMATCH")
    if len(ids) == 2 and len(set(ids.values())) != 2:
        fail("D1_ID_REUSED_ACROSS_ENVIRONMENTS")


def assert_d1_candidate_unique(
    project_dir: Path,
    private_root: Path,
    maps: Mapping[str, Mapping[str, Any]],
    environment: str,
    database_id: str,
) -> None:
    for other_environment in ("SANDBOX", "PRODUCTION"):
        if other_environment == environment:
            continue
        for role in ("pages", "consumer"):
            path = stored_path(private_root, other_environment, role)
            if not path.exists():
                continue
            other_id = validate_one(
                project_dir,
                path,
                maps[other_environment],
                role,
                require_d1=False,
            )
            if other_id == database_id:
                fail("D1_ID_REUSED_ACROSS_ENVIRONMENTS")


def activate(
    project_dir: Path,
    private_root: Path,
    maps: Mapping[str, Mapping[str, Any]],
    environment: str,
) -> None:
    private_root = validate_private_storage(project_dir, private_root)
    validate_ignore(project_dir)
    contents: dict[Path, str | None] = {}
    database_ids: set[str] = set()
    for role in ("pages", "consumer"):
        source = stored_path(private_root, environment, role)
        assert_private_target(private_root, source)
        database_id = validate_one(
            project_dir, source, maps[environment], role, require_d1=True
        )
        assert database_id is not None
        database_ids.add(database_id)
        target = active_path(project_dir, role)
        if target.exists():
            validate_active_contract(project_dir, target, maps, role)
        try:
            contents[target] = source.read_text(encoding="utf-8")
        except (OSError, UnicodeError):
            fail("CONFIG_READ_FAILED")
    if len(database_ids) != 1:
        fail("D1_BINDING_ENVIRONMENT_MISMATCH")
    assert_all_environment_d1_ids_unique(project_dir, private_root, maps)

    def validate_activated() -> None:
        for role in ("pages", "consumer"):
            validate_one(
                project_dir,
                active_path(project_dir, role),
                maps[environment],
                role,
                require_d1=True,
            )

    transactional_update(contents, validate_after=validate_activated)


def sync_d1(
    project_dir: Path,
    private_root: Path,
    maps: Mapping[str, Mapping[str, Any]],
    environment: str,
) -> None:
    private_root = validate_private_storage(project_dir, private_root)
    validate_ignore(project_dir)
    pages_path = stored_path(private_root, environment, "pages")
    assert_private_target(private_root, pages_path)
    pages_raw, active_value = read_toml(pages_path)
    assert_no_forbidden(pages_raw)
    if not pages_raw.startswith(MARKER + "\n"):
        fail("GENERATED_MARKER_MISSING")
    consumer_path = stored_path(private_root, environment, "consumer")
    assert_private_target(private_root, consumer_path)
    _, consumer_value = read_toml(consumer_path)
    consumer_database_id = validate_one(
        project_dir,
        consumer_path,
        maps[environment],
        "consumer",
        require_d1=False,
    )
    monitoring_enabled = configured_monitoring_enabled(consumer_value)
    if active_value.get("name") != EXPECTED_RESOURCES[environment]["pages_project"]:
        fail("ACTIVE_ENVIRONMENT_MISMATCH")
    database_id = d1_id_from_config(
        active_value,
        environment,
        expected_migrations_dir=(project_dir / "migrations").resolve().as_posix(),
        allow_missing_migrations_dir=True,
    )
    if database_id is None:
        fail("D1_BINDING_NOT_READY")
    if consumer_database_id is not None and consumer_database_id != database_id:
        fail("D1_BINDING_ENVIRONMENT_MISMATCH")
    assert_d1_candidate_unique(
        project_dir, private_root, maps, environment, database_id
    )
    normalized_active = dict(active_value)
    normalized_active["d1_databases"] = expected_data(
        project_dir, maps[environment], "pages", database_id
    )["d1_databases"]
    if normalized_active != expected_data(
        project_dir, maps[environment], "pages", database_id
    ):
        fail("WRANGLER_D1_UPDATE_DRIFT")
    pages_content = render_config(
        project_dir, maps[environment], "pages", database_id
    )
    consumer_content = render_config(
        project_dir,
        maps[environment],
        "consumer",
        database_id,
        monitoring_enabled=monitoring_enabled,
    )
    def validate_synced() -> None:
        for role in ("pages", "consumer"):
            validate_one(
                project_dir,
                stored_path(private_root, environment, role),
                maps[environment],
                role,
                require_d1=True,
            )
        assert_all_environment_d1_ids_unique(project_dir, private_root, maps)

    transactional_update(
        {pages_path: pages_content, consumer_path: consumer_content},
        containment_root=private_root,
        validate_after=validate_synced,
    )


def bind_d1(
    project_dir: Path,
    private_root: Path,
    maps: Mapping[str, Mapping[str, Any]],
    environment: str,
    binding_document: Mapping[str, Any],
) -> None:
    """Bind a stdin-supplied D1 ID to both private configs as one transaction."""

    private_root = validate_private_storage(project_dir, private_root)
    validate_ignore(project_dir)
    database_id = validate_d1_binding_document(binding_document, environment)
    pages_path = stored_path(private_root, environment, "pages")
    consumer_path = stored_path(private_root, environment, "consumer")
    for path in (pages_path, consumer_path):
        assert_private_target(private_root, path)

    pages_database_id = validate_one(
        project_dir,
        pages_path,
        maps[environment],
        "pages",
        require_d1=False,
    )
    _, consumer_value = read_toml(consumer_path)
    consumer_database_id = validate_one(
        project_dir,
        consumer_path,
        maps[environment],
        "consumer",
        require_d1=False,
    )
    existing_ids = {
        candidate
        for candidate in (pages_database_id, consumer_database_id)
        if candidate is not None
    }
    if len(existing_ids) > 1:
        fail("D1_BINDING_ENVIRONMENT_MISMATCH")
    if existing_ids and database_id not in existing_ids:
        fail("D1_BINDING_REBIND_FORBIDDEN")
    monitoring_enabled = configured_monitoring_enabled(consumer_value)
    assert_all_environment_d1_ids_unique(project_dir, private_root, maps)
    assert_d1_candidate_unique(
        project_dir,
        private_root,
        maps,
        environment,
        database_id,
    )

    pages_content = render_config(
        project_dir,
        maps[environment],
        "pages",
        database_id,
    )
    consumer_content = render_config(
        project_dir,
        maps[environment],
        "consumer",
        database_id,
        monitoring_enabled=monitoring_enabled,
    )

    def validate_bound() -> None:
        for role in ("pages", "consumer"):
            bound_id = validate_one(
                project_dir,
                stored_path(private_root, environment, role),
                maps[environment],
                role,
                require_d1=True,
            )
            if bound_id != database_id:
                fail("D1_BINDING_ENVIRONMENT_MISMATCH")
        assert_all_environment_d1_ids_unique(project_dir, private_root, maps)

    transactional_update(
        {pages_path: pages_content, consumer_path: consumer_content},
        containment_root=private_root,
        validate_after=validate_bound,
    )


def set_monitoring_state(
    project_dir: Path,
    private_root: Path,
    maps: Mapping[str, Mapping[str, Any]],
    environment: str,
    enabled: bool,
) -> None:
    private_root = validate_private_storage(project_dir, private_root)
    validate_ignore(project_dir)
    path = stored_path(private_root, environment, "consumer")
    database_id = validate_one(
        project_dir,
        path,
        maps[environment],
        "consumer",
        require_d1=True,
    )
    content = render_config(
        project_dir,
        maps[environment],
        "consumer",
        database_id,
        monitoring_enabled=enabled,
    )

    def validate_monitoring_update() -> None:
        validate_one(
            project_dir,
            path,
            maps[environment],
            "consumer",
            require_d1=True,
            required_monitoring_enabled=enabled,
        )

    transactional_update(
        {path: content},
        containment_root=private_root,
        validate_after=validate_monitoring_update,
    )


def validate(
    project_dir: Path,
    private_root: Path,
    maps: Mapping[str, Mapping[str, Any]],
    phase: str,
    environment: str | None,
) -> None:
    private_root = validate_private_storage(project_dir, private_root)
    validate_ignore(project_dir)
    environments = (environment,) if environment else ("SANDBOX", "PRODUCTION")
    ids: dict[str, str] = {}
    for current in environments:
        for role in ("pages", "consumer"):
            database_id = validate_one(
                project_dir,
                stored_path(private_root, current, role),
                maps[current],
                role,
                require_d1=phase in {"predeploy", "final"},
                required_monitoring_enabled=(
                    True
                    if phase == "final" and role == "consumer"
                    else False
                    if phase == "precreate" and role == "consumer"
                    else None
                ),
            )
            if database_id is not None:
                prior = ids.setdefault(current, database_id)
                if prior != database_id:
                    fail("D1_BINDING_ENVIRONMENT_MISMATCH")
    assert_all_environment_d1_ids_unique(project_dir, private_root, maps)


def deactivate(
    project_dir: Path,
    maps: Mapping[str, Mapping[str, Any]],
) -> None:
    validate_ignore(project_dir)
    changes: dict[Path, str | None] = {}
    active_roles: dict[str, tuple[str, str | None]] = {}
    for role, filename in (
        ("pages", ACTIVE_PAGES_NAME),
        ("consumer", ACTIVE_CONSUMER_NAME),
    ):
        path = project_dir / filename
        if not path.exists():
            continue
        active_roles[role] = validate_active_contract(project_dir, path, maps, role)
        changes[path] = None
    bootstrap = project_dir / ACTIVE_BOOTSTRAP_NAME
    if bootstrap.exists():
        validate_active_bootstrap(bootstrap, maps)
        changes[bootstrap] = None
    if set(active_roles) == {"pages", "consumer"}:
        if active_roles["pages"] != active_roles["consumer"]:
            fail("ACTIVE_CONFIG_CROSS_ROLE_MISMATCH")
    transactional_update(changes)


def cleanup_legacy(project_dir: Path) -> None:
    root = project_dir / STAGING_DIRNAME
    for environment in ("SANDBOX", "PRODUCTION"):
        directory = root / environment.casefold()
        for filename in (ACTIVE_PAGES_NAME, ACTIVE_CONSUMER_NAME):
            path = directory / filename
            if not path.exists():
                continue
            raw, _ = read_toml(path)
            if not raw.startswith(MARKER + "\n"):
                fail("LEGACY_CONFIG_NOT_OWNED")
            path.unlink()
        if directory.exists():
            try:
                directory.rmdir()
            except OSError:
                fail("LEGACY_DIRECTORY_NOT_EMPTY")
    if root.exists():
        try:
            root.rmdir()
        except OSError:
            fail("LEGACY_DIRECTORY_NOT_EMPTY")


def private_root_from_config(path: Path, project_dir: Path) -> Path:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError):
        fail("PRIVATE_ROOT_CONFIG_READ_FAILED")
    configured = value.get("llc_private_root") if isinstance(value, dict) else None
    if not isinstance(configured, str) or not configured or "\x00" in configured:
        fail("PRIVATE_ROOT_CONFIG_INVALID")
    configured_path = Path(configured).expanduser()
    if not configured_path.is_absolute():
        fail("PRIVATE_ROOT_CONFIG_INVALID")
    assert_no_reparse_points(configured_path)
    try:
        root = configured_path.resolve(strict=True)
    except OSError:
        fail("PRIVATE_ROOT_UNAVAILABLE")
    return validate_private_storage(project_dir, root, config_path=path)


def parser() -> argparse.ArgumentParser:
    result = SafeArgumentParser(description=__doc__)
    result.add_argument("--resource-map-root", required=True, type=Path)
    result.add_argument("--private-root-config", required=True, type=Path)
    result.add_argument("--project-dir", type=Path, default=project_dir_from_script())
    commands = result.add_subparsers(dest="command", required=True)
    commands.add_parser("generate")
    commands.add_parser("upgrade-r3-consumer-public-fetch")
    activate_parser = commands.add_parser("activate")
    activate_parser.add_argument("--environment", choices=EXPECTED_RESOURCES, required=True)
    sync_parser = commands.add_parser("sync-d1")
    sync_parser.add_argument("--environment", choices=EXPECTED_RESOURCES, required=True)
    bind_parser = commands.add_parser("bind-d1")
    bind_parser.add_argument("--environment", choices=EXPECTED_RESOURCES, required=True)
    monitoring_parser = commands.add_parser("set-monitoring")
    monitoring_parser.add_argument(
        "--environment", choices=EXPECTED_RESOURCES, required=True
    )
    monitoring_parser.add_argument(
        "--state", choices=("disabled", "enabled"), required=True
    )
    validate_parser = commands.add_parser("validate")
    validate_parser.add_argument(
        "--phase", choices=("precreate", "predeploy", "final"), required=True
    )
    validate_parser.add_argument("--environment", choices=EXPECTED_RESOURCES)
    commands.add_parser("deactivate")
    commands.add_parser("cleanup-legacy")
    return result


def main(argv: Sequence[str] | None = None) -> int:
    try:
        arguments = parser().parse_args(argv)
        project_dir = arguments.project_dir.resolve()
        private_root = private_root_from_config(
            arguments.private_root_config.resolve(), project_dir
        )
        maps = load_maps(arguments.resource_map_root.resolve())
        if arguments.command == "generate":
            generate(project_dir, private_root, maps)
        elif arguments.command == "upgrade-r3-consumer-public-fetch":
            upgrade_r3_consumer_public_fetch(project_dir, private_root, maps)
        elif arguments.command == "activate":
            activate(
                project_dir,
                private_root,
                maps,
                arguments.environment,
            )
        elif arguments.command == "sync-d1":
            sync_d1(project_dir, private_root, maps, arguments.environment)
        elif arguments.command == "bind-d1":
            bind_d1(
                project_dir,
                private_root,
                maps,
                arguments.environment,
                read_d1_binding_stdin(sys.stdin.buffer),
            )
        elif arguments.command == "set-monitoring":
            set_monitoring_state(
                project_dir,
                private_root,
                maps,
                arguments.environment,
                arguments.state == "enabled",
            )
        elif arguments.command == "validate":
            validate(
                project_dir,
                private_root,
                maps,
                arguments.phase,
                arguments.environment,
            )
        elif arguments.command == "deactivate":
            deactivate(project_dir, maps)
        elif arguments.command == "cleanup-legacy":
            cleanup_legacy(project_dir)
        else:
            fail("COMMAND_INVALID")
    except ConfigError as exc:
        print(f"ERROR:{exc}", file=sys.stderr)
        return 1
    print("PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
