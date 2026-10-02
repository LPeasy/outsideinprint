# Almanack signup review

This review moves the existing campaign form into the opening text column,
before the artwork on mobile, and adds a small shortcut from every Almanack
issue heading to its existing end-of-issue form. Campaign and issue copy,
artwork, the homepage, navigation, gallery, email exports, and Saturday workflow
are preserved.

## Confirmation handoff (pending separate approval)

The current embedded forms submit a native POST to Buttondown. The misleading
“successfully subscribed” popup belongs to Buttondown, not this site's markup.
[Buttondown's supported form guidance](https://docs.buttondown.com/building-your-subscriber-base)
requires retaining native form navigation for CAPTCHA and validation errors;
intercepting the POST with `fetch` would lose those flows.

The proposed `/subscribe/confirmation/` page contains the owner's exact copy:

> One more step: check your inbox and click the confirmation link to finish subscribing. If you don’t see the email, check spam.

It is excluded from page listings and marked `noindex`. Reaching it does not
claim that email confirmation has completed. No browser-side submit handler,
optimistic success state, or invented per-form redirect field is added.

On October 1, 2026, the signed-in Outside In Print account's **Settings >
Subscribing > Redirects** exposed **After subscribing** ("Redirect unconfirmed
subscribers to this URL") and **After confirming** ("Redirect confirmed
subscribers to this URL"). Both values were blank and were left unchanged.

After the website changes are approved and deployed, replacing the provider
popup requires separate approval to set only **After subscribing** to
`https://outsideinprint.org/subscribe/confirmation/`. Leave **After confirming**
blank, since readers at that stage have already confirmed. This is a newsletter
setting and applies to its accepted signup handoffs, including other embedded
forms. It does not change the approved email design or subscription policy.
Without that setting change, the proposed page is ready but the current
Buttondown popup remains in use.

Failed submissions and CAPTCHA challenges must remain on Buttondown's own
response; they must not be sent to this confirmation page. Local browser review
uses mocked native POST responses (accepted redirect, rejected submission, and
an HTTP 200 verification challenge). These mocks prove page behavior, not a
live provider redirect that has not been enabled. No subscribers or test emails
are created during this review.

Run the focused output check after a Hugo build:

```powershell
.\tools\bin\generated\pwsh.cmd -NoLogo -NoProfile -File .\tests\test_subscriber_funnel_contract.ps1
```

No merge, deployment, or Buttondown setting change is part of this review.
