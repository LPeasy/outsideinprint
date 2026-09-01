# Studio Funnel Operations

Keep prospect messages, attachments, and private notes out of the public repository. Filter Studio messages with the current `inquiry.subject_prefix` value in `data/studio.yaml`.

## Funnel stages

1. Received in the support inbox
2. Reviewed
3. Qualified
4. Clarification requested, when needed
5. Scope sent
6. Deposit invoice sent
7. Deposit paid / scheduled
8. Draft delivered
9. Revision received
10. Final payment received
11. Final files released
12. Testimonial and referral requested, with permission

## Qualification checklist

- Buyer fits the defined segment.
- One primary source set fits the published limits.
- Desired reader and result are clear.
- Subject matter fits Outside In Print's capabilities.
- No known conflict with existing professional duties.
- No confidential, classified, privileged, export-controlled, or restricted material is included.
- Buyer acknowledges the current price and deposit.
- Requested schedule is realistic.

## Positive reply template

Subject: Re: [original Studio inquiry subject]

Hello [name],

Your proposed essay about [subject] appears to fit the Publication Sprint. To prepare the written scope, I need [only the missing information].

The current published rate is [current price from `data/studio.yaml`], with a [deposit percentage from `data/studio.yaml`] deposit due after scope acceptance. I will request source files only after the scope is accepted and a transfer method is confirmed.

Once I have [missing information], I will send the one-page scope and next step by [specific date].

Best,

Outside In Print Studio

## Clarification template

Subject: Re: [original Studio inquiry subject]

Hello [name],

Thank you for the inquiry. Before I can confirm fit, please reply with:

1. [missing fact]
2. [missing fact]
3. [missing fact, only when necessary]

Please do not send source files yet. I will reply with a fit decision after reviewing those details.

Best,

Outside In Print Studio

## Not-fit template

Subject: Re: [original Studio inquiry subject]

Hello [name],

Thank you for considering Outside In Print. This project does not fit the current Publication Sprint scope, so I will not be able to take it on. I appreciate the clear inquiry and wish you well with the piece.

Best,

Outside In Print Studio

## Scope checklist

- Client and project title
- Primary source set
- Intended reader
- Central outcome
- Included deliverables
- Explicit exclusions
- Schedule trigger
- Revision limit
- Rights transferred after full payment
- Price
- Deposit and final payment
- Acceptance method

## Measurement

- GoatCounter: discovery, email-draft preparation, and direct-email clicks
- Support inbox: received inquiries
- Manual review: qualification and scopes
- Square: deposits and final payments

Do not build a CRM or record lead data in Git.
