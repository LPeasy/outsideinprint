from __future__ import annotations

import importlib.util
import io
import json
import os
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock


COMMERCE_ROOT = Path(__file__).resolve().parents[1]
TOOL_PATH = COMMERCE_ROOT / "tools" / "task2_provisioning_configs.py"
SPEC = importlib.util.spec_from_file_location("task2_provisioning_configs", TOOL_PATH)
assert SPEC is not None and SPEC.loader is not None
tool = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(tool)


def exact_queue_controls(environment: str) -> dict[str, object]:
    resources = tool.EXPECTED_RESOURCES[environment]
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
        "primary_consumer": {
            "dead_letter_queue": resources["dead_letter_queue"],
            "max_batch_size": 1,
            "max_batch_timeout": 1,
            "max_concurrency": 1,
            "max_retries": 10,
            "queue": resources["event_queue"],
        },
        "scheduled_trigger": "*/5 * * * *",
    }


def write_maps(root: Path) -> None:
    root.mkdir(parents=True)
    filenames = {
        "SANDBOX": "sandbox-resource-map-v1.json",
        "PRODUCTION": "production-resource-map-v1.json",
    }
    for environment, filename in filenames.items():
        resources = tool.EXPECTED_RESOURCES[environment]
        value = {
            "action_id": tool.ACTION_ID,
            "environment": environment,
            "resources": resources,
            "fixed_nonsecret_values": tool.EXPECTED_FIXED[environment],
            "closed_gate_values": tool.EXPECTED_CLOSED,
            "consumer_nonsecret_values": tool.expected_consumer_nonsecret(
                environment
            ),
            "monitoring_controls": tool.expected_monitoring_controls(environment),
            "queue_controls": exact_queue_controls(environment),
        }
        (root / filename).write_text(json.dumps(value), encoding="utf-8")


def append_d1(
    path: Path,
    environment: str,
    database_id: str,
    project: Path,
    *,
    include_migrations_dir: bool = True,
) -> None:
    resources = tool.EXPECTED_RESOURCES[environment]
    with path.open("a", encoding="utf-8", newline="\n") as handle:
        content = (
            "\n[[d1_databases]]\n"
            'binding = "DB"\n'
            f'database_name = "{resources["d1_database"]}"\n'
            f'database_id = "{database_id}"\n'
        )
        if include_migrations_dir:
            content += (
                f'migrations_dir = "{(project / "migrations").resolve().as_posix()}"\n'
            )
        handle.write(content)


def sql_statements(source: str) -> list[str]:
    statements: list[str] = []
    pending = ""
    for line in source.splitlines(keepends=True):
        pending += line
        if sqlite3.complete_statement(pending):
            statements.append(pending)
            pending = ""
    if pending.strip():
        raise AssertionError("incomplete SQL statement")
    return statements


class Task2ProvisioningConfigTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.project = self.root / "oip-commerce"
        self.project.mkdir()
        (self.project / ".gitignore").write_text(
            ".task2-provisioning/\nwrangler.toml\nwrangler.consumer.toml\n"
            "wrangler.consumer.bootstrap.toml\n",
            encoding="utf-8",
        )
        subprocess.run(
            ["git", "init", "--quiet"],
            cwd=self.project,
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        self.maps_root = self.root / "maps"
        write_maps(self.maps_root)
        self.maps = tool.load_maps(self.maps_root)
        self.private = self.root / "private"
        self.private.mkdir()

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def prepare_r3_bound_configs(
        self,
        *,
        include_active: bool = False,
    ) -> dict[str, str]:
        tool.generate(self.project, self.private, self.maps)
        database_ids = {
            "SANDBOX": "11111111-1111-4111-8111-111111111111",
            "PRODUCTION": "22222222-2222-4222-8222-222222222222",
        }
        for environment, database_id in database_ids.items():
            tool.bind_d1(
                self.project,
                self.private,
                self.maps,
                environment,
                {
                    "schema_version": "1.0",
                    "environment": environment,
                    "database_name": tool.EXPECTED_RESOURCES[environment][
                        "d1_database"
                    ],
                    "database_id": database_id,
                },
            )
        tool.set_monitoring_state(
            self.project, self.private, self.maps, "SANDBOX", True
        )
        if include_active:
            tool.activate(self.project, self.private, self.maps, "SANDBOX")
            (self.project / tool.ACTIVE_BOOTSTRAP_NAME).write_text(
                tool.bootstrap_path(self.private, "SANDBOX").read_text(
                    encoding="utf-8"
                ),
                encoding="utf-8",
                newline="\n",
            )

        consumer_paths = [
            tool.stored_path(self.private, environment, "consumer")
            for environment in ("SANDBOX", "PRODUCTION")
        ]
        bootstrap_paths = [
            tool.bootstrap_path(self.private, environment)
            for environment in ("SANDBOX", "PRODUCTION")
        ]
        if include_active:
            consumer_paths.append(self.project / tool.ACTIVE_CONSUMER_NAME)
            bootstrap_paths.append(self.project / tool.ACTIVE_BOOTSTRAP_NAME)
        for path in (*consumer_paths, *bootstrap_paths):
            path.write_text(
                tool.r3_config_without_consumer_public_fetch(
                    path.read_text(encoding="utf-8")
                ),
                encoding="utf-8",
                newline="\n",
            )
        return database_ids

    def test_generate_switch_sync_and_validate_without_protected_values(self) -> None:
        self.assertEqual(
            tool.ACTION_ID, "PLATFORM-OIP-COMMERCE-INFRA-001-R3"
        )
        tool.generate(self.project, self.private, self.maps)
        tool.validate(self.project, self.private, self.maps, "precreate", None)
        for environment in ("SANDBOX", "PRODUCTION"):
            for role in ("pages", "consumer"):
                raw = tool.stored_path(self.private, environment, role).read_text(
                    encoding="utf-8"
                )
                self.assertFalse(any(name in raw for name in tool.FORBIDDEN_BINDINGS))
                parsed = tool.read_toml(
                    tool.stored_path(self.private, environment, role)
                )[1]
                if role == "consumer":
                    self.assertEqual(
                        parsed["compatibility_flags"],
                        ["global_fetch_strictly_public"],
                    )
                    self.assertEqual(
                        parsed["observability"],
                        {"enabled": True, "head_sampling_rate": 1},
                    )
                    for name in tool.SHARED_NONSECRET:
                        self.assertIn(name, parsed["vars"])
                    self.assertEqual(
                        parsed["vars"]["OPERATIONS_MONITORING_ENABLED"], "false"
                    )
                    self.assertEqual(
                        parsed["queues"]["producers"],
                        [{
                            "binding": "OPERATIONAL_CANARY_QUEUE",
                            "queue": tool.EXPECTED_RESOURCES[environment][
                                "event_queue"
                            ],
                        }],
                    )
                    self.assertEqual(len(parsed["queues"]["consumers"]), 2)
                else:
                    self.assertNotIn("compatibility_flags", parsed)
                    self.assertEqual(
                        parsed["queues"],
                        {
                            "producers": [
                                {
                                    "binding": "WEBHOOK_QUEUE",
                                    "queue": tool.EXPECTED_RESOURCES[environment][
                                        "event_queue"
                                    ],
                                }
                            ]
                        },
                    )
            bootstrap = tool.read_toml(
                tool.bootstrap_path(self.private, environment)
            )[1]
            self.assertEqual(
                set(bootstrap),
                {
                    "name",
                    "main",
                    "compatibility_date",
                    "compatibility_flags",
                    "workers_dev",
                    "preview_urls",
                },
            )
            self.assertEqual(
                bootstrap["compatibility_flags"],
                ["global_fetch_strictly_public"],
            )
            self.assertFalse(bootstrap["workers_dev"])
            self.assertFalse(bootstrap["preview_urls"])

        sandbox_id = "11111111-1111-4111-8111-111111111111"
        append_d1(
            tool.stored_path(self.private, "SANDBOX", "pages"),
            "SANDBOX",
            sandbox_id,
            self.project,
            include_migrations_dir=False,
        )
        tool.sync_d1(self.project, self.private, self.maps, "SANDBOX")
        tool.validate(
            self.project, self.private, self.maps, "predeploy", "SANDBOX"
        )
        tool.set_monitoring_state(
            self.project, self.private, self.maps, "SANDBOX", True
        )
        tool.validate(self.project, self.private, self.maps, "final", "SANDBOX")
        tool.activate(self.project, self.private, self.maps, "SANDBOX")
        active_pages = tool.read_toml(
            self.project / tool.ACTIVE_PAGES_NAME
        )[1]
        active_consumer = tool.read_toml(
            self.project / tool.ACTIVE_CONSUMER_NAME
        )[1]
        self.assertEqual(
            active_pages["d1_databases"][0]["database_id"],
            active_consumer["d1_databases"][0]["database_id"],
        )
        self.assertNotIn(
            "\\", active_pages["d1_databases"][0]["migrations_dir"]
        )

        tool.deactivate(self.project, self.maps)
        production_id = "22222222-2222-4222-8222-222222222222"
        append_d1(
            tool.stored_path(self.private, "PRODUCTION", "pages"),
            "PRODUCTION",
            production_id,
            self.project,
        )
        tool.sync_d1(self.project, self.private, self.maps, "PRODUCTION")
        tool.validate(
            self.project, self.private, self.maps, "predeploy", "PRODUCTION"
        )
        tool.set_monitoring_state(
            self.project, self.private, self.maps, "PRODUCTION", True
        )
        tool.validate(
            self.project, self.private, self.maps, "final", "PRODUCTION"
        )
        tool.activate(self.project, self.private, self.maps, "PRODUCTION")

        tool.deactivate(self.project, self.maps)
        self.assertFalse((self.project / tool.ACTIVE_PAGES_NAME).exists())
        self.assertFalse((self.project / tool.ACTIVE_CONSUMER_NAME).exists())

    def test_resource_map_requires_exact_full_queue_control_shape(self) -> None:
        for environment in ("SANDBOX", "PRODUCTION"):
            self.assertEqual(
                tool.expected_queue_controls(environment),
                exact_queue_controls(environment),
            )

        sandbox_path = self.maps_root / "sandbox-resource-map-v1.json"
        sandbox = json.loads(sandbox_path.read_text(encoding="utf-8"))
        del sandbox["queue_controls"]["max_batch_timeout"]
        sandbox_path.write_text(json.dumps(sandbox), encoding="utf-8")
        with self.assertRaisesRegex(
            tool.ConfigError, "RESOURCE_MAP_QUEUE_CONTROLS_INVALID"
        ):
            tool.load_maps(self.maps_root)

    def test_r4_upgrade_is_exact_atomic_and_idempotent_with_active_r3_configs(
        self,
    ) -> None:
        database_ids = self.prepare_r3_bound_configs(include_active=True)
        consumers = [
            tool.stored_path(self.private, environment, "consumer")
            for environment in ("SANDBOX", "PRODUCTION")
        ] + [self.project / tool.ACTIVE_CONSUMER_NAME]
        bootstraps = [
            tool.bootstrap_path(self.private, environment)
            for environment in ("SANDBOX", "PRODUCTION")
        ] + [self.project / tool.ACTIVE_BOOTSTRAP_NAME]
        pages = [
            tool.stored_path(self.private, environment, "pages")
            for environment in ("SANDBOX", "PRODUCTION")
        ] + [self.project / tool.ACTIVE_PAGES_NAME]
        before_text = {
            path: path.read_text(encoding="utf-8")
            for path in (*consumers, *bootstraps)
        }
        before_data = {
            path: tool.parse_toml(before_text[path]) for path in consumers
        }
        before_pages = {path: path.read_bytes() for path in pages}

        tool.upgrade_r3_consumer_public_fetch(
            self.project, self.private, self.maps
        )

        date_line = f'compatibility_date = "{tool.COMPATIBILITY_DATE}"\n'
        flag_line = (
            'compatibility_flags = ["global_fetch_strictly_public"]\n'
        )
        for path in (*consumers, *bootstraps):
            self.assertEqual(
                path.read_text(encoding="utf-8"),
                before_text[path].replace(
                    date_line,
                    date_line + flag_line,
                    1,
                ),
            )
        for path in consumers:
            upgraded = tool.read_toml(path)[1]
            self.assertEqual(
                upgraded.pop("compatibility_flags"),
                ["global_fetch_strictly_public"],
            )
            self.assertEqual(upgraded, before_data[path])
        for path, expected in before_pages.items():
            self.assertEqual(path.read_bytes(), expected)
        for environment, database_id in database_ids.items():
            consumer = tool.read_toml(
                tool.stored_path(self.private, environment, "consumer")
            )[1]
            self.assertEqual(
                consumer["d1_databases"][0]["database_id"], database_id
            )

        upgraded_paths = (*consumers, *bootstraps, *pages)
        first_result = {path: path.read_bytes() for path in upgraded_paths}
        tool.upgrade_r3_consumer_public_fetch(
            self.project, self.private, self.maps
        )
        self.assertEqual(
            {path: path.read_bytes() for path in upgraded_paths},
            first_result,
        )
        tool.generate(self.project, self.private, self.maps)
        tool.validate(self.project, self.private, self.maps, "predeploy", None)

    def test_r4_upgrade_cli_targets_the_existing_r3_private_path(self) -> None:
        database_ids = self.prepare_r3_bound_configs()
        self.assertIn(tool.ACTION_ID, tool.PRIVATE_CONFIG_RELATIVE.parts)
        config_path = self.root / "private-root.json"
        config_path.write_text(
            json.dumps({"llc_private_root": str(self.private)}),
            encoding="utf-8",
        )
        result = subprocess.run(
            [
                sys.executable,
                str(TOOL_PATH),
                "--resource-map-root",
                str(self.maps_root),
                "--private-root-config",
                str(config_path),
                "--project-dir",
                str(self.project),
                "upgrade-r3-consumer-public-fetch",
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr.decode("utf-8"))
        self.assertEqual(result.stdout.splitlines(), [b"PASS"])
        for database_id in database_ids.values():
            self.assertNotIn(
                database_id.encode("ascii"), result.stdout + result.stderr
            )
        tool.validate(self.project, self.private, self.maps, "predeploy", None)

    def test_r4_upgrade_fails_closed_and_rolls_back_all_configs(self) -> None:
        self.prepare_r3_bound_configs()
        paths = [
            path
            for environment in ("SANDBOX", "PRODUCTION")
            for path in (
                tool.stored_path(self.private, environment, "pages"),
                tool.stored_path(self.private, environment, "consumer"),
                tool.bootstrap_path(self.private, environment),
            )
        ]
        production_consumer = tool.stored_path(
            self.private, "PRODUCTION", "consumer"
        )
        production_consumer.write_text(
            production_consumer.read_text(encoding="utf-8").replace(
                "max_retries = 10",
                "max_retries = 9",
                1,
            ),
            encoding="utf-8",
            newline="\n",
        )
        drifted = {path: path.read_bytes() for path in paths}
        with self.assertRaisesRegex(
            tool.ConfigError, "R4_UPGRADE_CONSUMER_DRIFT"
        ):
            tool.upgrade_r3_consumer_public_fetch(
                self.project, self.private, self.maps
            )
        self.assertEqual(
            {path: path.read_bytes() for path in paths},
            drifted,
        )

        production_consumer.write_text(
            tool.r3_config_without_consumer_public_fetch(
                tool.render_config(
                    self.project,
                    self.maps["PRODUCTION"],
                    "consumer",
                    "22222222-2222-4222-8222-222222222222",
                )
            ),
            encoding="utf-8",
            newline="\n",
        )
        before = {path: path.read_bytes() for path in paths}
        real_atomic_write = tool.atomic_write
        failed = False

        def fail_production_consumer_once(
            path: Path, text: str, **kwargs: object
        ) -> None:
            nonlocal failed
            if path == production_consumer and not failed:
                failed = True
                raise OSError("injected R4 transaction failure")
            real_atomic_write(path, text, **kwargs)

        with mock.patch.object(
            tool, "atomic_write", side_effect=fail_production_consumer_once
        ):
            with self.assertRaisesRegex(
                tool.ConfigError, "CONFIG_TRANSACTION_FAILED"
            ):
                tool.upgrade_r3_consumer_public_fetch(
                    self.project, self.private, self.maps
                )
        self.assertEqual(
            {path: path.read_bytes() for path in paths},
            before,
        )

    def test_bind_d1_cli_uses_only_bounded_stdin_and_updates_both_roles(self) -> None:
        tool.generate(self.project, self.private, self.maps)
        config_path = self.root / "private-root.json"
        config_path.write_text(
            json.dumps({"llc_private_root": str(self.private)}),
            encoding="utf-8",
        )
        database_id = "11111111-1111-4111-8111-111111111111"
        binding = {
            "schema_version": "1.0",
            "environment": "SANDBOX",
            "database_name": "oip-commerce-sandbox",
            "database_id": database_id,
        }
        result = subprocess.run(
            [
                sys.executable,
                str(TOOL_PATH),
                "--resource-map-root",
                str(self.maps_root),
                "--private-root-config",
                str(config_path),
                "--project-dir",
                str(self.project),
                "bind-d1",
                "--environment",
                "SANDBOX",
            ],
            input=json.dumps(binding).encode("utf-8"),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr.decode("utf-8"))
        self.assertEqual(result.stdout.splitlines(), [b"PASS"])
        self.assertNotIn(database_id.encode("ascii"), result.stdout + result.stderr)
        for role in ("pages", "consumer"):
            parsed = tool.read_toml(
                tool.stored_path(self.private, "SANDBOX", role)
            )[1]
            self.assertEqual(parsed["d1_databases"][0]["database_id"], database_id)

    def test_bind_d1_rejects_malformed_oversized_and_secret_input(self) -> None:
        database_id = "11111111-1111-4111-8111-111111111111"
        valid = {
            "schema_version": "1.0",
            "environment": "SANDBOX",
            "database_name": "oip-commerce-sandbox",
            "database_id": database_id,
        }
        invalid_inputs = (
            (b"\xff", "D1_BINDING_STDIN_ENCODING_INVALID"),
            (b"{}" + b" " * tool.D1_BINDING_MAX_STDIN_BYTES, "D1_BINDING_STDIN_TOO_LARGE"),
            (
                b'{"schema_version":"1.0","schema_version":"1.0"}',
                "D1_BINDING_JSON_DUPLICATE_KEY",
            ),
        )
        for raw, code in invalid_inputs:
            with self.subTest(code=code):
                with self.assertRaisesRegex(tool.ConfigError, code):
                    tool.read_d1_binding_stdin(io.BytesIO(raw))

        invalid_documents = (
            ({**valid, "SQUARE_ACCESS_TOKEN": "do-not-accept"}, "D1_BINDING_SECRET_MATERIAL_REJECTED"),
            ({**valid, "extra": "value"}, "D1_BINDING_KEYS_INVALID"),
            ({**valid, "schema_version": "2.0"}, "D1_BINDING_SCHEMA_VERSION_INVALID"),
            ({**valid, "environment": "PRODUCTION"}, "D1_BINDING_ENVIRONMENT_MISMATCH"),
            ({**valid, "database_name": "other"}, "D1_BINDING_DATABASE_NAME_MISMATCH"),
            ({**valid, "database_id": "not-a-d1-id"}, "D1_DATABASE_ID_INVALID"),
        )
        for document, code in invalid_documents:
            with self.subTest(code=code):
                with self.assertRaisesRegex(tool.ConfigError, code):
                    tool.validate_d1_binding_document(document, "SANDBOX")

    def test_bind_d1_rolls_back_and_rejects_cross_environment_reuse(self) -> None:
        tool.generate(self.project, self.private, self.maps)
        sandbox_id = "11111111-1111-4111-8111-111111111111"
        sandbox_binding = {
            "schema_version": "1.0",
            "environment": "SANDBOX",
            "database_name": "oip-commerce-sandbox",
            "database_id": sandbox_id,
        }
        pages = tool.stored_path(self.private, "SANDBOX", "pages")
        consumer = tool.stored_path(self.private, "SANDBOX", "consumer")
        before_pages = pages.read_bytes()
        before_consumer = consumer.read_bytes()
        real_atomic_write = tool.atomic_write
        failed = False

        def fail_consumer_once(path: Path, text: str, **kwargs: object) -> None:
            nonlocal failed
            if path == consumer and not failed:
                failed = True
                raise OSError("injected transaction failure")
            real_atomic_write(path, text, **kwargs)

        with mock.patch.object(tool, "atomic_write", side_effect=fail_consumer_once):
            with self.assertRaisesRegex(tool.ConfigError, "CONFIG_TRANSACTION_FAILED"):
                tool.bind_d1(
                    self.project,
                    self.private,
                    self.maps,
                    "SANDBOX",
                    sandbox_binding,
                )
        self.assertEqual(pages.read_bytes(), before_pages)
        self.assertEqual(consumer.read_bytes(), before_consumer)

        tool.bind_d1(
            self.project,
            self.private,
            self.maps,
            "SANDBOX",
            sandbox_binding,
        )
        production_pages = tool.stored_path(self.private, "PRODUCTION", "pages")
        production_consumer = tool.stored_path(
            self.private, "PRODUCTION", "consumer"
        )
        before_production = (
            production_pages.read_bytes(),
            production_consumer.read_bytes(),
        )
        with self.assertRaisesRegex(
            tool.ConfigError, "D1_ID_REUSED_ACROSS_ENVIRONMENTS"
        ):
            tool.bind_d1(
                self.project,
                self.private,
                self.maps,
                "PRODUCTION",
                {
                    **sandbox_binding,
                    "environment": "PRODUCTION",
                    "database_name": "oip-commerce",
                },
            )
        self.assertEqual(production_pages.read_bytes(), before_production[0])
        self.assertEqual(production_consumer.read_bytes(), before_production[1])

    def test_invalid_cli_identifier_is_rejected_without_reflection(self) -> None:
        database_id = "11111111-1111-4111-8111-111111111111"
        with self.assertRaisesRegex(tool.ConfigError, "ARGUMENTS_INVALID") as raised:
            tool.parser().parse_args(
                [
                    "--resource-map-root",
                    "maps",
                    "--private-root-config",
                    "private.json",
                    "bind-d1",
                    "--environment",
                    "SANDBOX",
                    "--database-id",
                    database_id,
                ]
            )
        self.assertNotIn(database_id, str(raised.exception))

    def test_refuses_to_replace_an_unowned_active_config(self) -> None:
        tool.generate(self.project, self.private, self.maps)
        append_d1(
            tool.stored_path(self.private, "SANDBOX", "pages"),
            "SANDBOX",
            "11111111-1111-4111-8111-111111111111",
            self.project,
        )
        tool.sync_d1(self.project, self.private, self.maps, "SANDBOX")
        (self.project / tool.ACTIVE_PAGES_NAME).write_text(
            'name = "user-owned"\n', encoding="utf-8"
        )
        with self.assertRaisesRegex(tool.ConfigError, "ACTIVE_CONFIG_NOT_OWNED"):
            tool.activate(self.project, self.private, self.maps, "SANDBOX")
        self.assertFalse((self.project / tool.ACTIVE_CONSUMER_NAME).exists())

    def test_predeploy_rejects_missing_d1_identifier(self) -> None:
        tool.generate(self.project, self.private, self.maps)
        with self.assertRaisesRegex(tool.ConfigError, "D1_BINDING_NOT_READY"):
            tool.validate(
                self.project, self.private, self.maps, "predeploy", "SANDBOX"
            )

    def test_effective_ignore_and_tracked_guards_fail_closed(self) -> None:
        ignore = self.project / ".gitignore"
        ignore.write_text(ignore.read_text() + "!wrangler.toml\n", encoding="utf-8")
        with self.assertRaisesRegex(tool.ConfigError, "GIT_GUARD_PATH_NOT_IGNORED"):
            tool.validate_ignore(self.project)

        ignore.write_text(
            ".task2-provisioning/\nwrangler.toml\nwrangler.consumer.toml\n"
            "wrangler.consumer.bootstrap.toml\n",
            encoding="utf-8",
        )
        active = self.project / tool.ACTIVE_PAGES_NAME
        active.write_text("tracked guard fixture\n", encoding="utf-8")
        subprocess.run(
            ["git", "add", "--force", "--", tool.ACTIVE_PAGES_NAME],
            cwd=self.project,
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        with self.assertRaisesRegex(tool.ConfigError, "GIT_GUARD_PATH_TRACKED"):
            tool.validate_ignore(self.project)

    def test_private_root_must_be_disjoint_from_git_and_reparse_free(self) -> None:
        private_inside_git = self.project / "private"
        private_inside_git.mkdir()
        with self.assertRaisesRegex(
            tool.ConfigError, "PRIVATE_ROOT_GIT_CONTAINMENT_INVALID"
        ):
            tool.generate(self.project, private_inside_git, self.maps)

        separate_git_private = self.root / "separate-private-repository"
        separate_git_private.mkdir()
        subprocess.run(
            ["git", "init", "--quiet"],
            cwd=separate_git_private,
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        with self.assertRaisesRegex(
            tool.ConfigError, "PRIVATE_ROOT_GIT_CONTAINMENT_INVALID"
        ):
            tool.generate(self.project, separate_git_private, self.maps)

        outside = self.root / "outside"
        outside.mkdir()
        linked = self.root / "linked-private"
        try:
            os.symlink(outside, linked, target_is_directory=True)
        except OSError as exc:
            real_lstat = tool.os.lstat
            private_metadata = real_lstat(self.private)

            def simulated_reparse(path: object) -> object:
                if Path(path) == self.private:
                    return mock.Mock(
                        st_mode=private_metadata.st_mode,
                        st_file_attributes=getattr(
                            tool.stat, "FILE_ATTRIBUTE_REPARSE_POINT", 1024
                        ),
                    )
                return real_lstat(path)

            with mock.patch.object(tool.os, "lstat", side_effect=simulated_reparse):
                with self.assertRaisesRegex(
                    tool.ConfigError, "PRIVATE_PATH_REPARSE_POINT"
                ):
                    tool.generate(self.project, self.private, self.maps)
            self.assertIsInstance(exc, OSError)
        else:
            with self.assertRaisesRegex(
                tool.ConfigError, "PRIVATE_PATH_REPARSE_POINT"
            ):
                tool.generate(self.project, linked, self.maps)

    def test_sync_rejects_unowned_consumer_without_rewriting_pages(self) -> None:
        tool.generate(self.project, self.private, self.maps)
        pages = tool.stored_path(self.private, "SANDBOX", "pages")
        append_d1(
            pages,
            "SANDBOX",
            "11111111-1111-4111-8111-111111111111",
            self.project,
            include_migrations_dir=False,
        )
        before = pages.read_bytes()
        tool.stored_path(self.private, "SANDBOX", "consumer").write_text(
            'name = "not-owned"\n', encoding="utf-8"
        )
        with self.assertRaisesRegex(tool.ConfigError, "GENERATED_MARKER_MISSING"):
            tool.sync_d1(self.project, self.private, self.maps, "SANDBOX")
        self.assertEqual(pages.read_bytes(), before)

    def test_sync_rolls_back_both_roles_on_second_write_failure(self) -> None:
        tool.generate(self.project, self.private, self.maps)
        pages = tool.stored_path(self.private, "SANDBOX", "pages")
        consumer = tool.stored_path(self.private, "SANDBOX", "consumer")
        append_d1(
            pages,
            "SANDBOX",
            "11111111-1111-4111-8111-111111111111",
            self.project,
            include_migrations_dir=False,
        )
        before_pages = pages.read_bytes()
        before_consumer = consumer.read_bytes()
        real_atomic_write = tool.atomic_write
        failed = False

        def fail_consumer_once(path: Path, text: str, **kwargs: object) -> None:
            nonlocal failed
            if path == consumer and not failed:
                failed = True
                raise OSError("injected transaction failure")
            real_atomic_write(path, text, **kwargs)

        with mock.patch.object(tool, "atomic_write", side_effect=fail_consumer_once):
            with self.assertRaisesRegex(tool.ConfigError, "CONFIG_TRANSACTION_FAILED"):
                tool.sync_d1(self.project, self.private, self.maps, "SANDBOX")
        self.assertEqual(pages.read_bytes(), before_pages)
        self.assertEqual(consumer.read_bytes(), before_consumer)

    def test_activate_and_deactivate_prevalidate_all_roles(self) -> None:
        tool.generate(self.project, self.private, self.maps)
        append_d1(
            tool.stored_path(self.private, "SANDBOX", "pages"),
            "SANDBOX",
            "11111111-1111-4111-8111-111111111111",
            self.project,
        )
        tool.sync_d1(self.project, self.private, self.maps, "SANDBOX")
        active_pages = self.project / tool.ACTIVE_PAGES_NAME
        active_pages.write_bytes(
            tool.stored_path(self.private, "SANDBOX", "pages").read_bytes()
        )
        active_consumer = self.project / tool.ACTIVE_CONSUMER_NAME
        active_consumer.write_text('name = "not-owned"\n', encoding="utf-8")
        before_pages = active_pages.read_bytes()

        with self.assertRaisesRegex(tool.ConfigError, "ACTIVE_CONFIG_NOT_OWNED"):
            tool.activate(self.project, self.private, self.maps, "SANDBOX")
        self.assertEqual(active_pages.read_bytes(), before_pages)
        with self.assertRaisesRegex(tool.ConfigError, "ACTIVE_CONFIG_NOT_OWNED"):
            tool.deactivate(self.project, self.maps)
        self.assertEqual(active_pages.read_bytes(), before_pages)

    def test_selected_environment_validation_rejects_cross_environment_d1_reuse(self) -> None:
        tool.generate(self.project, self.private, self.maps)
        reused = "11111111-1111-4111-8111-111111111111"
        for environment in ("SANDBOX", "PRODUCTION"):
            for role in ("pages", "consumer"):
                tool.stored_path(self.private, environment, role).write_text(
                    tool.render_config(
                        self.project,
                        self.maps[environment],
                        role,
                        reused,
                    ),
                    encoding="utf-8",
                )
        with self.assertRaisesRegex(
            tool.ConfigError, "D1_ID_REUSED_ACROSS_ENVIRONMENTS"
        ):
            tool.validate(
                self.project, self.private, self.maps, "predeploy", "SANDBOX"
            )


class Task2SchemaProofTests(unittest.TestCase):
    def schema_connection(
        self, replacements: dict[str, tuple[str, str]] | None = None
    ) -> sqlite3.Connection:
        connection = sqlite3.connect(":memory:")
        migrations = COMMERCE_ROOT / "migrations"
        for filename in (
            "0001_initial.sql",
            "0002_physical_checkout.sql",
            "0003_operational_monitoring.sql",
        ):
            source = (migrations / filename).read_text(encoding="utf-8")
            if replacements is not None and filename in replacements:
                old, new = replacements[filename]
                self.assertIn(old, source)
                source = source.replace(old, new)
            connection.executescript(source)
        connection.execute(
            "CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT)"
        )
        connection.executemany(
            "INSERT INTO d1_migrations (name) VALUES (?)",
            [
                ("0001_initial.sql",),
                ("0002_physical_checkout.sql",),
                ("0003_operational_monitoring.sql",),
            ],
        )
        return connection

    def proof_results(self, connection: sqlite3.Connection) -> list[list[tuple]]:
        statements = sql_statements(
            (COMMERCE_ROOT / "tools" / "task2-schema-proof.sql").read_text()
        )
        return [connection.execute(statement).fetchall() for statement in statements]

    def test_schema_proof_passes_exact_three_migration_schema(self) -> None:
        results = self.proof_results(self.schema_connection())
        checks = [row for rows in results[:4] for row in rows]
        self.assertEqual([row[1] for row in checks], ["PASS", "PASS", "PASS", "PASS"])
        self.assertTrue(results[-1])

    def test_schema_proof_rejects_same_name_index_definition_drift(self) -> None:
        connection = self.schema_connection()
        connection.executescript(
            "DROP INDEX idx_operational_queue_canaries_status;"
            "CREATE INDEX idx_operational_queue_canaries_status "
            "ON operational_queue_canaries(updated_at);"
        )
        results = self.proof_results(connection)
        self.assertEqual(results[0][0][1], "PASS")
        self.assertEqual(results[1][0][0], "schema_definition_set")
        self.assertEqual(results[1][0][1], "FAIL")

    def test_schema_proof_rejects_same_name_constraint_drift(self) -> None:
        connection = self.schema_connection(
            {
                "0003_operational_monitoring.sql": (
                    "CHECK (occurrence_count > 0)",
                    "CHECK (occurrence_count >= 0)",
                )
            }
        )
        results = self.proof_results(connection)
        self.assertEqual(results[0][0][1], "PASS")
        self.assertEqual(results[1][0][0], "schema_definition_set")
        self.assertEqual(results[1][0][1], "FAIL")


if __name__ == "__main__":
    unittest.main()
