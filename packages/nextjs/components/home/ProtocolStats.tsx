import Image from "next/image";
import { FiDollarSign, FiLayers, FiUsers } from "react-icons/fi";

const ProtocolStats = () => {
  return (
    <div className="container mx-auto px-5">
      <div className="card bg-base-100 bg-opacity-98 shadow-2xl border border-base-300 rounded-lg">
        <div className="card-body p-6">
          <div className="stats stats-vertical lg:stats-horizontal w-full">
            <div className="stat">
              <div className="stat-figure text-primary">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <FiDollarSign className="w-5 h-5 text-primary" />
                </div>
              </div>
              <div className="stat-title">Total Debt Moved</div>
              <div className="stat-value text-primary">$0</div>
            </div>

            <div className="stat">
              <div className="stat-figure text-secondary">
                <div className="w-10 h-10 rounded-lg bg-secondary/10 flex items-center justify-center">
                  <FiUsers className="w-5 h-5 text-secondary" />
                </div>
              </div>
              <div className="stat-title">Total Users</div>
              <div className="stat-value text-secondary">0</div>
            </div>

            <div className="stat">
              <div className="stat-figure text-accent">
                <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
                  <FiLayers className="w-5 h-5 text-accent" />
                </div>
              </div>
              <div className="stat-title">Debt Positions</div>
              <div className="stat-value text-accent">0</div>
            </div>

            <div className="stat">
              <div className="stat-figure text-primary">
                <div className="w-10 h-10 rounded-lg bg-base-200 flex items-center justify-center">
                  <Image src="/logos/arb.svg" alt="Arbitrum Logo" width={24} height={24} />
                </div>
              </div>
              <div className="stat-title">Supported Chain</div>
              <div className="stat-value text-primary">Arbitrum</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProtocolStats;
