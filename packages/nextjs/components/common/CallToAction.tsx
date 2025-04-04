import Image from "next/image";
import { ReactNode } from "react";

export interface CallToActionSectionProps {
  title: string;
  description: string;
  buttonText: string;
  buttonLink: string;
  emoji?: string;
  icon?: ReactNode;
}

export interface CallToActionProps {
  sections: CallToActionSectionProps[];
  gradientFrom?: string;
  gradientVia?: string;
  gradientTo?: string;
}

const TwitterIcon = () => (
  <div className="bg-fuchsia-600 p-1 rounded-full mr-2 flex items-center justify-center">
    <Image src="/logos/x-logo.svg" alt="X Logo" width={10} height={10} className="brightness-150 invert" />
  </div>
);

const GitcoinIcon = () => (
  <div className="bg-fuchsia-600 p-1 rounded-full mr-2 flex items-center justify-center">
    <svg width="10" height="10" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className="brightness-150 invert">
      <path d="M8 0C3.6 0 0 3.6 0 8s3.6 8 8 8 8-3.6 8-8-3.6-8-8-8zm4 5.6L9.3 8.7c-.4.4-1 .4-1.4 0l-1.5-1.5C5.6 6.4 4.5 7.5 5.3 8.3L7.6 10.6c.2.2.5.2.7 0l4-4c.9-.9-.1-1.9-1.1-1z" fill="white"/>
    </svg>
  </div>
);

// Helper function to determine grid columns class based on section count
const getGridColumnsClass = (sectionCount: number) => {
  if (sectionCount === 1) return "";
  if (sectionCount === 2) return "md:grid-cols-2";
  if (sectionCount === 3) return "md:grid-cols-3";
  if (sectionCount === 4) return "md:grid-cols-2 lg:grid-cols-4";
  // For 5 or more items, use a responsive approach that wraps appropriately
  return "md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";
};

const CallToAction = ({
  sections = [
    {
      title: "⭐ Support on X",
      description: "We're building with real purpose — your follow helps us reach more builders!",
      buttonText: "Follow @KapanFinance",
      buttonLink: "https://x.com/KapanFinance",
      icon: <TwitterIcon />
    },
    {
      title: "🌱 Fund via Gitcoin",
      description: "We're part of Gitcoin GG23 OSS round — even a small donation goes a long way!",
      buttonText: "Support on Gitcoin",
      buttonLink: "https://explorer.gitcoin.co/#/round/42161/867/4",
      icon: <GitcoinIcon />
    }
  ],
  gradientFrom = "purple-700",
  gradientVia = "fuchsia-600",
  gradientTo = "pink-600"
}: CallToActionProps) => {
  const gridColumnsClass = getGridColumnsClass(sections.length);

  return (
    <>
      <style jsx global>{`
        @keyframes gradientAnimation {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .animate-gradient {
          background-size: 200% 200%;
          animation: gradientAnimation 6s ease infinite;
        }
      `}</style>
      <div className={`animate-gradient bg-gradient-to-r from-${gradientFrom} via-${gradientVia} to-${gradientTo} text-white rounded-lg shadow-md overflow-hidden my-4 w-full`}>
        <div className={`grid grid-cols-1 ${gridColumnsClass} divide-y md:divide-y-0 md:divide-x divide-white/20`}>
          {sections.map((section, index) => (
            <div key={index} className="flex flex-col items-center p-4 text-center">
              <h3 className="font-bold text-sm md:text-base mb-1">
                {section.emoji || ''}{section.title}
              </h3>
              <p className="text-xs text-white/80 mb-3">{section.description}</p>
              
              <a 
                href={section.buttonLink} 
                target="_blank" 
                rel="noopener noreferrer" 
                className="bg-white text-fuchsia-600 hover:bg-gray-100 whitespace-nowrap text-sm px-4 py-1.5 rounded-full font-medium flex items-center shadow-sm hover:shadow transform hover:-translate-y-0.5 transition-all duration-200"
              >
                {section.icon}
                {section.buttonText}
              </a>
            </div>
          ))}
        </div>
      </div>
    </>
  );
};

export default CallToAction; 