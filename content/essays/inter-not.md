---
title: "Inter-Not"
subtitle: "We now return to local programming."
description: "Two cloud failures and a living-room test show what changes when households and libraries run their own services."
author: "Robert V. Ussley"
contributor_role: ""
editor_name: ""
editor_url: ""
editor_note: ""
guest_links: []
date: 2026-11-13
publishDate: 2026-11-13T13:14:14-05:00
draft: false
slug: "inter-not"
section_label: "Essay"
version: "1.0"
edition: "First web edition"
featured: false
featured_image: "essays/inter-not/hero"
featured_image_alt: "Seen from behind, a family of four sits on a couch facing a television with a large buffering wheel."
featured_image_caption: "Please Stand By. A family waits for the movie to load."
collections:
  - "technology-ai-machine-future"
---

At 11:17 a.m. Eastern on November 12, 2026, [Microsoft 365's cloud email service began to fail](https://mailservices.isc.upenn.edu/computing/email/penno365/alerts/ms-incidents.html?q=EX1550543). Some people couldn't open their Outlook inboxes, and mail backed up. The outage also made it harder to schedule meetings in Teams because its calendar relied on the same email service. Microsoft traced the extra load to servers dropping out and their traffic shifting to the ones left running.

In July, [AI agents escaped an internal OpenAI test environment](https://openai.com/index/hugging-face-incident-and-the-road-ahead/) and broke into Hugging Face. They exploited flaws in the software that processes datasets, then used the credentials they obtained to reach several groups of servers. [Hugging Face's investigation found](https://huggingface.co/blog/agent-intrusion-technical-timeline) that the agents accessed five customer datasets that appeared to be related to cybersecurity benchmarks.

The cloud will lose its place as the default for files and software people can keep and run themselves. As customers ask cloud companies to store more and do more, those companies need spare capacity to keep work moving when servers fail. Each new service gives them more software to secure. When many people rely on the same service, a failure can reach every app that depends on it. Those pressures will push households and local institutions to run more services on networks they own and connect those networks to share what they choose. Start with the TV in your living room.

## The Movie Keeps Playing

> You pick what goes in the library and what comes up first.
> - Bobby V.

Put a few family videos on a spare computer and [install Jellyfin](https://jellyfin.org/docs/general/quick-start/). Keep the computer awake. Connect the computer and TV to the same home network so Jellyfin can stream the files between them. Open the Jellyfin app on your Android TV or Google TV device and enter [your Jellyfin server's local address](https://jellyfin.org/docs/general/post-install/networking/), such as http://192.168.1.20:8096. [Projectivy Launcher](https://projectivylauncher.com/) lets you put Jellyfin first on the home screen.

On Friday night, turn on the TV and go straight to the school concert you filmed last spring. There's [no monthly fee for Jellyfin](https://jellyfin.org/), and [you can set the home screen to show the apps you choose](https://projectivylauncher.com/), free of ads and a feed that decides what to show you next. A managed service takes care of its servers and software updates for you. At home, you supply the disk space, pay for the electricity, and back up the videos you want to keep.

Start a movie. Disconnect only the router's incoming internet connection. Leave the router powered on and both devices connected to the home network. [The movie can keep playing](https://jellyfin.org/docs/general/post-install/networking/). Before you reconnect the internet, pick another video and press play. Starting a new video shows that the TV can reach the computer down the hall.

![Cutaway of a house. Gold arrows lead from a spare computer through the home router to a TV playing a school concert. A dashed blue line from the router ends at a red X marked Internet connection down.](oip-image:essays/inter-not/section-1)

*The Movie Takes the Short Way Home. The router carries the video from the spare computer to the TV while the internet connection is down.*

[Fans recompiled the Nintendo 64 game *Majora's Mask*](https://github.com/Zelda64Recomp/Zelda64Recomp) so you can play it on a modern computer with your own copy of the original game. You can also plan next month's bills in [Actual Budget](https://actualbudget.org/docs/vision/) and keep the records on your computer.

## And Now, a Word From Your Neighbors

> Each library decides what to host and what to put on its front page.
> - Bobby V.

Your public library could run a video site for oral histories and films made by local students. The library in the next town could do the same. [PeerTube lets the two sites follow each other](https://docs.joinpeertube.org/admin/following-instances), so patrons can find the next town's films on their own library's site. To play a film, the viewer needs to reach the server that hosts it or another server set up to serve a copy. Each library needs disk space and someone to install updates and keep its site running.

As more towns joined, you could browse collections run by libraries across the country. On the same TV where you watch your family's home movies, you could pull up a documentary your neighbors made, hosted at the library where they recorded it.
