# Canonical numbering for the existing local Buttondown handoff. No network calls.
function ConvertTo-AlmanackIssueNumber {
  param($Value, [string] $Name = 'issue_number')
  $number = 0
  if ($null -eq $Value -or $Value -is [bool] -or $Value -is [double] -or $Value -is [single] -or
      $Value -is [decimal] -or [string] $Value -notmatch '^[1-9][0-9]*$' -or
      -not [int]::TryParse([string] $Value, [ref] $number)) {
    throw "$Name must be a positive integer."
  }
  return $number
}

function Get-AlmanackIssueNumber {
  param([Parameter(Mandatory = $true)] $Metadata)
  $number = ConvertTo-AlmanackIssueNumber $Metadata.issue_number 'email.json issue_number'
  foreach ($entry in @(
      @{ Name = 'secondary_id'; Value = $Metadata.secondary_id },
      @{ Name = 'content.issue_number'; Value = $Metadata.content.issue_number }
    )) {
    if ((ConvertTo-AlmanackIssueNumber $entry.Value $entry.Name) -ne $number) {
      throw "email.json $($entry.Name) must equal canonical issue_number $number."
    }
  }
  if ([string] $Metadata.subject -notmatch ('\bIssue ' + $number + '$')) {
    throw "The exported subject must end with Issue $number."
  }
  if ($Metadata.content.PSObject.Properties['email_masthead']) {
    $masthead = $Metadata.content.email_masthead
    if ($null -ne $masthead -and
        (ConvertTo-AlmanackIssueNumber $masthead.issue_number 'email_masthead.issue_number') -ne $number) {
      throw "The masthead must use canonical issue_number $number."
    }
  }
  return $number
}

function Assert-AlmanackButtondownDraft {
  param([Parameter(Mandatory = $true)] $Response, [string] $ExpectedEmailId = '')
  if ([string]::IsNullOrWhiteSpace([string] $Response.id) -or [string] $Response.status -ne 'draft') {
    throw 'Buttondown email must be an identified draft; sent or scheduled emails are not changed.'
  }
  if ($ExpectedEmailId -and [string] $Response.id -cne $ExpectedEmailId) {
    throw 'Buttondown returned a different email id; stop before changing or delivering it.'
  }
}

function Assert-AlmanackButtondownNumbering {
  param(
    [Parameter(Mandatory = $true)] $Response,
    [Parameter(Mandatory = $true)] [int] $ExpectedIssueNumber,
    [Parameter(Mandatory = $true)] [string] $ExpectedSubject,
    [string] $ExpectedEmailId = ''
  )
  Assert-AlmanackButtondownDraft -Response $Response -ExpectedEmailId $ExpectedEmailId
  $number = ConvertTo-AlmanackIssueNumber $Response.secondary_id 'Buttondown secondary_id'
  if ($number -ne $ExpectedIssueNumber -or [string] $Response.subject -cne $ExpectedSubject) {
    throw "Buttondown number and subject must match canonical Issue $ExpectedIssueNumber before delivery."
  }
}
