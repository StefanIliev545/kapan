import { FiLink, FiDatabase } from "react-icons/fi";

const ComingSoon = () => {
  return (
    <div className="container mx-auto px-5 py-16 z-10">
      <div className="card bg-base-100 dark:bg-base-200/95 bg-opacity-98 shadow-2xl border border-base-300 dark:border-base-300/30 rounded-lg">
        <div className="card-body p-6">
          <h2 className="text-3xl font-bold text-center mb-8 text-base-content">Coming Soon</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="card bg-base-200 dark:bg-base-300/30 shadow-lg border-2 border-accent rounded-lg">
              <div className="card-body">
                <h3 className="card-title text-accent flex items-center">
                  <FiLink className="w-6 h-6 mr-2 text-accent" />
                  Multi-Chain Support
                </h3>
                <p className="text-base-content/80">
                  Expand your borrowing options across multiple blockchains, enabling you to leverage the 
                  best rates regardless of network.
                </p>
                <div className="card-actions justify-end mt-4">
                  <div className="badge badge-accent badge-outline dark:border-accent/70">Coming Q2 2026</div>
                </div>
              </div>
            </div>
            
            <div className="card bg-base-200 dark:bg-base-300/30 shadow-lg border-2 border-primary dark:border-accent rounded-lg">
              <div className="card-body">
                <h3 className="card-title text-primary dark:text-accent flex items-center">
                  <FiDatabase className="w-6 h-6 mr-2 text-primary dark:text-accent" />
                  Additional Protocols
                </h3>
                <p className="text-base-content/80">
                  We&apos;re working to integrate more lending protocols like Maker and Morpho to provide 
                  even more options for optimizing your DeFi debt.
                </p>
                <div className="card-actions justify-end mt-4">
                  <div className="badge badge-primary dark:badge-accent badge-outline dark:border-accent/70">Coming Q3 2025</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ComingSoon; 