"""Verify source identity and reproduce the approved distribution artifacts offline."""
import hashlib
import json
import runpy
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def validate(package_dir):
    directory = Path(package_dir)
    errors = []
    try:
        metadata = json.loads((directory / "email.json").read_text(encoding="utf-8"))
        issue = directory / "web-archive.md"
        if metadata.get("source_sha256") != hashlib.sha256(issue.read_bytes()).hexdigest():
            errors.append("email.json does not match the final web-archive.md source; rerender.")
        if metadata.get("distribution_contract") != "classic-shared-v1" or metadata.get("buttondown_template") != "classic":
            errors.append("Distribution must use classic-shared-v1 and Buttondown Classic.")
        content = metadata["content"]
        if content.get("editorial_contract") != "almanack-v1":
            errors.append("New distributions require editorial_contract: almanack-v1.")
        masthead = content.get("email_masthead", {})
        if not masthead.get("image_url") or not masthead.get("image_alt"):
            errors.append("The approved issue masthead and complete alt text are required.")
        if metadata.get("preheader") != content.get("email_preheader"):
            errors.append("The exported preheader must match the specific email_preheader.")
        module = runpy.run_path(str(ROOT / "scripts/render_almanack_distribution.py"))
        with tempfile.TemporaryDirectory(prefix="almanack-distribution-check-") as output:
            fresh = module["render"](issue, output)
            if metadata.get("email_contrast_contract") != fresh.get("email_contrast_contract"):
                errors.append("email.json email_contrast_contract is stale.")
            for suffix, key in (("html", "html_sha256"), ("txt", "text_sha256")):
                actual = (directory / f"email.{suffix}").read_bytes()
                expected = (Path(output) / f"email.{suffix}").read_bytes()
                if actual != expected:
                    errors.append(f"email.{suffix} differs from the shared renderer and approved footer.")
                if metadata.get(key) != hashlib.sha256(actual).hexdigest():
                    errors.append(f"email.{suffix} hash is stale.")
            for key in ("issue_date", "issue_number", "secondary_id", "subject", "preheader", "content", "exporter_commit", "exporter_base_commit", "exporter_extension", "exporter_extension_sha256"):
                if metadata.get(key) != fresh.get(key):
                    errors.append(f"email.json {key} is stale.")
    except Exception as exc:
        errors.append(f"Shared distribution validation failed: {exc}")
    return errors
