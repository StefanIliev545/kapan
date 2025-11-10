import React from "react";

export const metadata = {
  title: "Privacy Policy | Kapan Finance",
};

const PrivacyPage = () => {
  return (
    <div className="container mx-auto px-4 py-8 prose">
      <h1>Privacy Policy</h1>

      <p>
        <strong>Last Updated:</strong> November 10, 2025
      </p>

      <p>
        Kapan Finance (“we”, “us”, or “our”) is a decentralized finance platform that allows users to optimize their
        crypto borrowing costs by moving debt positions between multiple lending protocols. We respect your privacy and
        are committed to protecting your personal data. This Privacy Policy explains what information we collect, how we
        use it, with whom we share it, and your rights in relation to your information when you use Kapan Finance or our
        website (including any content at kapan.finance).
      </p>

      <h2>Information We Collect</h2>

      <ol>
        <li>
          <p>
            <strong>Wallet and Blockchain Data:</strong> When you connect your Web3 cryptocurrency wallet to Kapan
            Finance, we collect your wallet’s public address and associated blockchain network information (e.g. the
            network or chain ID) in order to provide our services. This allows us to display your current DeFi lending
            positions and calculate potential interest savings, and to facilitate transactions such as refinancing your
            loans across platforms. We do not collect any personal identifiers like your name, mailing address, or email
            during the use of the app – use of Kapan Finance is account-free and only requires connecting a crypto
            wallet. Keep in mind that your wallet address and any transactions you execute (e.g. moving a loan) are
            recorded on public blockchain networks by design. This means that information about those blockchain
            transactions (such as your wallet addresses, asset balances, and transaction amounts) is publicly visible on
            the blockchain and not controlled by us once written to the ledger. (See Blockchain Transactions and Public
            Data below for more detail.)
          </p>
        </li>
        <li>
          <p>
            <strong>Usage Data:</strong> When you interact with our website or app, we and our service providers may
            automatically collect certain technical data for security and analytics purposes. This can include your
            device or browser type, operating system, IP address, pages or screens you view, and the dates/times of
            access. We use this information to help monitor the service, debug issues, and understand usage patterns to
            improve Kapan Finance. For example, our hosting platform may log IP addresses and requests for security and
            operational reasons. We also utilize a privacy-focused analytics service provided by Vercel to record basic
            usage events. In particular, we track events such as when a wallet is connected or disconnected so we can
            gauge engagement and ensure the app functions properly. Importantly, we have configured our analytics to
            avoid capturing sensitive personal details: before any analytics event is sent, we strip out wallet
            addresses or similar identifiers to anonymize the data. This means we do not store your full wallet address
            in our analytics logs. The usage data we collect is generally aggregated or pseudonymous and is not used to
            identify you personally.
          </p>
        </li>
        <li>
          <p>
            <strong>Cookies and Local Storage:</strong> Kapan Finance does not use traditional tracking cookies for
            advertising or invasive tracking. However, we do use local storage and similar technologies in your browser
            to remember your preferences and improve your experience. For example, we store your selected display theme
            (light or dark mode) and interface settings locally on your device. We may also remember which network or
            protocol you last selected and the last wallet connector you used, so that we can reconnect your wallet
            automatically if you revisit within a short time frame. This information is stored on your own browser/device
            and is not transmitted to our servers. You can clear your browser’s storage at any time to remove this data.
            Aside from these functional preferences, the Kapan Finance app does not set any third-party cookies. Our
            analytics is handled in a cookieless manner by Vercel’s built-in analytics, which does not rely on cookies
            for identifying users.
          </p>
        </li>
        <li>
          <p>
            <strong>Information You Voluntarily Provide:</strong> Because Kapan Finance operates without user accounts,
            we generally do not ask you to submit any personal information to use our core services. However, if you
            choose to contact us (for example, by email or through a support channel) or submit feedback, we will collect
            whatever information you choose to share in that communication (such as your name, email address, or the
            content of your inquiry). We will use that information only to respond to you and address your request.
          </p>
        </li>
      </ol>

      <h2>How We Use Your Information</h2>

      <p>We use the collected information for the following purposes:</p>

      <ul>
        <li>
          <strong>To Provide and Operate the Service:</strong> We use your wallet and blockchain information to display
          your DeFi borrowing positions and enable the core functionality of Kapan Finance. For instance, the app needs
          your wallet address and network choice to retrieve your balances/loans from supported protocols and to execute
          debt migration transactions on your instruction. All such processing is done to fulfill the service you
          request – allowing you to seamlessly refinance loans across Aave, Compound, Venus, Vesu, Nostra, and other
          integrated protocols.
        </li>
        <li>
          <strong>Analytics and Improvement:</strong> We process usage data (in aggregate form or with pseudonymous
          identifiers) to understand how users interact with our platform, which features are most used, and how the
          service is performing. This helps us troubleshoot problems, optimize the user interface, and improve our
          features. For example, knowing how many users connected a certain type of wallet or which pages are visited
          most often helps us focus our development efforts. Our analytics events (such as “wallet_connected” or
          “wallet_disconnected”) are collected via Vercel Analytics in a privacy-conscious way (with sensitive fields like
          the wallet address removed). We do not use this data for profiling or advertising – it is solely for improving
          our product and ensuring stability.
        </li>
        <li>
          <strong>Preferences and Convenience:</strong> The information stored in local storage (like your theme or
          last-used network) is used to remember your choices and tailor the service to you. For example, if you prefer
          the dark theme, we will apply that by default on future visits; if you last used the BNB Chain network, we may
          default to that network on your next visit. This makes the user experience smoother and is done based on your
          prior interactions.
        </li>
        <li>
          <strong>Security and Fraud Prevention:</strong> We may use certain data (like IP addresses or wallet
          addresses) to detect and prevent fraudulent or malicious activity on the platform. For example, unusual usage
          patterns might be analyzed to protect against phishing, hacks, or denial-of-service attacks. Any blockchain
          transactions you perform inherently carry your wallet address; we may monitor public blockchain activity
          related to our smart contracts to ensure there are no unauthorized or suspicious transactions affecting the
          protocol.
        </li>
        <li>
          <strong>Communications:</strong> If you contact us with questions or support needs, we will use your contact
          information to respond and resolve your issue. We may also send you service-related announcements if necessary
          (for instance, to notify users of important updates or changes to this Policy), but we will not send marketing
          emails since we do not collect emails for marketing purposes without consent.
        </li>
      </ul>

      <p>
        We will only use your personal information as permitted by law. Since we collect very limited personal data, our
        processing is typically based on: (i) performing the services you request (contractual necessity), (ii) our
        legitimate interests in maintaining and improving our platform (where such interests are not overridden by your
        privacy rights), and (iii) compliance with legal obligations.
      </p>

      <h2>Third-Party Services and Data Sharing</h2>

      <p>
        We do not sell or rent your personal data to third parties. However, we do utilize certain trusted third-party
        services to operate Kapan Finance, and some of your data may be shared with or pass through these services as
        outlined below:
      </p>

      <ul>
        <li>
          <strong>Hosting and Infrastructure (Vercel):</strong> Our website and application are hosted on the Vercel
          platform. When you use Kapan Finance, your network requests (e.g. loading the web pages, API calls) are handled
          by Vercel’s servers. As a result, Vercel may process data such as your IP address, device information, and
          requests to our site as part of providing their hosting service. Vercel also provides our application
          analytics. Usage data (like page visits and events) is sent to Vercel’s analytics servers, although as noted,
          we anonymize wallet-specific details in these events. Vercel may aggregate this data to provide us with
          analytics dashboards. We have a data processing agreement with Vercel to ensure any personal data processed on
          our behalf is protected. For more details on Vercel’s privacy practices, please refer to Vercel’s Privacy
          Policy.
        </li>
        <li>
          <strong>Blockchain Node/RPC Providers:</strong> To interact with blockchain networks (for reading data and
          broadcasting transactions), Kapan Finance relies on third-party blockchain infrastructure providers. In
          particular, we use services like Alchemy as a backend RPC (Remote Procedure Call) endpoint for certain
          blockchain queries. This means that when the application fetches on-chain data (such as current interest rates
          or your loan balance) or when you submit a transaction through Kapan, the requests may be routed through an
          Alchemy node or similar provider. These providers will see the requests which can include your wallet address
          (for example, if querying your balances or submitting a transaction) and your IP address. We use these
          third-party node providers to ensure reliable and speedy blockchain connectivity across multiple networks. We
          do not control how these blockchain providers use log data, but they generally use it to monitor for abuse and
          ensure service quality. We recommend reviewing Alchemy’s privacy policies or those of any RPC provider in use.
          Note that if you connect through your own Ethereum/Starknet wallet (e.g. MetaMask or WalletConnect), your
          wallet may use its default RPC provider (like Infura or others) under its own terms.
        </li>
        <li>
          <strong>DeFi Protocols and Blockchain Transactions:</strong> Kapan Finance integrates with third-party DeFi
          lending platforms such as Aave, Compound, Venus, Vesu, Nostra, and others. When you choose to refinance or
          migrate a loan using our app, that action is executed via smart contracts that interface with these protocols.
          Any such operation will involve sending a blockchain transaction from your wallet to those protocols’ smart
          contracts. This means that information necessary for the transaction (your wallet address, the amount being
          borrowed/repaid, asset type, etc.) will be shared with and recorded by those decentralized protocols on the
          blockchain. Importantly, this is not a data transfer in the traditional sense – we are not sending your
          personal data to these organizations off-chain – rather, you are directly interacting with their public smart
          contracts. The details of transactions become part of the public blockchain ledger. Neither Kapan Finance nor
          the protocol operators can erase this on-chain history. Please be aware that interacting with these third-party
          DeFi services is subject to their code and possibly their terms; though the protocols themselves typically do
          not collect personal off-chain information, any data on the blockchain is visible to third-party blockchain
          explorers, analytics, and users.
        </li>
        <li>
          <strong>External Price and Data APIs:</strong> To provide up-to-date information, we may use third-party APIs
          for certain data. For example, Kapan Finance uses the CoinGecko API to fetch live cryptocurrency prices for
          calculating the value of your positions or potential savings. When our app needs a price for a token, it will
          send a request from our servers to CoinGecko. This request typically includes the token identifier (symbol or
          ID) but does not include personal user information. We do not send your wallet address or any identifying data
          to CoinGecko – only the query for token pricing. CoinGecko may log the incoming request (which could include our
          server’s IP address and the query), but it cannot directly identify you from that. Similarly, if we use any
          other third-party data sources (such as blockchain indexers or gas price APIs), we ensure not to include your
          personal data in those requests beyond what is necessary.
        </li>
        <li>
          <strong>Service Providers:</strong> In addition to the above, we might use other service providers for functions
          such as email communications, customer support, or security monitoring. We would only share with them the
          minimum data necessary for them to perform their work on our behalf. For example, if we use an email service to
          send a response to a support inquiry you sent, your email address would be processed by that service solely to
          deliver our reply. All our service providers are bound by appropriate confidentiality and data protection
          obligations.
        </li>
        <li>
          <strong>Legal and Compliance:</strong> We may disclose information about you if we determine in good faith that
          such disclosure is necessary to comply with a legal obligation (such as a valid subpoena or court order), to
          protect our rights or property, to prevent fraud or other illegal activity, or to protect the safety of our
          users or the public. We will only do so in accordance with applicable laws. Because we generally do not collect
          sensitive personal data, it is unusual that we would have any significant personal information to provide in
          response to legal requests, but your blockchain activity could still be analyzed by law enforcement directly on
          the public ledger.
        </li>
        <li>
          <strong>Business Transfers:</strong> If Kapan Finance or substantially all of its assets are acquired or merged
          with another company, user information may be transferred as part of that transaction. In such an event, we
          will ensure the new owner continues to respect your personal data in line with this policy, and we will notify
          users of any significant changes to privacy practices.
        </li>
      </ul>

      <p>
        <strong>No Selling of Personal Data:</strong> We want to emphasize that we do not sell your personal information
        to third parties for marketing or any other purposes. We do not share data with advertisers or social media
        platforms. Kapan Finance is focused on providing a DeFi tool, and we monetize our service in ways that do not
        involve exploiting user data.
      </p>

      <h2>Blockchain Transactions and Public Data</h2>

      <p>
        Using Kapan Finance involves interactions with public blockchains, which have unique privacy implications. Any
        blockchain transaction that you perform via our platform will be public. Blockchains like Ethereum, Arbitrum, BNB
        Chain, and Starknet record transactions on a distributed ledger that is visible to anyone. This means that when
        you migrate a loan or adjust a position, the details of that blockchain transaction are not private. They
        typically include your wallet addresses (sender and recipient), timestamps, the smart contracts involved (e.g.
        Aave’s contract addresses), and amounts of assets moved.
      </p>

      <p>
        While this information is tied only to cryptographic addresses (pseudonyms), it is possible that outside parties
        could link your blockchain address with other information to infer your identity or track your activity over
        time. Kapan Finance does not have control over data posted to the blockchain, nor can we erase or modify it once
        confirmed. By using the service, you are choosing to interact on these public ledgers. We recommend that you
        practice good privacy hygiene with your crypto addresses (for instance, not reusing addresses between personal
        transactions and Kapan if you want to keep them unlinked, etc.).
      </p>

      <p>
        It’s important to note that our platform itself does not copy or store your on-chain transaction data in our own
        databases beyond temporarily using it to show you results. For example, if we retrieve your loan balance from
        Aave, that reading happens in real-time and we do not permanently log that information on our side. The
        authoritative record of your balances and transactions remains on the blockchain. We encourage you to review the
        privacy and anonymity features of the blockchain networks you use. If you have questions about how DeFi
        transactions work or their visibility, please refer to our documentation or contact us for guidance.
      </p>

      <h2>Data Storage and Security</h2>

      <p>
        We understand the importance of securing your information. Although we minimize the personal data we collect, we
        take measures to protect whatever data is under our control:
      </p>

      <ul>
        <li>
          <strong>Storage of Data:</strong> The limited personal data we handle (such as analytics information) is stored
          on secure servers operated by our service providers (e.g. Vercel) or within the application itself on your
          device (for local storage items). We do not maintain our own separate user database of personal details. In
          fact, because Kapan Finance doesn’t require an account, we do not have a profile in our system for you. Any
          analytics data is stored in cloud databases with strong access controls. If you contact us by email, those
          communications may be stored in our email system.
        </li>
        <li>
          <strong>Security Measures:</strong> We employ industry-standard security practices to safeguard data. This
          includes using encryption in transit (HTTPS) for all communication between your browser and our site – so
          wallet data and other interactions are encrypted while traveling over the internet. Our smart contracts are
          designed to be secure and have been tested/audited, as the security of the on-chain aspect is crucial (though
          that primarily protects your funds rather than personal data). We restrict access to whatever data we do have –
          for example, only authorized team members or service providers who need to process the data for the purposes
          described will have access. Our team is trained on the importance of confidentiality and privacy.
        </li>
        <li>
          <strong>Anonymization:</strong> Where feasible, we anonymize or pseudonymize data to reduce privacy risk. As
          noted, we deliberately remove or hash personally identifying components (like wallet addresses) from our
          analytics events. This means even in the unlikely event of a data breach of our analytics store, the data would
          not easily tie back to individual identities.
        </li>
      </ul>

      <p>
        <strong>No Guarantee:</strong> Despite all precautions, no method of transmission over the internet or method of
        electronic storage is completely secure. Blockchains themselves are secure by design, but any off-chain data or
        communications could be vulnerable to unforeseen exploits. We cannot guarantee absolute security. However, we do
        monitor for potential vulnerabilities and follow best practices to update and patch our systems.
      </p>

      <p>
        If we ever encounter a security incident involving your personal data, we will notify you and appropriate
        regulators as required by law.
      </p>

      <h2>Data Retention</h2>

      <p>
        We retain personal and usage data only as long as necessary to fulfill the purposes outlined in this policy, or
        as required by law:
      </p>

      <ul>
        <li>
          <strong>On-Device Data:</strong> Preferences stored in your browser (local storage) remain until you clear them
          or reset your browser. You have full control of that lifespan.
        </li>
        <li>
          <strong>Analytics Data:</strong> Our analytics information is typically aggregated and may be retained for
          analysis and historical comparisons. We don’t keep raw user-identifiable analytics longer than needed – for
          instance, we might keep site usage metrics indefinitely in aggregate form, but any underlying event logs with IP
          addresses or other identifiers are regularly purged or rotated. In practice, Vercel Analytics retains data on
          our behalf; we currently anticipate keeping analytic logs for no more than 1 year (and possibly far shorter)
          before deletion or anonymization, unless we need to retain them longer for legal reasons or ongoing analysis.
        </li>
        <li>
          <strong>Communications:</strong> If you correspond with us (e.g. email), we may retain those communications for
          a period to ensure we have a history of support issues and can improve our service. We will delete or anonymize
          personal communications upon request, provided we are not required to keep them for legal reasons.
        </li>
        <li>
          <strong>Blockchain Data:</strong> As noted, data on the blockchain is not something we control or can delete –
          it is effectively permanent by nature of the distributed ledger.
        </li>
      </ul>

      <p>
        When we have no ongoing legitimate need to use or store your personal information, we will securely delete or
        anonymize it. For example, if you were to provide us an email for support, once the issue is resolved we may
        delete that correspondence after some time. If we have analytics that are older than our retention window, we
        aggregate and remove the raw data.
      </p>

      <h2>Your Rights and Choices</h2>

      <p>
        Depending on your jurisdiction (for example, if you are in the European Economic Area, United Kingdom, or
        certain other regions), you have certain rights regarding your personal data. Kapan Finance is committed to
        respecting these rights, and because we collect minimal personal data, facilitating these rights is usually
        straightforward. These rights may include:
      </p>

      <ul>
        <li>
          <strong>Access and Portability:</strong> You have the right to request a copy of the personal data we hold
          about you and to obtain information about how we process it. Given our service design, we generally do not have
          detailed personal records tied to individuals. However, if you believe we have personal data about you (for
          instance, an email communication or certain analytics logs identifiable to you), you may request access to
          that. We will provide it in a common format. For example, you can ask what information we have associated with
          your wallet address or IP, and we will attempt to search our records (to the extent they exist and are
          considered personal data).
        </li>
        <li>
          <strong>Correction:</strong> If you find that any personal information we have about you is inaccurate or
          incomplete, you have the right to request we correct it. In practice, the data we hold (if any) is very limited
          (perhaps your email in a support thread, etc.), and you likely control most of it (e.g. your wallet address
          cannot really be “corrected” by us; it is what it is). But if, for example, you signed up to receive any
          notification and your email was misspelled, we would correct it upon your request.
        </li>
        <li>
          <strong>Deletion (Right to be Forgotten):</strong> You have the right to request that we delete any personal
          data we have about you. Because we do not store user profiles and we minimize personal data, there may not be
          much (or any) personal information of yours in our systems. Nonetheless, if you believe we do have personal
          data (such as an email or an IP in logs that is identifiable to you), please contact us and we will do our best
          to delete or anonymize it. Note that we cannot delete data that resides on the blockchain, as explained above,
          since we do not control those networks. But, for example, if you emailed us and want that correspondence erased
          from our inbox, we will honor that (except if we need to retain it for legal disputes or compliance).
        </li>
        <li>
          <strong>Objection to Processing:</strong> You have the right to object to our processing of your data in certain
          circumstances, particularly if we are processing it based on legitimate interests or for direct marketing. As
          we do not do much beyond functional processing, if you object to analytics tracking, for instance, you can use
          browser settings or plugins to block analytics scripts, or you can contact us and we will endeavor to exclude
          your visits from our analytics. We do not send marketing communications without consent, so objecting to
          marketing is generally not applicable.
        </li>
        <li>
          <strong>Restriction of Processing:</strong> You can ask us to limit processing of your data in certain scenarios
          (e.g., while a complaint about data accuracy is being resolved). Given the minimal data we process, this is
          rarely needed, but we will certainly flag and refrain from processing any data you contest until resolved.
        </li>
        <li>
          <strong>Withdrawal of Consent:</strong> In the rare cases where we might rely on your consent to process data,
          you can withdraw that consent at any time. For example, if we had a newsletter (we currently do not), you could
          unsubscribe. Withdrawing consent will not affect the lawfulness of processing before the withdrawal.
        </li>
        <li>
          <strong>Automated Decision-Making:</strong> We do not engage in any automated decision-making or profiling that
          produces legal effects for you.
        </li>
      </ul>

      <p>
        To exercise any of these rights, please contact us at the email address provided in the Contact section below.
        We may need to verify your identity (for example, by having you sign a message with your wallet or provide some
        identification) to ensure we do not disclose or delete the wrong person’s data. We will respond to your request
        within the timeframe required by applicable law (generally within 30 days for most requests).
      </p>

      <p>
        If you are in the EEA/UK and have concerns about our handling of your personal data, you have the right to lodge
        a complaint with your local data protection supervisory authority. We encourage you to contact us first, and we
        will do our utmost to resolve your concerns.
      </p>

      <h2>International Users and Data Transfers</h2>

      <p>
        Kapan Finance is a global service. By using our site or app, your information may be transferred to and processed
        in countries other than your own. Specifically, our servers and service providers (such as Vercel, Alchemy, etc.)
        may be located in the United States or other countries. If you are located in the European Union or other regions
        with data protection laws, please note that we may transfer information, including personal data (to the limited
        extent we collect it), to countries which may not provide the same level of data protection as your home country.
      </p>

      <p>
        We take steps to ensure that adequate safeguards are in place when transferring data internationally. For
        instance, when we engage service providers, if your data originates from the EU/EEA, we rely on standard
        contractual clauses or an equivalent legal mechanism to ensure your data remains protected according to EU
        standards. Vercel, for example, as our processor, is committed to GDPR compliance and uses appropriate safeguards
        for data transfers.
      </p>

      <p>
        By using Kapan Finance, or by providing information to us, you understand and consent to the processing of your
        information in the United States and other locations as described in this policy. We will handle your information
        in accordance with this Privacy Policy wherever it is processed.
      </p>

      <h2>Children’s Privacy</h2>

      <p>
        Kapan Finance is not intended for use by children. Our services are designed for adults in the crypto/DeFi
        community and we do not knowingly collect personal information from individuals under the age of 18 (or the
        applicable age of majority in your jurisdiction). If you are under 18, please do not use Kapan Finance or submit
        any personal data to us. If we become aware that a minor has provided us with personal information, we will take
        steps to delete it. Parents or guardians who believe that their child may have used our service or provided
        personal information to us should contact us immediately so we can investigate and remove any such information.
      </p>

      <h2>Changes to This Privacy Policy</h2>

      <p>
        We may update this Privacy Policy from time to time to reflect changes in our practices, technologies, legal
        requirements, or for other operational reasons. When we make changes, we will revise the “Last Updated” date at
        the top of this policy. If the changes are significant, we will provide a more prominent notice (such as on our
        website’s homepage or via a notification in the app). We encourage you to review this Privacy Policy periodically
        to stay informed about how we are protecting your information.
      </p>

      <p>
        Your continued use of Kapan Finance after any updates constitutes your acceptance of the revised policy. If you
        do not agree to the updated terms, you should discontinue using the service.
      </p>

      <h2>Contact Us</h2>

      <p>
        If you have any questions, concerns, or requests regarding this Privacy Policy or how your data is handled,
        please do not hesitate to contact us. We are here to help and clarifications.
      </p>

      <p>
        <strong>Contact Email:</strong> <a href="mailto:privacy@kapan.finance">privacy@kapan.finance</a> (for privacy
        inquiries and data requests)
      </p>

      <p>
        You may also reach out to <a href="mailto:support@kapan.finance">support@kapan.finance</a> for general support
        issues, and we will route your inquiry appropriately.
      </p>
    </div>
  );
};

export default PrivacyPage;
