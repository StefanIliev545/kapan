import Image from "next/image";
import { FiDollarSign, FiLayers, FiUsers } from "react-icons/fi";

const ProtocolStats = () => {
  return (
    <div className="container mx-auto px-5">
      <div className="card bg-base-100 dark:bg-base-200/95 bg-opacity-98 shadow-2xl border border-base-300 dark:border-base-300/30 rounded-lg">
        <div className="card-body p-6">
          <div className="stats stats-vertical lg:stats-horizontal w-full bg-transparent dark:bg-transparent dark:text-base-content">
            <div className="stat">
              <div className="stat-figure text-primary dark:text-accent">
                <div className="w-10 h-10 rounded-lg bg-primary/10 dark:bg-accent/10 flex items-center justify-center">
                  <FiDollarSign className="w-5 h-5 text-primary dark:text-accent" />
                </div>
              </div>
              <div className="stat-title text-base-content/70">Total Debt Moved</div>
              <div className="stat-value text-primary dark:text-accent">$0</div>
            </div>

            <div className="stat">
              <div className="stat-figure text-secondary dark:text-accent">
                <div className="w-10 h-10 rounded-lg bg-secondary/10 dark:bg-accent/10 flex items-center justify-center">
                  <FiUsers className="w-5 h-5 text-secondary dark:text-accent" />
                </div>
              </div>
              <div className="stat-title text-base-content/70">Total Users</div>
              <div className="stat-value text-secondary dark:text-accent">0</div>
            </div>

            <div className="stat">
              <div className="stat-figure text-accent">
                <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
                  <FiLayers className="w-5 h-5 text-accent" />
                </div>
              </div>
              <div className="stat-title text-base-content/70">Debt Positions</div>
              <div className="stat-value text-accent">0</div>
            </div>

            <div className="stat">
              <div className="stat-figure text-primary dark:text-accent">
                <div className="w-10 h-10 rounded-lg bg-base-200 dark:bg-base-300/50 flex items-center justify-center">
                  <Image src="/logos/arb.svg" alt="Arbitrum Logo" width={24} height={24} />
                </div>
              </div>
              <div className="stat-title text-base-content/70">Supported Chain</div>
              <div className="stat-value text-primary dark:text-accent">Arbitrum</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProtocolStats;
