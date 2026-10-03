#!/usr/bin/env python3
"""Install canonical numbering guards into the existing, local OIP handoff.

No network calls. Preflight every exact edit before writing; preserve backups.
The website repository owns this adapter because the outer workflow is local-only.
"""
import argparse
import hashlib
import json
from pathlib import Path
import uuid


NUMBERING_POLICY = (
    "For each future issue, set Buttondown's per-email Issue number (API secondary_id) "
    "to the source canonical issue_number. Metadata alone does not set the footer. "
    "Read back the saved draft and require its secondary_id and subject to match the "
    "validated export and masthead before preview, scheduling or sending. Stop on a "
    "missing number or mismatch. Keep sent emails unchanged; do not rely on a global next counter."
)


def replace_once(text, old, new, label):
    """Accept exactly one old snippet, or exactly one already-installed snippet."""
    if text.count(new) == 1:
        if old in text.replace(new, "", 1):
            raise ValueError(f"{label}: mixed old and installed snippets; no files changed")
        return text
    if text.count(old) != 1:
        raise ValueError(f"{label}: expected exactly one known snippet; no files changed")
    return text.replace(old, new, 1)


def patch_script(name, text):
    edits = []
    if name == "almanack_buttondown_body.ps1":
        edits = [
            ("function Get-AlmanackButtondownBody {", ". (Join-Path $PSScriptRoot 'almanack_buttondown_numbering.ps1')\nfunction Get-AlmanackButtondownBody {"),
            ("return [pscustomobject]@{ Body = $body; Subject = [string] $metadata.subject; Preheader = [string] $metadata.preheader }",
             "return [pscustomobject]@{ Body = $body; Subject = [string] $metadata.subject; Preheader = [string] $metadata.preheader; IssueNumber = (Get-AlmanackIssueNumber -Metadata $metadata) }"),
        ]
    elif name in ("send_almanack_to_buttondown.ps1", "run_almanack_buttondown_preview.ps1"):
        edits = [
            ("    description = $shared.Preheader\n    template = $EmailTemplate",
             "    description = $shared.Preheader\n    secondary_id = $shared.IssueNumber\n    template = $EmailTemplate"),
            ("      source = 'outsideinprint-almanack-package'",
             "      source = 'outsideinprint-almanack-package'\n      canonical_issue_number = $shared.IssueNumber"),
        ]
        if name == "send_almanack_to_buttondown.ps1":
            edits += [
                ("    [ValidateSet('Post', 'Patch')]", "    [ValidateSet('Get', 'Post', 'Patch')]"),
                ("try {\n  $resolved = Resolve-Path -LiteralPath $PackagePath -ErrorAction SilentlyContinue",
                 "try {\n  if (-not [string]::IsNullOrWhiteSpace($ScheduleAt)) {\n    throw 'Create and verify a draft first; use manage_buttondown_almanack_email.ps1 -Action ScheduleDraft -PackagePath for scheduling.'\n  }\n  $resolved = Resolve-Path -LiteralPath $PackagePath -ErrorAction SilentlyContinue"),
                ("  $response = Invoke-ButtondownEmailRequest -Method $requestMethod -Url $requestUrl -ApiKey $apiKey -IdempotencyKey $idempotencyKey -JsonBody $payloadJson",
                 "  if ($isUpdate) {\n    $remote = Invoke-ButtondownEmailRequest -Method Get -Url $requestUrl -ApiKey $apiKey\n    Assert-AlmanackButtondownDraft -Response $remote -ExpectedEmailId $UpdateEmailId.Trim()\n  }\n  $response = Invoke-ButtondownEmailRequest -Method $requestMethod -Url $requestUrl -ApiKey $apiKey -IdempotencyKey $idempotencyKey -JsonBody $payloadJson"),
                ('  Write-Host "Buttondown response written: $responsePath"',
                 '  Write-Host "Buttondown response written: $responsePath"\n  Assert-AlmanackButtondownDraft -Response $response\n  $readbackUrl = "$($Endpoint.TrimEnd(\'/\'))/$([System.Uri]::EscapeDataString([string] $response.id))"\n  $readback = Invoke-ButtondownEmailRequest -Method Get -Url $readbackUrl -ApiKey $apiKey\n  Assert-AlmanackButtondownNumbering -Response $readback -ExpectedIssueNumber $shared.IssueNumber -ExpectedSubject $subject -ExpectedEmailId ([string] $response.id)'),
            ]
        else:
            edits += [
                ("    if ([string] $remote.status -ne 'draft') {\n      throw \"Remote Buttondown email $emailId is not a draft; found status '$($remote.status)'.\"\n    }",
                 "    Assert-AlmanackButtondownDraft -Response $remote -ExpectedEmailId $emailId"),
                ("  $emailId = [string] $draftResponse.id",
                 "  Assert-AlmanackButtondownDraft -Response $draftResponse -ExpectedEmailId $(if ($isUpdate) { $emailId } else { '' })\n  $emailId = [string] $draftResponse.id"),
                ('  Write-Host "Buttondown response written: $responsePath"',
                 '  Write-Host "Buttondown response written: $responsePath"\n  $readbackUrl = "$base/$([System.Uri]::EscapeDataString($emailId))"\n  $readback = Invoke-ButtondownJson -Method Get -Url $readbackUrl -ApiKey $apiKey\n  Assert-AlmanackButtondownNumbering -Response $readback -ExpectedIssueNumber $payloadInfo.Payload.secondary_id -ExpectedSubject $payloadInfo.Payload.subject -ExpectedEmailId $emailId'),
            ]
    elif name == "manage_buttondown_almanack_email.ps1":
        edits = [
            ('  [string] $CanonicalUrl = "",\n\n  [switch] $DryRun,',
             '  [string] $CanonicalUrl = "",\n\n  [string] $PackagePath = "",\n\n  [switch] $DryRun,'),
            ("$ApiVersion = '2026-04-01'", "$ApiVersion = '2026-04-01'\n. (Join-Path $PSScriptRoot 'almanack_buttondown_body.ps1')"),
            ("  $request = New-ButtondownRequest `", """  $shared = $null
  if (-not $DryRun -and $Action -ne 'UnscheduleDraft') {
    if ([string]::IsNullOrWhiteSpace($PackagePath)) {
      throw '-PackagePath is required to verify canonical numbering before preview, scheduling or sending.'
    }
    $packageDir = (Resolve-Path -LiteralPath $PackagePath).Path
    $projectRoot = Split-Path -Parent $PSScriptRoot
    $validator = Join-Path $PSScriptRoot 'validate_almanack_package.ps1'
    $powerShell = Join-Path $projectRoot 'outsideinprint\\tools\\bin\\generated\\pwsh.cmd'
    & $powerShell -NoLogo -NoProfile -File $validator $packageDir
    if ($LASTEXITCODE -ne 0) { throw 'Strict almanack package validation failed before delivery.' }
    $shared = Get-AlmanackButtondownBody -ResolvedPackagePath $packageDir
  }

  $request = New-ButtondownRequest `"""),
            ("  $jsonBody = $request.Body | ConvertTo-Json -Depth 10", """  if (-not $DryRun -and $Action -ne 'UnscheduleDraft') {
    $readbackUrl = "$($Endpoint.TrimEnd('/'))/$([System.Uri]::EscapeDataString($EmailId.Trim()))"
    $readback = Invoke-ButtondownRequest -Method Get -Url $readbackUrl -ApiKey $apiKey
    Assert-AlmanackButtondownNumbering -Response $readback -ExpectedIssueNumber $shared.IssueNumber -ExpectedSubject $shared.Subject -ExpectedEmailId $EmailId.Trim()
  }
  $jsonBody = $request.Body | ConvertTo-Json -Depth 10"""),
        ]
    elif name == "render_almanack_distribution.py":
        edits = [
            ("import json\n", "import json\nimport re\n"),
            ('    metadata = module["render"](issue, output_dir, str(hugo))', '''    metadata = module["render"](issue, output_dir, str(hugo))
    number = metadata.get("issue_number")
    content = metadata.get("content", {})
    masthead = content.get("email_masthead")
    if (type(number) is not int or number <= 0
            or type(content.get("issue_number")) is not int
            or content.get("issue_number") != number
            or not re.search(r"\\bIssue " + str(number) + r"$", metadata.get("subject", ""))
            or (masthead is not None and (type(masthead.get("issue_number")) is not int
                                         or masthead.get("issue_number") != number))):
        raise ValueError("Canonical issue number, subject and masthead must agree before Buttondown handoff.")
    metadata["secondary_id"] = number'''),
            ('    return metadata\n', '''    review_path = directory / "REVIEW.txt"
    review = review_path.read_text(encoding="utf-8")
    review += (f"\\nButtondown Issue number (top-level secondary_id): {number}. "
               "Set this per email; metadata alone does not set the footer. "
               "Read back the saved draft and verify its number and exact subject "
               "against this export and the masthead before preview, scheduling or sending.\\n")
    review_path.write_text(review, encoding="utf-8", newline="\\n")
    return metadata
'''),
        ]
    elif name == "validate_almanack_distribution.py":
        edits = [
            ('for key in ("issue_date", "issue_number", "subject", "preheader", "content"):',
             'for key in ("issue_date", "issue_number", "secondary_id", "subject", "preheader", "content"):'),
        ]
    else:
        raise ValueError(f"Unknown local script: {name}")
    if name in ("send_almanack_to_buttondown.ps1", "manage_buttondown_almanack_email.ps1"):
        edits.append((
            "  try {\n    return Invoke-RestMethod -Method $Method -Uri $Url -Headers $headers -ContentType 'application/json' -Body $JsonBody -TimeoutSec 30",
            "  try {\n    if ($Method -eq 'Get') {\n      return Invoke-RestMethod -Method Get -Uri $Url -Headers $headers -TimeoutSec 30\n    }\n    return Invoke-RestMethod -Method $Method -Uri $Url -Headers $headers -ContentType 'application/json' -Body $JsonBody -TimeoutSec 30"))
    for index, (old, new) in enumerate(edits):
        if name == "manage_buttondown_almanack_email.ps1":
            # Upgrade the exact v1 installation as well as an original workflow.
            # Its dry-run exit already preceded GET, but package validation did not.
            previous = new.replace("if (-not $DryRun -and $Action -ne 'UnscheduleDraft') {",
                                   "if ($Action -ne 'UnscheduleDraft') {")
            if previous != new and previous in text:
                text = replace_once(text, previous, new, f"{name} v1 upgrade {index + 1}")
        text = replace_once(text, old, new, f"{name} edit {index + 1}")
    return text


def plan_changes(workspace_root, skill_path, helper_source):
    root = Path(workspace_root).resolve()
    skill = Path(skill_path).resolve()
    helper = Path(helper_source).read_bytes()
    changes = []

    def update(path, transform):
        original = path.read_bytes()
        text = original.decode("utf-8").replace("\r\n", "\n")
        changed = transform(text)
        newline = "\r\n" if b"\r\n" in original else "\n"
        result = changed.replace("\n", newline).encode("utf-8")
        if result != original:
            changes.append((path, original, result))

    for name in (
        "almanack_buttondown_body.ps1", "send_almanack_to_buttondown.ps1",
        "run_almanack_buttondown_preview.ps1", "manage_buttondown_almanack_email.ps1",
        "render_almanack_distribution.py", "validate_almanack_distribution.py",
    ):
        update(root / "scripts" / name, lambda text, name=name: patch_script(name, text))

    def standard_json(text):
        previous = "Leave the provider sequence separate from canonical issue_number. Verify the actual provider plain-text footer each issue; do not claim global suppression from a draft test."
        if json.loads(text).get("provider_numbering") not in (previous, NUMBERING_POLICY):
            raise ValueError("Unknown provider_numbering policy; no files changed")
        return replace_once(text, json.dumps(previous), json.dumps(NUMBERING_POLICY), "standard.json")

    update(root / "config/almanack-email/standard.json", standard_json)
    update(root / "config/almanack-email/approved-buttondown-standard.md", lambda text: replace_once(
        text,
        "Canonical Almanack issue numbers govern the subject and masthead. Buttondown's send sequence is separate. Leave its number override blank unless an explicit, verified clarification is needed.",
        NUMBERING_POLICY, "approved-buttondown-standard.md"))
    update(skill, lambda text: replace_once(text,
        "Keep Buttondown's sequence separate from the canonical issue number.", NUMBERING_POLICY, "SKILL.md"))
    destination = root / "scripts/almanack_buttondown_numbering.ps1"
    if destination.exists():
        if destination.read_bytes() != helper:
            raise ValueError("Existing numbering helper differs; no files changed")
    else:
        changes.append((destination, None, helper))
    return changes


def install(workspace_root, skill_path, backup_dir, helper_source):
    changes = plan_changes(workspace_root, skill_path, helper_source)
    if not changes:
        return []
    # Finish all checks before creating backups or changing any installed file.
    for path, original, _ in changes:
        if (path.read_bytes() if path.exists() else None) != original:
            raise ValueError(f"{path} changed during preflight; no files changed")
    backup = Path(backup_dir).resolve() / ("almanack-numbering-" + uuid.uuid4().hex)
    backup.mkdir(parents=True)
    manifest = []
    for index, (path, original, changed) in enumerate(changes):
        filename = f"{index:02d}-{path.name}"
        if original is not None:
            (backup / filename).write_bytes(original)
        manifest.append({"path": str(path), "backup": filename if original is not None else None,
                         "before_sha256": hashlib.sha256(original).hexdigest() if original is not None else None,
                         "after_sha256": hashlib.sha256(changed).hexdigest()})
    (backup / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    for path, _, changed in changes:
        path.write_bytes(changed)
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace-root", required=True, type=Path)
    parser.add_argument("--skill-path", required=True, type=Path, help="Installed oip-bobs-almanack SKILL.md")
    parser.add_argument("--backup-dir", required=True, type=Path)
    parser.add_argument("--helper-source", type=Path, default=Path(__file__).with_name("almanack_buttondown_numbering.ps1"))
    parser.add_argument("--check", action="store_true", help="Preflight and list edits without writing")
    args = parser.parse_args()
    if args.check:
        changes = plan_changes(args.workspace_root, args.skill_path, args.helper_source)
        print(json.dumps({"check": "PASS", "pending_files": [str(change[0]) for change in changes]}, indent=2))
    else:
        print(json.dumps({"installed": install(args.workspace_root, args.skill_path, args.backup_dir, args.helper_source)}, indent=2))


if __name__ == "__main__":
    main()
