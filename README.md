# Scrollfly

[Open the website](https://sebastian-stapf.github.io/scrollfly/)

A fly-connectome watch-time replay with the Fly / Wirehead 3D model. The fly
watches real ShortVideo clips, likes qualifying videos halfway through its
prediction, and scrolls at the predicted watch time. The page includes an
illustrative fly score, original-video progress and recorded neural activity.

Switch to **Environment** to explore the original 2D/3D foraging simulator,
fly manually, try independent wing controls, or run the labeled sensor reflex.
This page shows interactive MaleCNS anatomy without simulated neural activity.
The trained brain pilot needs a separate compute service and is not exposed
by this static website. No private service is contacted by the public page.

Both pages include a light/dark switch beside their navigation. Light is the
initial default, and an explicit choice is remembered across visits and tabs.
The video, fly model and scientific viewports retain their original colors.

The readout was trained on 500 videos and evaluated on 50 creator-disjoint
videos. The website shows 49 of those clips after a display exclusion; the
evaluation results are unchanged. The readout does not beat the constant
baseline in this sample. The full connectome remains frozen.

`site/` contains the website source. Videos and neural recordings are release
assets, not Git objects. The Pages workflow verifies `publication.json` and
checks source/bundle equality before deploying the exact recorded replay.
Updates require a new verified release bundle and matching publication record.
Pushing to `codex/github-pages` deploys the verified bundle; **Publish Scrollfly**
can also be run manually in Actions.

Attributions: [Stonkfly](https://github.com/nftechie/stonkfly),
[Fly / Wirehead](https://github.com/mattyhempstead/fly-wirehead),
[ShortVideo](https://github.com/tsinghua-fib-lab/ShortVideo_dataset),
[MaleCNS](https://male-cns.janelia.org/download), and [Three.js](https://threejs.org).
See `site/CREDITS.txt` and the separate source/license notices. Third-party
code, data and videos retain their respective terms.
