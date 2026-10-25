---
title: "Breach of Confidence: How Private Are Your Therapy Records?"
subtitle: "Therapy privacy depends on who can see your records, where they go, and who protects them."
description: "How therapy records move through billing, insurers and vendors, and what patients can ask about confidentiality and safeguards."
author: "Elijah Fernandez, MSW, PMP, CISSP"
contributor_role: "guest"
editor_name: "Robert V. Ussley"
editor_url: "https://outsideinprint.org/authors/robert-v-ussley/"
editor_note: "A therapy record can pass through systems a patient never sees. This essay demands better systems to protect those records now with specific lessons drawn from security engineering."
guest_links: []
date: 2026-10-27
publishDate: 2026-10-27T11:00:00-04:00
draft: false
slug: "breach-of-confidence-therapy-records"
section_label: "Essay"
version: "1.0"
edition: "First web edition"
featured: false
featured_image: "essays/breach-of-confidence-therapy-records/hero"
featured_image_alt: "An unmarked medical file rests on a table between a warmly lit therapy room and a shadowed corridor with filing cabinets and servers."
featured_image_caption: "The promise made in the therapy room depends on the systems that carry its records."
collections:
  - "risk-uncertainty"
tags:
  - "therapy confidentiality"
  - "medical records"
  - "privacy"
---

In 2024, hackers attacked [Change Healthcare](https://www.changehealthcare.com/), a company that handles *health insurance claims*. These are requests for an insurer to pay for care. The company later [estimated that 192.7 million people might be affected](https://agportal-s3bucket.s3.amazonaws.com/databreach/BreachA30075.pdf). Change Healthcare handles claims and payment data between healthcare organizations and insurers. Patients can be affected by a breach there without ever dealing with it directly.

When you seek therapy, *confidentiality* is part of the promise ~ what you say stays private, within the limits of the law. Your therapist may explain those limits without describing who else can open the record.

I have spent about 20 years in healthcare *information technology* (IT), much of it in mental health. One lesson from that work applies here ~ a policy is only as strong as the system that enforces it. The clinic decides which staff can open a record and what outside firms can do with it. It also needs a way to spot access that should not happen.

## Why people hold back

People run their own *threat models*, even if they would never use that term. They ask a simple question: What could go wrong? A doctor wonders if a diagnosis might hurt their career. A business owner worries who can see an insurance claim. An executive fears a private record might show up in a dispute. Without a clear map of where their information goes, people have to guess, and some choose silence.

## Follow one session record

Think of a visit you expect insurance to help pay for. You leave the room, but the work on your record goes on.

Your therapist may keep personal notes about your conversation apart from the regular medical record. The legal term is *psychotherapy notes*, and they have [extra legal protection](https://www.hhs.gov/hipaa/for-professionals/faq/does-hipaa-provide-extra-protections-mental-health-information-compared-other-health.html). Most sharing needs your permission, though the law has exceptions. Some laws require abuse reports or warnings about serious and imminent threats. States differ on when such warnings are required or allowed. The extra protection for psychotherapy notes does not cover all notes made during care.

Your diagnosis, care plan and progress can be part of the regular medical record. When the clinic sends a claim to your *health plan*, some of that information can go with it. The plan is the insurer or program that helps pay for your care. Federal rules [allow sharing for payment](https://www.hhs.gov/hipaa/for-professionals/privacy/guidance/disclosures-treatment-payment-health-care-operations/index.html) without separate permission from you.

Outside companies may also store records or help with bills and claims. The law calls many of them *business associates*. They must have [agreements on how to use and protect the data](https://www.hhs.gov/hipaa/for-professionals/privacy/guidance/business-associates/index.html). Those agreements set duties. They cannot promise that nothing will go wrong.

Clinics use different routes, and a company on the route may see only part of the record. Sharing for care and payment can be lawful and necessary. Each place that holds the data needs safeguards. Patients deserve to see the path that ordinary work creates.

![A therapy session leads to separately kept psychotherapy notes with extra legal protection, and to an ordinary medical record. Billing sends claim details to a health plan. Outside vendors may support the record, billing and claim systems.](oip-image:essays/breach-of-confidence-therapy-records/section-1)

*A visit can leave more than one record. Separate psychotherapy notes have extra protection, with exceptions. The ordinary record can support billing and care.*

CEREVITY, a private-pay network of independent licensed therapists, [reviewed its own clients](https://cerevity.com/62-percent-high-achievers-worse-decisions-hiding-strain-2026/). Some recalled worse decisions while hiding strain. The review covered 261 people who sought care through our network, and the analysis used their own ratings of past decisions. It measured no decision outcomes and cannot show how common this is in the wider public or prove that hiding strain caused the change.

My view is that some people hold back from seeking care because they cannot see where their words will go. Their concern about privacy may be reasonable. We should hear it before assuming their hesitation comes from *stigma* ~ fear of being judged for seeking help. The company review does not test my explanation. If I am right, making the record's path clear is an integral part of providing care and not merely an administrative afterthought.

## Three ways to protect the promise

Security work starts by asking what needs protection and where it could go wrong. The answers help decide who gets access. Three principles apply to the therapy record.

![Three principles: limit access by role, keep sensitive notes separate and check access logs, and explain where data goes and when it may be shared.](oip-image:essays/breach-of-confidence-therapy-records/section-2)

*Limit access, keep sensitive notes separate, and explain the path. Each step needs a person who makes sure it works.*

### Give each role only what it needs

A person who books visits may need to see the time without needing the full account of what you said. Security calls this kind of limited access *least privilege*. The same question applies to the staff who send bills.

Federal rules [limit what can be used or shared](https://www.hhs.gov/hipaa/for-professionals/privacy/guidance/minimum-necessary-requirement/index.html) for tasks such as payment. The rules have exceptions, including sharing between providers for treatment. Clinics need to set access around each person's job.

### Keep the most sensitive notes apart

Separate notes only help if clinicians keep them separate and write the regular record knowing that it may travel.

An *access log* records activity in a system, such as who opened or changed a file. Providers covered by federal security rules must [record and examine activity in their electronic health record systems](https://www.hhs.gov/hipaa/for-professionals/security/laws-regulations/index.html). A log no one reads is a camera with no one watching the feed. Recording is the easy half ~ someone needs to read the log and follow up on access that looks wrong.

### Explain where the record goes

Alongside the privacy notice, patients need to know what goes to the health plan and which vendors handle the record. They also need to know how long it is kept, and when the law allows or requires sharing. Some of those rules vary by state.

There is also a [right to restrict some sharing with a health plan](https://www.hhs.gov/hipaa/for-professionals/faq/under-hipaa-may-an-individual-request-that-a-covered-entity-restrict-how-it-uses-or-discloses-that-individuals-protect-health-information/index.html). You must ask for the restriction, and you or someone other than your plan must pay the full cost of that service. A provider covered by federal privacy rules must then agree. The restriction covers information only about that service, shared for payment or *health plan operations*. These operations include the plan's administrative work. Sharing required by law is an exception.

## Someone has to own the design

In my experience, privacy tends to sit with the staff who handle *compliance* ~ making sure the rules are followed. Security sits with IT, while the patient's experience of both belongs to no one. A shared map shows those teams which systems hold the record, who can open it and what happens if one stop fails. Drawing it may be the first time anyone sees the whole path. Someone must take responsibility for the design and check that the safeguards work.

CEREVITY uses *private pay ~* clients pay for therapy directly, so no insurance claim is filed. Many people cannot carry that cost. CEREVITY has records, vendors and access logs to protect.

![A clinic staff member studies a screen with rows of activity and one highlighted row. A closed folder lies nearby, and an empty therapy room is visible beyond glass.](oip-image:essays/breach-of-confidence-therapy-records/section-3)

*Access logs need a reader, and suspicious access needs a response.*

## Questions to ask before seeking care

Leaders and human resources teams often suggest care to someone who is struggling. The suggestion lands better when it comes with real answers. Before referring someone, or seeking care yourself, you can ask a provider ~

1. Where is my record kept, and who can open it?
2. What goes to my health plan with a claim? How do I request a restriction if I pay the full cost without using my plan?
3. Which outside companies handle my information?
4. Do you keep psychotherapy notes apart from the regular record?
5. Who checks the access logs, and how often?
6. When does the law allow or require you to share?

These questions are not hostile. Each one points to a part of the system. A provider who can answer plainly has thought about the path. One who cannot may do good work, but the patient is left to guess.

## Privacy Has to Survive the Paperwork

No system is free of risk, and better design will not persuade everyone to seek care. The people who build and run these systems have work to do ~ limit access, keep sensitive notes apart, read the logs and explain where the record goes. Patients should be able to see the system that carries their words. Building that visibility is an engineering task as much as a clinical one, and it is overdue.

## About the author

Elijah Fernandez, MSW, PMP, CISSP, is co-founder and chief technology officer of [CEREVITY Health, Inc.](https://cerevity.com/) He has spent about 20 years in healthcare IT, including as director of IT operations at a national mental health company. He writes about health data, security and how systems shape behavior.

*Disclosure: The author is a co-founder of CEREVITY, a private-pay therapy network.*
