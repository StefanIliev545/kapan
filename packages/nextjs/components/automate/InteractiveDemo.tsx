import { useState, useEffect, useRef } from "react";
import { ArrowsRightLeftIcon, BoltIcon } from "@heroicons/react/24/outline";
import { ArrowRightIcon, ChartBarIcon, ClockIcon } from "@heroicons/react/24/solid";
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, ReferenceLine, Legend
} from 'recharts';

type Protocol = {
  name: string;
  logo: string;
  currentRate: number;
  color: string;
};

type SimulationState = {
  activeProtocol: string;
  kapanProtocol: string; // The protocol Kapan is using (lowest rate)
  savings: number;
  transactionCount: number;
  lastSwitch: string;
  elapsedDays: number;
  rateHistory: Array<{
    day: number;
    aave: number;
    compound: number;
    spark: number;
    kapan: number; // Optimized rate
    active: string;
    savings: number;
  }>;
};

const InteractiveDemo = () => {
  // Helper function to find the lowest rate protocol from a set of rates
  const findLowestRateProtocolFromRates = (rates: Record<string, number>): string => {
    const entries = Object.entries(rates);
    if (entries.length === 0) return 'aave'; // Default fallback
    
    entries.sort(([, rateA], [, rateB]) => rateA - rateB);
    return entries[0][0]; // Return the key of the lowest rate
  };

  // Reference protocols - Now using state instead of a regular object
  const [protocols, setProtocols] = useState<Record<string, Protocol>>({
    aave: {
      name: "Aave",
      logo: "/logos/aave.svg",
      currentRate: 5.23,
      color: "#B6509E",
    },
    compound: {
      name: "Compound",
      logo: "/logos/compound.svg",
      currentRate: 4.89,
      color: "#00D395",
    },
    spark: {
      name: "Spark",
      logo: "/logos/eth.svg", // Placeholder
      currentRate: 5.11,
      color: "#5C74FF",
    },
    kapan: {
      name: "Kapan",
      logo: "/logos/arb.svg", // Using Arbitrum logo as a placeholder for Kapan
      currentRate: 4.89, // Will always be the lowest rate
      color: "#6366F1", // Using primary color for Kapan
    }
  });
  
  // Initialize with some history data points
  const generateInitialHistory = () => {
    const history = [];
    const days = 10;
    
    for (let i = 0; i < days; i++) {
      // Generate random rates with dramatic variation to make changes more visible
      const aaveRate = 3 + Math.random() * 12; // 3% - 15%
      const compoundRate = 3 + Math.random() * 12; // 3% - 15%
      const sparkRate = 3 + Math.random() * 12; // 3% - 15%
      
      // Determine active protocol (lowest rate)
      const rates = [
        { protocol: 'aave', rate: aaveRate },
        { protocol: 'compound', rate: compoundRate },
        { protocol: 'spark', rate: sparkRate }
      ];
      rates.sort((a, b) => a.rate - b.rate);
      const activeProtocol = rates[0].protocol;
      const kapanRate = rates[0].rate; // Kapan always gets the lowest rate
      
      // Calculate cumulative savings
      const savings: number = i === 0 ? 0 : history[i-1].savings + (Math.random() * 0.05);
      
      history.push({
        day: i,
        aave: parseFloat(aaveRate.toFixed(2)),
        compound: parseFloat(compoundRate.toFixed(2)),
        spark: parseFloat(sparkRate.toFixed(2)),
        kapan: parseFloat(kapanRate.toFixed(2)),
        active: activeProtocol,
        savings: parseFloat(savings.toFixed(4))
      });
    }
    
    return history;
  };
  
  // State for interactive elements
  const [isRunning, setIsRunning] = useState(false);
  const [speed, setSpeed] = useState(2); // Default to 2x speed
  const [isManualMode, setIsManualMode] = useState(false);
  const [simulation, setSimulation] = useState<SimulationState>(() => {
    const initialHistory = generateInitialHistory();
    const lastPoint = initialHistory[initialHistory.length - 1];
    
    // Find the lowest rate protocol initially
    const lowestRateProtocol = findLowestRateProtocolFromRates({
      aave: lastPoint.aave,
      compound: lastPoint.compound,
      spark: lastPoint.spark
    });
    
    // Set initial protocol rates in state
    setProtocols(prev => ({
      ...prev,
      aave: { ...prev.aave, currentRate: lastPoint.aave },
      compound: { ...prev.compound, currentRate: lastPoint.compound },
      spark: { ...prev.spark, currentRate: lastPoint.spark },
      kapan: { ...prev.kapan, currentRate: Math.min(lastPoint.aave, lastPoint.compound, lastPoint.spark) }
    }));
    
    return {
      activeProtocol: lastPoint.active,
      kapanProtocol: lowestRateProtocol, // Set the initial Kapan protocol
      savings: lastPoint.savings,
      transactionCount: initialHistory.length - 1, // Count transitions between protocols
      lastSwitch: `Day ${initialHistory.length - 2}`,
      elapsedDays: initialHistory.length,
      rateHistory: initialHistory
    };
  });
  
  // Rate fluctuation simulation using useRef to store
  const rateTimerRef = useRef<NodeJS.Timeout | null>(null);
  const simulationTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Initialize with randomized rates
  useEffect(() => {
    randomizeRates();
    
    // Set up a timer to periodically update rates even when paused
    const backgroundTimer = setInterval(() => {
      if (!isRunning) {
        // Small jitter in rates to prevent flatlining
        setProtocols(prev => {
          // Add small random variations to keep graph moving
          const newAaveRate = parseFloat((prev.aave.currentRate + (Math.random() * 0.6 - 0.3)).toFixed(2));
          const newCompoundRate = parseFloat((prev.compound.currentRate + (Math.random() * 0.6 - 0.3)).toFixed(2));
          const newSparkRate = parseFloat((prev.spark.currentRate + (Math.random() * 0.6 - 0.3)).toFixed(2));
          
          // Find the lowest rate and update kapan
          const kapanRate = Math.min(newAaveRate, newCompoundRate, newSparkRate);
          
          return {
            ...prev,
            aave: { ...prev.aave, currentRate: newAaveRate },
            compound: { ...prev.compound, currentRate: newCompoundRate },
            spark: { ...prev.spark, currentRate: newSparkRate },
            kapan: { ...prev.kapan, currentRate: kapanRate }
          };
        });
        
        // Update the history after changing rates
        updateRateHistory();
      }
    }, 3000); // More frequent updates
    
    return () => {
      if (rateTimerRef.current) clearInterval(rateTimerRef.current);
      if (simulationTimerRef.current) clearInterval(simulationTimerRef.current);
      clearInterval(backgroundTimer);
    };
  }, [isRunning]); // Re-create the timer when running state changes
  
  // Effect to handle simulation running
  useEffect(() => {
    if (isRunning && !isManualMode) {
      simulationTimerRef.current = setInterval(() => {
        randomizeRates(); // This will trigger updateRateHistory which updates savings
      }, 1500 / speed); // Slower timing (1.5s)
    } else {
      if (simulationTimerRef.current) clearInterval(simulationTimerRef.current);
      if (rateTimerRef.current) clearInterval(rateTimerRef.current);
    }
    
    return () => {
      if (simulationTimerRef.current) clearInterval(simulationTimerRef.current);
      if (rateTimerRef.current) clearInterval(rateTimerRef.current);
    };
  }, [isRunning, speed, isManualMode]);
  
  // Function to randomize protocol rates with larger variations
  const randomizeRates = () => {
    // Create much more dramatic rate variations - from 3% to 15%
    const aaveRate = parseFloat((3 + Math.random() * 12).toFixed(2)); // 3% - 15%
    const compoundRate = parseFloat((3 + Math.random() * 12).toFixed(2)); // 3% - 15%
    const sparkRate = parseFloat((3 + Math.random() * 12).toFixed(2)); // 3% - 15%
    
    // Ensure rates are at least 0.5% different from each other to avoid flat lines
    const ensureDifference = (rates: number[]): number[] => {
      const minDifference = 0.5;
      const result = [...rates];
      
      // Ensure each rate differs from others by at least minDifference
      for (let i = 0; i < result.length; i++) {
        for (let j = i + 1; j < result.length; j++) {
          const diff = Math.abs(result[i] - result[j]);
          if (diff < minDifference) {
            // Add difference to the larger value to ensure separation
            if (result[i] > result[j]) {
              result[i] += (minDifference - diff);
            } else {
              result[j] += (minDifference - diff);
            }
          }
        }
      }
      
      return result;
    };
    
    // Apply minimum difference rule
    const [aaveAdjusted, compoundAdjusted, sparkAdjusted] = ensureDifference([aaveRate, compoundRate, sparkRate]);
    
    // Find the lowest rate protocol
    const lowestRateProtocol = findLowestRateProtocolFromRates({
      aave: aaveAdjusted,
      compound: compoundAdjusted,
      spark: sparkAdjusted
    });
    
    const kapanRate = Math.min(aaveAdjusted, compoundAdjusted, sparkAdjusted);
    
    // Update the protocols state with new rates
    setProtocols(prev => ({
      ...prev,
      aave: { ...prev.aave, currentRate: aaveAdjusted },
      compound: { ...prev.compound, currentRate: compoundAdjusted },
      spark: { ...prev.spark, currentRate: sparkAdjusted },
      kapan: { ...prev.kapan, currentRate: kapanRate }
    }));
    
    // Update which protocol Kapan is using (the lowest rate one)
    setSimulation(prev => ({
      ...prev,
      kapanProtocol: lowestRateProtocol
    }));
    
    // Always update the rate history when rates change to ensure graph keeps moving
    updateRateHistory();
  };
  
  // Function to update rate history for the graph
  const updateRateHistory = () => {
    setSimulation(prev => {
      // Find the current best rate (lowest) among protocols
      const currentRates = {
        aave: protocols.aave.currentRate,
        compound: protocols.compound.currentRate,
        spark: protocols.spark.currentRate
      };
      
      const lowestRate = Math.min(...Object.values(currentRates));
      const kapanRate = lowestRate; // Kapan always gets the best rate
      
      // Calculate new savings based on difference between active protocol and best rate
      // This ensures savings always increase when there's a rate differential
      const activeRate = protocols[prev.activeProtocol].currentRate;
      
      // Calculate savings - only add if Kapan would save compared to active protocol
      // and simulation is running
      let savingsDiff = 0;
      if (isRunning && lowestRate < activeRate) {
        savingsDiff = parseFloat(((activeRate - lowestRate) / 100).toFixed(4));
      }
      
      const newSavings = parseFloat((prev.savings + savingsDiff).toFixed(4));
      
      // Keep max 30 points in history for clean visualization
      const newHistory = [...prev.rateHistory];
      if (newHistory.length > 30) {
        newHistory.shift();
      }
      
      // Add new data point with slightly increased day count to ensure visual distinction
      const nextDay = parseFloat((prev.elapsedDays + 0.5).toFixed(1)); // Ensure each point has a unique day value
      
      // Create a new data point with current rates
      const newDataPoint = {
        day: nextDay,
        aave: currentRates.aave,
        compound: currentRates.compound,
        spark: currentRates.spark,
        kapan: kapanRate,
        active: prev.activeProtocol,
        savings: newSavings
      };
      
      // Add the new point to history
      newHistory.push(newDataPoint);
      
      // Return updated state with new history and accumulated savings
      return {
        ...prev,
        rateHistory: newHistory,
        elapsedDays: nextDay,
        savings: newSavings,
        // Also update which protocol Kapan is using
        kapanProtocol: findLowestRateProtocolFromRates(currentRates)
      };
    });
  };
  
  // Function to find the protocol with the lowest rate
  const findLowestRateProtocol = (): string => {
    const rates = Object.entries(protocols)
      .filter(([key]) => key !== 'kapan') // Exclude Kapan from selection
      .map(([key, protocol]) => ({ 
        key, 
        rate: protocol.currentRate 
      }));
    rates.sort((a, b) => a.rate - b.rate);
    return rates[0].key;
  };
  
  // Function to run a single simulation step - simplified since updateRateHistory handles savings
  const runSimulationStep = () => {
    const bestProtocol = findLowestRateProtocol();
    
    setSimulation(prev => {
      // If already on the best protocol, no need to switch
      if (prev.activeProtocol === bestProtocol) {
        return prev;
      }
      
      // Switch to the best protocol and update transaction count
      return {
        ...prev,
        activeProtocol: bestProtocol,
        transactionCount: prev.transactionCount + 1,
        lastSwitch: `Day ${prev.elapsedDays.toFixed(1)}`
      };
    });
    
    // Randomize rates and update history
    randomizeRates();
  };
  
  // Function to manually switch to a protocol
  const switchToProtocol = (protocolKey: string) => {
    if (!isManualMode) return;
    
    setSimulation(prev => {
      const newHistory = [...prev.rateHistory];
      newHistory.push({
        day: prev.elapsedDays,
        aave: protocols.aave.currentRate,
        compound: protocols.compound.currentRate,
        spark: protocols.spark.currentRate,
        kapan: protocols.kapan.currentRate,
        active: protocolKey,
        savings: prev.savings
      });
      
      return {
        ...prev,
        activeProtocol: protocolKey,
        transactionCount: prev.transactionCount + 1,
        lastSwitch: `Day ${prev.elapsedDays}`,
        rateHistory: newHistory
      };
    });
  };
  
  // Function to toggle the simulation
  const toggleSimulation = () => {
    setIsRunning(!isRunning);
    if (!isRunning) {
      // Force an immediate rate update when starting
      randomizeRates();
    }
  };
  
  // Function to toggle manual mode
  const toggleManualMode = () => {
    setIsManualMode(!isManualMode);
    if (isRunning) setIsRunning(false);
  };
  
  // Reset the simulation
  const resetSimulation = () => {
    const initialHistory = generateInitialHistory();
    const lastPoint = initialHistory[initialHistory.length - 1];
    
    // Find the lowest rate protocol initially
    const lowestRateProtocol = findLowestRateProtocolFromRates({
      aave: lastPoint.aave,
      compound: lastPoint.compound,
      spark: lastPoint.spark
    });
    
    // Update protocol rates in state
    setProtocols(prev => ({
      ...prev,
      aave: { ...prev.aave, currentRate: lastPoint.aave },
      compound: { ...prev.compound, currentRate: lastPoint.compound },
      spark: { ...prev.spark, currentRate: lastPoint.spark },
      kapan: { ...prev.kapan, currentRate: Math.min(lastPoint.aave, lastPoint.compound, lastPoint.spark) }
    }));
    
    setIsRunning(false);
    setSimulation({
      activeProtocol: lastPoint.active,
      kapanProtocol: lowestRateProtocol,
      savings: lastPoint.savings,
      transactionCount: initialHistory.length - 1,
      lastSwitch: `Day ${initialHistory.length - 2}`,
      elapsedDays: initialHistory.length,
      rateHistory: initialHistory
    });
  };
  
  // Calculate the current APR and savings
  const currentAPR = protocols[simulation.activeProtocol].currentRate;
  const kapanAPR = protocols.kapan.currentRate;
  const currentSavings = parseFloat((simulation.savings).toFixed(4));
  
  // Custom tooltip component for the chart
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-base-300 p-2 border border-base-content/10 text-xs">
          <p className="font-bold">Day: {data.day}</p>
          <p style={{ color: protocols.aave.color }}>Aave: {data.aave}%</p>
          <p style={{ color: protocols.compound.color }}>Compound: {data.compound}%</p>
          <p style={{ color: protocols.spark.color }}>Spark: {data.spark}%</p>
          <p style={{ color: protocols.kapan.color }}>Kapan: {data.kapan}%</p>
          <p className="mt-1">Active: <span className="font-bold">{data.active}</span></p>
          <p className="text-primary">Total Savings: {data.savings.toFixed(4)}%</p>
        </div>
      );
    }
    return null;
  };
  
  return (
    <div className="border border-base-300 bg-base-200 relative overflow-hidden">
      {/* Tech pattern overlay */}
      <div className="absolute inset-0 pointer-events-none opacity-5">
        <div className="absolute w-full h-full" 
             style={{ 
               backgroundImage: `radial-gradient(circle at 50% 50%, transparent 20%, rgba(var(--color-primary-rgb), 0.03) 21%, rgba(var(--color-primary-rgb), 0.03) 23%, transparent 24%, transparent 30%, rgba(var(--color-primary-rgb), 0.03) 31%, rgba(var(--color-primary-rgb), 0.03) 33%, transparent 34%)`,
               backgroundSize: "60px 60px"
             }}>
        </div>
      </div>
      
      {/* Header */}
      <div className="p-6 border-b border-base-300">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-bold flex items-center">
            <BoltIcon className="w-5 h-5 mr-2 text-primary" />
            Interactive Rate Optimization Demo
          </h3>
          <div className="flex items-center gap-3">
            <button 
              onClick={toggleManualMode}
              className={`px-3 py-1 text-xs uppercase font-mono tracking-wide transition-colors ${isManualMode ? 'bg-primary text-primary-content' : 'bg-base-300 text-base-content/70'}`}
            >
              Manual Control
            </button>
            <button
              onClick={resetSimulation}
              className="px-3 py-1 bg-base-300 text-base-content/70 text-xs uppercase font-mono tracking-wide hover:bg-base-content/10 transition-colors"
            >
              Reset
            </button>
          </div>
        </div>
        <p className="mt-2 text-base-content/70">
          See how Kapan automatically moves your debt between lending protocols to get the lowest interest rate.
          {isManualMode ? " Try manually switching protocols yourself." : " Watch the automation in action."}
        </p>
      </div>
      
      {/* Simulation Dashboard */}
      <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Protocol Rate Panel */}
        <div className="md:col-span-2">
          <h4 className="text-sm uppercase tracking-wider font-mono mb-3 text-base-content/60">Current Protocol Rates</h4>
          <div className="flex flex-col space-y-3">
            {Object.entries(protocols)
              .filter(([key]) => key !== 'kapan') // Don't show Kapan in the protocol list
              .map(([key, protocol]) => (
                <div 
                  key={key}
                  onClick={() => switchToProtocol(key)}
                  className={`p-4 relative border-l-4 ${
                    simulation.activeProtocol === key 
                      ? 'bg-base-100 border-primary' 
                      : 'bg-base-300/50 hover:bg-base-300 cursor-pointer border-transparent'
                  }`}
                >
                  <div className="grid md:grid-cols-12 grid-cols-8 gap-2 items-center">
                    {/* Left section - Protocol info */}
                    <div className="md:col-span-4 col-span-3 flex items-center">
                      <div className="w-10 h-10 mr-3 flex items-center justify-center relative">
                        <img 
                          src={protocol.logo} 
                          alt={protocol.name} 
                          className={`w-6 h-6 transition-transform duration-200 ${simulation.kapanProtocol === key ? 'scale-110' : ''}`}
                        />
                        {simulation.activeProtocol === key && (
                          <div className="absolute inset-0 border-2 rounded-full border-primary animate-pulse"></div>
                        )}
                        
                        {/* Additional visual indicator for Kapan's selected protocol */}
                        {simulation.kapanProtocol === key && !isManualMode && (
                          <div className="absolute inset-0 bg-primary/20 rounded-full animate-ping"></div>
                        )}
                      </div>
                      <div>
                        <div className="font-bold">
                          {protocol.name}
                        </div>
                        <div className="text-xs text-base-content/60">Lending Protocol</div>
                      </div>
                    </div>
                    
                    {/* Middle section - Kapan indicator */}
                    <div className="md:col-span-4 col-span-2 flex justify-center">
                      {simulation.kapanProtocol === key && (
                        <div className="bg-primary/10 border border-primary/30 text-primary px-2 py-1 rounded-md text-xs md:text-sm font-semibold flex items-center whitespace-nowrap">
                          <div className="w-2 h-2 bg-primary rounded-full mr-1 md:mr-2 animate-pulse"></div>
                          <span className="hidden md:inline">Kapan Selected</span>
                          <span className="md:hidden">Kapan</span>
                        </div>
                      )}
                    </div>
                    
                    {/* Right section - APR info */}
                    <div className="md:col-span-4 col-span-3 text-right flex items-center justify-end">
                      <div>
                        <div className={`text-xl font-mono ${simulation.kapanProtocol === key ? 'text-primary font-bold' : ''}`}>
                          {protocol.currentRate}%
                        </div>
                        <div className="text-xs text-base-content/60">Variable Borrow APR</div>
                      </div>
                      {isManualMode && simulation.activeProtocol !== key && (
                        <ArrowRightIcon className="w-4 h-4 ml-2 text-base-content/30" />
                      )}
                    </div>
                  </div>
                </div>
              ))}
            
            {/* Kapan Rate Summary */}
            <div className="p-4 flex items-center justify-between bg-base-100 border-l-4 border-primary">
              <div className="flex items-center">
                <div className="w-8 h-8 mr-3 flex items-center justify-center">
                  <img 
                    src={protocols.kapan.logo} 
                    alt="Kapan" 
                    className="w-6 h-6" 
                  />
                </div>
                <div>
                  <div className="font-bold">Kapan Optimized</div>
                  <div className="text-xs text-base-content/60">
                    Using <span className="font-medium text-primary">{
                      protocols[simulation.kapanProtocol]?.name || 'best'
                    }</span> protocol rate
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-xl font-mono text-primary">{kapanAPR}%</div>
                <div className="text-xs text-primary/70">Always the best rate</div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Stats Panel */}
        <div className="flex flex-col space-y-4">
          <div>
            <h4 className="text-sm uppercase tracking-wider font-mono mb-3 text-base-content/60">Simulation Stats</h4>
            <div className="bg-base-100 p-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-base-content/60">Current APR</div>
                  <div className="text-2xl font-mono font-bold">{currentAPR}%</div>
                </div>
                <div>
                  <div className="text-xs text-base-content/60">APR Saved</div>
                  <div className="text-2xl font-mono font-bold text-primary">
                    {currentSavings}%
                  </div>
                </div>
                <div>
                  <div className="text-xs text-base-content/60">Transactions</div>
                  <div className="text-2xl font-mono font-bold">{simulation.transactionCount}</div>
                </div>
                <div>
                  <div className="text-xs text-base-content/60">Elapsed Time</div>
                  <div className="text-2xl font-mono font-bold">{simulation.elapsedDays} days</div>
                </div>
              </div>
            </div>
          </div>
          
          {/* Simulation Controls */}
          <div>
            <h4 className="text-sm uppercase tracking-wider font-mono mb-3 text-base-content/60">Simulation Controls</h4>
            <div className="bg-base-100 p-4">
              {!isManualMode && (
                <div className="mb-4">
                  <div className="text-xs text-base-content/60 mb-2">Simulation Speed</div>
                  <div className="flex items-center space-x-3">
                    <button 
                      onClick={() => setSpeed(1)} 
                      className={`px-3 py-1 text-xs ${speed === 1 ? 'bg-primary text-primary-content' : 'bg-base-300'}`}
                    >
                      1x
                    </button>
                    <button 
                      onClick={() => setSpeed(2)} 
                      className={`px-3 py-1 text-xs ${speed === 2 ? 'bg-primary text-primary-content' : 'bg-base-300'}`}
                    >
                      2x
                    </button>
                    <button 
                      onClick={() => setSpeed(4)} 
                      className={`px-3 py-1 text-xs ${speed === 4 ? 'bg-primary text-primary-content' : 'bg-base-300'}`}
                    >
                      4x
                    </button>
                  </div>
                </div>
              )}
              
              <button 
                onClick={toggleSimulation}
                disabled={isManualMode}
                className={`w-full py-3 flex items-center justify-center ${
                  isManualMode 
                    ? 'bg-base-300/50 cursor-not-allowed text-base-content/30' 
                    : isRunning 
                      ? 'bg-error hover:bg-error/80' 
                      : 'bg-primary hover:bg-primary/80'
                }`}
              >
                <span className="mr-2">{isRunning ? 'Stop Simulation' : 'Start Simulation'}</span>
                {isRunning ? (
                  <ClockIcon className="w-5 h-5" />
                ) : (
                  <BoltIcon className="w-5 h-5" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
      
      {/* Rate History Graph */}
      <div className="p-6 border-t border-base-300">
        <h4 className="text-sm uppercase tracking-wider font-mono mb-3 text-base-content/60">Interest Rate History</h4>
        <div className="bg-base-100 p-4 h-64 relative">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={simulation.rateHistory}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(var(--color-base-content-rgb), 0.1)" />
              <XAxis 
                dataKey="day" 
                label={{ value: 'Days', position: 'insideBottom', offset: -5 }}
                stroke="rgba(var(--color-base-content-rgb), 0.5)"
              />
              <YAxis 
                label={{ value: 'Interest Rate (%)', angle: -90, position: 'insideLeft' }} 
                domain={[2, 16]}
                stroke="rgba(var(--color-base-content-rgb), 0.5)"
              />
              <Tooltip content={CustomTooltip} />
              <Legend />
              <Line 
                type="monotone" 
                dataKey="aave" 
                name="Aave"
                stroke={protocols.aave.color} 
                strokeWidth={1.5}
                dot={false}
              />
              <Line 
                type="monotone" 
                dataKey="compound" 
                name="Compound"
                stroke={protocols.compound.color} 
                strokeWidth={1.5}
                dot={false}
              />
              <Line 
                type="monotone" 
                dataKey="spark" 
                name="Spark"
                stroke={protocols.spark.color} 
                strokeWidth={1.5}
                dot={false}
              />
              <Line 
                type="monotone" 
                dataKey="kapan" 
                name="Kapan (Optimized)"
                stroke={protocols.kapan.color} 
                strokeWidth={3}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
      
      {/* Summary Footer */}
      <div className="p-6 bg-base-300/50 border-t border-base-300">
        <div className="flex items-center">
          <ChartBarIcon className="w-5 h-5 mr-2 text-primary" />
          <div className="text-sm text-base-content/80">
            {isManualMode ? (
              "Manual mode: Select a protocol to switch your debt position manually."
            ) : isRunning ? (
              `Automation running: Kapan is monitoring rates and automatically using ${protocols[simulation.kapanProtocol]?.name || 'the best'} protocol.`
            ) : (
              "Click Start Simulation to watch how Kapan automatically optimizes your rates."
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default InteractiveDemo; 