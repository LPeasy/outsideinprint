# DependencyTemplate Polishing Prompt Set

Use this prompt set to drive a final polishing cycle for `C:\Users\lawto\Documents\DependencyTemplate`.

The prompts are ordered so another Codex agent can run them in sequence:

1. establish context
2. implement the remaining polish gaps
3. assess completeness
4. verify and validate the finished template
5. harden any findings
6. close out with a concise summary plus remaining gaps and next steps

This prompt set is aimed first at polishing the current `DependencyTemplate`, and it ends with explicit instructions for how future Codex projects should adopt the template.

## 1. Master Prompt

Use this first to establish scope, standards, and the required end state.

```text
You are working in C:\Users\lawto\Documents\DependencyTemplate.

Your job is to finish the final polish on DependencyTemplate so it is not just "ready", but clean, coherent, and well-documented for future Windows-first Codex projects.

Current priorities are:
1. payload integrity pinning for the optional Node mirror artifact
2. stronger Node artifact/version verification in the Node export flow
3. verification/report metadata consistency
4. a concise maintenance/update guide for pinned portable payloads and mirror artifacts
5. any remaining polish needed to make docs, examples, verification, and adoption flow feel complete and internally consistent

Constraints:
- Do not introduce workbook-specific logic.
- Keep the template copy-safe and standalone.
- Do not commit third-party binaries.
- Preserve the current manifest-driven, repo-local, Windows-first model.
- Keep the root default manifest minimal.
- Treat C:\Users\lawto\Documents\code_packages as a machine-local source only, never as the runtime location for adopted repos.
- The supported optional Node toolchain remains: node, npm, npx, corepack.
- Python, pip, Playwright launcher stubs, and unrelated code_packages executables remain out of scope unless explicitly needed for documentation exclusions.

Required end state:
- schema/manifest contract remains explicit and stable
- docs/examples/verification are aligned with actual engine behavior
- Node artifact export, validation, and provenance are tightened
- a maintenance/update guide exists for future operators
- future Codex agents can understand how to adopt the template by reading START-HERE.md and the supporting docs
- after all work, provide a succinct breakdown of:
  - work performed
  - remaining gaps
  - next steps

When making changes:
- prefer small, defensible changes
- verify behavior in disposable repos where appropriate
- update docs only after implementation details are settled
- keep the final answer concise and high signal
```

## 2. First Implementation Pass

Use this prompt to make the first polishing changes.

```text
Implement the first polishing pass for DependencyTemplate.

Focus on these concrete tasks:
1. Add Node artifact integrity pinning to the supported Node example.
2. Strengthen the Node export flow so it verifies not only node.exe but also the bundled npm and corepack versions, and fails if the exported artifact does not match the pinned example expectations.
3. Add or update one concise maintenance guide that explains:
   - how to update a pinned portable payload
   - how to regenerate a mirror artifact
   - how to recalculate and update sha256 values
   - how to rerun the verification matrix after a version bump
4. Refresh any onboarding/reference docs that become inaccurate because of these changes.

Do not expand scope beyond these polish items unless you discover a direct blocker.

After implementing:
- rerun only the directly relevant checks for the changed areas
- report what changed and any issues found
- do not yet do the full final verification sweep
```

## 3. Completeness Pass

Use this prompt after the first implementation pass to inspect for missing polish.

```text
Perform a completeness pass on DependencyTemplate after the first implementation pass.

Review the repository as a template product, not just as code:
- README.md
- START-HERE.md
- docs/
- examples/
- scripts/
- tools/
- verification docs

Check for:
- mismatches between engine behavior and docs
- missing references to the Node example or maintenance flow
- stale version/date/provenance language
- unsupported examples accidentally presented as supported
- adoption guidance that still leaves too much implied
- maintenance steps that are still under-specified
- verification claims that are no longer aligned with what was actually tested

Make only the minimum edits needed to close real completeness gaps.

At the end, report:
- what was incomplete
- what you fixed
- any gaps that remain intentionally deferred
```

## 4. Verification And Validation Pass

Use this prompt to run the full evidence-based validation sweep.

```text
Run a verification and validation pass for DependencyTemplate.

Required coverage:
1. root template baseline
   - generate wrappers
   - provision
   - validate
2. manifest contract checks
   - supported schema versions
   - invalid schema rejection
   - duplicate tool rejection
   - duplicate/reserved wrapper rejection
3. fresh repo adoption
4. existing repo adoption
5. mirror/cache behavior
   - mirror-first provisioning
   - shared-cache seeding
   - shared-cache hydration into a second repo
6. Node path
   - export Node artifact from C:\Users\lawto\Documents\code_packages
   - provision fresh repo from manifest.node-toolchain.json
   - validate node/npm/npx/corepack repo-local resolution
   - confirm wrapper PATH precedence over fake conflicts
7. any still-supported browser/headless and Office/headless flows that are part of the documented template surface

Requirements:
- use disposable repos/workspaces for execution checks
- do not leave runtime artifacts in the tracked template repo
- update the verification report so it reflects the actual test run date and actual scenarios executed
- do not claim success for scenarios that were not rerun

At the end, report:
- which scenarios passed
- which scenarios passed with caveats
- any blockers discovered
```

## 5. Hardening Pass

Use this prompt only after the verification pass identifies remaining issues or weak spots.

```text
Perform a hardening pass on DependencyTemplate based on the latest verification findings.

Focus only on issues that materially improve confidence or determinism, such as:
- brittle validation rules
- incomplete artifact/version checks
- doc/verification inconsistencies
- weak provenance or hash update flow
- adoption flow ambiguities
- wrapper or PATH edge cases exposed by testing

Do not reopen settled architecture or broaden template scope.

For each hardening change:
- make the smallest change that closes the issue cleanly
- rerun the targeted verification needed to prove the fix
- update docs only where behavior or operator guidance changed

At the end, report:
- what findings were hardened
- what verification was rerun
- what, if anything, still remains outside the template's intended scope
```

## 6. Final Wrap Up Prompt

Use this last to produce the final user-facing closeout.

```text
Finish the DependencyTemplate polishing cycle.

Before answering, ensure:
- docs and examples reflect actual supported behavior
- verification documentation matches the latest run
- no disposable verification repos or transient runtime artifacts remain in the tracked template repo
- the template still presents a clear path for future Codex adoption

In your final chat response, provide a succinct breakdown of:
1. work performed
2. remaining gaps
3. next steps

Also include a short user instruction block for future Codex projects that explains:
- the canonical source path to copy from:
  C:\Users\lawto\Documents\DependencyTemplate
- that future agents should read START-HERE.md first
- when to copy the whole template versus when to use install-into-target-repo.ps1
- that adopters should start by choosing/editing tools/toolchain.manifest.json
- the standard command flow:
  call tools\generate_tool_wrappers.cmd
  call tools\provision_toolchain.cmd
  call tools\validate_toolchain.cmd

Keep the final response concise, concrete, and non-marketing.
```

## Future Project Adoption Instructions

Include or reuse these instructions whenever a future Codex project should adopt the template:

```text
To adopt DependencyTemplate in a future Codex project:

1. Use this canonical source path:
   C:\Users\lawto\Documents\DependencyTemplate

2. Read START-HERE.md first before changing anything.

3. Choose the adoption mode:
   - Fresh repo: copy the entire DependencyTemplate folder into the new project root.
   - Existing repo: run scripts\install-into-target-repo.ps1 from the canonical template repo into the target repo.

4. In the adopted repo, start by choosing or editing:
   tools\toolchain.manifest.json

5. If a supported example fits, start from the closest example manifest in examples\ or examples\toolchain\.

6. Run the standard workflow from the adopted repo root:
   call tools\generate_tool_wrappers.cmd
   call tools\provision_toolchain.cmd
   call tools\validate_toolchain.cmd

7. Only use tools\bin\custom when manifest-driven wrappers are not sufficient.

8. Keep third-party binaries out of git. Portable payloads should be sourced through mirrors, shared cache, and repo-local provisioning under tools\vendor.
```

## Assumptions

- The prompt set is for polishing the current `DependencyTemplate`, not redesigning it.
- The current supported Windows-first scope remains intact.
- Node remains an optional supported example, not part of the default baseline.
- The prompt set should end with a concise in-chat summary of completed work, remaining gaps, and next steps.
