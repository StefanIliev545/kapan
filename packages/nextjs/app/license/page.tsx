import React from "react";
import { getMetadata } from "~~/utils/scaffold-eth/getMetadata";

export const metadata = {
  ...getMetadata({
    title: "License",
    description: "Kapan Finance license terms covering code, documentation, and trademarks.",
  }),
  alternates: {
    canonical: "/license",
  },
};

const effectiveDate = "2025-10-22";

const LicensePage = () => {
  return (
    <div className="prose container mx-auto px-4 py-8">
      <h1>Kapan Finance — License &amp; Terms</h1>

      <p>
        <strong>Effective date:</strong> {effectiveDate}
      </p>

      <h2>Plain-English summary (not a substitute for the legal text below):</h2>
      <ul>
        <li>
          <strong>Code (smart contracts, SDKs, tooling):</strong> Open source under Apache License 2.0. You can use,
          modify, and distribute—even commercially—subject to attribution/NOTICE and the patent and conditions in that
          license.
        </li>
        <li>
          <strong>Docs &amp; website text (excluding brand assets):</strong> Shared under CC BY 4.0. You can reuse/adapt—even
          commercially—with proper credit and link to the license.
        </li>
        <li>
          <strong>Brand/trademarks:</strong> (“Kapan”, the Kapan logotype, and related marks): Not open-licensed; limited,
          revocable permission for factual references and nominative fair use only.
        </li>
        <li>
          <strong>Risks:</strong> Interacting with permissionless smart contracts is risky. No warranties; you may lose all
          value. No financial/legal advice.
        </li>
      </ul>

      <h2>A. Software License (Code)</h2>
      <p>
        The protocol smart contracts, SDKs, and developer tooling published by [LEGAL ENTITY OR PROJECT TEAM] in our
        GitHub organization [ORG/REPO NAMES] are licensed under the Apache License, Version 2.0 (“Apache-2.0”).
      </p>
      <p>
        <strong>SPDX identifier to include at the top of source files:</strong>
        <br />
        SPDX-License-Identifier: Apache-2.0
      </p>
      <p>
        A copy of the Apache-2.0 license text is included in each repository’s LICENSE file. The license includes an
        express patent grant and contribution terms.
        <br />
        <a href="https://www.apache.org/licenses/LICENSE-2.0" target="_blank" rel="noreferrer">
          Apache Software Foundation
        </a>
        <br />
        +1
      </p>
      <p>
        A NOTICE file may accompany certain code and must be preserved in redistributions where applicable (see
        Apache-2.0 §4).
        <br />
        <a href="https://www.apache.org/licenses/LICENSE-2.0" target="_blank" rel="noreferrer">
          Apache Software Foundation
        </a>
      </p>
      <p>
        <strong>Contributions.</strong> By submitting a pull request, you agree your contribution is licensed under
        Apache-2.0 and you certify the Developer Certificate of Origin (DCO 1.1) via “Signed-off-by” in your commits.
        <br />
        <a href="https://developercertificate.org/" target="_blank" rel="noreferrer">
          developercertificate.org
        </a>
      </p>

      <h2>B. Documentation &amp; Website Content</h2>
      <p>
        Unless otherwise marked, our documentation and website text (blog posts, how-tos, explanatory copy) are
        licensed under Creative Commons Attribution 4.0 International (CC BY 4.0). You may copy, remix, transform, and
        build upon the material, including commercially, provided you give appropriate credit and link to the license.
      </p>
      <p>
        For details, see the CC BY 4.0 legal code and human-readable summary.
        <br />
        <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">
          Creative Commons
        </a>
        <br />
        +1
      </p>
      <p>
        <strong>Exclusions:</strong> Source code (covered by Section A), brand assets (Section C), and third-party content
        are not covered by CC BY 4.0 unless explicitly stated.
      </p>

      <h2>C. Trademarks &amp; Branding</h2>
      <p>
        “Kapan”, the Kapan wordmark/logo, and related brand assets are trademarks of [LEGAL ENTITY]. No license to use
        our trademarks is granted by Apache-2.0 or CC BY 4.0. You may make factual, nominative references (e.g.,
        “compatible with Kapan Finance”), but you must not imply endorsement, create confusingly similar branding, or use
        our marks in product names, domain names, or advertising without prior written permission.
      </p>

      <h2>D. Important Risk, Eligibility &amp; Compliance Notices</h2>
      <ul>
        <li>
          <strong>No financial advice.</strong> Information is for educational purposes only and does not constitute
          investment, legal, or tax advice.
        </li>
        <li>
          <strong>Protocol &amp; smart-contract risk.</strong> The protocol may be experimental; risks include contract bugs,
          oracle/network failures, liquidation, slashing, and market volatility.
        </li>
        <li>
          <strong>Non-custodial / self-directed use.</strong> Interactions are executed by you on public networks at your
          own risk.
        </li>
        <li>
          <strong>Eligibility &amp; restrictions.</strong> Access may be geofenced or restricted to comply with applicable laws
          and sanctions (e.g., OFAC/EU/UK). You are responsible for ensuring your use is legal in your jurisdiction.
        </li>
        <li>
          <strong>Third-party dependencies.</strong> We may integrate with or reference third-party tools, networks, or data
          sources; we do not control or guarantee them.
        </li>
      </ul>

      <h2>E. Warranty Disclaimer &amp; Limitation of Liability</h2>
      <p>
        THE SOFTWARE, SITE, AND CONTENT ARE PROVIDED “AS IS” AND “AS AVAILABLE”, WITHOUT WARRANTIES OF ANY KIND, express
        or implied. TO THE MAXIMUM EXTENT PERMITTED BY LAW, IN NO EVENT SHALL WE OR OUR CONTRIBUTORS BE LIABLE FOR ANY
        INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, OR FOR LOST PROFITS/REVENUE/
        GOODWILL/DATA, ARISING OUT OF OR RELATED TO YOUR USE OF THE PROTOCOL OR SITE, EVEN IF ADVISED OF THE POSSIBILITY OF
        SUCH DAMAGES. OUR AGGREGATE LIABILITY SHALL NOT EXCEED USD $100 OR THE AMOUNTS YOU PAID US (IF ANY) FOR ACCESS TO
        THE SITE IN THE 3 MONTHS PRECEDING THE CLAIM, WHICHEVER IS GREATER.
      </p>

      <h2>F. Dispute Resolution; Governing Law</h2>
      <p>
        <strong>Courts.</strong> Exclusive jurisdiction and venue in the courts of Bulgaria.
        <br />
        Governing law: Bulgaria (excluding conflict-of-laws rules).
      </p>

      <h2>G. Changes</h2>
      <p>
        We may update these terms from time to time. If we make material changes, we will update the “Effective date”
        above.
      </p>

      <p>
        <strong>Contact:</strong> <a href="mailto:stefan.iliev545@gmail.com">stefan.iliev545@gmail.com</a>
      </p>
    </div>
  );
};

export default LicensePage;
