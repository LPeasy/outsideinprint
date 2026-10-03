param(
  [string] $HelperPath = (Join-Path (Split-Path -Parent $PSScriptRoot) 'scripts/almanack_buttondown_numbering.ps1'),
  [string] $WorkspaceRoot = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. $HelperPath
$script:checks = 0

function Assert-Equal($Expected, $Actual, [string] $Label) {
  if ($Expected -cne $Actual) { throw "$Label`: expected '$Expected', got '$Actual'." }
  $script:checks++
}

function Assert-Rejected([scriptblock] $Action, [string] $Label) {
  $rejected = $false
  try { & $Action | Out-Null } catch { $rejected = $true }
  if (-not $rejected) { throw "$Label`: expected rejection." }
  $script:checks++
}

function New-Metadata([int] $Number = 23) {
  return [pscustomobject]@{
    issue_number = $Number
    secondary_id = $Number
    subject = "Bob's Almanack ~ October 10, 2026 ~ Issue $Number"
    content = [pscustomobject]@{
      issue_number = $Number
      email_masthead = [pscustomobject]@{ issue_number = $Number }
    }
  }
}

function New-Response([int] $Number = 23) {
  return [pscustomobject]@{
    id = 'em_offline_test'
    status = 'draft'
    secondary_id = $Number
    subject = "Bob's Almanack ~ October 10, 2026 ~ Issue $Number"
  }
}

foreach ($number in @(1, 23, 124)) {
  Assert-Equal $number (Get-AlmanackIssueNumber -Metadata (New-Metadata $number)) "Source issue $number"
  $response = New-Response $number
  Assert-AlmanackButtondownNumbering -Response $response -ExpectedIssueNumber $number -ExpectedSubject $response.subject -ExpectedEmailId $response.id
  $script:checks++
}

foreach ($field in @('issue_number', 'secondary_id')) {
  $metadata = New-Metadata
  $metadata.PSObject.Properties.Remove($field)
  Assert-Rejected { Get-AlmanackIssueNumber -Metadata $metadata } "Missing metadata.$field"
  $metadata = New-Metadata
  $metadata.$field = 22
  Assert-Rejected { Get-AlmanackIssueNumber -Metadata $metadata } "Mismatched metadata.$field"
}

foreach ($bad in @($null, 0, -1, 23.5, $true, '', 'twenty-three')) {
  $metadata = New-Metadata
  $metadata.issue_number = $bad
  Assert-Rejected { Get-AlmanackIssueNumber -Metadata $metadata } "Invalid canonical issue '$bad'"
  $response = New-Response
  $response.secondary_id = $bad
  Assert-Rejected { Assert-AlmanackButtondownNumbering -Response $response -ExpectedIssueNumber 23 -ExpectedSubject (New-Metadata).subject } "Invalid provider secondary_id '$bad'"
}

$metadata = New-Metadata
$metadata.content.issue_number = 22
Assert-Rejected { Get-AlmanackIssueNumber -Metadata $metadata } 'Content issue mismatch'
$metadata = New-Metadata
$metadata.content.PSObject.Properties.Remove('issue_number')
Assert-Rejected { Get-AlmanackIssueNumber -Metadata $metadata } 'Missing content issue'
$metadata = New-Metadata
$metadata.content.email_masthead.issue_number = 22
Assert-Rejected { Get-AlmanackIssueNumber -Metadata $metadata } 'Masthead issue mismatch'
$metadata = New-Metadata
$metadata.content.PSObject.Properties.Remove('email_masthead')
Assert-Equal 23 (Get-AlmanackIssueNumber -Metadata $metadata) 'Optional image masthead absent'

foreach ($subject in @("Bob's Almanack ~ Issue 22", "Bob's Almanack", "Bob's Almanack ~ Issue 23 extra")) {
  $metadata = New-Metadata
  $metadata.subject = $subject
  Assert-Rejected { Get-AlmanackIssueNumber -Metadata $metadata } "Invalid canonical subject '$subject'"
}

foreach ($field in @('secondary_id', 'subject', 'status', 'id')) {
  $response = New-Response
  $response.PSObject.Properties.Remove($field)
  Assert-Rejected { Assert-AlmanackButtondownNumbering -Response $response -ExpectedIssueNumber 23 -ExpectedSubject (New-Metadata).subject -ExpectedEmailId 'em_offline_test' } "Missing provider $field"
}

$response = New-Response
$response.secondary_id = 18
$response | Add-Member -NotePropertyName metadata -NotePropertyValue ([pscustomobject]@{ canonical_issue_number = 23 })
Assert-Rejected { Assert-AlmanackButtondownNumbering -Response $response -ExpectedIssueNumber 23 -ExpectedSubject (New-Metadata).subject } 'Canonical metadata cannot mask provider footer mismatch'

foreach ($status in @('sent', 'scheduled', 'about_to_send')) {
  $response = New-Response
  $response.status = $status
  Assert-Rejected { Assert-AlmanackButtondownNumbering -Response $response -ExpectedIssueNumber 23 -ExpectedSubject (New-Metadata).subject } "Non-draft provider status $status"
}

$response = New-Response
$response.subject += ' changed'
Assert-Rejected { Assert-AlmanackButtondownNumbering -Response $response -ExpectedIssueNumber 23 -ExpectedSubject (New-Metadata).subject } 'Changed provider subject'
$response = New-Response
$response.id = 'em_wrong'
Assert-Rejected { Assert-AlmanackButtondownNumbering -Response $response -ExpectedIssueNumber 23 -ExpectedSubject (New-Metadata).subject -ExpectedEmailId 'em_offline_test' } 'Wrong provider email id'
$response = New-Response
$response.subject += ' [Design preview: offline-test]'
Assert-AlmanackButtondownNumbering -Response $response -ExpectedIssueNumber 23 -ExpectedSubject $response.subject -ExpectedEmailId $response.id
$script:checks++

if ($WorkspaceRoot) {
  # Load only the actual payload-builder function, never execute the provider script.
  $previewPath = Join-Path $WorkspaceRoot 'scripts/run_almanack_buttondown_preview.ps1'
  $tokens = $null
  $errors = $null
  $ast = [System.Management.Automation.Language.Parser]::ParseFile($previewPath, [ref] $tokens, [ref] $errors)
  if ($errors.Count) { throw "PowerShell parse failure: $previewPath" }
  $builder = $ast.Find({ param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'New-ButtondownPayload' }, $false)
  if ($null -eq $builder) { throw 'Actual preview payload builder was not found.' }
  . ([scriptblock]::Create($builder.Extent.Text))
  function Get-IssueDate { param($ResolvedPackagePath) return [datetime] '2026-10-10' }
  function Get-AlmanackButtondownBody { param($ResolvedPackagePath) return [pscustomobject]@{ Body = '<p>https://example.test/image.png</p>'; Subject = (New-Metadata).subject; Preheader = 'Offline fixture'; IssueNumber = 23 } }
  function Get-LeadImageUrl { param($ResolvedPackagePath) return '' }
  function Get-CanonicalUrl { param($ResolvedPackagePath) return 'https://example.test/almanack/2026-10-10/' }
  $EmailTemplate = 'classic'
  $Recipient = 'offline@example.test'

  foreach ($isUpdate in @($false, $true)) {
    $built = New-ButtondownPayload -ResolvedPackagePath 'offline-package' -IsUpdate $isUpdate
    Assert-Equal 23 $built.Payload.secondary_id 'Actual preview payload top-level footer number'
    Assert-Equal (New-Metadata).subject $built.Payload.subject 'Actual preview payload subject'
  }
  $built = New-ButtondownPayload -ResolvedPackagePath 'offline-package' -IsUpdate $false -DesignPreviewRunId 'offline-test' -BodyImageSourceUrl 'https://example.test/image.png' -BodyImageReplacementUrl 'https://example.test/replacement.png'
  Assert-Equal 23 $built.Payload.secondary_id 'Design preview canonical number'
  Assert-Equal ((New-Metadata).subject + ' [Design preview: offline-test]') $built.Payload.subject 'Design preview subject'

  $sendPath = Join-Path $WorkspaceRoot 'scripts/send_almanack_to_buttondown.ps1'
  $ast = [System.Management.Automation.Language.Parser]::ParseFile($sendPath, [ref] $tokens, [ref] $errors)
  if ($errors.Count) { throw "PowerShell parse failure: $sendPath" }
  $payloadStatement = $ast.Find({ param($node) $node -is [System.Management.Automation.Language.AssignmentStatementAst] -and $node.Left.Extent.Text -eq '$payload' }, $true)
  $shared = Get-AlmanackButtondownBody 'offline-package'
  $subject = $shared.Subject
  $body = $shared.Body
  $packageDir = 'offline-package'
  $issueDate = [datetime] '2026-10-10'
  . ([scriptblock]::Create($payloadStatement.Extent.Text))
  Assert-Equal 23 $payload.secondary_id 'Actual draft mailer top-level footer number'

  $managerPath = Join-Path $WorkspaceRoot 'scripts/manage_buttondown_almanack_email.ps1'
  $ast = [System.Management.Automation.Language.Parser]::ParseFile($managerPath, [ref] $tokens, [ref] $errors)
  if ($errors.Count) { throw "PowerShell parse failure: $managerPath" }
  $mainTry = @($ast.EndBlock.Statements | Where-Object { $_ -is [System.Management.Automation.Language.TryStatementAst] })[0]
  $guard = @($mainTry.Body.Statements | Where-Object { $_ -is [System.Management.Automation.Language.IfStatementAst] -and $_.Extent.Text -match 'Assert-AlmanackButtondownNumbering' })
  if ($guard.Count -ne 1) { throw 'Expected one actual pre-delivery numbering guard.' }
  $delivery = @($mainTry.Body.Statements | Where-Object { $_ -is [System.Management.Automation.Language.AssignmentStatementAst] -and $_.Left.Extent.Text -eq '$response' })[0]
  if ($guard[0].Extent.EndOffset -ge $delivery.Extent.StartOffset) { throw 'Numbering guard must precede delivery.' }
  $source = Get-Content -LiteralPath $managerPath -Raw
  $deliveryBlock = [scriptblock]::Create($source.Substring($guard[0].Extent.StartOffset, $delivery.Extent.EndOffset - $guard[0].Extent.StartOffset))
  function Invoke-ButtondownRequest {
    param($Method, $Url, $ApiKey, $IdempotencyKey, $JsonBody)
    $script:requestedMethods.Add([string] $Method)
    if ($Method -eq 'Get') { return $script:providerReadback }
    return [pscustomobject]@{ id = 'em_offline_test'; status = 'mock_delivery_only' }
  }
  $Endpoint = 'https://example.test/v1/emails'
  $EmailId = 'em_offline_test'
  $apiKey = 'offline-placeholder'
  $idempotencyKey = 'offline-only'
  $DryRun = $false
  foreach ($Action in @('SendPreview', 'ScheduleDraft', 'SendNow')) {
    $method = if ($Action -eq 'SendPreview') { 'Post' } else { 'Patch' }
    $request = [pscustomobject]@{ Method = $method; Url = "$Endpoint/$EmailId"; Body = @{} }
    $script:requestedMethods = New-Object 'System.Collections.Generic.List[string]'
    $script:providerReadback = New-Response
    $script:providerReadback.secondary_id = 18
    Assert-Rejected { & $deliveryBlock } "$Action refuses mismatched footer"
    Assert-Equal 'Get' ($script:requestedMethods -join ',') "$Action mismatch must prevent delivery request"
    $script:requestedMethods.Clear()
    $script:providerReadback = New-Response
    & $deliveryBlock
    Assert-Equal "Get,$method" ($script:requestedMethods -join ',') "$Action validates before delivery request"
  }
}

Write-Host "Buttondown numbering: $script:checks offline checks passed."
