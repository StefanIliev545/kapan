import { FiInfo, FiShield, FiZap } from "react-icons/fi";

const AlphaWarning = () => {
  return (
    <div className="container mx-auto px-5 my-8 z-10">
      <div className="card bg-base-100 bg-opacity-98 shadow-2xl border border-warning">
        <div className="card-body p-6">
          <div className="flex flex-col md:flex-row items-center gap-6">
            {/* Main message */}
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <FiZap className="w-5 h-5 text-warning" />
                <h3 className="text-lg font-bold">Early Access Alpha</h3>
              </div>
              <p className="text-base-content/80">
                Experience the future of DeFi debt management. While we&apos;re in alpha, 
                we&apos;re continuously improving and adding new features.
              </p>
            </div>

            {/* Feature status */}
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <FiInfo className="w-5 h-5 text-info" />
                <h3 className="text-lg font-bold">What to Expect</h3>
              </div>
              <p className="text-base-content/80">
                Core features are stable and tested. New protocols and chains 
                are being added regularly.
              </p>
            </div>

            {/* Security note */}
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <FiShield className="w-5 h-5 text-warning" />
                <h3 className="text-lg font-bold">Active Development</h3>
              </div>
              <p className="text-base-content/80">
                Smart contracts are in active development and pre-audit. While thoroughly tested, 
                use at your own risk and start with small amounts.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AlphaWarning; 