import { FiCreditCard, FiSearch, FiArrowRight } from "react-icons/fi";

const HowItWorks = () => {
  return (
    <div className="container mx-auto px-5 py-16 z-10">
      <div className="card bg-base-100 bg-opacity-98 shadow-2xl border border-base-300">
        <div className="card-body p-6">
          <h2 className="text-3xl font-bold text-center mb-8">
            <div className="flex items-center justify-center gap-2">
              <FiArrowRight className="w-8 h-8 text-primary" />
              How It Works
            </div>
          </h2>
          
          <div className="flex justify-center mb-12">
            <ul className="steps steps-horizontal w-full max-w-2xl">
              <li data-content="✓" className="step step-primary">Connect</li>
              <li data-content="→" className="step step-primary">Choose</li>
              <li data-content="★" className="step step-primary">Move</li>
            </ul>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="card bg-base-200 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
              <div className="card-body items-center text-center gap-4">
                <div className="badge badge-primary badge-lg">1</div>
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <FiCreditCard className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-xl font-bold">Connect Wallet</h3>
                <p className="text-base-content/80">
                  Connect your Web3 wallet to view your current debt positions and potential savings opportunities.
                </p>
                <div className="mt-2 flex items-center gap-2 text-sm text-primary">
                  <FiArrowRight className="w-4 h-4" />
                  <span>Supports MetaMask & WalletConnect</span>
                </div>
              </div>
            </div>

            <div className="card bg-base-200 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
              <div className="card-body items-center text-center gap-4">
                <div className="badge badge-primary badge-lg">2</div>
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <FiSearch className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-xl font-bold">Choose Position</h3>
                <p className="text-base-content/80">
                  Select which debt position to optimize and instantly see available interest rate savings.
                </p>
                <div className="mt-2 flex items-center gap-2 text-sm text-primary">
                  <FiArrowRight className="w-4 h-4" />
                  <span>Compare rates across protocols</span>
                </div>
              </div>
            </div>

            <div className="card bg-base-200 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
              <div className="card-body items-center text-center gap-4">
                <div className="badge badge-primary badge-lg">3</div>
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <FiArrowRight className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-xl font-bold">Move Debt</h3>
                <p className="text-base-content/80">
                  Execute a single transaction to move your debt to the protocol with better rates.
                </p>
                <div className="mt-2 flex items-center gap-2 text-sm text-primary">
                  <FiArrowRight className="w-4 h-4" />
                  <span>Save on interest instantly</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HowItWorks;
