---
title: "Contribution Guidelines & CLA"
description: "Guidelines for contributing to SyncingBoard, signing off commits under DCO, running unit tests, and CLA compliance."
---

# Contributing to SyncingBoard

First off, thank you for taking the time to contribute! Contributions from the community help make SyncingBoard better for everyone.

By contributing to this project, you agree to abide by our contribution guidelines and terms.

> [!NOTE]
> Please note that reviewing contributions takes time as every pull request must be thoroughly checked for security, quality, and design system alignment. Thank you for your patience during this review process!

---

## Developer Certificate of Origin (DCO) & Licensing

To ensure that all code in SyncingBoard remains open-source and legally unencumbered, we use the **Developer Certificate of Origin (DCO)**. 

By submitting a Pull Request, you certify that:
1. **You authored the contribution**, or you have the legal right to submit it under the GNU Affero General Public License v3 (AGPL-3.0) and CLA terms.
2. **You understand and agree** that your contributions will be licensed under the project's **GNU Affero General Public License v3 (AGPL-3.0)** and the repository's Contributor License Agreement (CLA).

To confirm this, please sign off your Git commits by adding a `Signed-off-by` line to your commit messages (or using the `-s` flag):
```bash
git commit -s -m "feat: my awesome contribution"
```
This adds the following text to the end of your commit message:
`Signed-off-by: Random Developer <random@developer.com>`

---

## Local Development Setup

To set up your local workspace for development:

1. **Clone the repository:**
   ```bash
   git clone https://github.com/luismichio/syncingboard.git
   ```
2. **Install dependencies:**
   ```bash
   yarn install
   ```
3. **Configure local environment variables (`.env.local`):**
   Copy the example environment values from `README.md` and configure your local Figma/Miro Client IDs.
4. **Run the development server:**
   ```bash
   yarn dev
   ```

---

## Pull Request Checklist

Before submitting a Pull Request, please ensure that:
- [ ] Code is strictly typed in TypeScript (no `any` types).
- [ ] Code has been verified and compiles cleanly without warnings (`yarn build`).
- [ ] The code matches all linting rules (`yarn lint`).
- [ ] All unit tests pass, and new tests are written for new functionality (`yarn test`).
- [ ] Commit messages are signed off (`git commit -s`).

Thank you for contributing!
