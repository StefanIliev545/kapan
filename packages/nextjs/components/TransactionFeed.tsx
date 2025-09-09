import { useState, useEffect } from "react";
import Image from "next/image";
import { format } from "date-fns";
import { FiArrowDownLeft, FiArrowUpRight } from "react-icons/fi";

// Type definition for Transaction
type Transaction = {
  id: string;
  type: "borrow" | "repay" | "supply" | "withdraw";
  protocol: "Aave" | "Compound";
  token: string;
  amount: number;
  timestamp: Date;
  address: string;
  network: string;
};

// Helper function to generate mock transactions
export const generateMockTransactions = (count: number): Transaction[] => {
  const types = ["borrow", "repay", "supply", "withdraw"];
  const protocols = ["Aave", "Compound"];
  const tokens = ["USDC", "ETH", "DAI", "USDT", "WBTC", "AAVE", "COMP"];
  const networks = ["Arbitrum", "Optimism", "Mainnet", "Base"];
  
  // Generate random transactions
  return Array.from({ length: count }).map((_, i) => {
    const type = types[Math.floor(Math.random() * types.length)] as "borrow" | "repay" | "supply" | "withdraw";
    const protocol = protocols[Math.floor(Math.random() * protocols.length)] as "Aave" | "Compound";
    const token = tokens[Math.floor(Math.random() * tokens.length)];
    const amount = Math.random() * 50000 + 100; // Random amount between $100 and $50,100
    const timestamp = new Date(Date.now() - Math.floor(Math.random() * 24 * 60 * 60 * 1000)); // Last 24 hours
    const address = `0x${Math.random().toString(16).substring(2, 10)}...${Math.random().toString(16).substring(2, 6)}`;
    const network = networks[Math.floor(Math.random() * networks.length)];
    
    return {
      id: `tx-${i}-${Date.now()}`,
      type,
      protocol,
      token,
      amount,
      timestamp,
      address,
      network
    };
  });
};

// TransactionFeed Component
const TransactionFeed = () => {
  const [transactions, setTransactions] = useState<Transaction[]>(() => 
    generateMockTransactions(80)
  );
  
  // Add a new transaction every few seconds
  useEffect(() => {
    const interval = setInterval(() => {
      const newTransaction = generateMockTransactions(1)[0];
      setTransactions(prev => [newTransaction, ...prev.slice(0, 79)]);
    }, 2000);
    
    return () => clearInterval(interval);
  }, []);

  // Get icon for a token with special case handling for ETH/WETH
  const getTokenIcon = (token: string): string => {
    if (token.toLowerCase() === 'eth' || token.toLowerCase() === 'weth') {
      return '/logos/ethereum.svg';
    }
    return `/logos/${token.toLowerCase()}.svg`;
  };
  
  // Get icon based on transaction type
  const getTransactionIcon = (type: string) => {
    switch(type) {
      case 'borrow':
        return <FiArrowDownLeft className="text-error" />;
      case 'repay':
        return <FiArrowUpRight className="text-primary" />;
      case 'supply':
        return <FiArrowDownLeft className="text-primary" />;
      case 'withdraw':
        return <FiArrowUpRight className="text-warning" />;
      default:
        return null;
    }
  };
  
  // Get color based on transaction type
  const getTransactionColor = (type: string) => {
    switch(type) {
      case 'borrow':
        return 'text-error font-semibold';
      case 'repay':
        return 'text-primary';
      case 'supply':
        return 'text-primary';
      case 'withdraw':
        return 'text-warning font-semibold';
      default:
        return '';
    }
  };
  
  return (
    <div className="fixed inset-0 -z-10 overflow-auto">
      {/* Apply very subtle blur effect to this container */}
      <div 
        className="min-h-screen bg-base-100 bg-opacity-40"
        style={{
          filter: 'blur(15px)',
          WebkitFilter: 'blur(15px)',
          backdropFilter: 'blur(15px)'
        }}
      >
        <table className="table table-xs table-zebra w-full">
          <thead className="sticky top-0 bg-base-300 bg-opacity-95 z-10 shadow-md">
            <tr className="text-base-content font-bold">
              <th className="w-16">Type</th>
              <th className="w-24">Protocol</th>
              <th className="w-20">Token</th>
              <th className="w-32">Amount</th>
              <th className="w-24">Network</th>
              <th className="w-40">Address</th>
              <th className="w-24 text-right">Time</th>
            </tr>
          </thead>
          <tbody>
            {transactions.slice(0, 40).map((tx, index) => {
              return (
                <tr 
                  key={tx.id}
                  className="border-opacity-10 animate-fadeIn hover:bg-base-200 hover:bg-opacity-75 
                          transition-all duration-300 cursor-pointer border-b border-base-200"
                  style={{
                    transitionDelay: `${index * 15}ms`,
                  }}
                >
                  <td>
                    <div className="flex items-center gap-1">
                      {getTransactionIcon(tx.type)}
                      <span className={`capitalize text-xs ${getTransactionColor(tx.type)}`}>
                        {tx.type}
                      </span>
                    </div>
                  </td>
                  <td>
                    <div className="flex items-center gap-1">
                      <Image 
                        src={`/logos/${tx.protocol.toLowerCase()}.svg`} 
                        alt={tx.protocol} 
                        width={16} 
                        height={16} 
                        className="mr-1"
                      />
                      <span className="text-xs opacity-80">{tx.protocol}</span>
                    </div>
                  </td>
                  <td>
                    <div className="flex items-center gap-1">
                      <Image 
                        src={getTokenIcon(tx.token)} 
                        alt={tx.token}
                        width={16} 
                        height={16} 
                        onError={(e) => {
                          e.currentTarget.src = "/logos/usdc.svg";
                        }} 
                      />
                      <span className="text-xs font-medium">{tx.token}</span>
                    </div>
                  </td>
                  <td className="font-mono text-xs">
                    ${tx.amount < 1000 
                      ? tx.amount.toFixed(2) 
                      : tx.amount < 1000000 
                        ? `${(tx.amount / 1000).toFixed(2)}k`
                        : `${(tx.amount / 1000000).toFixed(2)}M`
                    }
                  </td>
                  <td>
                    <div className="flex items-center gap-1">
                      <Image 
                        src="/logos/arb.svg" 
                        alt={tx.network} 
                        width={16} 
                        height={16} 
                        onError={(e) => {
                          e.currentTarget.src = "/logos/ethereum.svg";
                        }} 
                      />
                      <span className="text-xs opacity-80">{tx.network}</span>
                    </div>
                  </td>
                  <td>
                    <span className="text-xs opacity-70 font-mono">{tx.address}</span>
                  </td>
                  <td className="text-xs opacity-60 text-right">
                    {format(tx.timestamp, 'MMM d, h:mm a')}
                  </td>
                </tr>
              );
            })}
            {/* Add extra empty rows to ensure the table fills the entire viewport */}
            {Array.from({ length: 10 }).map((_, i) => (
              <tr key={`empty-${i}`} className="opacity-0">
                <td colSpan={7}>&nbsp;</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default TransactionFeed; 