const HowItWorks = () => {
  return (
    <div className="container mx-auto px-5 py-16 z-10">
      <div className="card bg-base-100 bg-opacity-98 shadow-2xl border border-base-300">
        <div className="card-body p-6">
          <h2 className="text-3xl font-bold text-center mb-8">How It Works</h2>
          
          <div className="flex justify-center mb-12">
            <ul className="steps steps-horizontal w-full max-w-2xl">
              <li className="step step-primary">Connect</li>
              <li className="step step-primary">Choose</li>
              <li className="step step-primary">Move</li>
            </ul>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="card bg-base-200 shadow-lg">
              <div className="card-body items-center text-center gap-4">
                <div className="badge badge-primary badge-lg">1</div>
                <h3 className="text-xl font-bold">Connect Wallet</h3>
                <p>
                  Connect your wallet to see your current debt positions across supported protocols.
                </p>
              </div>
            </div>
            
            <div className="card bg-base-200 shadow-lg">
              <div className="card-body items-center text-center gap-4">
                <div className="badge badge-primary badge-lg">2</div>
                <h3 className="text-xl font-bold">Choose Position</h3>
                <p>
                  Select the debt position you want to optimize and see potential savings across protocols.
                </p>
              </div>
            </div>
            
            <div className="card bg-base-200 shadow-lg">
              <div className="card-body items-center text-center gap-4">
                <div className="badge badge-primary badge-lg">3</div>
                <h3 className="text-xl font-bold">Move Debt</h3>
                <p>
                  With a single transaction, move your debt to the protocol with the most favorable terms.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HowItWorks; 