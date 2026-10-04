param(
  [Parameter(Mandatory = $true)][string] $ScriptsRoot,
  [string] $EvidenceRoot = (Join-Path ([IO.Path]::GetTempPath()) ('almanack-request-recovery-' + [guid]::NewGuid().ToString('N')))
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$script:checks = 0
$script:ApiVersion = '2026-04-01'
$script:AlmanackRequestLogPath = ''
$script:NetworkCalls = [Collections.Generic.List[object]]::new()
$script:RequireStarted = $false
$script:FailNetwork = $false
$script:LockJournalOnSuccess = $false
$script:CompletionLock = $null
$script:ApiKey = 'offline-test-token-not-a-secret'
$null = New-Item -ItemType Directory -Force -Path $EvidenceRoot

function Assert-Equal($Expected, $Actual, [string] $Label) {
  if ($Expected -cne $Actual) { throw "$Label`: expected '$Expected', got '$Actual'." }
  $script:checks++
}

function Assert-True([bool] $Value, [string] $Label) {
  if (-not $Value) { throw "$Label`: assertion failed." }
  $script:checks++
}

function Assert-Rejected([scriptblock] $Action, [string] $Label) {
  $failure = $null
  try { & $Action | Out-Null } catch { $failure = $_ }
  Assert-True ($null -ne $failure) $Label
  return $failure
}

function Get-FileAst([string] $Path) {
  $tokens = $null
  $errors = $null
  $ast = [Management.Automation.Language.Parser]::ParseFile($Path, [ref] $tokens, [ref] $errors)
  if ($errors.Count -ne 0) { throw "Cannot parse $Path`: $($errors.Message -join '; ')" }
  return $ast
}

function Get-FunctionText($Ast, [string] $Name) {
  $matches = @($Ast.FindAll({ param($node)
    $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -ceq $Name
  }, $true))
  if ($matches.Count -ne 1) { throw "Expected one function $Name; found $($matches.Count)." }
  return $matches[0].Extent.Text
}

function Get-Sha256([string] $Value) {
  $hash = [Security.Cryptography.SHA256]::Create()
  try { return ([BitConverter]::ToString($hash.ComputeHash([Text.Encoding]::UTF8.GetBytes($Value)))).Replace('-', '').ToLowerInvariant() }
  finally { $hash.Dispose() }
}

function Read-Events([string] $Path) {
  return @(Get-Content -LiteralPath $Path | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | ForEach-Object { $_ | ConvertFrom-Json })
}

function Reset-Mock([string] $Name, [bool] $Journal = $true) {
  $script:NetworkCalls.Clear()
  $script:RequireStarted = $Journal
  $script:FailNetwork = $false
  $script:LockJournalOnSuccess = $false
  $script:AlmanackRequestLogPath = if ($Journal) { Join-Path $EvidenceRoot ($Name + '.jsonl') } else { '' }
}

# Both network commands are shadowed for this process. Only function ASTs are
# imported; loading a provider script never executes its top-level workflow.
function global:Invoke-WebRequest { throw 'Unexpected network command blocked by offline test.' }
function global:Invoke-RestMethod {
  param($Method, $Uri, $Headers, $TimeoutSec, $ContentType, $Body, $StatusCodeVariable)
  $copiedHeaders = @{}
  foreach ($key in $Headers.Keys) { $copiedHeaders[$key] = $Headers[$key] }
  $script:NetworkCalls.Add([pscustomobject]@{ Method = [string] $Method; Url = [string] $Uri; Headers = $copiedHeaders; Body = $Body })
  if ($script:RequireStarted) {
    Assert-True (Test-Path -LiteralPath $script:AlmanackRequestLogPath) 'Journal exists before network'
    $events = @(Read-Events $script:AlmanackRequestLogPath)
    Assert-Equal 'started' $events[-1].stage 'Started event persisted before network'
    Assert-Equal ([string] $Method).ToUpperInvariant() $events[-1].method 'Started method matches actual request'
    Assert-Equal ([string] $Uri) $events[-1].url 'Started URL matches actual request'
  }
  if ($script:FailNetwork) {
    $exception = [Exception]::new('Synthetic offline HTTP failure')
    $exception | Add-Member -NotePropertyName Response -NotePropertyValue ([pscustomobject]@{ StatusCode = 500 })
    throw $exception
  }
  if ($script:LockJournalOnSuccess) {
    # Hold an exclusive handle after the request has succeeded, making the
    # actual completion AppendAllText fail without replacing the journal helper.
    $script:CompletionLock = [IO.File]::Open($script:AlmanackRequestLogPath, [IO.FileMode]::Open, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
  }
  if ($StatusCodeVariable) { Set-Variable -Name $StatusCodeVariable -Value 200 -Scope 1 }
  return [pscustomobject]@{ ok = $true; marker = 'offline-response' }
}

$helperPath = Join-Path $ScriptsRoot 'almanack_buttondown_request_log.ps1'
$helperAst = Get-FileAst $helperPath
. ([scriptblock]::Create((Get-FunctionText $helperAst 'Write-AlmanackRequestEvent')))

# Null, empty, and whitespace log paths must remain harmless for function users.
foreach ($blankPath in @($null, '', '   ')) {
  Write-AlmanackRequestEvent -Path $blankPath -Stage started -Method Get -Url 'https://offline.invalid/emails/test' -IdempotencyKey $null -JsonBody $null
  $script:checks++
}

$contractPath = Join-Path $EvidenceRoot 'journal-contract.jsonl'
$body = '{"recipients":["owner@example.invalid"],"note":"caf' + [char] 0xE9 + '"}'
$bodyHash = Get-Sha256 $body
Write-AlmanackRequestEvent -Path $contractPath -Stage started -Method post -Url 'https://offline.invalid/emails/test/send-draft' -IdempotencyKey 'same-key-123' -JsonBody $body
Write-AlmanackRequestEvent -Path $contractPath -Stage completed -Method POST -Url 'https://offline.invalid/emails/test/send-draft' -IdempotencyKey 'same-key-123' -JsonBody $body -HttpStatus 200
Write-AlmanackRequestEvent -Path $contractPath -Stage failed -Method GET -Url 'https://offline.invalid/emails/test' -IdempotencyKey ' ' -JsonBody $null -HttpStatus 500
$events = @(Read-Events $contractPath)
Assert-Equal 3 $events.Count 'JSONL appends every event'
Assert-Equal 'started,completed,failed' (($events.stage) -join ',') 'Journal stages retained'
Assert-Equal 'POST' $events[0].method 'Journal normalizes request method'
Assert-Equal 'same-key-123' $events[0].idempotency_key 'Journal retains exact idempotency key'
Assert-Equal $bodyHash $events[0].body_sha256 'Journal uses SHA256 over UTF8 body'
Assert-Equal $bodyHash $events[1].body_sha256 'Completed event retains body hash'
Assert-Equal $null $events[0].http_status 'Unknown HTTP status stays null'
Assert-Equal $null $events[2].idempotency_key 'Blank key journaled as null'
Assert-Equal $null $events[2].body_sha256 'Null body journaled as null'
Assert-Equal 200 $events[1].http_status 'Successful HTTP status retained'
Assert-Equal 500 $events[2].http_status 'Failed HTTP status retained'
foreach ($event in $events) {
  $timestampFields = @($event.PSObject.Properties | Where-Object { $_.Name -match '^(timestamp|timestamp_utc|at|at_utc|created_at|recorded_at)$' })
  Assert-Equal 1 $timestampFields.Count 'Each event has one timestamp field'
  $parsed = [datetimeoffset]::MinValue
  Assert-True ([datetimeoffset]::TryParse([string] $timestampFields[0].Value, [ref] $parsed)) 'Event timestamp is valid'
  Assert-True (-not ($event.PSObject.Properties.Name -match '^(headers|authorization|api_key|json_body|body|response)$')) 'Journal excludes credentials and raw content'
}
Assert-True (-not ((Get-Content -LiteralPath $contractPath -Raw).Contains('owner@example.invalid'))) 'Recipient body is only hashed'

$targets = @(
  @{ Label = 'manager'; File = 'manage_buttondown_almanack_email.ps1'; Function = 'Invoke-ButtondownRequest' },
  @{ Label = 'sender'; File = 'send_almanack_to_buttondown.ps1'; Function = 'Invoke-ButtondownEmailRequest' },
  @{ Label = 'runner'; File = 'run_almanack_buttondown_preview.ps1'; Function = 'Invoke-ButtondownJson' }
)

foreach ($target in $targets) {
  $ast = Get-FileAst (Join-Path $ScriptsRoot $target.File)
  foreach ($name in @('Redact-SecretText', 'Get-ButtondownErrorInfo', $target.Function)) {
    . ([scriptblock]::Create((Get-FunctionText $ast $name)))
  }
  $functionName = $target.Function
  $url = 'https://offline.invalid/v1/emails/em_offline_test'

  # The omitted value reproduces the original typed-string parameter defect.
  $blankCases = @(
    @{ Label = 'omitted'; Bind = $false; Value = $null },
    @{ Label = 'null'; Bind = $true; Value = $null },
    @{ Label = 'empty'; Bind = $true; Value = '' },
    @{ Label = 'whitespace'; Bind = $true; Value = " `t " }
  )
  foreach ($method in @('Get', 'Post', 'Patch')) {
    foreach ($case in $blankCases) {
      Reset-Mock ($target.Label + '-' + $method + '-' + $case.Label)
      $arguments = @{ Method = $method; Url = $url; ApiKey = $script:ApiKey }
      if ($method -ne 'Get') { $arguments.JsonBody = $body }
      if ($case.Bind) { $arguments.IdempotencyKey = $case.Value }
      $response = & $functionName @arguments
      Assert-Equal 'offline-response' $response.marker 'HTTP helper preserves response'
      Assert-Equal 1 $script:NetworkCalls.Count 'One network invocation only'
      Assert-True (-not $script:NetworkCalls[0].Headers.ContainsKey('X-Idempotency-Key')) "$($target.Label) $method $($case.Label) key header omitted"
      Assert-Equal ('Token ' + $script:ApiKey) $script:NetworkCalls[0].Headers.Authorization 'Authorization passed to network mock'
      Assert-Equal $ApiVersion $script:NetworkCalls[0].Headers['X-API-Version'] 'API version preserved'
      $events = @(Read-Events $script:AlmanackRequestLogPath)
      Assert-Equal 'started,completed' (($events.stage) -join ',') 'Successful request journal order'
      Assert-Equal $null $events[0].idempotency_key 'Blank key has null journal value'
      if ($method -eq 'Get') {
        Assert-Equal $null $script:NetworkCalls[0].Body 'GET sends no body'
        Assert-Equal $null $events[0].body_sha256 'GET journal records no request body'
      } else {
        Assert-Equal $body $script:NetworkCalls[0].Body 'Mutation body unchanged'
        Assert-Equal $bodyHash $events[0].body_sha256 'Mutation body hash matches request'
      }
      Assert-True (-not ((Get-Content -LiteralPath $script:AlmanackRequestLogPath -Raw).Contains($script:ApiKey))) 'Credentials never journaled'
    }

    Reset-Mock ($target.Label + '-' + $method + '-explicit-key')
    $key = '  preserve-this-key-exactly  '
    $response = & $functionName -Method $method -Url $url -ApiKey $script:ApiKey -IdempotencyKey $key -JsonBody $body
    Assert-Equal $key $script:NetworkCalls[0].Headers['X-Idempotency-Key'] 'Nonblank key header remains exact'
    $events = @(Read-Events $script:AlmanackRequestLogPath)
    Assert-Equal $key $events[0].idempotency_key 'Journal key equals actual request key'
  }

  Reset-Mock ($target.Label + '-no-journal') $false
  $null = & $functionName -Method Get -Url $url -ApiKey $script:ApiKey
  Assert-Equal 1 $script:NetworkCalls.Count 'Blank log path supports isolated function calls'

  Reset-Mock ($target.Label + '-journal-failure')
  # A directory cannot be appended as a JSONL file on Windows or Unix.
  $script:AlmanackRequestLogPath = $EvidenceRoot
  $null = Assert-Rejected { & $functionName -Method Post -Url $url -ApiKey $script:ApiKey -IdempotencyKey 'key' -JsonBody $body } 'Failed initial journal write rejects request'
  Assert-Equal 0 $script:NetworkCalls.Count 'Journal failure prevents network'

  Reset-Mock ($target.Label + '-http-failure')
  $script:FailNetwork = $true
  $failure = Assert-Rejected { & $functionName -Method Get -Url $url -ApiKey $script:ApiKey } 'HTTP error propagates'
  Assert-Equal 1 $script:NetworkCalls.Count 'HTTP failure causes no automatic retry'
  $events = @(Read-Events $script:AlmanackRequestLogPath)
  Assert-Equal 'started,failed' (($events.stage) -join ',') 'HTTP error journal has no completed event'
  Assert-Equal 500 $events[-1].http_status 'HTTP failure status journaled'

  Reset-Mock ($target.Label + '-completion-journal-failure')
  $script:LockJournalOnSuccess = $true
  try {
    $failure = Assert-Rejected { & $functionName -Method Post -Url $url -ApiKey $script:ApiKey -IdempotencyKey 'successful-mutation-key' -JsonBody $body } 'Completion journal failure is reported'
  } finally {
    if ($null -ne $script:CompletionLock) {
      $script:CompletionLock.Dispose()
      $script:CompletionLock = $null
    }
  }
  Assert-True ($failure.Exception.Message -match 'request succeeded, but its completion could not be recorded\. Do not retry\.') 'Completion failure acknowledges remote success and forbids retry'
  Assert-True ($failure.Exception.Message -notmatch '(API|lifecycle|preview) request failed') 'Completion failure is not labelled an API failure'
  Assert-Equal 1 $script:NetworkCalls.Count 'Completion journal failure never retries network'
  $events = @(Read-Events $script:AlmanackRequestLogPath)
  Assert-Equal 1 $events.Count 'Completion journal failure leaves only original started record'
  Assert-Equal 'started' $events[0].stage 'No misleading failed event after successful HTTP request'
  Assert-Equal 'successful-mutation-key' $events[0].idempotency_key 'Original mutation key remains available for reconciliation'
}

# Execute the exact manager statements from the readback guard through the
# mutation call, with only prerequisites stubbed. A failed GET must unwind the
# real sequence before Assert-AlmanackButtondownNumbering or POST can run.
$managerAst = Get-FileAst (Join-Path $ScriptsRoot 'manage_buttondown_almanack_email.ps1')
foreach ($name in @('Redact-SecretText', 'Get-ButtondownErrorInfo', 'Invoke-ButtondownRequest')) {
  . ([scriptblock]::Create((Get-FunctionText $managerAst $name)))
}
$mainTry = @($managerAst.EndBlock.Statements | Where-Object { $_ -is [Management.Automation.Language.TryStatementAst] })
Assert-Equal 1 $mainTry.Count 'Manager has one top-level execution try block'
$statements = @($mainTry[0].Body.Statements)
$start = -1
$finish = -1
for ($i = 0; $i -lt $statements.Count; $i++) {
  if ($statements[$i].Extent.Text -match '\$readback\s*=\s*Invoke-ButtondownRequest') { $start = $i }
  if ($statements[$i].Extent.Text -match '^\$response\s*=\s*Invoke-ButtondownRequest') { $finish = $i }
}
Assert-True ($start -ge 0 -and $finish -gt $start) 'Actual readback-to-mutation flow found'
$flow = [scriptblock]::Create((($statements[$start..$finish] | ForEach-Object { $_.Extent.Text }) -join "`n"))
$DryRun = $false
$Action = 'SendPreview'
$Endpoint = 'https://offline.invalid/v1/emails'
$EmailId = 'em_offline_test'
$apiKey = $script:ApiKey
$shared = [pscustomobject]@{ IssueNumber = 23; Subject = 'Issue 23' }
$request = [pscustomobject]@{ Method = 'Post'; Url = "$Endpoint/$EmailId/send-draft"; Body = @{ recipients = @('owner@example.invalid') } }
$idempotencyKey = 'persist-this-mutation-key'
$script:NumberChecks = 0
function Assert-AlmanackButtondownNumbering { $script:NumberChecks++; throw 'Number check must not run after failed GET.' }
Reset-Mock 'actual-manager-failed-get'
$script:FailNetwork = $true
$null = Assert-Rejected $flow 'Actual lifecycle stops on readback failure'
Assert-Equal 1 $script:NetworkCalls.Count 'Actual lifecycle sends only one request on GET failure'
Assert-Equal 'Get' $script:NetworkCalls[0].Method 'Actual lifecycle failed request is GET'
Assert-Equal 0 $script:NumberChecks 'Number assertion is not reached after failed GET'
$events = @(Read-Events $script:AlmanackRequestLogPath)
Assert-Equal 'started,failed' (($events.stage) -join ',') 'Actual lifecycle failed GET journal'
Assert-True (-not (@($script:NetworkCalls | Where-Object Method -eq 'Post').Count)) 'Actual lifecycle never POSTs after failed GET'

Write-Host "PASS: $script:checks offline request recovery checks. Evidence: $EvidenceRoot"
