Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$runbookPath = Join-Path $repoRoot 'docs/physical-book-fulfillment-runbook.md'
$physicalSourcePath = Join-Path $repoRoot 'workers/oip-commerce/src/physical.js'
$fulfillmentSourcePath = Join-Path $repoRoot 'workers/oip-commerce/src/fulfillment.js'

foreach ($path in @($runbookPath, $physicalSourcePath, $fulfillmentSourcePath)) {
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
    throw "Missing physical-fulfillment contract source: $path"
  }
}

$runbook = Get-Content -LiteralPath $runbookPath -Raw -Encoding utf8
$physicalSource = Get-Content -LiteralPath $physicalSourcePath -Raw -Encoding utf8
$fulfillmentSource = Get-Content -LiteralPath $fulfillmentSourcePath -Raw -Encoding utf8

foreach ($required in @(
  '`PAID_REVIEW_READY` is a review handoff, not permission to ship.',
  'reservations `SOLD_VERIFIED`',
  'Read the current Payment and its exact linked Order again',
  'final Square Order recipient',
  'USPS Media Mail',
  'one book: `$4.99`',
  'two or three books: `$5.99`',
  'four through six books: `$7.49`',
  'within two business days',
  'carrier acceptance evidence',
  '`1110 Square Clearing`',
  '`4040 Direct Physical Book Revenue`',
  '`4070 Shipping Revenue`',
  '`2200 Sales and Other Taxes Payable`',
  '`6400 Bank and Merchant Fees`',
  '`1210 Finished Book Inventory`',
  '`5000 Production and Fulfillment Costs`',
  '`4090 Sales Returns and Refunds`',
  'weighted-average landed cost',
  'seven years',
  'Do not copy a raw customer street address into Git',
  'Never combine a web order with a POS or cash transaction.',
  'A web refund returns through the original Square payment',
  'Do not overwrite the bound address',
  'Restore Square inventory and the private inventory ledger only after physical inspection.',
  'Never restock a lost, customer-retained, non-resaleable, or unreceived copy.'
)) {
  if (-not $runbook.Contains($required, [StringComparison]::Ordinal)) {
    throw "Physical fulfillment runbook is missing required control: $required"
  }
}

foreach ($requiredSourceControl in @(
  'finalSquareShippingAddress',
  'physicalAddressBindingHash',
  'verifyPaperbackSaleAdjustments',
  'retrievePaperbackInventory'
)) {
  if (-not $physicalSource.Contains($requiredSourceControl, [StringComparison]::Ordinal)) {
    throw "Physical worker lost a runbook-bound verification control: $requiredSourceControl"
  }
}

if (-not $fulfillmentSource.Contains('status: evaluation.eligible ? "PAID_REVIEW_READY" : "HELD"', [StringComparison]::Ordinal)) {
  throw 'Worker must continue to stop at PAID_REVIEW_READY or HELD; it must not auto-ship.'
}

Write-Host 'Physical book fulfillment runbook contract passed.'
