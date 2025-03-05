import { FiLink, FiDatabase } from "react-icons/fi";

const ComingSoon = () => {
  return (
    <div className="container mx-auto px-5 py-16 z-10">
      <div className="card bg-base-100 bg-opacity-98 shadow-2xl border border-base-300">
        <div className="card-body p-6">
          <h2 className="text-3xl font-bold text-center mb-8">Coming Soon</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="card bg-base-200 shadow-lg border-2 border-accent">
              <div className="card-body">
                <h3 className="card-title text-accent">
                  <FiLink className="w-6 h-6 mr-2" />
                  Multi-Chain Support
                </h3>
                <p>
                  Expand your borrowing options across multiple blockchains, enabling you to leverage the 
                  best rates regardless of network.
                </p>
                <div className="card-actions justify-end mt-4">
                  <div className="badge badge-accent badge-outline">Coming Q2 2026</div>
                </div>
              </div>
            </div>
            
            <div className="card bg-base-200 shadow-lg border-2 border-primary">
              <div className="card-body">
                <h3 className="card-title text-primary">
                  <FiDatabase className="w-6 h-6 mr-2" />
                  Additional Protocols
                </h3>
                <p>
                  We&apos;re working to integrate more lending protocols like Maker and Morpho to provide 
                  even more options for optimizing your DeFi debt.
                </p>
                <div className="card-actions justify-end mt-4">
                  <div className="badge badge-primary badge-outline">Coming Q3 2025</div>
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